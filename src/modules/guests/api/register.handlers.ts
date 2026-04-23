/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as registrationRepo from '../data/registration.repo';
// TODO: replace with @channels eventBus event when channels module is migrated
import { checkRateLimit } from '@/lib/rate-limit';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

/** POST to Google Apps Script (same endpoint as the Telegram bot uses) */
async function syncToGoogleSheets(guests: any[], reservation: any): Promise<void> {
  const url = process.env.GOOGLE_GUESTS_SCRIPT_URL;
  if (!url) return; // not configured — skip silently

  for (const guest of guests) {
    const nights = reservation.check_in && reservation.check_out
      ? Math.max(0, (new Date(reservation.check_out + 'T00:00:00Z').getTime() - new Date(reservation.check_in + 'T00:00:00Z').getTime()) / 86400000)
      : 0;

    const payload = {
      action: 'guest',
      full_name: `${guest.lastName || ''} ${guest.firstName || ''}`.trim(),
      surname: guest.lastName || '',
      first_name: guest.firstName || '',
      birth_date: guest.dateOfBirth || '',
      doc_type: guest.documentType || '',
      doc_number: guest.documentNumber || '',
      country_code: '',
      nationality: guest.nationality || '',
      address: guest.address || '',
      visa_number: '',
      check_in: reservation.check_in || '',
      check_out: reservation.check_out || '',
      nights,
      is_foreigner: 'Tak',
      tax_amount: 0,
      exempt_reason: '',
      purpose: '',
      note: '[Web registration via guest portal]',
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const text = await resp.text();
      if (!resp.ok || text.toLowerCase().includes('error')) {
        console.error('[GuestReg Sheets] Error:', resp.status, text.slice(0, 200));
      } else {
        console.log('[GuestReg Sheets] Synced:', payload.full_name);
      }
    } catch (e: any) {
      console.error('[GuestReg Sheets] Failed:', e.message);
    }
  }
}

/** Send TG alert when critical fields are missing — manager can follow up */
async function alertMissingFields(guests: any[], reservation: any): Promise<void> {
  const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  const REQUIRED = ['firstName', 'lastName', 'dateOfBirth', 'documentType', 'documentNumber'];
  const LABELS: Record<string, string> = {
    firstName: 'Ім\'я', lastName: 'Прізвище', dateOfBirth: 'Дата народження',
    documentType: 'Тип документа', documentNumber: 'Номер документа',
    nationality: 'Національність', address: 'Адреса',
  };

  for (const [i, guest] of guests.entries()) {
    const missing = REQUIRED.filter(f => !guest[f as keyof typeof guest]);
    if (missing.length === 0) continue;

    const missingStr = missing.map(f => `• ${LABELS[f] || f}`).join('\n');
    const text = [
      `⚠️ <b>Неповна реєстрація гостя</b>`,
      ``,
      `👤 Гість ${i + 1}: <b>${esc(guest.firstName || '?')} ${esc(guest.lastName || '?')}</b>`,
      `🏠 ${esc(reservation.unit_name)} (${reservation.check_in} → ${reservation.check_out})`,
      ``,
      `❌ <b>Відсутні поля:</b>`,
      missingStr,
      ``,
      `<i>Гість зареєструвався через гостьову сторінку. Уточніть дані особисто або через чат.</i>`,
    ].join('\n');

    sendTelegramMessage(text).catch(() => {});
  }
}

export async function registerGuests(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();

    const reservation = registrationRepo.getReservationForRegistration(token);
    if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const rl = checkRateLimit(token, 'registration', 3, 5);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const { guests } = body;
    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 });
    }

    const registeredGuests = registrationRepo.saveRegistrations(reservation.id, reservation.organization_id, guests);

    // ── Auto-sync to Google Sheets (non-blocking) ─────────────────────────
    syncToGoogleSheets(guests, reservation).catch(() => {});

    // ── Alert if critical fields are missing ──────────────────────────────
    alertMissingFields(guests, reservation).catch(() => {});

    try {
      const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const guestLines = registeredGuests.map((g: any, i: number) => {
        const docLabel: Record<string, string> = { passport: 'Passport', id_card: 'ID Card', driving_license: 'Driving Licence' };
        return [
          `\n👤 <b>Гість ${i + 1}:</b> ${escHtml(g.first_name)} ${escHtml(g.last_name)}`,
          g.date_of_birth ? `🎂 ${g.date_of_birth}` : '',
          g.document_type ? `🪪 ${docLabel[g.document_type] || g.document_type}: ${escHtml(g.document_number || '')}` : '',
          g.nationality ? `🌍 Країна: ${escHtml(g.nationality)}` : '',
          g.address ? `🏠 Адреса: ${escHtml(g.address)}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n');

      const text = [
        `✅ <b>Реєстрація гостя</b>`,
        ``,
        `🏠 ${escHtml(reservation.unit_name)} (${escHtml(reservation.unit_type_name)})`,
        `📅 ${reservation.check_in} — ${reservation.check_out} (${reservation.nights} ночей)`,
        `💰 ${reservation.total_price} ${reservation.currency} | ${escHtml(reservation.source || 'Direct')}`,
        `📊 Статус: ${reservation.status} | Оплата: ${reservation.payment_status}`,
        ``,
        `━━━ Контакти з бронювання ━━━`,
        `👤 ${escHtml(reservation.booking_first_name)} ${escHtml(reservation.booking_last_name)}`,
        reservation.booking_email ? `📧 ${escHtml(reservation.booking_email)}` : '',
        reservation.booking_phone ? `📞 ${reservation.booking_phone}` : '',
        ``,
        `━━━ Зареєстровані гості (${registeredGuests.length}/${reservation.adults}) ━━━`,
        guestLines,
      ].filter(Boolean).join('\n');

      sendTelegramMessage(text).catch(err =>
        console.error('[Registration Telegram] Error:', err.message),
      );
    } catch (tgErr: any) {
      console.error('[Registration Telegram] Error:', tgErr.message);
    }

    return NextResponse.json({ success: true, registeredGuests });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/register error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to register guests' }, { status: 500 });
  }
}

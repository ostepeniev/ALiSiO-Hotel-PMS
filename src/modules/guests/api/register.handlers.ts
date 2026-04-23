/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as registrationRepo from '../data/registration.repo';
// TODO: replace with @channels eventBus event when channels module is migrated
import { checkRateLimit } from '@/lib/rate-limit';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

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

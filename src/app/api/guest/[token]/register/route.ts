/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

// POST /api/guest/[token]/register — submit guest registration data
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const body = await request.json();

    // Find reservation with organization_id + full booking info for notification
    const reservation = db.prepare(`
      SELECT r.id, r.guest_id as booking_guest_id, r.check_in, r.check_out, r.nights,
             r.adults, r.total_price, r.currency, r.source, r.status, r.payment_status,
             g.first_name as booking_first_name, g.last_name as booking_last_name,
             g.email as booking_email, g.phone as booking_phone,
             u.name as unit_name, ut.name as unit_type_name,
             p.organization_id, p.name as property_name
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE r.guest_page_token = ?
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Rate limiting: max 3 registration saves per 5 minutes
    const rl = checkRateLimit(token, 'registration', 3, 5);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const { guests } = body;
    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 });
    }

    // Delete existing registered guests and re-insert
    db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservation.id);

    const insertRg = db.prepare(`
      INSERT INTO reservation_guests (reservation_id, first_name, last_name, date_of_birth, address, nationality, document_type, document_number, guest_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Helper: find or create a guest in the main guests table
    const findGuest = db.prepare(`
      SELECT id FROM guests
      WHERE organization_id = ? AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
      LIMIT 1
    `);

    const insertGuest = db.prepare(`
      INSERT INTO guests (organization_id, first_name, last_name, date_of_birth, country, address, document_type, document_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateGuest = db.prepare(`
      UPDATE guests SET
        date_of_birth = COALESCE(?, date_of_birth),
        country = COALESCE(?, country),
        address = COALESCE(?, address),
        document_type = COALESCE(?, document_type),
        document_number = COALESCE(?, document_number),
        updated_at = datetime('now')
      WHERE id = ?
    `);

    const insertMany = db.transaction(() => {
      for (const guest of guests) {
        if (!guest.firstName || !guest.lastName) {
          throw new Error('firstName and lastName are required for each guest');
        }

        // --- Link to guests table ---
        let guestId: string | null = null;

        // Try to find existing guest by name
        const existingGuest = findGuest.get(
          reservation.organization_id,
          guest.firstName,
          guest.lastName,
        ) as any;

        if (existingGuest) {
          guestId = existingGuest.id;
          // Update guest record with latest info (only if new values provided)
          updateGuest.run(
            guest.dateOfBirth || null,
            guest.nationality || null,
            guest.address || null,
            guest.documentType || null,
            guest.documentNumber || null,
            guestId,
          );
        } else {
          // Create new guest record
          const result = insertGuest.run(
            reservation.organization_id,
            guest.firstName,
            guest.lastName,
            guest.dateOfBirth || null,
            guest.nationality || null,
            guest.address || null,
            guest.documentType || null,
            guest.documentNumber || null,
          );
          // Get the auto-generated ID
          const newGuest = db.prepare(
            'SELECT id FROM guests WHERE rowid = ?'
          ).get(result.lastInsertRowid) as any;
          guestId = newGuest?.id || null;
        }

        // Insert into reservation_guests
        insertRg.run(
          reservation.id,
          guest.firstName,
          guest.lastName,
          guest.dateOfBirth || null,
          guest.address || null,
          guest.nationality || null,
          guest.documentType || null,
          guest.documentNumber || null,
          guestId,
        );
      }
    });

    insertMany();

    // Return updated list
    const registeredGuests = db.prepare(
      'SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at'
    ).all(reservation.id);

    // ─── Telegram notification ───────────────────
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
        console.error('[Registration Telegram] Error:', err.message)
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

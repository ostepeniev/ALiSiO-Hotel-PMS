/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/teya';
import { getDb } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/booking/checkout-session
 * 
 * Flow: 1) Create preliminary order  2) Send TG notification  3) Call Teya
 * Even if Teya fails, the admin knows about the order.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, currency, description, items, reservation_id, return_path,
            service_id, service_date, start_hour, hours, addons } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers: CORS_HEADERS });
    }

    console.log('[Checkout Session] Creating:', { amount, description, reservation_id, service_id, service_date });

    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

    // ── Step 1: Create preliminary order in DB ──
    let orderId: string | null = null;
    try {
      const db = getDb();
      try { db.prepare("ALTER TABLE booking_service_orders ADD COLUMN completed_at TEXT DEFAULT NULL").run(); } catch { /* exists */ }

      if (service_id && service_date) {
        orderId = `bso_${Date.now()}`;
        const h = hours || 2;
        const sHour = start_hour || 14;
        
        db.prepare(`
          INSERT INTO booking_service_orders (id, reservation_id, service_id, quantity, service_date, 
            options_json, unit_price, total_price, status, payment_id, payment_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'pending')
        `).run(
          orderId, reservation_id || null, service_id, h, service_date,
          JSON.stringify({ startHour: sHour, hours: h, addons: addons || [] }),
          amount / h, amount,
          'pending_teya'
        );

        // Lock time slots temporarily
        for (let hr = sHour; hr < sHour + h; hr++) {
          const slotStart = `${String(hr).padStart(2, '0')}:00`;
          const slotEnd = `${String(hr + 1).padStart(2, '0')}:00`;
          const existingSlot = db.prepare(
            'SELECT id FROM service_time_slots WHERE service_id = ? AND date = ? AND start_time = ?'
          ).get(service_id, service_date, slotStart) as any;

          if (existingSlot) {
            db.prepare('UPDATE service_time_slots SET booked_count = booked_count + 1, booking_session_id = ? WHERE id = ?')
              .run('pending_teya', existingSlot.id);
          } else {
            db.prepare(`
              INSERT INTO service_time_slots (id, service_id, date, start_time, end_time, max_capacity, booked_count, is_available, booking_session_id, created_at)
              VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, datetime('now'))
            `).run(`sts_${Date.now()}_${hr}`, service_id, service_date, slotStart, slotEnd, 'pending_teya');
          }
        }
        console.log('[Checkout Session] Preliminary order created:', orderId);
      }
    } catch (dbErr: any) {
      console.error('[Checkout Session] DB error:', dbErr.message);
    }

    // ── Step 2: Send TG notification IMMEDIATELY ──
    try {
      const db = getDb();
      let guestInfo = 'Зовнішній клієнт';
      let unitInfo = '';
      if (reservation_id) {
        const guest = db.prepare(`
          SELECT g.first_name, g.last_name, u.name as unit_name
          FROM reservations r
          JOIN guests g ON r.guest_id = g.id
          LEFT JOIN units u ON r.unit_id = u.id
          WHERE r.id = ?
        `).get(reservation_id) as any;
        if (guest) {
          guestInfo = `${esc(guest.first_name)} ${esc(guest.last_name)}`;
          unitInfo = guest.unit_name ? `\n🏠 ${esc(guest.unit_name)}` : '';
        }
      }

      let timeInfo = '';
      if (service_date && start_hour != null && hours) {
        timeInfo = `\n📅 ${service_date}, ${start_hour}:00–${start_hour + hours}:00`;
      }

      const svcDesc = description || 'Послуга';
      const text = [
        `📦 <b>Нове замовлення: ${esc(svcDesc)}</b>`,
        ``,
        `👤 ${guestInfo}${unitInfo}${timeInfo}`,
        `💰 ${amount} ${currency || 'CZK'}`,
        `💳 Очікує оплати`,
      ].join('\n');
      sendTelegramMessage(text).catch(() => {});
    } catch { /* non-critical */ }

    // ── Step 3: Call Teya ──
    const origin = new URL(req.url).origin;
    const returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');
    const amountMinor = Math.round(amount * 100);

    try {
      const session = await createCheckoutSession({
        amount: amountMinor,
        currency: currency || 'CZK',
        description: description || 'ALiSiO Booking',
        items: items ? items.map((item: { description: string; quantity: number; unit_price: number }) => ({
          ...item,
          unit_price: Math.round(item.unit_price * 100),
        })) : undefined,
        metadata: reservation_id ? { reservation_id } : undefined,
        ...(isProduction ? {
          success_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=success&return=${encodeURIComponent(returnTo)}`,
          cancel_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=cancel&return=${encodeURIComponent(returnTo)}`,
        } : {}),
      });

      // Update order with real session ID
      if (orderId) {
        try {
          const db = getDb();
          db.prepare('UPDATE booking_service_orders SET payment_id = ? WHERE id = ?')
            .run(session.id, orderId);
          db.prepare("UPDATE service_time_slots SET booking_session_id = ? WHERE booking_session_id = 'pending_teya'")
            .run(session.id);
        } catch { /* non-critical */ }
      }

      return NextResponse.json({
        session_token: session.session_token,
        session_id: session.id,
        session_url: session.session_url,
      }, { headers: CORS_HEADERS });
    } catch (teyaErr: any) {
      // Teya failed — notify admin but order + TG already sent
      console.error('[Checkout Session] Teya error:', teyaErr.message);
      sendTelegramMessage(
        `⚠️ <b>Помилка оплати (Teya)</b>\n❌ ${esc(teyaErr.message?.substring(0, 150))}`
      ).catch(() => {});

      // Clean up pending slots
      if (orderId) {
        try {
          const db = getDb();
          db.prepare("UPDATE booking_service_orders SET payment_status = 'failed' WHERE id = ?").run(orderId);
          db.prepare("DELETE FROM service_time_slots WHERE booking_session_id = 'pending_teya'").run();
        } catch { /* */ }
      }

      return NextResponse.json({ error: 'Payment system temporarily unavailable' }, { status: 503, headers: CORS_HEADERS });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Checkout Session API]', message);
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

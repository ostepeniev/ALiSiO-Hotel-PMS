/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus

export async function handlePaymentReturn(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const status = url.searchParams.get('status') || 'unknown';
  const returnPath = url.searchParams.get('return') || '/';

  console.log(`[Payment Return] session=${sessionId}, status=${status}, return=${returnPath}`);

  const db = getDb();

  if (status === 'success' && sessionId) {
    try {
      const bsoResult = db.prepare(`
        UPDATE booking_service_orders
        SET payment_status = 'paid'
        WHERE payment_id = ? AND payment_status IN ('pending', 'none')
      `).run(sessionId);

      const soResult = db.prepare(`
        UPDATE service_orders
        SET payment_status = 'paid', status = 'confirmed'
        WHERE payment_id = ? AND payment_status IN ('pending', 'none')
      `).run(sessionId);

      // reservation_id can come from URL query param OR embedded in return path
      const reservationId = url.searchParams.get('reservation_id')
        || new URL(returnPath, url.origin).searchParams.get('success');

      let resResult = { changes: 0 };
      if (reservationId) {
        // Update tentative → confirmed+paid, OR confirmed → paid (for direct booking payments)
        resResult = db.prepare(`
          UPDATE reservations
          SET payment_status = 'paid', updated_at = datetime('now')
          WHERE id = ? AND payment_status IN ('unpaid', 'payment_requested', 'prepaid')
        `).run(reservationId);

        // Also update tentative status to confirmed
        db.prepare(`
          UPDATE reservations SET status = 'confirmed', updated_at = datetime('now')
          WHERE id = ? AND status = 'tentative'
        `).run(reservationId);

        // Record payment in payments table for booking payments (source=guest_booking_payment)
        if (resResult.changes > 0) {
          try {
            const res = db.prepare('SELECT total_price, currency, unit_name FROM reservations r LEFT JOIN units u ON r.unit_id = u.id WHERE r.id = ?').get(reservationId) as any;
            if (res) {
              const payId = `pay_booking_${Date.now()}`;
              db.prepare(`
                INSERT OR IGNORE INTO payments (id, reservation_id, amount, currency, method, type, status, paid_at, notes, auto_created)
                VALUES (?, ?, ?, ?, 'online', 'full', 'completed', datetime('now'), 'Guest page Teya payment', 1)
              `).run(payId, reservationId, res.total_price, res.currency || 'CZK');

              const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
              sendTelegramMessage([
                `💳 <b>Оплата бронювання підтверджена</b>`,
                ``,
                `🏠 ${esc(res.unit_name || '')}`,
                `💰 ${res.total_price} ${res.currency || 'CZK'} — ✅ Оплачено`,
                `🔗 Teya session: ${sessionId}`,
              ].join('\n')).catch(() => {});
            }
          } catch (e: any) { console.error('[Payment Return] Booking payment record error:', e.message); }
        }
      }

      db.prepare(`
        UPDATE service_time_slots
        SET booking_session_id = NULL, notes = 'paid'
        WHERE booking_session_id = ?
      `).run(sessionId);

      console.log(`[Payment Return] Confirmed:`, {
        bsoOrders: bsoResult.changes,
        serviceOrders: soResult.changes,
        reservations: resResult.changes,
      });

      if (bsoResult.changes > 0 || soResult.changes > 0) {
        try {
          const order = db.prepare(`
            SELECT reservation_id, total_price, service_id, options_json, service_date
            FROM booking_service_orders WHERE payment_id = ?
            UNION ALL
            SELECT reservation_id, total_price, service_id, NULL, NULL
            FROM service_orders WHERE payment_id = ?
            LIMIT 1
          `).get(sessionId, sessionId) as any;

          if (order) {
            const payId = `pay_return_${Date.now()}`;
            let notes = `Online: ${order.service_id}`;
            if (order.options_json) {
              try {
                const opts = JSON.parse(order.options_json);
                notes += ` ${order.service_date || ''} ${opts.startHour || ''}:00–${(opts.startHour || 0) + (opts.hours || 0)}:00`;
              } catch { /* ignore */ }
            }
            db.prepare(`
              INSERT OR IGNORE INTO payments (id, reservation_id, amount, currency, method, type, status, paid_at, notes, auto_created)
              VALUES (?, ?, ?, 'CZK', 'online', 'service', 'completed', datetime('now'), ?, 1)
            `).run(payId, order.reservation_id, order.total_price, notes);
            console.log('[Payment Return] Payment recorded:', payId, order.total_price);
          }
        } catch (e: any) {
          console.error('[Payment Return] Payment record error:', e.message);
        }
      }

      if (bsoResult.changes > 0 || soResult.changes > 0) {
        try {
          const order = db.prepare(`
            SELECT bso.total_price, bso.service_date, bso.options_json, bso.service_id,
                   ads.name as service_name, ads.name_en,
                   g.first_name, g.last_name,
                   u.name as unit_name
            FROM booking_service_orders bso
            JOIN additional_services ads ON bso.service_id = ads.id
            LEFT JOIN reservations r ON bso.reservation_id = r.id
            LEFT JOIN guests g ON r.guest_id = g.id
            LEFT JOIN units u ON r.unit_id = u.id
            WHERE bso.payment_id = ?
            UNION ALL
            SELECT so.total_price, NULL, NULL, so.service_id,
                   ads2.name, ads2.name_en,
                   g2.first_name, g2.last_name,
                   u2.name
            FROM service_orders so
            JOIN additional_services ads2 ON so.service_id = ads2.id
            JOIN reservations r2 ON so.reservation_id = r2.id
            JOIN guests g2 ON r2.guest_id = g2.id
            JOIN units u2 ON r2.unit_id = u2.id
            WHERE so.payment_id = ?
            LIMIT 1
          `).get(sessionId, sessionId) as any;

          if (order) {
            const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
            let timeInfo = '';
            if (order.options_json) {
              try {
                const opts = JSON.parse(order.options_json);
                timeInfo = `\n⏰ ${order.service_date} ${opts.startHour}:00–${opts.startHour + opts.hours}:00`;
              } catch { /* ignore */ }
            }
            const guestName = order.first_name ? `${esc(order.first_name)} ${esc(order.last_name)}` : 'Зовнішній клієнт';
            const text = [
              `💳 <b>Оплата підтверджена</b>`,
              ``,
              `👤 ${guestName}`,
              order.unit_name ? `🏠 ${esc(order.unit_name)}` : '',
              `✨ ${esc(order.name_en || order.service_name)}${timeInfo}`,
              `💰 ${order.total_price} CZK — ✅ Оплачено`,
            ].filter(Boolean).join('\n');
            sendTelegramMessage(text).catch(() => {});
          }
        } catch { /* non-critical */ }
      }

    } catch (err: any) {
      console.error('[Payment Return] Error:', err.message);
    }

  } else if (status === 'cancel' && sessionId) {
    try {
      const released = db.prepare(`
        UPDATE service_time_slots
        SET booked_count = MAX(0, booked_count - 1), booking_session_id = NULL
        WHERE booking_session_id = ?
      `).run(sessionId);

      db.prepare(`
        UPDATE booking_service_orders
        SET payment_status = 'cancelled'
        WHERE payment_id = ? AND payment_status = 'pending'
      `).run(sessionId);

      db.prepare(`
        UPDATE service_orders
        SET payment_status = 'cancelled'
        WHERE payment_id = ? AND payment_status = 'pending'
      `).run(sessionId);

      console.log(`[Payment Return] Cancelled, slots released:`, released.changes);

      try {
        const order = db.prepare(`
          SELECT ads.name_en, ads.name as service_name, bso.service_date, bso.total_price, bso.options_json,
                 g.first_name, g.last_name
          FROM booking_service_orders bso
          JOIN additional_services ads ON bso.service_id = ads.id
          LEFT JOIN reservations r ON bso.reservation_id = r.id
          LEFT JOIN guests g ON r.guest_id = g.id
          WHERE bso.payment_id = ?
          LIMIT 1
        `).get(sessionId) as any;
        if (order) {
          const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
          const guestName = order.first_name ? `${esc(order.first_name)} ${esc(order.last_name)}` : 'Клієнт';
          const text = [
            `❌ <b>Оплату скасовано</b>`,
            ``,
            `👤 ${guestName}`,
            `✨ ${esc(order.name_en || order.service_name)}`,
            `💰 ${order.total_price} CZK`,
          ].join('\n');
          sendTelegramMessage(text).catch(() => {});
        }
      } catch { /* non-critical */ }
    } catch (err: any) {
      console.error('[Payment Return] Cancel error:', err.message);
    }
  }

  const separator = returnPath.includes('?') ? '&' : '?';
  const redirectUrl = `${returnPath}${separator}payment_status=${status}&session_id=${sessionId}`;

  return NextResponse.redirect(new URL(redirectUrl, url.origin));
}

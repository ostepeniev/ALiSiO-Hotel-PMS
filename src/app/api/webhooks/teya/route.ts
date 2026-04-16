import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/teya';
import { getDb } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import { onPaymentReceived } from '@/lib/crm/stage-transitions';

/**
 * POST /api/webhooks/teya
 * 
 * Receives webhook events from Teya after payment processing.
 * Verifies signature and updates payment status in booking_service_orders AND service_orders.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-teya-signature') || '';

    // Verify webhook signature
    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      console.error('[Teya Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type || event.event_type;

    console.log('[Teya Webhook] Received:', eventType, JSON.stringify(event.data?.id || ''));

    const db = getDb();

    switch (eventType) {
      case 'payment.succeeded.v1': {
        const transactionId = event.data?.id;
        const sessionId = event.data?.checkout_session_id;
        const amount = event.data?.amount?.value;
        const currency = event.data?.amount?.currency;
        const paymentRef = sessionId || transactionId;

        if (paymentRef) {
          // Update booking_service_orders (widget orders)
          const result1 = db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'paid'
            WHERE payment_id = ? AND payment_status IN ('pending', 'none')
          `).run(paymentRef);

          // Update service_orders (guest page orders)
          const result2 = db.prepare(`
            UPDATE service_orders 
            SET payment_status = 'paid', status = 'confirmed'
            WHERE payment_id = ? AND payment_status IN ('pending', 'none')
          `).run(paymentRef);

          console.log('[Teya Webhook] Payment confirmed:', {
            transactionId, sessionId, amount, currency,
            bookingOrdersUpdated: result1.changes,
            serviceOrdersUpdated: result2.changes,
          });

          // Telegram notification for guest-page service orders
          if (result2.changes > 0) {
            try {
              const order = db.prepare(`
                SELECT so.*, ads.name as service_name, ads.name_en,
                       r.check_in, r.check_out,
                       g.first_name, g.last_name,
                       u.name as unit_name
                FROM service_orders so
                JOIN additional_services ads ON so.service_id = ads.id
                JOIN reservations r ON so.reservation_id = r.id
                JOIN guests g ON r.guest_id = g.id
                JOIN units u ON r.unit_id = u.id
                WHERE so.payment_id = ?
              `).get(paymentRef) as any;

              if (order) {
                const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const text = [
                  `💳 <b>Оплата послуги підтверджена</b>`,
                  ``,
                  `👤 ${esc(order.first_name)} ${esc(order.last_name)}`,
                  `🏠 ${esc(order.unit_name)}`,
                  `📅 ${order.check_in} — ${order.check_out}`,
                  ``,
                  `✨ ${esc(order.name_en || order.service_name)} × ${order.quantity}`,
                  `💰 ${order.total_price} ${currency || 'CZK'} — ✅ Оплачено`,
                ].join('\n');
                sendTelegramMessage(text).catch(() => {});
              }
            } catch { /* non-critical */ }
          }

          // AUTO STAGE TRANSITION: payment received → advance CRM lead
          try {
            // Find CRM lead linked to the reservation
            const leadByPayment = db.prepare(`
              SELECT l.id, l.stage, l.estimated_value, r.total_price
              FROM crm_leads l
              JOIN reservations r ON r.id = l.reservation_id
              WHERE l.reservation_id IN (
                SELECT so.reservation_id FROM service_orders so WHERE so.payment_id = ?
                UNION
                SELECT bso.reservation_id FROM booking_service_orders bso WHERE bso.payment_id = ?
              )
              LIMIT 1
            `).get(paymentRef, paymentRef) as any;

            if (leadByPayment) {
              const totalPrice = leadByPayment.total_price || leadByPayment.estimated_value || 0;
              const isFullPayment = amount && totalPrice > 0 && amount >= totalPrice * 0.9; // 90%+ = full
              onPaymentReceived(leadByPayment.id, leadByPayment.stage, !!isFullPayment);
            }
          } catch (stageErr: any) {
            console.error('[Teya Webhook] Stage transition error:', stageErr.message);
          }
        }
        break;
      }

      case 'payment.failed.v1': {
        const sessionId = event.data?.checkout_session_id;
        if (sessionId) {
          db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'failed'
            WHERE payment_id = ? AND payment_status = 'pending'
          `).run(sessionId);

          db.prepare(`
            UPDATE service_orders 
            SET payment_status = 'failed'
            WHERE payment_id = ? AND payment_status = 'pending'
          `).run(sessionId);

          console.log('[Teya Webhook] Payment failed:', sessionId);
        }
        break;
      }

      case 'refund.succeeded.v1': {
        const transactionId = event.data?.transaction_id;
        const sessionId = event.data?.checkout_session_id;
        const ref = sessionId || transactionId;
        if (ref) {
          db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'refunded'
            WHERE payment_id = ? AND payment_status = 'paid'
          `).run(ref);

          db.prepare(`
            UPDATE service_orders 
            SET payment_status = 'refunded', status = 'cancelled'
            WHERE payment_id = ? AND payment_status = 'paid'
          `).run(ref);

          console.log('[Teya Webhook] Refund confirmed:', { transactionId, sessionId });
        }
        break;
      }

      default:
        console.log('[Teya Webhook] Unhandled event:', eventType);
    }

    // Always respond 200 to acknowledge receipt
    return NextResponse.json({ received: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya Webhook] Error:', message);
    // Still return 200 to prevent Teya from retrying
    return NextResponse.json({ received: true, error: message });
  }
}

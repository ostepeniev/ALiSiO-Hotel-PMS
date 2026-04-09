import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/teya';
import { getDb } from '@/lib/db';

/**
 * POST /api/webhooks/teya
 * 
 * Receives webhook events from Teya after payment processing.
 * Verifies signature and updates booking/service payment status.
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

    console.log('[Teya Webhook] Received:', eventType, event.data?.id);

    switch (eventType) {
      case 'payment.succeeded.v1': {
        const transactionId = event.data?.id;
        const amount = event.data?.amount?.value;
        const currency = event.data?.amount?.currency;
        const metadata = event.data?.metadata || {};
        const reservationId = metadata.reservation_id;

        if (transactionId) {
          const db = getDb();

          // Update any pending payment records
          db.prepare(`
            UPDATE service_bookings 
            SET payment_status = 'paid', 
                paid_at = datetime('now'),
                teya_transaction_id = ?
            WHERE teya_session_id = ? AND payment_status = 'pending'
          `).run(transactionId, event.data?.checkout_session_id || '');

          // Also check reservations if this was a full booking payment
          if (reservationId) {
            db.prepare(`
              UPDATE reservations 
              SET payment_status = 'paid',
                  paid_at = datetime('now'),
                  teya_transaction_id = ?
              WHERE id = ? AND payment_status = 'pending'
            `).run(transactionId, reservationId);
          }

          console.log('[Teya Webhook] Payment confirmed:', transactionId, amount, currency);
        }
        break;
      }

      case 'payment.failed.v1': {
        const sessionId = event.data?.checkout_session_id;
        if (sessionId) {
          const db = getDb();
          db.prepare(`
            UPDATE service_bookings 
            SET payment_status = 'failed'
            WHERE teya_session_id = ? AND payment_status = 'pending'
          `).run(sessionId);
        }
        console.log('[Teya Webhook] Payment failed:', event.data?.id);
        break;
      }

      case 'refund.succeeded.v1': {
        const transactionId = event.data?.transaction_id;
        if (transactionId) {
          const db = getDb();
          db.prepare(`
            UPDATE service_bookings 
            SET payment_status = 'refunded'
            WHERE teya_transaction_id = ?
          `).run(transactionId);
          db.prepare(`
            UPDATE reservations 
            SET payment_status = 'refunded'
            WHERE teya_transaction_id = ?
          `).run(transactionId);
        }
        console.log('[Teya Webhook] Refund confirmed:', transactionId);
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

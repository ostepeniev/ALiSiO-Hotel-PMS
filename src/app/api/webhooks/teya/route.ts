import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/teya';
import { getDb } from '@/lib/db';

/**
 * POST /api/webhooks/teya
 * 
 * Receives webhook events from Teya after payment processing.
 * Verifies signature and updates booking payment status in booking_service_orders.
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

        if (sessionId || transactionId) {
          // Update booking_service_orders where payment_id matches the session ID
          const result = db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'paid'
            WHERE payment_id = ? AND payment_status IN ('pending', 'none')
          `).run(sessionId || transactionId);

          console.log('[Teya Webhook] Payment confirmed:', {
            transactionId,
            sessionId,
            amount,
            currency,
            rowsUpdated: result.changes,
          });
        }
        break;
      }

      case 'payment.failed.v1': {
        const sessionId = event.data?.checkout_session_id;
        if (sessionId) {
          const result = db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'failed'
            WHERE payment_id = ? AND payment_status = 'pending'
          `).run(sessionId);

          console.log('[Teya Webhook] Payment failed:', sessionId, 'rows:', result.changes);
        }
        break;
      }

      case 'refund.succeeded.v1': {
        const transactionId = event.data?.transaction_id;
        const sessionId = event.data?.checkout_session_id;
        if (transactionId || sessionId) {
          const result = db.prepare(`
            UPDATE booking_service_orders 
            SET payment_status = 'refunded'
            WHERE payment_id = ? AND payment_status = 'paid'
          `).run(sessionId || transactionId);

          console.log('[Teya Webhook] Refund confirmed:', { transactionId, sessionId, rows: result.changes });
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

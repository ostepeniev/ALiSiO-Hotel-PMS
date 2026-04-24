/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '../domain/teya-client';
import { getDb } from '@core/db';
import { eventBus } from '@core/event-bus';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
// TODO: replace with eventBus.emit('crm.payment_received') when crm module is migrated
import { onPaymentReceived } from '@/lib/crm/stage-transitions';

function resolveIntentKind(metadata: Record<string, string> | undefined): string {
  const source = metadata?.source || '';
  if (source === 'guest_booking_payment') return 'booking_balance';
  if (source === 'guest_cart') return 'service_cart';
  if (source === 'guest_page') return 'service_standalone';
  if (source === 'crm_deposit') return 'booking_deposit';
  if (metadata?.reservation_id) return 'booking_full';
  return 'unknown';
}

export async function teyaWebhook(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-teya-signature') || '';

    console.log('[Teya Webhook] RAW PAYLOAD:', rawBody.substring(0, 3000));

    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      console.error('[Teya Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type || event.event_type || event.event
      || event.eventType || event.action || detectEventType(event);

    console.log('[Teya Webhook] Parsed event:', eventType);

    const db = getDb();
    const metadata = event.data?.metadata || event.metadata;
    const intentKind = resolveIntentKind(metadata);

    if (isPaymentSuccess(eventType, event)) {
      handlePaymentSuccess(db, event, eventType);
      const { sessionId, amount, currency } = extractPaymentRef(event);
      if (sessionId) {
        eventBus
          .emit('payment.completed', {
            sessionId,
            provider: 'teya',
            intentKind,
            paymentId: sessionId,
            amount: amount > 1000 ? amount / 100 : amount,
            currency,
          })
          .catch((e) => console.error('[Teya Webhook] emit completed error:', e));
      }
    } else if (isPaymentFailed(eventType, event)) {
      handlePaymentFailed(db, event);
      const { sessionId } = extractPaymentRef(event);
      if (sessionId) {
        eventBus
          .emit('payment.failed', { sessionId, provider: 'teya', intentKind })
          .catch((e) => console.error('[Teya Webhook] emit failed error:', e));
      }
    } else if (isRefund(eventType)) {
      handleRefund(db, event);
    } else {
      console.log('[Teya Webhook] Unhandled event:', eventType);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya Webhook] Error:', message);
    return NextResponse.json({ received: true, error: message });
  }
}

function detectEventType(event: any): string {
  if (event.status === 'CAPTURED' || event.status === 'COMPLETED' || event.status === 'PAID') return 'payment.succeeded.v1';
  if (event.status === 'FAILED' || event.status === 'DECLINED') return 'payment.failed.v1';
  if (event.status === 'REFUNDED') return 'refund.succeeded.v1';
  if (event.data?.status === 'CAPTURED' || event.data?.status === 'COMPLETED') return 'payment.succeeded.v1';
  if (event.data?.status === 'FAILED' || event.data?.status === 'DECLINED') return 'payment.failed.v1';
  return 'unknown';
}

function isPaymentSuccess(eventType: string, event: any): boolean {
  return eventType === 'payment.succeeded.v1' || eventType === 'checkout.session.completed'
    || eventType === 'payment.captured' || event.status === 'CAPTURED' || event.status === 'COMPLETED';
}
function isPaymentFailed(eventType: string, event: any): boolean {
  return eventType === 'payment.failed.v1' || event.status === 'FAILED' || event.status === 'DECLINED';
}
function isRefund(eventType: string): boolean { return eventType === 'refund.succeeded.v1'; }

function extractPaymentRef(event: any): { sessionId: string; transactionId: string; amount: number; currency: string } {
  const data = event.data || event;
  // Try all known field names for session/checkout ID
  const sessionId =
    data.checkout_session_id ||
    data.session_id ||
    data.checkout_session?.id ||
    event.checkout_session_id ||
    event.session_id ||
    event.data?.checkout_session?.id ||
    '';
  const transactionId = data.id || data.transaction_id || event.id || '';
  const amount = data.amount?.value || data.amount || event.amount?.value || event.amount || 0;
  const currency = data.amount?.currency || data.currency || event.amount?.currency || 'CZK';
  console.log('[Teya Webhook] Extracted refs:', { sessionId, transactionId, amount, currency });
  return { sessionId, transactionId, amount, currency };
}

function handlePaymentSuccess(db: any, event: any, eventType: string) {
  const { sessionId, transactionId, amount, currency } = extractPaymentRef(event);
  const paymentRef = sessionId || transactionId;
  if (!paymentRef) { console.log('[Teya Webhook] No payment reference found in success event'); return; }
  console.log('[Teya Webhook] Processing payment success:', { eventType, sessionId, transactionId, amount, currency });

  const result1 = db.prepare("UPDATE booking_service_orders SET payment_status = 'paid' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(paymentRef);
  const result2 = db.prepare("UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(paymentRef);
  const result3 = db.prepare("UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = datetime('now') WHERE id IN (SELECT reservation_id FROM booking_service_orders WHERE payment_id = ?) AND status = 'tentative'").run(paymentRef);
  const result4 = db.prepare("UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = datetime('now') WHERE payment_id = ? AND status = 'tentative'").run(paymentRef);
  db.prepare("UPDATE service_time_slots SET booking_session_id = NULL, notes = 'paid' WHERE booking_session_id = ?").run(paymentRef);

  console.log('[Teya Webhook] Payment confirmed:', { paymentRef, amount, currency, bookingOrders: result1.changes, serviceOrders: result2.changes, reservations: result3.changes + result4.changes });

  if (result2.changes === 0 && !result1.changes) {
    // Try again with transactionId as fallback (some Teya versions use tx ID in webhook)
    const txFallback = db.prepare("UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(transactionId);
    const txFallback2 = db.prepare("UPDATE booking_service_orders SET payment_status = 'paid' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(transactionId);
    console.log('[Teya Webhook] Fallback by transactionId:', { transactionId, so: txFallback.changes, bso: txFallback2.changes });
  }

  if (result2.changes > 0) {
    try {
      db.prepare(`
        UPDATE cart_events SET abandon_notified_at = datetime('now')
        WHERE reservation_id IN (
          SELECT reservation_id FROM service_orders WHERE payment_id = ?
        ) AND abandon_notified_at IS NULL
      `).run(paymentRef);
    } catch { /* non-critical */ }
  }

  if (result1.changes > 0 || result2.changes > 0) recordPayment(db, paymentRef, amount, currency);
  if (result1.changes > 0) sendWidgetOrderTG(db, paymentRef, currency);
  if (result2.changes > 0) sendGuestOrderTG(db, paymentRef, currency);

  try {
    const leadByPayment = db.prepare(`
      SELECT l.id, l.stage, l.estimated_value, r.total_price FROM crm_leads l
      JOIN reservations r ON r.id = l.reservation_id
      WHERE l.reservation_id IN (
        SELECT so.reservation_id FROM service_orders so WHERE so.payment_id = ?
        UNION SELECT bso.reservation_id FROM booking_service_orders bso WHERE bso.payment_id = ?
      ) LIMIT 1
    `).get(paymentRef, paymentRef) as any;
    if (leadByPayment) {
      const totalPrice = leadByPayment.total_price || leadByPayment.estimated_value || 0;
      onPaymentReceived(leadByPayment.id, leadByPayment.stage, !!(amount && totalPrice > 0 && amount >= totalPrice * 0.9));
    }
  } catch (stageErr: any) { console.error('[Teya Webhook] Stage transition error:', stageErr.message); }

  void result4;
}

function handlePaymentFailed(db: any, event: any) {
  const { sessionId } = extractPaymentRef(event);
  if (!sessionId) return;
  db.prepare("UPDATE booking_service_orders SET payment_status = 'failed' WHERE payment_id = ? AND payment_status = 'pending'").run(sessionId);
  db.prepare("UPDATE service_orders SET payment_status = 'failed' WHERE payment_id = ? AND payment_status = 'pending'").run(sessionId);
  db.prepare('UPDATE service_time_slots SET booked_count = MAX(0, booked_count - 1), booking_session_id = NULL WHERE booking_session_id = ?').run(sessionId);
  console.log('[Teya Webhook] Payment failed, slots released:', sessionId);
}

function handleRefund(db: any, event: any) {
  const { sessionId, transactionId } = extractPaymentRef(event);
  const ref = sessionId || transactionId;
  if (!ref) return;
  db.prepare("UPDATE booking_service_orders SET payment_status = 'refunded' WHERE payment_id = ? AND payment_status = 'paid'").run(ref);
  db.prepare("UPDATE service_orders SET payment_status = 'refunded', status = 'cancelled' WHERE payment_id = ? AND payment_status = 'paid'").run(ref);
  console.log('[Teya Webhook] Refund confirmed:', ref);
}

function recordPayment(db: any, paymentRef: string, amount: number, currency: string) {
  try {
    const order = db.prepare(`
      SELECT reservation_id, total_price, service_id, options_json, service_date
      FROM booking_service_orders WHERE payment_id = ?
      UNION ALL SELECT reservation_id, total_price, service_id, NULL, NULL
      FROM service_orders WHERE payment_id = ? LIMIT 1
    `).get(paymentRef, paymentRef) as any;
    if (!order) return;
    const amountMajor = amount > 1000 ? amount / 100 : amount;
    let notes = `Teya online: ${order.service_id}`;
    if (order.options_json) {
      try { const opts = JSON.parse(order.options_json); notes += ` ${order.service_date || ''} ${opts.startHour || ''}:00–${(opts.startHour || 0) + (opts.hours || 0)}:00`; } catch { /* ignore */ }
    }
    // PR #6: record via finance fin_operations bridge
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPaymentOperation, hasPaymentOperation } = require('@/modules/finance/api/payment-bridge');
    if (!hasPaymentOperation(order.reservation_id, 'teia', paymentRef)) {
      const { operationId } = createPaymentOperation({
        reservationId: order.reservation_id,
        amount: amountMajor,
        currency,
        method: 'online',
        paymentSubtype: 'service',
        source: 'teia',
        sourceRef: paymentRef,
        status: 'completed',
        comment: notes,
      });
      console.log('[Teya Webhook] Payment recorded in finance:', operationId, amountMajor, currency);
    }
  } catch (e: any) { console.error('[Teya Webhook] Failed to record payment:', e.message); }
}

function sendWidgetOrderTG(db: any, paymentRef: string, currency: string) {
  try {
    const order = db.prepare(`
      SELECT bso.*, ads.name as service_name, ads.name_en, r.check_in, r.check_out, g.first_name, g.last_name, u.name as unit_name
      FROM booking_service_orders bso
      JOIN additional_services ads ON bso.service_id = ads.id
      LEFT JOIN reservations r ON bso.reservation_id = r.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE bso.payment_id = ? LIMIT 1
    `).get(paymentRef) as any;
    if (!order) return;
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    let timeInfo = '';
    if (order.options_json) { try { const opts = JSON.parse(order.options_json); timeInfo = `\n⏰ ${order.service_date} ${opts.startHour}:00–${opts.startHour + opts.hours}:00`; } catch { /* ignore */ } }
    const guestName = order.first_name ? `${esc(order.first_name)} ${esc(order.last_name)}` : 'Зовнішній клієнт';
    const text = [`💳 <b>Оплата послуги підтверджена</b>`, ``, `👤 ${guestName}`, order.unit_name ? `🏠 ${esc(order.unit_name)}` : '', `✨ ${esc(order.name_en || order.service_name)}${timeInfo}`, `💰 ${order.total_price} ${currency || 'CZK'} — ✅ Оплачено`].filter(Boolean).join('\n');
    sendTelegramMessage(text).catch(() => {});
  } catch { /* non-critical */ }
}

function sendGuestOrderTG(db: any, paymentRef: string, currency: string) {
  try {
    const orders = db.prepare(`
      SELECT so.*, ads.name as service_name, ads.name_en, r.check_in, r.check_out, g.first_name, g.last_name, u.name as unit_name
      FROM service_orders so JOIN additional_services ads ON so.service_id = ads.id
      JOIN reservations r ON so.reservation_id = r.id JOIN guests g ON r.guest_id = g.id JOIN units u ON r.unit_id = u.id
      WHERE so.payment_id = ?
    `).all(paymentRef) as any[];
    if (!orders.length) return;
    const first = orders[0];
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const grandTotal = orders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);
    const itemLines = orders.map((o: any) => {
      const dateTag = o.service_date ? ` · ${o.service_date}` : '';
      return `  • ${esc(o.name_en || o.service_name)} ×${o.quantity}${dateTag} — ${o.total_price} ${currency}`;
    });
    const text = [
      `💳 <b>Оплата підтверджена</b>`, ``,
      `👤 ${esc(first.first_name)} ${esc(first.last_name)}`,
      `🏠 ${esc(first.unit_name)}`,
      `📅 ${first.check_in} — ${first.check_out}`, ``,
      ...itemLines, ``,
      orders.length > 1 ? `💰 Разом: ${grandTotal} ${currency} — ✅ Оплачено` : `💰 ${grandTotal} ${currency} — ✅ Оплачено`,
    ].join('\n');
    sendTelegramMessage(text).catch(() => {});
  } catch { /* non-critical */ }
}

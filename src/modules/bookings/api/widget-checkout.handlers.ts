/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/teya';
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createCheckoutSessionOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/booking/checkout-session
 * Creates a Teya checkout session for booking payment.
 * Works like the guest portal payment — uses global Teya env credentials.
 */
export async function createWidgetCheckoutSession(req: Request) {
  try {
    const body = await req.json();
    const { reservation_id, amount, currency, description, return_path } = body;

    if (!reservation_id && !amount) {
      return NextResponse.json({ error: 'reservation_id or amount is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();

    // Resolve amount — from request body (already calculated by client) or from DB
    let payAmount = amount;
    let payCurrency = currency || 'CZK';
    let payDescription = description || 'Kemp Carlsbad Booking';

    if (!payAmount && reservation_id) {
      const res = db.prepare('SELECT total_price, currency FROM reservations WHERE id = ?').get(reservation_id) as any;
      if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
      payAmount = res.total_price;
      payCurrency = res.currency || 'CZK';
      payDescription = `Booking #${reservation_id.substring(0, 8)}`;
    }

    if (!payAmount || payAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers: CORS_HEADERS });
    }

    // TG Notification
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    try {
      sendTelegramMessage([
        `📦 <b>Запит на оплату: ${esc(payDescription)}</b>`,
        `💰 ${payAmount} ${payCurrency}`,
        `💳 Створення сесії Teya...`,
      ].join('\n')).catch(() => {});
    } catch { /* */ }

    // Create Teya session — same approach as guest portal (global env creds)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
    const returnTo = return_path || '/book?payment=success';
    const amountMinor = Math.round(payAmount * 100);

    try {
      const session = await createCheckoutSession({
        amount: amountMinor,
        currency: payCurrency,
        description: payDescription,
        metadata: reservation_id ? { reservation_id, source: 'widget_kemp' } : { source: 'widget_kemp' },
        success_url: `${baseUrl}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=success&return=${encodeURIComponent(returnTo)}`,
        cancel_url: `${baseUrl}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=cancel&return=${encodeURIComponent(returnTo)}`,
      });

      // Link payment to reservation
      if (reservation_id) {
        try {
          db.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(session.id, reservation_id);
        } catch (e: any) { console.error('[Checkout] Update reservation payment_id error:', e.message); }
      }

      console.log(`[Widget Checkout] Session created: ${session.id} for ${payAmount} ${payCurrency}`);

      return NextResponse.json({
        session_token: session.session_token,
        session_id: session.id,
        session_url: session.session_url,
      }, { headers: CORS_HEADERS });

    } catch (teyaErr: any) {
      console.error('[Widget Checkout] Teya error:', teyaErr.message);
      return NextResponse.json({ error: `Payment gateway error: ${teyaErr.message}` }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

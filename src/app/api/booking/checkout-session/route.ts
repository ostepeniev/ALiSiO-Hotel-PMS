import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/teya';

/**
 * POST /api/booking/checkout-session
 * 
 * Creates a Teya Checkout Session for Hosted Checkout payments.
 * Returns session_url for client-side redirect.
 *
 * Body: { amount: number, currency?: string, description?: string, 
 *         items?: [], reservation_id?: string, return_path?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, currency, description, items, reservation_id, return_path } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Determine base URL for redirects
    const origin = new URL(req.url).origin;
    const returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');

    // Teya API uses minor units (haléřů for CZK): 1 CZK = 100 haléřů
    // Widget sends amount in major units (e.g. 1200 for 1200 Kč)
    const amountMinor = Math.round(amount * 100);

    const session = await createCheckoutSession({
      amount: amountMinor,
      currency: currency || 'CZK',
      description: description || 'ALiSiO Booking',
      items: items ? items.map((item: { description: string; quantity: number; unit_price: number }) => ({
        ...item,
        unit_price: Math.round(item.unit_price * 100),
      })) : undefined,
      metadata: reservation_id ? { reservation_id } : undefined,
      // Teya production rejects localhost redirect URLs
      ...(isProduction ? {
        success_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=success&return=${encodeURIComponent(returnTo)}`,
        cancel_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=cancel&return=${encodeURIComponent(returnTo)}`,
      } : {}),
    });

    return NextResponse.json({
      session_token: session.session_token,
      session_id: session.id,
      session_url: session.session_url,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Checkout Session API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

/**
 * GET /api/booking/payment-return
 * 
 * Handles redirect from Teya Hosted Checkout after payment.
 * Redirects guest back to their booking page with payment status.
 * 
 * Query params:
 *   session_id - Teya checkout session ID
 *   status     - "success" or "cancel"
 *   return     - URL path to redirect back to
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const status = url.searchParams.get('status') || 'unknown';
  const returnPath = url.searchParams.get('return') || '/';

  console.log(`[Payment Return] session=${sessionId}, status=${status}, return=${returnPath}`);

  // Build redirect URL with payment result params
  const separator = returnPath.includes('?') ? '&' : '?';
  const redirectUrl = `${returnPath}${separator}payment_status=${status}&session_id=${sessionId}`;

  return NextResponse.redirect(new URL(redirectUrl, url.origin));
}

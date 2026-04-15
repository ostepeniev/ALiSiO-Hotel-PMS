import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/booking/payment-return
 * 
 * Handles redirect from Teya Hosted Checkout after payment.
 * On success: updates reservation status to 'confirmed' and payment_status to 'paid'.
 * Redirects guest back with payment result.
 * 
 * Query params:
 *   session_id    - Teya checkout session ID
 *   status        - "success" or "cancel"
 *   return        - URL path to redirect back to
 *   reservation_id - Reservation ID to update (optional, also checked via metadata)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const status = url.searchParams.get('status') || 'unknown';
  const returnPath = url.searchParams.get('return') || '/';

  console.log(`[Payment Return] session=${sessionId}, status=${status}, return=${returnPath}`);

  // On successful payment, update reservation status
  if (status === 'success') {
    try {
      const db = getDb();

      // Try to find reservation_id from return path (e.g. /booking?success=r_12345)
      const returnUrl = new URL(returnPath, url.origin);
      const reservationId = returnUrl.searchParams.get('success');

      if (reservationId) {
        const updated = db.prepare(`
          UPDATE reservations 
          SET status = 'confirmed', payment_status = 'paid', updated_at = datetime('now')
          WHERE id = ? AND status = 'tentative'
        `).run(reservationId);

        console.log(`[Payment Return] Updated reservation ${reservationId}: changes=${updated.changes}`);
      }
    } catch (err) {
      console.error('[Payment Return] DB update error:', err);
      // Don't block redirect on DB error
    }
  }

  // Build redirect URL with payment result params
  const separator = returnPath.includes('?') ? '&' : '?';
  const redirectUrl = `${returnPath}${separator}payment_status=${status}&session_id=${sessionId}`;

  return NextResponse.redirect(new URL(redirectUrl, url.origin));
}

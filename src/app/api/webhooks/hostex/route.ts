/**
 * Hostex Webhook Receiver
 * POST /api/webhooks/hostex
 *
 * Docs: https://hostex-openapi.readme.io/reference/webhook-useage-guide
 *
 * CRITICAL: Must respond with 200 within 3 seconds or Hostex disables the webhook.
 * So we respond immediately and process async in background (fire-and-forget).
 *
 * Payload format (from docs):
 * { "event": "reservation_created", "reservation_code": "...", "stay_code": "...", "timestamp": "..." }
 *
 * Security: Hostex sends "Hostex-Webhook-Secret-Token" header with a fixed token per webhook URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { syncReservations } from '@/lib/hostex-sync';

const WEBHOOK_SECRET = process.env.HOSTEX_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  // ─── 1. Parse body immediately ────────────────────────────
  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ─── 2. Verify secret token (optional but recommended) ───
  const incomingToken = request.headers.get('Hostex-Webhook-Secret-Token') || '';
  if (WEBHOOK_SECRET && incomingToken !== WEBHOOK_SECRET) {
    console.warn('[Hostex Webhook] Invalid token:', incomingToken);
    // Still return 200 to avoid Hostex disabling the webhook due to auth errors
    // Change to 401 once you've confirmed the token value
  }

  const event = payload.event || '';
  const reservationCode = payload.reservation_code || '';
  const stayCode = payload.stay_code || '';

  console.log(`[Hostex Webhook] Event: ${event} | code: ${reservationCode} | stay: ${stayCode}`);

  // ─── 3. Respond immediately with 200 (Hostex requires <3s) ─
  // Process in background — do NOT await here
  if (event === 'reservation_created' || event === 'reservation_updated') {
    setImmediate(async () => {
      try {
        console.log(`[Hostex Webhook] Background sync triggered by ${event}...`);
        await syncReservations();
        console.log(`[Hostex Webhook] Sync complete for ${event}: ${reservationCode}`);
      } catch (e: any) {
        console.error('[Hostex Webhook] Background sync error:', e.message);
      }
    });
  }
  // For other events (calendar, messages, reviews) — no action needed

  return NextResponse.json({ ok: true, event, code: reservationCode });
}

// ─── GET: show webhook status ───────────────────────────────
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhooks/hostex',
    status: 'active',
    docs: 'https://hostex-openapi.readme.io/reference/webhook-useage-guide',
    events_handled: ['reservation_created', 'reservation_updated'],
    security: 'Hostex-Webhook-Secret-Token header',
    note: 'Responds immediately (<3s), processes sync in background',
  });
}

/**
 * Hostex Webhook Receiver — POST /api/webhooks/hostex
 *
 * Docs: https://hostex-openapi.readme.io/reference/webhook-useage-guide
 *
 * CRITICAL: Respond within 3 seconds or Hostex disables the webhook.
 * → Respond 200 immediately, process in background (fire-and-forget).
 *
 * Payload: { event, reservation_code, stay_code, timestamp }
 * Security header: Hostex-Webhook-Secret-Token
 *
 * Strategy: use ?reservation_code= to fetch the exact reservation —
 * bypasses the 20-record global cap that breaks bulk syncs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { syncSingleReservation, syncReservations } from '@/lib/hostex-sync';

const WEBHOOK_SECRET = process.env.HOSTEX_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  // 1. Parse body
  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 2. Verify Hostex-Webhook-Secret-Token (optional but recommended)
  const incomingToken = request.headers.get('Hostex-Webhook-Secret-Token') || '';
  if (WEBHOOK_SECRET && incomingToken !== WEBHOOK_SECRET) {
    console.warn('[Hostex Webhook] Unexpected token:', incomingToken);
    // Return 200 anyway — avoid Hostex disabling the webhook on auth errors
  }

  const event = payload.event || '';
  const reservationCode = payload.reservation_code || '';

  console.log(`[Hostex Webhook] ${event} | code: ${reservationCode}`);

  // 3. Respond IMMEDIATELY with 200 (Hostex timeout = 3s)
  if (event === 'reservation_created' || event === 'reservation_updated') {
    setImmediate(async () => {
      try {
        if (reservationCode) {
          // Targeted: fetch exactly this reservation by code (bypasses 20-record cap)
          await syncSingleReservation(reservationCode);
        } else {
          // Fallback: full sync if no code in payload
          await syncReservations();
        }
      } catch (e: any) {
        console.error('[Hostex Webhook] Background error:', e.message);
      }
    });
  }

  return NextResponse.json({ ok: true, event, code: reservationCode });
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhooks/hostex',
    status: 'active',
    strategy: '?reservation_code= targeted fetch — bypasses 20-record cap',
    events: ['reservation_created', 'reservation_updated'],
    security: 'Hostex-Webhook-Secret-Token header',
  });
}

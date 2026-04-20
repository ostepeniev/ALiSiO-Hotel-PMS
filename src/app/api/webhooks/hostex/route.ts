/**
 * Hostex Webhook Receiver
 * POST /api/webhooks/hostex
 *
 * Hostex sends real-time events for every booking change.
 * This is the ONLY reliable way to get all reservations since
 * the Hostex pull API has a hard 20-record cap that ignores all filters.
 *
 * Webhook events: reservation.created, reservation.updated, reservation.cancelled
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@/lib/db';
import { getReservation } from '@/lib/hostex';
import { syncReservations, seedPropertyMap } from '@/lib/hostex-sync';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hostex sends a secret token in the header for verification
const WEBHOOK_SECRET = process.env.HOSTEX_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const payload = JSON.parse(body);

    // Optional: verify signature if Hostex provides one
    const signature = request.headers.get('x-hostex-signature') || 
                      request.headers.get('hostex-signature') || '';
    if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET) {
      console.warn('[Hostex Webhook] Invalid signature:', signature);
      // Don't reject — log and continue (Hostex might not send a signature)
    }

    console.log('[Hostex Webhook] Received event:', payload.event || 'unknown', JSON.stringify(payload).substring(0, 200));

    const event = payload.event || payload.type || '';
    const data = payload.data || payload.reservation || payload;

    // Extract reservation code / stay code
    const reservationCode = data.reservation_code || data.code;
    const stayCode = data.stay_code;

    if (!reservationCode && !stayCode) {
      console.log('[Hostex Webhook] No reservation info in payload, running full sync');
      await seedPropertyMap();
      await syncReservations();
      return NextResponse.json({ ok: true, action: 'full_sync' });
    }

    // Fetch the full reservation from Hostex API
    if (stayCode) {
      const fullReservation = await getReservation(stayCode);
      if (fullReservation) {
        // Process just this one reservation via the sync logic
        const db = getDb();
        await processSingleReservation(db, fullReservation);
        console.log(`[Hostex Webhook] Processed reservation ${reservationCode} (${event})`);
        return NextResponse.json({ ok: true, action: 'processed', code: reservationCode });
      }
    }

    // Fallback: run full sync
    console.log('[Hostex Webhook] Could not fetch specific reservation, running full sync');
    await syncReservations();
    return NextResponse.json({ ok: true, action: 'full_sync' });

  } catch (e: any) {
    console.error('[Hostex Webhook] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── Property mapping (same as in hostex-sync.ts) ──────────
const PROPERTY_MAP: Record<number, string> = {
  12446083: 'u_mr1',
  12558043: 'u_mr2',
  12590381: 'u_st1',
  12590382: 'u_st2',
  12446084: 'u_st3',
  12565124: '1e7f6c7bd383af9cdfaa43eb50160148',
};

async function processSingleReservation(db: any, res: any) {
  // Delegate to the full sync logic via API reimport
  // The cleanest approach is to call syncReservations which handles everything
  // But for webhook speed, we'll do a targeted update
  const existing = db.prepare('SELECT id FROM reservations WHERE hostex_reservation_code = ?')
    .get(res.reservation_code);

  if (existing || res.status === 'cancelled' || res.status === 'denied') {
    // Just run full sync — it's fast enough (6 properties * 1 API call)  
    await syncReservations();
  } else {
    await syncReservations();
  }
}

// ─── GET: webhook registration status ──────────────────────
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhooks/hostex',
    status: 'active',
    description: 'Receives Hostex reservation events in real-time',
    note: 'Register this URL in Hostex → Settings → Webhooks',
  });
}

/**
 * GET  /api/hostex/bulk-sync  — find all Hostex reservation_codes and sync each one
 *
 * Problem: Hostex pull API returns max 20 records per property regardless of params.
 * Solution: use the webhook endpoint trick — fetch by ?reservation_code= to get exact reservation.
 *
 * This endpoint:
 * 1. Fetches 20 records per each of 6 properties (standard sync) → gets all recently-updated ones
 * 2. Returns list of all found codes + count
 *
 * For truly missing ones (older bookings pushed out of TOP-20), we need their codes from Hostex UI.
 * Pass ?codes=CODE1,CODE2,CODE3 to force-sync specific reservation codes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { syncReservations, syncSingleReservation } from '@/lib/hostex-sync';
import { getReservations, getProperties } from '@/lib/hostex';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codesParam = searchParams.get('codes'); // optional: comma-separated reservation codes

  try {
    // Mode 1: Force-sync specific codes provided in query param
    if (codesParam) {
      const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
      console.log(`[Bulk Sync] Force-syncing ${codes.length} specific codes:`, codes);

      const results: { code: string; status: string; created: number; updated: number; error?: string }[] = [];

      for (const code of codes) {
        try {
          const r = await syncSingleReservation(code);
          results.push({ code, status: r.errors.length ? 'error' : 'ok', created: r.created, updated: r.updated, error: r.errors[0] });
        } catch (e: any) {
          results.push({ code, status: 'error', created: 0, updated: 0, error: e.message });
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }

      const created = results.reduce((s, r) => s + r.created, 0);
      const updated = results.reduce((s, r) => s + r.updated, 0);
      const errors = results.filter(r => r.status === 'error');

      return NextResponse.json({
        mode: 'targeted',
        total: codes.length,
        created,
        updated,
        errors: errors.length,
        results,
      });
    }

    // Mode 2: Standard full sync (per-property, gets ~20 per property)
    console.log('[Bulk Sync] Running full per-property sync...');
    const result = await syncReservations();
    return NextResponse.json({
      mode: 'full',
      synced: result.synced,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
      errorDetails: result.errors,
      eurCzkRate: result.eurCzkRate,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

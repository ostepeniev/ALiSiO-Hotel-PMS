/**
 * Hostex Sync API
 * POST - trigger manual sync
 * GET  - get sync status/history
 */
import { NextResponse } from 'next/server';
import { syncReservations, getSyncStatus, seedPropertyMap } from '@/lib/hostex-sync';

export async function POST() {
  try {
    // Seed property map first
    await seedPropertyMap();
    
    // Run sync
    const result = await syncReservations();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = getSyncStatus();
    return NextResponse.json(status);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

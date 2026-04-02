import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/ical-sync/cron — auto-sync all channels past their interval.
 * Should be called by external cron every 5 minutes:
 *   curl -s https://your-domain/api/ical-sync/cron?secret=YOUR_SECRET
 */
export async function GET(request: Request) {
  try {
    // Simple secret check (use env var in production)
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.ICAL_CRON_SECRET || 'alisio-ical-sync';

    if (secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();

    // Find channels that need syncing:
    // last_synced_at IS NULL OR last_synced_at + interval < now
    const channels = db.prepare(`
      SELECT * FROM ical_channels
      WHERE is_active = 1
        AND ical_url IS NOT NULL
        AND (
          last_synced_at IS NULL
          OR datetime(last_synced_at, '+' || sync_interval_minutes || ' minutes') <= datetime('now')
        )
    `).all() as any[];

    if (channels.length === 0) {
      return NextResponse.json({ message: 'No channels need syncing', synced: 0 });
    }

    // Trigger sync for each channel via internal call
    const baseUrl = new URL(request.url).origin;
    const results: any[] = [];

    for (const channel of channels) {
      try {
        const res = await fetch(`${baseUrl}/api/ical-sync/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: channel.id }),
        });
        const data = await res.json();
        results.push(data);
      } catch (e: any) {
        results.push({ channel_id: channel.id, error: e.message });
      }
    }

    return NextResponse.json({
      message: `Synced ${channels.length} channel(s)`,
      synced: channels.length,
      results,
    });
  } catch (e: any) {
    console.error('[iCal Cron] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

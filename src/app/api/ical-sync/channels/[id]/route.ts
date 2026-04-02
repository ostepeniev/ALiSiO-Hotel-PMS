import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

// PUT /api/ical-sync/channels/[id] — update channel
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const { ical_url, source_code, sync_interval_minutes, is_active } = body;

    db.prepare(`
      UPDATE ical_channels SET
        ical_url = ?,
        source_code = ?,
        sync_interval_minutes = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      ical_url ?? existing.ical_url,
      source_code ?? existing.source_code,
      sync_interval_minutes ?? existing.sync_interval_minutes,
      is_active ?? existing.is_active,
      id
    );

    const updated = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/ical-sync/channels/[id] — delete channel and its log
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Delete sync logs first
    db.prepare('DELETE FROM ical_sync_log WHERE channel_id = ?').run(id);
    // Delete synced reservations (those with external_uid from this channel's source)
    // We keep reservations — they are real bookings. Just remove the channel config.
    db.prepare('DELETE FROM ical_channels WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

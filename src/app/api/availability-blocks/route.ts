/**
 * GET /api/availability-blocks
 * Returns all availability blocks (host closures, maintenance, etc.)
 * Used by the calendar to render blocked-date bars
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    // Check if table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='availability_blocks'"
    ).get();

    if (!tableExists) {
      return NextResponse.json([]);
    }

    const blocks = db.prepare(`
      SELECT id, unit_id, date_from, date_to, reason, notes, hostex_code, created_at
      FROM availability_blocks
      ORDER BY date_from ASC
    `).all();

    return NextResponse.json(blocks);
  } catch (e: any) {
    console.error('GET /api/availability-blocks error:', e.message);
    return NextResponse.json([]);
  }
}

export async function DELETE(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    db.prepare('DELETE FROM availability_blocks WHERE id = ?').run(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

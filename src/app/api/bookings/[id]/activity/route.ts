import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/bookings/[id]/activity — get activity log
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const rows = db.prepare(
      'SELECT * FROM booking_activity_log WHERE reservation_id = ? ORDER BY created_at DESC'
    ).all(id);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/bookings/[id]/activity — add activity entry
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();
    const logId = `al_${Date.now()}`;
    db.prepare(
      "INSERT INTO booking_activity_log (id, reservation_id, action, details) VALUES (?, ?, ?, ?)"
    ).run(logId, id, body.action || 'note', body.details || '');
    return NextResponse.json({ id: logId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

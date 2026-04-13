/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/guest/[token]/feedback — save guest feedback
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const { feedback } = await request.json();

    if (!feedback?.trim()) {
      return NextResponse.json({ error: 'Feedback is empty' }, { status: 400 });
    }

    // Find reservation
    const reservation = db.prepare(
      'SELECT id, guest_id FROM reservations WHERE guest_page_token = ?'
    ).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Save as activity log on the reservation
    db.prepare(`
      INSERT INTO reservation_activity (id, reservation_id, type, description, created_by, created_at)
      VALUES (lower(hex(randomblob(16))), ?, 'guest_feedback', ?, 'guest', datetime('now'))
    `).run(reservation.id, feedback.trim());

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/feedback error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}

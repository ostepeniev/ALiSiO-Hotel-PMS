/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/guest/[token]/register — submit guest registration data
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const body = await request.json();

    // Find reservation
    const reservation = db.prepare(
      'SELECT id FROM reservations WHERE guest_page_token = ?'
    ).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const { guests } = body;
    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 });
    }

    // Delete existing registered guests and re-insert
    db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservation.id);

    const insert = db.prepare(
      'INSERT INTO reservation_guests (reservation_id, first_name, last_name, date_of_birth, address) VALUES (?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction(() => {
      for (const guest of guests) {
        if (!guest.firstName || !guest.lastName) {
          throw new Error('firstName and lastName are required for each guest');
        }
        insert.run(
          reservation.id,
          guest.firstName,
          guest.lastName,
          guest.dateOfBirth || null,
          guest.address || null
        );
      }
    });

    insertMany();

    // Return updated list
    const registeredGuests = db.prepare(
      'SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at'
    ).all(reservation.id);

    return NextResponse.json({ success: true, registeredGuests });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/register error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to register guests' }, { status: 500 });
  }
}

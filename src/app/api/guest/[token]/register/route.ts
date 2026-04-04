/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/guest/[token]/register — submit guest registration data
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const body = await request.json();

    // Find reservation with organization_id
    const reservation = db.prepare(`
      SELECT r.id, r.guest_id as booking_guest_id, p.organization_id
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      WHERE r.guest_page_token = ?
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Rate limiting: max 3 registration saves per 5 minutes
    const rl = checkRateLimit(token, 'registration', 3, 5);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const { guests } = body;
    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 });
    }

    // Delete existing registered guests and re-insert
    db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservation.id);

    const insertRg = db.prepare(`
      INSERT INTO reservation_guests (reservation_id, first_name, last_name, date_of_birth, address, nationality, document_type, document_number, guest_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Helper: find or create a guest in the main guests table
    const findGuest = db.prepare(`
      SELECT id FROM guests
      WHERE organization_id = ? AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
      LIMIT 1
    `);

    const insertGuest = db.prepare(`
      INSERT INTO guests (organization_id, first_name, last_name, date_of_birth, country, address, document_type, document_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateGuest = db.prepare(`
      UPDATE guests SET
        date_of_birth = COALESCE(?, date_of_birth),
        country = COALESCE(?, country),
        address = COALESCE(?, address),
        document_type = COALESCE(?, document_type),
        document_number = COALESCE(?, document_number),
        updated_at = datetime('now')
      WHERE id = ?
    `);

    const insertMany = db.transaction(() => {
      for (const guest of guests) {
        if (!guest.firstName || !guest.lastName) {
          throw new Error('firstName and lastName are required for each guest');
        }

        // --- Link to guests table ---
        let guestId: string | null = null;

        // Try to find existing guest by name
        const existingGuest = findGuest.get(
          reservation.organization_id,
          guest.firstName,
          guest.lastName,
        ) as any;

        if (existingGuest) {
          guestId = existingGuest.id;
          // Update guest record with latest info (only if new values provided)
          updateGuest.run(
            guest.dateOfBirth || null,
            guest.nationality || null,
            guest.address || null,
            guest.documentType || null,
            guest.documentNumber || null,
            guestId,
          );
        } else {
          // Create new guest record
          const result = insertGuest.run(
            reservation.organization_id,
            guest.firstName,
            guest.lastName,
            guest.dateOfBirth || null,
            guest.nationality || null,
            guest.address || null,
            guest.documentType || null,
            guest.documentNumber || null,
          );
          // Get the auto-generated ID
          const newGuest = db.prepare(
            'SELECT id FROM guests WHERE rowid = ?'
          ).get(result.lastInsertRowid) as any;
          guestId = newGuest?.id || null;
        }

        // Insert into reservation_guests
        insertRg.run(
          reservation.id,
          guest.firstName,
          guest.lastName,
          guest.dateOfBirth || null,
          guest.address || null,
          guest.nationality || null,
          guest.documentType || null,
          guest.documentNumber || null,
          guestId,
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

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/guests — list all guests with aggregated reservation data
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const country = searchParams.get('country') || '';

    let query = `
      SELECT
        g.*,
        (SELECT COUNT(*) FROM reservations r WHERE r.guest_id = g.id) as total_stays,
        (SELECT SUM(r.total_price) FROM reservations r WHERE r.guest_id = g.id) as total_revenue,
        (SELECT MAX(r.check_in) FROM reservations r WHERE r.guest_id = g.id) as last_check_in,
        (SELECT r.status FROM reservations r WHERE r.guest_id = g.id ORDER BY r.check_in DESC LIMIT 1) as last_booking_status
      FROM guests g
      WHERE 1=1
    `;

    const params: string[] = [];

    if (search) {
      query += ` AND (
        g.first_name LIKE ? OR g.last_name LIKE ? OR
        (g.first_name || ' ' || g.last_name) LIKE ? OR
        g.email LIKE ? OR g.phone LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    if (country) {
      query += ' AND g.country = ?';
      params.push(country);
    }

    query += ' ORDER BY g.last_name, g.first_name';

    const rows = db.prepare(query).all(...params);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/guests error:', error);
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 });
  }
}

// POST /api/guests — create a new guest
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const {
      firstName, lastName, email, phone, country,
      city, address, documentType, documentNumber,
      dateOfBirth, notes,
    } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };
    const guestId = `g_${Date.now()}`;

    db.prepare(`
      INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, country, city, address, document_type, document_number, date_of_birth, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guestId, org.id, firstName, lastName,
      email || null, phone || null, country || null,
      city || null, address || null,
      documentType || null, documentNumber || null,
      dateOfBirth || null, notes || null,
    );

    return NextResponse.json({ id: guestId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/guests error:', error);
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@/lib/db';

// GET /api/bookings — list all reservations with guest + unit info
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const search = searchParams.get('search') || '';

    let query = `
      SELECT
        r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
        r.status, r.payment_status, r.source, r.total_price, r.notes, r.internal_notes, r.created_at, r.guest_page_token,
        r.group_id, r.commission_amount,
        r.city_tax_amount, r.city_tax_included, r.city_tax_paid,
        g.id as guest_id, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        u.id as unit_id, u.name as unit_name, u.code as unit_code,
        c.id as category_id, c.name as category_name, c.type as category_type,
        ut.id as unit_type_id, ut.name as unit_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE 1=1
    `;

    const params: string[] = [];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND c.type = ?';
      params.push(category);
    }

    if (search) {
      query += ` AND (
        g.first_name LIKE ? OR g.last_name LIKE ? OR
        (g.first_name || ' ' || g.last_name) LIKE ? OR
        u.name LIKE ? OR u.code LIKE ? OR r.id LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    const paymentStatus = searchParams.get('payment_status') || '';
    if (paymentStatus) {
      query += ' AND r.payment_status = ?';
      params.push(paymentStatus);
    }

    const dateFrom = searchParams.get('date_from') || '';
    if (dateFrom) {
      query += ' AND r.check_in >= ?';
      params.push(dateFrom);
    }

    const dateTo = searchParams.get('date_to') || '';
    if (dateTo) {
      query += ' AND r.check_in <= ?';
      params.push(dateTo);
    }

    const sourceFilter = searchParams.get('source') || '';
    if (sourceFilter) {
      query += ' AND r.source = ?';
      params.push(sourceFilter);
    }

    query += ' ORDER BY r.check_in ASC';

    const rows = db.prepare(query).all(...params);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/bookings error:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

// POST /api/bookings — create a new reservation (auto-creates guest if needed)
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const {
      firstName, lastName, email, phone,
      unitId, checkIn, checkOut, nights,
      adults, children, status, source, totalPrice,
      commissionAmount: commissionOverride,
      cityTaxAmount, cityTaxIncluded, cityTaxPaid,
      internalNotes,
    } = body;

    if (!firstName || !lastName || !unitId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the organization & property from the unit
    const unit = db.prepare('SELECT property_id, category_id FROM units WHERE id = ?').get(unitId) as { property_id: string; category_id: string } | undefined;
    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // Overbooking check — prevent double-booking the same unit for overlapping dates
    const overlap = db.prepare(`
      SELECT 1 FROM reservations
      WHERE unit_id = ? AND status NOT IN ('cancelled', 'no_show')
        AND check_in < ? AND check_out > ?
      LIMIT 1
    `).get(unitId, checkOut, checkIn);
    if (overlap) {
      return NextResponse.json({ error: 'This unit is already booked for the selected dates' }, { status: 409 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };

    // Check if guest exists by email or create new
    let guestId: string;
    if (email) {
      const existing = db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, org.id) as { id: string } | undefined;
      if (existing) {
        guestId = existing.id;
        // Update guest info
        db.prepare('UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime("now") WHERE id = ?')
          .run(firstName, lastName, phone || null, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)')
          .run(guestId, org.id, firstName, lastName, email, phone || null);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)')
        .run(guestId, org.id, firstName, lastName, phone || null);
    }

    // Create reservation — calculate OTA commission (use override if provided)
    const resId = `r_${Date.now()}`;
    let commissionAmount = 0;
    if (commissionOverride !== undefined && commissionOverride !== null) {
      commissionAmount = Number(commissionOverride);
    } else if (source) {
      const bsRow = db.prepare('SELECT commission_percent FROM booking_sources WHERE code = ?').get(source) as { commission_percent: number } | undefined;
      if (bsRow && bsRow.commission_percent > 0) {
        commissionAmount = Math.round((totalPrice || 0) * bsRow.commission_percent / 100);
      }
    }

    // City tax
    const finalCityTaxAmount = cityTaxAmount !== undefined ? Number(cityTaxAmount) : 0;
    const finalCityTaxIncluded = cityTaxIncluded ? 1 : 0;
    const finalCityTaxPaid = cityTaxPaid || 'pending';

    // Auto-generate guest page token for confirmed bookings
    const bookingStatus = status || 'confirmed';
    const guestPageToken = (bookingStatus === 'confirmed' || bookingStatus === 'checked_in') ? generateGuestToken() : null;

    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price, commission_amount, guest_page_token, city_tax_amount, city_tax_included, city_tax_paid, internal_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(resId, unit.property_id, unitId, guestId, checkIn, checkOut, nights || 1, adults || 1, children || 0, bookingStatus, body.paymentStatus || 'unpaid', source || 'direct', totalPrice || 0, commissionAmount, guestPageToken, finalCityTaxAmount, finalCityTaxIncluded, finalCityTaxPaid, internalNotes || null);

    return NextResponse.json({ id: resId, guestId, guestPageToken }, { status: 201 });
  } catch (error) {
    console.error('POST /api/bookings error:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}

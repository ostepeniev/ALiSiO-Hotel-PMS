import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/group-bookings — list all group bookings
export async function GET() {
  try {
    const db = getDb();
    const groups = db.prepare(`
      SELECT rg.*,
        g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        b.name as building_name, b.code as building_code,
        (SELECT COUNT(*) FROM reservations WHERE group_id = rg.id) as room_count
      FROM reservation_groups rg
      JOIN guests g ON rg.guest_id = g.id
      LEFT JOIN buildings b ON rg.building_id = b.id
      ORDER BY rg.created_at DESC
    `).all();
    return NextResponse.json(groups);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/group-bookings — create a group booking
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const {
      firstName, lastName, email, phone,
      groupType, buildingId, unitIds,
      checkIn, checkOut, totalPrice, source, notes,
    } = body;

    if (!firstName || !lastName || !checkIn || !checkOut) {
      return NextResponse.json({ error: "Обов'язкові поля: ім'я, прізвище, дати" }, { status: 400 });
    }

    // Determine unit IDs
    let finalUnitIds: string[] = unitIds || [];

    if (groupType === 'building' && buildingId) {
      // Get all units in the building
      const buildingUnits = db.prepare(
        'SELECT id FROM units WHERE building_id = ? AND is_active = 1 ORDER BY sort_order'
      ).all(buildingId) as { id: string }[];
      finalUnitIds = buildingUnits.map(u => u.id);
    }

    if (finalUnitIds.length === 0) {
      return NextResponse.json({ error: 'Не обрано жодної кімнати' }, { status: 400 });
    }

    // Calculate nights
    const nights = Math.max(1, Math.floor(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
    ));

    // Get org + property
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    const firstUnit = db.prepare('SELECT property_id FROM units WHERE id = ?').get(finalUnitIds[0]) as any;
    if (!firstUnit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 400 });
    }

    // Create or find guest
    let guestId: string;
    if (email) {
      const existing = db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, org.id) as any;
      if (existing) {
        guestId = existing.id;
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

    // Create group
    const groupId = `grp_${Date.now()}`;
    db.prepare(`
      INSERT INTO reservation_groups (id, property_id, guest_id, group_type, building_id, check_in, check_out, nights, total_price, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, firstUnit.property_id, guestId, groupType || 'custom', buildingId || null, checkIn, checkOut, nights, totalPrice || 0, source || 'direct', notes || null);

    // Create individual reservations for each unit
    const pricePerUnit = finalUnitIds.length > 0 ? Math.round((totalPrice || 0) / finalUnitIds.length) : 0;
    const insertRes = db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, group_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < finalUnitIds.length; i++) {
      const resId = `r_${Date.now()}_${i}`;
      insertRes.run(resId, firstUnit.property_id, finalUnitIds[i], guestId, groupId, checkIn, checkOut, nights, 1, 0, 'confirmed', 'unpaid', source || 'direct', pricePerUnit);
    }

    return NextResponse.json({ id: groupId, guestId, roomCount: finalUnitIds.length }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/group-bookings error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// CORS headers for cross-origin subdomain access
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preflight handler
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/booking/reserve — public endpoint to create a tentative booking
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const {
      unitId, checkIn, checkOut,
      adults = 2, children = 0,
      firstName, lastName, email, phone,
      promoCode, certificateCode,
    } = body;

    if (!unitId || !checkIn || !checkOut || !firstName || !lastName || !phone) {
      return NextResponse.json({
        error: 'unitId, checkIn, checkOut, firstName, lastName, phone are required',
      }, { status: 400, headers: CORS_HEADERS });
    }

    const ciDate = new Date(checkIn);
    const coDate = new Date(checkOut);
    if (coDate <= ciDate) {
      return NextResponse.json({ error: 'checkOut must be after checkIn' }, { status: 400, headers: CORS_HEADERS });
    }
    const nights = Math.round((coDate.getTime() - ciDate.getTime()) / 86400000);

    // Check which tables exist
    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );
    const hasAvailBlocks = existingTables.has('availability_blocks');
    const hasPromotions = existingTables.has('promotions');
    const hasPriceCalendar = existingTables.has('price_calendar');

    // Verify the unit exists and is available
    const unit = db.prepare(`
      SELECT u.id, u.name, u.code, u.property_id, u.unit_type_id
      FROM units u
      JOIN categories c ON u.category_id = c.id
      WHERE u.id = ? AND u.is_active = 1 AND u.room_status = 'available' AND c.type = 'glamping'
    `).get(unitId) as any;

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found or not available' }, { status: 404, headers: CORS_HEADERS });
    }

    // Check if unit is booked for the selected dates
    const isBooked = db.prepare(`
      SELECT 1 FROM reservations r
      WHERE r.unit_id = ?
        AND r.status NOT IN ('cancelled', 'no_show')
        AND r.check_in < ? AND r.check_out > ?
      LIMIT 1
    `).get(unitId, checkOut, checkIn);

    if (isBooked) {
      return NextResponse.json({ error: 'This unit is already booked for the selected dates' }, { status: 409, headers: CORS_HEADERS });
    }

    // Check availability_blocks
    if (hasAvailBlocks) {
      const isBlocked = db.prepare(`
        SELECT 1 FROM availability_blocks
        WHERE unit_id = ? AND date_from < ? AND date_to > ?
        LIMIT 1
      `).get(unitId, checkOut, checkIn);
      if (isBlocked) {
        return NextResponse.json({ error: 'This unit is blocked for the selected dates' }, { status: 409, headers: CORS_HEADERS });
      }
    }

    // Calculate total price (using unit_type_id for pricing)
    const STUB_PRICE = 2500;
    let prices: any[] = [];
    if (hasPriceCalendar) {
      prices = db.prepare(`
        SELECT pc.date, pc.base_price, pc.weekend_price
        FROM price_calendar pc
        WHERE pc.unit_type_id = ? AND pc.date >= ? AND pc.date < ?
        ORDER BY pc.date ASC
      `).all(unit.unit_type_id, checkIn, checkOut) as any[];
    }

    const priceMap = new Map<string, any>();
    for (const p of prices) priceMap.set(p.date, p);

    let totalPrice = 0;
    const current = new Date(ciDate);
    for (let i = 0; i < nights; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const priceEntry = priceMap.get(dateStr);
      let dayPrice = STUB_PRICE;
      if (priceEntry) {
        dayPrice = isWeekend && priceEntry.weekend_price != null
          ? priceEntry.weekend_price : priceEntry.base_price;
      }
      totalPrice += dayPrice;
      current.setDate(current.getDate() + 1);
    }

    // Apply promo code discount (only if table exists)
    let promoDiscount = 0;
    if (promoCode && hasPromotions) {
      const promo = db.prepare(`
        SELECT * FROM promotions
        WHERE promo_code = ? AND is_active = 1
          AND (date_from IS NULL OR date_from <= ?)
          AND (date_to IS NULL OR date_to >= ?)
          AND (usage_limit IS NULL OR usage_count < usage_limit)
      `).get(promoCode, checkOut, checkIn) as any;

      if (promo) {
        if (promo.discount_type === 'percentage') {
          promoDiscount = Math.round(totalPrice * promo.discount_value / 100);
        } else {
          promoDiscount = promo.discount_value;
        }
        db.prepare('UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ?').run(promo.id);
      }
    }

    // Certificate stub
    let certificateDiscount = 0;
    if (certificateCode) {
      certificateDiscount = 0;
    }

    const finalPrice = Math.max(0, totalPrice - promoDiscount - certificateDiscount);

    // Get organization
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };

    // Create or find guest
    let guestId: string;
    if (email) {
      const existing = db.prepare(
        'SELECT id FROM guests WHERE email = ? AND organization_id = ?'
      ).get(email, org.id) as { id: string } | undefined;

      if (existing) {
        guestId = existing.id;
        db.prepare(
          'UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime("now") WHERE id = ?'
        ).run(firstName, lastName, phone || null, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare(
          'INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(guestId, org.id, firstName, lastName, email, phone || null);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare(
        'INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(guestId, org.id, firstName, lastName, phone || null);
    }

    // Create reservation with status 'tentative'
    const resId = `r_${Date.now()}`;
    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resId, unit.property_id, unitId, guestId,
      checkIn, checkOut, nights, adults, children,
      'tentative', 'unpaid', 'direct', finalPrice,
    );

    return NextResponse.json({
      success: true,
      reservationId: resId,
      unitName: unit.name,
      checkIn,
      checkOut,
      nights,
      totalPrice: finalPrice,
      originalPrice: totalPrice,
      promoDiscount,
      certificateDiscount,
      currency: 'CZK',
    }, { status: 201, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('POST /api/booking/reserve error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500, headers: CORS_HEADERS });
  }
}

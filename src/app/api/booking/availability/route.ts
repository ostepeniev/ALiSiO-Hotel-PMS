/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// CORS headers for cross-origin subdomain access
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preflight handler
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/booking/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&promoCode=XXX&certificateCode=XXX
// Public endpoint — returns available individual glamping units with pricing
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const promoCode = searchParams.get('promoCode') || '';
    const certificateCode = searchParams.get('certificateCode') || '';

    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: 'checkIn and checkOut required' }, { status: 400, headers: CORS_HEADERS });
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

    // Get all individual glamping units with their type info
    const units = db.prepare(`
      SELECT u.id, u.name, u.code, u.beds, u.room_status, u.is_active,
             ut.id as unit_type_id, ut.name as type_name, ut.code as type_code,
             ut.description as type_description,
             ut.max_adults, ut.max_children, ut.max_occupancy,
             ut.base_occupancy, ut.beds_single, ut.beds_double, ut.beds_sofa,
             c.name as category_name, c.type as category_type
      FROM units u
      JOIN unit_types ut ON u.unit_type_id = ut.id
      JOIN categories c ON u.category_id = c.id
      WHERE c.type = 'glamping' AND u.is_active = 1 AND u.room_status = 'available'
      ORDER BY u.sort_order, u.name
    `).all() as any[];

    const results = [];

    for (const unit of units) {
      // Check if this specific unit is booked for the selected dates
      const isBooked = db.prepare(`
        SELECT 1 FROM reservations r
        WHERE r.unit_id = ?
          AND r.status NOT IN ('cancelled', 'no_show')
          AND r.check_in < ? AND r.check_out > ?
        LIMIT 1
      `).get(unit.id, checkOut, checkIn);

      if (isBooked) continue; // Skip booked units

      // Check availability_blocks (if table exists)
      if (hasAvailBlocks) {
        const isBlocked = db.prepare(`
          SELECT 1 FROM availability_blocks
          WHERE unit_id = ?
            AND date_from < ? AND date_to > ?
          LIMIT 1
        `).get(unit.id, checkOut, checkIn);
        if (isBlocked) continue; // Skip blocked units
      }

      // Get pricing from price_calendar (using unit_type_id, since prices are per type)
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

      // Calculate price breakdown
      const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const breakdown: { date: string; dayName: string; price: number; isWeekend: boolean }[] = [];
      let totalPrice = 0;
      let hasPricing = false;
      const STUB_PRICE = 2500; // Fallback CZK/night

      const current = new Date(ciDate);
      for (let i = 0; i < nights; i++) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
        const priceEntry = priceMap.get(dateStr);

        let dayPrice = STUB_PRICE;
        if (priceEntry) {
          dayPrice = isWeekend && priceEntry.weekend_price != null
            ? priceEntry.weekend_price
            : priceEntry.base_price;
          hasPricing = true;
        }

        breakdown.push({ date: dateStr, dayName: dayNames[dayOfWeek], price: dayPrice, isWeekend });
        totalPrice += dayPrice;
        current.setDate(current.getDate() + 1);
      }

      const avgPricePerNight = nights > 0 ? Math.round(totalPrice / nights) : 0;

      results.push({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        beds: unit.beds,
        unitTypeId: unit.unit_type_id,
        typeName: unit.type_name,
        typeCode: unit.type_code,
        description: unit.type_description,
        maxAdults: unit.max_adults,
        maxChildren: unit.max_children,
        maxOccupancy: unit.max_occupancy,
        baseOccupancy: unit.base_occupancy,
        bedsSingle: unit.beds_single,
        bedsDouble: unit.beds_double,
        bedsSofa: unit.beds_sofa,
        hasPricing,
        avgPricePerNight,
        totalPrice,
        breakdown,
        currency: 'CZK',
      });
    }

    // Handle promo code (only if promotions table exists)
    let promoDiscount: { name: string; discountType: string; discountValue: number; finalDiscount: number } | null = null;
    if (promoCode && hasPromotions) {
      const promo = db.prepare(`
        SELECT * FROM promotions
        WHERE promo_code = ? AND is_active = 1
          AND (date_from IS NULL OR date_from <= ?)
          AND (date_to IS NULL OR date_to >= ?)
          AND (usage_limit IS NULL OR usage_count < usage_limit)
      `).get(promoCode, checkOut, checkIn) as any;

      if (promo) {
        promoDiscount = {
          name: promo.name,
          discountType: promo.discount_type,
          discountValue: promo.discount_value,
          finalDiscount: 0,
        };
      }
    }

    // Handle certificate code (stub)
    let certificate: { code: string; amount: number } | null = null;
    if (certificateCode) {
      certificate = { code: certificateCode, amount: 0 };
    }

    return NextResponse.json({
      checkIn,
      checkOut,
      nights,
      units: results,
      promoDiscount,
      certificate,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/availability error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500, headers: CORS_HEADERS });
  }
}

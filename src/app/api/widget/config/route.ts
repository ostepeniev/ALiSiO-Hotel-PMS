/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// CORS headers for cross-origin widget access
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/widget/config?propertyId=...
 * 
 * Public endpoint — returns widget configuration:
 * - Property info (name, currency, check-in/check-out times)
 * - Glamping unit types list
 * - Nearest available 2-night window with pre-calculated price
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    // If no propertyId, use the first (and likely only) property
    let property: any;
    if (propertyId) {
      property = db.prepare('SELECT * FROM properties WHERE id = ? AND is_active = 1').get(propertyId);
    } else {
      property = db.prepare('SELECT * FROM properties WHERE is_active = 1 LIMIT 1').get();
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404, headers: CORS_HEADERS });
    }

    // Get glamping unit types for this property
    const unitTypes = db.prepare(`
      SELECT ut.id, ut.name, ut.code, ut.description, 
             ut.max_adults, ut.max_children, ut.max_occupancy, ut.base_occupancy,
             ut.beds_single, ut.beds_double, ut.beds_sofa
      FROM unit_types ut
      JOIN categories c ON ut.category_id = c.id
      WHERE c.type = 'glamping' AND ut.is_active = 1 AND ut.property_id = ?
      ORDER BY ut.sort_order
    `).all(property.id) as any[];

    // Find nearest available 2-night window (scan next 60 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let defaultCheckIn: string | null = null;
    let defaultCheckOut: string | null = null;
    let defaultPrice = 0;
    let defaultUnitTypeId: string | null = null;

    // Check which tables exist
    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );
    const hasAvailBlocks = existingTables.has('availability_blocks');

    for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
      const ci = new Date(today);
      ci.setDate(ci.getDate() + dayOffset);
      const co = new Date(ci);
      co.setDate(co.getDate() + 2);

      const ciStr = ci.toISOString().split('T')[0];
      const coStr = co.toISOString().split('T')[0];

      // For each unit type, check if at least one unit is free for this 2-night window
      for (const ut of unitTypes) {
        const allUnits = db.prepare(`
          SELECT u.id FROM units u
          WHERE u.unit_type_id = ? AND u.is_active = 1 AND u.room_status = 'available'
        `).all(ut.id) as any[];

        const bookedUnitIds = db.prepare(`
          SELECT DISTINCT r.unit_id FROM reservations r
          JOIN units u ON r.unit_id = u.id
          WHERE u.unit_type_id = ?
            AND r.status NOT IN ('cancelled', 'no_show')
            AND r.check_in < ? AND r.check_out > ?
        `).all(ut.id, coStr, ciStr) as any[];

        const bookedIds = new Set(bookedUnitIds.map((r: any) => r.unit_id));

        if (hasAvailBlocks) {
          const blockedUnitIds = db.prepare(`
            SELECT DISTINCT ab.unit_id FROM availability_blocks ab
            JOIN units u ON ab.unit_id = u.id
            WHERE u.unit_type_id = ?
              AND ab.date_from < ? AND ab.date_to > ?
          `).all(ut.id, coStr, ciStr) as any[];
          for (const b of blockedUnitIds) bookedIds.add(b.unit_id);
        }

        const hasAvailable = allUnits.some((u: any) => !bookedIds.has(u.id));
        if (hasAvailable) {
          defaultCheckIn = ciStr;
          defaultCheckOut = coStr;
          defaultUnitTypeId = ut.id;

          // Calculate price for this window
          const hasPriceCalendar = existingTables.has('price_calendar');
          const STUB_PRICE = 2500;
          let total = 0;

          if (hasPriceCalendar) {
            try {
              const prices = db.prepare(`
                SELECT pc.date, pc.base_price, pc.weekend_price
                FROM price_calendar pc
                WHERE pc.unit_type_id = ? AND pc.date >= ? AND pc.date < ?
                ORDER BY pc.date ASC
              `).all(ut.id, ciStr, coStr) as any[];

              const priceMap = new Map<string, any>();
              for (const p of prices) priceMap.set(p.date, p);

              const current = new Date(ci);
              for (let i = 0; i < 2; i++) {
                const dateStr = current.toISOString().split('T')[0];
                const dayOfWeek = current.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
                const priceEntry = priceMap.get(dateStr);
                let dayPrice = STUB_PRICE;
                if (priceEntry) {
                  dayPrice = isWeekend && priceEntry.weekend_price != null
                    ? priceEntry.weekend_price : priceEntry.base_price;
                }
                total += dayPrice;
                current.setDate(current.getDate() + 1);
              }
            } catch { total = STUB_PRICE * 2; }
          } else {
            total = STUB_PRICE * 2;
          }
          defaultPrice = total;
          break;
        }
      }
      if (defaultCheckIn) break;
    }

    return NextResponse.json({
      property: {
        id: property.id,
        name: property.name,
        checkInTime: property.check_in_time,
        checkOutTime: property.check_out_time,
        currency: property.default_currency || 'CZK',
      },
      unitTypes: unitTypes.map((ut: any) => ({
        id: ut.id,
        name: ut.name,
        code: ut.code,
        description: ut.description,
        maxAdults: ut.max_adults,
        maxChildren: ut.max_children,
        maxOccupancy: ut.max_occupancy,
        bedsDouble: ut.beds_double,
        bedsSingle: ut.beds_single,
      })),
      defaults: {
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        totalPrice: defaultPrice,
        unitTypeId: defaultUnitTypeId,
        nights: 2,
      },
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/widget/config error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to load widget config' }, { status: 500, headers: CORS_HEADERS });
  }
}

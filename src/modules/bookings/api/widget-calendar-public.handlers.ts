/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function getWidgetCalendarOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function getWidgetCalendar(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const unitId = searchParams.get('unitId');
    const monthParam = searchParams.get('month');

    let property: any;
    let targetUnitId = unitId;

    if (unitId) {
      const unit = db.prepare('SELECT property_id FROM units WHERE id = ?').get(unitId) as any;
      if (unit) {
        property = { id: unit.property_id };
      }
    }

    if (!property) {
      if (propertyId) {
        property = db.prepare('SELECT id FROM properties WHERE id = ? AND is_active = 1').get(propertyId);
      } else {
        property = db.prepare('SELECT id FROM properties WHERE is_active = 1 LIMIT 1').get();
      }
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404, headers: CORS_HEADERS });
    }

    let year: number, month: number;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const parts = monthParam.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const nextMonthStart = new Date(year, month + 1, 1).toISOString().split('T')[0];

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );
    const hasAvailBlocks = existingTables.has('availability_blocks');

    const unitTypes = db.prepare(`
      SELECT ut.id FROM unit_types ut
      JOIN categories c ON ut.category_id = c.id
      WHERE c.type = 'glamping' AND ut.is_active = 1 AND ut.property_id = ?
    `).all(property.id) as any[];

    const totalUnits = db.prepare(`
      SELECT COUNT(*) as cnt FROM units u
      JOIN unit_types ut ON u.unit_type_id = ut.id
      JOIN categories c ON ut.category_id = c.id
      WHERE c.type = 'glamping' AND u.is_active = 1 AND u.room_status = 'available' AND ut.property_id = ?
        ${targetUnitId ? 'AND u.id = ?' : ''}
    `).get(...(targetUnitId ? [property.id, targetUnitId] : [property.id])) as any;
    const totalCount = totalUnits?.cnt || 0;

    const reservations = db.prepare(`
      SELECT r.unit_id, r.check_in, r.check_out FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      JOIN categories c ON ut.category_id = c.id
      WHERE c.type = 'glamping' AND ut.property_id = ?
        AND r.status NOT IN ('cancelled', 'no_show')
        AND r.check_in < ? AND r.check_out > ?
        ${targetUnitId ? 'AND r.unit_id = ?' : ''}
    `).all(...(targetUnitId ? [property.id, nextMonthStart, monthStart, targetUnitId] : [property.id, nextMonthStart, monthStart])) as any[];

    let blocks: any[] = [];
    if (hasAvailBlocks) {
      blocks = db.prepare(`
        SELECT ab.unit_id, ab.date_from, ab.date_to FROM availability_blocks ab
        JOIN units u ON ab.unit_id = u.id
        JOIN unit_types ut ON u.unit_type_id = ut.id
        JOIN categories c ON ut.category_id = c.id
        WHERE c.type = 'glamping' AND ut.property_id = ?
          AND ab.date_from < ? AND ab.date_to > ?
          ${targetUnitId ? 'AND ab.unit_id = ?' : ''}
      `).all(...(targetUnitId ? [property.id, nextMonthStart, monthStart, targetUnitId] : [property.id, nextMonthStart, monthStart])) as any[];
    }

    const hasPriceCalendar = existingTables.has('price_calendar');
    const priceMap = new Map<string, any>();

    if (hasPriceCalendar && unitTypes.length > 0) {
      try {
        const priceRows = db.prepare(`
          SELECT pc.date, MIN(pc.base_price) as min_price, MIN(pc.weekend_price) as min_weekend_price
          FROM price_calendar pc
          WHERE pc.unit_type_id IN (${unitTypes.map(() => '?').join(',')})
            AND pc.date >= ? AND pc.date <= ?
          GROUP BY pc.date
        `).all(...unitTypes.map((ut: any) => ut.id), monthStart, monthEnd) as any[];

        for (const p of priceRows) priceMap.set(p.date, p);
      } catch { /* price_calendar not available */ }
    }

    const days: { date: string; status: 'available' | 'booked' | 'partial'; price: number | null }[] = [];
    const STUB_PRICE = 2500;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(year, month, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

      const bookedUnitIds = new Set<string>();

      for (const r of reservations) {
        if (dateStr >= r.check_in && dateStr < r.check_out) {
          bookedUnitIds.add(r.unit_id);
        }
      }

      for (const b of blocks) {
        if (dateStr >= b.date_from && dateStr < b.date_to) {
          bookedUnitIds.add(b.unit_id);
        }
      }

      const bookedCount = bookedUnitIds.size;
      const availableCount = totalCount - bookedCount;

      let status: 'available' | 'booked' | 'partial';
      if (availableCount <= 0) {
        status = 'booked';
      } else if (bookedCount > 0) {
        status = 'partial';
      } else {
        status = 'available';
      }

      const priceEntry = priceMap.get(dateStr);
      let price: number | null = null;
      if (priceEntry) {
        price = isWeekend && priceEntry.min_weekend_price != null
          ? priceEntry.min_weekend_price : priceEntry.min_price;
      } else if (unitTypes.length > 0) {
        price = STUB_PRICE;
      }

      days.push({ date: dateStr, status, price });
    }

    return NextResponse.json({ year, month: month + 1, days }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/widget/calendar error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500, headers: CORS_HEADERS });
  }
}

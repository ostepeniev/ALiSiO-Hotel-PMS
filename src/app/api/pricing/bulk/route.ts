/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// PUT /api/pricing/bulk — bulk set prices for a date range
// Body: {
//   unitTypeId, dateFrom, dateTo,
//   base_price?, weekend_price?, min_stay?,
//   closed?, cta?, ctd?,
//   applyTo: 'all' | 'weekdays' | 'weekends'
// }
export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { unitTypeId, dateFrom, dateTo, applyTo = 'all' } = body;

    if (!unitTypeId || !dateFrom || !dateTo) {
      return NextResponse.json({ error: 'unitTypeId, dateFrom, dateTo required' }, { status: 400 });
    }

    // Standard upsert for each date (with merge of existing values)
    const simpleUpsert = db.prepare(`
      INSERT INTO price_calendar (id, unit_type_id, date, base_price, weekend_price, min_stay, max_stay, closed, cta, ctd)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(unit_type_id, date) DO UPDATE SET
        base_price = excluded.base_price,
        weekend_price = excluded.weekend_price,
        min_stay = excluded.min_stay,
        max_stay = excluded.max_stay,
        closed = excluded.closed,
        cta = excluded.cta,
        ctd = excluded.ctd,
        updated_at = datetime('now')
    `);

    // For partial updates, we read existing first
    const getExisting = db.prepare(`
      SELECT * FROM price_calendar WHERE unit_type_id = ? AND date = ?
    `);

    let count = 0;
    const start = new Date(dateFrom);
    const end = new Date(dateTo);

    const tx = db.transaction(() => {
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

        // Skip based on applyTo filter
        if (applyTo === 'weekdays' && isWeekend) { current.setDate(current.getDate() + 1); continue; }
        if (applyTo === 'weekends' && !isWeekend) { current.setDate(current.getDate() + 1); continue; }

        // Read existing values to merge
        const existing = getExisting.get(unitTypeId, dateStr) as any;

        const basePrice = body.base_price ?? existing?.base_price ?? 0;
        const weekendPrice = body.weekend_price !== undefined ? body.weekend_price : (existing?.weekend_price ?? null);
        const minStay = body.min_stay ?? existing?.min_stay ?? 1;
        const maxStay = body.max_stay !== undefined ? body.max_stay : (existing?.max_stay ?? null);
        const closed = body.closed !== undefined ? (body.closed ? 1 : 0) : (existing?.closed ?? 0);
        const cta = body.cta !== undefined ? (body.cta ? 1 : 0) : (existing?.cta ?? 0);
        const ctd = body.ctd !== undefined ? (body.ctd ? 1 : 0) : (existing?.ctd ?? 0);

        simpleUpsert.run(unitTypeId, dateStr, basePrice, weekendPrice, minStay, maxStay, closed, cta, ctd);
        count++;
        current.setDate(current.getDate() + 1);
      }
    });

    tx();

    return NextResponse.json({ success: true, updated: count });
  } catch (error: any) {
    console.error('PUT /api/pricing/bulk error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to bulk update pricing' }, { status: 500 });
  }
}

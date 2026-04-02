/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/pricing?unitTypeId=X&month=3&year=2026
// Returns price data for a month for a specific unit type
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const unitTypeId = searchParams.get('unitTypeId');
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

    if (!unitTypeId) {
      return NextResponse.json({ error: 'unitTypeId is required' }, { status: 400 });
    }

    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const rows = db.prepare(`
      SELECT * FROM price_calendar
      WHERE unit_type_id = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(unitTypeId, startDate, endDate);

    // Build a full month array (in case some days don't have prices yet)
    const priceMap = new Map<string, any>();
    for (const row of rows as any[]) {
      priceMap.set(row.date, row);
    }

    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri, Sat, Sun
      const existing = priceMap.get(dateStr);

      if (existing) {
        days.push({
          date: dateStr,
          day: d,
          dayOfWeek,
          isWeekend,
          base_price: existing.base_price,
          weekend_price: existing.weekend_price,
          effective_price: isWeekend && existing.weekend_price != null ? existing.weekend_price : existing.base_price,
          min_stay: existing.min_stay,
          max_stay: existing.max_stay,
          closed: existing.closed,
          cta: existing.cta,
          ctd: existing.ctd,
          hasData: true,
        });
      } else {
        days.push({
          date: dateStr,
          day: d,
          dayOfWeek,
          isWeekend,
          base_price: 0,
          weekend_price: null,
          effective_price: 0,
          min_stay: 1,
          max_stay: null,
          closed: 0,
          cta: 0,
          ctd: 0,
          hasData: false,
        });
      }
    }

    return NextResponse.json({ unitTypeId, month, year, days });
  } catch (error: any) {
    console.error('GET /api/pricing error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch pricing' }, { status: 500 });
  }
}

// PUT /api/pricing — upsert single day or multiple days
// Body: { unitTypeId, prices: [{ date, base_price, weekend_price?, min_stay?, max_stay?, closed?, cta?, ctd? }] }
export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { unitTypeId, prices } = body;

    if (!unitTypeId || !Array.isArray(prices) || prices.length === 0) {
      return NextResponse.json({ error: 'unitTypeId and prices array required' }, { status: 400 });
    }

    const upsert = db.prepare(`
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

    const tx = db.transaction(() => {
      for (const p of prices) {
        upsert.run(
          unitTypeId,
          p.date,
          p.base_price ?? 0,
          p.weekend_price ?? null,
          p.min_stay ?? 1,
          p.max_stay ?? null,
          p.closed ? 1 : 0,
          p.cta ? 1 : 0,
          p.ctd ? 1 : 0,
        );
      }
    });

    tx();

    // Trigger ARI sync to push updated rates to connected channels
    try {
      const { enqueueForAllConnections } = await import('@/lib/channels/sync-queue');
      const dates = prices.map((p: any) => p.date).sort();
      if (dates.length > 0) {
        enqueueForAllConnections({
          syncType: 'full',
          unitTypeId,
          dateFrom: dates[0],
          dateTo: dates[dates.length - 1],
          priority: 3,
        });
      }
    } catch (syncError: any) {
      // Non-critical: don't fail the pricing update if sync enqueue fails
      console.warn('[Pricing] ARI sync enqueue failed:', syncError?.message);
    }

    return NextResponse.json({ success: true, updated: prices.length });
  } catch (error: any) {
    console.error('PUT /api/pricing error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to update pricing' }, { status: 500 });
  }
}

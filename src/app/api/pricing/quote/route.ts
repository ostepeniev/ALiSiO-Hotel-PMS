/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/pricing/quote — calculate quote for a stay
// Body: { unitTypeId, checkIn, checkOut, adults?, children? }
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { unitTypeId, checkIn, checkOut, adults = 2, children = 0 } = body;

    if (!unitTypeId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'unitTypeId, checkIn, checkOut required' }, { status: 400 });
    }

    // Get price calendar entries for the date range
    const prices = db.prepare(`
      SELECT * FROM price_calendar
      WHERE unit_type_id = ? AND date >= ? AND date < ?
      ORDER BY date ASC
    `).all(unitTypeId, checkIn, checkOut) as any[];

    const priceMap = new Map<string, any>();
    for (const p of prices) {
      priceMap.set(p.date, p);
    }

    // Calculate nights and breakdown
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nightsTotal = Math.round((end.getTime() - start.getTime()) / 86400000);

    if (nightsTotal <= 0) {
      return NextResponse.json({ error: 'checkOut must be after checkIn' }, { status: 400 });
    }

    const breakdown: { date: string; dayName: string; price: number; isWeekend: boolean }[] = [];
    let accommodationTotal = 0;
    let missingDays = 0;

    const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const current = new Date(start);

    for (let i = 0; i < nightsTotal; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

      const priceEntry = priceMap.get(dateStr);
      let dayPrice = 0;

      if (priceEntry) {
        dayPrice = isWeekend && priceEntry.weekend_price != null
          ? priceEntry.weekend_price
          : priceEntry.base_price;
      } else {
        missingDays++;
      }

      breakdown.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        price: dayPrice,
        isWeekend,
      });

      accommodationTotal += dayPrice;
      current.setDate(current.getDate() + 1);
    }

    // Get fees & taxes from the property (table may not exist yet)
    let fees: any[] = [];
    try {
      const propRow = db.prepare('SELECT id FROM properties LIMIT 1').get() as any;
      if (propRow) {
        fees = db.prepare('SELECT * FROM fees_taxes WHERE property_id = ? AND is_active = 1').all(propRow.id) as any[];
      }
    } catch { /* fees_taxes table doesn't exist yet, skip */ }

    const feeBreakdown: { name: string; amount: number }[] = [];
    let feesTotal = 0;
    const totalGuests = adults + children;

    for (const fee of fees) {
      let amount = 0;
      switch (fee.type) {
        case 'per_stay':
          amount = fee.amount;
          break;
        case 'per_night':
          amount = fee.amount * nightsTotal;
          break;
        case 'per_person':
          amount = fee.amount * totalGuests;
          break;
        case 'per_person_per_night':
          amount = fee.amount * adults * nightsTotal; // typically tourist tax is per adult
          break;
        case 'percentage':
          amount = Math.round(accommodationTotal * fee.amount / 100);
          break;
      }
      if (amount > 0) {
        feeBreakdown.push({ name: fee.name, amount });
        feesTotal += amount;
      }
    }

    return NextResponse.json({
      unitTypeId,
      checkIn,
      checkOut,
      nights: nightsTotal,
      adults,
      children,
      breakdown,
      accommodationTotal,
      feeBreakdown,
      feesTotal,
      total: accommodationTotal + feesTotal,
      currency: 'CZK',
      missingDays,
      hasPricing: missingDays < nightsTotal,
    });
  } catch (error: any) {
    console.error('POST /api/pricing/quote error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to calculate quote' }, { status: 500 });
  }
}

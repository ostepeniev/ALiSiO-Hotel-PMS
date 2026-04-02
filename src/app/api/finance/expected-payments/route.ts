/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from') || new Date().toISOString().substring(0, 10);
    const toDate = searchParams.get('to') || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().substring(0, 10);
    })();

    // All active bookings that are not fully paid
    const bookings = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
             r.status, r.payment_status, r.total_price, r.source, r.currency,
             r.commission_amount,
             g.first_name, g.last_name, g.email,
             u.name as unit_name,
             c.type as category_type, c.name as category_name,
             COALESCE(bs.name, r.source) as source_name,
             COALESCE(bs.commission_percent, 0) as commission_percent,
             COALESCE((SELECT SUM(p.amount) FROM payments p 
                       WHERE p.reservation_id = r.id AND p.status = 'completed' AND p.type != 'refund'), 0) as paid_amount,
             COALESCE((SELECT SUM(p.amount) FROM payments p 
                       WHERE p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'refund'), 0) as refunded_amount
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      LEFT JOIN booking_sources bs ON r.source = bs.code
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative')
        AND r.payment_status != 'paid'
        AND r.check_in >= ?
        AND r.check_in <= ?
      ORDER BY r.check_in ASC
    `).all(fromDate, toDate) as any[];

    // Process bookings and calculate gaps
    const items = bookings.map(b => {
      const netPaid = b.paid_amount - b.refunded_amount;
      const outstanding = b.total_price - netPaid;
      const daysUntilCheckIn = Math.ceil(
        (new Date(b.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      let urgency: 'overdue' | 'urgent' | 'soon' | 'upcoming' = 'upcoming';
      if (daysUntilCheckIn < 0) urgency = 'overdue';
      else if (daysUntilCheckIn <= 3) urgency = 'urgent';
      else if (daysUntilCheckIn <= 14) urgency = 'soon';

      return {
        ...b,
        guest_name: `${b.first_name} ${b.last_name}`,
        net_paid: netPaid,
        outstanding,
        days_until: daysUntilCheckIn,
        urgency,
      };
    }).filter(b => b.outstanding > 0);

    // Summary by urgency
    const summary = {
      total_expected: items.reduce((s, b) => s + b.outstanding, 0),
      total_bookings: items.length,
      overdue: items.filter(b => b.urgency === 'overdue').reduce((s, b) => s + b.outstanding, 0),
      overdue_count: items.filter(b => b.urgency === 'overdue').length,
      urgent: items.filter(b => b.urgency === 'urgent').reduce((s, b) => s + b.outstanding, 0),
      urgent_count: items.filter(b => b.urgency === 'urgent').length,
      soon: items.filter(b => b.urgency === 'soon').reduce((s, b) => s + b.outstanding, 0),
      soon_count: items.filter(b => b.urgency === 'soon').length,
      upcoming: items.filter(b => b.urgency === 'upcoming').reduce((s, b) => s + b.outstanding, 0),
      upcoming_count: items.filter(b => b.urgency === 'upcoming').length,
    };

    // Timeline — group by week
    const timeline: { week: string; amount: number; count: number }[] = [];
    const weekMap = new Map<string, { amount: number; count: number }>();
    for (const b of items) {
      const d = new Date(b.check_in);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1); // Monday
      const key = weekStart.toISOString().substring(0, 10);
      const existing = weekMap.get(key) || { amount: 0, count: 0 };
      existing.amount += b.outstanding;
      existing.count += 1;
      weekMap.set(key, existing);
    }
    for (const [week, data] of weekMap) {
      timeline.push({ week, ...data });
    }
    timeline.sort((a, b) => a.week.localeCompare(b.week));

    // By category
    const byCategory: Record<string, { name: string; amount: number; count: number }> = {};
    for (const b of items) {
      const key = b.category_type;
      if (!byCategory[key]) byCategory[key] = { name: b.category_name, amount: 0, count: 0 };
      byCategory[key].amount += b.outstanding;
      byCategory[key].count += 1;
    }

    return NextResponse.json({
      items,
      summary,
      timeline,
      byCategory: Object.values(byCategory),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

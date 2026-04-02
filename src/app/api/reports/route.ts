import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || new Date().toISOString().split('T')[0];
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0];

    // 1. Bookings in range (check_in within [from, to])
    const bookings = db.prepare(`
      SELECT r.*, u.name as unit_name, c.type as category_type,
             g.first_name, g.last_name
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.check_in BETWEEN ? AND ?
        AND r.status != 'cancelled'
    `).all(from, to) as any[];

    const totalBookings = bookings.length;
    const totalGuests = bookings.reduce((s: number, b: any) => s + b.adults + b.children, 0);
    const totalRevenue = bookings.reduce((s: number, b: any) => s + (b.total_price || 0), 0);

    // Revenue by category
    const revenueByCategory: Record<string, { bookings: number; revenue: number; nights: number }> = {};
    for (const b of bookings) {
      const cat = b.category_type || 'other';
      if (!revenueByCategory[cat]) revenueByCategory[cat] = { bookings: 0, revenue: 0, nights: 0 };
      revenueByCategory[cat].bookings++;
      revenueByCategory[cat].revenue += b.total_price || 0;
      revenueByCategory[cat].nights += b.nights || 0;
    }

    // Commission & revenue by source
    const totalCommission = bookings.reduce((s: number, b: any) => s + (b.commission_amount || 0), 0);
    const netRevenue = totalRevenue - totalCommission;

    const revenueBySource: Record<string, { bookings: number; revenue: number; commission: number }> = {};
    for (const b of bookings) {
      const src = b.source || 'direct';
      if (!revenueBySource[src]) revenueBySource[src] = { bookings: 0, revenue: 0, commission: 0 };
      revenueBySource[src].bookings++;
      revenueBySource[src].revenue += b.total_price || 0;
      revenueBySource[src].commission += b.commission_amount || 0;
    }

    // 2. Payments in range (paid_at within [from, to])
    const payments = db.prepare(`
      SELECT * FROM payments
      WHERE paid_at BETWEEN ? AND ?
        AND status = 'completed'
    `).all(from, to) as any[];

    const totalPayments = payments.reduce((s: number, p: any) => s + p.amount, 0);

    // Payments by method
    const paymentsByMethod: Record<string, number> = {};
    for (const p of payments) {
      paymentsByMethod[p.method] = (paymentsByMethod[p.method] || 0) + p.amount;
    }

    // 3. Occupancy: count unit-nights booked vs available
    const totalUnits = (db.prepare('SELECT COUNT(*) as cnt FROM units').get() as any).cnt;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const totalDays = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
    const totalUnitDays = totalUnits * totalDays;

    // Count booked unit-days (how many units are occupied each day in range)
    let bookedUnitDays = 0;
    const allBookings = db.prepare(`
      SELECT unit_id, check_in, check_out FROM reservations
      WHERE check_out > ? AND check_in <= ?
        AND status NOT IN ('cancelled', 'draft')
    `).all(from, to) as any[];

    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const occupiedUnits = new Set(
        allBookings.filter((b: any) => dateStr >= b.check_in && dateStr < b.check_out).map((b: any) => b.unit_id)
      );
      bookedUnitDays += occupiedUnits.size;
    }

    const occupancyPct = totalUnitDays > 0 ? Math.round((bookedUnitDays / totalUnitDays) * 100) : 0;

    // 4. Average check
    const avgCheck = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

    return NextResponse.json({
      period: { from, to, days: totalDays },
      summary: {
        totalBookings,
        totalGuests,
        totalRevenue,
        totalCommission,
        netRevenue,
        totalPayments,
        occupancyPct,
        avgCheck,
      },
      revenueByCategory,
      revenueBySource,
      paymentsByMethod,
    });
  } catch (error) {
    console.error('GET /api/reports error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

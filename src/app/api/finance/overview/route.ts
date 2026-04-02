/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    // Revenue from payments (completed)
    const revenueRow = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END), 0) as total
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE p.status = 'completed' AND strftime('%Y-%m', p.paid_at) = ?
    `).get(month) as any;

    // Total expenses (negative amounts in expenses table)
    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(e.amount)), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.month = ? AND ec.std_group IN ('COGS', 'OPEX', 'Taxes') AND ec.include_in_pnl = 1
    `).get(month) as any;

    // CAPEX spend
    const capexRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(e.amount)), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.month = ? AND ec.is_capex = 1
    `).get(month) as any;

    const revenue = revenueRow.total;
    const expenses = expenseRow.total;

    // Pending accruals (add to expense awareness)
    const pendingAccruals = db.prepare(`
      SELECT COALESCE(SUM(ABS(a.amount)), 0) as total, COUNT(*) as cnt
      FROM accruals a
      WHERE a.month = ? AND a.status = 'pending'
    `).get(month) as any;

    // Monthly CAPEX depreciation
    const depRow = db.prepare(`
      SELECT COALESCE(SUM(depreciation_monthly), 0) as total
      FROM capex_items WHERE status = 'active' AND depreciation_monthly > 0
    `).get() as any;

    const ebitda = revenue - expenses - pendingAccruals.total;
    const margin = revenue > 0 ? ((ebitda / revenue) * 100) : 0;

    // Revenue by month (last 6 months)
    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    const monthlyData = months.map(m => {
      const rev = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END), 0) as total
        FROM payments p WHERE p.status = 'completed' AND strftime('%Y-%m', p.paid_at) = ?
      `).get(m) as any;
      const exp = db.prepare(`
        SELECT COALESCE(SUM(ABS(e.amount)), 0) as total
        FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.month = ? AND ec.std_group IN ('COGS', 'OPEX', 'Taxes') AND ec.include_in_pnl = 1
      `).get(m) as any;
      return { month: m, revenue: rev.total, expenses: exp.total, ebitda: rev.total - exp.total };
    });

    // Breakdown by BU
    const buBreakdown = db.prepare(`
      SELECT bu.id, bu.name,
             COALESCE(SUM(CASE WHEN ec.std_group = 'Revenue' THEN e.amount ELSE 0 END), 0) as revenue,
             COALESCE(SUM(CASE WHEN ec.std_group IN ('COGS', 'OPEX', 'Taxes') THEN ABS(e.amount) ELSE 0 END), 0) as expenses,
             COALESCE(SUM(CASE WHEN ec.is_capex = 1 THEN ABS(e.amount) ELSE 0 END), 0) as capex
      FROM business_units bu
      LEFT JOIN expenses e ON e.business_unit_id = bu.id AND e.month = ?
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE bu.is_active = 1 AND bu.is_shared = 0
      GROUP BY bu.id
      ORDER BY bu.sort_order
    `).all(month);

    // Alerts  
    const reviewRows = db.prepare(`SELECT COUNT(*) as cnt FROM expenses WHERE needs_review = 1`).get() as any;
    const noProjectRows = db.prepare(`SELECT COUNT(*) as cnt FROM expenses WHERE business_unit_id IS NULL`).get() as any;
    const totalExpRows = db.prepare(`SELECT COUNT(*) as cnt FROM expenses`).get() as any;

    // Expected payments from unpaid bookings
    const expectedRow = db.prepare(`
      SELECT COALESCE(SUM(r.total_price - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'completed' AND p.type != 'refund'), 0)), 0) as total,
             COUNT(*) as cnt
      FROM reservations r
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative') AND r.payment_status != 'paid'
        AND r.total_price > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'completed' AND p.type != 'refund'), 0)
    `).get() as any;

    const alerts = [
      { metric: 'Транзакцій без BU', value: noProjectRows.cnt, threshold: totalExpRows.cnt * 0.03, status: noProjectRows.cnt > totalExpRows.cnt * 0.03 ? 'RED' : 'GREEN' },
      { metric: 'На перегляд', value: reviewRows.cnt, threshold: 10, status: reviewRows.cnt > 10 ? 'YELLOW' : 'GREEN' },
      { metric: 'Pending accruals', value: pendingAccruals.cnt, threshold: 0, status: pendingAccruals.cnt > 0 ? 'YELLOW' : 'GREEN' },
      { metric: 'Неоплачені бронювання', value: expectedRow.cnt, threshold: 0, status: expectedRow.cnt > 0 ? 'YELLOW' : 'GREEN' },
    ];

    // Recent transactions
    const recent = db.prepare(`
      SELECT e.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
             bu.name as bu_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT 10
    `).all();

    return NextResponse.json({
      month,
      kpi: { revenue, expenses: expenses + pendingAccruals.total, ebitda, margin: Math.round(margin * 10) / 10, capex: capexRow.total, depreciation: depRow.total, pendingAccruals: pendingAccruals.total, expectedPayments: expectedRow.total },
      monthlyData,
      buBreakdown,
      alerts,
      recentTransactions: recent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    // Generate last 6 months
    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    // Cash inflows (payments received)
    const inflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END), 0) as total
        FROM payments p
        WHERE p.status = 'completed' AND strftime('%Y-%m', p.paid_at) = ?
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    // Cash outflows (expenses with include_in_cash = 1)
    const outflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(ABS(e.amount)), 0) as total
        FROM expenses e
        JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.month = ? AND ec.include_in_cash = 1
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    // Inflows by source for selected month
    const inflowsBySource = db.prepare(`
      SELECT p.method, COUNT(*) as count, SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END) as total
      FROM payments p
      WHERE p.status = 'completed' AND strftime('%Y-%m', p.paid_at) = ?
      GROUP BY p.method
    `).all(month) as any[];

    // Outflows by category for selected month
    const outflowsByCategory = db.prepare(`
      SELECT ec.name, ec.icon, ec.color, COALESCE(SUM(ABS(e.amount)), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.month = ? AND ec.include_in_cash = 1
      GROUP BY ec.id
      ORDER BY total DESC
    `).all(month) as any[];

    // Outflows by BU for selected month
    const outflowsByBU = db.prepare(`
      SELECT bu.name, COALESCE(SUM(ABS(e.amount)), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      WHERE e.month = ? AND ec.include_in_cash = 1
      GROUP BY e.business_unit_id
      ORDER BY total DESC
    `).all(month) as any[];

    // Current month totals
    const currentInflow = inflows.find(i => i.month === month)?.amount || 0;
    const currentOutflow = outflows.find(o => o.month === month)?.amount || 0;
    const netCashFlow = currentInflow - currentOutflow;

    return NextResponse.json({
      month,
      kpi: {
        inflows: currentInflow,
        outflows: currentOutflow,
        netCashFlow,
      },
      monthlyData: months.map((m, i) => ({
        month: m,
        inflows: inflows[i].amount,
        outflows: outflows[i].amount,
        net: inflows[i].amount - outflows[i].amount,
      })),
      inflowsBySource,
      outflowsByCategory,
      outflowsByBU,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

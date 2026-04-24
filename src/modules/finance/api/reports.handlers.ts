/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

// Helpers: SQL fragments that filter fin_operations by semantic slice.
// A "payment" operation = income or refund tied to a reservation (source IN ('booking_widget','teia','hostex','manual') with reservation_id).
// A "regular expense" = op_type='expense' without payment_subtype (not a refund).

function monthRevenueSql(month: string, db: any): number {
  // Net revenue from reservation-linked operations (income minus refunds) for a given month
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN op_type = 'income' THEN amount
           WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN -amount
           ELSE 0 END
    ), 0) AS total
    FROM fin_operations
    WHERE reservation_id IS NOT NULL AND status = 'completed'
      AND strftime('%Y-%m', paid_at) = ?
  `).get(month) as { total: number };
  return row.total;
}

function monthExpensesSql(month: string, db: any, includeRefunds = false): number {
  // P&L expenses (COGS+OPEX+Taxes) — excluding reservation-linked refund ops and CAPEX
  const row = db.prepare(`
    SELECT COALESCE(SUM(o.amount), 0) AS total
    FROM fin_operations o
    LEFT JOIN expense_categories ec ON ec.id = o.category_id
    WHERE o.op_type = 'expense'
      AND strftime('%Y-%m', o.paid_at) = ?
      AND (o.reservation_id IS NULL ${includeRefunds ? 'OR o.payment_subtype = \'refund\'' : ''})
      AND (ec.std_group IN ('COGS', 'OPEX', 'Taxes') AND ec.include_in_pnl = 1)
  `).get(month) as { total: number };
  return row.total;
}

export async function getFinanceOverview(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const revenue = monthRevenueSql(month, db);
    const expenses = monthExpensesSql(month, db);

    const capexRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM capex_items WHERE month = ?`).get(month) as any;
    const pendingAccruals = db.prepare(`
      SELECT COALESCE(SUM(ABS(a.amount)), 0) as total, COUNT(*) as cnt
      FROM accruals a WHERE a.month = ? AND a.status = 'pending'
    `).get(month) as any;
    const depRow = db.prepare(`
      SELECT COALESCE(SUM(depreciation_monthly), 0) as total
      FROM capex_items WHERE status = 'active' AND depreciation_monthly > 0
    `).get() as any;

    const ebitda = revenue - expenses - pendingAccruals.total;
    const margin = revenue > 0 ? ((ebitda / revenue) * 100) : 0;

    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    const monthlyData = months.map(m => {
      const rev = monthRevenueSql(m, db);
      const exp = monthExpensesSql(m, db);
      return { month: m, revenue: rev, expenses: exp, ebitda: rev - exp };
    });

    const buBreakdown = db.prepare(`
      SELECT bu.id, bu.name,
             COALESCE(SUM(CASE WHEN o.op_type = 'income' THEN o.amount ELSE 0 END), 0) as revenue,
             COALESCE(SUM(CASE WHEN o.op_type = 'expense' AND (ec.std_group IN ('COGS','OPEX','Taxes')) THEN o.amount ELSE 0 END), 0) as expenses,
             COALESCE(SUM(CASE WHEN o.op_type = 'expense' AND ec.is_capex = 1 THEN o.amount ELSE 0 END), 0) as capex
      FROM business_units bu
      LEFT JOIN fin_operations o ON o.project_id = bu.id AND strftime('%Y-%m', o.paid_at) = ? AND o.status = 'completed'
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE bu.is_active = 1 AND bu.is_shared = 0
      GROUP BY bu.id ORDER BY bu.sort_order
    `).all(month) as any[];

    const buAccruals = db.prepare(`
      SELECT a.business_unit_id, COALESCE(SUM(ABS(a.amount)), 0) as total
      FROM accruals a WHERE a.month = ? AND a.status IN ('pending', 'paid') GROUP BY a.business_unit_id
    `).all(month) as any[];
    for (const acc of buAccruals) {
      const bu = buBreakdown.find((b: any) => b.id === acc.business_unit_id);
      if (bu) bu.expenses += acc.total;
    }

    const noProjectRows = db.prepare(`
      SELECT COUNT(*) as cnt FROM fin_operations
      WHERE op_type = 'expense' AND project_id IS NULL AND reservation_id IS NULL
    `).get() as any;
    const totalExpRows = db.prepare(`
      SELECT COUNT(*) as cnt FROM fin_operations WHERE op_type = 'expense' AND reservation_id IS NULL
    `).get() as any;

    // Expected payments (unpaid confirmed reservations)
    const expectedRow = db.prepare(`
      SELECT COALESCE(SUM(
        r.total_price
        - COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0)
        + COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0)
      ), 0) as total,
      COUNT(*) as cnt
      FROM reservations r
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative') AND r.payment_status != 'paid'
        AND r.total_price > (
          COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0)
          - COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0)
        )
    `).get() as any;

    const alerts = [
      { metric: 'Транзакцій без BU', value: noProjectRows.cnt, threshold: Math.max(1, totalExpRows.cnt * 0.03), status: noProjectRows.cnt > totalExpRows.cnt * 0.03 ? 'RED' : 'GREEN' },
      { metric: 'Pending accruals', value: pendingAccruals.cnt, threshold: 0, status: pendingAccruals.cnt > 0 ? 'YELLOW' : 'GREEN' },
      { metric: 'Неоплачені бронювання', value: expectedRow.cnt, threshold: 0, status: expectedRow.cnt > 0 ? 'YELLOW' : 'GREEN' },
    ];

    const recent = db.prepare(`
      SELECT o.*,
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
             bu.name as bu_name
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON o.category_id = ec.id
      LEFT JOIN business_units bu ON o.project_id = bu.id
      WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
      ORDER BY o.paid_at DESC, o.created_at DESC LIMIT 10
    `).all();

    return NextResponse.json({
      month,
      kpi: {
        revenue,
        expenses: expenses + pendingAccruals.total,
        ebitda, margin: Math.round(margin * 10) / 10,
        capex: capexRow.total, depreciation: depRow.total,
        pendingAccruals: pendingAccruals.total, expectedPayments: expectedRow.total,
      },
      monthlyData, buBreakdown, alerts, recentTransactions: recent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const PNL_LINES = [
  { section: 'Revenue', line: 'Проживання', type: 'direct', key: 'Проживання' },
  { section: 'Revenue', line: 'Сауна', type: 'direct', key: 'Сауна' },
  { section: 'Revenue', line: 'Ресторан', type: 'direct', key: 'Ресторан' },
  { section: 'Revenue', line: 'Сніданки', type: 'direct', key: 'Сніданки' },
  { section: 'Revenue', line: 'Інші доходи', type: 'direct', key: 'Інші доходи' },
  { section: 'Revenue', line: 'Всього виручка', type: 'total_revenue', key: '' },
  { section: 'Variable', line: 'Продукти', type: 'direct', key: 'Продукти' },
  { section: 'Variable', line: 'Харчування', type: 'direct', key: 'Харчування' },
  { section: 'Variable', line: 'Змінні витрати', type: 'direct', key: 'Змінні витрати' },
  { section: 'Variable', line: 'Всього змінні витрати', type: 'total_variable', key: '' },
  { section: 'Margin', line: 'Валовий прибуток', type: 'gross_profit', key: '' },
  { section: 'OPEX direct', line: 'Зарплати (direct)', type: 'direct', key: 'Зарплати' },
  { section: 'OPEX direct', line: 'Маркетинг (direct)', type: 'direct', key: 'Маркетинг' },
  { section: 'OPEX direct', line: 'Оренда (direct)', type: 'direct', key: 'Оренда' },
  { section: 'OPEX direct', line: 'Комунальні (direct)', type: 'direct', key: 'Комунальні' },
  { section: 'OPEX direct', line: 'Профпослуги (direct)', type: 'direct', key: 'Профпослуги' },
  { section: 'OPEX direct', line: 'Інші витрати (direct)', type: 'direct', key: 'Інші витрати' },
  { section: 'OPEX direct', line: 'Розхідники (direct)', type: 'direct', key: 'Розхідники' },
  { section: 'OPEX alloc', line: 'Алокація оренди', type: 'alloc', key: 'RENT' },
  { section: 'OPEX alloc', line: 'Алокація комунальних', type: 'alloc', key: 'UTILITIES' },
  { section: 'OPEX alloc', line: 'Алокація shared payroll', type: 'alloc', key: 'SHARED_PAYROLL' },
  { section: 'OPEX alloc', line: 'Алокація HQ/загальних', type: 'alloc', key: 'HQ' },
  { section: 'Result', line: 'EBITDA', type: 'ebitda', key: '' },
  { section: 'Taxes', line: 'Податки', type: 'direct', key: 'Податки' },
  { section: 'Result', line: 'Net result', type: 'net', key: '' },
  { section: 'CAPEX', line: 'CAPEX spend', type: 'capex', key: '' },
  { section: 'CAPEX', line: 'Амортизація', type: 'depreciation', key: '' },
];

export async function getPnl(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const bus = db.prepare(`
      SELECT id, name FROM business_units
      WHERE is_active = 1 AND is_shared = 0 AND name != 'На перегляд'
      ORDER BY sort_order
    `).all() as any[];

    // Revenue by BU via reservation → unit → category mapping
    const revByBUunit = db.prepare(`
      SELECT c.type as category_type,
             COALESCE(SUM(
               CASE WHEN o.op_type = 'income' THEN o.amount
                    WHEN o.op_type = 'expense' AND o.payment_subtype = 'refund' THEN -o.amount
                    ELSE 0 END
             ), 0) as total
      FROM fin_operations o
      JOIN reservations r ON o.reservation_id = r.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE o.status = 'completed' AND strftime('%Y-%m', o.paid_at) = ? AND COALESCE(o.payment_subtype,'') != 'service'
      GROUP BY c.type
    `).all(month) as any[];

    const revByBU: Record<string, number> = {};
    for (const row of revByBUunit) {
      if (row.category_type === 'glamping') revByBU['bu_glamping'] = row.total;
      else if (row.category_type === 'resort') revByBU['bu_budova_fd'] = row.total;
      else if (row.category_type === 'camping') revByBU['bu_camping'] = row.total;
    }

    // Service revenue (payment_subtype = 'service')
    const servicePayments = db.prepare(`
      SELECT o.amount, o.comment FROM fin_operations o
      WHERE o.status = 'completed' AND o.payment_subtype = 'service' AND strftime('%Y-%m', o.paid_at) = ?
    `).all(month) as any[];

    const serviceRevenue: Record<string, number> = {};
    for (const sp of servicePayments) {
      const notes = (sp.comment || '').toLowerCase();
      let pnlLine = 'Інші доходи';
      if (notes.includes('sauna') || notes.includes('svc_sauna') || notes.includes('сауна')) pnlLine = 'Сауна';
      else if (notes.includes('breakfast') || notes.includes('svc_breakfast') || notes.includes('сніданок')) pnlLine = 'Сніданки';
      else if (notes.includes('restaurant') || notes.includes('ресторан') || notes.includes('menu')) pnlLine = 'Ресторан';
      serviceRevenue[pnlLine] = (serviceRevenue[pnlLine] || 0) + sp.amount;
    }

    // Expenses grouped by pnl_line × project_id (using fin_operations)
    const expByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, o.project_id AS business_unit_id, SUM(o.amount) as total
      FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
        AND strftime('%Y-%m', o.paid_at) = ?
      GROUP BY ec.pnl_line, o.project_id
    `).all(month) as any[];

    const accrualsByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, a.business_unit_id, SUM(a.amount) as total
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.status IN ('pending', 'paid') GROUP BY ec.pnl_line, a.business_unit_id
    `).all(month) as any[];

    for (const acc of accrualsByLineAndBU) {
      const existing = expByLineAndBU.find((e: any) => e.pnl_line === acc.pnl_line && e.business_unit_id === acc.business_unit_id);
      if (existing) existing.total += acc.total;
      else expByLineAndBU.push(acc);
    }

    const sharedByAllocMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(o.amount) as total
      FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
        AND strftime('%Y-%m', o.paid_at) = ? AND o.project_id = 'bu_shared'
        AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    const sharedAccrualsByMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(a.amount) as total
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.business_unit_id = 'bu_shared' AND a.status IN ('pending', 'paid')
            AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    for (const acc of sharedAccrualsByMethod) {
      const existing = sharedByAllocMethod.find((s: any) => s.alloc_method === acc.alloc_method);
      if (existing) existing.total += acc.total;
      else sharedByAllocMethod.push(acc);
    }

    const allocRules = db.prepare(`
      SELECT alloc_method, business_unit_id, percentage FROM cost_allocations
      WHERE month = ? OR month = (SELECT MAX(month) FROM cost_allocations WHERE month <= ?)
    `).all(month, month) as any[];

    const allocMap: Record<string, Record<string, number>> = {};
    for (const rule of allocRules) {
      if (!allocMap[rule.alloc_method]) allocMap[rule.alloc_method] = {};
      allocMap[rule.alloc_method][rule.business_unit_id] = rule.percentage / 100;
    }

    const rows = PNL_LINES.map(line => {
      const buValues: Record<string, number> = {};
      let total = 0;

      if (line.type === 'direct' && line.section === 'Revenue') {
        for (const bu of bus) {
          let val = line.key === 'Проживання' ? (revByBU[bu.id] || 0) : 0;
          if (serviceRevenue[line.key] && bu === bus[0]) val += serviceRevenue[line.key];
          const expMatch = expByLineAndBU.find((e: any) => e.pnl_line === line.key && e.business_unit_id === bu.id);
          if (expMatch) val += expMatch.total;
          buValues[bu.id] = val;
          total += val;
        }
      } else if (line.type === 'direct' && (line.section === 'Variable' || line.section === 'OPEX direct' || line.section === 'Taxes')) {
        for (const bu of bus) {
          const expMatch = expByLineAndBU.find((e: any) => e.pnl_line === line.key && e.business_unit_id === bu.id);
          buValues[bu.id] = expMatch ? -expMatch.total : 0;
          total += buValues[bu.id];
        }
      } else if (line.type === 'alloc') {
        const sharedTotal = sharedByAllocMethod.find((s: any) => s.alloc_method === line.key)?.total || 0;
        for (const bu of bus) {
          const pct = allocMap[line.key]?.[bu.id] || 0;
          buValues[bu.id] = -Math.round(sharedTotal * pct);
          total += buValues[bu.id];
        }
      } else if (line.type === 'capex') {
        for (const bu of bus) {
          const capex = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM capex_items WHERE month = ? AND business_unit_id = ?`).get(month, bu.id) as any;
          buValues[bu.id] = -(capex.total);
          total += buValues[bu.id];
        }
      } else if (line.type === 'depreciation') {
        for (const bu of bus) {
          const dep = db.prepare(`SELECT COALESCE(SUM(depreciation_monthly), 0) as total FROM capex_items WHERE status = 'active' AND depreciation_monthly > 0 AND business_unit_id = ?`).get(bu.id) as any;
          buValues[bu.id] = -(dep.total);
          total += buValues[bu.id];
        }
      } else {
        for (const bu of bus) buValues[bu.id] = 0;
      }

      return { ...line, buValues, total };
    });

    const getRowTotal = (key: string, buId: string): number => rows.find(r => r.key === key && r.type === 'direct')?.buValues[buId] || 0;

    const trRow = rows.find(r => r.type === 'total_revenue');
    if (trRow) {
      for (const bu of bus) {
        trRow.buValues[bu.id] = ['Проживання', 'Сауна', 'Ресторан', 'Сніданки', 'Інші доходи'].reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        trRow.total += trRow.buValues[bu.id];
      }
    }

    const tvRow = rows.find(r => r.type === 'total_variable');
    if (tvRow) {
      for (const bu of bus) {
        tvRow.buValues[bu.id] = ['Продукти', 'Харчування', 'Змінні витрати'].reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        tvRow.total += tvRow.buValues[bu.id];
      }
    }

    const gpRow = rows.find(r => r.type === 'gross_profit');
    if (gpRow && trRow && tvRow) {
      for (const bu of bus) {
        gpRow.buValues[bu.id] = (trRow.buValues[bu.id] || 0) + (tvRow.buValues[bu.id] || 0);
        gpRow.total += gpRow.buValues[bu.id];
      }
    }

    const ebitdaRow = rows.find(r => r.type === 'ebitda');
    if (ebitdaRow && gpRow) {
      const opexRows = rows.filter(r => r.section === 'OPEX direct' || r.section === 'OPEX alloc');
      for (const bu of bus) {
        const totalOpex = opexRows.reduce((sum, r) => sum + (r.buValues[bu.id] || 0), 0);
        ebitdaRow.buValues[bu.id] = (gpRow.buValues[bu.id] || 0) + totalOpex;
        ebitdaRow.total += ebitdaRow.buValues[bu.id];
      }
    }

    const netRow = rows.find(r => r.type === 'net');
    if (netRow && ebitdaRow) {
      const taxRow = rows.find(r => r.key === 'Податки');
      for (const bu of bus) {
        netRow.buValues[bu.id] = (ebitdaRow.buValues[bu.id] || 0) + (taxRow?.buValues[bu.id] || 0);
        netRow.total += netRow.buValues[bu.id];
      }
    }

    return NextResponse.json({ month, businessUnits: bus, rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getCashflow(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    const inflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN op_type = 'income' THEN amount
               WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN -amount
               ELSE 0 END
        ), 0) as total
        FROM fin_operations
        WHERE reservation_id IS NOT NULL AND status = 'completed'
          AND strftime('%Y-%m', paid_at) = ?
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    const outflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(o.amount), 0) as total
        FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
        WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
          AND strftime('%Y-%m', o.paid_at) = ? AND ec.include_in_cash = 1
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    const inflowsBySource = db.prepare(`
      SELECT o.method, COUNT(*) as count,
             SUM(CASE WHEN op_type = 'income' THEN amount
                      WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN -amount
                      ELSE 0 END) as total
      FROM fin_operations o
      WHERE o.reservation_id IS NOT NULL AND o.status = 'completed'
        AND strftime('%Y-%m', o.paid_at) = ?
      GROUP BY o.method
    `).all(month) as any[];

    const outflowsByCategory = db.prepare(`
      SELECT ec.name, ec.icon, ec.color, COALESCE(SUM(o.amount), 0) as total
      FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
        AND strftime('%Y-%m', o.paid_at) = ? AND ec.include_in_cash = 1
      GROUP BY ec.id ORDER BY total DESC
    `).all(month) as any[];

    const outflowsByBU = db.prepare(`
      SELECT bu.name, COALESCE(SUM(o.amount), 0) as total
      FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
      LEFT JOIN business_units bu ON o.project_id = bu.id
      WHERE o.op_type = 'expense' AND o.reservation_id IS NULL
        AND strftime('%Y-%m', o.paid_at) = ? AND ec.include_in_cash = 1
      GROUP BY o.project_id ORDER BY total DESC
    `).all(month) as any[];

    const currentInflow = inflows.find(i => i.month === month)?.amount || 0;
    const currentOutflow = outflows.find(o => o.month === month)?.amount || 0;

    return NextResponse.json({
      month,
      kpi: { inflows: currentInflow, outflows: currentOutflow, netCashFlow: currentInflow - currentOutflow },
      monthlyData: months.map((m, i) => ({ month: m, inflows: inflows[i].amount, outflows: outflows[i].amount, net: inflows[i].amount - outflows[i].amount })),
      inflowsBySource, outflowsByCategory, outflowsByBU,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getExpectedPayments(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from') || new Date().toISOString().substring(0, 10);
    const toDate = searchParams.get('to') || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().substring(0, 10);
    })();

    const bookings = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
             r.status, r.payment_status, r.total_price, r.source, r.currency, r.commission_amount,
             g.first_name, g.last_name, g.email,
             u.name as unit_name, c.type as category_type, c.name as category_name,
             COALESCE(bs.name, r.source) as source_name, COALESCE(bs.commission_percent, 0) as commission_percent,
             COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0) as paid_amount,
             COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0) as refunded_amount
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id JOIN units u ON r.unit_id = u.id JOIN categories c ON u.category_id = c.id
      LEFT JOIN booking_sources bs ON r.source = bs.code
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative') AND r.payment_status != 'paid'
        AND r.check_in >= ? AND r.check_in <= ?
      ORDER BY r.check_in ASC
    `).all(fromDate, toDate) as any[];

    const items = bookings.map(b => {
      const netPaid = b.paid_amount - b.refunded_amount;
      const outstanding = b.total_price - netPaid;
      const daysUntilCheckIn = Math.ceil((new Date(b.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let urgency: 'overdue' | 'urgent' | 'soon' | 'upcoming' = 'upcoming';
      if (daysUntilCheckIn < 0) urgency = 'overdue';
      else if (daysUntilCheckIn <= 3) urgency = 'urgent';
      else if (daysUntilCheckIn <= 14) urgency = 'soon';
      return { ...b, guest_name: `${b.first_name} ${b.last_name}`, net_paid: netPaid, outstanding, days_until: daysUntilCheckIn, urgency };
    }).filter(b => b.outstanding > 0);

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

    const weekMap = new Map<string, { amount: number; count: number }>();
    for (const b of items) {
      const d = new Date(b.check_in);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().substring(0, 10);
      const existing = weekMap.get(key) || { amount: 0, count: 0 };
      existing.amount += b.outstanding; existing.count += 1;
      weekMap.set(key, existing);
    }
    const timeline = [...weekMap.entries()].map(([week, data]) => ({ week, ...data })).sort((a, b) => a.week.localeCompare(b.week));

    const byCategory: Record<string, { name: string; amount: number; count: number }> = {};
    for (const b of items) {
      if (!byCategory[b.category_type]) byCategory[b.category_type] = { name: b.category_name, amount: 0, count: 0 };
      byCategory[b.category_type].amount += b.outstanding;
      byCategory[b.category_type].count += 1;
    }

    return NextResponse.json({ items, summary, timeline, byCategory: Object.values(byCategory) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

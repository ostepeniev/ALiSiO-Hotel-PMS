/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// P&L structure matching Google Sheets PnL tab
const PNL_LINES = [
  // Revenue
  { section: 'Revenue', line: 'Проживання', type: 'direct', key: 'Проживання' },
  { section: 'Revenue', line: 'Сауна', type: 'direct', key: 'Сауна' },
  { section: 'Revenue', line: 'Ресторан', type: 'direct', key: 'Ресторан' },
  { section: 'Revenue', line: 'Сніданки', type: 'direct', key: 'Сніданки' },
  { section: 'Revenue', line: 'Інші доходи', type: 'direct', key: 'Інші доходи' },
  { section: 'Revenue', line: 'Всього виручка', type: 'total_revenue', key: '' },
  // Variable (COGS)
  { section: 'Variable', line: 'Продукти', type: 'direct', key: 'Продукти' },
  { section: 'Variable', line: 'Харчування', type: 'direct', key: 'Харчування' },
  { section: 'Variable', line: 'Змінні витрати', type: 'direct', key: 'Змінні витрати' },
  { section: 'Variable', line: 'Всього змінні витрати', type: 'total_variable', key: '' },
  // Margin
  { section: 'Margin', line: 'Валовий прибуток', type: 'gross_profit', key: '' },
  // OPEX direct
  { section: 'OPEX direct', line: 'Зарплати (direct)', type: 'direct', key: 'Зарплати' },
  { section: 'OPEX direct', line: 'Маркетинг (direct)', type: 'direct', key: 'Маркетинг' },
  { section: 'OPEX direct', line: 'Оренда (direct)', type: 'direct', key: 'Оренда' },
  { section: 'OPEX direct', line: 'Комунальні (direct)', type: 'direct', key: 'Комунальні' },
  { section: 'OPEX direct', line: 'Профпослуги (direct)', type: 'direct', key: 'Профпослуги' },
  { section: 'OPEX direct', line: 'Інші витрати (direct)', type: 'direct', key: 'Інші витрати' },
  { section: 'OPEX direct', line: 'Розхідники (direct)', type: 'direct', key: 'Розхідники' },
  // OPEX alloc
  { section: 'OPEX alloc', line: 'Алокація оренди', type: 'alloc', key: 'RENT' },
  { section: 'OPEX alloc', line: 'Алокація комунальних', type: 'alloc', key: 'UTILITIES' },
  { section: 'OPEX alloc', line: 'Алокація shared payroll', type: 'alloc', key: 'SHARED_PAYROLL' },
  { section: 'OPEX alloc', line: 'Алокація HQ/загальних', type: 'alloc', key: 'HQ' },
  // Result
  { section: 'Result', line: 'EBITDA', type: 'ebitda', key: '' },
  // Taxes
  { section: 'Taxes', line: 'Податки', type: 'direct', key: 'Податки' },
  // Net
  { section: 'Result', line: 'Net result', type: 'net', key: '' },
  // CAPEX
  { section: 'CAPEX', line: 'CAPEX spend', type: 'capex', key: '' },
  { section: 'CAPEX', line: 'Амортизація', type: 'depreciation', key: '' },
];

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    // Get business units
    const bus = db.prepare(`
      SELECT id, name FROM business_units 
      WHERE is_active = 1 AND is_shared = 0 AND name != 'На перегляд'
      ORDER BY sort_order
    `).all() as any[];

    // Get revenue from payments broken down by property category → BU mapping
    // For now, map categories to BUs: glamping → bu_glamping, resort → bu_budova_fd, camping → bu_camping
    const paymentsByCategory = db.prepare(`
      SELECT c.type as category_type,
             COALESCE(SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END), 0) as total
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE p.status = 'completed' AND strftime('%Y-%m', p.paid_at) = ?
      GROUP BY c.type
    `).all(month) as any[];

    const revByBU: Record<string, number> = {};
    for (const row of paymentsByCategory) {
      if (row.category_type === 'glamping') revByBU['bu_glamping'] = row.total;
      else if (row.category_type === 'resort') revByBU['bu_budova_fd'] = row.total;
      else if (row.category_type === 'camping') revByBU['bu_camping'] = row.total;
    }

    // Get expense amounts by pnl_line and BU
    const expByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, e.business_unit_id, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.month = ?
      GROUP BY ec.pnl_line, e.business_unit_id
    `).all(month) as any[];

    // Get accruals by pnl_line and BU (pending + paid accruals contribute to P&L)
    const accrualsByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, a.business_unit_id, SUM(a.amount) as total
      FROM accruals a
      LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.status IN ('pending', 'paid')
      GROUP BY ec.pnl_line, a.business_unit_id
    `).all(month) as any[];

    // Merge accruals into expense data
    for (const acc of accrualsByLineAndBU) {
      const existing = expByLineAndBU.find(
        (e: any) => e.pnl_line === acc.pnl_line && e.business_unit_id === acc.business_unit_id
      );
      if (existing) {
        existing.total += acc.total;
      } else {
        expByLineAndBU.push(acc);
      }
    }

    // Get shared expenses (where BU = bu_shared) for allocation
    const sharedByAllocMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.month = ? AND e.business_unit_id = 'bu_shared' 
            AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    // Also include shared accruals in allocation
    const sharedAccrualsByMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(a.amount) as total
      FROM accruals a
      LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.business_unit_id = 'bu_shared'
            AND a.status IN ('pending', 'paid')
            AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    for (const acc of sharedAccrualsByMethod) {
      const existing = sharedByAllocMethod.find((s: any) => s.alloc_method === acc.alloc_method);
      if (existing) {
        existing.total += acc.total;
      } else {
        sharedByAllocMethod.push(acc);
      }
    }

    // Get allocation percentages
    const allocRules = db.prepare(`
      SELECT alloc_method, business_unit_id, percentage
      FROM cost_allocations
      WHERE month = ? OR month = (SELECT MAX(month) FROM cost_allocations WHERE month <= ?)
    `).all(month, month) as any[];

    // Build allocation lookup
    const allocMap: Record<string, Record<string, number>> = {};
    for (const rule of allocRules) {
      if (!allocMap[rule.alloc_method]) allocMap[rule.alloc_method] = {};
      allocMap[rule.alloc_method][rule.business_unit_id] = rule.percentage / 100;
    }

    // Build P&L rows
    const rows = PNL_LINES.map(line => {
      const buValues: Record<string, number> = {};
      let total = 0;

      if (line.type === 'direct' && line.section === 'Revenue') {
        // Revenue: from payments + expense entries with Revenue group
        for (const bu of bus) {
          let val = 0;
          // Check if this pnl_line is "Проживання" — use payment data
          if (line.key === 'Проживання') {
            val = revByBU[bu.id] || 0;
          }
          // Also add any direct revenue expense entries
          const expMatch = expByLineAndBU.find(e => e.pnl_line === line.key && e.business_unit_id === bu.id);
          if (expMatch) val += expMatch.total;
          buValues[bu.id] = val;
          total += val;
        }
      } else if (line.type === 'direct' && (line.section === 'Variable' || line.section === 'OPEX direct' || line.section === 'Taxes')) {
        for (const bu of bus) {
          const expMatch = expByLineAndBU.find(e => e.pnl_line === line.key && e.business_unit_id === bu.id);
          buValues[bu.id] = expMatch ? expMatch.total : 0;
          total += buValues[bu.id];
        }
      } else if (line.type === 'alloc') {
        // Allocate shared costs
        const sharedTotal = sharedByAllocMethod.find(s => s.alloc_method === line.key)?.total || 0;
        for (const bu of bus) {
          const pct = allocMap[line.key]?.[bu.id] || 0;
          buValues[bu.id] = Math.round(sharedTotal * pct);
          total += buValues[bu.id];
        }
      } else if (line.type === 'total_revenue') {
        // Computed below via getRowTotal — just initialize
        for (const bu of bus) {
          buValues[bu.id] = 0;
        }
      } else if (line.type === 'capex') {
        // CAPEX spend from capex_items table
        for (const bu of bus) {
          const capex = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM capex_items
            WHERE month = ? AND business_unit_id = ?
          `).get(month, bu.id) as any;
          buValues[bu.id] = -(capex.total);
          total += buValues[bu.id];
        }
      } else if (line.type === 'depreciation') {
        // Monthly depreciation from active CAPEX items
        for (const bu of bus) {
          const dep = db.prepare(`
            SELECT COALESCE(SUM(depreciation_monthly), 0) as total
            FROM capex_items
            WHERE status = 'active' AND depreciation_monthly > 0
              AND business_unit_id = ?
          `).get(bu.id) as any;
          buValues[bu.id] = -(dep.total);
          total += buValues[bu.id];
        }
      }
      // Computed rows will be calculated on frontend
      
      return { ...line, buValues, total };
    });

    // Calculate computed rows
    const getRowTotal = (key: string, buId: string): number => {
      const row = rows.find(r => r.key === key && r.type === 'direct');
      return row?.buValues[buId] || 0;
    };

    // total_revenue
    const trRow = rows.find(r => r.type === 'total_revenue');
    if (trRow) {
      for (const bu of bus) {
        trRow.buValues[bu.id] = ['Проживання', 'Сауна', 'Ресторан', 'Сніданки', 'Інші доходи']
          .reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        trRow.total += trRow.buValues[bu.id];
      }
    }

    // total_variable
    const tvRow = rows.find(r => r.type === 'total_variable');
    if (tvRow) {
      for (const bu of bus) {
        tvRow.buValues[bu.id] = ['Продукти', 'Харчування', 'Змінні витрати']
          .reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        tvRow.total += tvRow.buValues[bu.id];
      }
    }

    // gross_profit = total_revenue + total_variable (variable is negative)
    const gpRow = rows.find(r => r.type === 'gross_profit');
    if (gpRow && trRow && tvRow) {
      for (const bu of bus) {
        gpRow.buValues[bu.id] = (trRow.buValues[bu.id] || 0) + (tvRow.buValues[bu.id] || 0);
        gpRow.total += gpRow.buValues[bu.id];
      }
    }

    // EBITDA = gross_profit - all OPEX (direct + alloc)
    const ebitdaRow = rows.find(r => r.type === 'ebitda');
    if (ebitdaRow && gpRow) {
      const opexRows = rows.filter(r => r.section === 'OPEX direct' || r.section === 'OPEX alloc');
      for (const bu of bus) {
        const totalOpex = opexRows.reduce((sum, r) => sum + (r.buValues[bu.id] || 0), 0);
        ebitdaRow.buValues[bu.id] = (gpRow.buValues[bu.id] || 0) + totalOpex;
        ebitdaRow.total += ebitdaRow.buValues[bu.id];
      }
    }

    // Net = EBITDA + Taxes
    const netRow = rows.find(r => r.type === 'net');
    if (netRow && ebitdaRow) {
      const taxRow = rows.find(r => r.key === 'Податки');
      for (const bu of bus) {
        netRow.buValues[bu.id] = (ebitdaRow.buValues[bu.id] || 0) + (taxRow?.buValues[bu.id] || 0);
        netRow.total += netRow.buValues[bu.id];
      }
    }

    return NextResponse.json({
      month,
      businessUnits: bus,
      rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

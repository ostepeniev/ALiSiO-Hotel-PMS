/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Read-only diagnostic for the investor / finance entanglement.
// No mutations. Returns a snapshot of every business_unit, every glamping
// unit, every investor_investment, with the joins and counts needed to
// figure out what got polluted by the Supabase importer.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function normName(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
    .replace(/[\s_\-/]/g, '');
}

export async function getInvestorAudit(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);

    // 1. Every business_unit with finance + investor footprint counts
    const businessUnits = db.prepare(`
      SELECT
        bu.id,
        bu.name,
        bu.unit_type,
        bu.is_active,
        bu.is_shared,
        (SELECT COUNT(*) FROM fin_operations
          WHERE project_id = bu.id) AS fin_ops_count,
        (SELECT COALESCE(SUM(amount), 0) FROM fin_operations
          WHERE project_id = bu.id) AS fin_ops_total,
        (SELECT COUNT(*) FROM investor_investments
          WHERE project_id = bu.id AND is_active = 1) AS investor_lots,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_investments
          WHERE project_id = bu.id AND is_active = 1) AS investor_total,
        (SELECT COUNT(*) FROM investor_payouts WHERE project_id = bu.id) AS payout_count,
        (SELECT COUNT(*) FROM property_monthly_metrics WHERE project_id = bu.id) AS metric_count,
        (SELECT COUNT(*) FROM property_monthly_reports WHERE project_id = bu.id) AS report_count,
        (SELECT COUNT(*) FROM fin_budgets WHERE project_id = bu.id) AS budget_count
      FROM business_units bu
      WHERE bu.organization_id = ?
      ORDER BY bu.sort_order, bu.name
    `).all(orgId) as any[];

    // Tag each BU as: finance-only / investor-only / mixed / orphan
    const tagged = businessUnits.map((bu) => {
      const hasFinance = bu.fin_ops_count > 0 || bu.budget_count > 0;
      const hasInvestor = bu.investor_lots > 0 || bu.payout_count > 0 || bu.metric_count > 0 || bu.report_count > 0;
      let role: string;
      if (hasFinance && hasInvestor) role = 'MIXED ⚠';
      else if (hasInvestor) role = 'investor-only';
      else if (hasFinance) role = 'finance-only';
      else role = 'orphan (empty)';
      const isSupabaseImported = bu.id.startsWith('bu_sb_');
      return { ...bu, role, is_supabase_imported: isSupabaseImported };
    });

    // 2. Every glamping unit (real PMS houses)
    const glampingUnits = db.prepare(`
      SELECT
        u.id, u.name, u.code,
        u.is_active,
        p.name AS property_name,
        c.name AS category_name,
        c.type AS category_type,
        (SELECT COUNT(*) FROM reservations
          WHERE unit_id = u.id
            AND status NOT IN ('cancelled','no_show','draft')) AS reservation_count,
        (SELECT COALESCE(SUM(total_price), 0) FROM reservations
          WHERE unit_id = u.id
            AND status NOT IN ('cancelled','no_show','draft')) AS reservation_total
      FROM units u
      JOIN properties p ON p.id = u.property_id
      JOIN categories c ON c.id = u.category_id
      WHERE p.organization_id = ?
      ORDER BY p.name, c.name, u.sort_order, u.name
    `).all(orgId) as any[];

    // Build name match map: business_unit.name → matching unit
    const unitsByNorm = new Map<string, { id: string; name: string }>();
    for (const u of glampingUnits.filter((u) => u.category_type === 'glamping')) {
      unitsByNorm.set(normName(u.name), { id: u.id, name: u.name });
    }
    const taggedBus = tagged.map((bu) => {
      const match = unitsByNorm.get(normName(bu.name));
      return { ...bu, matched_unit_id: match?.id || null, matched_unit_name: match?.name || null };
    });

    // 3. Every investor_investment
    const investments = db.prepare(`
      SELECT
        ii.id,
        ii.investor_id,
        i.name AS investor_name,
        ii.project_id,
        bu.name AS project_name,
        ii.amount,
        ii.currency,
        ii.equity_pct,
        ii.invested_at,
        ii.is_active
      FROM investor_investments ii
      LEFT JOIN investors i ON i.id = ii.investor_id
      LEFT JOIN business_units bu ON bu.id = ii.project_id
      WHERE ii.organization_id = ?
      ORDER BY i.name, ii.invested_at
    `).all(orgId) as any[];

    // 4. Counts of payouts / metrics / reports referencing investor BUs
    const investorBuIds = taggedBus.filter((bu) => bu.investor_lots > 0).map((bu) => bu.id);
    const pollutionStats = {
      total_business_units: tagged.length,
      finance_only: tagged.filter((b) => b.role === 'finance-only').length,
      investor_only: tagged.filter((b) => b.role === 'investor-only').length,
      mixed: tagged.filter((b) => b.role === 'MIXED ⚠').length,
      orphan: tagged.filter((b) => b.role === 'orphan (empty)').length,
      supabase_imported: tagged.filter((b) => b.is_supabase_imported).length,
      unit_match_count: taggedBus.filter((b) => b.matched_unit_id).length,
    };

    // 5. fin_operations referencing investor-polluted BUs (top 10 most recent)
    let pollutedFinOps: any[] = [];
    if (investorBuIds.length > 0) {
      const placeholders = investorBuIds.map(() => '?').join(',');
      pollutedFinOps = db.prepare(`
        SELECT id, paid_at, amount, currency, op_type, project_id, comment, source
        FROM fin_operations
        WHERE project_id IN (${placeholders})
        ORDER BY paid_at DESC
        LIMIT 20
      `).all(...investorBuIds) as any[];
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      pollution_stats: pollutionStats,
      business_units: taggedBus,
      glamping_units: glampingUnits.filter((u) => u.category_type === 'glamping'),
      all_units_summary: {
        glamping: glampingUnits.filter((u) => u.category_type === 'glamping').length,
        camping: glampingUnits.filter((u) => u.category_type === 'camping').length,
        resort: glampingUnits.filter((u) => u.category_type === 'resort').length,
      },
      investments,
      polluted_fin_operations_sample: pollutedFinOps,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

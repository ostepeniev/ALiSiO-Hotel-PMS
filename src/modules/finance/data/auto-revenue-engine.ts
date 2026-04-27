/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Auto-revenue engine — derives investor monthly revenue per project from
// real PMS reservations.
//
// Investor module is keyed on `business_units` (project_id). User renames
// the relevant business_units to match real `units.name` (A1, A2, B1...).
// We resolve each business_unit by name-match to a unit, then sum
// `reservations.total_price` for stays that:
//   - belong to that unit
//   - have already departed (check_out <= today)
//   - departed in the requested year_month
//   - are not cancelled / no_show
//
// Same primitive used by:
//   - admin MetricsTab («Apply auto» pre-fill)
//   - monthly-digest engine (auto when no manual metric for the month)
//   - portal engine (auto fallback)
//   - public portal "source breakdown" widget
//

export interface AutoRevenuePerSource {
  source: string;       // 'direct' | 'booking_com' | 'airbnb' | ...
  total: number;
  reservations: number;
}

export interface AutoRevenueResult {
  project_id: string;          // business_unit id
  unit_id: string | null;      // matched units.id (null when no name match)
  unit_name: string | null;
  year_month: string;
  total: number;               // sum across sources
  reservations: number;
  by_source: AutoRevenuePerSource[];
}

function normName(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
    .replace(/[\s_\-/]/g, '');
}

/**
 * Build a project_id → matched unit_id map for the given org. We do
 * Cyrillic-folded normalised name matching once and reuse the cache.
 */
export function buildProjectToUnitMap(db: any, orgId: string): Map<string, { id: string; name: string }> {
  const buRows = db.prepare(
    "SELECT id, name FROM business_units WHERE organization_id = ?"
  ).all(orgId) as { id: string; name: string }[];

  // Only glamping units (categories.type='glamping') — investor block is
  // explicitly limited to glamping houses per user requirement.
  const unitRows = db.prepare(`
    SELECT u.id, u.name
    FROM units u
    JOIN categories c ON c.id = u.category_id
    JOIN properties p ON p.id = u.property_id
    WHERE p.organization_id = ? AND u.is_active = 1 AND c.type = 'glamping'
  `).all(orgId) as { id: string; name: string }[];

  const unitByNorm = new Map<string, { id: string; name: string }>();
  for (const u of unitRows) unitByNorm.set(normName(u.name), { id: u.id, name: u.name });

  const out = new Map<string, { id: string; name: string }>();
  for (const bu of buRows) {
    const u = unitByNorm.get(normName(bu.name));
    if (u) out.set(bu.id, u);
  }
  return out;
}

/**
 * Compute auto revenue for one project_id and month.
 * Uses today's date as the cut-off — only departed reservations count.
 */
export function getAutoRevenue(
  db: any,
  orgId: string,
  projectId: string,
  yearMonth: string,
): AutoRevenueResult {
  const map = buildProjectToUnitMap(db, orgId);
  const unit = map.get(projectId);
  const result: AutoRevenueResult = {
    project_id: projectId,
    unit_id: unit?.id || null,
    unit_name: unit?.name || null,
    year_month: yearMonth,
    total: 0, reservations: 0, by_source: [],
  };
  if (!unit) return result;

  const today = new Date().toISOString().substring(0, 10);
  const rows = db.prepare(`
    SELECT source, COALESCE(SUM(total_price), 0) AS total, COUNT(*) AS n
    FROM reservations
    WHERE unit_id = ?
      AND check_out <= ?
      AND substr(check_out, 1, 7) = ?
      AND status NOT IN ('cancelled', 'no_show', 'draft')
    GROUP BY source
  `).all(unit.id, today, yearMonth) as { source: string; total: number; n: number }[];

  for (const r of rows) {
    result.by_source.push({ source: r.source, total: +r.total.toFixed(2), reservations: r.n });
    result.total += r.total;
    result.reservations += r.n;
  }
  result.total = +result.total.toFixed(2);
  return result;
}

/**
 * Bulk version — returns auto-revenue for every business_unit referenced
 * by an active investor_investment, for the chosen month.
 */
export function getAutoRevenueAllProjects(
  db: any,
  orgId: string,
  yearMonth: string,
): AutoRevenueResult[] {
  const projectIds = db.prepare(`
    SELECT DISTINCT project_id
    FROM investor_investments
    WHERE organization_id = ? AND is_active = 1 AND project_id IS NOT NULL
  `).all(orgId) as { project_id: string }[];

  return projectIds.map((p) => getAutoRevenue(db, orgId, p.project_id, yearMonth));
}

/**
 * Source breakdown across all-time (or year window) — feeds the public
 * portal "Income by source" widget. Per-investor: sums the investor's
 * equity-share of revenue per source for stays in their projects.
 */
export interface InvestorSourceBreakdown {
  source: string;
  total_share: number;        // investor's share (after equity_pct)
  reservations: number;
}

export function getInvestorIncomeBySource(
  db: any,
  investorId: string,
  fromMonth?: string,
  toMonth?: string,
): InvestorSourceBreakdown[] {
  const investments = db.prepare(`
    SELECT ii.project_id, ii.equity_pct, ii.invested_at
    FROM investor_investments ii
    WHERE ii.investor_id = ? AND ii.is_active = 1 AND ii.project_id IS NOT NULL
  `).all(investorId) as { project_id: string; equity_pct: number | null; invested_at: string }[];
  if (investments.length === 0) return [];

  // Resolve project_ids → unit_ids via name match
  const investorRow = db.prepare(
    "SELECT organization_id FROM investors WHERE id = ?"
  ).get(investorId) as { organization_id: string } | undefined;
  if (!investorRow) return [];
  const map = buildProjectToUnitMap(db, investorRow.organization_id);

  const today = new Date().toISOString().substring(0, 10);
  const totalsBySource = new Map<string, { total: number; n: number }>();

  for (const inv of investments) {
    const unit = map.get(inv.project_id);
    if (!unit) continue;
    const eq = (inv.equity_pct || 0) / 100;

    const where: string[] = ['unit_id = ?', 'check_out <= ?', 'check_out >= ?',
                             "status NOT IN ('cancelled', 'no_show', 'draft')"];
    const params: any[] = [unit.id, today, inv.invested_at];
    if (fromMonth) { where.push("substr(check_out, 1, 7) >= ?"); params.push(fromMonth); }
    if (toMonth)   { where.push("substr(check_out, 1, 7) <= ?"); params.push(toMonth); }

    const rows = db.prepare(`
      SELECT source, COALESCE(SUM(total_price), 0) AS total, COUNT(*) AS n
      FROM reservations
      WHERE ${where.join(' AND ')}
      GROUP BY source
    `).all(...params) as { source: string; total: number; n: number }[];

    for (const r of rows) {
      const cell = totalsBySource.get(r.source) || { total: 0, n: 0 };
      cell.total += r.total * eq;
      cell.n += r.n;
      totalsBySource.set(r.source, cell);
    }
  }

  return [...totalsBySource.entries()]
    .map(([source, c]) => ({ source, total_share: +c.total.toFixed(2), reservations: c.n }))
    .sort((a, b) => b.total_share - a.total_share);
}

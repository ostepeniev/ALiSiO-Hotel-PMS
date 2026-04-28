/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Auto-revenue engine — derives investor monthly revenue per project.
//
// Investor's monthly share = equity_pct × GROSS booking price (NOT net).
// We deliberately do not subtract the channel commission — investor is
// entitled to a share of what the guest paid for the stay, regardless
// of what fees the hotel pays Airbnb/Booking afterwards.
//
// Two data sources, in priority order:
//
//   1. RECONCILED  — `fin_channel_receivables.gross_amount` for stays whose
//      channel statement was uploaded and matched (status='paid' or
//      'in_statement'). The basis tag tells the UI "this number is verified
//      against the platform's actual statement", but the AMOUNT used is
//      always gross (the price the guest paid).
//
//   2. RAW reservations — `reservations.total_price` for stays that have
//      already checked out. Used for direct/walk-in bookings (no receivable
//      row) and as preview before the statement arrives.
//
// Investor module is keyed on `business_units` (project_id, legacy). User
// renames the relevant business_units to match real `units.name` (A1, A2,
// B1...). We resolve project_id → unit_id by Cyrillic-folded name match,
// scoped to glamping units only.
//

export interface AutoRevenuePerSource {
  source: string;       // 'direct' | 'booking' | 'airbnb' | ...
  total: number;        // sum (already net of commission for reconciled rows)
  reservations: number;
  basis: 'reconciled' | 'raw';   // where this number came from
}

export interface AutoRevenueResult {
  project_id: string;          // business_unit id
  unit_id: string | null;      // matched units.id (null when no name match)
  unit_name: string | null;
  year_month: string;
  total: number;               // sum across sources
  reservations: number;
  reconciled_total: number;    // portion that came from reconciled receivables
  raw_total: number;           // portion that came from raw reservations
  by_source: AutoRevenuePerSource[];
}

function normName(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
    .replace(/[\s_\-/]/g, '');
}

/**
 * Build a project_id → matched unit_id map for the given org. Cyrillic-folded
 * normalised name matching, scoped to glamping units.
 */
export function buildProjectToUnitMap(db: any, orgId: string): Map<string, { id: string; name: string }> {
  const buRows = db.prepare(
    "SELECT id, name FROM business_units WHERE organization_id = ?"
  ).all(orgId) as { id: string; name: string }[];

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
 *
 * Strategy:
 *   - For each reservation that checks out in the target month for this unit,
 *     prefer the reconciled receivable's actual_net (or expected_net when
 *     receivable exists but isn't reconciled yet);
 *   - Fall back to reservations.total_price for direct bookings / no
 *     receivable row.
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
    reconciled_total: 0, raw_total: 0,
  };
  if (!unit) return result;

  const today = new Date().toISOString().substring(0, 10);

  // One row per reservation that departed this month, with its receivable
  // (when present). LEFT JOIN so direct bookings still appear.
  const rows = db.prepare(`
    SELECT r.id            AS reservation_id,
           r.source        AS res_source,
           r.total_price   AS res_total,
           rc.channel_source AS rc_source,
           rc.gross_amount,
           rc.status       AS rc_status
    FROM reservations r
    LEFT JOIN fin_channel_receivables rc ON rc.reservation_id = r.id
    WHERE r.unit_id = ?
      AND r.check_out <= ?
      AND substr(r.check_out, 1, 7) = ?
      AND r.status NOT IN ('cancelled', 'no_show', 'draft')
  `).all(unit.id, today, yearMonth) as Array<{
    reservation_id: string;
    res_source: string;
    res_total: number;
    rc_source: string | null;
    gross_amount: number | null;
    rc_status: string | null;
  }>;

  // Aggregate per source. Always use the GROSS amount — investor's share is
  // calculated against what the guest paid, not against what the hotel
  // received after channel commission. The "reconciled" tag only signals
  // that the platform statement has confirmed this booking; it does not
  // change the amount used.
  const bySource = new Map<string, { total: number; n: number; basis: 'reconciled' | 'raw' }>();
  for (const r of rows) {
    // Prefer receivable.gross_amount when present (it's the platform's
    // confirmed price); otherwise fall back to the reservation's total_price.
    const amount = (r.gross_amount != null ? r.gross_amount : r.res_total) || 0;
    const isReconciled = r.rc_status === 'paid' || r.rc_status === 'in_statement';
    const basis: 'reconciled' | 'raw' = isReconciled ? 'reconciled' : 'raw';
    const source = r.rc_source || r.res_source;
    if (isReconciled) result.reconciled_total += amount;
    else result.raw_total += amount;
    const cell = bySource.get(source) || { total: 0, n: 0, basis };
    cell.total += amount;
    cell.n += 1;
    if (basis === 'reconciled') cell.basis = 'reconciled';   // upgrade if any reconciled
    bySource.set(source, cell);
    result.total += amount;
    result.reservations += 1;
  }

  result.by_source = [...bySource.entries()]
    .map(([source, c]) => ({ source, total: +c.total.toFixed(2), reservations: c.n, basis: c.basis }))
    .sort((a, b) => b.total - a.total);
  result.total = +result.total.toFixed(2);
  result.reconciled_total = +result.reconciled_total.toFixed(2);
  result.raw_total = +result.raw_total.toFixed(2);
  return result;
}

/**
 * Bulk version — auto-revenue for every business_unit referenced by an
 * active investor_investment, for the chosen month.
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

// ─── Source breakdown for public investor portal ─────────────────

export interface InvestorSourceBreakdown {
  source: string;
  total_share: number;        // investor's share (after equity_pct)
  reservations: number;
  basis: 'reconciled' | 'mixed' | 'raw';
}

/**
 * Per-investor income breakdown by channel source. Uses the same
 * reconciled-first strategy.
 */
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

  const investorRow = db.prepare(
    "SELECT organization_id FROM investors WHERE id = ?"
  ).get(investorId) as { organization_id: string } | undefined;
  if (!investorRow) return [];
  const map = buildProjectToUnitMap(db, investorRow.organization_id);

  const today = new Date().toISOString().substring(0, 10);
  const bySource = new Map<string, { total: number; n: number; reconciledShare: number }>();

  for (const inv of investments) {
    const unit = map.get(inv.project_id);
    if (!unit) continue;
    const eq = (inv.equity_pct || 0) / 100;

    const where: string[] = ['r.unit_id = ?', 'r.check_out <= ?', 'r.check_out >= ?',
                             "r.status NOT IN ('cancelled', 'no_show', 'draft')"];
    const params: any[] = [unit.id, today, inv.invested_at];
    if (fromMonth) { where.push("substr(r.check_out, 1, 7) >= ?"); params.push(fromMonth); }
    if (toMonth)   { where.push("substr(r.check_out, 1, 7) <= ?"); params.push(toMonth); }

    const rows = db.prepare(`
      SELECT r.source AS res_source, r.total_price AS res_total,
             rc.channel_source AS rc_source, rc.gross_amount, rc.status AS rc_status
      FROM reservations r
      LEFT JOIN fin_channel_receivables rc ON rc.reservation_id = r.id
      WHERE ${where.join(' AND ')}
    `).all(...params) as any[];

    for (const r of rows) {
      // Always use gross — investor's equity_pct applies to the price the
      // guest paid, not to what the hotel netted after channel commission.
      const amount = (r.gross_amount != null ? r.gross_amount : r.res_total) || 0;
      const isReconciled = r.rc_status === 'paid' || r.rc_status === 'in_statement';
      const source = r.rc_source || r.res_source;
      const share = amount * eq;
      const cell = bySource.get(source) || { total: 0, n: 0, reconciledShare: 0 };
      cell.total += share;
      cell.n += 1;
      if (isReconciled) cell.reconciledShare += share;
      bySource.set(source, cell);
    }
  }

  return [...bySource.entries()]
    .map(([source, c]) => {
      let basis: 'reconciled' | 'mixed' | 'raw' = 'raw';
      if (c.reconciledShare === c.total && c.total > 0) basis = 'reconciled';
      else if (c.reconciledShare > 0) basis = 'mixed';
      return { source, total_share: +c.total.toFixed(2), reservations: c.n, basis };
    })
    .sort((a, b) => b.total_share - a.total_share);
}

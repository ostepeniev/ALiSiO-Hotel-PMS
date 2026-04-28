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
  currency: string;     // 'CZK' / 'EUR' — native currency of the reservation
  total: number;        // sum in `currency`
  reservations: number;
  basis: 'reconciled' | 'raw';   // where this number came from
}

export interface AutoRevenueResult {
  project_id: string;          // business_unit id
  unit_id: string | null;      // matched units.id (null when no name match)
  unit_name: string | null;
  year_month: string;
  totals_by_currency: Record<string, number>;  // { CZK: 29314, EUR: 0 } etc
  reservations: number;
  reconciled_total_by_currency: Record<string, number>;
  raw_total_by_currency: Record<string, number>;
  by_source: AutoRevenuePerSource[];
}

function normName(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
    .replace(/[\s_\-/]/g, '');
}

/**
 * Build a project_id → matched unit map for the given org.
 *
 * Two-stage resolution (explicit-first, then heuristic):
 *   1. Any investor_investments row with explicit unit_id wins — that's
 *      the admin's deliberate link, set in cleanup #A's auto-fill or by
 *      future relink UI.
 *   2. Cyrillic-folded name match between business_units.name and
 *      glamping units.name — fallback for rows that haven't been linked.
 */
export function buildProjectToUnitMap(db: any, orgId: string): Map<string, { id: string; name: string }> {
  const unitRows = db.prepare(`
    SELECT u.id, u.name
    FROM units u
    JOIN categories c ON c.id = u.category_id
    JOIN properties p ON p.id = u.property_id
    WHERE p.organization_id = ? AND u.is_active = 1 AND c.type = 'glamping'
  `).all(orgId) as { id: string; name: string }[];
  const unitById = new Map<string, { id: string; name: string }>();
  for (const u of unitRows) unitById.set(u.id, u);
  const unitByNorm = new Map<string, { id: string; name: string }>();
  for (const u of unitRows) unitByNorm.set(normName(u.name), u);

  const out = new Map<string, { id: string; name: string }>();

  // Stage 1 — explicit unit_id from investor_investments (highest priority)
  const explicitRows = db.prepare(`
    SELECT DISTINCT project_id, unit_id
    FROM investor_investments
    WHERE organization_id = ? AND project_id IS NOT NULL AND unit_id IS NOT NULL AND is_active = 1
  `).all(orgId) as { project_id: string; unit_id: string }[];
  for (const r of explicitRows) {
    const u = unitById.get(r.unit_id);
    if (u) out.set(r.project_id, u);
  }

  // Stage 2 — name match for projects that don't already have an explicit link
  const buRows = db.prepare(
    "SELECT id, name FROM business_units WHERE organization_id = ?"
  ).all(orgId) as { id: string; name: string }[];
  for (const bu of buRows) {
    if (out.has(bu.id)) continue;
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
    totals_by_currency: {},
    reservations: 0, by_source: [],
    reconciled_total_by_currency: {},
    raw_total_by_currency: {},
  };
  if (!unit) return result;

  const today = new Date().toISOString().substring(0, 10);

  // One row per reservation that departed this month, with its receivable
  // (when present). LEFT JOIN so direct bookings still appear.
  // Each reservation carries its own currency (CZK/EUR) — we keep them
  // separated so the UI can decide whether to convert or display side-by-side.
  const rows = db.prepare(`
    SELECT r.id            AS reservation_id,
           r.source        AS res_source,
           r.total_price   AS res_total,
           r.currency      AS res_currency,
           rc.channel_source AS rc_source,
           rc.gross_amount,
           rc.currency     AS rc_currency,
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
    res_currency: string;
    rc_source: string | null;
    gross_amount: number | null;
    rc_currency: string | null;
    rc_status: string | null;
  }>;

  // Aggregate per (source, currency). Always use the GROSS amount — investor's
  // share is calculated against what the guest paid (NOT after channel
  // commission). The "reconciled" tag only signals statement confirmation;
  // it does not change the amount used.
  const bySource = new Map<string, { source: string; total: number; n: number; currency: string; basis: 'reconciled' | 'raw' }>();
  for (const r of rows) {
    const amount = (r.gross_amount != null ? r.gross_amount : r.res_total) || 0;
    const currency = r.rc_currency || r.res_currency || 'CZK';
    const isReconciled = r.rc_status === 'paid' || r.rc_status === 'in_statement';
    const basis: 'reconciled' | 'raw' = isReconciled ? 'reconciled' : 'raw';
    const source = r.rc_source || r.res_source;

    const cur = (bucket: Record<string, number>) => { bucket[currency] = (bucket[currency] || 0) + amount; };
    cur(result.totals_by_currency);
    if (isReconciled) cur(result.reconciled_total_by_currency);
    else cur(result.raw_total_by_currency);

    const key = `${source}|${currency}`;
    const cell = bySource.get(key) || { source, total: 0, n: 0, currency, basis };
    cell.total += amount;
    cell.n += 1;
    if (basis === 'reconciled') cell.basis = 'reconciled';
    bySource.set(key, cell);
    result.reservations += 1;
  }

  result.by_source = [...bySource.values()]
    .map((c) => ({ source: c.source, total: +c.total.toFixed(2), reservations: c.n, currency: c.currency, basis: c.basis }))
    .sort((a, b) => b.total - a.total);
  // round per-currency totals
  for (const k of Object.keys(result.totals_by_currency)) result.totals_by_currency[k] = +result.totals_by_currency[k].toFixed(2);
  for (const k of Object.keys(result.reconciled_total_by_currency)) result.reconciled_total_by_currency[k] = +result.reconciled_total_by_currency[k].toFixed(2);
  for (const k of Object.keys(result.raw_total_by_currency)) result.raw_total_by_currency[k] = +result.raw_total_by_currency[k].toFixed(2);
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
  currency: string;           // native currency of the bookings
  total_share: number;        // investor's share (equity_pct × gross), in `currency`
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
  // Key by source + currency so CZK and EUR don't get summed together.
  const bySource = new Map<string, { source: string; currency: string; total: number; n: number; reconciledShare: number }>();

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
      SELECT r.source AS res_source, r.total_price AS res_total, r.currency AS res_currency,
             rc.channel_source AS rc_source, rc.gross_amount, rc.currency AS rc_currency,
             rc.status AS rc_status
      FROM reservations r
      LEFT JOIN fin_channel_receivables rc ON rc.reservation_id = r.id
      WHERE ${where.join(' AND ')}
    `).all(...params) as any[];

    for (const r of rows) {
      // Always use gross — investor's equity_pct applies to the price the
      // guest paid, not to what the hotel netted after channel commission.
      const amount = (r.gross_amount != null ? r.gross_amount : r.res_total) || 0;
      const currency = r.rc_currency || r.res_currency || 'CZK';
      const isReconciled = r.rc_status === 'paid' || r.rc_status === 'in_statement';
      const source = r.rc_source || r.res_source;
      const share = amount * eq;
      const key = `${source}|${currency}`;
      const cell = bySource.get(key) || { source, currency, total: 0, n: 0, reconciledShare: 0 };
      cell.total += share;
      cell.n += 1;
      if (isReconciled) cell.reconciledShare += share;
      bySource.set(key, cell);
    }
  }

  return [...bySource.values()]
    .map((c) => {
      let basis: 'reconciled' | 'mixed' | 'raw' = 'raw';
      if (c.reconciledShare === c.total && c.total > 0) basis = 'reconciled';
      else if (c.reconciledShare > 0) basis = 'mixed';
      return { source: c.source, currency: c.currency, total_share: +c.total.toFixed(2), reservations: c.n, basis };
    })
    .sort((a, b) => b.total_share - a.total_share);
}

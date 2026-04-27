/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor portal calculation engine.
//
// Reads investor + investments + property metrics + payouts + work_stages
// + monthly_reports for one investor (resolved by portal_token) and
// computes the dashboard view:
//   - Per-property: invested, equity %, monthly profit (revenue × equity%),
//     accumulated profit, total paid out, pending balance, ROI %, status
//   - Portfolio totals: invested, paid out, pending, weighted avg
//     occupancy, weighted ROI, payback years
//   - Time series: capital growth (cumulative profit), occupancy by month
//
// Adapted from investflow-dashboard's calculateInvestorFinancials but
// driven by our SQLite schema (PR #31).
//

export interface InvestorPortalData {
  investor: {
    id: string;
    name: string;
    email: string | null;
    status: string;
  };
  totals: {
    invested: number;
    paid_out: number;
    pending: number;
    accumulated_profit: number;
    monthly_profit: number;
    annualised_yield_pct: number | null;
    payback_years: number | null;
    avg_occupancy_pct: number | null;
    active_lots: number;
    currency: string;
  };
  properties: Array<{
    project_id: string;
    project_name: string;
    invested: number;
    equity_pct: number | null;
    currency: string;
    invested_at: string;
    status: string;                 // active | in_progress | paused | (derived)
    monthly_profit: number;
    accumulated_profit: number;
    paid_out: number;
    pending: number;
    roi_pct: number | null;
    payback_years: number | null;
    last_metric_month: string | null;
    last_metric_occupancy: number | null;
    last_metric_revenue: number | null;
    work_stages: Array<{ name: string; pct: number }>;
    airbnb_url?: string | null;
  }>;
  capital_growth: Array<{ month: string; invested: number; profit_cumulative: number }>;
  occupancy_dynamics: Array<{ month: string; occupancy_pct: number }>;
  monthly_reports: Array<{
    project_id: string;
    project_name: string;
    year_month: string;
    adr: number | null;
    general_comment: string | null;
    market_insight: string | null;
    photo_url: string | null;
  }>;
}

const NOW = () => new Date();

function monthsBetween(from: string, to: Date): number {
  const f = new Date(from + 'T00:00:00Z');
  const t = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  return Math.max(1, (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1);
}

function deriveStatus(stages: Array<{ pct: number }>): string {
  if (stages.length === 0) return 'active';
  const totalPct = stages.reduce((s, x) => s + (x.pct || 0), 0) / stages.length;
  if (totalPct >= 99) return 'active';
  if (totalPct > 0) return 'in_progress';
  return 'project';
}

export function buildPortalData(db: any, token: string): InvestorPortalData | null {
  const investor = db.prepare(
    "SELECT id, name, email, status FROM investors WHERE portal_token = ? AND status = 'active' LIMIT 1"
  ).get(token) as any;
  if (!investor) return null;

  // All active investments. Prefer unit_id (real house) and fall back to
  // legacy business_unit name when investment hasn't been re-linked yet.
  const investments = db.prepare(`
    SELECT ii.*,
           COALESCE(u.id, ii.project_id) AS effective_id,
           COALESCE(u.name, bu.name)     AS project_name
    FROM investor_investments ii
    LEFT JOIN units u           ON u.id  = ii.unit_id
    LEFT JOIN business_units bu ON bu.id = ii.project_id
    WHERE ii.investor_id = ? AND ii.is_active = 1
    ORDER BY ii.invested_at
  `).all(investor.id) as any[];

  // All payouts (across all properties)
  const payouts = db.prepare(`
    SELECT * FROM investor_payouts WHERE investor_id = ? ORDER BY paid_at
  `).all(investor.id) as any[];

  // We use effective_id (unit_id when present, else legacy project_id) as
  // the join key for metrics / work_stages / reports / details. The DB
  // tables carry both columns during the migration window.
  const effectiveIds = [...new Set(investments.map((i) => i.effective_id))];

  // Pre-load monthly metrics
  let metricsRows: any[] = [];
  if (effectiveIds.length > 0) {
    const placeholders = effectiveIds.map(() => '?').join(',');
    metricsRows = db.prepare(`
      SELECT COALESCE(unit_id, project_id) AS key, year_month, occupancy_pct, revenue
      FROM property_monthly_metrics
      WHERE COALESCE(unit_id, project_id) IN (${placeholders})
      ORDER BY year_month
    `).all(...effectiveIds) as any[];
  }
  const metricsByProject = new Map<string, any[]>();
  for (const m of metricsRows) {
    if (!metricsByProject.has(m.key)) metricsByProject.set(m.key, []);
    metricsByProject.get(m.key)!.push(m);
  }

  // Pre-load work_stages
  let stagesRows: any[] = [];
  if (effectiveIds.length > 0) {
    const placeholders = effectiveIds.map(() => '?').join(',');
    stagesRows = db.prepare(
      `SELECT COALESCE(unit_id, project_id) AS key, stages_json
       FROM property_work_stages
       WHERE COALESCE(unit_id, project_id) IN (${placeholders})`
    ).all(...effectiveIds) as any[];
  }
  const stagesByProject = new Map<string, any[]>();
  for (const s of stagesRows) {
    try {
      const parsed = JSON.parse(s.stages_json);
      stagesByProject.set(s.key, Array.isArray(parsed) ? parsed : []);
    } catch { /* ignore */ }
  }

  // Pre-load monthly reports
  let reportsRows: any[] = [];
  if (effectiveIds.length > 0) {
    const placeholders = effectiveIds.map(() => '?').join(',');
    reportsRows = db.prepare(`
      SELECT pr.*,
             COALESCE(u.name, bu.name) AS project_name,
             COALESCE(pr.unit_id, pr.project_id) AS key
      FROM property_monthly_reports pr
      LEFT JOIN units u           ON u.id  = pr.unit_id
      LEFT JOIN business_units bu ON bu.id = pr.project_id
      WHERE COALESCE(pr.unit_id, pr.project_id) IN (${placeholders})
      ORDER BY pr.year_month DESC
      LIMIT 30
    `).all(...effectiveIds) as any[];
  }

  // Pre-load investor-facing property details
  const detailsByProject = new Map<string, { airbnb_url: string | null; status: string | null; image_url: string | null; location: string | null }>();
  if (effectiveIds.length > 0) {
    const placeholders = effectiveIds.map(() => '?').join(',');
    const detRows = db.prepare(`
      SELECT COALESCE(unit_id, project_id) AS key, airbnb_url, status, image_url, location
      FROM investor_property_details
      WHERE COALESCE(unit_id, project_id) IN (${placeholders})
    `).all(...effectiveIds) as any[];
    for (const d of detRows) detailsByProject.set(d.key, d);
  }

  // Per-property calculations
  const propertyOut: InvestorPortalData['properties'] = [];
  const allMonthsSet = new Set<string>();
  let totalInvested = 0;
  let totalAccumulatedProfit = 0;
  let totalMonthlyProfit = 0;
  let totalPaidOut = 0;
  let weightedOccupancyNum = 0;
  let weightedOccupancyDen = 0;
  const portfolioCurrency = investments[0]?.currency || 'EUR';

  for (const inv of investments) {
    const eq = (inv.equity_pct || 0) / 100;
    const key = inv.effective_id;
    const metrics = (metricsByProject.get(key) || []).filter((m) => m.year_month >= inv.invested_at.substring(0, 7));
    const stages = (stagesByProject.get(key) || []).map((s: any) => ({ name: s.name || '?', pct: Number(s.percentage ?? s.pct) || 0 }));

    let accProfit = 0;
    let lastRev = 0;
    let lastOccupancy = 0;
    let lastMonth = '';
    let occSum = 0, occCount = 0;
    for (const m of metrics) {
      allMonthsSet.add(m.year_month);
      accProfit += (m.revenue || 0) * eq;
      lastRev = m.revenue || 0;
      lastOccupancy = m.occupancy_pct || 0;
      lastMonth = m.year_month;
      if (m.occupancy_pct != null) { occSum += m.occupancy_pct; occCount++; }
    }
    const monthlyProfit = lastRev * eq; // most recent month's projected profit

    // Payouts attributed to this unit (matches by unit_id OR legacy project_id)
    const propertyPayouts = payouts.filter((p) => p.unit_id === inv.unit_id || (p.project_id && p.project_id === inv.project_id));
    const paidOutForProperty = propertyPayouts.reduce((s, p) => s + (p.amount || 0), 0);

    const pending = +(accProfit - paidOutForProperty).toFixed(2);
    const monthsSince = monthsBetween(inv.invested_at, NOW());
    const annualMonthly = (accProfit / monthsSince) * 12;
    const roiPct = inv.amount > 0 ? +(annualMonthly / inv.amount * 100).toFixed(2) : null;
    const paybackYears = monthlyProfit > 0 ? +(inv.amount / monthlyProfit / 12).toFixed(1) : null;

    totalInvested += inv.amount;
    totalAccumulatedProfit += accProfit;
    totalMonthlyProfit += monthlyProfit;
    if (occCount > 0) {
      weightedOccupancyNum += (occSum / occCount) * inv.amount;
      weightedOccupancyDen += inv.amount;
    }

    const det = detailsByProject.get(key);
    propertyOut.push({
      project_id: key,
      project_name: inv.project_name,
      invested: inv.amount,
      equity_pct: inv.equity_pct,
      currency: inv.currency,
      invested_at: inv.invested_at,
      status: det?.status || deriveStatus(stages),
      monthly_profit: +monthlyProfit.toFixed(2),
      accumulated_profit: +accProfit.toFixed(2),
      paid_out: +paidOutForProperty.toFixed(2),
      pending,
      roi_pct: roiPct,
      payback_years: paybackYears,
      last_metric_month: lastMonth || null,
      last_metric_occupancy: occCount > 0 ? +lastOccupancy.toFixed(1) : null,
      last_metric_revenue: occCount > 0 ? +lastRev.toFixed(2) : null,
      work_stages: stages,
      airbnb_url: det?.airbnb_url || null,
    });
  }

  totalPaidOut = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingTotal = +(totalAccumulatedProfit - totalPaidOut).toFixed(2);
  const annualisedYield = totalInvested > 0 && totalMonthlyProfit > 0
    ? +(totalMonthlyProfit * 12 / totalInvested * 100).toFixed(2) : null;
  const paybackYears = totalMonthlyProfit > 0
    ? +(totalInvested / totalMonthlyProfit / 12).toFixed(1) : null;
  const avgOccupancy = weightedOccupancyDen > 0
    ? +(weightedOccupancyNum / weightedOccupancyDen).toFixed(1) : null;

  // Capital growth time series — cumulative profit by month
  const allMonths = [...allMonthsSet].sort();
  let cumulative = 0;
  const monthlyTotals = new Map<string, number>();
  for (const inv of investments) {
    const eq = (inv.equity_pct || 0) / 100;
    const metrics = (metricsByProject.get(inv.effective_id) || []).filter((m) => m.year_month >= inv.invested_at.substring(0, 7));
    for (const m of metrics) {
      const prev = monthlyTotals.get(m.year_month) || 0;
      monthlyTotals.set(m.year_month, prev + (m.revenue || 0) * eq);
    }
  }
  const capitalGrowth = allMonths.map((month) => {
    cumulative += monthlyTotals.get(month) || 0;
    return { month, invested: totalInvested, profit_cumulative: +cumulative.toFixed(2) };
  });

  // Occupancy dynamics — weighted by amount per month
  const occByMonth = new Map<string, { num: number; den: number }>();
  for (const inv of investments) {
    const metrics = (metricsByProject.get(inv.effective_id) || []);
    for (const m of metrics) {
      if (m.occupancy_pct == null) continue;
      const cell = occByMonth.get(m.year_month) || { num: 0, den: 0 };
      cell.num += m.occupancy_pct * inv.amount;
      cell.den += inv.amount;
      occByMonth.set(m.year_month, cell);
    }
  }
  const occupancyDynamics = [...occByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({ month, occupancy_pct: +(c.num / c.den).toFixed(1) }));

  return {
    investor: {
      id: investor.id, name: investor.name, email: investor.email, status: investor.status,
    },
    totals: {
      invested: +totalInvested.toFixed(2),
      paid_out: +totalPaidOut.toFixed(2),
      pending: pendingTotal,
      accumulated_profit: +totalAccumulatedProfit.toFixed(2),
      monthly_profit: +totalMonthlyProfit.toFixed(2),
      annualised_yield_pct: annualisedYield,
      payback_years: paybackYears,
      avg_occupancy_pct: avgOccupancy,
      active_lots: investments.length,
      currency: portfolioCurrency,
    },
    properties: propertyOut,
    capital_growth: capitalGrowth,
    occupancy_dynamics: occupancyDynamics,
    monthly_reports: reportsRows.map((r) => ({
      project_id: r.key, project_name: r.project_name,
      year_month: r.year_month, adr: r.adr,
      general_comment: r.general_comment, market_insight: r.market_insight, photo_url: r.photo_url,
    })),
  };
}

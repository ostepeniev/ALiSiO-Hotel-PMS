/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Supabase → ALiSiO PMS investor data importer.
//
// User exports each table as CSV from the Supabase Dashboard:
//   - investors.csv     → investors
//   - investments.csv   → investor_investments
//   - payments.csv      → investor_payouts
//   - metrics.csv       → property_monthly_metrics
//   - (optional) monthly_reports.csv → property_monthly_reports
//
// Idempotent via supabase_id column added in PR #36. Re-uploading the
// same CSV is a no-op for already-imported rows (matched by supabase_id).
//
// Properties (= our business_units) are matched by name with fuzzy
// fallback. Unmatched property names cause the row to error — user
// fixes by either renaming a business_unit or creating a new one.
//

import * as crypto from 'crypto';

interface CsvRow { [col: string]: string }

function parseCsv(text: string): CsvRow[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
  const allRows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); allRows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); allRows.push(row); }
  const filtered = allRows.filter((r) => r.some((c) => c.trim().length > 0));
  if (filtered.length < 2) return [];
  const headers = filtered[0].map((h) => h.trim());
  return filtered.slice(1).map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
    return obj;
  });
}

function normName(s: string): string {
  return s.toLowerCase()
    .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
    .replace(/[^a-zа-я0-9]/g, '');
}

interface PropertyMatch { id: string; name: string; matched: boolean; }

function buildPropertyLookup(db: any, orgId: string): Map<string, string> {
  // Map: normalised name → business_unit id
  const rows = db.prepare(
    "SELECT id, name FROM business_units WHERE organization_id = ?"
  ).all(orgId) as { id: string; name: string }[];
  const map = new Map<string, string>();
  for (const r of rows) map.set(normName(r.name), r.id);
  return map;
}

function matchProperty(lookup: Map<string, string>, supabaseName: string): PropertyMatch {
  const normalised = normName(supabaseName);
  const exact = lookup.get(normalised);
  if (exact) return { id: exact, name: supabaseName, matched: true };
  // Substring match fallback
  for (const [normPmsName, id] of lookup) {
    if (normPmsName.includes(normalised) || normalised.includes(normPmsName)) {
      return { id, name: supabaseName, matched: true };
    }
  }
  return { id: '', name: supabaseName, matched: false };
}

function pickFirst(row: CsvRow, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return '';
}

function num(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function toIsoDate(s: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return s.substring(0, 10);
}

export interface SupabaseImportResult {
  investors:    { parsed: number; created: number; skipped: number; errors: string[] };
  investments:  { parsed: number; created: number; skipped: number; errors: string[]; unmatched_properties: string[] };
  payments:     { parsed: number; created: number; skipped: number; errors: string[] };
  metrics:      { parsed: number; created: number; skipped: number; errors: string[]; unmatched_properties: string[] };
}

export interface SupabaseImportInput {
  investorsCsv?: string;
  investmentsCsv?: string;
  paymentsCsv?: string;
  metricsCsv?: string;
  dryRun?: boolean;
}

export function runSupabaseImport(db: any, orgId: string, input: SupabaseImportInput): SupabaseImportResult {
  const result: SupabaseImportResult = {
    investors:    { parsed: 0, created: 0, skipped: 0, errors: [] },
    investments:  { parsed: 0, created: 0, skipped: 0, errors: [], unmatched_properties: [] },
    payments:     { parsed: 0, created: 0, skipped: 0, errors: [] },
    metrics:      { parsed: 0, created: 0, skipped: 0, errors: [], unmatched_properties: [] },
  };

  const propertyLookup = buildPropertyLookup(db, orgId);
  const investorBySupabaseId = new Map<string, string>(); // supabase_id → local id

  // Pre-load existing investor mappings (in case investments/payments
  // come in before investors, or investors already imported)
  const existingInvestors = db.prepare(
    "SELECT id, supabase_id FROM investors WHERE organization_id = ? AND supabase_id IS NOT NULL"
  ).all(orgId) as { id: string; supabase_id: string }[];
  for (const r of existingInvestors) investorBySupabaseId.set(r.supabase_id, r.id);

  const tx = db.transaction(() => {

    // ─── INVESTORS ──────────────────────────────────────
    if (input.investorsCsv) {
      const rows = parseCsv(input.investorsCsv);
      result.investors.parsed = rows.length;
      const checkExisting = db.prepare(
        "SELECT id FROM investors WHERE organization_id = ? AND supabase_id = ?"
      );
      const insert = db.prepare(`
        INSERT INTO investors
          (id, organization_id, name, email, phone, telegram_chat_id, portal_token, status, notes, supabase_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of rows) {
        try {
          const supabaseId = pickFirst(r, 'id', 'investor_id', 'uuid');
          const name = pickFirst(r, 'name', 'full_name');
          if (!supabaseId || !name) {
            result.investors.errors.push(`Missing id/name: ${JSON.stringify(r).substring(0, 100)}`);
            continue;
          }
          const existing = checkExisting.get(orgId, supabaseId) as { id: string } | undefined;
          if (existing) {
            investorBySupabaseId.set(supabaseId, existing.id);
            result.investors.skipped++;
            continue;
          }
          if (input.dryRun) { result.investors.created++; continue; }
          const localId = `inv_sb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          const token = crypto.randomBytes(32).toString('hex');
          insert.run(
            localId, orgId, name,
            pickFirst(r, 'email') || null,
            pickFirst(r, 'phone') || null,
            pickFirst(r, 'telegram_chat_id', 'telegramChatId', 'tg_chat_id') || null,
            pickFirst(r, 'token', 'portal_token') || token,
            (pickFirst(r, 'status') || 'active') === 'archived' ? 'archived' : 'active',
            pickFirst(r, 'notes') || null,
            supabaseId,
          );
          investorBySupabaseId.set(supabaseId, localId);
          result.investors.created++;
        } catch (e: any) {
          result.investors.errors.push(e.message);
        }
      }
    }

    // ─── INVESTMENTS ────────────────────────────────────
    if (input.investmentsCsv) {
      const rows = parseCsv(input.investmentsCsv);
      result.investments.parsed = rows.length;
      const checkExisting = db.prepare(
        "SELECT id FROM investor_investments WHERE organization_id = ? AND supabase_id = ?"
      );
      const insert = db.prepare(`
        INSERT INTO investor_investments
          (id, organization_id, investor_id, project_id, amount, currency, equity_pct,
           invested_at, model_description, is_active, supabase_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const unmatched = new Set<string>();
      for (const r of rows) {
        try {
          const supabaseId = pickFirst(r, 'id', 'investment_id');
          if (!supabaseId) { result.investments.errors.push('Missing id'); continue; }
          if (checkExisting.get(orgId, supabaseId)) { result.investments.skipped++; continue; }

          const supabaseInvestorId = pickFirst(r, 'investor_id', 'investorId');
          const localInvestorId = investorBySupabaseId.get(supabaseInvestorId);
          if (!localInvestorId) {
            result.investments.errors.push(`Investor not found for investor_id=${supabaseInvestorId}`);
            continue;
          }

          // Property matching: try property_id direct, fall back to property_name
          const supabasePropName = pickFirst(r, 'property_name', 'propertyName');
          let projectId = '';
          if (supabasePropName) {
            const m = matchProperty(propertyLookup, supabasePropName);
            if (m.matched) projectId = m.id;
            else unmatched.add(supabasePropName);
          }
          if (!projectId) {
            result.investments.errors.push(`No matching property for "${supabasePropName}" — create business_unit with this name first`);
            continue;
          }

          if (input.dryRun) { result.investments.created++; continue; }
          const localId = `ivst_sb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          insert.run(
            localId, orgId, localInvestorId, projectId,
            num(pickFirst(r, 'amount')),
            pickFirst(r, 'currency') || 'EUR',
            num(pickFirst(r, 'equity_percentage', 'equity_pct', 'equityPercentage')) || null,
            toIsoDate(pickFirst(r, 'date', 'invested_at', 'investedAt')),
            pickFirst(r, 'model_description', 'modelDescription') || null,
            1,
            supabaseId,
          );
          result.investments.created++;
        } catch (e: any) {
          result.investments.errors.push(e.message);
        }
      }
      result.investments.unmatched_properties = [...unmatched];
    }

    // ─── PAYMENTS (= payouts) ───────────────────────────
    if (input.paymentsCsv) {
      const rows = parseCsv(input.paymentsCsv);
      result.payments.parsed = rows.length;
      const checkExisting = db.prepare(
        "SELECT id FROM investor_payouts WHERE organization_id = ? AND supabase_id = ?"
      );
      const insert = db.prepare(`
        INSERT INTO investor_payouts
          (id, organization_id, investor_id, project_id, amount, currency,
           paid_at, comment, supabase_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of rows) {
        try {
          const supabaseId = pickFirst(r, 'id', 'payment_id');
          if (!supabaseId) { result.payments.errors.push('Missing id'); continue; }
          if (checkExisting.get(orgId, supabaseId)) { result.payments.skipped++; continue; }

          const supabaseInvestorId = pickFirst(r, 'investor_id', 'investorId');
          const localInvestorId = investorBySupabaseId.get(supabaseInvestorId);
          if (!localInvestorId) {
            result.payments.errors.push(`Investor not found for investor_id=${supabaseInvestorId}`);
            continue;
          }

          let projectId: string | null = null;
          const supabasePropName = pickFirst(r, 'property_name', 'propertyName');
          if (supabasePropName) {
            const m = matchProperty(propertyLookup, supabasePropName);
            if (m.matched) projectId = m.id;
          }

          if (input.dryRun) { result.payments.created++; continue; }
          const localId = `payout_sb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          insert.run(
            localId, orgId, localInvestorId, projectId,
            num(pickFirst(r, 'amount')),
            pickFirst(r, 'currency') || 'EUR',
            toIsoDate(pickFirst(r, 'date', 'paid_at', 'paidAt')),
            pickFirst(r, 'comment', 'note') || null,
            supabaseId,
          );
          result.payments.created++;
        } catch (e: any) {
          result.payments.errors.push(e.message);
        }
      }
    }

    // ─── METRICS ────────────────────────────────────────
    if (input.metricsCsv) {
      const rows = parseCsv(input.metricsCsv);
      result.metrics.parsed = rows.length;
      const checkExisting = db.prepare(
        "SELECT id FROM property_monthly_metrics WHERE project_id = ? AND year_month = ?"
      );
      const insert = db.prepare(`
        INSERT INTO property_monthly_metrics
          (id, organization_id, project_id, year_month, occupancy_pct, revenue, supabase_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, year_month) DO UPDATE SET
          occupancy_pct = excluded.occupancy_pct,
          revenue = excluded.revenue,
          supabase_id = excluded.supabase_id,
          updated_at = datetime('now')
      `);
      const unmatched = new Set<string>();
      for (const r of rows) {
        try {
          const supabasePropName = pickFirst(r, 'property_name', 'propertyName');
          const month = pickFirst(r, 'month', 'year_month');
          if (!supabasePropName || !month) { result.metrics.errors.push('Missing property_name or month'); continue; }
          const m = matchProperty(propertyLookup, supabasePropName);
          if (!m.matched) {
            unmatched.add(supabasePropName);
            result.metrics.errors.push(`No matching property for "${supabasePropName}"`);
            continue;
          }
          if (input.dryRun) { result.metrics.created++; continue; }
          const supabaseId = pickFirst(r, 'id') || `${supabasePropName}_${month}`;
          const localId = `pmm_sb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          insert.run(
            localId, orgId, m.id, month,
            num(pickFirst(r, 'occupancy_rate', 'occupancy_pct')) || null,
            num(pickFirst(r, 'revenue')) || null,
            supabaseId,
          );
          result.metrics.created++;
        } catch (e: any) {
          result.metrics.errors.push(e.message);
        }
      }
      result.metrics.unmatched_properties = [...unmatched];
    }
  });

  // Always call tx() — dry-run mode short-circuits before each INSERT,
  // so counts populate but no rows are written. The transaction commits
  // with zero changes, which is harmless.
  tx();

  return result;
}

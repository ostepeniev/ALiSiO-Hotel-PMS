/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Statement parsers for channel payouts.
//
// Each parser takes raw CSV/text content and returns a list of normalised
// payout rows. The applyStatementToReceivables() function below takes those
// rows and updates fin_channel_receivables in a single transaction, returning
// per-row match outcomes for the upload UI.
//

export type StatementChannel = 'booking' | 'vrbo' | 'airbnb';

export interface StatementRow {
  external_reservation_id: string;   // e.g. Booking '5098775863', VRBO 'HA-NZ8GBH'
  guest_name: string | null;
  check_in: string;                  // YYYY-MM-DD
  check_out: string | null;          // YYYY-MM-DD
  status: string | null;             // platform-provided status (ok, Cancel, ...)
  gross_amount: number;              // gross before commission
  commission_amount: number;         // total deductions / fees
  net_amount: number;                // what we receive (gross - commission)
  currency: string;
  payout_id: string | null;          // groups rows into a single bank transfer
  payout_date: string | null;        // YYYY-MM-DD
  raw: Record<string, string>;       // original row for debugging
}

// ─────────────────────────────────────────────────────────────────
// CSV utilities
// ─────────────────────────────────────────────────────────────────

/**
 * Minimal RFC 4180 CSV parser. Handles quoted fields, escaped quotes (""),
 * commas inside quotes, CRLF/LF line endings.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

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
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  // Flush trailing cell/row if file doesn't end in newline
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim().length > 0));
}

/** Normalise headers: lowercase + collapse spaces to underscores. */
function indexHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase().trim().replace(/\s+/g, '_');
    map[k] = i;
  });
  return map;
}

function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  // ISO-like already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Booking format: "19 Apr 2026"
  const m1 = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const month = monthNumberFromShort(m1[2]);
    if (month) return `${m1[3]}-${month}-${day}`;
  }
  // VRBO format: "December 30, 2025"
  const m2 = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (m2) {
    const day = m2[2].padStart(2, '0');
    const month = monthNumberFromShort(m2[1]);
    if (month) return `${m2[3]}-${month}-${day}`;
  }
  // Fallback: try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return null;
}

function monthNumberFromShort(m: string): string | null {
  const lookup: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };
  return lookup[m.toLowerCase()] || null;
}

function parseNum(input: string | null | undefined): number {
  if (!input) return 0;
  // Strip currency symbols, spaces, replace comma decimal with dot
  const cleaned = String(input).trim().replace(/[€$£\s]/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────────
// Booking.com weekly statement parser
//
// Header: Type,"Reference number",Check-in,Checkout,"Guest name",
//         "Reservation status",Currency,"Payment status",Amount,
//         "Payout date","Payout ID"
//
// Each row is a reservation. Rows with the same Payout ID = one bank
// transfer. The Amount field is the GROSS booking amount; commission must
// be derived from a separate Booking commission invoice (handled later).
// For now we treat Amount as gross and use estimated commission from the
// receivable's expected_commission until the invoice arrives.
// ─────────────────────────────────────────────────────────────────

export function parseBookingCsv(text: string): StatementRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = indexHeaders(rows[0]);

  const refIdx = headers.reference_number;
  const ciIdx = headers['check-in'] ?? headers.check_in;
  const coIdx = headers.checkout ?? headers['check-out'] ?? headers.check_out;
  const guestIdx = headers.guest_name;
  const statusIdx = headers.reservation_status;
  const currencyIdx = headers.currency;
  const amtIdx = headers.amount;
  const payoutDateIdx = headers.payout_date;
  const payoutIdIdx = headers.payout_id;

  if (refIdx === undefined || amtIdx === undefined) return [];

  const out: StatementRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const refNum = r[refIdx]?.trim();
    if (!refNum) continue;
    const gross = parseNum(r[amtIdx]);
    const raw: Record<string, string> = {};
    rows[0].forEach((h, idx) => { raw[h] = r[idx] ?? ''; });
    out.push({
      external_reservation_id: refNum,
      guest_name: r[guestIdx]?.trim() || null,
      check_in: parseDate(r[ciIdx]) || '',
      check_out: parseDate(r[coIdx]),
      status: r[statusIdx]?.trim() || null,
      gross_amount: gross,
      commission_amount: 0, // Booking ships separately as an invoice
      net_amount: gross,    // Booking pays gross, commission deducted later
      currency: (r[currencyIdx]?.trim() || 'EUR').toUpperCase(),
      payout_id: r[payoutIdIdx]?.trim() || null,
      payout_date: parseDate(r[payoutDateIdx]),
      raw,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// VRBO PayoutSummaryReport parser
//
// Header: "Property ID","Unit ID","Address","Reservation ID",
//         "Traveler First Name","Traveler Last Name","Booking status",
//         "Check-in","Check-out","Nights","Payout date",
//         "Gross booking amount","Deductions","Payout",
//         "Lodging Tax Owner Remits","Tax Withheld","Payout currency"
//
// Reservation ID format: 'HA-NZ8GBH' (matches hostex_channel_id for VRBO).
// Status 'Cancel' rows are recorded as cancelled in receivables.
// ─────────────────────────────────────────────────────────────────

export function parseVrboCsv(text: string): StatementRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = indexHeaders(rows[0]);

  const refIdx = headers.reservation_id;
  const firstIdx = headers.traveler_first_name;
  const lastIdx = headers.traveler_last_name;
  const statusIdx = headers.booking_status;
  const ciIdx = headers['check-in'] ?? headers.check_in;
  const coIdx = headers['check-out'] ?? headers.check_out;
  const grossIdx = headers.gross_booking_amount;
  const deductionsIdx = headers.deductions;
  const payoutIdx = headers.payout;
  const currencyIdx = headers.payout_currency;
  const payoutDateIdx = headers.payout_date;

  if (refIdx === undefined) return [];

  const out: StatementRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const refNum = r[refIdx]?.trim();
    if (!refNum) continue;
    const gross = parseNum(r[grossIdx]);
    const ded = parseNum(r[deductionsIdx]);
    const payout = parseNum(r[payoutIdx]);
    const raw: Record<string, string> = {};
    rows[0].forEach((h, idx) => { raw[h] = r[idx] ?? ''; });
    out.push({
      external_reservation_id: refNum,
      guest_name: [r[firstIdx], r[lastIdx]].filter(Boolean).join(' ').trim() || null,
      check_in: parseDate(r[ciIdx]) || '',
      check_out: parseDate(r[coIdx]),
      status: r[statusIdx]?.trim() || null,
      gross_amount: gross,
      commission_amount: ded,
      net_amount: payout || (gross - ded),
      currency: (r[currencyIdx]?.trim() || 'EUR').toUpperCase(),
      payout_id: parseDate(r[payoutDateIdx]) || null, // VRBO has no explicit payout ID — use date
      payout_date: parseDate(r[payoutDateIdx]),
      raw,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Apply parsed rows to fin_channel_receivables
//
// For each row:
//   - cancelled-status row → mark receivable cancelled (if exists)
//   - normal row → find matching receivable (by external_reservation_id +
//     channel + clearing account), update status='in_statement', set
//     actual_commission, actual_net, statement_payout_id, payout_date
//   - no matching receivable → returned as 'unmatched'
//
// Returns a per-row outcome list for UI display.
// ─────────────────────────────────────────────────────────────────

export interface MatchOutcome {
  external_reservation_id: string;
  guest_name: string | null;
  check_in: string;
  outcome: 'matched' | 'cancelled' | 'unmatched' | 'duplicate';
  receivable_id?: string;
  reservation_id?: string;
  amount?: number;
  currency?: string;
  message?: string;
}

export function applyStatementToReceivables(
  db: any,
  orgId: string,
  channel: StatementChannel,
  rows: StatementRow[],
): { applied: number; cancelled: number; unmatched: number; outcomes: MatchOutcome[] } {
  const outcomes: MatchOutcome[] = [];
  let applied = 0;
  let cancelled = 0;
  let unmatched = 0;

  // Find all clearing accounts for this channel (could be CZK + EUR for Booking)
  const clearingAccounts = db.prepare(`
    SELECT id, currency FROM finance_accounts
    WHERE organization_id = ? AND type = 'clearing'
      AND name LIKE ?
  `).all(orgId, `${channelDisplayName(channel)}%`) as { id: string; currency: string }[];

  const accountIds = clearingAccounts.map((a) => a.id);
  if (accountIds.length === 0) {
    // No clearing accounts for this channel — return all as unmatched
    for (const row of rows) {
      outcomes.push({
        external_reservation_id: row.external_reservation_id,
        guest_name: row.guest_name,
        check_in: row.check_in,
        outcome: 'unmatched',
        message: `No clearing account configured for ${channel}`,
      });
      unmatched++;
    }
    return { applied, cancelled, unmatched, outcomes };
  }

  const placeholders = accountIds.map(() => '?').join(',');
  const findReceivable = db.prepare(`
    SELECT id, status, currency, reservation_id, gross_amount
    FROM fin_channel_receivables
    WHERE organization_id = ? AND clearing_account_id IN (${placeholders})
      AND external_reservation_id = ?
    LIMIT 1
  `);

  const updateMatched = db.prepare(`
    UPDATE fin_channel_receivables
    SET status = CASE WHEN status = 'paid' THEN status ELSE 'in_statement' END,
        actual_commission = ?,
        actual_net = ?,
        statement_payout_id = ?,
        statement_payout_date = ?,
        currency = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const markCancelled = db.prepare(`
    UPDATE fin_channel_receivables
    SET status = 'cancelled', updated_at = datetime('now')
    WHERE id = ? AND status != 'paid'
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const recv = findReceivable.get(orgId, ...accountIds, row.external_reservation_id) as any;

      const isCancelled = row.status && /cancel/i.test(row.status);

      if (!recv) {
        outcomes.push({
          external_reservation_id: row.external_reservation_id,
          guest_name: row.guest_name,
          check_in: row.check_in,
          outcome: 'unmatched',
          amount: row.net_amount,
          currency: row.currency,
          message: 'No matching reservation in PMS — likely missed by Hostex sync',
        });
        unmatched++;
        continue;
      }

      if (isCancelled) {
        markCancelled.run(recv.id);
        outcomes.push({
          external_reservation_id: row.external_reservation_id,
          guest_name: row.guest_name,
          check_in: row.check_in,
          outcome: 'cancelled',
          receivable_id: recv.id,
          reservation_id: recv.reservation_id,
        });
        cancelled++;
        continue;
      }

      updateMatched.run(
        row.commission_amount,
        row.net_amount,
        row.payout_id,
        row.payout_date,
        row.currency,
        recv.id,
      );
      outcomes.push({
        external_reservation_id: row.external_reservation_id,
        guest_name: row.guest_name,
        check_in: row.check_in,
        outcome: 'matched',
        receivable_id: recv.id,
        reservation_id: recv.reservation_id,
        amount: row.net_amount,
        currency: row.currency,
      });
      applied++;
    }
  });
  tx();

  return { applied, cancelled, unmatched, outcomes };
}

function channelDisplayName(channel: StatementChannel): string {
  switch (channel) {
    case 'booking': return 'Booking.com';
    case 'airbnb':  return 'Airbnb';
    case 'vrbo':    return 'VRBO';
  }
}

/**
 * Auto-detect channel from CSV header signature.
 * Returns null when format is unrecognised.
 */
export function detectChannelFromCsv(text: string): StatementChannel | null {
  // Read first line only
  const firstLine = text.substring(0, Math.min(text.length, 600)).split(/\r?\n/)[0]?.toLowerCase() || '';
  if (firstLine.includes('payout id') && firstLine.includes('reference number')) return 'booking';
  if (firstLine.includes('reservation id') && firstLine.includes('property id')) return 'vrbo';
  if (firstLine.includes('confirmation code') || firstLine.includes('listing')) return 'airbnb';
  return null;
}

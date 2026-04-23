#!/usr/bin/env node
// Run: node scripts/migrate_registrations.mjs [--dry-run]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const Database = require('better-sqlite3');
const { default: https } = await import('https');

const DB_PATH = path.join(__dirname, '../data/alisio.db');
const DRY_RUN = process.argv.includes('--dry-run');
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_GUESTS_SCRIPT_URL || '';
const DAYS_BACK = parseInt(process.env.DAYS_BACK || '10', 10);

const db = new Database(DB_PATH);

console.log(`[migrate] DRY_RUN=${DRY_RUN}, DAYS_BACK=${DAYS_BACK}`);
console.log(`[migrate] Google Sheets: ${GOOGLE_SCRIPT_URL ? 'configured ✓' : 'NOT CONFIGURED'}`);

// ── 1. Find all reservation_guests from last N days ──────────────────────────
const rows = db.prepare(`
  SELECT rg.*,
         r.check_in, r.check_out, r.adults,
         r.guest_page_token
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  WHERE rg.created_at >= datetime('now', '-' || ? || ' days')
  ORDER BY rg.created_at ASC
`).all(DAYS_BACK);

console.log(`[migrate] Found ${rows.length} entries in reservation_guests since ${DAYS_BACK} days ago`);

if (rows.length === 0) {
  console.log('[migrate] Nothing to migrate.');
  process.exit(0);
}

// ── 2. Insert into guest_registrations (for dashboard) ─────────────────────
const insertGr = db.prepare(`
  INSERT OR IGNORE INTO guest_registrations (id, reservation_id, guest_id, is_primary, registered_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateStatus = db.prepare(`
  UPDATE reservations SET registration_status = 'registered' WHERE id = ?
`);

let migratedToDashboard = 0;
const seenReservations = new Set();

for (const row of rows) {
  if (!row.guest_id) {
    console.warn(`[migrate] SKIP (no guest_id): ${row.first_name} ${row.last_name}`);
    continue;
  }

  const existing = db.prepare(
    'SELECT id FROM guest_registrations WHERE reservation_id = ? AND guest_id = ?'
  ).get(row.reservation_id, row.guest_id);

  if (existing) {
    console.log(`[migrate] Already synced: ${row.first_name} ${row.last_name}`);
    continue;
  }

  const isPrimary = seenReservations.has(row.reservation_id) ? 0 : 1;
  seenReservations.add(row.reservation_id);
  const grId = `gr_migr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const registeredAt = row.created_at || new Date().toISOString();

  if (!DRY_RUN) {
    insertGr.run(grId, row.reservation_id, row.guest_id, isPrimary, registeredAt);
    if (isPrimary) updateStatus.run(row.reservation_id);
    migratedToDashboard++;
    console.log(`[migrate] ✅ dashboard: ${row.first_name} ${row.last_name} (${row.check_in} → ${row.check_out})`);
  } else {
    console.log(`[migrate] DRY: ${row.first_name} ${row.last_name} | res=${row.reservation_id.slice(-8)}`);
    migratedToDashboard++;
  }
}

console.log(`\n[migrate] Dashboard: ${migratedToDashboard} ${DRY_RUN ? '(dry-run)' : 'INSERTED'}`);

// ── 3. Send to Google Sheets ────────────────────────────────────────────────
if (!GOOGLE_SCRIPT_URL) {
  console.warn('[migrate] Skipping Sheets — GOOGLE_GUESTS_SCRIPT_URL not set');
  process.exit(0);
}

function postToSheets(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL(GOOGLE_SCRIPT_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 150) }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

let sheetsSent = 0;
let sheetsErrors = 0;
let sheetsSkipped = 0;

for (const row of rows) {
  const nights = row.check_in && row.check_out
    ? Math.max(0, (new Date(row.check_out + 'T00:00:00Z') - new Date(row.check_in + 'T00:00:00Z')) / 86400000)
    : 0;

  const payload = {
    action: 'guest',
    full_name: `${row.last_name} ${row.first_name}`.trim(),
    surname: row.last_name || '',
    first_name: row.first_name || '',
    birth_date: row.date_of_birth || '',
    doc_type: row.document_type || '',
    doc_number: row.document_number || '',
    country_code: '',
    nationality: row.nationality || '',
    address: row.address || '',
    visa_number: '',
    check_in: row.check_in || '',
    check_out: row.check_out || '',
    nights,
    is_foreigner: 'Tak',
    tax_amount: 0,
    exempt_reason: '',
    purpose: '',
    note: '[Migrated from guest portal web registration]',
  };

  const missing = [];
  if (!payload.surname) missing.push('surname');
  if (!payload.doc_number) missing.push('doc_number');
  if (!payload.nationality) missing.push('nationality');
  if (!payload.birth_date) missing.push('birth_date');

  if (missing.length > 0) {
    console.warn(`[migrate] ⚠️  ${payload.full_name} missing: ${missing.join(', ')}`);
  }

  if (!DRY_RUN) {
    const result = await postToSheets(payload);
    if (result.status === 200 && !result.body.toLowerCase().includes('error')) {
      sheetsSent++;
      console.log(`[migrate] 📊 Sheets OK: ${payload.full_name}`);
    } else {
      sheetsErrors++;
      console.error(`[migrate] ❌ Sheets FAIL: ${payload.full_name} status=${result.status} body=${result.body}`);
    }
    await new Promise(r => setTimeout(r, 600)); // rate limit
  } else {
    console.log(`[migrate] DRY Sheets: ${payload.full_name} | ${payload.check_in} → ${payload.check_out}`);
    sheetsSent++;
  }
}

console.log(`\n[migrate] Sheets: ${sheetsSent} sent, ${sheetsErrors} errors ${DRY_RUN ? '(dry-run)' : ''}`);
console.log('[migrate] Done ✅');

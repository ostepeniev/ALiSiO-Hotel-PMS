/**
 * migrate_registrations.js
 * One-time: syncs all reservation_guests → guest_registrations (for PMS dashboard)
 * and optionally sends each guest to Google Sheets via the Apps Script endpoint.
 *
 * Run on VPS: node scripts/migrate_registrations.js
 * Or locally: node scripts/migrate_registrations.js --dry-run
 */
const Database = require("better-sqlite3");
const path = require("path");
const https = require("https");

const DB_PATH = path.join(__dirname, "../data/alisio.db");
const DRY_RUN = process.argv.includes("--dry-run");
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_GUESTS_SCRIPT_URL || "";
const DAYS_BACK = parseInt(process.env.DAYS_BACK || "7", 10);

const db = new Database(DB_PATH);

console.log(`[migrate] DRY_RUN=${DRY_RUN}, DAYS_BACK=${DAYS_BACK}`);

// ── 1. Find all reservation_guests from last N days ──────────────────────────
const since = new Date();
since.setDate(since.getDate() - DAYS_BACK);
const sinceStr = since.toISOString().slice(0, 10); // YYYY-MM-DD

const rows = db.prepare(`
  SELECT rg.*,
         r.check_in, r.check_out, r.adults,
         g.first_name as booking_first_name, g.last_name as booking_last_name,
         r.guest_page_token
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  JOIN guests g ON r.guest_id = g.id
  WHERE rg.created_at >= ?
  ORDER BY rg.created_at ASC
`).all(sinceStr);

console.log(`[migrate] Found ${rows.length} entries in reservation_guests since ${sinceStr}`);

if (rows.length === 0) {
  console.log("[migrate] Nothing to migrate.");
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
    console.warn(`[migrate] SKIP — no guest_id for rg.id=${row.id} (${row.first_name} ${row.last_name})`);
    continue;
  }

  // Check if already in guest_registrations
  const existing = db.prepare(
    "SELECT id FROM guest_registrations WHERE reservation_id = ? AND guest_id = ?"
  ).get(row.reservation_id, row.guest_id);

  if (existing) {
    console.log(`[migrate] Already in guest_registrations: ${row.first_name} ${row.last_name}`);
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
    console.log(`[migrate] ✅ dashboard: ${row.first_name} ${row.last_name} | res=${row.reservation_id}`);
  } else {
    console.log(`[migrate] DRY: would insert ${row.first_name} ${row.last_name} | res=${row.reservation_id}`);
    migratedToDashboard++;
  }
}

console.log(`\n[migrate] Dashboard sync: ${migratedToDashboard} entries ${DRY_RUN ? "(dry-run)" : "inserted"}`);

// ── 3. Send to Google Sheets ────────────────────────────────────────────────
if (!GOOGLE_SCRIPT_URL) {
  console.warn("\n[migrate] GOOGLE_GUESTS_SCRIPT_URL not set — skipping Sheets sync.");
  console.warn("         Set env var and re-run to sync to Google Sheets:");
  console.warn("         GOOGLE_GUESTS_SCRIPT_URL=https://script.google.com/... node scripts/migrate_registrations.js");
  process.exit(0);
}

async function postToSheets(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL(GOOGLE_SCRIPT_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data.slice(0, 100) }));
    });
    req.on("error", (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

// Group by reservation to detect duplicates already in Sheets (we can't check, so we send all)
let sheetsSent = 0;
let sheetsErrors = 0;

for (const row of rows) {
  const nights = row.check_in && row.check_out
    ? Math.max(0, (new Date(row.check_out) - new Date(row.check_in)) / 86400000)
    : 0;

  const payload = {
    action: "guest",
    full_name: `${row.last_name} ${row.first_name}`.trim(),
    surname: row.last_name || "",
    first_name: row.first_name || "",
    birth_date: row.date_of_birth || "",
    doc_type: row.document_type || "",
    doc_number: row.document_number || "",
    country_code: "",  // not in reservation_guests schema
    nationality: row.nationality || "",
    address: row.address || "",
    visa_number: "",
    check_in: row.check_in || "",
    check_out: row.check_out || "",
    nights: nights,
    is_foreigner: "?",  // not tracked in guest portal registration
    tax_amount: 0,
    exempt_reason: "",
    purpose: "",
    note: "[Migrated from guest portal web registration]",
  };

  // Check for missing critical fields
  const missing = [];
  if (!payload.surname) missing.push("surname");
  if (!payload.doc_number) missing.push("doc_number");
  if (!payload.nationality) missing.push("nationality");
  if (!payload.birth_date) missing.push("birth_date");

  if (missing.length > 0) {
    console.warn(`[migrate] ⚠️  Missing fields for ${payload.full_name}: ${missing.join(", ")}`);
  }

  if (!DRY_RUN) {
    const result = await postToSheets(payload);
    if (result.status === 200) {
      sheetsSent++;
      console.log(`[migrate] 📊 Sheets: ${payload.full_name} → status=${result.status}`);
    } else {
      sheetsErrors++;
      console.error(`[migrate] ❌ Sheets error for ${payload.full_name}: status=${result.status} body=${result.body}`);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  } else {
    console.log(`[migrate] DRY: would send to Sheets: ${payload.full_name}`);
    sheetsSent++;
  }
}

console.log(`\n[migrate] Sheets sync: ${sheetsSent} sent, ${sheetsErrors} errors ${DRY_RUN ? "(dry-run)" : ""}`);
console.log("[migrate] Done ✅");

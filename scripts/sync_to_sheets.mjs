#!/usr/bin/env node
// Run: node scripts/sync_to_sheets.mjs
// Syncs all reservation_guests from last 10 days to Google Sheets (with redirect follow)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';
import http from 'http';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../data/alisio.db');
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_GUESTS_SCRIPT_URL || '';
const DAYS_BACK = parseInt(process.env.DAYS_BACK || '10', 10);

if (!GOOGLE_SCRIPT_URL) {
  console.error('ERROR: GOOGLE_GUESTS_SCRIPT_URL not set');
  process.exit(1);
}

const db = new Database(DB_PATH);

const rows = db.prepare(`
  SELECT rg.*, r.check_in, r.check_out
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  WHERE rg.created_at >= datetime('now', '-' || ? || ' days')
  ORDER BY rg.created_at ASC
`).all(DAYS_BACK);

console.log(`[sheets] Found ${rows.length} guests to sync to Google Sheets`);

function postWithRedirects(url, payload, maxRedirects = 5) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        // Follow redirect — Google Apps Script always redirects
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;

        // After redirect, use GET (as per 302 semantics) or POST again
        // Google Apps Script needs GET after redirect
        const rParsed = new URL(redirectUrl);
        const rLib = rParsed.protocol === 'https:' ? https : http;
        const rReq = rLib.request({
          hostname: rParsed.hostname,
          path: rParsed.pathname + rParsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        }, (rRes) => {
          let data = '';
          rRes.on('data', c => data += c);
          rRes.on('end', () => resolve({ status: rRes.statusCode, body: data.slice(0, 200) }));
        });
        rReq.on('error', e => resolve({ status: 0, body: e.message }));
        rReq.write(body);
        rReq.end();
        res.resume();
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 200) }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

let sent = 0;
let errors = 0;

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

  const result = await postWithRedirects(GOOGLE_SCRIPT_URL, payload);
  if (result.status === 200 && !result.body.toLowerCase().includes('error')) {
    sent++;
    console.log(`[sheets] ✅ ${payload.full_name} | ${payload.check_in}`);
  } else {
    errors++;
    console.error(`[sheets] ❌ ${payload.full_name} → status=${result.status} | ${result.body.slice(0, 80)}`);
  }
  await new Promise(r => setTimeout(r, 700));
}

console.log(`\n[sheets] Done: ${sent} sent, ${errors} errors`);

#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../data/alisio.db'));

// Find Fischer reservation token
const r = db.prepare(`
  SELECT r.guest_page_token, g.first_name, g.last_name, r.check_in, r.check_out,
    (SELECT COUNT(*) FROM guest_registrations gr WHERE gr.reservation_id = r.id) as reg_count,
    (SELECT COUNT(*) FROM reservation_guests rg WHERE rg.reservation_id = r.id) as rg_count
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  WHERE g.last_name LIKE '%Fischer%' OR g.first_name LIKE '%Stefanie%'
  LIMIT 5
`).all();
console.log('Fischer reservations:', JSON.stringify(r, null, 2));

// Also show total counts
const total_gr = db.prepare('SELECT COUNT(*) as c FROM guest_registrations').get();
const total_rg = db.prepare('SELECT COUNT(*) as c FROM reservation_guests').get();
console.log('Total guest_registrations:', total_gr.c);
console.log('Total reservation_guests:', total_rg.c);

// Show last 5 entries in guest_registrations
const last_gr = db.prepare(`
  SELECT gr.*, g.first_name, g.last_name 
  FROM guest_registrations gr 
  JOIN guests g ON gr.guest_id = g.id 
  ORDER BY gr.registered_at DESC LIMIT 5
`).all();
console.log('Last 5 guest_registrations:', JSON.stringify(last_gr, null, 2));

#!/usr/bin/env node
const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');

// 1. Show what's in reservation_guests (last 10 days)
const rows = db.prepare(`
  SELECT rg.id, rg.first_name, rg.last_name, rg.document_number,
         rg.nationality, rg.date_of_birth, rg.document_type, rg.address,
         rg.reservation_id, rg.guest_id, rg.created_at,
         r.check_in, r.check_out
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  WHERE rg.created_at >= datetime('now', '-10 days')
  ORDER BY rg.created_at DESC
`).all();

console.log('=== reservation_guests (last 10 days) ===');
console.log(JSON.stringify(rows, null, 2));
console.log('Total:', rows.length);

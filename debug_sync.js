const db = require('better-sqlite3')('./data/alisio.db');

// 1. Real unit IDs in DB
const units = db.prepare('SELECT id, name FROM units LIMIT 20').all();
console.log('=== UNITS IN DB ===');
units.forEach(u => console.log(u.id, '|', u.name));

// 2. Which Hostex reservations ARE in DB
console.log('\n=== SYNCED HOSTEX RESERVATIONS ===');
const synced = db.prepare(`
  SELECT r.hostex_reservation_code, r.unit_id, g.first_name, g.last_name, r.check_in, r.status, r.hostex_channel_type
  FROM reservations r
  LEFT JOIN guests g ON r.guest_id = g.id
  WHERE r.hostex_reservation_code IS NOT NULL
  ORDER BY r.check_in
`).all();
synced.forEach(r => console.log(r.check_in, '|', r.first_name, r.last_name, '|', r.unit_id, '|', r.status, '|', r.hostex_channel_type));
console.log('TOTAL SYNCED:', synced.length);

// 3. Unique unit_ids used
const unitIds = [...new Set(synced.map(r => r.unit_id))];
console.log('\n=== UNIT IDs USED IN HOSTEX RESERVATIONS ===');
unitIds.forEach(id => console.log(id));

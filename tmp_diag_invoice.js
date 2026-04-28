const db = require('better-sqlite3')('data/alisio.db', { readonly: true });

// Search with broad criteria
const guests = db.prepare(
  "SELECT id, first_name, last_name, email FROM guests WHERE last_name LIKE '%ich%' OR first_name LIKE '%avel%' OR last_name LIKE '%avel%'"
).all();
console.log('Partial match (Mich / Pavel):');
console.log(JSON.stringify(guests, null, 2));

// Also check reservations table directly for names
const resGuests = db.prepare(
  "SELECT id, first_name, last_name, email FROM guests ORDER BY created_at DESC LIMIT 30"
).all();
console.log('\nLast 30 guests:');
console.log(JSON.stringify(resGuests, null, 2));

db.close();

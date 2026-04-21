const db = require('better-sqlite3')('./data/alisio.db');

try {
  const cols = db.prepare('PRAGMA table_info(reservations)').all().map(c => c.name);
  console.log('Has hostex_reservation_code:', cols.includes('hostex_reservation_code'));

  if (cols.includes('hostex_reservation_code')) {
    const test = db.prepare("SELECT * FROM reservations WHERE hostex_reservation_code = '5-6AQ0HDJ8D'").get();
    console.log('TEST BOOKING:', JSON.stringify(test));
  }

  const total = db.prepare('SELECT COUNT(*) as cnt FROM reservations').get();
  console.log('Total reservations in local DB:', total.cnt);

  // Show most recent
  const recent = db.prepare('SELECT id, first_name, last_name, check_in, check_out, source, created_at FROM reservations ORDER BY created_at DESC LIMIT 5').all();
  console.log('Most recent:', JSON.stringify(recent, null, 2));

} catch (e) {
  console.log('Error:', e.message);
}

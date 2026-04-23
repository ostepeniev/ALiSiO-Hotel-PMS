const path = require('path');
const db = require('better-sqlite3')(path.resolve(__dirname, '..', 'data', 'alisio.db'));
// Check if reservations has currency column
const cols = db.prepare("PRAGMA table_info(reservations)").all().map(c => c.name);
console.log('Has currency:', cols.includes('currency'));
// Find our test reservation
const res = db.prepare("SELECT id, total_price, status, payment_status FROM reservations ORDER BY created_at DESC LIMIT 3").all();
console.log('Recent reservations:', JSON.stringify(res, null, 2));
db.close();

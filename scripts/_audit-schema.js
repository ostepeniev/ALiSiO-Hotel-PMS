const Database = require('better-sqlite3');
const db = new Database('data/alisio.db');
const cols = db.prepare("PRAGMA table_info(booking_drafts)").all().map(c => c.name);
console.log('booking_drafts columns:', cols.join(', '));
const serviceOrdersCols = db.prepare("PRAGMA table_info(service_orders)").all().map(c => c.name);
console.log('service_orders columns:', serviceOrdersCols.join(', '));
const bsoCols = db.prepare("PRAGMA table_info(booking_service_orders)").all().map(c => c.name);
console.log('booking_service_orders columns:', bsoCols.join(', '));
db.close();

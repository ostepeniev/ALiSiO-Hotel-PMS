const db = require('better-sqlite3')('data/alisio.db');
const guestCols = db.prepare('PRAGMA table_info(guests)').all().map(c => c.name);
console.log('guests cols:', guestCols.join(', '));
const resSQL = db.prepare("SELECT sql FROM sqlite_master WHERE name='reservations'").get();
console.log('reservations has CHECK(source):', resSQL.sql.includes('CHECK (source'));
console.log('reservations cols:', db.prepare('PRAGMA table_info(reservations)').all().map(c => c.name).join(', '));
db.close();

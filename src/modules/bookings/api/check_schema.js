const { getDb } = require('./src/core/db');
const db = getDb();
try {
  const info = db.prepare("PRAGMA table_info(booking_sites)").all();
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.error(e);
}

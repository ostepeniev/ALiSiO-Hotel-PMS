const Database = require('better-sqlite3');
const db = new Database('data/alisio.db');
db.pragma('foreign_keys = ON');
try {
  const d = db.prepare("DELETE FROM reservations WHERE (id LIKE 'r_17770%' AND id != 'r_1777061060674') OR id LIKE 'r_177706%'").run();
  const g = db.prepare("DELETE FROM guests WHERE first_name = 'Test' AND last_name = 'User' OR first_name = 'Jan' AND last_name = 'Novak'").run();
  console.log('Deleted test reservations:', d.changes, 'test guests:', g.changes);
} catch(e) { console.error(e.message); }
db.close();

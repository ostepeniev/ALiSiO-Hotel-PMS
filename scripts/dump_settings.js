const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE '%email%'").all();
  console.log(JSON.stringify(settings, null, 2));
} catch (err) {
  console.error(err.message);
}

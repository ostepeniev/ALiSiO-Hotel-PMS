const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const users = db.prepare('SELECT email, role FROM app_users').all();
  console.log(JSON.stringify(users, null, 2));
} catch (err) {
  console.error(err.message);
}

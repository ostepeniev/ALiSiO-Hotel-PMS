const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const hash = bcrypt.hashSync('Rozum2026!', 10);
  db.prepare('UPDATE app_users SET password_hash = ?, is_active = 1 WHERE email = ?')
    .run(hash, 'admin@alisio.cz');
  console.log('Password successfully reset for admin@alisio.cz');
} catch (err) {
  console.error(err.message);
}

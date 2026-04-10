const D = require('better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');
const r = db.prepare("DELETE FROM email_processed WHERE category = 'blacklisted'").run();
console.log('Cleared blacklisted records:', r.changes);

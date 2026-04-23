const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const lastGmail = db.prepare("SELECT created_at FROM crm_messages WHERE metadata_json LIKE '%gmail%' ORDER BY created_at DESC LIMIT 1").get();
  console.log('Last Gmail message:', lastGmail);
} catch (err) {
  console.error(err.message);
}

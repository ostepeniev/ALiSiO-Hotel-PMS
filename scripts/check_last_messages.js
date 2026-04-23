const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const messages = db.prepare("SELECT content, created_at, channel_type FROM crm_messages ORDER BY created_at DESC LIMIT 30").all();
  console.log(JSON.stringify(messages, null, 2));
} catch (err) {
  console.error(err.message);
}

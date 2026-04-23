const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const counts = db.prepare("SELECT count(*) as cnt, metadata_json FROM crm_messages WHERE channel_type = 'email' GROUP BY metadata_json LIKE '%emailcz%'").all();
  console.log(JSON.stringify(counts, null, 2));
  
  const lastMessages = db.prepare(`
    SELECT content, created_at, metadata_json 
    FROM crm_messages 
    WHERE channel_type = 'email' AND metadata_json LIKE '%emailcz%'
    ORDER BY created_at DESC LIMIT 5
  `).all();
  console.log('Last emailcz messages:', JSON.stringify(lastMessages, null, 2));
} catch (err) {
  console.error(err.message);
}

const Database = require('better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');
try {
  const articles = db.prepare("SELECT topic, content FROM crm_knowledge_base WHERE content LIKE '%heslo%' OR content LIKE '%password%'").all();
  console.log(JSON.stringify(articles, null, 2));
} catch (err) {
  console.error(err.message);
}

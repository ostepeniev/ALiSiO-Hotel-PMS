const D = require('better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');
const rows = db.prepare('SELECT stage, name FROM crm_prompt_configs ORDER BY stage').all();
console.log('Stage prompts in DB:', rows.length);
rows.forEach(r => console.log(`  ${r.stage} | ${r.name}`));

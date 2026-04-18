const D = require('better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');
const row = db.prepare("SELECT system_prompt, context_instructions FROM crm_prompt_configs WHERE stage = 'new'").get();
// Write full text to file
const fs = require('fs');
fs.writeFileSync('/tmp/master_prompt.txt', '=== SYSTEM PROMPT (stage: new) ===\n\n' + row.system_prompt + '\n\n=== CONTEXT INSTRUCTIONS ===\n\n' + (row.context_instructions || ''));
console.log('Written to /tmp/master_prompt.txt, length:', row.system_prompt.length);

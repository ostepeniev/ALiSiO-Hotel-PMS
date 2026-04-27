const Database = require('better-sqlite3');
const db = new Database('data/alisio.db');
const r = db.prepare("SELECT id, name_en, available_in_widget FROM additional_services WHERE is_active = 1 ORDER BY sort_order").all();
console.log(JSON.stringify(r, null, 2));
db.close();

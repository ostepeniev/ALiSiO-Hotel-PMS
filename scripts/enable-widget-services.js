const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'alisio.db'));
db.prepare(`UPDATE additional_services SET available_in_widget = 1 WHERE id IN ('svc_breakfast','svc_sauna','svc_tub','svc_bbq')`).run();
const result = db.prepare(`SELECT id, name_en, available_in_widget FROM additional_services WHERE available_in_widget = 1`).all();
console.log('Enabled:', result);
db.close();

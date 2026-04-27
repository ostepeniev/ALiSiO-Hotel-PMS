const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'alisio.db');
const db = new Database(dbPath);

const units = db.prepare(`
  SELECT id, name, code, beds FROM units WHERE building_id = 'bldg_f'
`).all();

console.log('--- BUILDING F UNITS ---');
units.forEach(u => {
  console.log(`${u.id} | ${u.name} | Beds: ${u.beds}`);
});

db.close();

const D = require('/root/projects/alisio-pms/node_modules/better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');

// ── 1. Fix stale WiFi ─────────────────────────────────────────────────────
console.log('BEFORE:', JSON.stringify(
  db.prepare("SELECT unit_type_id, wifi_network FROM guest_page_config").all()
));

db.prepare(`
  UPDATE guest_page_config
  SET wifi_network = NULL, wifi_password = NULL
  WHERE unit_type_id IN ('ut_mirror','ut_glamp4','ut_f3','ut_f2')
  AND wifi_network = 'ALiSiO_Guest'
`).run();

console.log('AFTER:', JSON.stringify(
  db.prepare("SELECT unit_type_id, wifi_network FROM guest_page_config").all()
));

// ── 2. Create content_translations table (if missing) ─────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS content_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL,
    source_text TEXT NOT NULL,
    lang TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(text_hash, lang)
  )
`);
console.log('content_translations table: OK');

// ── 3. Add missing lang columns to additional_services ────────────────────
const newCols = [
  'name_de','name_cs','name_pl','name_nl','name_fr',
  'description_en','description_de','description_cs','description_pl','description_nl','description_fr',
  'unit_label_en','unit_label_de','unit_label_cs','unit_label_pl','unit_label_nl','unit_label_fr'
];
for (const col of newCols) {
  try { db.exec(`ALTER TABLE additional_services ADD COLUMN ${col} TEXT`); console.log('+ added:', col); }
  catch { console.log('= exists:', col); }
}

// ── 4. Verify fix ─────────────────────────────────────────────────────────
const r = db.prepare(`SELECT u.unit_type_id FROM reservations r JOIN units u ON r.unit_id=u.id WHERE r.guest_page_token='usajax7e5m1x'`).get();
const utcfg = r ? db.prepare('SELECT wifi_network FROM guest_page_config WHERE unit_type_id=?').get(r.unit_type_id) : null;
const pcfg = db.prepare(`SELECT wifi_network FROM property_guest_config WHERE property_id=(SELECT property_id FROM reservations WHERE guest_page_token='usajax7e5m1x')`).get();
console.log('\nVerify usajax7e5m1x:');
console.log('  unit_type_id:', r?.unit_type_id, '| unit wifi (should be NULL):', utcfg?.wifi_network);
console.log('  property wifi (should be QA Glamping):', pcfg?.wifi_network);
console.log('\nPhase 1 COMPLETE');

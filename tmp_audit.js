const D = require('/root/projects/alisio-pms/node_modules/better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');

// Tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:', tables.map(x => x.name).join(', '));

// The specific reservation
const r = db.prepare("SELECT r.id, r.unit_id, u.name as unit_name, u.unit_type_id, r.property_id FROM reservations r JOIN units u ON r.unit_id=u.id WHERE r.guest_page_token='usajax7e5m1x'").get();
console.log('\nReservation usajax7e5m1x:', JSON.stringify(r));

if (r) {
  const utcfg = db.prepare('SELECT wifi_network, wifi_password, lock_code FROM guest_page_config WHERE unit_type_id=?').get(r.unit_type_id);
  console.log('Unit type config:', JSON.stringify(utcfg));
  
  const pcfg = db.prepare('SELECT wifi_network, wifi_password FROM property_guest_config WHERE property_id=?').get(r.property_id);
  console.log('Property config:', JSON.stringify(pcfg));
}

// content_translations
try {
  const cnt = db.prepare('SELECT COUNT(*) as n FROM content_translations').get();
  console.log('\ncontent_translations count:', cnt.n);
} catch(e) {
  console.log('\nNo content_translations table:', e.message);
}

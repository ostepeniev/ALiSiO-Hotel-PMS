var db = require('./node_modules/better-sqlite3')('data/alisio.db');

// 1. Get booking info
var booking = db.prepare("SELECT r.unit_id, r.property_id, u.unit_type_id, u.name as unit_name FROM reservations r JOIN units u ON r.unit_id = u.id WHERE r.guest_page_token='9mftqrprq83i'").get();
console.log('=== BOOKING ===', JSON.stringify(booking));

// 2. Unit type config
var utConfig = db.prepare('SELECT rules, useful_info, wifi_network, faq_items FROM guest_page_config WHERE unit_type_id=?').get(booking.unit_type_id);
console.log('\n=== UNIT TYPE CONFIG ===');
console.log('rules:', utConfig && utConfig.rules ? utConfig.rules.substring(0, 200) : 'NULL');
console.log('useful_info:', utConfig && utConfig.useful_info ? utConfig.useful_info.substring(0, 200) : 'NULL');
console.log('wifi:', utConfig ? utConfig.wifi_network : 'NULL');

// 3. Property config
var propConfig = db.prepare('SELECT * FROM property_guest_config WHERE property_id=?').get(booking.property_id);
console.log('\n=== PROPERTY CONFIG ===');
if (propConfig) {
  console.log('property_id:', propConfig.property_id);
  console.log('rules:', propConfig.rules ? propConfig.rules.substring(0, 200) : 'NULL');
  console.log('useful_info:', propConfig.useful_info ? propConfig.useful_info.substring(0, 200) : 'NULL');
  console.log('wifi:', propConfig.wifi_network);
  console.log('faq:', propConfig.faq_items ? propConfig.faq_items.substring(0, 200) : 'NULL');
} else {
  console.log('NO PROPERTY CONFIG FOUND');
}

// 4. Services
var svcs = db.prepare('SELECT id, name, icon, price, currency FROM additional_services WHERE property_id=? AND is_active=1').all(booking.property_id);
console.log('\n=== SERVICES ===');
svcs.forEach(function(s) { console.log(s.id, '|', s.name, '|', s.price, s.currency); });

// 5. Merge analysis
console.log('\n=== MERGE ANALYSIS ===');
console.log('UT rules truthy?', !!(utConfig && utConfig.rules));
console.log('Prop rules truthy?', !!(propConfig && propConfig.rules));
console.log('Result: uses', (utConfig && utConfig.rules) ? 'UNIT TYPE (override)' : 'PROPERTY');
console.log('UT useful_info truthy?', !!(utConfig && utConfig.useful_info));
console.log('Prop useful_info truthy?', !!(propConfig && propConfig.useful_info));
console.log('Result: uses', (utConfig && utConfig.useful_info) ? 'UNIT TYPE (override)' : 'PROPERTY');

// 6. Check all property configs
var allPropConfigs = db.prepare('SELECT property_id, wifi_network FROM property_guest_config').all();
console.log('\n=== ALL PROPERTY CONFIGS ===');
allPropConfigs.forEach(function(c) { console.log(c.property_id, '|', c.wifi_network); });

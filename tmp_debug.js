var db = require('./node_modules/better-sqlite3')('data/alisio.db');
var all = db.prepare('SELECT property_id, rules, useful_info FROM property_guest_config').all();
console.log('Total property configs:', all.length);
all.forEach(function(c) {
  console.log('\n=== Property:', c.property_id, '===');
  console.log('Rules (first 150):', c.rules ? c.rules.substring(0, 150) : 'NULL');
  console.log('Useful (first 200):', c.useful_info ? c.useful_info.substring(0, 200) : 'NULL');
});

// Also check unit type guest_page_config  
var ut = db.prepare('SELECT unit_type_id, rules, useful_info FROM guest_page_config WHERE unit_type_id=?').get('ut_stealth');
console.log('\n=== UT stealth ===');
console.log('UT Rules (first 150):', ut && ut.rules ? ut.rules.substring(0, 150) : 'NULL');
console.log('UT Useful (first 200):', ut && ut.useful_info ? ut.useful_info.substring(0, 200) : 'NULL');

const db = require('better-sqlite3')('data/alisio.db');
db.prepare('UPDATE property_guest_config SET weather_lat = ?, weather_lon = ? WHERE property_id = ?')
  .run(50.19517710413591, 12.860128251841818, 'prop_main_001');
console.log('Updated coordinates to 50.1952, 12.8601');
const r = db.prepare('SELECT weather_lat, weather_lon FROM property_guest_config WHERE property_id = ?').get('prop_main_001');
console.log('Verify:', r);

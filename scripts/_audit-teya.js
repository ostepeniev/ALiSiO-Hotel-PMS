const Database = require('better-sqlite3');
const db = new Database('data/alisio.db');

// Check reservations created by widget
const recent = db.prepare("SELECT id, guest_id, unit_id, total_price, status, payment_status, source FROM reservations WHERE source='widget_kemp' ORDER BY created_at DESC LIMIT 5").all();
console.log('Recent widget reservations:', JSON.stringify(recent, null, 2));

// Check booking_sites
const sites = db.prepare("SELECT id, slug, site_url, payment_config FROM booking_sites LIMIT 5").all();
console.log('Booking sites:', JSON.stringify(sites.map(s => ({...s, payment_config: s.payment_config?.substring(0,100)})), null, 2));

db.close();

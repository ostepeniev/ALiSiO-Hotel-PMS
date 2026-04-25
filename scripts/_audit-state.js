const Database = require('better-sqlite3');
const db = new Database('data/alisio.db');

// Check reservations created by widget
const recent = db.prepare("SELECT id, guest_id, unit_id, total_price, status, payment_status, source, created_at FROM reservations WHERE source='widget_kemp' ORDER BY created_at DESC LIMIT 10").all();
console.log('Widget reservations:', JSON.stringify(recent, null, 2));

// Check units with camping-related names
const units = db.prepare(`
  SELECT u.id, u.name, u.is_active, ut.code, ut.name as type_name 
  FROM units u 
  JOIN unit_types ut ON u.unit_type_id = ut.id 
  WHERE u.property_id = 'prop_main_001'
`).all();
console.log('Units:', JSON.stringify(units, null, 2));

// Check service_orders
const orders = db.prepare("SELECT * FROM service_orders ORDER BY created_at DESC LIMIT 5").all();
console.log('Service orders (recent):', JSON.stringify(orders, null, 2));

// Check guests recently created from widget
const guests = db.prepare("SELECT id, first_name, last_name, email, source FROM guests WHERE source='widget_kemp' ORDER BY created_at DESC LIMIT 5").all();
console.log('Widget guests:', JSON.stringify(guests, null, 2));

// Check booking_sites payment config
const sites = db.prepare("SELECT id, slug, site_url, payment_config FROM booking_sites").all();
console.log('Booking sites:', JSON.stringify(sites.map(s => ({id: s.id, slug: s.slug, hasCfg: s.payment_config?.length > 5})), null, 2));

db.close();

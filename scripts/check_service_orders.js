const Database = require('better-sqlite3');
const db = new Database('./data/alisio.db', { readonly: true });

console.log('\n=== IRYNA\'S RESERVATIONS ===');
const guests = db.prepare(
  "SELECT g.id, g.first_name, g.last_name, r.id as res_id, r.check_in, r.check_out, r.status " +
  "FROM guests g JOIN reservations r ON r.guest_id = g.id " +
  "WHERE g.first_name LIKE ? OR g.last_name LIKE ? OR g.last_name LIKE ?"
).all('%ирин%', '%юбиш%', '%Люби%');
console.log(JSON.stringify(guests, null, 2));

if (guests.length > 0) {
  const resIds = guests.map(g => g.res_id);
  const placeholders = resIds.map(() => '?').join(',');

  console.log('\n=== SERVICE ORDERS FOR IRYNA ===');
  const orders = db.prepare(
    'SELECT so.id, so.payment_status, so.status, so.payment_id, so.service_date, so.created_at, so.total_price, ' +
    'ads.name as service_name ' +
    'FROM service_orders so ' +
    'LEFT JOIN additional_services ads ON so.service_id = ads.id ' +
    'WHERE so.reservation_id IN (' + placeholders + ') ' +
    'ORDER BY so.created_at DESC'
  ).all(...resIds);
  console.log(JSON.stringify(orders, null, 2));
}

console.log('\n=== ALL PENDING SERVICE ORDERS (last 20) ===');
const pending = db.prepare(
  "SELECT so.id, so.payment_status, so.status, so.payment_id, so.service_date, so.created_at, so.total_price, " +
  "ads.name as service_name, g.first_name, g.last_name " +
  "FROM service_orders so " +
  "LEFT JOIN additional_services ads ON so.service_id = ads.id " +
  "LEFT JOIN reservations r ON so.reservation_id = r.id " +
  "LEFT JOIN guests g ON r.guest_id = g.id " +
  "WHERE so.payment_status = 'pending' " +
  "ORDER BY so.created_at DESC LIMIT 20"
).all();
console.log(JSON.stringify(pending, null, 2));

console.log('\n=== CANCELLED SERVICE ORDERS (showing on dashboard) ===');
const cancelled = db.prepare(
  "SELECT so.id, so.payment_status, so.status, so.service_date, so.created_at, " +
  "ads.name as service_name, g.first_name, g.last_name " +
  "FROM service_orders so " +
  "LEFT JOIN additional_services ads ON so.service_id = ads.id " +
  "LEFT JOIN reservations r ON so.reservation_id = r.id " +
  "LEFT JOIN guests g ON r.guest_id = g.id " +
  "WHERE so.status = 'cancelled' " +
  "ORDER BY so.created_at DESC LIMIT 20"
).all();
console.log(JSON.stringify(cancelled, null, 2));

console.log('\n=== ALL SERVICE ORDERS STATUS SUMMARY ===');
const summary = db.prepare(
  "SELECT payment_status, status, COUNT(*) as count FROM service_orders GROUP BY payment_status, status"
).all();
console.log(JSON.stringify(summary, null, 2));

db.close();

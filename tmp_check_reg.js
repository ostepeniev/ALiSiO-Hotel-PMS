const Database = require('/root/projects/alisio-pms/node_modules/better-sqlite3');
const db = new Database('/root/projects/alisio-pms/data/alisio.db');

const reservationId = 'r_1776358445822';
const guestId = 'g_sahir_manual_' + Date.now();

// Check if already registered
const existing = db.prepare('SELECT * FROM reservation_guests WHERE reservation_id=?').all(reservationId);
console.log('Existing guests:', existing.length, JSON.stringify(existing));

// Get reservation details for notification
const r = db.prepare(`
  SELECT r.id, r.check_in, r.check_out, r.nights, r.adults,
         g.first_name, g.last_name, g.email, g.phone
  FROM reservations r JOIN guests g ON r.guest_id=g.id
  WHERE r.id=?
`).get(reservationId);
console.log('Reservation:', JSON.stringify(r));

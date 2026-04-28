const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.resolve('/root/projects/alisio-pms/data/alisio.db'), { readonly: true });

// Check guest_registrations table
console.log('--- guest_registrations (last 10) ---');
const gr = db.prepare('SELECT gr.id, gr.reservation_id, gr.guest_id, gr.is_primary, gr.registered_at FROM guest_registrations gr ORDER BY gr.registered_at DESC LIMIT 10').all();
gr.forEach(r => {
  const g = db.prepare('SELECT first_name, last_name FROM guests WHERE id = ?').get(r.guest_id);
  console.log(`${g ? g.first_name+' '+g.last_name : '?'} | res:${r.reservation_id.slice(0,12)} | primary:${r.is_primary} | ${r.registered_at}`);
});

// Check reservation_guests table
console.log('\n--- reservation_guests (last 10) ---');
const rg = db.prepare('SELECT reservation_id, first_name, last_name, date_of_birth, nationality, document_type, document_number, created_at FROM reservation_guests ORDER BY created_at DESC LIMIT 10').all();
rg.forEach(r => {
  console.log(`${r.first_name} ${r.last_name} | dob:${r.date_of_birth||'-'} | nat:${r.nationality||'-'} | doc:${r.document_type||'-'} ${r.document_number||'-'} | ${r.created_at}`);
});

// Check reservations registration_status
console.log('\n--- Reservations with registration_status ---');
try {
  const rows = db.prepare("SELECT id, registration_status FROM reservations WHERE registration_status IS NOT NULL AND registration_status != 'not_registered' LIMIT 10").all();
  rows.forEach(r => console.log(`res:${r.id.slice(0,12)} | status:${r.registration_status}`));
} catch(e) { console.log('registration_status column not found:', e.message); }

db.close();

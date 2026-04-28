const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.resolve('/root/projects/alisio-pms/data/alisio.db'), { readonly: true });

const rows = db.prepare(`
  SELECT r.id, r.guest_page_token, g.first_name, g.last_name, r.adults, r.check_in, r.source,
    (SELECT COUNT(*) FROM reservation_guests rg WHERE rg.reservation_id = r.id) as reg_count
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  WHERE r.check_in >= '2026-04-20' AND r.guest_page_token IS NOT NULL
  ORDER BY r.check_in
`).all();

console.log('TOKEN | NAME | ADULTS | REG | CHECK_IN | STATUS');
rows.forEach(r => {
  const st = r.reg_count >= r.adults ? 'OK' : 'PENDING';
  console.log(`${r.guest_page_token} | ${r.first_name} ${r.last_name} | ${r.adults} | ${r.reg_count} | ${r.check_in} | ${st}`);
});

console.log('\n--- Recent reservation_guests ---');
const recent = db.prepare('SELECT rg.first_name, rg.last_name, rg.email, rg.created_at, rg.reservation_id FROM reservation_guests rg ORDER BY rg.created_at DESC LIMIT 10').all();
recent.forEach(g => console.log(`  ${g.first_name} ${g.last_name} | ${g.email || '-'} | ${g.created_at}`));

// Check register handler endpoint works
console.log('\n--- Register handler file exists ---');
const fs = require('fs');
console.log('pay.handlers.ts:', fs.existsSync('/root/projects/alisio-pms/src/modules/guests/api/pay.handlers.ts'));
console.log('register.handlers.ts:', fs.existsSync('/root/projects/alisio-pms/src/modules/guests/api/register.handlers.ts'));

// Check Google Sheets env
console.log('\n--- ENV check ---');
const env = fs.readFileSync('/root/projects/alisio-pms/.env.local', 'utf8');
console.log('GOOGLE_GUESTS_SCRIPT_URL:', env.includes('GOOGLE_GUESTS_SCRIPT_URL') ? 'SET' : 'MISSING');
console.log('TELEGRAM_BOT_TOKEN:', env.includes('TELEGRAM_BOT_TOKEN') ? 'SET' : 'MISSING');

db.close();

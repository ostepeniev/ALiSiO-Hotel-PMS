const db = require('better-sqlite3')('./data/alisio.db');

const accounts = db.prepare('SELECT id, name, currency, organization_id FROM finance_accounts LIMIT 10').all();
console.log('Finance accounts:', JSON.stringify(accounts, null, 2));

// Try manually what payment-bridge does
const row = db.prepare(`
  SELECT prop.organization_id AS org_id
  FROM reservations r JOIN properties prop ON r.property_id = prop.id
  WHERE r.id = 'r_1777118785907'
`).get();
console.log('\nOrg row:', JSON.stringify(row));

const defaultAccount = row ? db.prepare(`
  SELECT id FROM finance_accounts
  WHERE organization_id = ? AND currency = 'CZK'
  ORDER BY sort_order ASC, created_at ASC LIMIT 1
`).get(row.org_id) : null;
console.log('Default account:', JSON.stringify(defaultAccount));

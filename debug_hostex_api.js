const https = require('https');
const TOKEN = '97A3kap2tmSqAOqFAaeDUi4EQ3va1bXCq9a8nM2MwuTYmOWpaoTyyVPycD4Hw0dF';

function hostexGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.hostex.io', path: `/v3${path}`, method: 'GET',
      headers: { 'Hostex-Access-Token': TOKEN, 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

const MISSING = ['Liliana', 'Borziak', 'Stefanie', 'Fischer', 'Vera Michel', 'Liubushkina', 'Irina', 'Iryna', 'Michel'];

async function main() {
  // Try all status combinations
  const statuses = ['accepted', 'cancelled', 'wait_accept', 'wait_pay', 'denied', 'timeout', ''];
  
  for (const status of statuses) {
    const url = status ? `/reservations?per_page=50&status=${status}` : '/reservations?per_page=50';
    const res = await hostexGet(url);
    const list = res.data?.reservations || [];
    const found = list.filter(r => MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase())));
    console.log(`Status "${status || 'none'}": ${list.length} results, found=${found.length}`);
    if (found.length) found.forEach(r => console.log('  FOUND:', r.guest_name, r.check_in_date, r.status));
    
    // Show all names for cancelled
    if (status === 'cancelled') {
      console.log('  ALL CANCELLED:', list.map(r => r.guest_name + ' ' + r.check_in_date).join(', '));
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Check Hostex API docs - try stays endpoint
  console.log('\n=== TRY /stays endpoint ===');
  const stays = await hostexGet('/stays?per_page=50');
  console.log('Stays count:', stays.data?.stays?.length, 'error:', stays.error_msg);
  (stays.data?.stays || []).slice(0, 5).forEach(s => console.log(' ', s));
}

main().catch(console.error);

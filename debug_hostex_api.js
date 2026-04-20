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

const MISSING = ['Franziska', 'Benjamin Busch', 'Benjamin Sode', 'Stefanie Fischer', 'Vera Michel'];
const PROP = 12558043; // A2 Slow Down — has 20 (probably more)

async function main() {
  // TEST 1: Does check_in_date_start filter work WITH property_id?
  console.log('=== TEST: date filter with property_id ===');
  // Shift window forward (Apr 21 → Jun 30)
  const windows = [
    '2026-01-01&check_in_date_end=2026-04-20',
    '2026-04-20&check_in_date_end=2026-06-30',
    '2026-06-30&check_in_date_end=2026-12-31',
  ];
  const allFromWindows = new Map();
  for (const w of windows) {
    await new Promise(r => setTimeout(r, 200));
    const url = `/reservations?property_id=${PROP}&per_page=50&check_in_date_start=${w}`;
    const res = await hostexGet(url);
    const list = res.data?.reservations || [];
    list.forEach(r => allFromWindows.set(r.reservation_code, r));
    const found = list.filter(r => MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase())));
    console.log(`Window ${w}: ${list.length} results, found missing: ${found.map(r=>r.guest_name).join(', ') || 'none'}`);
  }
  console.log(`Total unique with date windows: ${allFromWindows.size}`);
  allFromWindows.forEach(r => {
    if (MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase()))) {
      console.log('  MISSING FOUND:', r.guest_name, r.check_in_date);
    }
  });

  // TEST 2: Does listing_id filter give different results?
  console.log('\n=== TEST: listing_id filter ===');
  // Get properties to find listing_ids
  const props = await hostexGet('/properties');
  const a2 = (props.data?.properties || []).find(p => p.id === PROP);
  console.log('A2 channels:', JSON.stringify(a2?.channels || []));
  
  for (const ch of (a2?.channels || [])) {
    await new Promise(r => setTimeout(r, 200));
    const res = await hostexGet(`/reservations?listing_id=${ch.listing_id}&per_page=50`);
    const list = res.data?.reservations || [];
    const found = list.filter(r => MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase())));
    console.log(`Listing ${ch.listing_id} (${ch.channel_type}): ${list.length} results`);
    found.forEach(r => console.log('  ** FOUND MISSING:', r.guest_name, r.check_in_date));
    list.forEach(r => console.log('   ', r.check_in_date, r.guest_name));
  }
}

main().catch(console.error);

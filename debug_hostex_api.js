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

const PROPERTY_IDS = [12446083, 12558043, 12590381, 12590382, 12446084, 12565124];
const MISSING = ['Franziska', 'Benjamin', 'Stefanie', 'Ирина', 'Vera', 'Ann-Kathrin', 'Liliana', 'Alina', 'Nikolas', 'KSENIIA'];

async function main() {
  const all = new Map();

  for (const propId of PROPERTY_IDS) {
    await new Promise(r => setTimeout(r, 150));
    const res = await hostexGet(`/reservations?per_page=50&property_id=${propId}`);
    const list = res.data?.reservations || [];
    console.log(`Property ${propId}: ${list.length} results`);
    list.forEach(r => {
      all.set(r.reservation_code, r);
      const isMissing = MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase()));
      if (isMissing) console.log(`  *** FOUND MISSING: ${r.guest_name} | ${r.check_in_date} | ${r.status}`);
    });
  }

  console.log(`\nTotal unique across all properties: ${all.size}`);
  all.forEach(r => console.log(`  ${r.check_in_date} | ${r.guest_name} | pid=${r.property_id} | ${r.status}`));
}

main().catch(console.error);

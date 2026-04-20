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

async function main() {
  // Test: does pagination work WITH property_id filter?
  // Property 12558043 (A2 Slow Down) returned exactly 20 — test if page=2 gives DIFFERENT results
  const PROP = 12558043;
  
  console.log('=== PAGINATION WITH property_id TEST ===');
  const p1 = await hostexGet(`/reservations?property_id=${PROP}&per_page=10&page=1`);
  const p2 = await hostexGet(`/reservations?property_id=${PROP}&per_page=10&page=2`);
  const p3 = await hostexGet(`/reservations?property_id=${PROP}&per_page=10&page=3`);
  
  const r1 = p1.data?.reservations || [];
  const r2 = p2.data?.reservations || [];
  const r3 = p3.data?.reservations || [];
  
  const names1 = r1.map(r => r.guest_name);
  const names2 = r2.map(r => r.guest_name);
  const names3 = r3.map(r => r.guest_name);
  
  console.log(`Page1: ${r1.length} results`);
  console.log(`Page2: ${r2.length} results — SAME as page1? ${JSON.stringify(names1) === JSON.stringify(names2)}`);
  console.log(`Page3: ${r3.length} results — SAME as page1? ${JSON.stringify(names1) === JSON.stringify(names3)}`);
  
  console.log('\nPage1 names:', names1);
  console.log('Page2 names:', names2);

  // Also test per_page=5
  await new Promise(r => setTimeout(r, 200));
  const pp5 = await hostexGet(`/reservations?property_id=${PROP}&per_page=5&page=2`);
  const rr5 = pp5.data?.reservations || [];
  console.log(`\nper_page=5 page=2: ${rr5.length} results, same? ${JSON.stringify(rr5.map(r=>r.guest_name)) === JSON.stringify(names1.slice(0,5))}`);
  console.log('Names:', rr5.map(r => r.guest_name));

  // Check where Franziska/Benjamin/Vera/Stefanie are — try all 6 properties with page=2
  console.log('\n=== CHECK MISSING GUESTS ON PAGE 2 OF EACH PROPERTY ===');
  const MISSING = ['Franziska', 'Benjamin Busch', 'Benjamin Sode', 'Stefanie', 'Vera Michel'];
  const PROPS = [12446083, 12558043, 12590381, 12590382, 12446084, 12565124];

  for (const propId of PROPS) {
    await new Promise(r => setTimeout(r, 150));
    const res2 = await hostexGet(`/reservations?property_id=${propId}&per_page=50&page=2`);
    const list2 = res2.data?.reservations || [];
    const found = list2.filter(r => MISSING.some(n => r.guest_name?.toLowerCase().includes(n.toLowerCase())));
    if (found.length) {
      console.log(`Property ${propId} page2: FOUND ${found.map(r=>r.guest_name).join(', ')}`);
    } else {
      // Check if page 2 differs from page 1
      const res1 = await hostexGet(`/reservations?property_id=${propId}&per_page=50&page=1`);
      const list1 = res1.data?.reservations || [];
      const same = JSON.stringify(list1.map(r=>r.reservation_code)) === JSON.stringify(list2.map(r=>r.reservation_code));
      console.log(`Property ${propId}: page1=${list1.length} page2=${list2.length} same=${same}`);
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

main().catch(console.error);

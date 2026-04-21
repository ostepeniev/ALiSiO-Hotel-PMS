/**
 * Hostex All Reservation Codes Fetcher
 * 
 * Hostex's /reservations has a 20-record cap.
 * BUT /conversations has all conversation_ids linked to reservations.
 * We can use conversations to get all reservation codes!
 * 
 * Run: node fetch_all_codes.js
 * Then: node fetch_all_codes.js | node push_to_pms.js
 */
const https = require('https');
const TOKEN = '97A3kap2tmSqAOqFAaeDUi4EQ3va1bXCq9a8nM2MwuTYmOWpaoTyyVPycD4Hw0dF';
const PMS_URL = 'https://alisio.swipescape.eu';

function hostexGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.hostex.io', path: '/v3' + path, method: 'GET',
      headers: { 'Hostex-Access-Token': TOKEN, 'Content-Type': 'application/json' }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function pmsPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'alisio.swipescape.eu', path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function main() {
  const PROPS = [12446083, 12558043, 12590381, 12590382, 12446084, 12565124];
  const allCodes = new Set();

  console.log('=== STEP 1: Collect all reservation codes from /conversations ===');
  
  // Try to get reservation codes from conversations (has more data than reservations endpoint)
  let page = 1;
  let total = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 200));
    const res = await hostexGet(`/conversations?page=${page}&per_page=50`);
    const convs = res.data?.conversations || [];
    if (!convs.length) break;
    
    for (const c of convs) {
      if (c.reservation_code) allCodes.add(c.reservation_code);
      if (c.stay_code) allCodes.add(c.stay_code);
    }
    total += convs.length;
    console.log(`  Conversations page ${page}: ${convs.length} records, total codes so far: ${allCodes.size}`);
    
    // Check if pagination works for conversations
    if (page === 2) {
      const firstConv = (await hostexGet('/conversations?page=1&per_page=50')).data?.conversations || [];
      if (JSON.stringify(firstConv.map(c => c.conversation_id)) === JSON.stringify(convs.map(c => c.conversation_id))) {
        console.log('  Pagination broken for conversations too, stopping');
        break;
      }
    }
    if (convs.length < 50) break;
    page++;
    if (page > 20) break;
  }
  
  console.log(`\nTotal unique codes from conversations: ${allCodes.size}`);
  console.log('Codes:', [...allCodes].join(','));

  console.log('\n=== STEP 2: Sync each code to PMS ===');
  const codes = [...allCodes];
  let synced = 0, created = 0, updated = 0, errors = 0;
  
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    await new Promise(r => setTimeout(r, 300));
    try {
      // Call our PMS bulk-sync endpoint with this specific code
      const result = await pmsPost('/api/hostex/bulk-sync', null);
      // Actually use GET with codes param
      const url = `https://alisio.swipescape.eu/api/hostex/bulk-sync?codes=${encodeURIComponent(code)}`;
      const res2 = await new Promise((resolve, reject) => {
        https.get(url, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
        }).on('error', reject);
      });
      created += res2.created || 0;
      updated += res2.updated || 0;
      if (res2.errors > 0) errors++;
      process.stdout.write(`\r  [${i+1}/${codes.length}] created=${created} updated=${updated} errors=${errors}`);
    } catch (e) {
      errors++;
    }
  }
  
  console.log(`\n\nDone! created=${created} updated=${updated} errors=${errors}`);
}

main().catch(console.error);

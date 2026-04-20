const D = require('/root/projects/alisio-pms/node_modules/better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');
const crypto = require('crypto');

function hash(t) { return crypto.createHash('md5').update(t.trim()).digest('hex'); }

const names = ['Чан карпатський', 'Пізнє виселення', 'Раннє заселення', 'Сніданок', 'Сауна', 'Мангал'];
for (const name of names) {
  const rows = db.prepare('SELECT lang, translated_text FROM content_translations WHERE text_hash=?').all(hash(name));
  const langs = rows.map(r => `${r.lang}:${r.translated_text}`).join(' | ');
  console.log(`[${name}] → ${langs || 'NOT FOUND'}`);
}

// Count all
const cnt = db.prepare('SELECT COUNT(*) as n FROM content_translations').get();
console.log('\nTotal translations:', cnt.n);

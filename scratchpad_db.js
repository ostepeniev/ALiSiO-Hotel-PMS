const db = require('better-sqlite3')('data/alisio.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='booking_sites'").get()?.sql);

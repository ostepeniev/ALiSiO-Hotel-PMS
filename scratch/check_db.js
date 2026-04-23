const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
const db = new Database(dbPath);

try {
    const columns = db.prepare("PRAGMA table_info(booking_sites)").all();
    console.log('Columns in booking_sites:', columns.map(c => c.name));
} catch (e) {
    console.error('Error:', e.message);
} finally {
    db.close();
}

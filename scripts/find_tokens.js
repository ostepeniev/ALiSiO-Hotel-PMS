const Database = require("better-sqlite3");
const db = new Database("./data/alisio.db");
const rows = db.prepare(
  "SELECT r.guest_page_token, g.first_name, g.last_name, r.check_in, r.check_out, r.payment_status " +
  "FROM reservations r JOIN guests g ON r.guest_id = g.id " +
  "WHERE r.guest_page_token IS NOT NULL AND r.payment_status IN ('paid','prepaid','partial') " +
  "ORDER BY r.check_in DESC LIMIT 5"
).all();
console.log(JSON.stringify(rows, null, 2));

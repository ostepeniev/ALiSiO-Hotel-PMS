const Database = require("better-sqlite3");
const db = new Database("./data/alisio.db");

console.log("=== reservation_guests count:", db.prepare("SELECT COUNT(*) as c FROM reservation_guests").get().c);
console.log("=== guest_registrations count:", db.prepare("SELECT COUNT(*) as c FROM guest_registrations").get().c);

console.log("\n=== Last 10 in reservation_guests ===");
const rg = db.prepare("SELECT rg.*, r.check_in, r.check_out FROM reservation_guests rg LEFT JOIN reservations r ON rg.reservation_id = r.id ORDER BY rg.created_at DESC LIMIT 10").all();
console.log(JSON.stringify(rg, null, 2));

console.log("\n=== Last 10 in guest_registrations ===");
const gr = db.prepare("SELECT gr.*, g.first_name, g.last_name FROM guest_registrations gr LEFT JOIN guests g ON gr.guest_id = g.id ORDER BY gr.registered_at DESC LIMIT 5").all();
console.log(JSON.stringify(gr, null, 2));

// Check if there's a Stefanie Fischer in guests table
console.log("\n=== Any Fischer/Stefanie in guests ===");
const found = db.prepare("SELECT id, first_name, last_name, email, created_at, updated_at FROM guests WHERE first_name LIKE '%Stefan%' OR last_name LIKE '%Fischer%' ORDER BY updated_at DESC LIMIT 10").all();
console.log(JSON.stringify(found, null, 2));

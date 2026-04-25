const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'alisio.db');
const db = new Database(dbPath);

const ORG_ID = 'org_alisio_001';

function addTimSimon() {
  try {
    console.log('--- ADDING TIM SIMON (VRBO) ---');
    
    // 1. Create Guest
    const guestId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO guests (id, organization_id, first_name, last_name, phone, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(guestId, ORG_ID, 'Tim', 'Simon', '+49 15204022142', 'guest@vrbo.com');

    // 2. Create Lead
    const leadId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO crm_leads (
        id, organization_id, guest_id, first_name, last_name, phone, 
        stage, source, external_booking_id, check_in_date, check_out_date,
        adults, currency, estimated_value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'booked', 'vrbo', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
        leadId, ORG_ID, guestId, 'Tim', 'Simon', '+49 15204022142', 
        'HA-4XYNDJ', '2026-07-24', '2026-07-26', 
        14, 'EUR', 409.50
    );

    // 3. Create Reservation
    const resId = crypto.randomBytes(16).toString('hex');
    const prop = db.prepare("SELECT id FROM properties LIMIT 1").get();
    
    // Assign to Building F unit u_f17 (4 beds)
    db.prepare(`
      INSERT INTO reservations (
        id, property_id, unit_id, guest_id, check_in, check_out, 
        nights, adults, status, source, total_price, currency, 
        external_uid, bcom_reservation_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'vrbo', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      resId, prop.id, 'u_f17', guestId, '2026-07-24', '2026-07-26',
      2, 14, 409.50, 'EUR',
      'HA-4XYNDJ', 'HA-4XYNDJ',
      'Vrbo Instant Booking - 14 people (30th Birthday). Assigned to F17 as representative unit.'
    );

    // 4. Link Lead
    db.prepare("UPDATE crm_leads SET reservation_id = ? WHERE id = ?").run(resId, leadId);

    console.log(`✅ Success: Tim Simon added to Building F (Reservation ${resId})`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    db.close();
  }
}

addTimSimon();

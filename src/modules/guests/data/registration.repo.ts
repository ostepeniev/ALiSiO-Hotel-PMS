/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { RegisteredGuest } from '../domain/types';

export function getReservationForRegistration(token: string) {
  return getDb().prepare(`
    SELECT r.id, r.guest_id as booking_guest_id, r.check_in, r.check_out, r.nights,
           r.adults, r.total_price, r.currency, r.source, r.status, r.payment_status,
           g.first_name as booking_first_name, g.last_name as booking_last_name,
           g.email as booking_email, g.phone as booking_phone,
           u.name as unit_name, ut.name as unit_type_name,
           p.organization_id, p.name as property_name
    FROM reservations r
    JOIN properties p ON r.property_id = p.id
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    JOIN unit_types ut ON u.unit_type_id = ut.id
    WHERE r.guest_page_token = ?
  `).get(token) as any;
}

export function saveRegistrations(reservationId: string, organizationId: string, guests: RegisteredGuest[]) {
  const db = getDb();

  db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservationId);

  const insertRg = db.prepare(`
    INSERT INTO reservation_guests (reservation_id, first_name, last_name, date_of_birth, address, nationality, document_type, document_number, guest_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findGuest = db.prepare(`SELECT id FROM guests WHERE organization_id = ? AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) LIMIT 1`);
  const insertGuest = db.prepare(`INSERT INTO guests (organization_id, first_name, last_name, date_of_birth, country, address, document_type, document_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateGuest = db.prepare(`UPDATE guests SET date_of_birth = COALESCE(?, date_of_birth), country = COALESCE(?, country), address = COALESCE(?, address), document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number), updated_at = datetime('now') WHERE id = ?`);

  db.transaction(() => {
    for (const guest of guests) {
      if (!guest.firstName || !guest.lastName) throw new Error('firstName and lastName are required');

      let guestId: string | null = null;
      const existing = findGuest.get(organizationId, guest.firstName, guest.lastName) as any;

      if (existing) {
        guestId = existing.id;
        updateGuest.run(guest.dateOfBirth ?? null, guest.nationality ?? null, guest.address ?? null, guest.documentType ?? null, guest.documentNumber ?? null, guestId);
      } else {
        const result = insertGuest.run(organizationId, guest.firstName, guest.lastName, guest.dateOfBirth ?? null, guest.nationality ?? null, guest.address ?? null, guest.documentType ?? null, guest.documentNumber ?? null);
        const newGuest = db.prepare('SELECT id FROM guests WHERE rowid = ?').get(result.lastInsertRowid) as any;
        guestId = newGuest?.id ?? null;
      }

      insertRg.run(reservationId, guest.firstName, guest.lastName, guest.dateOfBirth ?? null, guest.address ?? null, guest.nationality ?? null, guest.documentType ?? null, guest.documentNumber ?? null, guestId);
    }
  })();

  return db.prepare('SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at').all(reservationId);
}

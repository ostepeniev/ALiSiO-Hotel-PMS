/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb, generateGuestToken } from '@core/db';

export interface UnitTypeMatch {
  id: string;
  name: string;
  code: string;
}

export interface FreeUnit {
  id: string;
  name: string;
  code: string;
  unit_type_id: string;
}

export interface ExistingReservation {
  id: string;
  status: string;
  unit_id: string | null;
}

/** Resolve the resort property id (first property whose units belong to a resort category). */
export function findResortPropertyId(): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.property_id as id
    FROM units u
    JOIN categories c ON c.id = u.category_id
    WHERE c.type = 'resort'
    LIMIT 1
  `).get() as any;
  return row?.id || null;
}

/**
 * Match a Booking.com unit-type name (e.g. "Triple Room") to a local unit_type.
 * Strategy: case-insensitive contains on unit_types.name.
 * Returns null if no match — caller should warn the user.
 */
export function findUnitTypeByName(name: string): UnitTypeMatch | null {
  if (!name) return null;
  const db = getDb();
  const lower = name.toLowerCase().trim();

  const exact = db.prepare(`
    SELECT ut.id, ut.name, ut.code
    FROM unit_types ut
    JOIN categories c ON c.id = ut.category_id
    WHERE c.type = 'resort' AND LOWER(ut.name) = ?
    LIMIT 1
  `).get(lower) as any;
  if (exact) return exact;

  const fuzzy = db.prepare(`
    SELECT ut.id, ut.name, ut.code
    FROM unit_types ut
    JOIN categories c ON c.id = ut.category_id
    WHERE c.type = 'resort' AND LOWER(ut.name) LIKE ?
    LIMIT 1
  `).get(`%${lower}%`) as any;
  return fuzzy || null;
}

/** Find any free resort unit of the given type for the given dates. */
export function findFreeResortUnit(
  unitTypeId: string,
  checkIn: string,
  checkOut: string,
): FreeUnit | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.name, u.code, u.unit_type_id
    FROM units u
    JOIN categories c ON c.id = u.category_id
    WHERE c.type = 'resort'
      AND u.unit_type_id = ?
      AND u.is_active = 1
      AND u.id NOT IN (
        SELECT unit_id FROM reservations
        WHERE status NOT IN ('cancelled', 'no_show')
          AND check_in < ? AND check_out > ?
      )
    ORDER BY u.sort_order ASC, u.name ASC
    LIMIT 1
  `).get(unitTypeId, checkOut, checkIn) as any;
  return row || null;
}

/** Find a reservation already imported with this Booking.com book number. */
export function findReservationByBcomId(bookNumber: string): ExistingReservation | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, status, unit_id FROM reservations
    WHERE bcom_reservation_id = ? OR external_uid = ?
    LIMIT 1
  `).get(bookNumber, bookNumber) as any;
  return row || null;
}

/** Mark an existing reservation as cancelled (for cancelled_by_guest rows). */
export function cancelReservation(reservationId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE reservations
    SET status = 'cancelled', updated_at = datetime('now')
    WHERE id = ?
  `).run(reservationId);
}

/**
 * Find or create a guest by name + optional country/phone.
 * Booking.com exports rarely include email or phone, so name + country is the
 * best dedup key we have. Returns the guest id.
 */
export function findOrCreateGuestForImport(args: {
  firstName: string;
  lastName: string;
  country: string | null;
  phone: string | null;
  address: string | null;
}): string {
  const db = getDb();
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
  const orgId = org?.id;

  const existing = db.prepare(`
    SELECT id FROM guests
    WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
      AND organization_id = ?
    LIMIT 1
  `).get(args.firstName, args.lastName, orgId) as any;

  if (existing) {
    if (args.phone || args.address || args.country) {
      db.prepare(`
        UPDATE guests
        SET phone = COALESCE(NULLIF(?, ''), phone),
            address = COALESCE(NULLIF(?, ''), address),
            country = COALESCE(NULLIF(?, ''), country),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(args.phone || '', args.address || '', args.country || '', existing.id);
    }
    return existing.id;
  }

  const guestId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO guests (id, organization_id, first_name, last_name, phone, address, country)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guestId, orgId, args.firstName, args.lastName, args.phone || null, args.address || null, args.country || null);
  return guestId;
}

export interface InsertReservationArgs {
  propertyId: string;
  unitId: string | null;
  guestId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  totalPrice: number;
  currency: string;
  bcomReservationId: string;
  commissionAmount: number;
  notes: string;
}

export function insertImportedReservation(args: InsertReservationArgs): string {
  const db = getDb();
  const resId = `bcom_xls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const guestPageToken = generateGuestToken();

  db.prepare(`
    INSERT INTO reservations (
      id, property_id, unit_id, guest_id,
      check_in, check_out, nights, adults, children,
      status, payment_status, source, total_price, currency,
      external_uid, bcom_reservation_id,
      commission_amount, notes, guest_page_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'unpaid', 'booking_com', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    resId, args.propertyId, args.unitId, args.guestId,
    args.checkIn, args.checkOut, args.nights, args.adults, args.children,
    args.totalPrice, args.currency,
    args.bcomReservationId, args.bcomReservationId,
    args.commissionAmount, args.notes, guestPageToken,
  );

  return resId;
}

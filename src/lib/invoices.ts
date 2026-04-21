/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ALiSiO PMS — Invoice Generation Module
 * Generates invoices (Faktury) for paid reservations.
 * Kemp Carlsbad s.r.o. is NOT a VAT payer (neplátce DPH),
 * so these are regular Faktury, not Daňové doklady.
 */

import { getDb } from '@/lib/db';

export interface InvoiceData {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  amount: number;
  currency: string;
  status: string;
  reservation_id: string;
  // Joined reservation data
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  unit_name: string;
  unit_code: string;
  // Guest data
  guest_first_name: string;
  guest_last_name: string;
  guest_email?: string;
  guest_address?: string;
  guest_city?: string;
  guest_country?: string;
  // Payment data
  payment_method?: string;
  payment_notes?: string;
}

/**
 * Generate the next sequential invoice number for the current year.
 * Format: YYYY-NNN (e.g. 2026-001)
 */
function getNextInvoiceNumber(db: any): string {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const last = db.prepare(`
    SELECT invoice_number FROM invoices
    WHERE invoice_number LIKE ?
    ORDER BY invoice_number DESC
    LIMIT 1
  `).get(`${prefix}%`) as { invoice_number: string } | undefined;

  let nextNum = 1;
  if (last) {
    const parts = last.invoice_number.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/**
 * Create an invoice record for a reservation.
 * Idempotent — if invoice already exists for this reservation, returns existing id.
 */
export function generateInvoiceForReservation(reservationId: string): string | null {
  try {
    const db = getDb();

    // Check if invoice already exists
    const existing = db.prepare(
      'SELECT id FROM invoices WHERE reservation_id = ? AND status != ?'
    ).get(reservationId, 'cancelled') as { id: string } | undefined;

    if (existing) {
      return existing.id;
    }

    // Fetch reservation data
    const res = db.prepare(`
      SELECT r.total_price, r.currency, r.check_out
      FROM reservations r
      WHERE r.id = ?
    `).get(reservationId) as { total_price: number; currency: string; check_out: string } | undefined;

    if (!res) return null;

    const invoiceId = `inv_${Date.now()}`;
    const invoiceNumber = getNextInvoiceNumber(db);
    const today = new Date().toISOString().split('T')[0];

    // Due date: check-out date (ubytování service: due on departure)
    const dueDate = res.check_out > today ? res.check_out : today;

    db.prepare(`
      INSERT INTO invoices (id, reservation_id, invoice_number, issued_at, due_date, amount, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(invoiceId, reservationId, invoiceNumber, today, dueDate, res.total_price, res.currency || 'CZK');

    console.log(`[Invoices] Created invoice ${invoiceNumber} for reservation ${reservationId}`);
    return invoiceId;
  } catch (e: any) {
    console.error('[Invoices] Error generating invoice:', e.message);
    return null;
  }
}

/**
 * Fetch full invoice data for rendering (joins reservation + guest + payments).
 */
export function getInvoiceData(invoiceId: string): InvoiceData | null {
  try {
    const db = getDb();

    const row = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date, i.amount, i.currency, i.status,
        i.reservation_id,
        r.check_in, r.check_out, r.nights, r.adults, r.children,
        u.name as unit_name, u.code as unit_code,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        g.email as guest_email, g.address as guest_address,
        g.city as guest_city, g.country as guest_country,
        p.method as payment_method, p.notes as payment_notes
      FROM invoices i
      JOIN reservations r ON i.reservation_id = r.id
      JOIN units u ON r.unit_id = u.id
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed'
      WHERE i.id = ?
      ORDER BY p.paid_at DESC
      LIMIT 1
    `).get(invoiceId) as InvoiceData | undefined;

    return row || null;
  } catch (e: any) {
    console.error('[Invoices] Error fetching invoice data:', e.message);
    return null;
  }
}

/**
 * List all invoices with basic info (for the Documents page).
 */
export function listInvoices(): any[] {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date, i.amount, i.currency, i.status,
        i.reservation_id,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        u.name as unit_name
      FROM invoices i
      JOIN reservations r ON i.reservation_id = r.id
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      ORDER BY i.issued_at DESC, i.invoice_number DESC
      LIMIT 200
    `).all();
  } catch (e: any) {
    console.error('[Invoices] Error listing invoices:', e.message);
    return [];
  }
}

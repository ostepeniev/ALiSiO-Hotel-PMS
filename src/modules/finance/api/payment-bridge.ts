/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import { createOperationInTx, recalcReservationPaymentStatus } from './operations.handlers';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'invoice' | 'online' | 'booking_platform';
export type PaymentSubtype = 'deposit' | 'full' | 'partial' | 'service' | 'refund';
export type PaymentSource = 'teia' | 'hostex' | 'booking_widget' | 'manual';

export interface CreatePaymentOperationInput {
  reservationId: string;
  amount: number;
  currency?: string;
  method: PaymentMethod;
  paymentSubtype: PaymentSubtype;
  source: PaymentSource;
  sourceRef?: string;
  paidAt?: string;
  accountId?: string;
  status?: 'completed' | 'pending';
  comment?: string;
}

/**
 * Create a payment-style operation tied to a reservation.
 * Handles op_type mapping (refund → expense, others → income) and recalculates
 * the reservation.payment_status.
 *
 * This replaces direct INSERT INTO payments across hostex-sync, Teya webhook,
 * and widget-payment-return handlers.
 */
export function createPaymentOperation(input: CreatePaymentOperationInput): { operationId: string } {
  const db = getDb();
  const {
    reservationId, amount, method, paymentSubtype, source,
    currency = 'CZK',
    sourceRef,
    paidAt = new Date().toISOString(),
    accountId,
    status = 'completed',
    comment,
  } = input;

  // Get organization_id via reservations -> properties
  const row = db.prepare(`
    SELECT prop.organization_id AS org_id
    FROM reservations r JOIN properties prop ON r.property_id = prop.id
    WHERE r.id = ?
  `).get(reservationId) as { org_id: string } | undefined;
  if (!row) throw new Error(`Reservation ${reservationId} not found`);

  const isRefund = paymentSubtype === 'refund';
  const opType = isRefund ? 'expense' : 'income';

  const operationId = createOperationInTx(db, row.org_id, {
    op_type: opType,
    account_from_id: isRefund ? (accountId || null) : null,
    account_to_id: isRefund ? null : (accountId || null),
    amount: Math.abs(amount),
    currency,
    paid_at: paidAt,
    reservation_id: reservationId,
    status,
    method,
    payment_subtype: paymentSubtype,
    comment: comment || null,
    source,
    source_ref: sourceRef || reservationId,
  });

  recalcReservationPaymentStatus(db, reservationId);
  return { operationId };
}

/**
 * Check if a payment operation already exists for a reservation matching
 * the given source + source_ref. Used by Hostex sync to avoid duplicates.
 */
export function hasPaymentOperation(reservationId: string, source: PaymentSource, sourceRef?: string): boolean {
  const db = getDb();
  if (sourceRef) {
    const row = db.prepare(`
      SELECT id FROM fin_operations
      WHERE reservation_id = ? AND source = ? AND source_ref = ? LIMIT 1
    `).get(reservationId, source, sourceRef);
    return !!row;
  }
  const row = db.prepare(`
    SELECT id FROM fin_operations
    WHERE reservation_id = ? AND source = ? LIMIT 1
  `).get(reservationId, source);
  return !!row;
}

/**
 * Delete all payment operations associated with a reservation.
 * Used by cleanup-ical handler.
 */
export function deletePaymentOperationsForReservation(reservationId: string): number {
  const db = getDb();
  db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id IN (SELECT id FROM fin_operations WHERE reservation_id = ?)').run(reservationId);
  const result = db.prepare('DELETE FROM fin_operations WHERE reservation_id = ?').run(reservationId);
  return result.changes;
}

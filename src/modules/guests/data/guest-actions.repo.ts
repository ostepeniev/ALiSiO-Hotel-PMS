/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';

// ─── Feedback ─────────────────────────────────────────────────────────────────

export function getReservationIdByToken(token: string): string | null {
  const row = getDb().prepare('SELECT id FROM reservations WHERE guest_page_token = ?').get(token) as any;
  return row?.id ?? null;
}

export function saveFeedback(reservationId: string, feedback: string) {
  getDb().prepare(`
    INSERT INTO reservation_activity (id, reservation_id, type, description, created_by, created_at)
    VALUES (lower(hex(randomblob(16))), ?, 'guest_feedback', ?, 'guest', datetime('now'))
  `).run(reservationId, feedback.trim());
}

// ─── Service Orders ───────────────────────────────────────────────────────────

export function getReservationForServiceOrder(token: string) {
  return getDb().prepare('SELECT id, property_id FROM reservations WHERE guest_page_token = ?').get(token) as any;
}

export function orderServices(reservationId: string, services: { serviceId: string; quantity?: number; notes?: string }[]) {
  const db = getDb();
  const insertOrder = db.prepare('INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, notes) VALUES (?, ?, ?, ?, ?)');

  db.transaction(() => {
    for (const svc of services) {
      if (!svc.serviceId) throw new Error('serviceId is required');
      const service = db.prepare('SELECT price FROM additional_services WHERE id = ?').get(svc.serviceId) as any;
      if (!service) throw new Error(`Service ${svc.serviceId} not found`);
      const qty = svc.quantity || 1;
      insertOrder.run(reservationId, svc.serviceId, qty, service.price * qty, svc.notes ?? null);
    }
  })();

  return db.prepare(`
    SELECT so.*, ads.name as service_name, ads.icon as service_icon
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    WHERE so.reservation_id = ?
    ORDER BY so.created_at
  `).all(reservationId);
}

// ─── Pay (service order + Teya) ───────────────────────────────────────────────

export function getReservationForPay(token: string) {
  return getDb().prepare(`
    SELECT r.id, r.property_id, r.check_in, r.check_out,
           g.first_name, g.last_name, u.name as unit_name
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    WHERE r.guest_page_token = ?
  `).get(token) as any;
}

export function getServiceForProperty(serviceId: string, propertyId: string) {
  return getDb().prepare('SELECT * FROM additional_services WHERE id = ? AND property_id = ? AND is_active = 1').get(serviceId, propertyId) as any;
}

export function createPendingServiceOrder(reservationId: string, serviceId: string, quantity: number, totalPrice: number): string {
  const result = getDb().prepare(`
    INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, status, payment_status)
    VALUES (?, ?, ?, ?, 'pending', 'pending')
    RETURNING id
  `).get(reservationId, serviceId, quantity, totalPrice) as any;
  return result?.id;
}

export function updateOrderPaymentId(orderId: string, paymentId: string) {
  getDb().prepare('UPDATE service_orders SET payment_id = ? WHERE id = ?').run(paymentId, orderId);
}

export function markOrderPaymentFailed(orderId: string) {
  getDb().prepare("UPDATE service_orders SET payment_status = 'failed' WHERE id = ?").run(orderId);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/guest/[token]/services — order additional services
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const body = await request.json();

    // Find reservation
    const reservation = db.prepare(
      'SELECT id, property_id FROM reservations WHERE guest_page_token = ?'
    ).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Rate limiting: max 5 service orders per 10 minutes
    const rl = checkRateLimit(token, 'service_order', 5, 10);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const { services } = body;
    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    const insertOrder = db.prepare(
      'INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, notes) VALUES (?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction(() => {
      for (const svc of services) {
        if (!svc.serviceId) {
          throw new Error('serviceId is required');
        }
        // Get service price
        const service = db.prepare('SELECT price FROM additional_services WHERE id = ?').get(svc.serviceId) as any;
        if (!service) {
          throw new Error(`Service ${svc.serviceId} not found`);
        }
        const qty = svc.quantity || 1;
        const totalPrice = service.price * qty;
        insertOrder.run(reservation.id, svc.serviceId, qty, totalPrice, svc.notes || null);
      }
    });

    insertMany();

    // Return updated orders
    const orderedServices = db.prepare(`
      SELECT so.*, ads.name as service_name, ads.icon as service_icon
      FROM service_orders so
      JOIN additional_services ads ON so.service_id = ads.id
      WHERE so.reservation_id = ?
      ORDER BY so.created_at
    `).all(reservation.id);

    return NextResponse.json({ success: true, orderedServices });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/services error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to order services' }, { status: 500 });
  }
}

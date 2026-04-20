/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createCheckoutSession } from '@/lib/teya';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

// POST /api/guest/[token]/pay — create a payment session for a service order
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const body = await request.json();
    const { serviceId, quantity = 1 } = body;

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required' }, { status: 400 });
    }

    // Find reservation
    const reservation = db.prepare(`
      SELECT r.id, r.property_id, r.check_in, r.check_out,
             g.first_name, g.last_name,
             u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.guest_page_token = ?
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Get service
    const service = db.prepare(
      'SELECT * FROM additional_services WHERE id = ? AND property_id = ? AND is_active = 1'
    ).get(serviceId, reservation.property_id) as any;

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const totalPrice = service.price * quantity;
    const serviceName = service.name_en || service.name;
    const guestName = `${reservation.first_name} ${reservation.last_name}`;

    // Create service order FIRST (before Teya call)
    const orderId = db.prepare(`
      INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, status, payment_status)
      VALUES (?, ?, ?, ?, 'pending', 'pending')
      RETURNING id
    `).get(reservation.id, serviceId, quantity, totalPrice) as any;

    if (!orderId) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    console.log(`[Guest Pay] Order created: ${orderId.id} | ${serviceName} x${quantity} | ${guestName}`);

    // Send Telegram notification IMMEDIATELY (before Teya call)
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tgText = [
      `📦 <b>Нове замовлення послуги</b>`,
      ``,
      `👤 ${escHtml(guestName)}`,
      `🏠 ${escHtml(reservation.unit_name)}`,
      `📅 ${reservation.check_in} — ${reservation.check_out}`,
      ``,
      `✨ ${escHtml(serviceName)} × ${quantity} — ${totalPrice} ${service.currency || 'CZK'}`,
      `💳 Статус: Очікує оплати`,
    ].join('\n');
    sendTelegramMessage(tgText).catch((e) => console.error('[Guest Pay] TG error:', e.message));

    // Now try to create Teya checkout session
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
      
      const session = await createCheckoutSession({
        amount: Math.round(totalPrice * 100), // Minor units (cents/haléře)
        currency: service.currency || 'CZK',
        description: `${serviceName} × ${quantity} — ${guestName}`,
        items: [{
          description: serviceName,
          quantity,
          unit_price: Math.round(service.price * 100),
        }],
        metadata: {
          order_id: orderId.id,
          reservation_id: reservation.id,
          service_id: serviceId,
          source: 'guest_page',
        },
        success_url: `${baseUrl}/guest/${token}?payment=success`,
        cancel_url: `${baseUrl}/guest/${token}?payment=cancel`,
      });

      // Update order with payment_id
      db.prepare('UPDATE service_orders SET payment_id = ? WHERE id = ?')
        .run(session.id, orderId.id);

      console.log(`[Guest Pay] Teya session created: ${session.id}`);

      return NextResponse.json({
        success: true,
        orderId: orderId.id,
        session_url: session.session_url,
        session_id: session.id,
      });
    } catch (teyaError: any) {
      // Teya failed — update order status, notify via TG, but still return the order
      console.error('[Guest Pay] Teya error:', teyaError.message);
      db.prepare("UPDATE service_orders SET payment_status = 'failed' WHERE id = ?")
        .run(orderId.id);

      // Notify about payment system failure
      sendTelegramMessage(
        `⚠️ <b>Помилка оплати</b>\n\n` +
        `👤 ${escHtml(guestName)}\n` +
        `✨ ${escHtml(serviceName)} × ${quantity}\n` +
        `❌ Teya: ${escHtml(teyaError.message?.substring(0, 100))}\n\n` +
        `Замовлення створено (${orderId.id}), але оплата не вдалася.`
      ).catch(() => {});

      return NextResponse.json({
        error: 'Payment system temporarily unavailable. Please try again later.',
        orderId: orderId.id,
      }, { status: 503 });
    }
  } catch (error: any) {
    console.error('POST /api/guest/[token]/pay error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment' }, { status: 500 });
  }
}

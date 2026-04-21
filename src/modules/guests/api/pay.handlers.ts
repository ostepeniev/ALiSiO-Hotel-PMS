/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as actionsRepo from '../data/guest-actions.repo';
// TODO: replace with @finance eventBus event when finance module is migrated
import { createCheckoutSession } from '@/lib/teya';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

export async function payForService(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();
    const { serviceId, quantity = 1 } = body;

    if (!serviceId) return NextResponse.json({ error: 'serviceId is required' }, { status: 400 });

    const reservation = actionsRepo.getReservationForPay(token);
    if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const service = actionsRepo.getServiceForProperty(serviceId, reservation.property_id);
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    const totalPrice = service.price * quantity;
    const serviceName = service.name_en || service.name;
    const guestName = `${reservation.first_name} ${reservation.last_name}`;

    const orderId = actionsRepo.createPendingServiceOrder(reservation.id, serviceId, quantity, totalPrice);
    if (!orderId) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });

    console.log(`[Guest Pay] Order created: ${orderId} | ${serviceName} x${quantity} | ${guestName}`);

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

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
      const session = await createCheckoutSession({
        amount: Math.round(totalPrice * 100),
        currency: service.currency || 'CZK',
        description: `${serviceName} × ${quantity} — ${guestName}`,
        items: [{
          description: serviceName,
          quantity,
          unit_price: Math.round(service.price * 100),
        }],
        metadata: {
          order_id: orderId,
          reservation_id: reservation.id,
          service_id: serviceId,
          source: 'guest_page',
        },
        success_url: `${baseUrl}/guest/${token}?payment=success`,
        cancel_url: `${baseUrl}/guest/${token}?payment=cancel`,
      });

      actionsRepo.updateOrderPaymentId(orderId, session.id);
      console.log(`[Guest Pay] Teya session created: ${session.id}`);

      return NextResponse.json({
        success: true,
        orderId,
        session_url: session.session_url,
        session_id: session.id,
      });
    } catch (teyaError: any) {
      console.error('[Guest Pay] Teya error:', teyaError.message);
      actionsRepo.markOrderPaymentFailed(orderId);

      sendTelegramMessage(
        `⚠️ <b>Помилка оплати</b>\n\n` +
        `👤 ${escHtml(guestName)}\n` +
        `✨ ${escHtml(serviceName)} × ${quantity}\n` +
        `❌ Teya: ${escHtml(teyaError.message?.substring(0, 100))}\n\n` +
        `Замовлення створено (${orderId}), але оплата не вдалася.`,
      ).catch(() => {});

      return NextResponse.json(
        { error: 'Payment system temporarily unavailable. Please try again later.', orderId },
        { status: 503 },
      );
    }
  } catch (error: any) {
    console.error('POST /api/guest/[token]/pay error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment' }, { status: 500 });
  }
}

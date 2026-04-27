/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as actionsRepo from '../data/guest-actions.repo';
import { createPaymentSession } from '@payments';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

// ─── Types ─────────────────────────────────────────────────────────────────
interface CartItemInput {
  serviceId: string;
  quantity?: number;
  serviceDates?: string[]; // for breakfast-type services
}

// ─── Single service pay (legacy) ───────────────────────────────────────────
async function handleSinglePay(
  token: string,
  serviceId: string,
  quantity: number,
  serviceDates?: string[],
): Promise<NextResponse> {
  const reservation = actionsRepo.getReservationForPay(token);
  if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const service = actionsRepo.getServiceForProperty(serviceId, reservation.property_id);
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

  // Determine service dates: use provided dates, or check-in date as fallback
  const dates = (serviceDates && serviceDates.length > 0)
    ? serviceDates
    : [reservation.check_in];
  const effectiveQty = Math.max(quantity, dates.length);
  const totalPrice = service.price * effectiveQty;
  const serviceName = service.name_en || service.name;
  const guestName = `${reservation.first_name} ${reservation.last_name}`;

  // Create one order per date (for breakfast) or a single order
  const orderIds: string[] = [];
  if (dates.length > 1) {
    for (const date of dates) {
      const oid = actionsRepo.createPendingServiceOrder(reservation.id, serviceId, 1, service.price, date);
      if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      orderIds.push(oid);
    }
  } else {
    const oid = actionsRepo.createPendingServiceOrder(reservation.id, serviceId, effectiveQty, totalPrice, dates[0]);
    if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    orderIds.push(oid);
  }

  console.log(`[Guest Pay] Orders: ${orderIds.join(',')} | ${serviceName} | dates: ${dates.join(',')} | ${guestName}`);

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const datesLabel = dates.length > 1 ? `\n📅 Дати: ${dates.join(', ')}` : `\n📅 Дата: ${dates[0]}`;
  sendTelegramMessage([
    `📦 <b>Нове замовлення послуги</b>`, ``,
    `👤 ${escHtml(guestName)}`, `🏠 ${escHtml(reservation.unit_name)}`,
    `📅 ${reservation.check_in} — ${reservation.check_out}`, ``,
    `✨ ${escHtml(serviceName)} × ${effectiveQty} — ${totalPrice} ${service.currency || 'CZK'}${datesLabel}`,
    `💳 Статус: Очікує оплати`,
  ].join('\n')).catch((e) => console.error('[Guest Pay] TG error:', e.message));

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
    const session = await createPaymentSession({
      kind: 'service_standalone',
      amount: totalPrice,
      currency: service.currency || 'CZK',
      description: `${serviceName} × ${effectiveQty} — ${guestName}`,
      lineItems: [{ description: serviceName, quantity: effectiveQty, unitPriceMajor: service.price }],
      metadata: { order_ids: orderIds.join(','), reservation_id: reservation.id, service_id: serviceId, source: 'guest_page' },
      successUrl: `${baseUrl}/guest/${token}?payment=success`,
      cancelUrl: `${baseUrl}/guest/${token}?payment=cancel`,
    });
    for (const oid of orderIds) actionsRepo.updateOrderPaymentId(oid, session.sessionId);
    console.log(`[Guest Pay] Teya session created: ${session.sessionId}`);
    return NextResponse.json({ success: true, orderIds, session_url: session.sessionUrl, session_id: session.sessionId });
  } catch (teyaError: any) {
    console.error('[Guest Pay] Teya error:', teyaError.message);
    for (const oid of orderIds) actionsRepo.markOrderPaymentFailed(oid);
    sendTelegramMessage(
      `⚠️ <b>Помилка оплати</b>\n\n👤 ${escHtml(guestName)}\n✨ ${escHtml(serviceName)} × ${effectiveQty}\n` +
      `❌ Teya: ${escHtml(teyaError.message?.substring(0, 100))}\n\nЗамовлення створено, але оплата не вдалася.`,
    ).catch(() => {});
    return NextResponse.json({ error: 'Payment system temporarily unavailable. Please try again later.', orderIds }, { status: 503 });
  }
}

// ─── Cart bulk pay ────────────────────────────────────────────────────────────
async function handleCartPay(token: string, items: CartItemInput[]): Promise<NextResponse> {
  const reservation = actionsRepo.getReservationForPay(token);
  if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const serviceIds = [...new Set(items.map((i) => i.serviceId))];
  const services = actionsRepo.getServicesForCart(serviceIds, reservation.property_id);
  const svcMap = new Map(services.map((s: any) => [s.id, s]));

  const resolvedItems: Array<{ svc: any; quantity: number; lineTotal: number; serviceDates?: string[] }> = [];
  for (const item of items) {
    const svc = svcMap.get(item.serviceId);
    if (!svc) return NextResponse.json({ error: `Service not found: ${item.serviceId}` }, { status: 404 });
    const qty = Math.max(1, item.quantity || 1);
    const serviceDates = item.serviceDates && item.serviceDates.length > 0 ? item.serviceDates : undefined;
    const effectiveQty = serviceDates ? Math.max(qty, serviceDates.length) : qty;
    resolvedItems.push({ svc, quantity: effectiveQty, lineTotal: svc.price * effectiveQty, serviceDates });
  }

  const grandTotal = resolvedItems.reduce((s, i) => s + i.lineTotal, 0);
  const guestName = `${reservation.first_name} ${reservation.last_name}`;
  const currency = resolvedItems[0]?.svc?.currency || 'CZK';
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const orderIds: string[] = [];
  for (const { svc, quantity, lineTotal, serviceDates } of resolvedItems) {
    const dates = (serviceDates && serviceDates.length > 0) ? serviceDates : null;
    if (dates && dates.length > 1) {
      // Breakfast with multiple dates: create one order per date
      for (const date of dates) {
        const oid = actionsRepo.createPendingServiceOrder(reservation.id, svc.id, 1, svc.price, date);
        if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
        orderIds.push(oid);
      }
    } else {
      const oid = actionsRepo.createPendingServiceOrder(reservation.id, svc.id, quantity, lineTotal, dates?.[0] || null);
      if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      orderIds.push(oid);
    }
  }

  console.log(`[Cart Pay] ${resolvedItems.length} items | ${grandTotal} ${currency} | ${guestName}`);

  sendTelegramMessage([
    `🛒 <b>Cart Checkout</b>`, ``,
    `👤 ${escHtml(guestName)}`, `🏠 ${escHtml(reservation.unit_name)}`,
    `📅 ${reservation.check_in} — ${reservation.check_out}`, ``,
    ...resolvedItems.map(({ svc, quantity, lineTotal }) =>
      `  • ${escHtml(svc.name_en || svc.name)} ×${quantity} — ${lineTotal} ${currency}`
    ), ``,
    `💰 Total: ${grandTotal} ${currency}`, `💳 Статус: Очікує оплати`,
  ].join('\n')).catch((e) => console.error('[Cart Pay] TG error:', e.message));

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
    const session = await createPaymentSession({
      kind: 'service_cart',
      amount: grandTotal,
      currency,
      description: `Kemp Carlsbad — Cart (${resolvedItems.length} ${resolvedItems.length === 1 ? 'item' : 'items'}) — ${guestName}`,
      lineItems: resolvedItems.map(({ svc, quantity }) => ({
        description: svc.name_en || svc.name,
        quantity,
        unitPriceMajor: svc.price,
      })),
      metadata: { order_ids: orderIds.join(','), reservation_id: reservation.id, source: 'guest_cart' },
      successUrl: `${baseUrl}/guest/${token}?payment=success`,
      cancelUrl: `${baseUrl}/guest/${token}?payment=cancel`,
    });
    for (const orderId of orderIds) actionsRepo.updateOrderPaymentId(orderId, session.sessionId);
    console.log(`[Cart Pay] Teya session: ${session.sessionId}`);
    return NextResponse.json({ success: true, orderIds, session_url: session.sessionUrl, session_id: session.sessionId });
  } catch (teyaError: any) {
    console.error('[Cart Pay] Teya error:', teyaError.message);
    for (const orderId of orderIds) actionsRepo.markOrderPaymentFailed(orderId);
    return NextResponse.json({ error: 'Payment system temporarily unavailable. Please try again later.' }, { status: 503 });
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function payForService(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();

    // Cart bulk pay: { items: [...] }
    if (Array.isArray(body.items) && body.items.length > 0) {
      return handleCartPay(token, body.items);
    }

    // Single pay (backward compat): { serviceId, quantity, serviceDates }
    const { serviceId, quantity = 1, serviceDates } = body;
    if (!serviceId) return NextResponse.json({ error: 'serviceId or items is required' }, { status: 400 });
    return handleSinglePay(token, serviceId, quantity, serviceDates);
  } catch (error: any) {
    console.error('POST /api/guest/[token]/pay error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment' }, { status: 500 });
  }
}

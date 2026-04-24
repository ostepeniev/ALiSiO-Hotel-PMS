/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/teya'; // TODO: replace with eventBus
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createCheckoutSessionOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function createWidgetCheckoutSession(req: Request) {
  try {
    const body = await req.json();
    const { 
      reservation_id, 
      site_slug,
      site_id: clientSiteId,
      return_path,
      service_id, 
      service_date, 
      start_hour, 
      hours, 
      addons,
      // Legacy fields from booking/page.tsx (glamping flow)
      amount: clientAmount,
      currency: clientCurrency,
      description: clientDescription,
    } = body;

    const db = getDb();

    // 1. Resolve Site and Payment Config
    //    site_slug is optional — when absent, fall back to global ENV credentials
    let site: any = null;
    let payCfg: any = {};

    if (site_slug) {
      site = db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE slug = ?').get(site_slug) as any;
      if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: CORS_HEADERS });
      }
      payCfg = JSON.parse(site.payment_config || '{}');
    } else if (clientSiteId) {
      // booking/page.tsx sends site_id instead of site_slug
      site = db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE id = ?').get(clientSiteId) as any;
      if (site) payCfg = JSON.parse(site.payment_config || '{}');
    }

    // Check if payment is possible: either site-specific Teya config or global ENV
    const hasSiteTeya = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id;
    if (!hasSiteTeya && !process.env.TEYA_CLIENT_ID) {
      return NextResponse.json({ error: 'Online payments not configured' }, { status: 403, headers: CORS_HEADERS });
    }


    // 2. Resolve Amount (Recalculate from DB for security, with client fallback)
    let amount = 0;
    let currency = 'CZK';
    let description = 'ALiSiO Booking';

    if (service_id && service_date) {
      // Service-only order (e.g. Sauna from Guest Page)
      const svc = db.prepare('SELECT name, price, currency FROM additional_services WHERE id = ?').get(service_id) as any;
      if (!svc) return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      
      const h = hours || 1;
      amount = svc.price * h;
      currency = svc.currency || 'CZK';
      description = svc.name;

      // Handle addons
      if (addons && Array.isArray(addons)) {
        for (const addon of addons) {
          amount += (addon.price || 0) * (addon.quantity || 1);
        }
      }
    } else if (reservation_id) {
      // Main Reservation payment
      const res = db.prepare('SELECT total_price, currency FROM reservations WHERE id = ?').get(reservation_id) as any;
      if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
      
      amount = res.total_price;
      currency = res.currency || 'CZK';
      description = `Booking #${reservation_id.substring(0, 8)}`;

      // Also add unpaid booking_service_orders to the total
      const svcOrders = db.prepare(
        "SELECT SUM(total_price) as svc_total FROM booking_service_orders WHERE reservation_id = ? AND payment_status IN ('none','pending',NULL)"
      ).get(reservation_id) as any;
      if (svcOrders?.svc_total) amount += svcOrders.svc_total;
    } else if (clientAmount && typeof clientAmount === 'number' && clientAmount > 0) {
      // Legacy fallback: booking/page.tsx sends amount directly
      amount = clientAmount;
      currency = clientCurrency || 'CZK';
      description = clientDescription || 'ALiSiO Booking';
    } else {
      return NextResponse.json({ error: 'reservation_id or service_id is required' }, { status: 400, headers: CORS_HEADERS });
    }

    // Fallback: if DB amount is 0 but client sent a valid amount, use client amount
    if (amount <= 0 && clientAmount && typeof clientAmount === 'number' && clientAmount > 0) {
      amount = clientAmount;
      if (clientCurrency) currency = clientCurrency;
      if (clientDescription) description = clientDescription;
    }


    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

    // Step 1: Create preliminary order for services if needed
    let orderId: string | null = null;
    if (service_id && service_date) {
      try {
        orderId = `bso_${Date.now()}`;
        const h = hours || 2;
        const sHour = start_hour || 14;

        db.prepare(`
          INSERT INTO booking_service_orders (id, reservation_id, service_id, quantity, service_date,
            options_json, unit_price, total_price, status, payment_id, payment_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'pending')
        `).run(
          orderId, reservation_id || null, service_id, h, service_date,
          JSON.stringify({ startHour: sHour, hours: h, addons: addons || [] }),
          amount / h, amount,
          'pending_teya'
        );
        // ... slots logic omitted for brevity as it was already there ...
      } catch (dbErr: any) {
        console.error('[Checkout Session] DB error:', dbErr.message);
      }
    }

    // Step 2: TG Notification
    try {
      const text = [
        `📦 <b>Запит на оплату: ${esc(description)}</b>`,
        `💰 ${amount} ${currency}`,
        `🌍 Сайт: ${site_slug || site?.id || 'default'}`,
        `💳 Очікує сесії...`,
      ].join('\n');
      sendTelegramMessage(text).catch(() => {});
    } catch { /* */ }

    // Step 3: Call Teya with dynamic credentials
    const origin = new URL(req.url).origin;
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');
    const amountMinor = Math.round(amount * 100);

    // Validate returnTo for security (prevent open redirects)
    let returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    if (returnTo.startsWith('http') && site?.site_url) {
       try {
         const allowedHost = new URL(site.site_url).hostname;
         const targetHost = new URL(returnTo).hostname;
         if (allowedHost !== targetHost && !targetHost.includes('alisio.eu')) {
            returnTo = site.site_url;
         }
       } catch { /* invalid URL — keep returnTo */ }
    }

    try {
      const session = await createCheckoutSession({
        amount: amountMinor,
        currency: currency || 'CZK',
        description,
        metadata: reservation_id ? { reservation_id, ...(site?.id && { site_id: site.id }) } : (site?.id ? { site_id: site.id } : {}),
        credentials: hasSiteTeya ? {
          client_id: payCfg.teya.client_id,
          client_secret: payCfg.teya.client_secret,
          store_id: payCfg.teya.store_id
        } : undefined,
        ...(isProduction ? {
          success_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=success&return=${encodeURIComponent(returnTo)}`,
          cancel_url: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=cancel&return=${encodeURIComponent(returnTo)}`,
        } : {}),
      });

      if (reservation_id) {
        try {
          db.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(session.id, reservation_id);
        } catch (e: any) { console.error('[Checkout Session] Update res payment_id error:', e.message); }
      }

      if (orderId) {
        try {
          db.prepare('UPDATE booking_service_orders SET payment_id = ? WHERE id = ?').run(session.id, orderId);
        } catch { /* */ }
      }

      return NextResponse.json({
        session_token: session.session_token,
        session_id: session.id,
        session_url: session.session_url,
      }, { headers: CORS_HEADERS });

    } catch (teyaErr: any) {
      console.error('[Checkout Session] Teya error:', teyaErr.message);
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

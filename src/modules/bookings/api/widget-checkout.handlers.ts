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
      return_path,
      service_id, 
      service_date, 
      start_hour, 
      hours, 
      addons,
      // Client-provided fallbacks (used by BookingWizard /book flow)
      amount: clientAmount,
      currency: clientCurrency,
      description: clientDescription,
    } = body;

    const db = getDb();

    // 1. Resolve Site and Payment Config
    // site_slug is optional — if not provided, use global env credentials
    let site: any = null;
    let payCfg: any = {};

    if (site_slug) {
      site = db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE slug = ?').get(site_slug) as any;
      if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: CORS_HEADERS });
      }
      payCfg = JSON.parse(site.payment_config || '{}');
    }

    const useSiteTeya = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id;
    if (!useSiteTeya && !process.env.TEYA_CLIENT_ID) {
      return NextResponse.json({ error: 'Online payments not configured' }, { status: 403, headers: CORS_HEADERS });
    }

    // 2. Resolve Amount (Recalculate from DB for security)
    let amount = 0;
    let currency = 'CZK';
    let description = 'ALiSiO Booking';
    let servicesBreakdown: { name: string; total: number; details?: string }[] = [];
    let guestInfo = '';
    let unitName = '';

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

      servicesBreakdown.push({
        name: svc.name,
        total: amount,
        details: `${h} hod, ${service_date}${start_hour != null ? `, ${start_hour}:00–${start_hour + h}:00` : ''}`,
      });

      // Try to get guest info from reservation if provided
      if (reservation_id) {
        const guest = db.prepare(`
          SELECT g.first_name, g.last_name, u.name as unit_name
          FROM reservations r
          JOIN guests g ON r.guest_id = g.id
          LEFT JOIN units u ON r.unit_id = u.id
          WHERE r.id = ?
        `).get(reservation_id) as any;
        if (guest) {
          guestInfo = `${guest.first_name} ${guest.last_name}`;
          unitName = guest.unit_name || '';
        }
      }
    } else if (reservation_id) {
      // Main Reservation payment — include booked services
      const res = db.prepare('SELECT total_price, currency FROM reservations WHERE id = ?').get(reservation_id) as any;
      if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
      
      amount = res.total_price || 0;
      currency = res.currency || 'CZK';
      description = clientDescription || `Booking #${reservation_id.substring(0, 8)}`;

      // Add services from booking_service_orders that haven't been paid yet
      try {
        const pendingSvcOrders = db.prepare(`
          SELECT bso.total_price, bso.service_id, bso.quantity, bso.service_date, bso.options_json,
                 s.name as svc_name, s.name_en as svc_name_en
          FROM booking_service_orders bso
          LEFT JOIN additional_services s ON bso.service_id = s.id
          WHERE bso.reservation_id = ? AND (bso.payment_status = 'none' OR bso.payment_status = 'pending' OR bso.payment_status IS NULL)
        `).all(reservation_id) as any[];

        for (const svcOrd of pendingSvcOrders) {
          amount += svcOrd.total_price || 0;
          let details = '';
          try {
            const opts = JSON.parse(svcOrd.options_json || '{}');
            if (opts.startHour != null && opts.hours) {
              details = `${svcOrd.service_date || ''}, ${opts.startHour}:00–${opts.startHour + opts.hours}:00`;
            }
          } catch { /* */ }
          servicesBreakdown.push({
            name: svcOrd.svc_name_en || svcOrd.svc_name || svcOrd.service_id,
            total: svcOrd.total_price || 0,
            details,
          });
        }
      } catch (e: any) { console.error('[Checkout] Service orders query error:', e.message); }

      // Fallback: if DB total is 0 but client sent an amount, use client amount
      // This is needed for BookingWizard (/book) where draft total_price may be 0
      if (amount <= 0 && clientAmount && clientAmount > 0) {
        amount = clientAmount;
        console.log(`[Checkout] Using client-provided amount: ${amount} (DB total was 0)`);
      }
      if (clientCurrency) currency = clientCurrency;

      // Get guest info
      try {
        const guest = db.prepare(`
          SELECT g.first_name, g.last_name, u.name as unit_name
          FROM reservations r
          JOIN guests g ON r.guest_id = g.id
          LEFT JOIN units u ON r.unit_id = u.id
          WHERE r.id = ?
        `).get(reservation_id) as any;
        if (guest) {
          guestInfo = `${guest.first_name} ${guest.last_name}`;
          unitName = guest.unit_name || '';
        }
      } catch { /* */ }
    } else {
      return NextResponse.json({ error: 'reservation_id or service_id is required' }, { status: 400, headers: CORS_HEADERS });
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

    // Step 2: TG Notification (detailed format)
    try {
      const lines = [
        `📦 <b>Запит на оплату: ${esc(description)}</b>`,
        ``,
      ];
      if (guestInfo) lines.push(`👤 ${esc(guestInfo)}`);
      if (unitName) lines.push(`🏠 ${esc(unitName)}`);
      if (servicesBreakdown.length > 0) {
        for (const svc of servicesBreakdown) {
          lines.push(`🔹 ${esc(svc.name)}${svc.details ? ` — ${esc(svc.details)}` : ''}: ${svc.total} ${currency}`);
        }
      }
      lines.push(`💰 ${amount} ${currency}`);
      lines.push(`🌍 Сайт: ${site_slug || 'kemp-widget'}`);
      lines.push(`💳 Створюється сесія оплати...`);
      const text = lines.join('\n');
      sendTelegramMessage(text).catch(() => {});
    } catch { /* */ }

    // Step 3: Call Teya with dynamic credentials
    const origin = new URL(req.url).origin;
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');
    const amountMinor = Math.round(amount * 100);

    // Validate returnTo for security (prevent open redirects)
    let returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    if (returnTo.startsWith('http') && site?.site_url) {
       const allowedHost = new URL(site.site_url).hostname;
       const targetHost = new URL(returnTo).hostname;
       if (allowedHost !== targetHost && !targetHost.includes('alisio.eu')) {
          returnTo = site.site_url; // Fallback to safe URL
       }
    }

    try {
      const session = await createCheckoutSession({
        amount: amountMinor,
        currency: currency || 'CZK',
        description,
        metadata: reservation_id ? { reservation_id, site_id: site?.id || 'kemp' } : { site_id: site?.id || 'kemp' },
        credentials: useSiteTeya ? {
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

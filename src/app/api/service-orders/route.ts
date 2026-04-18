/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/service-orders
 * 
 * Returns service orders for the PMS dashboard.
 * Query params:
 *   period: 'today' | 'week' | 'all' (default: 'week')
 */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || 'week';

    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND bso.service_date = date('now')";
    } else if (period === 'week') {
      dateFilter = "AND bso.service_date >= date('now') AND bso.service_date <= date('now', '+7 days')";
    }

    // Get booking_service_orders (from widget / booking page)
    const widgetOrders = db.prepare(`
      SELECT 
        bso.id, bso.reservation_id, bso.service_id, bso.quantity,
        bso.service_date, bso.options_json, bso.unit_price, bso.total_price,
        bso.status, bso.payment_status, bso.promo_code, bso.created_at,
        ads.name as service_name, ads.name_en,
        g.first_name, g.last_name,
        u.name as unit_name
      FROM booking_service_orders bso
      JOIN additional_services ads ON bso.service_id = ads.id
      LEFT JOIN reservations r ON bso.reservation_id = r.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE 1=1 ${dateFilter}
      ORDER BY bso.service_date ASC, bso.created_at DESC
    `).all() as any[];

    // Get service_orders (from guest page)
    const guestOrders = db.prepare(`
      SELECT 
        so.id, so.reservation_id, so.service_id, so.quantity,
        so.total_price, so.status, so.payment_status, so.created_at,
        ads.name as service_name, ads.name_en,
        g.first_name, g.last_name,
        u.name as unit_name,
        r.check_in, r.check_out
      FROM service_orders so
      JOIN additional_services ads ON so.service_id = ads.id
      JOIN reservations r ON so.reservation_id = r.id
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      ORDER BY so.created_at DESC
      LIMIT 20
    `).all() as any[];

    // Format widget orders
    const orders = widgetOrders.map(o => {
      let startHour = null, endHour = null;
      if (o.options_json) {
        try {
          const opts = JSON.parse(o.options_json);
          startHour = opts.startHour;
          endHour = opts.startHour + opts.hours;
        } catch { /* ignore */ }
      }
      return {
        id: o.id,
        source: 'widget',
        reservationId: o.reservation_id,
        serviceId: o.service_id,
        serviceName: o.name_en || o.service_name,
        serviceDate: o.service_date,
        startHour,
        endHour,
        quantity: o.quantity,
        totalPrice: o.total_price,
        status: o.status,
        paymentStatus: o.payment_status,
        promoCode: o.promo_code,
        guestName: o.first_name ? `${o.first_name} ${o.last_name}` : null,
        unitName: o.unit_name,
        createdAt: o.created_at,
      };
    });

    // Format guest orders
    const gOrders = guestOrders.map(o => ({
      id: o.id,
      source: 'guest_page',
      reservationId: o.reservation_id,
      serviceId: o.service_id,
      serviceName: o.name_en || o.service_name,
      serviceDate: o.check_in,
      startHour: null,
      endHour: null,
      quantity: o.quantity,
      totalPrice: o.total_price,
      status: o.status,
      paymentStatus: o.payment_status,
      promoCode: null,
      guestName: `${o.first_name} ${o.last_name}`,
      unitName: o.unit_name,
      createdAt: o.created_at,
    }));

    return NextResponse.json({
      orders: [...orders, ...gOrders],
      total: orders.length + gOrders.length,
    });

  } catch (error: any) {
    console.error('GET /api/service-orders error:', error?.message);
    return NextResponse.json({ error: 'Failed to load service orders' }, { status: 500 });
  }
}

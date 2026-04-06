/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/booking/services?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&serviceId=xxx
// Returns available services for the booking period
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const serviceId = searchParams.get('serviceId');

    // Check which tables exist
    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );

    if (!existingTables.has('additional_services')) {
      return NextResponse.json({ services: [] }, { headers: CORS_HEADERS });
    }

    // If specific service requested (for sauna slot details)
    if (serviceId && checkIn && checkOut) {
      const service = db.prepare('SELECT * FROM additional_services WHERE id = ? AND is_active = 1').get(serviceId) as any;
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      }

      const result: any = {
        ...formatService(service),
      };

      // For slot_booking services (sauna), return existing booked slots
      if (service.service_type === 'slot_booking' && existingTables.has('service_time_slots')) {
        const bookedSlots = db.prepare(`
          SELECT date, start_time, end_time, booked_count, max_capacity
          FROM service_time_slots
          WHERE service_id = ? AND date >= ? AND date < ? AND booked_count >= max_capacity
        `).all(serviceId, checkIn, checkOut) as any[];
        result.bookedSlots = bookedSlots;
      }

      // For menu_selection services (breakfast), return menu items
      if (service.service_type === 'menu_selection' && existingTables.has('menu_items')) {
        const items = db.prepare(
          'SELECT * FROM menu_items WHERE service_id = ? AND is_available = 1 ORDER BY sort_order'
        ).all(serviceId) as any[];
        result.menuItems = items.map(item => ({
          id: item.id,
          name: item.name,
          nameEn: item.name_en,
          nameCs: item.name_cs,
          nameDe: item.name_de,
          description: item.description,
          weightGrams: item.weight_grams,
          price: item.price,
          photoUrl: item.photo_url,
        }));
      }

      // Get addons for this service
      if (existingTables.has('service_addons')) {
        const addons = db.prepare(
          'SELECT * FROM service_addons WHERE service_id = ? ORDER BY sort_order'
        ).all(serviceId) as any[];
        result.addons = addons.map(a => ({
          id: a.id,
          name: a.name,
          nameEn: a.name_en,
          nameCs: a.name_cs,
          nameDe: a.name_de,
          price: a.price,
          icon: a.icon,
        }));
      }

      return NextResponse.json(result, { headers: CORS_HEADERS });
    }

    // Return all available services for glamping
    const services = db.prepare(`
      SELECT * FROM additional_services
      WHERE is_active = 1 AND (available_for = 'all' OR available_for = 'glamping')
      ORDER BY sort_order
    `).all() as any[];

    const result = services.map(s => formatService(s));

    return NextResponse.json({ services: result }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/services error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500, headers: CORS_HEADERS });
  }
}

// POST /api/booking/services/sauna-slots — Book sauna time slots
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { action } = body;

    if (action === 'book-slots') {
      const { serviceId, date, startHour, hours, persons, addons, reservationId } = body;

      if (!serviceId || !date || startHour === undefined || !hours || hours < 2) {
        return NextResponse.json(
          { error: 'serviceId, date, startHour, hours (min 2) required' },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Get service price
      const service = db.prepare('SELECT * FROM additional_services WHERE id = ?').get(serviceId) as any;
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      }

      const pricePerHour = service.price; // 600 CZK
      let totalPrice = pricePerHour * hours;

      // Check if any of the requested slots are already booked
      const existingTables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
          .map(t => t.name)
      );

      if (existingTables.has('service_time_slots')) {
        for (let h = 0; h < hours; h++) {
          const slotStart = `${String(startHour + h).padStart(2, '0')}:00`;
          const existing = db.prepare(`
            SELECT id FROM service_time_slots
            WHERE service_id = ? AND date = ? AND start_time = ? AND booked_count >= max_capacity
          `).get(serviceId, date, slotStart) as any;

          if (existing) {
            return NextResponse.json(
              { error: `Slot ${slotStart} on ${date} is already booked` },
              { status: 409, headers: CORS_HEADERS }
            );
          }
        }
      }

      // Calculate addon prices
      let addonTotal = 0;
      const addonDetails: any[] = [];
      if (addons && existingTables.has('service_addons')) {
        for (const addon of addons) {
          const addonRow = db.prepare('SELECT * FROM service_addons WHERE id = ?').get(addon.id) as any;
          if (addonRow) {
            const qty = addon.quantity || 1;
            addonTotal += addonRow.price * qty;
            addonDetails.push({ id: addonRow.id, name: addonRow.name, price: addonRow.price, quantity: qty });
          }
        }
      }
      totalPrice += addonTotal;

      // Create/update time slots
      const slotIds: string[] = [];
      for (let h = 0; h < hours; h++) {
        const slotStart = `${String(startHour + h).padStart(2, '0')}:00`;
        const slotEnd = `${String(startHour + h + 1).padStart(2, '0')}:00`;
        const slotId = `slot_${Date.now()}_${h}`;

        // Try to update existing slot or create new one
        const existingSlot = db.prepare(`
          SELECT id, booked_count FROM service_time_slots
          WHERE service_id = ? AND date = ? AND start_time = ?
        `).get(serviceId, date, slotStart) as any;

        if (existingSlot) {
          db.prepare('UPDATE service_time_slots SET booked_count = booked_count + 1, reservation_id = ? WHERE id = ?')
            .run(reservationId || null, existingSlot.id);
          slotIds.push(existingSlot.id);
        } else {
          db.prepare(`
            INSERT INTO service_time_slots (id, service_id, date, start_time, end_time, max_capacity, booked_count, reservation_id)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?)
          `).run(slotId, serviceId, date, slotStart, slotEnd, reservationId || null);
          slotIds.push(slotId);
        }
      }

      // Create booking_service_order
      if (existingTables.has('booking_service_orders') && reservationId) {
        const orderId = `bso_${Date.now()}`;
        db.prepare(`
          INSERT INTO booking_service_orders (id, reservation_id, service_id, quantity, service_date, time_slot_id, options_json, unit_price, total_price, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
        `).run(
          orderId, reservationId, serviceId, hours, date, slotIds[0],
          JSON.stringify({ persons: persons || 1, addons: addonDetails, hours, startHour }),
          pricePerHour, totalPrice
        );
      }

      return NextResponse.json({
        success: true,
        slotIds,
        hours,
        date,
        startHour,
        endHour: startHour + hours,
        persons: persons || 1,
        pricePerHour,
        addonTotal,
        totalPrice,
        addons: addonDetails,
      }, { status: 201, headers: CORS_HEADERS });

    } else if (action === 'book-breakfast') {
      const { reservationId, items, serviceDate } = body;
      // items: [{ menuItemId, quantity }]

      if (!items || items.length === 0) {
        return NextResponse.json({ error: 'items required' }, { status: 400, headers: CORS_HEADERS });
      }

      let totalPrice = 0;
      const orderDetails: any[] = [];

      for (const item of items) {
        const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1').get(item.menuItemId) as any;
        if (!menuItem) continue;

        const qty = item.quantity || 1;
        const itemTotal = menuItem.price * qty;
        totalPrice += itemTotal;

        if (reservationId) {
          const orderId = `bso_${Date.now()}_${menuItem.id}`;
          db.prepare(`
            INSERT INTO booking_service_orders (id, reservation_id, service_id, menu_item_id, quantity, service_date, unit_price, total_price, status)
            VALUES (?, ?, 'svc_breakfast', ?, ?, ?, ?, ?, 'confirmed')
          `).run(orderId, reservationId, menuItem.id, qty, serviceDate || null, menuItem.price, itemTotal);
        }

        orderDetails.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: qty,
          unitPrice: menuItem.price,
          totalPrice: itemTotal,
        });
      }

      return NextResponse.json({
        success: true,
        items: orderDetails,
        totalPrice,
      }, { status: 201, headers: CORS_HEADERS });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('POST /api/booking/services error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to process service booking' }, { status: 500, headers: CORS_HEADERS });
  }
}

function formatService(s: any) {
  return {
    id: s.id,
    name: s.name,
    nameEn: s.name_en,
    nameCs: s.name_cs,
    nameDe: s.name_de,
    description: s.description,
    price: s.price,
    currency: s.currency || 'CZK',
    unitLabel: s.unit_label,
    icon: s.icon,
    category: s.category,
    serviceType: s.service_type || 'simple',
    durationMinutes: s.duration_minutes,
    photoUrl: s.photo_url,
    minQuantity: s.min_quantity || 0,
    maxQuantity: s.max_quantity || 10,
  };
}

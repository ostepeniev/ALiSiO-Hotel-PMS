/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createBookingDraftOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/booking/drafts
 * Creates a booking draft AND a real reservation + guest in PMS
 */
export async function createBookingDraft(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    const draftId = `bkd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sessionId = body.session_id || `sess_${Date.now()}`;

    // ─── 1. Find property ────────────────────────────
    const property = db.prepare('SELECT id, organization_id FROM properties WHERE is_active = 1 LIMIT 1').get() as any;
    if (!property) throw new Error('No active property');

    // ─── 2. Create/find guest ────────────────────────
    const guestName = body.guest_name || '';
    const nameParts = guestName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || '';
    const email = body.guest_email || null;
    const phone = body.guest_phone || null;

    let guestId: string;
    if (email) {
      const existing = db.prepare(
        'SELECT id FROM guests WHERE email = ? AND organization_id = ?'
      ).get(email, property.organization_id) as any;

      if (existing) {
        guestId = existing.id;
        db.prepare(
          'UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime("now") WHERE id = ?'
        ).run(firstName, lastName, phone, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare(
          'INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(guestId, property.organization_id, firstName, lastName, email, phone);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare(
        'INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(guestId, property.organization_id, firstName, lastName, phone);
    }

    // ─── 3. Calculate nights ─────────────────────────
    const checkIn = body.check_in || null;
    const checkOut = body.check_out || null;
    let nights = 1;
    if (checkIn && checkOut) {
      nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    }

    // ─── 4. Find a suitable unit (for camping/buildings/glamping) ───
    // For camping: use a generic camping unit; for glamping/buildings: match unit type
    let unitId: string | null = null;
    const accommodationType = body.accommodation_type || 'camping';
    const accommodationData = body.accommodation_data || {};

    if (accommodationType === 'glamping') {
      const unitCode = accommodationData.unit; // 'tiny' or 'barn'
      const unit = db.prepare(`
        SELECT u.id FROM units u
        JOIN unit_types ut ON u.unit_type_id = ut.id
        JOIN categories c ON u.category_id = c.id
        WHERE c.type = 'glamping' AND u.is_active = 1 AND u.room_status = 'available'
          AND (ut.code LIKE ? OR ut.name LIKE ?)
        LIMIT 1
      `).get(`%${unitCode || ''}%`, `%${unitCode || ''}%`) as any;
      unitId = unit?.id || null;
    } else if (accommodationType === 'buildings') {
      const building = accommodationData.building; // 'budova_d' or 'budova_f'
      const unit = db.prepare(`
        SELECT u.id FROM units u
        JOIN buildings b ON u.building_id = b.id
        WHERE u.is_active = 1 AND u.room_status = 'available'
          AND (b.code LIKE ? OR b.name LIKE ?)
        LIMIT 1
      `).get(`%${building || ''}%`, `%${building || ''}%`) as any;
      unitId = unit?.id || null;
    }

    // Fallback: get any available unit
    if (!unitId) {
      const anyUnit = db.prepare(
        "SELECT id FROM units WHERE property_id = ? AND is_active = 1 AND room_status = 'available' LIMIT 1"
      ).get(property.id) as any;
      unitId = anyUnit?.id || null;
    }

    // If still no unit, create a virtual reservation without unit
    // (edge case for camping where we don't have fixed units)

    // ─── 5. Create reservation in PMS ────────────────
    const resId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const guestPageToken = `gpt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const totalPrice = body.total_price || 0;
    const adults = accommodationData.adults || 1;
    const children = accommodationData.children || 0;

    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights,
        adults, children, status, payment_status, source, total_price, guest_page_token, internal_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resId, property.id, unitId, guestId,
      checkIn, checkOut, nights,
      adults, children,
      'tentative', 'unpaid', 'widget_kemp',
      totalPrice, guestPageToken,
      `Accommodation: ${accommodationType} | ${JSON.stringify(accommodationData)}`
    );

    console.log(`[Booking] Created reservation ${resId} for guest ${guestId} (${guestName})`);

    // ─── 6. Create service orders for extras ─────────
    const extras = body.extras || [];
    if (extras.length > 0) {
      const insertOrder = db.prepare(
        'INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, status, payment_status) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const ext of extras) {
        // ext.id is the service_id from additional_services
        const svc = db.prepare('SELECT price FROM additional_services WHERE id = ?').get(ext.id) as any;
        const qty = ext.quantity || 1;
        const price = svc ? svc.price * qty : ext.price || 0;
        insertOrder.run(resId, ext.id, qty, price, 'pending', 'unpaid');
        console.log(`[Booking] Service order: ${ext.id} × ${qty} = ${price} Kč`);
      }
    }

    // ─── 7. Save draft with reservation link ─────────
    db.prepare(`
      INSERT INTO booking_drafts (id, session_id, accommodation_type, unit_type, check_in, check_out,
        adults, children, extras, options, guest_name, guest_email, guest_phone,
        total_price, deposit_amount, status, reservation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      draftId, sessionId,
      accommodationType,
      accommodationData.unit || accommodationData.building || null,
      checkIn, checkOut,
      adults, children,
      JSON.stringify(extras),
      JSON.stringify(accommodationData),
      guestName, email, phone,
      totalPrice, body.deposit_amount || totalPrice,
      resId,
    );

    console.log(`[Booking Draft] Created: ${draftId} → reservation ${resId}`);
    return NextResponse.json({
      id: draftId,
      session_id: sessionId,
      reservation_id: resId,
      guest_page_token: guestPageToken,
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[Booking Draft] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * PUT /api/booking/drafts — update status (admin confirm payment, etc.)
 */
export async function updateBookingDraft(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    const { id, status } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: CORS_HEADERS });

    // Find the draft and its linked reservation
    const draft = db.prepare('SELECT reservation_id FROM booking_drafts WHERE id = ?').get(id) as any;
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404, headers: CORS_HEADERS });

    if (status === 'paid') {
      // Update reservation payment status
      if (draft.reservation_id) {
        db.prepare(`
          UPDATE reservations SET payment_status = 'paid', status = 'confirmed', updated_at = datetime('now')
          WHERE id = ?
        `).run(draft.reservation_id);

        // Also mark service orders as paid
        db.prepare(`
          UPDATE service_orders SET payment_status = 'paid', status = 'confirmed'
          WHERE reservation_id = ? AND payment_status = 'unpaid'
        `).run(draft.reservation_id);

        console.log(`[Booking] Payment confirmed for reservation ${draft.reservation_id}`);
      }
      db.prepare("UPDATE booking_drafts SET status = 'paid', updated_at = datetime('now') WHERE id = ?").run(id);
    } else {
      db.prepare("UPDATE booking_drafts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    }

    return NextResponse.json({ ok: true, reservation_id: draft.reservation_id }, { headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[Booking Draft Update] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function getBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const id = searchParams.get('id');

    let draft: any;
    if (sessionId) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE session_id = ?').get(sessionId);
    } else if (id) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE id = ?').get(id);
    }

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(draft, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function deleteBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: CORS_HEADERS });

    db.prepare('DELETE FROM booking_drafts WHERE id = ?').run(id);
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

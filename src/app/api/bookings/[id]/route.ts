/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@/lib/db';

// GET /api/bookings/[id] — get single reservation
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    const row = db.prepare(`
      SELECT
        r.*, r.guest_page_token, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone, g.country as guest_country,
        u.name as unit_name, u.code as unit_code,
        c.name as category_name, c.type as category_type,
        ut.name as unit_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE r.id = ?
    `).get(id);

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error: any) {
    console.error('GET /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch booking' }, { status: 500 });
  }
}

// PATCH /api/bookings/[id] — update a reservation
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

    console.log('[PATCH] booking id:', id, 'body:', JSON.stringify(body));

    // Build dynamic SET clause for reservations
    const allowed = ['unit_id', 'check_in', 'check_out', 'nights', 'adults', 'children', 'infants', 'status', 'payment_status', 'source', 'total_price', 'commission_amount', 'notes', 'internal_notes', 'city_tax_amount', 'city_tax_included', 'city_tax_paid', 'registration_status'];
    const sets: string[] = [];
    const values: (string | number)[] = [];

    // GATE: block check-in without full payment + registration
    if (body.status === 'checked_in') {
      const current = db.prepare('SELECT payment_status, registration_status FROM reservations WHERE id = ?').get(id) as any;
      const payStatus = body.payment_status || current?.payment_status;
      const regStatus = current?.registration_status;

      if (payStatus !== 'paid') {
        return NextResponse.json({ error: 'Неможливо заселити без повної оплати. Спочатку завершіть оплату.' }, { status: 422 });
      }
      if (regStatus !== 'registered') {
        return NextResponse.json({ error: 'Неможливо заселити без реєстрації гостей. Заповніть документи всіх гостей.' }, { status: 422 });
      }
    }

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    // Auto-generate guest page token when status becomes confirmed
    if (body.status && (body.status === 'confirmed' || body.status === 'checked_in')) {
      const existing = db.prepare('SELECT guest_page_token FROM reservations WHERE id = ?').get(id) as any;
      if (!existing?.guest_page_token) {
        sets.push('guest_page_token = ?');
        values.push(generateGuestToken());
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(id);
      const sql = `UPDATE reservations SET ${sets.join(', ')} WHERE id = ?`;
      console.log('[PATCH] SQL:', sql, 'values:', values);
      const result = db.prepare(sql).run(...values);
      console.log('[PATCH] result:', JSON.stringify(result));
    }

    // If guest data provided, update guest too
    if (body.firstName || body.lastName || body.email || body.phone) {
      const res = db.prepare('SELECT guest_id FROM reservations WHERE id = ?').get(id) as any;
      if (res) {
        const guestSets: string[] = [];
        const guestVals: string[] = [];

        if (body.firstName) { guestSets.push('first_name = ?'); guestVals.push(body.firstName); }
        if (body.lastName) { guestSets.push('last_name = ?'); guestVals.push(body.lastName); }
        if (body.email) { guestSets.push('email = ?'); guestVals.push(body.email); }
        if (body.phone) { guestSets.push('phone = ?'); guestVals.push(body.phone); }

        if (guestSets.length > 0) {
          guestVals.push(res.guest_id);
          db.prepare(`UPDATE guests SET ${guestSets.join(', ')} WHERE id = ?`).run(...guestVals);
        }
      }
    }
    // Auto-log activity for significant changes
    try {
      const logActions: { action: string; details: string }[] = [];
      if (body.status) logActions.push({ action: 'status_change', details: `Статус → ${body.status}` });
      if (body.payment_status) logActions.push({ action: 'payment_status_change', details: `Оплата → ${body.payment_status}` });
      if (body.total_price !== undefined) logActions.push({ action: 'price_change', details: `Ціна → ${body.total_price} CZK` });
      for (const log of logActions) {
        db.prepare("INSERT INTO booking_activity_log (id, reservation_id, action, details) VALUES (?, ?, ?, ?)")
          .run(`al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id, log.action, log.details);
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to update booking' }, { status: 500 });
  }
}

// DELETE /api/bookings/[id] — delete a reservation
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    db.prepare('DELETE FROM reservations WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to delete booking' }, { status: 500 });
  }
}

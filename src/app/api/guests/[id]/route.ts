/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/guests/[id] — single guest with reservation history
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    const guest = db.prepare(`
      SELECT
        g.*,
        (SELECT COUNT(*) FROM reservations r WHERE r.guest_id = g.id) as total_stays,
        (SELECT SUM(r.total_price) FROM reservations r WHERE r.guest_id = g.id) as total_revenue
      FROM guests g
      WHERE g.id = ?
    `).get(id);

    if (!guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    // Fetch reservation history
    const reservations = db.prepare(`
      SELECT
        r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
        r.status, r.payment_status, r.source, r.total_price, r.currency,
        u.name as unit_name, u.code as unit_code,
        c.name as category_name, c.type as category_type
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE r.guest_id = ?
      ORDER BY r.check_in DESC
    `).all(id);

    return NextResponse.json({ ...(guest as object), reservations });
  } catch (error: any) {
    console.error('GET /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch guest' }, { status: 500 });
  }
}

// PATCH /api/guests/[id] — update guest
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

    const fieldMap: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      country: 'country',
      city: 'city',
      address: 'address',
      documentType: 'document_type',
      documentNumber: 'document_number',
      dateOfBirth: 'date_of_birth',
      notes: 'notes',
    };

    const sets: string[] = [];
    const values: (string | null)[] = [];

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (body[jsKey] !== undefined) {
        sets.push(`${dbCol} = ?`);
        values.push(body[jsKey] || null);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE guests SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to update guest' }, { status: 500 });
  }
}

// DELETE /api/guests/[id] — delete guest (blocked if has reservations)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    // Check for linked reservations
    const count = db.prepare('SELECT COUNT(*) as cnt FROM reservations WHERE guest_id = ?').get(id) as { cnt: number };
    if (count.cnt > 0) {
      return NextResponse.json(
        { error: `Неможливо видалити гостя — є ${count.cnt} пов'язаних бронювань. Спочатку видаліть або перепризначте бронювання.` },
        { status: 409 },
      );
    }

    db.prepare('DELETE FROM guests WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to delete guest' }, { status: 500 });
  }
}

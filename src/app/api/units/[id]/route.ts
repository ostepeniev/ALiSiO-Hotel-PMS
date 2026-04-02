import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/units/:id
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    // Nullable fields — convert empty string to null
    const nullableFields = ['building_id', 'floor', 'zone', 'notes'];
    for (const f of nullableFields) {
      if (body[f] === '') body[f] = null;
    }

    const allowedFields = [
      'name', 'code', 'unit_type_id', 'category_id', 'building_id',
      'floor', 'zone', 'beds', 'room_status', 'cleaning_status',
      'notes', 'sort_order', 'is_active',
    ];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/units/:id error:', error);
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

// DELETE /api/units/:id
export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    // Check for active reservations
    const resCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM reservations WHERE unit_id = ? AND status NOT IN ('cancelled', 'checked_out')"
    ).get(id) as { cnt: number };

    if (resCount.cnt > 0) {
      return NextResponse.json({
        error: `Cannot delete: ${resCount.cnt} active reservations exist for this unit.`,
      }, { status: 400 });
    }

    db.prepare('DELETE FROM units WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/units/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}

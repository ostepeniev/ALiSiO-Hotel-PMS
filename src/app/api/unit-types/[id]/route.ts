import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/unit-types/:id
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    // Nullable fields — convert empty string to null
    const nullableFields = ['building_id', 'description'];
    for (const f of nullableFields) {
      if (body[f] === '') body[f] = null;
    }

    const allowedFields = [
      'name', 'code', 'description', 'category_id', 'building_id',
      'max_adults', 'max_children', 'max_occupancy', 'base_occupancy',
      'beds_single', 'beds_double', 'beds_sofa', 'extra_bed_available',
      'sort_order', 'is_active',
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

    db.prepare(`UPDATE unit_types SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM unit_types WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/unit-types/:id error:', error);
    return NextResponse.json({ error: 'Failed to update unit type' }, { status: 500 });
  }
}

// DELETE /api/unit-types/:id
export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE unit_type_id = ?').get(id) as { cnt: number };
    if (unitCount.cnt > 0) {
      return NextResponse.json({ error: `Cannot delete: ${unitCount.cnt} units of this type exist. Delete units first.` }, { status: 400 });
    }

    db.prepare('DELETE FROM unit_types WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/unit-types/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete unit type' }, { status: 500 });
  }
}

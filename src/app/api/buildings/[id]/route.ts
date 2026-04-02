import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/buildings/:id
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = ['name', 'code', 'description', 'sort_order', 'category_id'];
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

    values.push(id);
    db.prepare(`UPDATE buildings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/buildings/:id error:', error);
    return NextResponse.json({ error: 'Failed to update building' }, { status: 500 });
  }
}

// DELETE /api/buildings/:id
export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE building_id = ?').get(id) as { cnt: number };
    if (unitCount.cnt > 0) {
      return NextResponse.json({ error: `Cannot delete: ${unitCount.cnt} units belong to this building. Delete units first.` }, { status: 400 });
    }

    db.prepare('DELETE FROM buildings WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/buildings/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete building' }, { status: 500 });
  }
}

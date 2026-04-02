import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/categories/:id
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = ['name', 'type', 'description', 'sort_order', 'icon', 'color'];
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
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/categories/:id error:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

// DELETE /api/categories/:id
export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    // Check for units in this category
    const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE category_id = ?').get(id) as { cnt: number };
    if (unitCount.cnt > 0) {
      return NextResponse.json({ error: `Cannot delete: ${unitCount.cnt} units belong to this category. Delete units first.` }, { status: 400 });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/categories/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}

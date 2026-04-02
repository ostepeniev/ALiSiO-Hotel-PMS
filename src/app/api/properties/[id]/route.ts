import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// GET /api/properties/:id — full property with nested structure
export async function GET(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Categories
    const categories = db.prepare(`
      SELECT c.*, COUNT(u.id) as unit_count
      FROM categories c
      LEFT JOIN units u ON u.category_id = c.id AND u.is_active = 1
      WHERE c.property_id = ?
      GROUP BY c.id
      ORDER BY c.sort_order
    `).all(id);

    // Buildings
    const buildings = db.prepare(`
      SELECT b.*, COUNT(u.id) as unit_count
      FROM buildings b
      LEFT JOIN units u ON u.building_id = b.id AND u.is_active = 1
      WHERE b.property_id = ?
      GROUP BY b.id
      ORDER BY b.sort_order
    `).all(id);

    // Unit Types
    const unitTypes = db.prepare(`
      SELECT ut.*, COUNT(u.id) as unit_count
      FROM unit_types ut
      LEFT JOIN units u ON u.unit_type_id = ut.id AND u.is_active = 1
      WHERE ut.property_id = ? AND ut.is_active = 1
      GROUP BY ut.id
      ORDER BY ut.sort_order
    `).all(id);

    // Units
    const units = db.prepare(`
      SELECT u.*,
        ut.name as unit_type_name, ut.code as unit_type_code,
        c.name as category_name, c.type as category_type, c.icon as category_icon, c.color as category_color,
        b.name as building_name, b.code as building_code
      FROM units u
      JOIN unit_types ut ON u.unit_type_id = ut.id
      JOIN categories c ON u.category_id = c.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE u.property_id = ?
      ORDER BY c.sort_order, b.sort_order, ut.sort_order, u.sort_order
    `).all(id);

    return NextResponse.json({ property, categories, buildings, unitTypes, units });
  } catch (error) {
    console.error('GET /api/properties/:id error:', error);
    return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 });
  }
}

// PATCH /api/properties/:id — update property fields
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = ['name', 'slug', 'address', 'city', 'country', 'phone', 'email', 'check_in_time', 'check_out_time', 'is_active'];
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

    db.prepare(`UPDATE properties SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/properties/:id error:', error);
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
  }
}

// DELETE /api/properties/:id
export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const db = getDb();
    const { id } = await context.params;

    // Check if not the last property
    const count = db.prepare('SELECT COUNT(*) as cnt FROM properties').get() as { cnt: number };
    if (count.cnt <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last property' }, { status: 400 });
    }

    db.prepare('DELETE FROM properties WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/properties/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
  }
}

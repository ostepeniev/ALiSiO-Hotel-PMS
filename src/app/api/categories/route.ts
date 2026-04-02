import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/categories — list all categories with unit counts
export async function GET() {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        c.id, c.name, c.type, c.icon, c.color, c.sort_order,
        COUNT(u.id) as unit_count
      FROM categories c
      LEFT JOIN units u ON u.category_id = c.id AND u.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order
    `).all();

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/categories error:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

// POST /api/categories — create a category
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { property_id, name, type, description, sort_order, icon, color } = body;

    if (!property_id || !name || !type) {
      return NextResponse.json({ error: 'property_id, name, and type are required' }, { status: 400 });
    }

    if (!['glamping', 'resort', 'camping'].includes(type)) {
      return NextResponse.json({ error: 'type must be glamping, resort, or camping' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO categories (property_id, name, type, description, sort_order, icon, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, name, type, description || null, sort_order || 0, icon || null, color || null);

    const created = db.prepare('SELECT * FROM categories WHERE rowid = ?').get(result.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/categories error:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

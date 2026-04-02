import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/buildings
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property_id') || '';

    let query = `
      SELECT b.*, c.name as category_name, c.type as category_type,
        COUNT(u.id) as unit_count
      FROM buildings b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN units u ON u.building_id = b.id AND u.is_active = 1
      WHERE 1=1
    `;
    const params: string[] = [];

    if (propertyId) {
      query += ' AND b.property_id = ?';
      params.push(propertyId);
    }

    query += ' GROUP BY b.id ORDER BY b.sort_order';

    const rows = db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/buildings error:', error);
    return NextResponse.json({ error: 'Failed to fetch buildings' }, { status: 500 });
  }
}

// POST /api/buildings
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { category_id, property_id, name, code, description, sort_order } = body;

    if (!category_id || !property_id || !name || !code) {
      return NextResponse.json({ error: 'category_id, property_id, name, and code are required' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO buildings (category_id, property_id, name, code, description, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(category_id, property_id, name, code, description || null, sort_order || 0);

    const created = db.prepare('SELECT * FROM buildings WHERE rowid = ?').get(result.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/buildings error:', error);
    return NextResponse.json({ error: 'Failed to create building' }, { status: 500 });
  }
}

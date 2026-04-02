import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/unit-types — list unit types, optionally filtered by category
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const categoryType = searchParams.get('category') || '';

    let query = `
      SELECT
        ut.id, ut.name, ut.code, ut.max_adults, ut.max_children, ut.max_occupancy, ut.base_occupancy,
        ut.beds_single, ut.beds_double, ut.sort_order,
        c.id as category_id, c.name as category_name, c.type as category_type,
        b.id as building_id, b.name as building_name, b.code as building_code,
        COUNT(u.id) as unit_count
      FROM unit_types ut
      JOIN categories c ON ut.category_id = c.id
      LEFT JOIN buildings b ON ut.building_id = b.id
      LEFT JOIN units u ON u.unit_type_id = ut.id AND u.is_active = 1
      WHERE ut.is_active = 1
    `;

    const params: string[] = [];

    if (categoryType) {
      query += ' AND c.type = ?';
      params.push(categoryType);
    }

    query += ' GROUP BY ut.id ORDER BY c.sort_order, ut.sort_order';

    const rows = db.prepare(query).all(...params);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/unit-types error:', error);
    return NextResponse.json({ error: 'Failed to fetch unit types' }, { status: 500 });
  }
}

// POST /api/unit-types — create a unit type
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const {
      property_id, category_id, building_id, name, code,
      description, max_adults, max_children, max_occupancy, base_occupancy,
      beds_single, beds_double, beds_sofa, extra_bed_available, sort_order,
    } = body;

    if (!property_id || !category_id || !name || !code) {
      return NextResponse.json({ error: 'property_id, category_id, name, and code are required' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO unit_types (property_id, category_id, building_id, name, code, description,
        max_adults, max_children, max_occupancy, base_occupancy,
        beds_single, beds_double, beds_sofa, extra_bed_available, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, category_id, building_id || null, name, code, description || null,
      max_adults || 2, max_children || 2, max_occupancy || 4, base_occupancy || 2,
      beds_single || 0, beds_double || 1, beds_sofa || 0, extra_bed_available || 0, sort_order || 0
    );

    const created = db.prepare('SELECT * FROM unit_types WHERE rowid = ?').get(result.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/unit-types error:', error);
    return NextResponse.json({ error: 'Failed to create unit type' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/units — list all units with category + unit type info
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '';
    const unitType = searchParams.get('unitType') || '';

    let query = `
      SELECT
        u.id, u.name, u.code, u.beds, u.zone, u.room_status, u.cleaning_status, u.sort_order, u.is_active,
        c.id as category_id, c.name as category_name, c.type as category_type, c.icon as category_icon, c.color as category_color,
        ut.id as unit_type_id, ut.name as unit_type_name, ut.code as unit_type_code, ut.max_adults, ut.base_occupancy,
        b.id as building_id, b.name as building_name, b.code as building_code
      FROM units u
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE u.is_active = 1
    `;

    const params: string[] = [];

    if (category) {
      query += ' AND c.type = ?';
      params.push(category);
    }

    if (unitType) {
      query += ' AND ut.id = ?';
      params.push(unitType);
    }

    query += ' ORDER BY c.sort_order, b.sort_order, ut.sort_order, u.sort_order';

    const rows = db.prepare(query).all(...params);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/units error:', error);
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

// POST /api/units — create unit(s)
// Supports single creation and bulk creation (prefix + from + to)
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    // Bulk creation mode
    if (body.bulk) {
      const { property_id, category_id, building_id, unit_type_id, prefix, from, to, beds, zone } = body;

      if (!property_id || !category_id || !unit_type_id || !prefix || from === undefined || to === undefined) {
        return NextResponse.json({ error: 'For bulk: property_id, category_id, unit_type_id, prefix, from, to required' }, { status: 400 });
      }

      if (from > to || to - from > 200) {
        return NextResponse.json({ error: 'Invalid range (max 200 units at once)' }, { status: 400 });
      }

      const insert = db.prepare(`
        INSERT INTO units (unit_type_id, property_id, category_id, building_id, name, code, beds, zone, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const created: unknown[] = [];
      const insertMany = db.transaction(() => {
        for (let i = from; i <= to; i++) {
          const name = `${prefix}${i}`;
          const code = `${prefix}${i}`;
          try {
            insert.run(unit_type_id, property_id, category_id, building_id || null, name, code, beds || 0, zone || null, i);
            created.push({ name, code });
          } catch (e: unknown) {
            // Skip duplicates
            if (e instanceof Error && !e.message.includes('UNIQUE')) throw e;
          }
        }
      });
      insertMany();

      return NextResponse.json({ created: created.length, items: created }, { status: 201 });
    }

    // Single creation
    const { unit_type_id, property_id, category_id, building_id, name, code, floor, zone, beds, notes, sort_order } = body;

    if (!unit_type_id || !property_id || !category_id || !name || !code) {
      return NextResponse.json({ error: 'unit_type_id, property_id, category_id, name, and code are required' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO units (unit_type_id, property_id, category_id, building_id, name, code, floor, zone, beds, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      unit_type_id, property_id, category_id, building_id || null,
      name, code, floor || null, zone || null, beds || 0, notes || null, sort_order || 0
    );

    const unit = db.prepare('SELECT * FROM units WHERE rowid = ?').get(result.lastInsertRowid);
    return NextResponse.json(unit, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/units error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create unit';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Unit with this code already exists in this property' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

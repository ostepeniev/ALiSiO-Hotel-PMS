import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/properties — list all properties with counts
export async function GET() {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM categories c WHERE c.property_id = p.id) as category_count,
        (SELECT COUNT(*) FROM buildings b WHERE b.property_id = p.id) as building_count,
        (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.is_active = 1) as unit_count,
        (SELECT COUNT(*) FROM unit_types ut WHERE ut.property_id = p.id AND ut.is_active = 1) as unit_type_count
      FROM properties p
      ORDER BY p.created_at
    `).all();

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/properties error:', error);
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 });
  }
}

// POST /api/properties — create a new property
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, slug, address, city, country, phone, email, check_in_time, check_out_time } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    // Get org id (use the first org)
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    const id = db.prepare(`
      INSERT INTO properties (organization_id, name, slug, address, city, country, phone, email, check_in_time, check_out_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      org.id, name, slug,
      address || null, city || null, country || 'CZ',
      phone || null, email || null,
      check_in_time || '15:00', check_out_time || '10:00'
    );

    const created = db.prepare('SELECT * FROM properties WHERE rowid = ?').get(id.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/properties error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create property';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Property with this slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

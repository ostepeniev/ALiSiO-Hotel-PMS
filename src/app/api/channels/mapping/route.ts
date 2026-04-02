/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/channels/mapping — list all room mappings with unit type info
 * POST /api/channels/mapping — create or update a room mapping
 * DELETE /api/channels/mapping?id=xxx — delete a mapping
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connection_id');

    const db = getDb();
    let query = `
      SELECT crm.*, ut.name as unit_type_name, ut.code as unit_type_code,
        ut.max_adults, ut.max_occupancy, ut.base_occupancy,
        cc.channel, cc.external_property_id
      FROM channel_room_mapping crm
      JOIN unit_types ut ON crm.unit_type_id = ut.id
      JOIN channel_connections cc ON crm.connection_id = cc.id
    `;
    const values: any[] = [];

    if (connectionId) {
      query += ' WHERE crm.connection_id = ?';
      values.push(connectionId);
    }

    query += ' ORDER BY ut.name';

    const mappings = db.prepare(query).all(...values);

    // Also return all unit types for mapping selection
    const unitTypes = db.prepare(`
      SELECT id, name, code, max_adults, max_occupancy, base_occupancy
      FROM unit_types
      ORDER BY name
    `).all();

    return NextResponse.json({ mappings, unitTypes });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection_id, unit_type_id, external_room_type_id, external_rate_plan_id } = body;

    if (!connection_id || !unit_type_id) {
      return NextResponse.json(
        { error: 'connection_id and unit_type_id are required' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Upsert: check if mapping already exists for this connection + unit_type
    const existing = db.prepare(
      'SELECT id FROM channel_room_mapping WHERE connection_id = ? AND unit_type_id = ?'
    ).get(connection_id, unit_type_id) as any;

    if (existing) {
      db.prepare(`
        UPDATE channel_room_mapping
        SET external_room_type_id = ?, external_rate_plan_id = ?,
          is_active = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        external_room_type_id || '',
        external_rate_plan_id || '',
        existing.id,
      );
      return NextResponse.json({ id: existing.id, status: 'updated' });
    } else {
      const id = `crm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO channel_room_mapping
          (id, connection_id, unit_type_id, external_room_type_id, external_rate_plan_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        connection_id,
        unit_type_id,
        external_room_type_id || '',
        external_rate_plan_id || '',
      );
      return NextResponse.json({ id, status: 'created' }, { status: 201 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM channel_room_mapping WHERE id = ?').run(id);
    return NextResponse.json({ status: 'deleted' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

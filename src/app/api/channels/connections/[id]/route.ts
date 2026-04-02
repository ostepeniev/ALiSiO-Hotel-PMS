/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/channels/connections/[id] — get connection details
 * PUT /api/channels/connections/[id] — update connection
 * DELETE /api/channels/connections/[id] — delete connection
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const conn = db.prepare(`
      SELECT cc.*,
        cred.environment, cred.client_id,
        (cred.access_token IS NOT NULL AND cred.token_expires_at > datetime('now')) as token_valid
      FROM channel_connections cc
      LEFT JOIN channel_credentials cred ON cc.credentials_id = cred.id
      WHERE cc.id = ?
    `).get(id);

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const parsed = {
      ...(conn as any),
      connection_types: JSON.parse((conn as any).connection_types || '[]'),
    };

    // Get room mappings for this connection
    const mappings = db.prepare(`
      SELECT crm.*, ut.name as unit_type_name, ut.code as unit_type_code
      FROM channel_room_mapping crm
      JOIN unit_types ut ON crm.unit_type_id = ut.id
      WHERE crm.connection_id = ?
      ORDER BY ut.name
    `).all(id);

    return NextResponse.json({ ...parsed, mappings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (body.external_property_id !== undefined) {
      updates.push('external_property_id = ?');
      values.push(body.external_property_id);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.connection_types !== undefined) {
      updates.push('connection_types = ?');
      values.push(JSON.stringify(body.connection_types));
    }
    if (body.pricing_model !== undefined) {
      updates.push('pricing_model = ?');
      values.push(body.pricing_model);
    }
    if (body.credentials_id !== undefined) {
      updates.push('credentials_id = ?');
      values.push(body.credentials_id);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE channel_connections SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ status: 'updated' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM channel_connections WHERE id = ?').run(id);
    return NextResponse.json({ status: 'deleted' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

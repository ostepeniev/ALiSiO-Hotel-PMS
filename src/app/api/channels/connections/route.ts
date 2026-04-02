/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/channels/connections — list all channel connections
 * POST /api/channels/connections — create a new connection
 */
export async function GET() {
  try {
    const db = getDb();
    const connections = db.prepare(`
      SELECT cc.*,
        cred.environment, cred.client_id,
        (cred.access_token IS NOT NULL AND cred.token_expires_at > datetime('now')) as token_valid
      FROM channel_connections cc
      LEFT JOIN channel_credentials cred ON cc.credentials_id = cred.id
      ORDER BY cc.created_at DESC
    `).all();

    // Parse connection_types from JSON string
    const parsed = (connections as any[]).map(c => ({
      ...c,
      connection_types: JSON.parse(c.connection_types || '[]'),
    }));

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, external_property_id, connection_types, pricing_model } = body;

    if (!channel) {
      return NextResponse.json({ error: 'Channel is required' }, { status: 400 });
    }

    const db = getDb();

    // Get organization_id
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    const id = `cc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO channel_connections
        (id, organization_id, channel, external_property_id, status, connection_types, pricing_model)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      org.id,
      channel,
      external_property_id || null,
      JSON.stringify(connection_types || ['RESERVATIONS', 'AVAILABILITY']),
      pricing_model || 'Standard',
    );

    return NextResponse.json({ id, status: 'created' }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

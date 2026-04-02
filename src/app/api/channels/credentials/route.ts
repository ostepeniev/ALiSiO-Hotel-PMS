/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/channels/credentials — list credentials (masked)
 * POST /api/channels/credentials — create/update credentials
 */
export async function GET() {
  try {
    const db = getDb();
    const creds = db.prepare(`
      SELECT id, organization_id, channel, environment, client_id,
        CASE WHEN client_secret != '' THEN '●●●●●●●●' ELSE '' END as client_secret_masked,
        (access_token IS NOT NULL) as has_token,
        token_expires_at,
        (access_token IS NOT NULL AND token_expires_at > datetime('now')) as token_valid,
        created_at, updated_at
      FROM channel_credentials
      ORDER BY channel, environment
    `).all();

    return NextResponse.json(creds);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, environment, client_id, client_secret } = body;

    if (!channel || !environment || !client_id || !client_secret) {
      return NextResponse.json(
        { error: 'channel, environment, client_id, and client_secret are required' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Get organization_id
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    // Upsert: if credentials for this channel+environment exist, update; otherwise insert
    const existing = db.prepare(
      'SELECT id FROM channel_credentials WHERE organization_id = ? AND channel = ? AND environment = ?'
    ).get(org.id, channel, environment) as any;

    let credId: string;

    if (existing) {
      credId = existing.id;
      db.prepare(`
        UPDATE channel_credentials
        SET client_id = ?, client_secret = ?, access_token = NULL,
          token_expires_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(client_id, client_secret, credId);
    } else {
      credId = `cred_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO channel_credentials (id, organization_id, channel, environment, client_id, client_secret)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(credId, org.id, channel, environment, client_id, client_secret);
    }

    // Auto-link to any connection of this channel that doesn't have credentials
    db.prepare(`
      UPDATE channel_connections
      SET credentials_id = ?, updated_at = datetime('now')
      WHERE channel = ? AND organization_id = ? AND credentials_id IS NULL
    `).run(credId, channel, org.id);

    return NextResponse.json({ id: credId, status: existing ? 'updated' : 'created' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

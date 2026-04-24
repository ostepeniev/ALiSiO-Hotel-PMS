/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createBookingDraftOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function createBookingDraft(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = `bkd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sessionId = body.session_id || `sess_${Date.now()}`;

    db.prepare(`
      INSERT INTO booking_drafts (id, session_id, accommodation_type, unit_type, check_in, check_out,
        adults, children, extras, options, guest_name, guest_email, guest_phone,
        total_price, deposit_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      id, sessionId,
      body.accommodation_type || null,
      body.accommodation_data?.unit || body.accommodation_data?.building || null,
      body.check_in || null,
      body.check_out || null,
      body.accommodation_data?.adults || 1,
      body.accommodation_data?.children || 0,
      JSON.stringify(body.extras || []),
      JSON.stringify(body.accommodation_data || {}),
      body.guest_name || null,
      body.guest_email || null,
      body.guest_phone || null,
      body.total_price || 0,
      body.deposit_amount || 0,
    );

    console.log('[Booking Draft] Created:', id);
    return NextResponse.json({ id, session_id: sessionId }, { headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[Booking Draft] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function getBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const id = searchParams.get('id');

    let draft: any;
    if (sessionId) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE session_id = ?').get(sessionId);
    } else if (id) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE id = ?').get(id);
    }

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(draft, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function deleteBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: CORS_HEADERS });

    db.prepare('DELETE FROM booking_drafts WHERE id = ?').run(id);
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

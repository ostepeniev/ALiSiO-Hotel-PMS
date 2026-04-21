/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

/* ─── GET /api/promo-codes?site_id=xxx ─── */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const siteId = new URL(req.url).searchParams.get('site_id');

    const codes = siteId
      ? db.prepare('SELECT * FROM promo_codes WHERE site_id = ? ORDER BY created_at DESC').all(siteId)
      : db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();

    return NextResponse.json(codes);
  } catch (e: any) {
    console.error('GET /api/promo-codes error:', e?.message || e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/* ─── POST /api/promo-codes ─── */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      code, discount_type, discount_value,
      valid_from, valid_until,
      min_nights, max_nights,
      redemption_limit, site_id,
      allowed_days,           // JSON array e.g. [1,2,3,4,5] (1=Mon…7=Sun)
      description,
    } = body;

    if (!code || discount_value === undefined || discount_value === '') {
      return NextResponse.json({ error: 'code and discount_value are required' }, { status: 400 });
    }

    const db = getDb();

    const id = `promo_${Date.now()}`;
    db.prepare(`
      INSERT INTO promo_codes
        (id, code, description, discount_type, discount_value,
         valid_from, valid_until,
         min_nights, max_nights,
         max_uses, redemption_limit,
         site_id, allowed_days, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `).run(
      id,
      String(code).toUpperCase().trim(),
      description || null,
      discount_type || 'percentage',
      Number(discount_value),
      valid_from || null,
      valid_until || null,
      min_nights ? Number(min_nights) : null,
      max_nights ? Number(max_nights) : null,
      redemption_limit ? Number(redemption_limit) : null,
      redemption_limit ? Number(redemption_limit) : null,  // also set max_uses
      site_id || null,
      allowed_days ? JSON.stringify(allowed_days) : null,
    );

    const created = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
    return NextResponse.json({ code: created }, { status: 201 });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Промокод з таким кодом вже існує' }, { status: 409 });
    }
    console.error('POST /api/promo-codes error:', e?.message || e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

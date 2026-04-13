/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/booking/promo?code=GLAMPING&serviceId=svc_sauna
 *
 * Validates a promo code and returns discount info.
 * Does NOT increment usage — that happens at booking time.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get('code') || '').toUpperCase().trim();
    const serviceId = searchParams.get('serviceId') || '';

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Code is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1').get(code) as any;

    if (!promo) {
      return NextResponse.json({ valid: false, error: 'Invalid promo code' }, { headers: CORS_HEADERS });
    }

    // Check date validity
    const now = new Date().toISOString();
    if (promo.valid_from && now < promo.valid_from) {
      return NextResponse.json({ valid: false, error: 'Promo code not yet active' }, { headers: CORS_HEADERS });
    }
    if (promo.valid_until && now > promo.valid_until) {
      return NextResponse.json({ valid: false, error: 'Promo code has expired' }, { headers: CORS_HEADERS });
    }

    // Check usage limit
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return NextResponse.json({ valid: false, error: 'Promo code usage limit reached' }, { headers: CORS_HEADERS });
    }

    // Check service applicability
    if (promo.applicable_services && serviceId) {
      try {
        const applicable = JSON.parse(promo.applicable_services) as string[];
        if (applicable.length > 0 && !applicable.includes(serviceId)) {
          return NextResponse.json({ valid: false, error: 'Promo code not valid for this service' }, { headers: CORS_HEADERS });
        }
      } catch { /* ignore parse errors — treat as applicable to all */ }
    }

    return NextResponse.json({
      valid: true,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      description: promo.description,
    }, { headers: CORS_HEADERS });

  } catch (error: any) {
    console.error('GET /api/booking/promo error:', error?.message || error);
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500, headers: CORS_HEADERS });
  }
}

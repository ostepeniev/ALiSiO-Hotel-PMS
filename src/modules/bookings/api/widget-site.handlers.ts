/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function getWidgetSiteConfigOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function getWidgetSiteConfig(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    const site = db.prepare(`
      SELECT id, name, slug, design_config, widget_config, payment_config, currency, site_url
      FROM booking_sites
      WHERE slug = ?
    `).get(slug) as any;

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: CORS_HEADERS });
    }

    const payCfg = JSON.parse(site.payment_config || '{}');
    const hasPayment = !!(payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id)
      || !!process.env.TEYA_CLIENT_ID;

    return NextResponse.json({
      id: site.id,
      name: site.name,
      slug: site.slug,
      title: site.name,
      design: JSON.parse(site.design_config || '{}'),
      config: JSON.parse(site.widget_config || '{}'),
      currency: site.currency || 'CZK',
      siteUrl: site.site_url,
      hasPayment,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/site-config error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch site config' }, { status: 500, headers: CORS_HEADERS });
  }
}

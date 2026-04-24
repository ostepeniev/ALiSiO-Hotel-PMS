/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { ResolvedSiteCredentials } from '../domain/types';

export function resolveSiteCredentials(opts: { slug?: string | null; id?: string | null }): ResolvedSiteCredentials | null {
  const slug = opts.slug || undefined;
  const id = opts.id || undefined;
  if (!slug && !id) return null;

  const db = getDb();
  const site = slug
    ? (db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE slug = ?').get(slug) as any)
    : (db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE id = ?').get(id!) as any);

  if (!site) return null;

  let payCfg: any = {};
  try {
    payCfg = JSON.parse(site.payment_config || '{}');
  } catch {
    return null;
  }

  const enabled = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id;
  if (!enabled) return null;

  return {
    siteId: site.id,
    siteUrl: site.site_url || undefined,
    credentials: {
      client_id: payCfg.teya.client_id,
      client_secret: payCfg.teya.client_secret,
      store_id: payCfg.teya.store_id,
    },
  };
}

export function isGlobalTeyaConfigured(): boolean {
  return !!process.env.TEYA_CLIENT_ID;
}

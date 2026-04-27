/**
 * @payments — createPaymentSession
 *
 * Single entry point for all Teya payment session creation.
 * Store selection priority:
 *   1. intent.credentials  → per-site creds from booking_sites.payment_config
 *   2. intent.store        → 'camping' | 'glamping' | 'main'
 *   3. default             → 'main' (TEYA_CLIENT_ID / TEYA_CLIENT_SECRET / TEYA_STORE_ID)
 */
import crypto from 'crypto';
import type { PaymentIntent, PaymentSession, TeyaStoreType } from '../domain/types';

// ─── Environment ──────────────────────────────────────────────────────────────
const IS_PRODUCTION = (process.env.TEYA_ENVIRONMENT || 'staging') === 'production';
const TEYA_API_URL  = IS_PRODUCTION ? 'https://api.teya.com'   : 'https://api.teya.xyz';
const TEYA_OAUTH_URL = IS_PRODUCTION
  ? 'https://id.teya.com/oauth/v2/oauth-token'
  : 'https://id.teya.xyz/oauth/v2/oauth-token';

// ─── Store map ────────────────────────────────────────────────────────────────
const STORES: Record<TeyaStoreType, { client_id: string; client_secret: string; store_id: string }> = {
  main: {
    client_id:     process.env.TEYA_CLIENT_ID     || '',
    client_secret: process.env.TEYA_CLIENT_SECRET || '',
    store_id:      process.env.TEYA_STORE_ID       || '',
  },
  camping: {
    client_id:     process.env.TEYA_CAMPING_CLIENT_ID     || process.env.TEYA_CLIENT_ID     || '',
    client_secret: process.env.TEYA_CAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
    store_id:      process.env.TEYA_CAMPING_STORE_ID      || process.env.TEYA_STORE_ID      || '',
  },
  glamping: {
    client_id:     process.env.TEYA_GLAMPING_CLIENT_ID     || process.env.TEYA_CLIENT_ID     || '',
    client_secret: process.env.TEYA_GLAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
    store_id:      process.env.TEYA_GLAMPING_STORE_ID      || process.env.TEYA_STORE_ID      || '',
  },
};

// ─── Token cache (per client_id) ─────────────────────────────────────────────
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  if (!clientId || !clientSecret) {
    throw new Error('[payments] Teya credentials not configured. Check TEYA_CLIENT_ID / TEYA_CLIENT_SECRET in .env.local');
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'checkout/sessions/create',
  });

  const res = await fetch(TEYA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[payments] Teya OAuth failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  tokenCache.set(clientId, {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a Teya Checkout Session.
 * This is the ONLY function modules should call — do NOT import from @/lib/teya.
 *
 * @example
 *   const session = await createPaymentSession({ amount: 1200, description: 'Booking #123' });
 *   redirect(session.session_url);
 */
export async function createPaymentSession(intent: PaymentIntent): Promise<PaymentSession> {
  // Resolve credentials: explicit > named store > main
  const storeKey: TeyaStoreType = intent.store ?? 'main';
  const creds = intent.credentials ?? STORES[storeKey];

  if (!creds.client_id || !creds.store_id) {
    throw new Error('[payments] No Teya credentials. Configure TEYA_CLIENT_ID, TEYA_CLIENT_SECRET, TEYA_STORE_ID in .env.local');
  }

  const accessToken = await getAccessToken(creds.client_id, creds.client_secret);

  // amount: major units → minor units (×100)
  const amountMinor = Math.round(intent.amount * 100);

  const payload: Record<string, unknown> = {
    store_id: creds.store_id,
    amount: { currency: intent.currency ?? 'CZK', value: amountMinor },
    type: 'SALE',
  };

  if (intent.items?.length) {
    payload.line_items = intent.items;
  } else if (intent.description) {
    payload.line_items = [{ description: intent.description, quantity: 1, unit_price: amountMinor }];
  }

  if (intent.metadata)    payload.metadata    = intent.metadata;
  if (intent.success_url) payload.success_url = intent.success_url;
  if (intent.cancel_url)  payload.cancel_url  = intent.cancel_url;
  if (intent.expiresAt)   payload.expires_at  = intent.expiresAt;

  const res = await fetch(`${TEYA_API_URL}/v2/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      'Content-Type':   'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('[payments] Teya checkout error:', res.status, txt);
    throw new Error(`[payments] Teya checkout session failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  console.log('[payments] Checkout session created:', data.session_id);

  return {
    id:            data.session_id,
    session_token: data.session_token,
    session_url:   data.session_url,
    status:        data.status ?? 'OPEN',
  };
}

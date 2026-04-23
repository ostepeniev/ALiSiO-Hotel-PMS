/**
 * Teya Online Payments — Server-side utility
 * Handles OAuth authentication, checkout session creation, webhook verification, and refunds.
 */
import crypto from 'crypto';

// ─── Environment Config ───
const TEYA_ENV = process.env.TEYA_ENVIRONMENT || 'staging';
const IS_PRODUCTION = TEYA_ENV === 'production';

const TEYA_API_URL   = IS_PRODUCTION ? 'https://api.teya.com' : 'https://api.teya.xyz';
const TEYA_OAUTH_URL = IS_PRODUCTION ? 'https://id.teya.com/oauth/v2/oauth-token' : 'https://id.teya.xyz/oauth/v2/oauth-token';

const TEYA_CLIENT_ID     = process.env.TEYA_CLIENT_ID || '';
const TEYA_CLIENT_SECRET = process.env.TEYA_CLIENT_SECRET || '';
const TEYA_STORE_ID      = process.env.TEYA_STORE_ID || '';

// ─── Token Cache ───
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a valid OAuth access token, using cache when possible.
 */
export async function getTeyaAccessToken(scope = 'checkout/sessions/create'): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  if (!TEYA_CLIENT_ID || !TEYA_CLIENT_SECRET) {
    throw new Error('Teya credentials not configured. Set TEYA_CLIENT_ID and TEYA_CLIENT_SECRET in .env.local');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: TEYA_CLIENT_ID,
    client_secret: TEYA_CLIENT_SECRET,
    scope,
  });

  const res = await fetch(TEYA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya OAuth] Error:', res.status, errorText);
    throw new Error(`Teya OAuth failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh 60 seconds before expiry
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;

  console.log('[Teya] Access token obtained, expires in', data.expires_in, 'seconds');
  return cachedToken!;
}

/**
 * Get a Teya access token using specific credentials (no caching for dynamic ones).
 */
export async function getTeyaAccessTokenWithCreds(clientId: string, clientSecret: string, scope = 'checkout/sessions/create'): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await fetch(TEYA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya OAuth] Dynamic Error:', res.status, errorText);
    throw new Error(`Teya OAuth failed with custom credentials: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ─── Types ───
export interface TeyaLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CheckoutSessionOptions {
  amount: number;         // Amount in minor units (e.g. 120000 = 1200.00 CZK)
  currency?: string;
  description?: string;
  items?: TeyaLineItem[];
  metadata?: Record<string, string>;
  success_url?: string;
  cancel_url?: string;
  expiresAt?: string;     // ISO 8601 — e.g. new Date(Date.now() + 24*3600*1000).toISOString()
  // Optional credentials for dynamic override
  credentials?: {
    client_id: string;
    client_secret: string;
    store_id: string;
  };
}

export interface CheckoutSessionResult {
  id: string;
  session_token: string;
  session_url?: string;
  status: string;
}

/**
 * Create a Teya Checkout Session for Embedded Checkout or Hosted Checkout.
 */
export async function createCheckoutSession(opts: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
  const token = opts.credentials 
    ? await getTeyaAccessTokenWithCreds(opts.credentials.client_id, opts.credentials.client_secret)
    : await getTeyaAccessToken();

  const storeId = opts.credentials?.store_id || TEYA_STORE_ID;

  const payload: Record<string, unknown> = {
    store_id: storeId,
    amount: {
      currency: opts.currency || 'CZK',
      value: opts.amount,
    },
    type: 'SALE',
  };

  if (opts.items && opts.items.length > 0) {
    payload.line_items = opts.items;
  } else if (opts.description) {
    payload.line_items = [{
      description: opts.description,
      quantity: 1,
      unit_price: opts.amount,
    }];
  }

  if (opts.metadata) {
    payload.metadata = opts.metadata;
  }

  if (opts.success_url) {
    payload.success_url = opts.success_url;
  }
  if (opts.cancel_url) {
    payload.cancel_url = opts.cancel_url;
  }
  if (opts.expiresAt) {
    payload.expires_at = opts.expiresAt;
  }

  const res = await fetch(`${TEYA_API_URL}/v2/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Checkout] Error:', res.status, errorText);
    throw new Error(`Teya checkout session failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  console.log('[Teya] Checkout session created:', data.session_id);
  return {
    id: data.session_id,
    session_token: data.session_token,
    session_url: data.session_url,
    status: data.status || 'OPEN',
  };
}

/**
 * Verify Teya webhook signature using SHA256withRSA.
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const rawKey = process.env.TEYA_WEBHOOK_PUBLIC_KEY;
  if (!rawKey) {
    console.warn('[Teya Webhook] No public key configured, skipping verification');
    return true; // Allow in development
  }

  try {
    // Wrap raw base64 key in PEM format if needed
    const pemKey = rawKey.startsWith('-----BEGIN')
      ? rawKey
      : `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`;

    const verifier = crypto.createVerify('SHA256');
    verifier.update(body);
    return verifier.verify(pemKey, signature, 'base64');
  } catch (err) {
    console.error('[Teya Webhook] Signature verification failed:', err);
    return false;
  }
}

/**
 * Issue a refund for a Teya payment.
 */
export async function refundPayment(transactionId: string, amount: number): Promise<{ id: string; status: string }> {
  const token = await getTeyaAccessToken('refunds/create');

  const res = await fetch(`${TEYA_API_URL}/v3/refunds`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction_id: transactionId,
      amount,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Refund] Error:', res.status, errorText);
    throw new Error(`Teya refund failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  console.log('[Teya] Refund issued:', data.id);
  return { id: data.id, status: data.status };
}

/**
 * Send a digital receipt for a completed payment.
 */
export async function sendReceipt(transactionId: string, email: string): Promise<void> {
  const token = await getTeyaAccessToken('transactions/id/receipts/create');

  const res = await fetch(`${TEYA_API_URL}/v1/transactions/${transactionId}/receipts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Receipt] Error:', res.status, errorText);
  } else {
    console.log('[Teya] Receipt sent to', email);
  }
}

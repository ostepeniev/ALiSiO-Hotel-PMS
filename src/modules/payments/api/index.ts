// ─── Public API of the payments module ───────────────────────────────────────
// This is the ONLY file other modules may import from.
// Import via: import { ... } from '@payments'

// Universal session factory (new). Callers build a PaymentIntent and pass it here.
export { createPaymentSession } from '../domain/checkout-session';

// Site-specific Teya credentials resolution (booking_sites.payment_config).
// Returns null when no per-site config is set — callers fall back to global ENV.
export { resolveSiteCredentials, isGlobalTeyaConfigured } from '../data/site-credentials.repo';

// Low-level Teya primitives — still exported so the webhook handlers and
// existing call-sites keep working during migration. New code should prefer
// createPaymentSession over calling createCheckoutSession directly.
export {
  createCheckoutSession,
  verifyWebhookSignature,
  refundPayment,
  sendReceipt,
  getTeyaAccessToken,
  getTeyaAccessTokenWithCreds,
} from '../domain/teya-client';

export type {
  CheckoutSessionOptions,
  CheckoutSessionResult,
  TeyaLineItem,
} from '../domain/teya-client';

export type {
  PaymentIntent,
  PaymentIntentKind,
  PaymentLineItem,
  PaymentSession,
  PaymentStatus,
  PaymentProvider,
  TeyaCredentials,
  ResolvedSiteCredentials,
} from '../domain/types';

export type {
  PaymentSessionCreatedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '../events/published';

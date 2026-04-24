// ─── Public API of the payments module ───────────────────────────────────────
// This is the ONLY file other modules may import from.
// Import via: import { ... } from '@payments'

// Low-level Teya client (step 1 migration — exposes existing primitives).
// Future steps will add createPaymentSession(intent), webhook handlers, and
// a payment repo so that callers no longer need to know the provider details.
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
  PaymentSession,
  PaymentStatus,
  PaymentIntentSource,
  PaymentProvider,
  Currency,
} from '../domain/types';

export type {
  PaymentSessionCreatedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '../events/published';

import { createCheckoutSession as createTeyaSession } from './teya-client';
import type { PaymentIntent, PaymentSession } from './types';

export async function createPaymentSession(intent: PaymentIntent): Promise<PaymentSession> {
  if (intent.amount <= 0) {
    throw new Error(`Invalid payment amount: ${intent.amount}`);
  }

  const amountMinor = Math.round(intent.amount * 100);

  const items = intent.lineItems?.map((li) => ({
    description: li.description,
    quantity: li.quantity,
    unit_price: Math.round(li.unitPriceMajor * 100),
  }));

  const session = await createTeyaSession({
    amount: amountMinor,
    currency: intent.currency,
    description: intent.description,
    items,
    metadata: intent.metadata,
    success_url: intent.successUrl,
    cancel_url: intent.cancelUrl,
    expiresAt: intent.expiresAt,
    credentials: intent.credentials,
  });

  return {
    sessionId: session.id,
    sessionToken: session.session_token,
    sessionUrl: session.session_url,
    provider: 'teya',
    intentKind: intent.kind,
  };
}

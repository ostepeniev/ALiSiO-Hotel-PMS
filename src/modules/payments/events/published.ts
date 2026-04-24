import type { PaymentIntent } from '../domain/types';

export type PaymentSessionCreatedEvent = {
  sessionId: string;
  provider: 'teya';
  intent: PaymentIntent;
  amount: number;
  currency: string;
};

export type PaymentCompletedEvent = {
  sessionId: string;
  provider: 'teya';
  paymentId: string;
  intent: PaymentIntent;
  amount: number;
  currency: string;
};

export type PaymentFailedEvent = {
  sessionId: string;
  provider: 'teya';
  intent: PaymentIntent;
  reason?: string;
};

export type PaymentRefundedEvent = {
  sessionId: string;
  provider: 'teya';
  paymentId: string;
  amount: number;
  currency: string;
};

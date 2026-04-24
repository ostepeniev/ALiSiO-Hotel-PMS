export type Currency = 'CZK' | 'EUR' | 'USD';

export type PaymentProvider = 'teya';

export type PaymentIntentSource =
  | 'widget_booking'
  | 'widget_service'
  | 'guest_cart'
  | 'guest_booking_payment'
  | 'crm_deposit';

export type PaymentIntent =
  | {
      kind: 'booking_full';
      reservationId: string;
      siteId?: string | null;
      returnTo?: string;
    }
  | {
      kind: 'booking_balance';
      reservationId: string;
      guestPageToken: string;
    }
  | {
      kind: 'booking_deposit';
      reservationIds: string[];
      leadId?: string;
      guestName?: string;
      depositPercent: number;
      company?: 'camping' | 'glamping';
    }
  | {
      kind: 'service_standalone';
      serviceId: string;
      serviceDate: string;
      hours: number;
      startHour?: number;
      addons?: Array<{ addonId: string; quantity: number }>;
      promoCode?: string;
      siteId?: string | null;
      returnTo?: string;
      clientAmount?: number;
      clientCurrency?: string;
      clientDescription?: string;
    }
  | {
      kind: 'service_cart';
      items: Array<{
        serviceId: string;
        quantity: number;
        serviceDate: string;
        startHour?: number;
        addons?: Array<{ addonId: string; quantity: number }>;
      }>;
      guestPageToken: string;
      reservationId?: string;
      promoCode?: string;
    };

export type PaymentSession = {
  provider: PaymentProvider;
  sessionId: string;
  sessionToken: string;
  sessionUrl?: string;
  amount: number;
  currency: Currency;
  metadata: Record<string, string>;
};

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

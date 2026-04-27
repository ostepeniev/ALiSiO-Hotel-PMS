export type TeyaStoreType = 'main' | 'camping' | 'glamping';

export interface PaymentLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface PaymentIntent {
  /** Amount in MAJOR units (e.g. 1200 = 1200 CZK). Converted to minor units internally. */
  amount: number;
  currency?: string;
  description?: string;
  items?: PaymentLineItem[];
  /** Which Teya store to use. Defaults to 'main'. */
  store?: TeyaStoreType;
  /** Per-site credential override from booking_sites.payment_config */
  credentials?: {
    client_id: string;
    client_secret: string;
    store_id: string;
  };
  /** Metadata forwarded to Teya — DO NOT rename existing keys */
  metadata?: Record<string, string>;
  success_url?: string;
  cancel_url?: string;
  expiresAt?: string;
}

export interface PaymentSession {
  id: string;
  session_token: string;
  session_url?: string;
  status: string;
}

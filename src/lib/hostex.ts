/**
 * Hostex.io API Client v3
 * Channel manager integration for ALiSiO PMS
 */
import https from 'https';

const HOSTEX_BASE = 'api.hostex.io';
const HOSTEX_API_VERSION = '/v3';
const HOSTEX_TOKEN = process.env.HOSTEX_ACCESS_TOKEN || '97A3kap2tmSqAOqFAaeDUi4EQ3va1bXCq9a8nM2MwuTYmOWpaoTyyVPycD4Hw0dF';

// ─── Types ────────────────────────────────────────────────
export interface HostexRate {
  currency: string;
  amount: number;
}

export interface HostexRateDetail {
  type: string; // ACCOMMODATION, HOST_SERVICE_FEE, CLEANING_FEE
  description: string;
  currency: string;
  amount: number;
}

export interface HostexRates {
  total_rate: HostexRate | null;
  total_commission: HostexRate | null;
  rate: HostexRate | null;
  commission: HostexRate | null;
  details: HostexRateDetail[];
}

export interface HostexGuest {
  id: number;
  name: string;
  phone: string;
  email: string;
  id_type: string | null;
  id_number: string | null;
  gender: string | null;
  country: string | null;
  is_booker: boolean;
}

export interface HostexCheckInDetails {
  arrival_at: string | null;
  departure_at: string | null;
  lock_code: string | null;
  lock_code_visible_after: string;
  deposit: number | null;
  check_in_guide_url: string;
}

export interface HostexReservation {
  reservation_code: string;
  stay_code: string;
  channel_id: string;
  property_id: number;
  channel_type: string; // airbnb, booking.com, booking_site, agoda
  listing_id: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  number_of_adults: number;
  number_of_children: number;
  number_of_infants: number;
  number_of_pets: number;
  status: string; // wait_accept, wait_pay, accepted, cancelled, denied, timeout
  stay_status: string; // checkin_pending, stay_completed, etc.
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  cancelled_at: string | null;
  booked_at: string;
  created_at: string;
  creator: string;
  rates: HostexRates;
  check_in_details: HostexCheckInDetails;
  remarks: string;
  channel_remarks: string;
  conversation_id: string;
  tags: string[];
  custom_channel: { id: number; name: string } | null;
  guests: HostexGuest[];
  custom_fields: Record<string, any> | null;
  in_reservation_box: boolean;
}

export interface HostexPropertyChannel {
  channel_type: string;
  listing_id: string;
  currency: string;
}

export interface HostexProperty {
  id: number;
  title: string;
  channels: HostexPropertyChannel[];
  default_checkin_time: string;
  default_checkout_time: string;
  timezone: string;
  cover?: { original_url: string };
}

interface HostexApiResponse<T> {
  request_id: string;
  error_code: number;
  error_msg: string;
  data: T;
}

// ─── Rate limiter (10 req/sec) ────────────────────────────
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/sec to be safe

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ─── Core HTTP client ─────────────────────────────────────
function hostexRequest<T>(method: string, path: string, body?: any): Promise<HostexApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: HOSTEX_BASE,
      path: `${HOSTEX_API_VERSION}${path}`,
      method,
      headers: {
        'Hostex-Access-Token': HOSTEX_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error(`Hostex API: invalid JSON response (status ${res.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Hostex API: request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Public API methods ───────────────────────────────────

/** Get all properties */
export async function getProperties(): Promise<HostexProperty[]> {
  await rateLimitWait();
  const res = await hostexRequest<{ properties: HostexProperty[] }>('GET', '/properties');
  return res.data?.properties || [];
}

/** Get reservations with optional filters */
export async function getReservations(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  check_in_date_start?: string;
  check_in_date_end?: string;
  check_out_date_start?: string;
  check_out_date_end?: string;
  property_id?: number;
}): Promise<{ reservations: HostexReservation[]; total: number; page: number; per_page: number }> {
  await rateLimitWait();
  const query = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }
  }
  const path = `/reservations${query.toString() ? '?' + query.toString() : ''}`;
  const res = await hostexRequest<{ reservations: HostexReservation[]; total?: number; current_page?: number; per_page?: number }>('GET', path);
  return {
    reservations: res.data?.reservations || [],
    total: res.data?.total || 0,
    page: res.data?.current_page || 1,
    per_page: res.data?.per_page || 20,
  };
}

/** Get all reservations (paginated auto-fetch) */
export async function getAllReservations(params?: {
  status?: string;
  check_in_date_start?: string;
  check_in_date_end?: string;
}): Promise<HostexReservation[]> {
  const all: HostexReservation[] = [];
  let page = 1;
  const per_page = 50;
  
  while (true) {
    const result = await getReservations({ ...params, page, per_page });
    all.push(...result.reservations);
    if (result.reservations.length < per_page) break;
    page++;
    if (page > 100) break; // safety limit
  }
  
  return all;
}

/** Get single reservation by stay_code */
export async function getReservation(stayCode: string): Promise<HostexReservation | null> {
  await rateLimitWait();
  const res = await hostexRequest<HostexReservation>('GET', `/reservations/${stayCode}`);
  return res.data || null;
}

/** Create reservation in Hostex (for push sync) */
export async function createReservation(data: {
  property_id: number;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  number_of_adults?: number;
  number_of_children?: number;
  remarks?: string;
}): Promise<HostexReservation | null> {
  await rateLimitWait();
  const res = await hostexRequest<HostexReservation>('POST', '/reservations', data);
  return res.data || null;
}

// ─── Exchange rate (ČNB mid-rate EUR/CZK) ─────────────────

let cachedRate: { rate: number; fetchedAt: number } | null = null;
const RATE_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getEurCzkRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_CACHE_MS) {
    return cachedRate.rate;
  }

  try {
    const rate = await fetchCnbRate();
    cachedRate = { rate, fetchedAt: Date.now() };
    return rate;
  } catch (e) {
    console.error('[Hostex] Failed to fetch ČNB rate, using fallback 25.2:', e);
    return cachedRate?.rate || 25.2;
  }
}

function fetchCnbRate(): Promise<number> {
  return new Promise((resolve, reject) => {
    // ČNB daily exchange rates - plain text format
    const req = https.request({
      hostname: 'www.cnb.cz',
      path: '/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt',
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse ČNB format: "EMU|euro|1|EUR|25,140"
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.includes('EUR')) {
            const parts = line.split('|');
            if (parts.length >= 5) {
              const rate = parseFloat(parts[4].replace(',', '.'));
              if (!isNaN(rate) && rate > 0) {
                resolve(rate);
                return;
              }
            }
          }
        }
        reject(new Error('EUR rate not found in ČNB data'));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('ČNB timeout')); });
    req.end();
  });
}

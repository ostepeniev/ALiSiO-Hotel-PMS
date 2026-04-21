/**
 * Hostex → ALiSiO PMS Sync Service
 * Handles reservation, guest, and payment synchronization
 */
import { getDb, generateGuestToken } from './db';
import {
  getProperties,
  getAllReservations,
  getEurCzkRate,
  updateReservationRemarks,
  type HostexReservation,
} from './hostex';

// Public URL of the PMS (used to build guest page links sent to Hostex)
const PMS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alisio.swipescape.eu';

// Channel types that represent owner blocks / closed dates — NOT real guests
const BLOCKED_CHANNEL_TYPES = new Set(['owner', 'manual', 'owner_reservation', 'blocked', 'maintenance']);

// ─── Property Mapping ─────────────────────────────────────

/** Hostex property_id → ALiSiO unit_id mapping */
const PROPERTY_MAP: Record<number, string> = {
  12446083: 'u_mr1',                           // A1 River Wood → A1 - Mirror
  12558043: 'u_mr2',                           // A2 Slow Down  → A2 - Mirror
  12590381: 'u_st1',                           // B1            → B1 - Stealth
  12590382: 'u_st2',                           // B2            → B2 - Stealth
  12446084: 'u_st3',                           // B3 Stealth    → B3 - Stealth
  12565124: '1e7f6c7bd383af9cdfaa43eb50160148', // B4 Svitanok   → B4 - Svitanok
};

const PROPERTY_ID = 'prop_main_001';
const ORG_ID = 'org_alisio_001';

// ─── Channel type → source mapping ───────────────────────
function mapChannelToSource(channelType: string): string {
  switch (channelType) {
    case 'airbnb':       return 'airbnb';
    case 'booking.com':  return 'booking_com';
    case 'booking_site': return 'direct';
    case 'agoda':        return 'other_ota';
    default:             return 'other_ota';
  }
}

// ─── Payment detection from channel_remarks ───────────────
interface PaymentInfo {
  isPrepaid: boolean;
  paymentCharge: number | null;
  channelType: string;
}

function detectPaymentInfo(reservation: HostexReservation): PaymentInfo {
  const remarks = reservation.channel_remarks || '';
  const channelType = reservation.channel_type;

  if (channelType === 'airbnb') {
    return { isPrepaid: true, paymentCharge: null, channelType };
  }

  if (channelType === 'booking.com') {
    const isPrepaid = remarks.includes('PRE-PAID') || remarks.includes('PREPAID');
    let paymentCharge: number | null = null;
    const chargeMatch = remarks.match(/Payment charge is (\w+)\s+([\d.]+)/);
    if (chargeMatch) paymentCharge = parseFloat(chargeMatch[2]);
    return { isPrepaid, paymentCharge, channelType };
  }

  return { isPrepaid: false, paymentCharge: null, channelType };
}

// ─── Guest name splitting ─────────────────────────────────
function splitGuestName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ─── Date normalization ───────────────────────────────────
// Hostex sometimes sends datetime strings like "2026-04-20T22:00:00Z" (UTC midnight Czech time)
// We always normalize to plain YYYY-MM-DD in Czech timezone
function normalizeHostexDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
    }
  } catch { /* ignore */ }
  return dateStr.substring(0, 10);
}

// ─── Calculate nights ─────────────────────────────────────
function calcNights(checkIn: string, checkOut: string): number {
  const d1 = new Date(normalizeHostexDate(checkIn) + 'T12:00:00');
  const d2 = new Date(normalizeHostexDate(checkOut) + 'T12:00:00');
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── Main sync function ──────────────────────────────────

export interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  eurCzkRate: number;
}

export async function syncReservations(): Promise<SyncResult> {
  const db = getDb();
  const result: SyncResult = {
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    eurCzkRate: 25.2,
  };

  try {
    // 1. Get EUR→CZK rate
    result.eurCzkRate = await getEurCzkRate();
    console.log(`[Hostex Sync] EUR/CZK rate: ${result.eurCzkRate}`);

    // 2. Fetch all non-cancelled reservations from Hostex
    const reservations = await getAllReservations();
    console.log(`[Hostex Sync] Fetched ${reservations.length} reservations from Hostex`);

    // 3. Ensure DB tables/columns exist + run migrations
    ensureHostexColumns(db);

    // 4. Process each reservation
    for (const res of reservations) {
      try {
        await processReservation(db, res, result);
      } catch (e: any) {
        result.errors.push(`${res.reservation_code}: ${e.message}`);
        console.error(`[Hostex Sync] Error processing ${res.reservation_code}:`, e.message);
      }
    }

    // 5. Log result
    logSync(db, 'reservations', result.errors.length === 0 ? 'success' : 'partial',
      result.synced, result.errors.join('; '));

    console.log(`[Hostex Sync] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);

  } catch (e: any) {
    result.errors.push(`Sync failed: ${e.message}`);
    console.error('[Hostex Sync] Fatal error:', e.message);
    logSync(getDb(), 'reservations', 'error', 0, e.message);
  }

  return result;
}

/**
 * Sync a single reservation by its code — used by webhook handler.
 * Uses ?reservation_code= filter which BYPASSES the 20-record global cap.
 * Much faster than a full sync for real-time webhook processing.
 */
export async function syncSingleReservation(reservationCode: string): Promise<SyncResult> {
  const db = getDb();
  const result: SyncResult = { synced: 0, created: 0, updated: 0, skipped: 0, errors: [], eurCzkRate: 25.2 };

  try {
    const { getReservationByCode, getEurCzkRate: fetchRate } = await import('./hostex');
    result.eurCzkRate = await fetchRate();
    ensureHostexColumns(db);

    const reservation = await getReservationByCode(reservationCode);
    if (!reservation) {
      result.errors.push(`Reservation ${reservationCode} not found in Hostex API`);
      console.warn(`[Hostex Sync] Reservation ${reservationCode} not found`);
      return result;
    }

    await processReservation(db, reservation, result);
    logSync(db, 'webhook', result.errors.length === 0 ? 'success' : 'partial', result.synced, result.errors.join('; '));
    console.log(`[Hostex Sync] Webhook sync done for ${reservationCode}: created=${result.created} updated=${result.updated}`);
  } catch (e: any) {
    result.errors.push(e.message);
    console.error('[Hostex Sync] syncSingleReservation error:', e.message);
  }

  return result;
}

// ─── Process single reservation ───────────────────────────

async function processReservation(db: any, res: HostexReservation, result: SyncResult) {
  // Blocked dates (owner/manual closures) → availability_blocks, NOT reservations
  if (BLOCKED_CHANNEL_TYPES.has(res.channel_type)) {
    processBlockedDate(db, res, result);
    return;
  }

  // Cancelled → mark in DB or skip
  if (res.status === 'cancelled' || res.status === 'denied' || res.status === 'timeout') {
    const existing = db.prepare('SELECT id FROM reservations WHERE hostex_reservation_code = ?').get(res.reservation_code) as any;
    if (existing) {
      db.prepare("UPDATE reservations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(existing.id);
      result.updated++;
      result.synced++;
    } else {
      result.skipped++;
    }
    return;
  }

  // Map property → unit
  const unitId = PROPERTY_MAP[res.property_id];
  if (!unitId) { result.skipped++; return; }

  // Calculate financial data
  const totalEur = res.rates?.total_rate?.amount || 0;
  const commissionEur = res.rates?.total_commission?.amount || 0;
  const netEur = totalEur - commissionEur;
  const totalCzk = Math.round(totalEur * result.eurCzkRate);

  // Payment info, notes, status
  const paymentInfo = detectPaymentInfo(res);
  const financialNote = buildFinancialNote(res, result.eurCzkRate, totalEur, commissionEur, netEur, totalCzk);
  const status = mapStatus(res);
  const paymentStatus = paymentInfo.isPrepaid ? 'prepaid' : 'unpaid';

  // Find or create guest
  const guestId = findOrCreateGuest(db, res);

  // Check if already in DB
  const existing = db.prepare(
    'SELECT id, payment_status, guest_page_token FROM reservations WHERE hostex_reservation_code = ?'
  ).get(res.reservation_code) as any;

  const checkIn = normalizeHostexDate(res.check_in_date);
  const checkOut = normalizeHostexDate(res.check_out_date);
  const nights = calcNights(res.check_in_date, res.check_out_date);

  if (existing) {
    // Generate token if missing (backfill old bookings)
    const existingToken = existing.guest_page_token;
    const newToken = (!existingToken && (status === 'confirmed' || status === 'checked_in'))
      ? generateGuestToken() : null;
    const tokenClause = newToken ? ', guest_page_token = ?' : '';

    const params: any[] = [
      checkIn, checkOut, nights,
      res.number_of_adults, res.number_of_children, res.number_of_infants,
      status, existing.payment_status === 'paid' ? 'paid' : paymentStatus,
      totalCzk, mapChannelToSource(res.channel_type),
      res.channel_type, res.channel_id, res.listing_id,
      totalEur, commissionEur, netEur,
      res.channel_remarks, paymentInfo.isPrepaid ? 1 : 0,
      financialNote,
    ];
    if (newToken) params.push(newToken);
    params.push(existing.id);

    db.prepare(`
      UPDATE reservations SET
        check_in = ?, check_out = ?, nights = ?,
        adults = ?, children = ?, infants = ?,
        status = ?, payment_status = ?,
        total_price = ?, source = ?,
        hostex_channel_type = ?, hostex_channel_id = ?, hostex_listing_id = ?,
        total_rate_eur = ?, commission_eur = ?, net_rate_eur = ?,
        channel_remarks = ?, is_prepaid = ?,
        notes = ?${tokenClause},
        updated_at = datetime('now')
      WHERE id = ?
    `).run(...params);

    // Auto-create payment if prepaid and none exists
    if (paymentInfo.isPrepaid && totalCzk > 0) {
      const hasPay = db.prepare('SELECT id FROM payments WHERE reservation_id = ? AND auto_created = 1').get(existing.id);
      if (!hasPay) createAutoPayment(db, existing.id, totalCzk, res.channel_type, res.booked_at);
    }

    // Push guest page URL to Hostex
    const activeToken = newToken || existingToken;
    if (activeToken) {
      const guestPageUrl = `${PMS_BASE_URL}/guest/${activeToken}`;
      if (!(res.remarks || '').includes(guestPageUrl)) {
        const newRemarks = `${res.remarks ? res.remarks + '\n\n' : ''}🔗 Гостьова сторінка: ${guestPageUrl}`;
        updateReservationRemarks(res.stay_code, newRemarks).catch(() => {});
      }
    }

    result.updated++;

  } else {
    // Create new reservation
    const newId = `hx_${res.reservation_code.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}`;
    const guestPageToken = (status === 'confirmed' || status === 'checked_in') ? generateGuestToken() : null;

    db.prepare(`
      INSERT INTO reservations (
        id, property_id, unit_id, guest_id, check_in, check_out, nights,
        adults, children, infants, status, payment_status, source,
        total_price, currency, notes, guest_page_token,
        hostex_reservation_code, hostex_stay_code, hostex_channel_type,
        hostex_channel_id, hostex_listing_id,
        total_rate_eur, commission_eur, net_rate_eur,
        channel_remarks, is_prepaid
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, 'CZK', ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `).run(
      newId, PROPERTY_ID, unitId, guestId,
      checkIn, checkOut, nights,
      res.number_of_adults, res.number_of_children, res.number_of_infants,
      status, paymentStatus, mapChannelToSource(res.channel_type),
      totalCzk, financialNote, guestPageToken,
      res.reservation_code, res.stay_code, res.channel_type,
      res.channel_id, res.listing_id,
      totalEur, commissionEur, netEur,
      res.channel_remarks, paymentInfo.isPrepaid ? 1 : 0
    );

    if (paymentInfo.isPrepaid && totalCzk > 0) {
      createAutoPayment(db, newId, totalCzk, res.channel_type, res.booked_at);
    }

    if (guestPageToken) {
      const guestPageUrl = `${PMS_BASE_URL}/guest/${guestPageToken}`;
      const newRemarks = `${res.remarks ? res.remarks + '\n\n' : ''}🔗 Гостьова сторінка: ${guestPageUrl}`;
      updateReservationRemarks(res.stay_code, newRemarks).catch(() => {});
    }

    result.created++;
  }

  result.synced++;
}

// ─── Process blocked date (owner closure in Hostex) ────────

function processBlockedDate(db: any, res: HostexReservation, result: SyncResult) {
  const unitId = PROPERTY_MAP[res.property_id];
  if (!unitId) { result.skipped++; return; }

  const blockId = `hx_block_${res.reservation_code.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}`;
  const existingBlock = db.prepare('SELECT id FROM availability_blocks WHERE id = ?').get(blockId);

  if (res.status === 'cancelled') {
    if (existingBlock) {
      db.prepare('DELETE FROM availability_blocks WHERE id = ?').run(blockId);
      result.updated++;
      result.synced++;
    } else {
      result.skipped++;
    }
    return;
  }

  const notes = res.remarks || res.channel_remarks || 'Закрито в Hostex';
  const dateFrom = normalizeHostexDate(res.check_in_date);
  const dateTo = normalizeHostexDate(res.check_out_date);

  if (existingBlock) {
    db.prepare('UPDATE availability_blocks SET date_from = ?, date_to = ?, notes = ? WHERE id = ?')
      .run(dateFrom, dateTo, notes, blockId);
    result.updated++;
  } else {
    db.prepare(`
      INSERT INTO availability_blocks (id, unit_id, date_from, date_to, reason, notes, hostex_code)
      VALUES (?, ?, ?, ?, 'blocked', ?, ?)
    `).run(blockId, unitId, dateFrom, dateTo, notes, res.reservation_code);
    result.created++;
  }

  result.synced++;
}

// ─── Guest management ─────────────────────────────────────

function findOrCreateGuest(db: any, res: HostexReservation): string {
  const guestData = res.guests?.[0];
  const email = guestData?.email || res.guest_email || '';
  const phone = guestData?.phone || res.guest_phone || '';
  const name = guestData?.name || res.guest_name || 'Unknown';
  const country = guestData?.country || '';

  let guest: any = null;
  if (email && !email.includes('@guest.booking.com')) {
    guest = db.prepare('SELECT id FROM guests WHERE email = ?').get(email);
  }
  if (!guest && phone) {
    guest = db.prepare('SELECT id FROM guests WHERE phone = ?').get(phone);
  }

  if (guest) {
    if (country) {
      db.prepare("UPDATE guests SET country = ?, updated_at = datetime('now') WHERE id = ?").run(country, guest.id);
    }
    return guest.id;
  }

  const { firstName, lastName } = splitGuestName(name);
  const guestId = `hx_g_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  db.prepare(`
    INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, country)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guestId, ORG_ID, firstName, lastName, email || null, phone || null, country || null);

  return guestId;
}

// ─── Payment auto-creation ────────────────────────────────

function createAutoPayment(db: any, reservationId: string, amountCzk: number, channelType: string, bookedAt: string) {
  const payId = `hx_pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const paidAt = bookedAt ? bookedAt.split('T')[0] : new Date().toISOString().split('T')[0];
  const notes = `Авто-оплата через ${channelType === 'airbnb' ? 'Airbnb' : channelType === 'booking.com' ? 'Booking.com' : channelType}`;
  db.prepare(`
    INSERT INTO payments (id, reservation_id, amount, currency, method, type, status, paid_at, notes, auto_created)
    VALUES (?, ?, ?, 'CZK', 'booking_platform', 'full', 'completed', ?, ?, 1)
  `).run(payId, reservationId, amountCzk, paidAt, notes);
}

// ─── Status mapping ───────────────────────────────────────

function mapStatus(res: HostexReservation): string {
  if (res.stay_status === 'stay_completed') return 'checked_out';
  if (res.stay_status === 'stay_in_progress') return 'checked_in';
  if (res.status === 'accepted') return 'confirmed';
  if (res.status === 'wait_accept' || res.status === 'wait_pay') return 'tentative';
  if (res.status === 'cancelled' || res.status === 'denied') return 'cancelled';
  return 'confirmed';
}

// ─── Financial note builder ───────────────────────────────

function buildFinancialNote(
  res: HostexReservation,
  rate: number,
  totalEur: number,
  commissionEur: number,
  netEur: number,
  totalCzk: number
): string {
  const channel = res.custom_channel?.name || res.channel_type;
  const lines = [
    `📊 ${channel} | ${res.channel_id}`,
    `💶 Всього: €${totalEur.toFixed(2)} (${totalCzk} CZK @ ${rate.toFixed(2)})`,
  ];

  if (commissionEur > 0) {
    const commCzk = Math.round(commissionEur * rate);
    const netCzk = Math.round(netEur * rate);
    lines.push(`📉 Комісія: €${commissionEur.toFixed(2)} (${commCzk} CZK)`);
    lines.push(`💰 Нетто: €${netEur.toFixed(2)} (${netCzk} CZK)`);
  }

  const pricesMatch = res.channel_remarks?.match(/Prices:\s*(.+?)(?:\n|$)/);
  if (pricesMatch) lines.push(`🌙 ${pricesMatch[1].trim()}`);

  const cleaning = res.rates?.details?.find(d => d.type === 'CLEANING_FEE');
  if (cleaning) lines.push(`🧹 Прибирання: €${cleaning.amount.toFixed(2)}`);

  return lines.join('\n');
}

// ─── DB migrations for Hostex columns ─────────────────────

function ensureHostexColumns(db: any) {
  const cols = db.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
  const colNames = cols.map((c: any) => c.name);

  const newCols: [string, string][] = [
    ['hostex_reservation_code', 'TEXT'],
    ['hostex_stay_code', 'TEXT'],
    ['hostex_channel_type', 'TEXT'],
    ['hostex_channel_id', 'TEXT'],
    ['hostex_listing_id', 'TEXT'],
    ['total_rate_eur', 'REAL'],
    ['commission_eur', 'REAL'],
    ['net_rate_eur', 'REAL'],
    ['channel_remarks', 'TEXT'],
    ['is_prepaid', 'INTEGER DEFAULT 0'],
  ];

  for (const [name, type] of newCols) {
    if (!colNames.includes(name)) {
      db.exec(`ALTER TABLE reservations ADD COLUMN ${name} ${type}`);
      console.log(`[Hostex] Added column reservations.${name}`);
    }
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_reservations_hostex_code ON reservations(hostex_reservation_code)');

  const payCols = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[];
  if (!payCols.some((c: any) => c.name === 'auto_created')) {
    db.exec('ALTER TABLE payments ADD COLUMN auto_created INTEGER DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS hostex_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hostex_property_map (
      hostex_property_id INTEGER PRIMARY KEY,
      hostex_title TEXT,
      unit_id TEXT NOT NULL,
      channels TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS availability_blocks (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      reason TEXT DEFAULT 'blocked',
      notes TEXT,
      hostex_code TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration 1: Backfill guest_page_token for existing Hostex bookings without token
  try {
    const missing = db.prepare(`
      SELECT id FROM reservations
      WHERE hostex_reservation_code IS NOT NULL
        AND (guest_page_token IS NULL OR guest_page_token = '')
        AND status IN ('confirmed', 'checked_in', 'tentative')
    `).all() as { id: string }[];
    if (missing.length > 0) {
      const upd = db.prepare("UPDATE reservations SET guest_page_token = ? WHERE id = ?");
      for (const r of missing) upd.run(generateGuestToken(), r.id);
      console.log(`[Hostex] Backfilled guest_page_token for ${missing.length} bookings`);
    }
  } catch (e: any) {
    console.warn('[Hostex] guest_page_token backfill note:', e.message);
  }

  // Migration 2: Move blocked-channel reservations → availability_blocks
  try {
    const BLOCKED_TYPES = ['owner', 'manual', 'owner_reservation', 'blocked', 'maintenance'];
    const ph = BLOCKED_TYPES.map(() => '?').join(', ');
    const blockedRes = db.prepare(`
      SELECT id, unit_id, check_in, check_out, notes, channel_remarks, hostex_reservation_code
      FROM reservations
      WHERE hostex_reservation_code IS NOT NULL
        AND hostex_channel_type IN (${ph})
    `).all(...BLOCKED_TYPES) as any[];

    if (blockedRes.length > 0) {
      const insBlock = db.prepare(`
        INSERT OR IGNORE INTO availability_blocks (id, unit_id, date_from, date_to, reason, notes, hostex_code)
        VALUES (?, ?, ?, ?, 'blocked', ?, ?)
      `);
      const delRes = db.prepare('DELETE FROM reservations WHERE id = ?');
      for (const r of blockedRes) {
        const blockId = `hx_block_${(r.hostex_reservation_code || r.id).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}`;
        insBlock.run(blockId, r.unit_id, r.check_in, r.check_out, r.notes || r.channel_remarks || 'Закрито в Hostex', r.hostex_reservation_code);
        delRes.run(r.id);
      }
      console.log(`[Hostex] Migrated ${blockedRes.length} blocked reservations → availability_blocks`);
    }
  } catch (e: any) {
    console.warn('[Hostex] Blocked reservation migration note:', e.message);
  }
}

function logSync(db: any, syncType: string, status: string, count: number, error?: string) {
  db.prepare(`
    INSERT INTO hostex_sync_log (sync_type, status, records_synced, error_message, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(syncType, status, count, error || null);
}

// ─── Property map seeding ─────────────────────────────────

export async function seedPropertyMap(): Promise<void> {
  const db = getDb();
  ensureHostexColumns(db);

  const properties = await getProperties();
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO hostex_property_map (hostex_property_id, hostex_title, unit_id, channels)
    VALUES (?, ?, ?, ?)
  `);

  for (const prop of properties) {
    const unitId = PROPERTY_MAP[prop.id];
    if (unitId) {
      upsert.run(prop.id, prop.title, unitId, JSON.stringify(prop.channels));
      console.log(`[Hostex] Mapped: ${prop.title} (${prop.id}) → ${unitId}`);
    }
  }
}

// ─── Get sync status ──────────────────────────────────────

export function getSyncStatus(): { lastSync: any; recentLogs: any[] } {
  const db = getDb();
  try {
    const lastSync = db.prepare('SELECT * FROM hostex_sync_log ORDER BY id DESC LIMIT 1').get();
    const recentLogs = db.prepare('SELECT * FROM hostex_sync_log ORDER BY id DESC LIMIT 20').all();
    return { lastSync, recentLogs };
  } catch {
    return { lastSync: null, recentLogs: [] };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';

export interface BookingComRow {
  bookNumber: string;
  guestName: string;
  bookedBy: string | null;
  checkIn: string;
  checkOut: string;
  bookedAt: string | null;
  status: string;
  rooms: number;
  persons: number;
  adults: number;
  children: number;
  childrenAges: string | null;
  priceMajor: number;
  currency: string;
  commissionPct: number;
  commissionMajor: number;
  unitTypeRaw: string;
  unitTypes: string[];
  duration: number;
  cancellationDate: string | null;
  remarks: string | null;
  bookerCountry: string | null;
  travelPurpose: string | null;
  device: string | null;
  address: string | null;
  phone: string | null;
}

export interface ParseError {
  rowIndex: number;
  field: string;
  reason: string;
  raw: any;
}

export interface ParseResult {
  rows: BookingComRow[];
  errors: ParseError[];
  totalRowsInFile: number;
}

const REQUIRED_COLS = [
  'Book number',
  'Guest name(s)',
  'Check-in',
  'Check-out',
  'Status',
  'Unit type',
  'Duration (nights)',
  'Adults',
  'Children',
  'Persons',
  'Price',
] as const;

function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseDateTime(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  const s = String(value).trim();
  return s.length >= 10 ? s : null;
}

function parsePrice(value: unknown): { amount: number; currency: string } {
  if (value == null || value === '') return { amount: 0, currency: 'EUR' };
  const s = String(value).trim();
  const m = s.match(/([\d.,]+)\s*([A-Z]{3})?/);
  if (!m) return { amount: 0, currency: 'EUR' };
  const numStr = m[1].replace(/,/g, '');
  const amount = parseFloat(numStr);
  const currency = (m[2] || 'EUR').toUpperCase();
  return { amount: isFinite(amount) ? amount : 0, currency };
}

function parseInt0(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = parseInt(String(value), 10);
  return isFinite(n) ? n : 0;
}

function parseFloat0(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function splitUnitTypes(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseBookingComExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ rowIndex: 0, field: 'workbook', reason: 'No sheets found', raw: null }], totalRowsInFile: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false }) as Record<string, any>[];

  const errors: ParseError[] = [];

  if (json.length === 0) {
    return { rows: [], errors: [], totalRowsInFile: 0 };
  }

  const headerRow = json[0];
  const missing = REQUIRED_COLS.filter((c) => !(c in headerRow));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ rowIndex: 0, field: 'headers', reason: `Missing required columns: ${missing.join(', ')}`, raw: Object.keys(headerRow) }],
      totalRowsInFile: json.length,
    };
  }

  const rows: BookingComRow[] = [];

  json.forEach((r, idx) => {
    const bookNumber = r['Book number'] != null ? String(r['Book number']).trim() : '';
    if (!bookNumber) {
      errors.push({ rowIndex: idx, field: 'Book number', reason: 'empty', raw: r });
      return;
    }

    const checkIn = parseDate(r['Check-in']);
    const checkOut = parseDate(r['Check-out']);
    if (!checkIn || !checkOut) {
      errors.push({ rowIndex: idx, field: 'Check-in/out', reason: 'invalid date', raw: { in: r['Check-in'], out: r['Check-out'] } });
      return;
    }

    const guestName = r['Guest name(s)'] != null ? String(r['Guest name(s)']).trim() : '';
    if (!guestName) {
      errors.push({ rowIndex: idx, field: 'Guest name(s)', reason: 'empty', raw: r });
      return;
    }

    const status = r['Status'] != null ? String(r['Status']).trim() : '';
    const unitTypeRaw = r['Unit type'] != null ? String(r['Unit type']).trim() : '';
    const unitTypes = splitUnitTypes(unitTypeRaw);
    const price = parsePrice(r['Price']);

    rows.push({
      bookNumber,
      guestName,
      bookedBy: r['Booked by'] != null ? String(r['Booked by']).trim() : null,
      checkIn,
      checkOut,
      bookedAt: parseDateTime(r['Booked on']),
      status,
      rooms: parseInt0(r['Rooms']) || 1,
      persons: parseInt0(r['Persons']),
      adults: parseInt0(r['Adults']),
      children: parseInt0(r['Children']),
      childrenAges: r["Children's age(s)"] != null ? String(r["Children's age(s)"]).trim() : null,
      priceMajor: price.amount,
      currency: price.currency,
      commissionPct: parseFloat0(r['Commission %']),
      commissionMajor: parseFloat0(String(r['Commission amount'] || '').replace(/[^\d.,]/g, '')),
      unitTypeRaw,
      unitTypes,
      duration: parseInt0(r['Duration (nights)']),
      cancellationDate: parseDateTime(r['Cancellation date']),
      remarks: r['Remarks'] != null ? String(r['Remarks']).trim() : null,
      bookerCountry: r['Booker country'] != null ? String(r['Booker country']).trim().toUpperCase() : null,
      travelPurpose: r['Travel purpose'] != null ? String(r['Travel purpose']).trim() : null,
      device: r['Device'] != null ? String(r['Device']).trim() : null,
      address: r['Address'] != null ? String(r['Address']).trim() : null,
      phone: r['Phone number'] != null ? String(r['Phone number']).trim() : null,
    });
  });

  return { rows, errors, totalRowsInFile: json.length };
}

/**
 * Split "Last, First" → "First Last", or pass through if already "First Last".
 * Booking exports typically use "Last, First" in the "Booked by" field.
 */
export function normalizeName(raw: string): { firstName: string; lastName: string } {
  const trimmed = raw.trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx > 0) {
    const last = trimmed.slice(0, commaIdx).trim();
    const first = trimmed.slice(commaIdx + 1).trim();
    return { firstName: first, lastName: last };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

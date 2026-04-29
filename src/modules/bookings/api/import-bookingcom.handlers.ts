/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import {
  parseBookingComExcel,
  normalizeName,
  parseCapacityFromUnitTypeName,
  type BookingComRow,
} from '../domain/booking-com-excel';
import {
  findResortPropertyId,
  findUnitTypeByName,
  findFreeResortUnit,
  findFreeResortUnitByCapacity,
  findReservationByBcomId,
  findOrCreateGuestForImport,
  insertImportedReservation,
  cancelReservation,
} from '../data/import.repo';

export interface PreviewRow extends BookingComRow {
  matchedUnitType: { id: string; name: string; code: string } | null;
  freeUnitId: string | null;
  freeUnitName: string | null;
  existing: { id: string; status: string } | null;
  action: 'create' | 'cancel' | 'skip-already' | 'skip-cancelled-not-found' | 'skip-no-unit-type' | 'skip-no-free-unit';
  warnings: string[];
}

export interface PreviewResponse {
  rows: PreviewRow[];
  parseErrors: { rowIndex: number; field: string; reason: string }[];
  totalRowsInFile: number;
  summary: {
    create: number;
    cancel: number;
    skipAlready: number;
    skipNoUnitType: number;
    skipNoFreeUnit: number;
    skipCancelledNotFound: number;
  };
  resortPropertyResolved: boolean;
}

async function requireBookingsPermission(): Promise<NextResponse | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  const user = await getSessionUser(sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Не авторизовано' }, { status: 401 });
  }
  if (!hasPermission(user.permissions, 'manage_bookings')) {
    return NextResponse.json(
      { error: 'Недостатньо прав. Потрібен дозвіл: manage_bookings' },
      { status: 403 },
    );
  }
  return null;
}

function planRow(row: BookingComRow): Pick<PreviewRow, 'matchedUnitType' | 'freeUnitId' | 'freeUnitName' | 'existing' | 'action' | 'warnings'> {
  const warnings: string[] = [];
  const existing = findReservationByBcomId(row.bookNumber);
  const isCancelInExcel = row.status === 'cancelled_by_guest' || row.status === 'cancelled';

  if (isCancelInExcel) {
    if (existing && existing.status !== 'cancelled') {
      return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, existing, action: 'cancel', warnings };
    }
    return {
      matchedUnitType: null,
      freeUnitId: null,
      freeUnitName: null,
      existing,
      action: existing ? 'skip-already' : 'skip-cancelled-not-found',
      warnings,
    };
  }

  if (existing) {
    return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, existing, action: 'skip-already', warnings };
  }

  const primaryType = row.unitTypes[0] || row.unitTypeRaw;

  // Two-step resolution. Capacity wins: Booking sells rooms by guest count
  // ("Triple Room" = 3, "Quadruple Room" = 4), and we have unit_types with
  // max_occupancy set. A capacity match against the first free unit_type
  // is what the user actually wants. We fall back to name match only if
  // the capacity hint is missing from the row.
  const capacity = primaryType ? parseCapacityFromUnitTypeName(primaryType) : null;
  let matchedUnitType = null;
  let freeUnit = null;

  if (capacity != null) {
    freeUnit = findFreeResortUnitByCapacity(capacity, row.checkIn, row.checkOut);
    if (freeUnit) {
      matchedUnitType = { id: freeUnit.unit_type_id, name: `${capacity}-місна`, code: '' };
    }
  }

  // Capacity didn't yield a free unit (or we couldn't read capacity from the
  // name). Try the legacy name match as a last-resort hint.
  if (!freeUnit && primaryType) {
    matchedUnitType = findUnitTypeByName(primaryType);
    if (matchedUnitType) {
      freeUnit = findFreeResortUnit(matchedUnitType.id, row.checkIn, row.checkOut);
    }
  }

  if (!matchedUnitType) {
    warnings.push(`Тип юніту "${row.unitTypeRaw}" не зматчено за місткістю в категорії resort`);
    return { matchedUnitType, freeUnitId: null, freeUnitName: null, existing: null, action: 'skip-no-unit-type', warnings };
  }
  if (row.unitTypes.length > 1) {
    warnings.push(`Бронювання на ${row.rooms} кімнат(и): ${row.unitTypeRaw}. Створиться одна резервація з типом "${matchedUnitType.name}", решту додай вручну.`);
  } else if (row.rooms > 1) {
    warnings.push(`Booking каже rooms=${row.rooms}. Створиться одна резервація. Додай решту юнітів вручну.`);
  }

  if (!freeUnit) {
    warnings.push(`Немає вільного юніту на ${capacity ?? '?'} осіб у resort на ${row.checkIn}–${row.checkOut}. Овербукінг.`);
    return { matchedUnitType, freeUnitId: null, freeUnitName: null, existing: null, action: 'skip-no-free-unit', warnings };
  }

  return {
    matchedUnitType,
    freeUnitId: freeUnit.id,
    freeUnitName: freeUnit.name,
    existing: null,
    action: 'create',
    warnings,
  };
}

export async function previewBookingComImport(request: NextRequest): Promise<NextResponse> {
  const guard = await requireBookingsPermission();
  if (guard) return guard;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Файл не передано' }, { status: 400 });
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = parseBookingComExcel(buffer);

    if (parsed.errors.length > 0 && parsed.errors[0].field === 'headers') {
      return NextResponse.json(
        { error: 'Невідомий формат Excel — відсутні обов\'язкові колонки', detail: parsed.errors[0] },
        { status: 422 },
      );
    }

    const propertyId = findResortPropertyId();
    const rows: PreviewRow[] = parsed.rows.map((r) => ({ ...r, ...planRow(r) }));

    const summary = {
      create: rows.filter((r) => r.action === 'create').length,
      cancel: rows.filter((r) => r.action === 'cancel').length,
      skipAlready: rows.filter((r) => r.action === 'skip-already').length,
      skipNoUnitType: rows.filter((r) => r.action === 'skip-no-unit-type').length,
      skipNoFreeUnit: rows.filter((r) => r.action === 'skip-no-free-unit').length,
      skipCancelledNotFound: rows.filter((r) => r.action === 'skip-cancelled-not-found').length,
    };

    const response: PreviewResponse = {
      rows,
      parseErrors: parsed.errors.map((e) => ({ rowIndex: e.rowIndex, field: e.field, reason: e.reason })),
      totalRowsInFile: parsed.totalRowsInFile,
      summary,
      resortPropertyResolved: !!propertyId,
    };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[Import Booking.com] preview error:', e?.message, e?.stack);
    return NextResponse.json({ error: 'Помилка парсингу', detail: e?.message }, { status: 500 });
  }
}

export interface ConfirmRequest {
  rows: BookingComRow[];
}

export interface ConfirmResponse {
  created: number;
  cancelled: number;
  skipped: number;
  failed: number;
  details: Array<{
    bookNumber: string;
    action: string;
    reservationId?: string;
    error?: string;
  }>;
}

export async function confirmBookingComImport(request: NextRequest): Promise<NextResponse> {
  const guard = await requireBookingsPermission();
  if (guard) return guard;

  try {
    const body = await request.json() as ConfirmRequest;
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'rows is required' }, { status: 400 });
    }

    const propertyId = findResortPropertyId();
    if (!propertyId) {
      return NextResponse.json({ error: 'Resort property не знайдено' }, { status: 422 });
    }

    let created = 0;
    let cancelled = 0;
    let skipped = 0;
    let failed = 0;
    const details: ConfirmResponse['details'] = [];

    for (const row of body.rows) {
      try {
        const plan = planRow(row);

        if (plan.action === 'create') {
          if (!plan.matchedUnitType || !plan.freeUnitId) {
            skipped++;
            details.push({ bookNumber: row.bookNumber, action: 'skip', error: 'unit type or free unit not resolved' });
            continue;
          }
          const { firstName, lastName } = normalizeName(row.bookedBy || row.guestName);
          const guestId = findOrCreateGuestForImport({
            firstName,
            lastName,
            country: row.bookerCountry,
            phone: row.phone,
            address: row.address,
          });
          const notes = [
            `Booking.com #${row.bookNumber}`,
            row.rooms > 1 ? `Multi-room booking: rooms=${row.rooms}, types=${row.unitTypeRaw}` : '',
            row.remarks ? `Remarks: ${row.remarks}` : '',
            row.children > 0 && row.childrenAges ? `Children ages: ${row.childrenAges}` : '',
            row.bookedAt ? `Booked at: ${row.bookedAt}` : '',
            row.travelPurpose ? `Purpose: ${row.travelPurpose}` : '',
          ].filter(Boolean).join('\n');

          const resId = insertImportedReservation({
            propertyId,
            unitId: plan.freeUnitId,
            guestId,
            checkIn: row.checkIn,
            checkOut: row.checkOut,
            nights: row.duration || 1,
            adults: row.adults,
            children: row.children,
            totalPrice: row.priceMajor,
            currency: row.currency,
            bcomReservationId: row.bookNumber,
            commissionAmount: row.commissionMajor,
            notes,
          });
          created++;
          details.push({ bookNumber: row.bookNumber, action: 'create', reservationId: resId });
        } else if (plan.action === 'cancel' && plan.existing) {
          cancelReservation(plan.existing.id);
          cancelled++;
          details.push({ bookNumber: row.bookNumber, action: 'cancel', reservationId: plan.existing.id });
        } else {
          skipped++;
          details.push({ bookNumber: row.bookNumber, action: plan.action });
        }
      } catch (e: any) {
        failed++;
        details.push({ bookNumber: row.bookNumber, action: 'failed', error: e?.message || String(e) });
        console.error(`[Import Booking.com] row ${row.bookNumber} failed:`, e?.message);
      }
    }

    try {
      const lines = [
        '📥 <b>Імпорт Booking.com завершено</b>',
        '',
        `✅ Створено: ${created}`,
        cancelled > 0 ? `❌ Скасовано: ${cancelled}` : '',
        skipped > 0 ? `⏭ Пропущено: ${skipped}` : '',
        failed > 0 ? `⚠️ Помилок: ${failed}` : '',
      ].filter(Boolean).join('\n');
      sendTelegramMessage(lines).catch(() => {});
    } catch { /* non-critical */ }

    const response: ConfirmResponse = { created, cancelled, skipped, failed, details };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[Import Booking.com] confirm error:', e?.message, e?.stack);
    return NextResponse.json({ error: 'Помилка імпорту', detail: e?.message }, { status: 500 });
  }
}

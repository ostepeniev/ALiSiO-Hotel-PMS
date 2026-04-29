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

export interface PlannedUnit {
  unitId: string;
  unitName: string;
  capacity: number;        // capacity used to find this unit
  unitTypeId: string;
}

export interface PreviewRow extends BookingComRow {
  matchedUnitType: { id: string; name: string; code: string } | null;
  freeUnitId: string | null;       // first unit (kept for backwards compat / display)
  freeUnitName: string | null;
  plannedUnits: PlannedUnit[];     // one entry per room in the group
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

function planRow(row: BookingComRow): Pick<PreviewRow, 'matchedUnitType' | 'freeUnitId' | 'freeUnitName' | 'plannedUnits' | 'existing' | 'action' | 'warnings'> {
  const warnings: string[] = [];
  const existing = findReservationByBcomId(row.bookNumber);
  const isCancelInExcel = row.status === 'cancelled_by_guest' || row.status === 'cancelled';

  if (isCancelInExcel) {
    if (existing && existing.status !== 'cancelled') {
      return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing, action: 'cancel', warnings };
    }
    return {
      matchedUnitType: null,
      freeUnitId: null,
      freeUnitName: null,
      plannedUnits: [],
      existing,
      action: existing ? 'skip-already' : 'skip-cancelled-not-found',
      warnings,
    };
  }

  if (existing) {
    return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing, action: 'skip-already', warnings };
  }

  // Resolve a list of capacities the booking needs. Booking sells by guest
  // count ("Triple Room" = 3, "Quadruple Room" = 4). When rooms > 1 with a
  // single type, repeat the same capacity. When the type list itself spans
  // multiple types ("Triple Room, Quadruple Room"), round-robin through the
  // listed types until we have `rooms` capacities.
  const requestedCount = Math.max(1, row.rooms || 1);
  const typeCapacities: number[] = (row.unitTypes.length > 0 ? row.unitTypes : [row.unitTypeRaw])
    .map((t) => parseCapacityFromUnitTypeName(t))
    .filter((n): n is number => n != null);

  let perRoomCapacity: number[] = [];
  if (typeCapacities.length > 0) {
    for (let i = 0; i < requestedCount; i++) {
      perRoomCapacity.push(typeCapacities[i % typeCapacities.length]);
    }
  }

  const plannedUnits: PlannedUnit[] = [];
  const usedUnitIds: string[] = [];

  if (perRoomCapacity.length > 0) {
    for (const cap of perRoomCapacity) {
      const free = findFreeResortUnitByCapacity(cap, row.checkIn, row.checkOut, usedUnitIds);
      if (!free) break; // can't fill all rooms — fall through to single-type fallback
      plannedUnits.push({ unitId: free.id, unitName: free.name, capacity: cap, unitTypeId: free.unit_type_id });
      usedUnitIds.push(free.id);
    }
  }

  // Fallback to legacy name match for the primary type when capacity didn't
  // give us anything (rare — exotic type names).
  if (plannedUnits.length === 0) {
    const primaryType = row.unitTypes[0] || row.unitTypeRaw;
    const matched = primaryType ? findUnitTypeByName(primaryType) : null;
    if (matched) {
      const free = findFreeResortUnit(matched.id, row.checkIn, row.checkOut);
      if (free) {
        plannedUnits.push({ unitId: free.id, unitName: free.name, capacity: row.persons || 1, unitTypeId: free.unit_type_id });
      }
    }
  }

  if (plannedUnits.length === 0) {
    warnings.push(`Тип юніту "${row.unitTypeRaw}" не зматчено за місткістю в категорії resort`);
    return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing: null, action: 'skip-no-unit-type', warnings };
  }

  if (plannedUnits.length < requestedCount) {
    warnings.push(`Booking просив ${requestedCount} кімнат(и); знайдено вільних ${plannedUnits.length}. Решту вписуй вручну (можливий овербукінг).`);
  }

  if (plannedUnits.length > 1) {
    const codes = plannedUnits.map((p) => p.unitName).join(', ');
    warnings.push(`Бронювання на ${plannedUnits.length} кімнат: ${codes}. Створяться окремі резервації з тим самим Booking #.`);
  }

  // matchedUnitType / freeUnitId reflect the FIRST unit for backwards-compat
  // with the existing UI columns; the full list lives in plannedUnits.
  const first = plannedUnits[0];
  return {
    matchedUnitType: { id: first.unitTypeId, name: `${first.capacity}-місна`, code: '' },
    freeUnitId: first.unitId,
    freeUnitName: first.unitName,
    plannedUnits,
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
          if (plan.plannedUnits.length === 0) {
            skipped++;
            details.push({ bookNumber: row.bookNumber, action: 'skip', error: 'no free unit could be resolved' });
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
          const baseNotes = [
            `Booking.com #${row.bookNumber}`,
            row.remarks ? `Remarks: ${row.remarks}` : '',
            row.children > 0 && row.childrenAges ? `Children ages: ${row.childrenAges}` : '',
            row.bookedAt ? `Booked at: ${row.bookedAt}` : '',
            row.travelPurpose ? `Purpose: ${row.travelPurpose}` : '',
          ].filter(Boolean);

          // Split price proportional to unit capacity. For a 367.21 EUR group
          // booking across 3-3-4 capacity rooms: 110.16 / 110.16 / 146.89.
          // Adults per room = the room's capacity, so per-unit reports stay
          // sensible (no zeroes). Children all go on the first room.
          const totalCapacity = plan.plannedUnits.reduce((s, u) => s + u.capacity, 0);
          for (let i = 0; i < plan.plannedUnits.length; i++) {
            const unit = plan.plannedUnits[i];
            const isFirst = i === 0;
            const sharePrice = totalCapacity > 0
              ? +(row.priceMajor * unit.capacity / totalCapacity).toFixed(2)
              : +(row.priceMajor / plan.plannedUnits.length).toFixed(2);
            const notes = [
              ...baseNotes,
              plan.plannedUnits.length > 1
                ? `Кімната ${i + 1} з ${plan.plannedUnits.length} (${unit.unitName})`
                : '',
              plan.plannedUnits.length > 1
                ? `Group total: ${row.priceMajor.toFixed(2)} ${row.currency}`
                : '',
            ].filter(Boolean).join('\n');

            const resId = insertImportedReservation({
              propertyId,
              unitId: unit.unitId,
              guestId,
              checkIn: row.checkIn,
              checkOut: row.checkOut,
              nights: row.duration || 1,
              adults: unit.capacity,
              children: isFirst ? row.children : 0,
              totalPrice: sharePrice,
              currency: row.currency,
              bcomReservationId: row.bookNumber,
              commissionAmount: isFirst ? row.commissionMajor : 0,
              notes,
            });
            created++;
            details.push({ bookNumber: row.bookNumber, action: 'create', reservationId: resId });
          }
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

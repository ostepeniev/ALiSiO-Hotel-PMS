/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentOperation } from '@/modules/finance/api/payment-bridge';

// Legacy /api/payments endpoint — reads/writes via fin_operations.
//
// The endpoint REQUIRES either reservation_id or group_id. Without a filter
// it used to return every payment system-wide (dump-all bug surfaced when
// GroupViewModal called it with group_id which was silently ignored).
//
// PMS-signal dedup: when an income op for the same reservation has both a
// signal (Hostex/Teya prepayment) AND a real bank op, we return only the
// real one — preventing BookingViewModal/GroupViewModal from double-counting.
// For reservations that have ONLY a signal (no bank yet), we still return
// it so PMS check-in flow shows "Оплачено = total".
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const groupId = searchParams.get('group_id');

    if (!reservationId && !groupId) {
      return NextResponse.json(
        { error: 'reservation_id or group_id query param is required' },
        { status: 400 },
      );
    }

    const where: string[] = ["o.reservation_id IS NOT NULL", "o.status = 'completed'"];
    const params: any[] = [];
    if (reservationId) {
      where.push('o.reservation_id = ?');
      params.push(reservationId);
    } else if (groupId) {
      where.push('o.reservation_id IN (SELECT id FROM reservations WHERE group_id = ?)');
      params.push(groupId);
    }

    // Dedup: include row when it's REAL (is_pms_signal=0), OR when it's
    // a signal AND no real op exists for the same reservation. Avoids the
    // doubled-paid display once a bank statement creates a real op next
    // to the existing Hostex signal.
    where.push(`(
      o.is_pms_signal = 0
      OR NOT EXISTS (
        SELECT 1 FROM fin_operations o2
        WHERE o2.reservation_id = o.reservation_id
          AND o2.status = 'completed'
          AND o2.op_type = 'income'
          AND o2.is_pms_signal = 0
      )
    )`);

    const rows = db.prepare(`
      SELECT o.id, o.reservation_id, o.amount, o.currency, o.method,
             o.payment_subtype AS type,
             o.status, o.paid_at, o.comment AS notes, o.source_ref,
             o.op_type, o.is_pms_signal
      FROM fin_operations o
      WHERE ${where.join(' AND ')}
      ORDER BY o.paid_at DESC
    `).all(...params);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { reservation_id, amount, method = 'cash', type = 'partial', notes, paid_at } = body;
    if (!reservation_id || !amount) {
      return NextResponse.json({ error: 'reservation_id and amount are required' }, { status: 400 });
    }
    const { operationId } = createPaymentOperation({
      reservationId: reservation_id,
      amount: Math.abs(Number(amount)),
      method,
      paymentSubtype: type,
      source: 'manual',
      status: 'completed',
      paidAt: paid_at || new Date().toISOString(),
      comment: notes || null,
    });
    return NextResponse.json({ id: operationId, ok: true }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

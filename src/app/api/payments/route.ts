/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentOperation } from '@/modules/finance/api/payment-bridge';

// Legacy /api/payments endpoint — now reads/writes via fin_operations.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const where: string[] = ["reservation_id IS NOT NULL", "status = 'completed'"];
    const params: any[] = [];
    if (reservationId) { where.push('reservation_id = ?'); params.push(reservationId); }
    const rows = db.prepare(`
      SELECT id, reservation_id, amount, currency, method, payment_subtype AS type,
             status, paid_at, comment AS notes, source_ref, op_type
      FROM fin_operations
      WHERE ${where.join(' AND ')}
      ORDER BY paid_at DESC
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
    console.error('[POST /api/payments] Error:', e?.message, e?.stack?.split('\n')[1]);
    return NextResponse.json({ error: e?.message || 'Failed to create payment' }, { status: 500 });
  }
}

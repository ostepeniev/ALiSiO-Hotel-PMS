/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

// Legacy /api/payments endpoint — reads/writes via fin_operations directly
// (avoids importing @finance module to prevent Next.js manifest resolution issues)

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
    console.error('[GET /api/payments] Error:', e?.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { reservation_id, amount, method = 'cash', type = 'partial', notes, paid_at } = body;
    if (!reservation_id || !amount) {
      return NextResponse.json({ error: 'reservation_id and amount are required' }, { status: 400 });
    }

    const numAmount = Math.abs(Number(amount));

    // Get org_id
    const res = db.prepare(
      'SELECT prop.organization_id AS org_id FROM reservations r JOIN properties prop ON r.property_id = prop.id WHERE r.id = ?'
    ).get(reservation_id) as { org_id: string } | undefined;
    if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    // Get default CZK account
    const account = db.prepare(
      "SELECT id FROM finance_accounts WHERE organization_id = ? AND currency = 'CZK' ORDER BY sort_order ASC, created_at ASC LIMIT 1"
    ).get(res.org_id) as { id: string } | undefined;

    const isRefund = type === 'refund';
    const opType = isRefund ? 'expense' : 'income';
    const paidAt = paid_at || new Date().toISOString();
    const opId = `${opType === 'income' ? 'inc' : 'exp'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    db.prepare(`
      INSERT INTO fin_operations
        (id, organization_id, op_type, account_from_id, account_to_id,
         amount, currency, amount_company, paid_at, accrued_at,
         reservation_id, status, method, payment_subtype, comment, source, source_ref)
      VALUES (?, ?, ?, ?, ?, ?, 'CZK', ?, ?, ?, ?, 'completed', ?, ?, ?, 'manual', ?)
    `).run(
      opId, res.org_id, opType,
      isRefund ? (account?.id || null) : null,
      isRefund ? null : (account?.id || null),
      numAmount, numAmount,
      paidAt, paidAt,
      reservation_id,
      method, type,
      notes || null,
      reservation_id,
    );

    // Recalc payment_status
    const totals = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM fin_operations WHERE reservation_id = ? AND op_type = 'income' AND status = 'completed'"
    ).get(reservation_id) as { s: number };
    const resRow = db.prepare('SELECT total_price FROM reservations WHERE id = ?').get(reservation_id) as { total_price: number } | undefined;
    const total = Number(resRow?.total_price) || 0;
    const paid = totals.s;
    const payStatus = (total > 0 && paid >= total - 0.005) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    db.prepare('UPDATE reservations SET payment_status = ? WHERE id = ?').run(payStatus, reservation_id);

    return NextResponse.json({ id: opId, ok: true }, { status: 201 });
  } catch (e: any) {
    console.error('[POST /api/payments] Error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Failed to create payment' }, { status: 500 });
  }
}

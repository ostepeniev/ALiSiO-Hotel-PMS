import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// DELETE /api/payments/:id — delete a payment and recalculate status
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const { id } = await params;

    // Get the reservation_id before deleting
    const payment = db.prepare('SELECT reservation_id FROM payments WHERE id = ?').get(id) as { reservation_id: string } | undefined;
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    // Recalculate payment_status
    const res = db.prepare('SELECT total_price, payment_status FROM reservations WHERE id = ?').get(payment.reservation_id) as { total_price: number; payment_status: string } | undefined;
    if (res) {
      const paidRow = db.prepare("SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0) as paid FROM payments WHERE reservation_id = ? AND status = 'completed'").get(payment.reservation_id) as { paid: number };
      const paid = paidRow.paid;

      let newStatus: string;
      if (paid <= 0) {
        newStatus = res.payment_status === 'payment_requested' ? 'payment_requested' : 'unpaid';
      } else if (paid >= res.total_price) {
        newStatus = 'paid';
      } else {
        newStatus = 'prepaid';
      }
      db.prepare('UPDATE reservations SET payment_status = ? WHERE id = ?').run(newStatus, payment.reservation_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/payments/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 });
  }
}

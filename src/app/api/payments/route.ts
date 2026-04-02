import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Helper: recalculate payment_status based on completed payments
function recalcPaymentStatus(db: any, reservationId: string) {
  const res = db.prepare('SELECT total_price FROM reservations WHERE id = ?').get(reservationId) as { total_price: number } | undefined;
  if (!res) return;

  const paidRow = db.prepare("SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0) as paid FROM payments WHERE reservation_id = ? AND status = 'completed'").get(reservationId) as { paid: number };
  const paid = paidRow.paid;

  const current = db.prepare('SELECT payment_status FROM reservations WHERE id = ?').get(reservationId) as { payment_status: string };
  
  let newStatus: string;
  if (paid <= 0) {
    newStatus = current.payment_status === 'payment_requested' ? 'payment_requested' : 'unpaid';
  } else if (paid >= res.total_price) {
    newStatus = 'paid';
  } else {
    newStatus = 'prepaid';
  }

  db.prepare('UPDATE reservations SET payment_status = ? WHERE id = ?').run(newStatus, reservationId);
}

// Helper: recalculate group payment status
function recalcGroupPaymentStatus(db: any, groupId: string) {
  const group = db.prepare('SELECT total_price FROM reservation_groups WHERE id = ?').get(groupId) as any;
  if (!group) return;

  // Sum all payments for all reservations in this group
  const paidRow = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END), 0) as paid
    FROM payments p
    JOIN reservations r ON p.reservation_id = r.id
    WHERE r.group_id = ? AND p.status = 'completed'
  `).get(groupId) as { paid: number };
  const paid = paidRow.paid;

  let newStatus: string;
  if (paid <= 0) {
    newStatus = 'unpaid';
  } else if (paid >= group.total_price) {
    newStatus = 'paid';
  } else {
    newStatus = 'prepaid';
  }

  db.prepare("UPDATE reservation_groups SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, groupId);
}

// GET /api/payments
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const groupId = searchParams.get('group_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (groupId) {
      // Get all payments for all reservations in the group
      const rows = db.prepare(`
        SELECT p.*, r.unit_id, u.name as unit_name, u.code as unit_code
        FROM payments p
        JOIN reservations r ON p.reservation_id = r.id
        LEFT JOIN units u ON r.unit_id = u.id
        WHERE r.group_id = ?
        ORDER BY p.paid_at DESC, p.created_at DESC
      `).all(groupId);
      return NextResponse.json(rows);
    }

    if (reservationId) {
      const rows = db.prepare(`
        SELECT * FROM payments WHERE reservation_id = ? ORDER BY paid_at DESC, created_at DESC
      `).all(reservationId);
      return NextResponse.json(rows);
    }

    if (from && to) {
      const rows = db.prepare(`
        SELECT p.*, r.unit_id, r.guest_id,
               g.first_name, g.last_name
        FROM payments p
        JOIN reservations r ON p.reservation_id = r.id
        JOIN guests g ON r.guest_id = g.id
        WHERE p.paid_at BETWEEN ? AND ? AND p.status = 'completed'
        ORDER BY p.paid_at DESC
      `).all(from, to);
      return NextResponse.json(rows);
    }

    // Default: return all completed payments
    const rows = db.prepare(`
      SELECT p.*, r.unit_id, g.first_name, g.last_name
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN guests g ON r.guest_id = g.id
      WHERE p.status = 'completed'
      ORDER BY p.paid_at DESC, p.created_at DESC
      LIMIT 100
    `).all();
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/payments error:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

// POST /api/payments
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { reservation_id, group_id, amount, method, type, notes, paid_at } = body;

    if (!amount || !method) {
      return NextResponse.json({ error: 'Missing required fields: amount, method' }, { status: 400 });
    }

    const payDate = paid_at || new Date().toISOString().split('T')[0];

    if (group_id && !reservation_id) {
      // Shared group payment — distribute across all reservations in the group
      const reservations = db.prepare(
        'SELECT id FROM reservations WHERE group_id = ? ORDER BY rowid'
      ).all(group_id) as { id: string }[];

      if (reservations.length === 0) {
        return NextResponse.json({ error: 'No reservations in group' }, { status: 400 });
      }

      // Split evenly, with remainder on the first room
      const perRoom = Math.floor((amount as number) / reservations.length);
      const remainder = (amount as number) - perRoom * reservations.length;

      const ids: string[] = [];
      for (let i = 0; i < reservations.length; i++) {
        const id = `pay_${Date.now()}_${i}`;
        const roomAmount = i === 0 ? perRoom + remainder : perRoom;
        db.prepare(`
          INSERT INTO payments (id, reservation_id, amount, method, type, status, paid_at, notes)
          VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)
        `).run(id, reservations[i].id, roomAmount, method, type || 'partial', payDate, notes ? `[Група] ${notes}` : '[Група]');
        ids.push(id);
        recalcPaymentStatus(db, reservations[i].id);
      }

      // Recalc group status
      recalcGroupPaymentStatus(db, group_id);

      return NextResponse.json({ ids, count: reservations.length }, { status: 201 });
    }

    // Single reservation payment
    if (!reservation_id) {
      return NextResponse.json({ error: 'Missing reservation_id or group_id' }, { status: 400 });
    }

    const id = `pay_${Date.now()}`;
    db.prepare(`
      INSERT INTO payments (id, reservation_id, amount, method, type, status, paid_at, notes)
      VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)
    `).run(id, reservation_id, amount, method, type || 'partial', payDate, notes || null);

    recalcPaymentStatus(db, reservation_id);

    // If this reservation belongs to a group, recalc group status too
    const resRow = db.prepare('SELECT group_id FROM reservations WHERE id = ?').get(reservation_id) as any;
    if (resRow?.group_id) {
      recalcGroupPaymentStatus(db, resRow.group_id);
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/payments error:', error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/alerts — returns actionable alerts for the dashboard
export async function GET() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const alerts: { type: string; severity: 'warning' | 'danger' | 'info'; message: string; bookingId: string; guestName: string }[] = [];

    // 1. Overdue arrivals — check_in <= today, status still 'confirmed' (not checked_in)
    const overdueArrivals = db.prepare(`
      SELECT r.id, r.check_in, r.status, r.payment_status, r.registration_status,
             g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_in <= ? AND r.status = 'confirmed' AND r.status != 'cancelled'
      ORDER BY r.check_in ASC
    `).all(today) as any[];

    for (const r of overdueArrivals) {
      alerts.push({
        type: 'overdue_arrival',
        severity: 'danger',
        message: `Прострочений заїзд ${r.check_in} — ${r.unit_name}`,
        bookingId: r.id,
        guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    // 2. Today's arrivals not yet checked in
    const todayArrivals = db.prepare(`
      SELECT r.id, r.payment_status, r.registration_status,
             g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_in = ? AND r.status IN ('confirmed', 'tentative')
    `).all(today) as any[];

    for (const r of todayArrivals) {
      if (r.payment_status !== 'paid') {
        alerts.push({
          type: 'unpaid_arrival',
          severity: 'warning',
          message: `Сьогодні заїзд, оплата не завершена — ${r.unit_name}`,
          bookingId: r.id,
          guestName: `${r.first_name} ${r.last_name}`,
        });
      }
      if (r.registration_status !== 'registered') {
        alerts.push({
          type: 'unregistered_arrival',
          severity: 'warning',
          message: `Сьогодні заїзд, реєстрація не пройдена — ${r.unit_name}`,
          bookingId: r.id,
          guestName: `${r.first_name} ${r.last_name}`,
        });
      }
    }

    // 3. Checked-in guests without registration (should not happen with gate, but legacy data)
    const noRegCheckedIn = db.prepare(`
      SELECT r.id, g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.status = 'checked_in' AND (r.registration_status IS NULL OR r.registration_status = 'not_registered')
    `).all() as any[];

    for (const r of noRegCheckedIn) {
      alerts.push({
        type: 'checked_in_no_reg',
        severity: 'danger',
        message: `Заселений без реєстрації — ${r.unit_name}`,
        bookingId: r.id,
        guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    // 4. Today's departures
    const todayDepartures = db.prepare(`
      SELECT r.id, g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_out = ? AND r.status = 'checked_in'
    `).all(today) as any[];

    for (const r of todayDepartures) {
      alerts.push({
        type: 'today_departure',
        severity: 'info',
        message: `Сьогодні виїзд — ${r.unit_name}`,
        bookingId: r.id,
        guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    return NextResponse.json(alerts);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

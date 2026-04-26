/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getClearingBalance, backfillReceivables } from '../data/clearing-engine';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * GET /api/finance/clearing
 * Returns all clearing accounts with computed balances + receivable counts.
 */
export async function listClearingAccounts(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const accounts = db.prepare(`
      SELECT id, name, currency, color, sort_order
      FROM finance_accounts
      WHERE organization_id = ? AND type = 'clearing' AND is_active = 1
      ORDER BY sort_order, name
    `).all(org) as any[];

    const enriched = accounts.map((a) => {
      const bal = getClearingBalance(db, a.id);
      return { ...a, ...bal };
    });

    const totals = enriched.reduce(
      (acc, a) => {
        acc.outstanding[a.currency] = (acc.outstanding[a.currency] || 0) + a.outstanding;
        acc.paid_total[a.currency] = (acc.paid_total[a.currency] || 0) + a.paid_total;
        acc.receivable_count += a.receivable_count;
        return acc;
      },
      { outstanding: {} as Record<string, number>, paid_total: {} as Record<string, number>, receivable_count: 0 },
    );

    return NextResponse.json({ accounts: enriched, totals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/clearing/receivables
 *   ?clearing_account_id, ?status (expected|in_statement|paid|cancelled),
 *   ?from, ?to (filter by check_in date), ?search (guest name / external id)
 */
export async function listReceivables(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const sp = request.nextUrl.searchParams;
    const accountId = sp.get('clearing_account_id');
    const status = sp.get('status');
    const from = sp.get('from');
    const to = sp.get('to');
    const search = sp.get('search');
    const limit = Math.min(500, parseInt(sp.get('limit') || '100', 10));

    const where: string[] = ['rcv.organization_id = ?'];
    const params: any[] = [org];
    if (accountId) { where.push('rcv.clearing_account_id = ?'); params.push(accountId); }
    if (status) { where.push('rcv.status = ?'); params.push(status); }
    if (from) { where.push('rcv.check_in >= ?'); params.push(from); }
    if (to) { where.push('rcv.check_in <= ?'); params.push(to); }
    if (search) {
      where.push('(g.first_name LIKE ? OR g.last_name LIKE ? OR rcv.external_reservation_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = db.prepare(`
      SELECT
        rcv.*,
        fa.name AS clearing_account_name, fa.color AS clearing_account_color,
        r.guest_id, r.total_price, r.payment_status,
        g.first_name, g.last_name,
        u.name AS unit_name
      FROM fin_channel_receivables rcv
      JOIN finance_accounts fa ON fa.id = rcv.clearing_account_id
      JOIN reservations r      ON r.id = rcv.reservation_id
      LEFT JOIN guests g       ON g.id = r.guest_id
      LEFT JOIN units u        ON u.id = r.unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY rcv.check_in DESC
      LIMIT ${limit}
    `).all(...params) as any[];

    const items = rows.map((r) => ({
      ...r,
      guest_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—',
    }));

    return NextResponse.json({ items, count: items.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/clearing/backfill
 * Manual trigger of backfill. Useful when reservations were imported before
 * PR #15 went live, or after editing channel mappings.
 */
export async function backfillReceivablesHandler(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const count = backfillReceivables(db, org);
    return NextResponse.json({ ok: true, count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

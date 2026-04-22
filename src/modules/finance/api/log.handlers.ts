/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function getFinanceLog(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const type = searchParams.get('type'); // income | expense | payment | transfer
    const search = searchParams.get('search');
    const account_id = searchParams.get('account_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    // Build date filter suffix (applied as HAVING on the union)
    const dateCond: string[] = [];
    const dateParams: any[] = [];
    if (month) { dateCond.push("strftime('%Y-%m', date) = ?"); dateParams.push(month); }
    if (dateFrom) { dateCond.push('date >= ?'); dateParams.push(dateFrom); }
    if (dateTo) { dateCond.push('date <= ?'); dateTo && dateParams.push(dateTo); }
    const dateWhere = dateCond.length ? `WHERE ${dateCond.join(' AND ')}` : '';

    // Search + account filter applied per-subquery
    const searchQ = search ? `%${search}%` : null;

    const buildIncomeQuery = () => `
      SELECT
        'income' as tx_type,
        i.id, i.income_date as date, i.amount as amount_raw, i.currency,
        i.account_id, fa.name as account_name, fa.color as account_color,
        i.counterparty, i.category,
        bu.name as bu_name, i.description as notes,
        NULL as reservation_code
      FROM income i
      LEFT JOIN finance_accounts fa ON fa.id = i.account_id
      LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      WHERE 1=1
        ${account_id ? 'AND i.account_id = ?' : ''}
        ${searchQ ? 'AND (i.description LIKE ? OR i.counterparty LIKE ? OR i.category LIKE ?)' : ''}
    `;

    const buildExpenseQuery = () => `
      SELECT
        'expense' as tx_type,
        e.id, e.expense_date as date, -e.amount as amount_raw, e.currency,
        e.account_id, fa.name as account_name, fa.color as account_color,
        e.counterparty, ec.name as category,
        bu.name as bu_name, e.description as notes,
        NULL as reservation_code
      FROM expenses e
      LEFT JOIN finance_accounts fa ON fa.id = e.account_id
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN business_units bu ON bu.id = e.business_unit_id
      WHERE 1=1
        ${account_id ? 'AND e.account_id = ?' : ''}
        ${searchQ ? 'AND (e.description LIKE ? OR e.counterparty LIKE ? OR ec.name LIKE ?)' : ''}
    `;

    const buildPaymentQuery = () => `
      SELECT
        'payment' as tx_type,
        p.id, p.paid_at as date, p.amount as amount_raw, p.currency,
        p.account_id, fa.name as account_name, fa.color as account_color,
        (g.first_name || ' ' || g.last_name) as counterparty,
        p.type as category,
        NULL as bu_name, p.notes,
        r.reservation_code
      FROM payments p
      LEFT JOIN reservations r ON r.id = p.reservation_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN finance_accounts fa ON fa.id = p.account_id
      WHERE p.status = 'completed' AND p.paid_at IS NOT NULL
        ${account_id ? 'AND p.account_id = ?' : ''}
        ${searchQ ? "AND (p.notes LIKE ? OR (g.first_name || ' ' || g.last_name) LIKE ?)" : ''}
    `;

    const buildTransferQuery = () => `
      SELECT
        'transfer' as tx_type,
        t.id, t.transfer_date as date, t.amount as amount_raw, t.currency,
        t.from_account_id as account_id,
        (fa_from.name || ' → ' || fa_to.name) as account_name,
        fa_from.color as account_color,
        NULL as counterparty, 'Переказ' as category,
        NULL as bu_name, t.notes,
        NULL as reservation_code
      FROM transfers t
      LEFT JOIN finance_accounts fa_from ON fa_from.id = t.from_account_id
      LEFT JOIN finance_accounts fa_to ON fa_to.id = t.to_account_id
      WHERE 1=1
        ${account_id ? 'AND (t.from_account_id = ? OR t.to_account_id = ?)' : ''}
        ${searchQ ? 'AND t.notes LIKE ?' : ''}
    `;

    // Determine which types to include
    const includeTypes = new Set(type ? [type] : ['income', 'expense', 'payment', 'transfer']);

    const unionParts: string[] = [];
    const unionParams: any[] = [];

    if (includeTypes.has('income')) {
      unionParts.push(buildIncomeQuery());
      if (account_id) unionParams.push(account_id);
      if (searchQ) unionParams.push(searchQ, searchQ, searchQ);
    }
    if (includeTypes.has('expense')) {
      unionParts.push(buildExpenseQuery());
      if (account_id) unionParams.push(account_id);
      if (searchQ) unionParams.push(searchQ, searchQ, searchQ);
    }
    if (includeTypes.has('payment')) {
      unionParts.push(buildPaymentQuery());
      if (account_id) unionParams.push(account_id);
      if (searchQ) {
        // payment search only 2 params
        unionParams.push(searchQ, searchQ);
      }
    }
    if (includeTypes.has('transfer')) {
      unionParts.push(buildTransferQuery());
      if (account_id) unionParams.push(account_id, account_id);
      if (searchQ) unionParams.push(searchQ);
    }

    if (unionParts.length === 0) {
      return NextResponse.json({ transactions: [], total: 0, page, limit });
    }

    const unionSql = unionParts.join(' UNION ALL ');
    const wrappedSql = `SELECT * FROM (${unionSql}) log ${dateWhere} ORDER BY date DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) as total FROM (${unionSql}) log ${dateWhere}`;

    const countRow = db.prepare(countSql).get(...unionParams, ...dateParams) as any;
    const rows = db.prepare(wrappedSql).all(...unionParams, ...dateParams, limit, offset);

    return NextResponse.json({ transactions: rows, total: countRow.total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

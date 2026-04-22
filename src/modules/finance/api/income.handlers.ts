/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listIncome(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const search = searchParams.get('search');
    const account_id = searchParams.get('account_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (month) { where += ' AND i.month = ?'; params.push(month); }
    if (account_id) { where += ' AND i.account_id = ?'; params.push(account_id); }
    if (search) {
      where += ' AND (i.description LIKE ? OR i.counterparty LIKE ? OR i.category LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM income i ${where}`).get(...params) as any;
    const rows = db.prepare(`
      SELECT i.*, fa.name as account_name, fa.color as account_color, bu.name as bu_name
      FROM income i
      LEFT JOIN finance_accounts fa ON fa.id = i.account_id
      LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      ${where}
      ORDER BY i.income_date DESC, i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({ income: rows, total: countRow.total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createIncome(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { account_id, amount, currency = 'CZK', category, counterparty, description, income_date, business_unit_id, notes } = body;
    if (!description || amount === undefined || !income_date) {
      return NextResponse.json({ error: 'description, amount, income_date are required' }, { status: 400 });
    }
    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const month = income_date.substring(0, 7);
    db.prepare(`
      INSERT INTO income (id, organization_id, account_id, amount, currency, category, counterparty, description, income_date, month, business_unit_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, account_id || null, amount, currency, category || null, counterparty || null, description, income_date, month, business_unit_id || null, notes || null);
    const row = db.prepare(`
      SELECT i.*, fa.name as account_name, fa.color as account_color, bu.name as bu_name
      FROM income i
      LEFT JOIN finance_accounts fa ON fa.id = i.account_id
      LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      WHERE i.id = ?
    `).get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateIncome(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, account_id, amount, currency, category, counterparty, description, income_date, business_unit_id, notes } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const fields: string[] = [];
    const params: any[] = [];
    if (account_id !== undefined) { fields.push('account_id = ?'); params.push(account_id || null); }
    if (amount !== undefined) { fields.push('amount = ?'); params.push(amount); }
    if (currency !== undefined) { fields.push('currency = ?'); params.push(currency); }
    if (category !== undefined) { fields.push('category = ?'); params.push(category || null); }
    if (counterparty !== undefined) { fields.push('counterparty = ?'); params.push(counterparty || null); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (income_date !== undefined) {
      fields.push('income_date = ?', 'month = ?');
      params.push(income_date, income_date.substring(0, 7));
    }
    if (business_unit_id !== undefined) { fields.push('business_unit_id = ?'); params.push(business_unit_id || null); }
    if (notes !== undefined) { fields.push('notes = ?'); params.push(notes || null); }
    fields.push("updated_at = datetime('now')");
    if (fields.length <= 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);
    db.prepare(`UPDATE income SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare(`
      SELECT i.*, fa.name as account_name, fa.color as account_color, bu.name as bu_name
      FROM income i
      LEFT JOIN finance_accounts fa ON fa.id = i.account_id
      LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      WHERE i.id = ?
    `).get(id);
    return NextResponse.json(row);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteIncome(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    db.prepare("DELETE FROM income WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

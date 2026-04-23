/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listAccounts(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const accounts = db.prepare(`
      SELECT
        fa.*,
        (
          fa.initial_balance
          + COALESCE((SELECT SUM(i.amount) FROM income i WHERE i.account_id = fa.id), 0)
          + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.account_id = fa.id AND p.status = 'completed'), 0)
          - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.account_id = fa.id), 0)
          + COALESCE((SELECT SUM(t.amount) FROM transfers t WHERE t.to_account_id = fa.id), 0)
          - COALESCE((SELECT SUM(t.amount) FROM transfers t WHERE t.from_account_id = fa.id), 0)
        ) as balance
      FROM finance_accounts fa
      WHERE fa.organization_id = ? AND fa.is_active = 1
      ORDER BY fa.sort_order, fa.name
    `).all(orgRow.id);
    return NextResponse.json(accounts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createAccount(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, type = 'cash', currency = 'CZK', initial_balance = 0, color = '#6366f1', sort_order = 0 } = body;
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `acct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO finance_accounts (id, organization_id, name, type, currency, initial_balance, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, name, type, currency, initial_balance, color, sort_order);
    const account = db.prepare("SELECT * FROM finance_accounts WHERE id = ?").get(id);
    return NextResponse.json(account, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateAccount(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, name, type, currency, initial_balance, color, sort_order, is_active } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (type !== undefined) { fields.push('type = ?'); params.push(type); }
    if (currency !== undefined) { fields.push('currency = ?'); params.push(currency); }
    if (initial_balance !== undefined) { fields.push('initial_balance = ?'); params.push(initial_balance); }
    if (color !== undefined) { fields.push('color = ?'); params.push(color); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);
    db.prepare(`UPDATE finance_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const account = db.prepare("SELECT * FROM finance_accounts WHERE id = ?").get(id);
    return NextResponse.json(account);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

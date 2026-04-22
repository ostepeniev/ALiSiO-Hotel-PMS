/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listTransfers(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (month) {
      where += " AND strftime('%Y-%m', t.transfer_date) = ?";
      params.push(month);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM transfers t ${where}`).get(...params) as any;
    const rows = db.prepare(`
      SELECT t.*,
        fa_from.name as from_account_name, fa_from.color as from_account_color,
        fa_to.name as to_account_name, fa_to.color as to_account_color
      FROM transfers t
      LEFT JOIN finance_accounts fa_from ON fa_from.id = t.from_account_id
      LEFT JOIN finance_accounts fa_to ON fa_to.id = t.to_account_id
      ${where}
      ORDER BY t.transfer_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({ transfers: rows, total: countRow.total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createTransfer(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { from_account_id, to_account_id, amount, currency = 'CZK', transfer_date, notes } = body;
    if (!from_account_id || !to_account_id || amount === undefined || !transfer_date) {
      return NextResponse.json({ error: 'from_account_id, to_account_id, amount, transfer_date are required' }, { status: 400 });
    }
    if (from_account_id === to_account_id) {
      return NextResponse.json({ error: 'Source and destination accounts must differ' }, { status: 400 });
    }
    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `txfr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO transfers (id, organization_id, from_account_id, to_account_id, amount, currency, transfer_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, from_account_id, to_account_id, amount, currency, transfer_date, notes || null);
    const row = db.prepare(`
      SELECT t.*,
        fa_from.name as from_account_name, fa_from.color as from_account_color,
        fa_to.name as to_account_name, fa_to.color as to_account_color
      FROM transfers t
      LEFT JOIN finance_accounts fa_from ON fa_from.id = t.from_account_id
      LEFT JOIN finance_accounts fa_to ON fa_to.id = t.to_account_id
      WHERE t.id = ?
    `).get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteTransfer(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    db.prepare("DELETE FROM transfers WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

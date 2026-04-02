/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const statement_id = searchParams.get('statement_id');
    const match_status = searchParams.get('match_status');

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (statement_id) { where += ' AND bt.statement_id = ?'; params.push(statement_id); }
    if (match_status) { where += ' AND bt.match_status = ?'; params.push(match_status); }

    const transactions = db.prepare(`
      SELECT bt.*, 
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
             bu.name as bu_name
      FROM bank_transactions bt
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      LEFT JOIN business_units bu ON bt.matched_business_unit_id = bu.id
      ${where}
      ORDER BY bt.transaction_date DESC
    `).all(...params);

    return NextResponse.json(transactions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - manual match / confirm / ignore a transaction
export async function PUT(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, matched_category_id, matched_business_unit_id, match_status, create_expense } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const tx = db.prepare("SELECT * FROM bank_transactions WHERE id = ?").get(id) as any;
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Update match status
    db.prepare(`
      UPDATE bank_transactions SET
        matched_category_id = COALESCE(?, matched_category_id),
        matched_business_unit_id = ?,
        match_status = COALESCE(?, match_status)
      WHERE id = ?
    `).run(matched_category_id, matched_business_unit_id ?? null, match_status, id);

    // If confirming and creating expense
    if (create_expense && matched_category_id && (match_status === 'confirmed' || match_status === 'manual')) {
      const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
      const expId = `exp_bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const month = tx.transaction_date.substring(0, 7);

      db.prepare(`
        INSERT INTO expenses (id, organization_id, category_id, business_unit_id, amount, description, counterparty, method, expense_date, month, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'bank_transfer', ?, ?, ?)
      `).run(expId, orgRow.id, matched_category_id, matched_business_unit_id || null, tx.amount, tx.description || 'Bank import', tx.counterparty || null, tx.transaction_date, month, `Imported from bank: ${tx.reference || ''}`);

      db.prepare("UPDATE bank_transactions SET matched_expense_id = ? WHERE id = ?").run(expId, id);

      // Update statement matched count
      db.prepare(`
        UPDATE bank_statements SET matched_transactions = (
          SELECT COUNT(*) FROM bank_transactions WHERE statement_id = ? AND match_status IN ('confirmed', 'manual', 'auto_matched')
        ) WHERE id = ?
      `).run(tx.statement_id, tx.statement_id);
    }

    const updated = db.prepare(`
      SELECT bt.*, ec.name as category_name, ec.icon as category_icon, bu.name as bu_name
      FROM bank_transactions bt
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      LEFT JOIN business_units bu ON bt.matched_business_unit_id = bu.id
      WHERE bt.id = ?
    `).get(id);

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

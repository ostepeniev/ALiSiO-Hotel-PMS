/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const expense = db.prepare(`
      SELECT e.*, 
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color, ec.std_group,
             bu.name as bu_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      WHERE e.id = ?
    `).get(id);

    if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(expense);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();
    const { category_id, business_unit_id, amount, description, counterparty, method, expense_date, notes } = body;

    const existing = db.prepare("SELECT id FROM expenses WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const month = expense_date ? expense_date.substring(0, 7) : undefined;
    db.prepare(`
      UPDATE expenses SET
        category_id = COALESCE(?, category_id),
        business_unit_id = ?,
        amount = COALESCE(?, amount),
        description = COALESCE(?, description),
        counterparty = ?,
        method = ?,
        expense_date = COALESCE(?, expense_date),
        month = COALESCE(?, month),
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(category_id, business_unit_id ?? null, amount, description, counterparty ?? null, method ?? null, expense_date, month, notes ?? null, id);

    const expense = db.prepare(`
      SELECT e.*, 
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color, ec.std_group,
             bu.name as bu_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      WHERE e.id = ?
    `).get(id);

    return NextResponse.json(expense);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const result = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    if (result.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

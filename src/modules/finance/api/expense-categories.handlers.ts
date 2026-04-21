/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listExpenseCategories(): Promise<NextResponse> {
  try {
    const db = getDb();
    const categories = db.prepare(`SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order ASC`).all();
    return NextResponse.json(categories);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createExpenseCategory(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, std_group, pnl_line, alloc_method, icon, color } = body;

    if (!name || !std_group || !pnl_line) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `ec_${Date.now()}`;
    const maxOrder = db.prepare("SELECT MAX(sort_order) as mx FROM expense_categories").get() as any;

    db.prepare(`
      INSERT INTO expense_categories (id, organization_id, name, std_group, pnl_line, alloc_method, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, name, std_group, pnl_line, alloc_method || 'DIRECT', icon || '📋', color || '#6b7280', (maxOrder?.mx || 0) + 1);

    return NextResponse.json(db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

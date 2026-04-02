/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const category_id = searchParams.get('category_id');
    const business_unit_id = searchParams.get('business_unit_id');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (month) {
      where += ' AND e.month = ?';
      params.push(month);
    }
    if (category_id) {
      where += ' AND e.category_id = ?';
      params.push(category_id);
    }
    if (business_unit_id) {
      where += ' AND e.business_unit_id = ?';
      params.push(business_unit_id);
    }
    if (search) {
      where += ' AND (e.description LIKE ? OR e.counterparty LIKE ? OR e.notes LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM expenses e ${where}`).get(...params) as any;

    const expenses = db.prepare(`
      SELECT e.*, 
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color, ec.std_group,
             bu.name as bu_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      ${where}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Category summary for current filter
    const categorySummary = db.prepare(`
      SELECT ec.id, ec.name, ec.icon, ec.color, ec.std_group,
             COALESCE(SUM(e.amount), 0) as total
      FROM expense_categories ec
      LEFT JOIN expenses e ON e.category_id = ec.id ${month ? 'AND e.month = ?' : ''}
      WHERE ec.is_active = 1
      GROUP BY ec.id
      ORDER BY ec.sort_order
    `).all(...(month ? [month] : []));

    return NextResponse.json({
      expenses,
      total: countRow.total,
      page,
      limit,
      categorySummary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { category_id, business_unit_id, amount, description, counterparty, method, expense_date, notes } = body;

    if (!category_id || amount === undefined || !description || !expense_date) {
      return NextResponse.json({ error: 'Missing required fields: category_id, amount, description, expense_date' }, { status: 400 });
    }

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const month = expense_date.substring(0, 7); // "2026-03-15" → "2026-03"

    db.prepare(`
      INSERT INTO expenses (id, organization_id, category_id, business_unit_id, amount, description, counterparty, method, expense_date, month, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, category_id, business_unit_id || null, amount, description, counterparty || null, method || null, expense_date, month, notes || null);

    const expense = db.prepare(`
      SELECT e.*, 
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color, ec.std_group,
             bu.name as bu_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN business_units bu ON e.business_unit_id = bu.id
      WHERE e.id = ?
    `).get(id);

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { file_name, bank_name, account_number, rows } = body;

    // rows = array of { date, amount, counterparty, description, reference }
    if (!file_name || !rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Missing file_name or rows array' }, { status: 400 });
    }

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const stmtId = `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Determine period
    const dates = rows.map((r: any) => r.date).filter(Boolean).sort();
    const periodFrom = dates[0] || '';
    const periodTo = dates[dates.length - 1] || '';

    db.prepare(`
      INSERT INTO bank_statements (id, organization_id, file_name, bank_name, account_number, period_from, period_to, total_transactions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing')
    `).run(stmtId, orgRow.id, file_name, bank_name || null, account_number || null, periodFrom, periodTo, rows.length);

    // Load categories for auto-matching by keyword
    const categories = db.prepare("SELECT id, name FROM expense_categories WHERE is_active = 1").all() as any[];
    const categoryKeywords: Record<string, string> = {};
    for (const cat of categories) {
      categoryKeywords[cat.name.toLowerCase()] = cat.id;
    }

    const insTx = db.prepare(`
      INSERT INTO bank_transactions (id, statement_id, organization_id, transaction_date, amount, counterparty, description, reference, matched_category_id, matched_payment_id, match_status, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let matched = 0;
    const insertMany = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const txId = `btx_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`;
        
        // Simple keyword-based auto-match
        let matchedCategoryId: string | null = null;
        let matchStatus = 'unmatched';
        let confidence = 0;

        const desc = ((row.description || '') + ' ' + (row.counterparty || '')).toLowerCase();
        
        // Match patterns
        const patterns: [string[], string][] = [
          [['оренд', 'rent', 'najem'], 'ec_rent'],
          [['комунал', 'utilit', 'elektr', 'voda', 'plyn', 'газ', 'вода', 'електр'], 'ec_utilities'],
          [['зарплат', 'payroll', 'mzda', 'plat'], 'ec_payroll'],
          [['маркет', 'reklam', 'google', 'facebook', 'instagram'], 'ec_marketing'],
          [['харч', 'food', 'restaur', 'ресторан', 'jidlo'], 'ec_food'],
          [['продукт', 'potraviny', 'makro', 'tesco'], 'ec_products'],
          [['подат', 'dan', 'tax'], 'ec_taxes'],
          [['строй', 'stavba', 'construc', 'будів'], 'ec_capex'],
          [['інвест', 'invest'], 'ec_investors'],
          [['переказ', 'prevod', 'transfer'], 'ec_transfer'],
        ];

        for (const [keywords, catId] of patterns) {
          if (keywords.some(kw => desc.includes(kw))) {
            matchedCategoryId = catId;
            matchStatus = 'auto_matched';
            confidence = 0.7;
            matched++;
            break;
          }
        }

        // Payment reconciliation for positive amounts (inflows from guests)
        let matchedPaymentId: string | null = null;
        if (row.amount > 0) {
          // Try matching by reference/variable symbol → reservation ID or payment
          if (row.reference) {
            const ref = row.reference.trim();
            // Check if reference matches a reservation ID
            const paymentByRef = db.prepare(`
              SELECT p.id, p.reservation_id FROM payments p
              JOIN reservations r ON p.reservation_id = r.id
              WHERE p.status = 'pending' AND (r.id LIKE ? OR p.id LIKE ?)
              LIMIT 1
            `).get(`%${ref}%`, `%${ref}%`) as any;
            if (paymentByRef) {
              matchedPaymentId = paymentByRef.id;
              matchStatus = 'matched_payment';
              confidence = 0.9;
              matched++;
            }
          }
          // Fallback: match by exact amount + date range (±3 days)
          if (!matchedPaymentId) {
            const paymentByAmount = db.prepare(`
              SELECT p.id, p.reservation_id FROM payments p
              WHERE p.status = 'pending' AND ABS(p.amount - ?) < 0.01
                AND p.id NOT IN (SELECT COALESCE(matched_payment_id, '') FROM bank_transactions WHERE matched_payment_id IS NOT NULL)
              ORDER BY ABS(julianday(COALESCE(p.paid_at, datetime('now'))) - julianday(?))
              LIMIT 1
            `).get(row.amount, row.date) as any;
            if (paymentByAmount) {
              matchedPaymentId = paymentByAmount.id;
              matchStatus = 'matched_payment';
              confidence = 0.6;
              matched++;
            }
          }
          // If matched, mark payment as completed
          if (matchedPaymentId) {
            db.prepare("UPDATE payments SET status = 'completed', paid_at = COALESCE(paid_at, ?) WHERE id = ?").run(row.date, matchedPaymentId);
            // Update reservation payment_status
            const pay = db.prepare("SELECT reservation_id FROM payments WHERE id = ?").get(matchedPaymentId) as any;
            if (pay) {
              const totalDue = db.prepare("SELECT total_price FROM reservations WHERE id = ?").get(pay.reservation_id) as any;
              const totalPaid = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE reservation_id = ? AND status = 'completed' AND type != 'refund'").get(pay.reservation_id) as any;
              if (totalPaid.total >= totalDue.total_price) {
                db.prepare("UPDATE reservations SET payment_status = 'paid' WHERE id = ?").run(pay.reservation_id);
              } else if (totalPaid.total > 0) {
                db.prepare("UPDATE reservations SET payment_status = 'prepaid' WHERE id = ?").run(pay.reservation_id);
              }
            }
          }
        }

        insTx.run(txId, stmtId, orgRow.id, row.date, row.amount, row.counterparty || null, row.description || null, row.reference || null, matchedCategoryId, matchedPaymentId, matchStatus, confidence);
      }
    });

    insertMany();

    // Update statement
    db.prepare("UPDATE bank_statements SET matched_transactions = ?, status = 'done' WHERE id = ?").run(matched, stmtId);

    const statement = db.prepare("SELECT * FROM bank_statements WHERE id = ?").get(stmtId);

    return NextResponse.json({
      statement,
      totalRows: rows.length,
      autoMatched: matched,
      unmatched: rows.length - matched,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

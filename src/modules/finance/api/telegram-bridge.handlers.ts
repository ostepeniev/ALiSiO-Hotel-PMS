/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Telegram bot ↔ Finance bridge.
//
// The Python bot (kemptimebot) records two kinds of finance events that
// otherwise wouldn't make it into PMS:
//   - sauna walk-ins (income, ~2% of revenue but easy to miss)
//   - cash payments to staff / small purchases (expense)
//
// This module exposes HTTP endpoints the bot calls to push those events
// into fin_operations. Auth is shared-secret (TELEGRAM_BRIDGE_TOKEN env)
// rather than session cookie, since the bot has no user session.
//
// Idempotency: source_ref is the dedupe key — re-posting the same Telegram
// message returns the existing operation rather than creating a duplicate.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createOperationInTx } from './operations.handlers';

type BridgeEventType = 'sauna_income' | 'cash_expense';

interface BridgeEvent {
  type: BridgeEventType;
  amount: number;
  currency?: string;          // default CZK
  paid_at?: string;           // ISO datetime, default now
  category_id?: string | null;
  project_id?: string | null;
  account_id?: string | null; // override default account
  comment?: string | null;
  // Telegram metadata for dedup
  chat_id: number | string;
  message_id: number | string;
  recorded_by?: string | null; // username/full_name from Telegram
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function authorizeBridge(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: 'Bridge not configured: TELEGRAM_BRIDGE_TOKEN missing on server' }, { status: 503 }) };
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  if (!token || token !== expected) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 }) };
  }
  return { ok: true };
}

function defaultCashAccountId(db: any, orgId: string, currency: string): string | null {
  const row = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE organization_id = ? AND currency = ? AND is_active = 1
      AND type IN ('cash', 'bank')
    ORDER BY (type = 'cash') DESC, sort_order ASC, created_at ASC
    LIMIT 1
  `).get(orgId, currency) as { id: string } | undefined;
  return row?.id || null;
}

/**
 * POST /api/finance/telegram-bridge/operation
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Body: BridgeEvent
 *
 * Returns:
 *   201 + { operation_id, was_new: true }    — new op created
 *   200 + { operation_id, was_new: false }   — already imported, returning existing
 *   400 + { error }                          — validation
 *   401 + { error }                          — token missing/wrong
 *   503 + { error }                          — env not configured
 */
export async function recordTelegramOperation(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json() as BridgeEvent;
    const { type, amount, chat_id, message_id } = body;

    if (!type || !['sauna_income', 'cash_expense'].includes(type)) {
      return NextResponse.json({ error: 'type must be sauna_income or cash_expense' }, { status: 400 });
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }
    if (!chat_id || !message_id) {
      return NextResponse.json({ error: 'chat_id and message_id are required for dedup' }, { status: 400 });
    }

    const db = getDb();
    const orgId = getOrgId(db);

    const sourceTag = type === 'sauna_income' ? 'telegram_sauna' : 'telegram_cash';
    const sourceRef = `tg:${chat_id}:${message_id}`;
    const opType = type === 'sauna_income' ? 'income' : 'expense';
    const currency = (body.currency || 'CZK').toUpperCase();
    const paidAt = body.paid_at || new Date().toISOString();

    // Idempotency check — has this Telegram message already been imported?
    const existing = db.prepare(
      "SELECT id FROM fin_operations WHERE source = ? AND source_ref = ? LIMIT 1"
    ).get(sourceTag, sourceRef) as { id: string } | undefined;
    if (existing) {
      return NextResponse.json({ operation_id: existing.id, was_new: false }, { status: 200 });
    }

    const accountId = body.account_id || defaultCashAccountId(db, orgId, currency);
    if (!accountId) {
      return NextResponse.json({
        error: `No active cash/bank account in ${currency} for this organization`,
      }, { status: 400 });
    }

    const commentParts: string[] = [];
    if (body.comment) commentParts.push(body.comment);
    if (body.recorded_by) commentParts.push(`(via ${body.recorded_by})`);
    const comment = commentParts.length > 0
      ? commentParts.join(' ')
      : (type === 'sauna_income' ? 'Сауна (бот)' : 'Готівкова витрата (бот)');

    const operationId = createOperationInTx(db, orgId, {
      op_type: opType,
      account_from_id: opType === 'expense' ? accountId : null,
      account_to_id:   opType === 'income'  ? accountId : null,
      amount,
      currency,
      paid_at: paidAt,
      category_id: body.category_id || null,
      project_id: body.project_id || null,
      comment,
      method: 'cash',
      source: sourceTag,
      source_ref: sourceRef,
      status: 'completed',
    });

    return NextResponse.json({ operation_id: operationId, was_new: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/operations
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *   ?source=telegram_sauna|telegram_cash  (optional)
 *   ?limit=50                              (max 200)
 *
 * Returns recent bridge-recorded operations, for the bot's "what did I
 * record today?" view.
 */
export async function listTelegramOperations(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;
    const sourceFilter = sp.get('source');
    const limit = Math.min(200, parseInt(sp.get('limit') || '50', 10));

    const where: string[] = ["source IN ('telegram_sauna', 'telegram_cash')"];
    const params: any[] = [];
    if (sourceFilter) {
      where.push('source = ?');
      params.push(sourceFilter);
    }

    const rows = db.prepare(`
      SELECT id, op_type, amount, currency, paid_at, comment, source, source_ref, status, created_at
      FROM fin_operations
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `).all(...params);

    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/categories
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Returns active categories + projects for the bot to populate dropdowns.
 * Filtered by op_type: sauna → income categories, cash → expense categories.
 */
export async function listTelegramCategories(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const opType = sp.get('op_type'); // 'income' | 'expense'

    const where = ['organization_id = ?', 'is_active = 1'];
    const params: any[] = [orgId];
    if (opType && ['income', 'expense'].includes(opType)) {
      where.push('(op_type = ? OR op_type IS NULL)');
      params.push(opType);
    }

    const categories = db.prepare(`
      SELECT id, name, icon, op_type, parent_id
      FROM expense_categories
      WHERE ${where.join(' AND ')}
      ORDER BY parent_id NULLS FIRST, sort_order, name
    `).all(...params);

    const projects = db.prepare(`
      SELECT id, name FROM business_units
      WHERE organization_id = ? AND is_active = 1
      ORDER BY sort_order, name
    `).all(orgId);

    return NextResponse.json({ categories, projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

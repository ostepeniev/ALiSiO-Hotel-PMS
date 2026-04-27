/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor module API handlers (PR #31).
//
// Manages 4 entities: investors, investor_investments,
// property_monthly_metrics, investor_payouts.
//
// Investor portal token: 32-byte hex generated on creation, used for
// public read-only access at /invest/[token]. Token can be regenerated
// (revokes old link).
//
// Payout creation also creates a corresponding fin_operation
// (op_type='expense', source='dividend') so the dividend appears in
// finance reports as a real cash outflow.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as crypto from 'crypto';
import { createOperationInTx } from './operations.handlers';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Investors CRUD ──────────────────────────────────────

export async function listInvestors(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT i.*,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_investments
          WHERE investor_id = i.id AND is_active = 1) AS total_invested,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_payouts
          WHERE investor_id = i.id) AS total_paid_out,
        (SELECT COUNT(*) FROM investor_investments
          WHERE investor_id = i.id AND is_active = 1) AS active_lots
      FROM investors i
      WHERE i.organization_id = ?
      ORDER BY i.created_at DESC
    `).all(orgId);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createInvestor(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const id = `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO investors (id, organization_id, name, email, phone, telegram_chat_id, portal_token, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, body.name, body.email || null, body.phone || null,
      body.telegram_chat_id || null, newToken(), body.status || 'active', body.notes || null,
    );
    const row = db.prepare("SELECT * FROM investors WHERE id = ?").get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateInvestor(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const fields: string[] = [];
    const params: any[] = [];
    for (const k of ['name', 'email', 'phone', 'telegram_chat_id', 'status', 'notes']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
    }
    if (body.regenerate_token === true) {
      fields.push('portal_token = ?'); params.push(newToken());
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE investors SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare("SELECT * FROM investors WHERE id = ?").get(id);
    return NextResponse.json(row);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteInvestor(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM investors WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Investments CRUD ────────────────────────────────────

export async function listInvestments(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');
    const projectId = sp.get('project_id');

    const where: string[] = ['ii.organization_id = ?'];
    const params: any[] = [orgId];
    if (investorId) { where.push('ii.investor_id = ?'); params.push(investorId); }
    if (projectId)  { where.push('ii.project_id = ?');  params.push(projectId);  }

    const rows = db.prepare(`
      SELECT ii.*, i.name AS investor_name, bu.name AS project_name
      FROM investor_investments ii
      JOIN investors i      ON i.id = ii.investor_id
      JOIN business_units bu ON bu.id = ii.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY ii.invested_at DESC
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createInvestment(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.investor_id || !body.project_id || !body.amount || !body.invested_at) {
      return NextResponse.json({ error: 'investor_id, project_id, amount, invested_at required' }, { status: 400 });
    }
    const id = `ivst_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO investor_investments
        (id, organization_id, investor_id, project_id, amount, currency, equity_pct,
         invested_at, model_description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, body.investor_id, body.project_id,
      body.amount, body.currency || 'EUR', body.equity_pct ?? null,
      body.invested_at, body.model_description || null, body.is_active === false ? 0 : 1,
    );
    return NextResponse.json({ id, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateInvestment(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const fields: string[] = [];
    const params: any[] = [];
    for (const k of ['amount', 'currency', 'equity_pct', 'invested_at', 'model_description', 'is_active', 'project_id']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);
    db.prepare(`UPDATE investor_investments SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteInvestment(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM investor_investments WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Property monthly metrics CRUD ──────────────────────

export async function listMonthlyMetrics(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const projectId = sp.get('project_id');

    const where: string[] = ['m.organization_id = ?'];
    const params: any[] = [orgId];
    if (projectId) { where.push('m.project_id = ?'); params.push(projectId); }

    const rows = db.prepare(`
      SELECT m.*, bu.name AS project_name
      FROM property_monthly_metrics m
      JOIN business_units bu ON bu.id = m.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.year_month DESC, bu.sort_order
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function upsertMonthlyMetric(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.project_id || !body.year_month) {
      return NextResponse.json({ error: 'project_id and year_month required' }, { status: 400 });
    }
    const id = `pmm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO property_monthly_metrics
        (id, organization_id, project_id, year_month, occupancy_pct, revenue, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, year_month) DO UPDATE SET
        occupancy_pct = excluded.occupancy_pct,
        revenue = excluded.revenue,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(id, orgId, body.project_id, body.year_month,
           body.occupancy_pct ?? null, body.revenue ?? null, body.notes || null);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteMonthlyMetric(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM property_monthly_metrics WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Investor payouts (dividends) ───────────────────────

export async function listPayouts(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');

    const where: string[] = ['p.organization_id = ?'];
    const params: any[] = [orgId];
    if (investorId) { where.push('p.investor_id = ?'); params.push(investorId); }

    const rows = db.prepare(`
      SELECT p.*, i.name AS investor_name, bu.name AS project_name
      FROM investor_payouts p
      JOIN investors i        ON i.id = p.investor_id
      LEFT JOIN business_units bu ON bu.id = p.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.paid_at DESC
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/investor-payouts
 * Body: { investor_id, project_id?, amount, currency?, paid_at,
 *         period_year_month?, comment?, account_from_id? }
 *
 * Creates the payout row + a matching fin_operation (op_type='expense',
 * source='dividend') so the cash outflow appears in finance reports.
 */
export async function createPayout(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.investor_id || !body.amount || !body.paid_at) {
      return NextResponse.json({ error: 'investor_id, amount, paid_at required' }, { status: 400 });
    }
    const investor = db.prepare("SELECT name FROM investors WHERE id = ?").get(body.investor_id) as { name: string } | undefined;
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

    // Resolve account: explicit, else first active bank account in matching currency
    const currency = body.currency || 'EUR';
    let accountFromId: string | null = body.account_from_id || null;
    if (!accountFromId) {
      const a = db.prepare(`
        SELECT id FROM finance_accounts
        WHERE organization_id = ? AND currency = ? AND is_active = 1
          AND type IN ('bank', 'cash')
        ORDER BY (type = 'bank') DESC, sort_order ASC
        LIMIT 1
      `).get(orgId, currency) as { id: string } | undefined;
      accountFromId = a?.id || null;
    }
    if (!accountFromId) {
      return NextResponse.json({ error: `No active bank/cash account in ${currency}` }, { status: 400 });
    }

    const payoutId = `payout_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    // Create the matching fin_operation
    const operationId = createOperationInTx(db, orgId, {
      op_type: 'expense',
      account_from_id: accountFromId,
      account_to_id: null,
      amount: Math.abs(body.amount),
      currency,
      paid_at: body.paid_at,
      project_id: body.project_id || null,
      comment: body.comment || `Dividend → ${investor.name}` + (body.period_year_month ? ` for ${body.period_year_month}` : ''),
      method: 'bank_transfer',
      source: 'dividend',
      source_ref: payoutId,
      status: 'completed',
    });

    db.prepare(`
      INSERT INTO investor_payouts
        (id, organization_id, investor_id, project_id, amount, currency,
         paid_at, period_year_month, comment, fin_operation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payoutId, orgId, body.investor_id, body.project_id || null,
           body.amount, currency, body.paid_at, body.period_year_month || null,
           body.comment || null, operationId);

    return NextResponse.json({ id: payoutId, fin_operation_id: operationId, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deletePayout(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    // Also remove the linked fin_operation
    const row = db.prepare("SELECT fin_operation_id FROM investor_payouts WHERE id = ?").get(id) as { fin_operation_id: string | null } | undefined;
    if (row?.fin_operation_id) {
      db.prepare("DELETE FROM fin_operations WHERE id = ?").run(row.fin_operation_id);
    }
    db.prepare("DELETE FROM investor_payouts WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Helper: get available projects (= business_units) ─────

export async function listInvestorProjects(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT id, name, sort_order
      FROM business_units
      WHERE organization_id = ? AND is_active = 1
      ORDER BY sort_order, name
    `).all(orgId);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

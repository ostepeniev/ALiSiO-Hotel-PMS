/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as fs from 'fs';
import * as path from 'path';
import { parseFinmapXlsx, importFinmapRows } from '../data/finmap-import-engine';

const REPO_FILE = path.join(process.cwd(), 'docs', 'ExportUK (2).xlsx');

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * POST /api/finance/finmap-import
 * Body: multipart with file=<xlsx>  OR  empty body to use repo's docs/ExportUK (2).xlsx
 * Query: ?dry_run=1 for preview without writing
 *
 * Idempotent — re-running on the same file is a no-op (dedup by SHA256
 * of date|amount|accounts|category|comment).
 */
export async function importFinmap(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';

    let buffer: Buffer;
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
      } else if (fs.existsSync(REPO_FILE)) {
        buffer = fs.readFileSync(REPO_FILE);
      } else {
        return NextResponse.json({
          error: 'No file uploaded and docs/ExportUK (2).xlsx not found in repo',
        }, { status: 400 });
      }
    } catch {
      // Body wasn't multipart — try repo file
      if (fs.existsSync(REPO_FILE)) {
        buffer = fs.readFileSync(REPO_FILE);
      } else {
        return NextResponse.json({
          error: 'No file body and docs/ExportUK (2).xlsx not found',
        }, { status: 400 });
      }
    }

    const rows = await parseFinmapXlsx(buffer);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows parsed from XLSX' }, { status: 400 });
    }

    const result = importFinmapRows(db, orgId, rows, { dryRun });

    db.prepare(`
      INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
      VALUES ('finmap_import_last_run', ?, datetime('now'))
    `).run(JSON.stringify({
      dry_run: dryRun,
      ran_at: new Date().toISOString(),
      parsed: result.parsed,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors.length,
    }));

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/finmap-import/rollback
 * Body: { include_entities?: boolean, dry_run?: boolean }
 *
 * Removes all fin_operations with source='finmap_import' (safe — those are
 * exclusively from the importer). Optionally also removes auto-created
 * accounts/categories/projects/counterparties (identified by ID prefixes
 * acct_finmap_*, ec_finmap_*, bu_finmap_*, cp_finmap_*).
 *
 * Entity deletion is best-effort — if any has FK references from other
 * tables (e.g. user manually used a finmap-created category for another
 * op), that delete fails and we report it. Operations always delete first.
 */
export async function rollbackFinmapImport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json().catch(() => ({}));
    const includeEntities = body.include_entities === true;
    const dryRun = body.dry_run === true;

    // 1. Count + delete fin_operations from this importer
    const opsRow = db.prepare(
      "SELECT COUNT(*) AS n FROM fin_operations WHERE organization_id = ? AND source = 'finmap_import'"
    ).get(orgId) as { n: number };

    let opsDeleted = 0;
    if (!dryRun && opsRow.n > 0) {
      const r = db.prepare(
        "DELETE FROM fin_operations WHERE organization_id = ? AND source = 'finmap_import'"
      ).run(orgId);
      opsDeleted = r.changes;
    }

    const result: any = {
      ok: true,
      dry_run: dryRun,
      operations: { found: opsRow.n, deleted: opsDeleted },
      entities: { skipped: !includeEntities },
    };

    if (includeEntities) {
      const entityResults: any = {};
      const tables = [
        { table: 'finance_counterparties', prefix: 'cp_finmap_', label: 'counterparties' },
        { table: 'expense_categories',     prefix: 'ec_finmap_', label: 'categories' },
        { table: 'business_units',         prefix: 'bu_finmap_', label: 'projects' },
        { table: 'finance_accounts',       prefix: 'acct_finmap_', label: 'accounts' },
      ];
      for (const t of tables) {
        const cnt = db.prepare(
          `SELECT COUNT(*) AS n FROM ${t.table} WHERE organization_id = ? AND id LIKE ?`
        ).get(orgId, `${t.prefix}%`) as { n: number };
        let deleted = 0;
        const errors: string[] = [];
        if (!dryRun && cnt.n > 0) {
          // Attempt delete row-by-row so FK errors don't abort the whole batch
          const ids = db.prepare(
            `SELECT id FROM ${t.table} WHERE organization_id = ? AND id LIKE ?`
          ).all(orgId, `${t.prefix}%`) as { id: string }[];
          for (const { id } of ids) {
            try {
              db.prepare(`DELETE FROM ${t.table} WHERE id = ?`).run(id);
              deleted++;
            } catch (e: any) {
              errors.push(`${id}: ${e.message}`);
            }
          }
        }
        entityResults[t.label] = { found: cnt.n, deleted, errors };
      }
      result.entities = entityResults;
    }

    db.prepare(`
      INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
      VALUES ('finmap_rollback_last_run', ?, datetime('now'))
    `).run(JSON.stringify({ ran_at: new Date().toISOString(), ...result }));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getFinmapImportStatus(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value, updated_at FROM fin_system_state WHERE key = 'finmap_import_last_run'").get() as any;
    if (!row) return NextResponse.json({ never_run: true });
    let parsed: any = {};
    try { parsed = JSON.parse(row.value); } catch { /* ignore */ }
    // Also count current finmap_import operations
    const cnt = db.prepare(
      "SELECT COUNT(*) AS n FROM fin_operations WHERE source = 'finmap_import'"
    ).get() as { n: number };
    return NextResponse.json({ ...parsed, updated_at: row.updated_at, current_count: cnt.n });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

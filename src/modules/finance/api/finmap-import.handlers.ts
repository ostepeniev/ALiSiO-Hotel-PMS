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

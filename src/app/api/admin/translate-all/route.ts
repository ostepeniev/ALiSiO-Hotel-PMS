/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { retranslateAll } from '@/lib/translate';

/**
 * POST /api/admin/translate-all
 * Translates ALL content: property config, unit-type configs, and services.
 * Pass { force: true } to re-translate even already-translated texts.
 */
export async function POST(request: NextRequest) {
  try {
    let force = false;
    try { const b = await request.json(); force = !!b.force; } catch { /* no body */ }

    const result = await retranslateAll(force);

    return NextResponse.json({
      ok: true,
      translated: result.translated,
      skipped: result.skipped,
      message: `Translated ${result.translated} texts, skipped ${result.skipped} (already done)`,
    });
  } catch (error: any) {
    console.error('POST /api/admin/translate-all error:', error?.message);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { extractTexts, translateAndStore } from '@/lib/translate';

/**
 * POST /api/admin/translate-all
 * Trigger translation of all existing property + unit-type config content.
 * Call this once to populate the translations table, or after major content updates.
 */
export async function POST() {
  try {
    const db = getDb();
    const allTexts = new Set<string>();

    // Collect from property configs
    const propConfigs = db.prepare('SELECT * FROM property_guest_config').all() as any[];
    for (const cfg of propConfigs) {
      extractTexts(cfg).forEach(t => allTexts.add(t));
    }

    // Collect from unit-type configs
    const utConfigs = db.prepare('SELECT * FROM guest_page_config').all() as any[];
    for (const cfg of utConfigs) {
      extractTexts(cfg).forEach(t => allTexts.add(t));
    }

    const texts = Array.from(allTexts);
    console.log(`[translate-all] Found ${texts.length} unique texts to translate`);

    // Force re-translate everything
    await translateAndStore(texts, true);

    return NextResponse.json({
      ok: true,
      textsCount: texts.length,
      message: `Translated ${texts.length} texts to 6 languages`,
    });
  } catch (error: any) {
    console.error('POST /api/admin/translate-all error:', error?.message);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

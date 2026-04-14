/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side translation helper — translates content to all languages on save.
 * Stores results in content_translations table as a dictionary-like cache.
 */
import { getDb } from '@/lib/db';
import crypto from 'crypto';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const LANGUAGES = ['en', 'de', 'cs', 'pl', 'nl', 'fr'] as const;
const LANG_NAMES: Record<string, string> = {
  en: 'English', de: 'German', cs: 'Czech', pl: 'Polish', nl: 'Dutch', fr: 'French',
};

/** Create a stable hash for a text string */
function textHash(text: string): string {
  return crypto.createHash('md5').update(text.trim()).digest('hex');
}

/**
 * Extract all translatable strings from property or unit-type config.
 * Returns unique non-empty strings.
 */
export function extractTexts(config: any): string[] {
  const texts = new Set<string>();
  const add = (t: any) => { if (t && typeof t === 'string' && t.trim()) texts.add(t.trim()); };

  // Rules [{icon, text}]
  try {
    const rules = typeof config.rules === 'string' ? JSON.parse(config.rules) : config.rules;
    if (Array.isArray(rules)) rules.forEach((r: any) => add(r.text));
  } catch { /* skip */ }

  // FAQ [{q, a}]
  try {
    const faq = typeof config.faq_items === 'string' ? JSON.parse(config.faq_items) : config.faq_items;
    if (Array.isArray(faq)) faq.forEach((f: any) => { add(f.q); add(f.a); });
  } catch { /* skip */ }

  // Useful info [{icon, title, desc}]
  try {
    const info = typeof config.useful_info === 'string' ? JSON.parse(config.useful_info) : config.useful_info;
    if (Array.isArray(info)) info.forEach((u: any) => { add(u.title); add(u.desc); });
  } catch { /* skip */ }

  // Amenities [{icon, name}]
  try {
    const amenities = typeof config.amenities === 'string' ? JSON.parse(config.amenities) : config.amenities;
    if (Array.isArray(amenities)) amenities.forEach((a: any) => add(a.name));
  } catch { /* skip */ }

  // Simple text fields  
  add(config.restaurant_name);
  add(config.restaurant_hours);
  add(config.check_in_instructions);
  add(config.parking_info);

  return Array.from(texts);
}

/**
 * Translate an array of texts to ALL supported languages using OpenAI,
 * then store them in the content_translations table.
 * Skips texts that already have translations (unless force=true).
 */
export async function translateAndStore(texts: string[], force = false): Promise<void> {
  if (!OPENAI_KEY || texts.length === 0) return;

  const db = getDb();

  for (const lang of LANGUAGES) {
    // Find which texts need translation for this language
    const toTranslate: string[] = [];
    for (const text of texts) {
      const hash = textHash(text);
      if (!force) {
        const existing = db.prepare('SELECT id FROM content_translations WHERE text_hash = ? AND lang = ?').get(hash, lang) as any;
        if (existing) continue;
      }
      toTranslate.push(text);
    }

    if (toTranslate.length === 0) continue;

    const langName = LANG_NAMES[lang] || lang;

    try {
      // Batch translate — up to 20 texts at a time
      for (let i = 0; i < toTranslate.length; i += 20) {
        const batch = toTranslate.slice(i, i + 20);
        const numbered = batch.map((t, idx) => `[${idx}] ${t}`).join('\n---\n');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            messages: [
              {
                role: 'system',
                content: `You are a professional translator for a hospitality/hotel guest information page. Translate the following Ukrainian texts to ${langName}. Keep all emoji and special characters. Preserve line breaks (\\n). Return ONLY the translations, one per line, prefixed with their index number like [0] translation here. Do not add explanations or extra formatting.`
              },
              { role: 'user', content: numbered },
            ],
          }),
        });

        if (!res.ok) {
          console.error(`[translate] OpenAI error for ${lang}:`, res.status);
          continue;
        }

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || '';

        // Parse and store
        const upsert = db.prepare(`
          INSERT INTO content_translations (text_hash, source_text, lang, translated_text)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (text_hash, lang) DO UPDATE SET
            translated_text = excluded.translated_text,
            source_text = excluded.source_text,
            created_at = datetime('now')
        `);

        const lines = reply.split('\n');
        for (const line of lines) {
          const match = line.match(/^\[(\d+)\]\s*(.*)/);
          if (match) {
            const idx = parseInt(match[1]);
            const translated = match[2].trim();
            if (idx >= 0 && idx < batch.length && translated) {
              upsert.run(textHash(batch[idx]), batch[idx], lang, translated);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[translate] Error translating to ${lang}:`, error?.message);
    }
  }

  console.log(`[translate] Translated ${texts.length} texts to ${LANGUAGES.length} languages`);
}

/**
 * Get all stored translations as a Map for the guest page.
 * Returns: { [textHash]: { en: "...", de: "...", ... } }
 */
export function getStoredTranslations(texts: string[]): Record<string, Record<string, string>> {
  if (texts.length === 0) return {};

  const db = getDb();
  const result: Record<string, Record<string, string>> = {};

  for (const text of texts) {
    const hash = textHash(text);
    const rows = db.prepare('SELECT lang, translated_text FROM content_translations WHERE text_hash = ?').all(hash) as any[];
    if (rows.length > 0) {
      const langMap: Record<string, string> = {};
      for (const row of rows) {
        langMap[row.lang] = row.translated_text;
      }
      result[text] = langMap;
    }
  }

  return result;
}

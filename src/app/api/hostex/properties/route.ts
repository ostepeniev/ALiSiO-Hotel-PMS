/**
 * Hostex Properties API
 * GET - list Hostex properties with mapping status
 */
import { NextResponse } from 'next/server';
import { getProperties } from '@/lib/hostex';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const properties = await getProperties();
    
    // Get mapping from DB
    const db = getDb();
    let mappings: any[] = [];
    try {
      mappings = db.prepare('SELECT * FROM hostex_property_map').all();
    } catch { /* table may not exist yet */ }

    const mappingMap = new Map(mappings.map((m: any) => [m.hostex_property_id, m]));

    const result = properties.map(p => ({
      ...p,
      mapping: mappingMap.get(p.id) || null,
      is_mapped: mappingMap.has(p.id),
    }));

    return NextResponse.json({ properties: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

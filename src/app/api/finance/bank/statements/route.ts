/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const statements = db.prepare(`
      SELECT * FROM bank_statements 
      ORDER BY uploaded_at DESC
    `).all();
    return NextResponse.json(statements);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

/**
 * GET /api/crm/ai/prompts
 * List all prompt configs.
 */
export async function GET(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const prompts = db.prepare(`
      SELECT * FROM crm_prompt_configs 
      ORDER BY stage ASC, version DESC
    `).all();

    return NextResponse.json({ prompts });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/crm/ai/prompts
 * Create or update a prompt config.
 */
export async function POST(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const body = await request.json();
    const { id, name, stage, triggerType, systemPrompt, contextInstructions,
            variables, temperature, model, isActive } = body;

    if (!name || !systemPrompt) {
      return NextResponse.json({ error: 'Missing name or systemPrompt' }, { status: 400 });
    }

    // Get org ID
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    if (!org) {
      return NextResponse.json({ error: 'No organization' }, { status: 500 });
    }

    if (id) {
      // Update existing
      db.prepare(`
        UPDATE crm_prompt_configs SET
          name = ?, stage = ?, trigger_type = ?, system_prompt = ?,
          context_instructions = ?, variables = ?, temperature = ?,
          model = ?, is_active = ?, version = version + 1,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name,
        stage || null,
        triggerType || 'manual',
        systemPrompt,
        contextInstructions || null,
        variables || null,
        temperature ?? 0.7,
        model || 'gpt-4o',
        isActive !== false ? 1 : 0,
        id,
      );

      return NextResponse.json({ success: true, id });
    } else {
      // Create new
      const result = db.prepare(`
        INSERT INTO crm_prompt_configs 
        (organization_id, name, stage, trigger_type, system_prompt,
         context_instructions, variables, temperature, model, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        org.id,
        name,
        stage || null,
        triggerType || 'manual',
        systemPrompt,
        contextInstructions || null,
        variables || null,
        temperature ?? 0.7,
        model || 'gpt-4o',
        isActive !== false ? 1 : 0,
      );

      // Get the inserted ID
      const inserted = db.prepare('SELECT id FROM crm_prompt_configs ORDER BY created_at DESC LIMIT 1').get() as { id: string };

      return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRM Prompts POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/ai/prompts?id=xxx
 * Delete a prompt config.
 */
export async function DELETE(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    db.prepare('DELETE FROM crm_prompt_configs WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

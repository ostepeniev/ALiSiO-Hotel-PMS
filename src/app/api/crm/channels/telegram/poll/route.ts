/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// In-memory offset to avoid duplicate processing
let lastOffset = 0;

/**
 * GET /api/crm/channels/telegram/poll
 * Polls Telegram for callback_query updates with "crm_" prefix.
 * Called every 10 seconds by the cron scheduler.
 * 
 * IMPORTANT: This does NOT interfere with the Python bot because:
 * - We use a very short timeout (1s)
 * - We immediately acknowledge and process only crm_ prefixed callbacks
 * - The Python bot ignores crm_ callbacks (no handler registered)
 */
export async function GET() {
  if (!BOT_TOKEN) {
    return NextResponse.json({ skipped: true, reason: 'No bot token' });
  }

  try {
    // Short poll for updates
    const res = await fetch(`${API_BASE}/getUpdates?offset=${lastOffset}&timeout=1&allowed_updates=["callback_query"]`);
    const data = await res.json();

    if (!data.ok || !data.result?.length) {
      return NextResponse.json({ ok: true, updates: 0 });
    }

    let processed = 0;

    for (const update of data.result) {
      // Always advance offset
      lastOffset = update.update_id + 1;

      const cbq = update.callback_query;
      if (!cbq?.data?.startsWith('crm_')) continue; // Not our callback

      // Parse callback: crm_action_draftId
      const parts = cbq.data.replace('crm_', '').split('_');
      // Handle compound actions like "approve_translated"
      let action: string;
      let draftId: string;

      if (parts.length >= 3 && parts[0] === 'approve' && parts[1] === 'translated') {
        action = 'approve_translated';
        draftId = parts.slice(2).join('_');
      } else if (parts.length >= 2) {
        action = parts[0];
        draftId = parts.slice(1).join('_');
      } else {
        continue;
      }

      console.log(`[TG Poll] Callback: ${action} for draft ${draftId}`);

      // Forward to our callback handler
      try {
        await fetch(`${BASE_URL}/api/crm/channels/telegram/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            draftId,
            callbackQueryId: cbq.id,
          }),
        });
        processed++;
      } catch (err: any) {
        console.error('[TG Poll] Callback forward error:', err.message);
      }
    }

    return NextResponse.json({ ok: true, updates: data.result.length, processed });
  } catch (err: any) {
    console.error('[TG Poll] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

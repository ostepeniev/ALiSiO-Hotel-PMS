/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { translateDraft } from '@/lib/ai/auto-response';
import { editTelegramMessage, answerCallbackQuery } from '@/lib/channels/telegram-bot';
import { sendEmail, getAccountById } from '@/lib/channels/email';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/crm/channels/telegram/callback
 * Process Telegram inline keyboard callback actions for CRM auto-responses.
 * Called by the Telegram callback polling cron.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, draftId, callbackQueryId } = body;

    if (!action || !draftId) {
      return NextResponse.json({ error: 'Missing action or draftId' }, { status: 400 });
    }

    const db = getDb();
    const draft = db.prepare('SELECT * FROM crm_auto_drafts WHERE id = ?').get(draftId) as any;
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    switch (action) {
      case 'translate':
        return await handleTranslate(db, draft, callbackQueryId);
      case 'approve':
        return await handleApprove(db, draft, callbackQueryId, false);
      case 'approve_translated':
        return await handleApprove(db, draft, callbackQueryId, true);
      case 'reject':
        return await handleReject(db, draft, callbackQueryId);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[TG Callback]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ── Translate draft ──────────────────────────────── */
async function handleTranslate(db: any, draft: any, callbackQueryId?: string) {
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '🌍 Перекладаю...');

  const translated = await translateDraft(draft.id);
  if (!translated) {
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }

  // Update Telegram message with translated version
  if (draft.telegram_message_id) {
    const langLabel = draft.target_language?.toUpperCase() || '??';
    const text = [
      `📩 <b>Запит від</b> ${escapeHtml(draft.reply_to_email)}`,
      `📋 <b>Тема:</b> ${escapeHtml(draft.reply_subject || '')}`,
      ``,
      `━━━ Оригінал (UK) ━━━`,
      `<i>${escapeHtml(draft.draft_content_uk.substring(0, 800))}</i>`,
      ``,
      `━━━ Переклад (${langLabel}) ━━━`,
      escapeHtml(translated.substring(0, 2000)),
    ].join('\n');

    const keyboard = [
      [
        { text: '✅ Підтвердити', callback_data: `crm_approve_translated_${draft.id}` },
        { text: '✏️ Змінити', callback_data: `crm_edit_${draft.id}` },
      ],
      [
        { text: '❌ Відхилити', callback_data: `crm_reject_${draft.id}` },
      ],
    ];

    await editTelegramMessage(draft.telegram_message_id, text, keyboard);
  }

  return NextResponse.json({ ok: true, translated: translated.substring(0, 100) });
}

/* ── Approve & Send ─────────────────────────────── */
async function handleApprove(db: any, draft: any, callbackQueryId?: string, useTranslated = false) {
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '✅ Відправляю...');

  const content = useTranslated && draft.draft_content_translated
    ? draft.draft_content_translated
    : draft.draft_content_uk;

  // Build HTML email
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      ${content.replace(/\n/g, '<br>')}
      <br><br>
      <div style="color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px;">
        ALiSiO Resort & Glamping<br>
        <a href="https://www.kempuvek.cz" style="color: #6366f1;">www.kempuvek.cz</a>
      </div>
    </div>
  `;

  // Send via correct email account
  const result = await sendEmail({
    to: draft.reply_to_email,
    subject: draft.reply_subject || 'Re: ALiSiO',
    text: content,
    html: htmlBody,
    inReplyTo: draft.in_reply_to,
    references: draft.in_reply_to,
    accountId: draft.account_id,
  });

  if (!result.success) {
    if (draft.telegram_message_id) {
      await editTelegramMessage(draft.telegram_message_id,
        `❌ <b>Помилка відправки!</b>\n${escapeHtml(draft.reply_to_email)}\nСпробуйте через Inbox.`, []);
    }
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }

  // Save as outbound message
  const msgId = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO crm_messages 
    (id, conversation_id, channel_type, direction, sender_type, sender_name, 
     content, content_type, external_id, status, is_ai_generated, metadata_json)
    VALUES (?, ?, 'email', 'outbound', 'staff', 'AI Assistant', ?, 'text', ?, 'sent', 1, ?)
  `).run(
    msgId, draft.conversation_id, content.substring(0, 10000),
    result.messageId || null,
    JSON.stringify({ accountId: draft.account_id, autoApproved: true }),
  );

  // Update draft status
  db.prepare("UPDATE crm_auto_drafts SET status = 'sent', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  // Update conversation
  db.prepare(`
    UPDATE crm_conversations 
    SET last_message_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(draft.conversation_id);

  // Update Telegram message
  if (draft.telegram_message_id) {
    await editTelegramMessage(draft.telegram_message_id,
      `✅ <b>Відправлено!</b>\n📤 → ${escapeHtml(draft.reply_to_email)}\n📋 ${escapeHtml(draft.reply_subject || '')}\n\n${escapeHtml(content.substring(0, 200))}...`, []);
  }

  return NextResponse.json({ ok: true, sent: true });
}

/* ── Reject draft ──────────────────────────────── */
async function handleReject(db: any, draft: any, callbackQueryId?: string) {
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '❌ Відхилено');

  db.prepare("UPDATE crm_auto_drafts SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  if (draft.telegram_message_id) {
    await editTelegramMessage(draft.telegram_message_id,
      `❌ <b>Відхилено</b>\n📧 ${escapeHtml(draft.reply_to_email)}\n📋 ${escapeHtml(draft.reply_subject || '')}\n\n<s>${escapeHtml(draft.draft_content_uk.substring(0, 100))}...</s>`, []);
  }

  return NextResponse.json({ ok: true, rejected: true });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

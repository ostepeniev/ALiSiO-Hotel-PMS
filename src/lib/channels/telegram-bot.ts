/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Telegram Bot Client — sends CRM notifications via existing @kemptimebot
 * 
 * IMPORTANT: The bot is already running as a Python polling bot.
 * We ONLY use sendMessage/editMessageText API — never getUpdates.
 * Callback queries are handled by polling /api/crm/channels/telegram/poll
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface TelegramResult {
  ok: boolean;
  result?: any;
  description?: string;
}

/* ────────────────────────────────────────────────────────
   Send Message with Inline Keyboard
   ──────────────────────────────────────────────────────── */
export async function sendTelegramMessage(
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<number | null> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] Bot not configured — skipping');
    return null;
  }

  try {
    const body: any = {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    }

    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: TelegramResult = await res.json();
    if (!data.ok) {
      console.error('[Telegram] sendMessage failed:', data.description);
      return null;
    }
    return data.result?.message_id || null;
  } catch (err: any) {
    console.error('[Telegram] sendMessage error:', err.message);
    return null;
  }
}

/* ────────────────────────────────────────────────────────
   Edit Message (update text + keyboard after button press)
   ──────────────────────────────────────────────────────── */
export async function editTelegramMessage(
  messageId: number,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) return false;

  try {
    const body: any = {
      chat_id: CHAT_ID,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    }

    const res = await fetch(`${API_BASE}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: TelegramResult = await res.json();
    if (!data.ok) {
      console.error('[Telegram] editMessage failed:', data.description);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Telegram] editMessage error:', err.message);
    return false;
  }
}

/* ────────────────────────────────────────────────────────
   Answer Callback Query (removes loading spinner on button)
   ──────────────────────────────────────────────────────── */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
      }),
    });
  } catch { /* non-critical */ }
}

/* ────────────────────────────────────────────────────────
   Send CRM Draft Approval Message
   ──────────────────────────────────────────────────────── */
export async function sendDraftApproval(opts: {
  draftId: string;
  guestName: string;
  guestEmail: string;
  subject: string;
  originalQuery: string;
  proposedResponse: string;
  language: string;
  accountLabel: string;
}): Promise<number | null> {
  const queryPreview = opts.originalQuery.substring(0, 500);
  const responsePreview = opts.proposedResponse.substring(0, 2000);

  const text = [
    `📩 <b>Новий запит</b> | ${opts.accountLabel}`,
    ``,
    `👤 <b>${escapeHtml(opts.guestName)}</b> (${escapeHtml(opts.guestEmail)})`,
    `📋 <b>Тема:</b> ${escapeHtml(opts.subject)}`,
    `🌐 <b>Мова:</b> ${opts.language}`,
    ``,
    `━━━ Запит ━━━`,
    `<i>${escapeHtml(queryPreview)}</i>`,
    ``,
    `━━━ Пропоную відповідь (UK) ━━━`,
    escapeHtml(responsePreview),
  ].join('\n');

  const keyboard = [
    [
      { text: '🌍 Перекласти', callback_data: `crm_translate_${opts.draftId}` },
      { text: '✏️ Змінити', callback_data: `crm_edit_${opts.draftId}` },
    ],
    [
      { text: '✅ Відправити як є (UK)', callback_data: `crm_approve_${opts.draftId}` },
      { text: '❌ Відхилити', callback_data: `crm_reject_${opts.draftId}` },
    ],
  ];

  return sendTelegramMessage(text, keyboard);
}

/* ────────────────────────────────────────────────────────
   Escape HTML for Telegram
   ──────────────────────────────────────────────────────── */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

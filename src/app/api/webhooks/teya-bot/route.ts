import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/webhooks/teya-bot
 * 
 * ⚠️ НЕ ВИДАЛЯТИ! Цей endpoint використовується для сповіщення Telegram-бота
 * (@kemptimebot) про успішні платежі Teya.
 * Зареєстрований як webhook у Teya Business Portal для ОБОХ компаній:
 *   - Глемпінг (Alisio Glamping)
 *   - Кемпінг (Alisio Camping)
 * 
 * Webhook отримує події від Teya і відправляє сповіщення в Telegram
 * через Bot API до адмін-чату.
 */

// Використовуємо @kemptimebot (alisio-bot) — НЕ CRM бот
const BOT_TOKEN = process.env.ALISIO_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Webhook public keys для верифікації підпису (RSA)
const WEBHOOK_KEYS: Record<string, string> = {
  camping: process.env.TEYA_CAMPING_WEBHOOK_KEY || '',
  glamping: process.env.TEYA_GLAMPING_WEBHOOK_KEY || '',
};

function verifySignature(body: string, signature: string): boolean {
  if (!signature) return false;

  for (const [, rawKey] of Object.entries(WEBHOOK_KEYS)) {
    if (!rawKey) continue;
    try {
      const pemKey = rawKey.startsWith('-----BEGIN')
        ? rawKey
        : `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`;

      const verifier = crypto.createVerify('SHA256');
      verifier.update(body);
      if (verifier.verify(pemKey, signature, 'base64')) {
        return true;
      }
    } catch {
      // Try next key
    }
  }
  return false;
}

async function sendTelegramMessage(text: string) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn('[Teya-Bot Webhook] ALISIO_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('[Teya-Bot Webhook] Failed to send Telegram message:', err);
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-teya-signature') || '';

    // Verify webhook signature (try both company keys)
    if (signature && !verifySignature(rawBody, signature)) {
      console.error('[Teya-Bot Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type || event.event_type;

    console.log('[Teya-Bot Webhook] Event:', eventType, JSON.stringify(event).slice(0, 500));

    // Determine company from metadata
    const metadata = event.data?.metadata || {};
    const company = metadata.company || 'unknown';
    const companyLabel = company === 'camping' ? '⛺ Кемпінг' : '🏕 Глемпінг';

    switch (eventType) {
      case 'payment.succeeded.v1': {
        const transactionId = event.data?.id || '';
        const sessionId = event.data?.checkout_session_id || '';
        const amount = event.data?.amount?.value || 0;
        const currency = event.data?.amount?.currency || 'CZK';
        const amountCzk = Math.round(amount / 100);

        await sendTelegramMessage(
          `✅ <b>Оплата отримана!</b>\n\n` +
          `💳 ${companyLabel}\n` +
          `💰 Сума: <b>${amountCzk} ${currency}</b>\n` +
          `🆔 Session: <code>${sessionId}</code>\n` +
          `🔗 Transaction: <code>${transactionId}</code>`
        );
        break;
      }

      case 'payment.failed.v1': {
        const sessionId = event.data?.checkout_session_id || '';
        await sendTelegramMessage(
          `❌ <b>Оплата не пройшла</b>\n\n` +
          `💳 ${companyLabel}\n` +
          `🆔 Session: <code>${sessionId}</code>`
        );
        break;
      }

      case 'refund.succeeded.v1': {
        const amount = event.data?.amount || 0;
        const amountCzk = Math.round(amount / 100);
        await sendTelegramMessage(
          `🔄 <b>Повернення коштів</b>\n\n` +
          `💳 ${companyLabel}\n` +
          `💰 Сума: <b>${amountCzk} CZK</b>`
        );
        break;
      }

      default:
        console.log('[Teya-Bot Webhook] Unhandled event:', eventType);
    }

    return NextResponse.json({ received: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya-Bot Webhook] Error:', message);
    return NextResponse.json({ received: true, error: message });
  }
}


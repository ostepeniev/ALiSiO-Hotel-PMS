/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Channel Client (IMAP + SMTP)
 * Supports email.cz (Seznam) and Gmail via standard IMAP/SMTP.
 */
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */
export interface IncomingEmail {
  uid: number;
  messageId: string;
  from: { name: string; address: string };
  to: string;
  subject: string;
  date: Date;
  textBody: string;
  htmlBody?: string;
}

export interface EmailClassification {
  category: 'guest' | 'uncertain' | 'not_guest';
  confidence: number;
  reason: string;
  guestName?: string;
  guestEmail?: string;
  language?: string;
}

/* ────────────────────────────────────────────────────────
   IMAP — Fetch new emails
   ──────────────────────────────────────────────────────── */
export async function fetchNewEmails(sinceDate?: Date): Promise<IncomingEmail[]> {
  const host = process.env.EMAIL_CZ_IMAP_HOST || 'imap.seznam.cz';
  const port = parseInt(process.env.EMAIL_CZ_IMAP_PORT || '993');
  const user = process.env.EMAIL_CZ_USER;
  const pass = process.env.EMAIL_CZ_PASSWORD;
  const folder = process.env.EMAIL_POLL_FOLDER || 'INBOX';

  if (!user || !pass) throw new Error('EMAIL_CZ_USER / EMAIL_CZ_PASSWORD not configured');

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const emails: IncomingEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      // Fetch unseen messages from the last 7 days (or sinceDate)
      const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const searchCriteria = { seen: false, since };

      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        source: true,
        bodyStructure: true,
      });

      for await (const msg of messages) {
        try {
          const envelope = msg.envelope;
          if (!envelope) continue;

          const fromAddr = envelope.from?.[0];
          if (!fromAddr?.address) continue;

          // Parse body from source
          let textBody = '';
          let htmlBody = '';

          if (msg.source) {
            const sourceStr = msg.source.toString();
            // Simple text extraction from source
            textBody = extractTextFromSource(sourceStr);
            if (sourceStr.includes('<html')) {
              htmlBody = extractHtmlFromSource(sourceStr);
            }
          }

          emails.push({
            uid: msg.uid,
            messageId: envelope.messageId || `uid-${msg.uid}`,
            from: {
              name: fromAddr.name || fromAddr.address.split('@')[0],
              address: fromAddr.address,
            },
            to: envelope.to?.[0]?.address || user,
            subject: envelope.subject || '(no subject)',
            date: envelope.date || new Date(),
            textBody: textBody || envelope.subject || '',
            htmlBody: htmlBody || undefined,
          });
        } catch (e) {
          console.error('[Email] Error parsing message:', e);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error('[Email] IMAP connection error:', e);
    try { await client.logout(); } catch { /* */ }
    throw e;
  }

  return emails;
}

/* ────────────────────────────────────────────────────────
   Mark email as read
   ──────────────────────────────────────────────────────── */
export async function markEmailAsRead(uid: number): Promise<void> {
  const host = process.env.EMAIL_CZ_IMAP_HOST || 'imap.seznam.cz';
  const port = parseInt(process.env.EMAIL_CZ_IMAP_PORT || '993');
  const user = process.env.EMAIL_CZ_USER!;
  const pass = process.env.EMAIL_CZ_PASSWORD!;
  const folder = process.env.EMAIL_POLL_FOLDER || 'INBOX';

  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error('[Email] Error marking as read:', e);
    try { await client.logout(); } catch { /* */ }
  }
}

/* ────────────────────────────────────────────────────────
   SMTP — Send email
   ──────────────────────────────────────────────────────── */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ messageId: string; success: boolean }> {
  const host = process.env.EMAIL_CZ_SMTP_HOST || 'smtp.seznam.cz';
  const port = parseInt(process.env.EMAIL_CZ_SMTP_PORT || '465');
  const user = process.env.EMAIL_CZ_USER;
  const pass = process.env.EMAIL_CZ_PASSWORD;

  if (!user || !pass) throw new Error('EMAIL_CZ_USER / EMAIL_CZ_PASSWORD not configured');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: true, // SSL
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `"ALiSiO Resort" <${user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
    });

    return { messageId: info.messageId, success: true };
  } catch (err) {
    console.error('[Email] SMTP send error:', err);
    return { messageId: '', success: false };
  }
}

/* ────────────────────────────────────────────────────────
   Blacklist filter
   ──────────────────────────────────────────────────────── */
export function isBlacklisted(email: IncomingEmail): boolean {
  const blacklistStr = process.env.EMAIL_BLACKLIST_DOMAINS || '';
  const blacklist = blacklistStr.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

  const senderDomain = email.from.address.split('@')[1]?.toLowerCase() || '';
  const senderAddr = email.from.address.toLowerCase();

  for (const rule of blacklist) {
    if (senderDomain.includes(rule) || senderAddr.includes(rule)) return true;
  }

  // Also skip obvious system emails
  const systemPatterns = [
    'mailer-daemon', 'postmaster', 'no-reply', 'noreply',
    'donotreply', 'notifications@', 'alert@', 'newsletter',
  ];
  for (const p of systemPatterns) {
    if (senderAddr.includes(p)) return true;
  }

  return false;
}

/* ────────────────────────────────────────────────────────
   AI Classification
   ──────────────────────────────────────────────────────── */
export async function classifyEmail(email: IncomingEmail): Promise<EmailClassification> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback — treat as uncertain
    return { category: 'uncertain', confidence: 0.5, reason: 'No AI key', guestName: email.from.name, guestEmail: email.from.address };
  }

  const client = new OpenAI({ apiKey });

  const prompt = `Classify this incoming email to a hotel/resort (ALiSiO Resort & Glamping in Luhačovice, Czech Republic).

FROM: ${email.from.name} <${email.from.address}>
SUBJECT: ${email.subject}
BODY (first 500 chars):
${email.textBody.substring(0, 500)}

Classify into ONE category:
- "guest" = This is from a potential or existing guest (booking inquiry, reservation question, check-in info, complaint, review, availability request, price question)
- "uncertain" = Unclear if guest or not (could be either)
- "not_guest" = Definitely NOT a guest (supplier invoice, newsletter, system notification, spam, marketing, internal communication, service provider)

Respond ONLY with valid JSON:
{
  "category": "guest" | "uncertain" | "not_guest",
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "guestName": "extracted guest name if available",
  "language": "detected language code (cs/en/de/uk/ru/etc)"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { category: 'uncertain', confidence: 0.5, reason: 'Empty AI response', guestEmail: email.from.address };

    const parsed = JSON.parse(content) as EmailClassification;
    parsed.guestEmail = email.from.address;
    if (!parsed.guestName) parsed.guestName = email.from.name;
    return parsed;
  } catch (err) {
    console.error('[Email AI] Classification error:', err);
    return { category: 'uncertain', confidence: 0.3, reason: 'AI error', guestName: email.from.name, guestEmail: email.from.address };
  }
}

/* ────────────────────────────────────────────────────────
   Helpers — extract text from raw email source
   ──────────────────────────────────────────────────────── */
function extractTextFromSource(source: string): string {
  // Try to extract plain text part
  const textMatch = source.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
  if (textMatch?.[1]) {
    return decodeEmailBody(textMatch[1].trim());
  }

  // Fallback — strip HTML tags if only HTML available
  const htmlMatch = source.match(/Content-Type:\s*text\/html[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
  if (htmlMatch?.[1]) {
    return decodeEmailBody(htmlMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  // Last resort — take everything after headers
  const headerEnd = source.indexOf('\r\n\r\n');
  if (headerEnd > 0) {
    return source.substring(headerEnd + 4, headerEnd + 2000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

function extractHtmlFromSource(source: string): string {
  const htmlMatch = source.match(/Content-Type:\s*text\/html[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
  return htmlMatch?.[1] ? decodeEmailBody(htmlMatch[1].trim()) : '';
}

function decodeEmailBody(body: string): string {
  // Handle quoted-printable
  if (body.includes('=\r\n') || body.includes('=\n') || body.includes('=3D')) {
    body = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  // Handle base64
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(body.replace(/\s/g, '')) && body.length > 20) {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
    } catch { /* not base64 */ }
  }
  return body;
}

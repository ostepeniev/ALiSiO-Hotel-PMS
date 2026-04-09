/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fetchNewEmailsAllAccounts, isBlacklisted, classifyEmail, markEmailAsRead, getAccountById } from '@/lib/channels/email';
import type { IncomingEmail } from '@/lib/channels/email';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/crm/channels/email/poll
 * Poll ALL configured email accounts, classify, and create CRM leads/messages.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (process.env.EMAIL_POLL_SECRET && secret !== process.env.EMAIL_POLL_SECRET) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();
  const results = {
    fetched: 0,
    blacklisted: 0,
    classified_guest: 0,
    classified_uncertain: 0,
    classified_not_guest: 0,
    leads_created: 0,
    messages_added: 0,
    errors: [] as string[],
  };

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Track processed email IDs (to avoid re-classifying not_guest emails that stay unread)
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_processed (
        message_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    // Cleanup old entries (older than 30 days)
    db.prepare("DELETE FROM email_processed WHERE created_at < datetime('now', '-30 days')").run();

    // Get last poll timestamp
    const lastPoll = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'email_last_poll'"
    ).get() as { value: string } | undefined;

    const sinceDate = lastPoll?.value
      ? new Date(lastPoll.value)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch from ALL accounts
    console.log('[Email Poll] Fetching since:', sinceDate.toISOString());
    const emails = await fetchNewEmailsAllAccounts(sinceDate);
    results.fetched = emails.length;

    // Process each email
    for (const email of emails) {
      try {
        await processEmail(email, db, results);
      } catch (err: any) {
        results.errors.push(`${email.from.address}: ${err.message}`);
      }
    }

    // Update last poll timestamp
    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES ('email_last_poll', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')
    `).run();

    console.log('[Email Poll] Results:', results);
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[Email Poll] Fatal error:', err);
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────
   Process a single email
   ──────────────────────────────────────────────────────── */
async function processEmail(email: IncomingEmail, db: any, results: any) {
  // 1. Check if already processed (in CRM messages OR in processed tracker)
  const existing = db.prepare(
    "SELECT id FROM crm_messages WHERE external_id = ?"
  ).get(email.messageId);
  if (existing) return;

  const alreadyProcessed = db.prepare(
    "SELECT category FROM email_processed WHERE message_id = ?"
  ).get(email.messageId);
  if (alreadyProcessed) return; // Already classified in a previous poll

  // 2. Get the account for marking as read
  const account = getAccountById(email.accountId);

  // 3. Blacklist check — DON'T mark as read, leave unread in mailbox
  if (isBlacklisted(email)) {
    results.blacklisted++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'blacklisted')").run(email.messageId);
    return;
  }

  // 4. AI Classification
  const classification = await classifyEmail(email);
  console.log(`[Email:${email.accountId}] ${email.from.address} → ${classification.category} (${classification.confidence}) — ${classification.reason}`);

  if (classification.category === 'not_guest') {
    results.classified_not_guest++;
    // DON'T mark as read — leave unread so user doesn't miss important non-guest emails
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'not_guest')").run(email.messageId);
    return;
  }

  if (classification.category === 'uncertain') {
    results.classified_uncertain++;
  } else {
    results.classified_guest++;
  }

  // 5. Find or create lead
  const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string };
  const orgId = orgRow.id;

  let lead = db.prepare(
    "SELECT id, stage FROM crm_leads WHERE email = ? AND organization_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(email.from.address, orgId) as any;

  if (!lead) {
    const leadId = crypto.randomBytes(16).toString('hex');
    const guestName = classification.guestName || email.from.name || email.from.address.split('@')[0];
    const nameParts = guestName.split(/\s+/);
    const firstName = nameParts[0] || guestName;
    const lastName = nameParts.slice(1).join(' ') || null;

    // Use a channel_id based on which account received
    const channelId = email.accountId === 'gmail' ? 'ch_gmail' : 'ch_email_main';

    db.prepare(`
      INSERT INTO crm_leads (id, organization_id, channel_id, first_name, last_name, email, source, stage, priority)
      VALUES (?, ?, ?, ?, ?, ?, 'email', 'new', ?)
    `).run(
      leadId, orgId, channelId, firstName, lastName, email.from.address,
      classification.category === 'uncertain' ? 'low' : 'normal'
    );

    lead = { id: leadId, stage: 'new' };
    results.leads_created++;
  }

  // 6. Find or create conversation
  let conv = db.prepare(
    "SELECT id FROM crm_conversations WHERE lead_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1"
  ).get(lead.id) as any;

  if (!conv) {
    const convId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO crm_conversations (id, lead_id, subject, status, last_message_at, last_channel)
      VALUES (?, ?, ?, 'active', datetime('now'), 'email')
    `).run(convId, lead.id, email.subject);
    conv = { id: convId };
  }

  // 7. Create message — include accountId in metadata for reply routing
  const msgId = crypto.randomBytes(16).toString('hex');
  const content = email.textBody || email.subject || '(empty)';
  const accountLabel = email.accountId === 'gmail' ? '📧G' : '📧';

  db.prepare(`
    INSERT INTO crm_messages (id, conversation_id, channel_type, direction, sender_type, sender_name, content, content_type, external_id, status, created_at, metadata_json)
    VALUES (?, ?, 'email', 'inbound', 'guest', ?, ?, 'text', ?, 'delivered', ?, ?)
  `).run(
    msgId, conv.id,
    email.from.name || email.from.address,
    content.substring(0, 10000),
    email.messageId,
    email.date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
    JSON.stringify({
      subject: email.subject,
      from: email.from.address,
      to: email.to,
      accountId: email.accountId,
      classification: classification.category,
      confidence: classification.confidence,
      language: classification.language,
    }),
  );

  // 8. Update conversation & lead
  db.prepare(`
    UPDATE crm_conversations 
    SET last_message_at = datetime('now'), last_channel = 'email', 
        unread_count = unread_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(conv.id);

  db.prepare(`
    UPDATE crm_leads 
    SET last_message_at = datetime('now'), 
        last_message_preview = ?,
        unread_count = unread_count + 1,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    `${accountLabel} ${email.subject}`.substring(0, 100),
    lead.id,
  );

  // 9. Mark as read in IMAP
  if (account) await markEmailAsRead(email.uid, account);
  results.messages_added++;
}

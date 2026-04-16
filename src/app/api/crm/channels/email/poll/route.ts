/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fetchNewEmailsAllAccounts, isBlacklisted, classifyEmail, markEmailAsRead, getAccountById } from '@/lib/channels/email';
import type { IncomingEmail } from '@/lib/channels/email';
import { parseBookingComEmail, cleanBookingComBody } from '@/lib/channels/booking-com-parser';
import { generateAutoResponse } from '@/lib/ai/auto-response';
import { findOrCreateGuestForLead } from '@/lib/sync/guest-lead-sync';
import { onInboundMessage } from '@/lib/crm/stage-transitions';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/crm/channels/email/poll
 * Polls all configured email accounts for new messages.
 * Classifies them, creates leads/conversations, and stores messages.
 */
export async function GET(req: NextRequest) {
  const results = {
    fetched: 0, blacklisted: 0,
    classified_guest: 0, classified_uncertain: 0, classified_not_guest: 0,
    leads_created: 0, leads_linked: 0, messages_added: 0,
    booking_com_parsed: 0,
    errors: [] as string[],
  };

  try {
    const db = getDb();

    // Get last poll time
    const lastPoll = db.prepare(
      "SELECT value FROM settings WHERE key = 'crm_email_last_poll'"
    ).get() as { value: string } | undefined;

    const sinceDate = lastPoll?.value
      ? new Date(lastPoll.value)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const emails = await fetchNewEmailsAllAccounts(sinceDate);
    results.fetched = emails.length;

    // Process each email
    for (const email of emails) {
      try {
        await processEmail(email, db, results);
      } catch (err: any) {
        console.error(`[Email Poll] Error processing ${email.from.address}:`, err.message);
        results.errors.push(`${email.from.address}: ${err.message}`);
      }
    }

    // Update last poll time
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('crm_email_last_poll', datetime('now'))
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
  // 1. Check if already processed
  const existing = db.prepare(
    "SELECT id FROM crm_messages WHERE external_id = ?"
  ).get(email.messageId);
  if (existing) return;

  const alreadyProcessed = db.prepare(
    "SELECT category FROM email_processed WHERE message_id = ?"
  ).get(email.messageId);
  if (alreadyProcessed) return;

  // 2. Get the account for marking as read
  const account = getAccountById(email.accountId);

  // 3. Blacklist check
  if (isBlacklisted(email)) {
    results.blacklisted++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'blacklisted')").run(email.messageId);
    return;
  }

  // 4. Parse Booking.com data BEFORE AI classification
  const bookingData = parseBookingComEmail(email.textBody, email.from.address, email.subject);

  // 5. AI Classification (skip for obvious Booking.com messages)
  let classification;
  if (bookingData.isBookingCom) {
    // Booking.com messages are always guest-related
    classification = {
      category: 'guest' as const,
      confidence: 1.0,
      reason: 'Booking.com notification',
      guestName: bookingData.guestName || email.from.name,
      language: bookingData.language || 'en',
    };
    results.booking_com_parsed++;
  } else {
    classification = await classifyEmail(email);
  }

  console.log(`[Email:${email.accountId}] ${email.from.address} → ${classification.category} (${classification.confidence}) — ${classification.reason}${bookingData.isBookingCom ? ' [Booking.com]' : ''}`);

  if (classification.category === 'not_guest') {
    results.classified_not_guest++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'not_guest')").run(email.messageId);
    return;
  }

  if (classification.category === 'uncertain') {
    results.classified_uncertain++;
  } else {
    results.classified_guest++;
  }

  // 6. Find or create lead — ENHANCED with multi-field matching
  const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string };
  const orgId = orgRow.id;

  const lead = await findOrCreateLeadSmart(db, email, bookingData, classification, orgId, results);

  // 7. For Booking.com: enrich lead with parsed data
  if (bookingData.isBookingCom && lead.id) {
    enrichLeadWithBookingData(db, lead.id, bookingData);
  }

  // 8. Find or create conversation
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

  // 9. Create message — use cleaned content for Booking.com
  const msgId = crypto.randomBytes(16).toString('hex');
  let content = email.textBody || email.subject || '(empty)';
  
  if (bookingData.isBookingCom) {
    content = cleanBookingComBody(email.textBody, bookingData);
  }

  const accountLabel = email.accountId === 'gmail' ? '📧G' : '📧';

  db.prepare(`
    INSERT INTO crm_messages (id, conversation_id, channel_type, direction, sender_type, sender_name, content, content_type, external_id, status, created_at, metadata_json)
    VALUES (?, ?, 'email', 'inbound', 'guest', ?, ?, 'text', ?, 'delivered', ?, ?)
  `).run(
    msgId, conv.id,
    bookingData.guestName || email.from.name || email.from.address,
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
      ...(bookingData.isBookingCom ? {
        bookingCom: true,
        confirmationId: bookingData.confirmationId,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        totalGuests: bookingData.totalGuests,
        propertyName: bookingData.propertyName,
      } : {}),
    }),
  );

  // 10. Update conversation & lead
  db.prepare(`
    UPDATE crm_conversations 
    SET last_message_at = datetime('now'), last_channel = 'email', 
        unread_count = unread_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(conv.id);

  const previewPrefix = bookingData.isBookingCom ? '🅱️ ' : `${accountLabel} `;
  db.prepare(`
    UPDATE crm_leads 
    SET last_message_at = datetime('now'), 
        last_message_preview = ?,
        unread_count = unread_count + 1,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    `${previewPrefix}${bookingData.guestMessage || email.subject}`.substring(0, 100),
    lead.id,
  );

  // AUTO STAGE TRANSITION: guest sent message → advance stage
  if (!lead.isNew) {
    onInboundMessage(lead.id, lead.stage);
  }

  // 11. Mark as read in IMAP
  if (account) await markEmailAsRead(email.uid, account);
  results.messages_added++;

  // 12. Generate AI auto-response draft
  try {
    await generateAutoResponse({
      messageId: msgId,
      conversationId: conv.id,
      leadId: lead.id,
      accountId: email.accountId,
      guestName: bookingData.guestName || email.from.name || email.from.address,
      guestEmail: email.from.address,
      subject: email.subject,
      content: content,
      language: classification.language || 'en',
    });
  } catch (autoErr: any) {
    console.error(`[AutoResponse] Non-fatal error:`, autoErr.message);
  }

  // Record processed
  db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, ?)").run(email.messageId, classification.category);
}

/* ────────────────────────────────────────────────────────
   Smart lead finder — multi-field matching
   
   Priority:
   1. Match by external_booking_id (Booking.com confirmation)
   2. Match by email 
   3. Match by name + dates (Booking.com guests without email)
   4. Create new lead
   
   If an existing reservation is found, link lead to it.
   ──────────────────────────────────────────────────────── */
async function findOrCreateLeadSmart(
  db: any, email: IncomingEmail, bookingData: any,
  classification: any, orgId: string, results: any
): Promise<{ id: string; stage: string; isNew: boolean }> {
  
  // --- 1. Try to find by Booking.com confirmation ID ---
  if (bookingData.confirmationId) {
    // Check CRM leads first
    const leadByBooking = db.prepare(
      "SELECT id, stage FROM crm_leads WHERE external_booking_id = ? AND organization_id = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(bookingData.confirmationId, orgId) as any;
    
    if (leadByBooking) {
      console.log(`[Lead Match] Found lead by booking ID ${bookingData.confirmationId}: ${leadByBooking.id}`);
      return { id: leadByBooking.id, stage: leadByBooking.stage, isNew: false };
    }

    // Check existing reservations
    const reservation = db.prepare(
      "SELECT id, guest_id, status FROM reservations WHERE external_uid = ? OR bcom_reservation_id = ? LIMIT 1"
    ).get(bookingData.confirmationId, bookingData.confirmationId) as any;

    if (reservation) {
      console.log(`[Lead Match] Found reservation ${reservation.id} by booking ID ${bookingData.confirmationId}`);
      // Find or create lead linked to this reservation
      return linkOrCreateLeadForReservation(db, reservation, email, bookingData, classification, orgId, results);
    }
  }

  // --- 2. Try to find by email address ---
  if (email.from.address) {
    const leadByEmail = db.prepare(
      "SELECT id, stage FROM crm_leads WHERE email = ? AND organization_id = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(email.from.address, orgId) as any;

    if (leadByEmail) {
      // If we now have a booking ID, update the lead
      if (bookingData.confirmationId && !db.prepare("SELECT external_booking_id FROM crm_leads WHERE id = ?").get(leadByEmail.id)?.external_booking_id) {
        db.prepare("UPDATE crm_leads SET external_booking_id = ?, updated_at = datetime('now') WHERE id = ?")
          .run(bookingData.confirmationId, leadByEmail.id);
      }
      return { id: leadByEmail.id, stage: leadByEmail.stage, isNew: false };
    }
  }

  // --- 3. For Booking.com: try by guest name + check-in date ---
  if (bookingData.isBookingCom && bookingData.guestName && bookingData.checkIn) {
    const nameParts = bookingData.guestName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    if (firstName && lastName) {
      // Check leads by name
      const leadByName = db.prepare(
        "SELECT id, stage FROM crm_leads WHERE first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE AND organization_id = ? AND check_in_date = ? LIMIT 1"
      ).get(firstName, lastName, orgId, bookingData.checkIn) as any;

      if (leadByName) {
        console.log(`[Lead Match] Found lead by name+date: ${firstName} ${lastName} @ ${bookingData.checkIn}`);
        return { id: leadByName.id, stage: leadByName.stage, isNew: false };
      }

      // Check reservations by guest name + dates
      const guestReservation = db.prepare(`
        SELECT r.id, r.guest_id, r.status 
        FROM reservations r 
        JOIN guests g ON g.id = r.guest_id
        WHERE g.first_name = ? COLLATE NOCASE AND g.last_name = ? COLLATE NOCASE AND r.check_in = ?
        LIMIT 1
      `).get(firstName, lastName, bookingData.checkIn) as any;

      if (guestReservation) {
        console.log(`[Lead Match] Found reservation by guest name+date: ${firstName} ${lastName}`);
        return linkOrCreateLeadForReservation(db, guestReservation, email, bookingData, classification, orgId, results);
      }
    }
  }

  // --- 4. Create new lead ---
  const leadId = crypto.randomBytes(16).toString('hex');
  const guestName = bookingData.guestName || classification.guestName || email.from.name || email.from.address.split('@')[0];
  const nameParts = guestName.split(/\s+/);
  const firstName = nameParts[0] || guestName;
  const lastName = nameParts.slice(1).join(' ') || null;

  const channelId = email.accountId === 'gmail' ? 'ch_gmail' : 'ch_email_main';
  const source = bookingData.isBookingCom ? 'booking_com' : 'email';

  db.prepare(`
    INSERT INTO crm_leads (id, organization_id, channel_id, first_name, last_name, email, source, stage, priority, language, external_booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
  `).run(
    leadId, orgId, channelId, firstName, lastName, 
    email.from.address,
    source,
    classification.category === 'uncertain' ? 'low' : 'normal',
    classification.language || bookingData.language || null,
    bookingData.confirmationId || null,
  );

  // Create guest record 
  findOrCreateGuestForLead(leadId);

  results.leads_created++;
  console.log(`[Lead] Created new lead: ${firstName} ${lastName || ''} (${source})${bookingData.confirmationId ? ` [Booking #${bookingData.confirmationId}]` : ''}`);

  return { id: leadId, stage: 'new', isNew: true };
}

/* ────────────────────────────────────────────────────────
   Link lead to existing reservation
   ──────────────────────────────────────────────────────── */
function linkOrCreateLeadForReservation(
  db: any, reservation: any, email: IncomingEmail,
  bookingData: any, classification: any, orgId: string, results: any
): { id: string; stage: string; isNew: boolean } {

  // Check if there's already a lead for this reservation
  const existingLead = db.prepare(
    "SELECT id, stage FROM crm_leads WHERE reservation_id = ? LIMIT 1"
  ).get(reservation.id) as any;

  if (existingLead) {
    console.log(`[Lead Link] Using existing lead ${existingLead.id} for reservation ${reservation.id}`);
    return { id: existingLead.id, stage: existingLead.stage, isNew: false };
  }

  // Map reservation status to lead stage
  const stageMap: Record<string, string> = {
    'confirmed': 'booked',
    'checked_in': 'in_stay',
    'checked_out': 'post_stay',
    'cancelled': 'lost',
    'no_show': 'lost',
    'pending': 'inquiry',
  };
  const stage = stageMap[reservation.status] || 'booked';

  // Create lead linked to reservation
  const leadId = crypto.randomBytes(16).toString('hex');
  const guestName = bookingData.guestName || classification.guestName || email.from.name;
  const nameParts = (guestName || '').split(/\s+/);
  const firstName = nameParts[0] || email.from.address.split('@')[0];
  const lastName = nameParts.slice(1).join(' ') || null;

  const channelId = email.accountId === 'gmail' ? 'ch_gmail' : 'ch_email_main';
  const source = bookingData.isBookingCom ? 'booking_com' : 'email';

  db.prepare(`
    INSERT INTO crm_leads (id, organization_id, channel_id, first_name, last_name, email, source, stage, priority, language, external_booking_id, reservation_id, guest_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId, orgId, channelId, firstName, lastName,
    email.from.address, source, stage,
    'normal',
    classification.language || bookingData.language || null,
    bookingData.confirmationId || null,
    reservation.id,
    reservation.guest_id || null,
  );

  results.leads_created++;
  results.leads_linked++;
  console.log(`[Lead Link] Created lead ${leadId} linked to reservation ${reservation.id} (stage: ${stage})`);

  return { id: leadId, stage, isNew: true };
}

/* ────────────────────────────────────────────────────────
   Enrich lead with Booking.com parsed data
   ──────────────────────────────────────────────────────── */
function enrichLeadWithBookingData(db: any, leadId: string, data: any): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.checkIn) {
    updates.push('check_in_date = COALESCE(check_in_date, ?)');
    values.push(data.checkIn);
  }
  if (data.checkOut) {
    updates.push('check_out_date = COALESCE(check_out_date, ?)');
    values.push(data.checkOut);
  }
  if (data.totalGuests) {
    updates.push('adults = CASE WHEN adults = 0 OR adults IS NULL THEN ? ELSE adults END');
    values.push(data.totalGuests);
  }
  if (data.confirmationId) {
    updates.push('external_booking_id = COALESCE(external_booking_id, ?)');
    values.push(data.confirmationId);
  }
  if (data.categoryType) {
    updates.push('unit_type_preference = COALESCE(unit_type_preference, ?)');
    values.push(data.categoryType);
  }
  if (data.firstName) {
    updates.push('first_name = COALESCE(NULLIF(first_name, \'\'), ?)');
    values.push(data.firstName);
  }
  if (data.lastName) {
    updates.push('last_name = COALESCE(NULLIF(last_name, \'\'), ?)');
    values.push(data.lastName);
  }

  if (updates.length > 0) {
    updates.push("source = CASE WHEN source = 'email' THEN 'booking_com' ELSE source END");
    updates.push("updated_at = datetime('now')");
    values.push(leadId);
    db.prepare(`UPDATE crm_leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    console.log(`[Lead Enrich] Updated lead ${leadId} with Booking.com data (${updates.length - 2} fields)`);
  }
}

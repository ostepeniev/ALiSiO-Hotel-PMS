/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Channel Dispatcher
 * Routes outbound messages through the appropriate channel (email, whatsapp, etc.)
 */
import { sendEmail } from '@/lib/channels/email';
import { getDb } from '@/lib/db';

export interface DispatchResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

/**
 * Dispatch a message through the specified channel.
 */
export async function dispatchMessage(opts: {
  channelType: string;
  leadId: string;
  conversationId: string;
  content: string;
  senderName?: string;
}): Promise<DispatchResult> {
  const { channelType, leadId, content, senderName } = opts;
  const db = getDb();

  switch (channelType) {
    case 'email':
      return await dispatchEmail(db, leadId, opts.conversationId, content, senderName);
    case 'whatsapp':
      // TODO: Phase 4.2 — WhatsApp Cloud API
      return { success: false, error: 'WhatsApp not configured yet' };
    case 'manual':
      return { success: true }; // No external dispatch needed
    case 'phone':
      return { success: true }; // Just logged, no actual dispatch
    default:
      return { success: true }; // Other channels — just log
  }
}

/**
 * Dispatch via email (SMTP)
 */
async function dispatchEmail(
  db: any,
  leadId: string,
  conversationId: string,
  content: string,
  senderName?: string,
): Promise<DispatchResult> {
  // Get lead email
  const lead = db.prepare(
    "SELECT email, first_name, last_name FROM crm_leads WHERE id = ?"
  ).get(leadId) as any;

  if (!lead?.email) {
    return { success: false, error: 'Lead has no email address' };
  }

  // Get conversation subject from last inbound email
  const lastInbound = db.prepare(`
    SELECT metadata_json, external_id FROM crm_messages 
    WHERE conversation_id = ? AND direction = 'inbound' AND channel_type = 'email'
    ORDER BY created_at DESC LIMIT 1
  `).get(conversationId) as any;

  let subject = 'ALiSiO Resort & Glamping';
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (lastInbound?.metadata_json) {
    try {
      const meta = JSON.parse(lastInbound.metadata_json);
      if (meta.subject) {
        subject = meta.subject.startsWith('Re:') ? meta.subject : `Re: ${meta.subject}`;
      }
    } catch { /* */ }
  }
  if (lastInbound?.external_id) {
    inReplyTo = lastInbound.external_id;
    references = lastInbound.external_id;
  }

  // Format email body
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      ${content.replace(/\n/g, '<br>')}
      <br><br>
      <div style="color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px;">
        ${senderName || 'ALiSiO Resort & Glamping'}<br>
        <a href="https://www.kempuvek.cz" style="color: #6366f1;">www.kempuvek.cz</a>
      </div>
    </div>
  `;

  const result = await sendEmail({
    to: lead.email,
    subject,
    text: content,
    html: htmlBody,
    inReplyTo,
    references,
  });

  if (result.success) {
    return { success: true, externalId: result.messageId };
  }
  return { success: false, error: 'SMTP send failed' };
}

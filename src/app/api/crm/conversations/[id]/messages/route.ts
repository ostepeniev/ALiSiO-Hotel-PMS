import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dispatchMessage } from '@/lib/channels/dispatcher';
import crypto from 'crypto';

/* ================================================================
   POST /api/crm/conversations/[id]/messages — Send a message
   ================================================================ */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const db = getDb();
    const body = await request.json();

    const {
      channelType = 'manual',
      direction = 'outbound',
      senderType = 'staff',
      senderId,
      senderName,
      content,
      contentType = 'text',
      metadataJson,
      isAiGenerated = false,
    } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Verify conversation exists
    const conv = db.prepare('SELECT * FROM crm_conversations WHERE id = ?').get(conversationId) as any;
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Dispatch through real channel if outbound
    let externalId: string | undefined;
    let status = 'sent';
    if (direction === 'outbound' && channelType === 'email') {
      const result = await dispatchMessage({
        channelType,
        leadId: conv.lead_id,
        conversationId,
        content,
        senderName: senderName || undefined,
      });
      if (!result.success) {
        console.error('[CRM Message] Dispatch failed:', result.error);
        status = 'failed';
      } else {
        externalId = result.externalId;
        status = 'delivered';
      }
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const msgId = crypto.randomBytes(8).toString('hex');

    db.prepare(`
      INSERT INTO crm_messages (
        id, conversation_id, channel_type, direction, sender_type,
        sender_id, sender_name, content, content_type, metadata_json,
        is_ai_generated, external_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId, conversationId, channelType, direction, senderType,
      senderId || null, senderName || null, content, contentType,
      metadataJson || null, isAiGenerated ? 1 : 0,
      externalId || null, status, now
    );

    // Update conversation
    db.prepare(`
      UPDATE crm_conversations SET 
        last_message_at = ?, 
        last_channel = ?,
        unread_count = CASE WHEN ? = 'inbound' THEN unread_count + 1 ELSE unread_count END,
        updated_at = ?
      WHERE id = ?
    `).run(now, channelType, direction, now, conversationId);

    // Update lead
    const preview = content.substring(0, 100);
    db.prepare(`
      UPDATE crm_leads SET 
        last_message_at = ?,
        last_message_preview = ?,
        unread_count = CASE WHEN ? = 'inbound' THEN unread_count + 1 ELSE unread_count END,
        updated_at = ?
      WHERE id = ?
    `).run(now, preview, direction, now, conv.lead_id);

    const message = db.prepare('SELECT * FROM crm_messages WHERE id = ?').get(msgId);
    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    console.error('[CRM Message POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


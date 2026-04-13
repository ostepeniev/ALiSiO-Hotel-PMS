/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/guest/[token]/chat — load chat messages
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;

    const reservation = db.prepare(
      'SELECT id FROM reservations WHERE guest_page_token = ?'
    ).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const messages = db.prepare(
      'SELECT id, sender, message, created_at FROM guest_chat_messages WHERE reservation_id = ? ORDER BY created_at ASC'
    ).all(reservation.id);

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('GET /api/guest/[token]/chat error:', error?.message);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}

// POST /api/guest/[token]/chat — send a message
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;
    const { message, sender } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
    }

    const reservation = db.prepare(
      'SELECT r.id, r.guest_id, g.first_name, g.last_name, r.unit_id FROM reservations r LEFT JOIN guests g ON r.guest_id = g.id WHERE r.guest_page_token = ?'
    ).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Save message
    db.prepare(
      'INSERT INTO guest_chat_messages (id, reservation_id, sender, message) VALUES (lower(hex(randomblob(16))), ?, ?, ?)'
    ).run(reservation.id, sender || 'guest', message.trim());

    // Try to send Telegram notification for guest messages
    if ((sender || 'guest') === 'guest') {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (botToken && chatId) {
          const guestName = `${reservation.first_name || ''} ${reservation.last_name || ''}`.trim() || 'Guest';
          const text = `💬 *Повідомлення від гостя*\n\n👤 ${guestName}\n📝 ${message.trim()}`;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
          });
        }
      } catch { /* Telegram notify silently fails */ }
    }

    // Return all messages
    const messages = db.prepare(
      'SELECT id, sender, message, created_at FROM guest_chat_messages WHERE reservation_id = ? ORDER BY created_at ASC'
    ).all(reservation.id);

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/chat error:', error?.message);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

import { getDb } from '@/lib/db';
import { generateICal } from '@/lib/ical';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/ical-export/[token] — generate iCal feed for a channel's units.
 * This URL is given to OTA platforms so they can import our calendar.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = getDb();

    // Find channel by export token
    const channel = db.prepare('SELECT * FROM ical_channels WHERE export_token = ?').get(token) as any;
    if (!channel) {
      // Return empty but valid iCal if token not found
      const emptyIcal = generateICal([], 'ALiSiO — Unknown');
      return new Response(emptyIcal, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Get unit IDs this channel covers
    let unitIds: string[] = [];
    let calName: string = 'ALiSiO';

    if (channel.channel_type === 'building') {
      const building = db.prepare('SELECT name FROM buildings WHERE id = ?').get(channel.building_id) as any;
      calName = `ALiSiO — ${building?.name || 'Building'}`;
      const units = db.prepare('SELECT id FROM units WHERE building_id = ?').all(channel.building_id) as any[];
      unitIds = units.map((u: any) => u.id);
    } else {
      const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(channel.unit_id) as any;
      calName = `ALiSiO — ${unit?.name || 'Unit'}`;
      unitIds = [channel.unit_id];
    }

    // If no units found, return empty but valid iCal
    if (unitIds.length === 0) {
      const emptyIcal = generateICal([], calName);
      return new Response(emptyIcal, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Get all active reservations for these units
    const placeholders = unitIds.map(() => '?').join(',');
    const reservations = db.prepare(`
      SELECT r.id, r.unit_id, r.check_in, r.check_out, r.status,
             COALESCE(g.first_name, 'OTA') as first_name,
             COALESCE(g.last_name, 'Blocked') as last_name
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      WHERE r.unit_id IN (${placeholders})
        AND r.status IN ('confirmed', 'checked_in', 'tentative')
        AND r.check_out >= date('now', '-30 days')
    `).all(...unitIds) as any[];

    // Convert to iCal events
    const events = reservations.map((r: any) => ({
      uid: `${r.id}@alisio-pms`,
      dtstart: r.check_in,
      dtend: r.check_out,
      summary: r.status === 'tentative'
        ? 'Tentative'
        : `Reserved - ${r.first_name} ${r.last_name}`,
    }));

    const icalStr = generateICal(events, calName);

    return new Response(icalStr, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${token}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e: any) {
    console.error('[iCal Export] Error:', e);
    // Return empty but valid iCal even on error — OTA platforms expect valid calendar
    const fallback = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ALiSiO PMS//Channel Manager//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n';
    return new Response(fallback, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}

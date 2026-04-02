/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  pullNewReservations,
  acknowledgeReservations,
  pullModifications,
  acknowledgeModifications,
  processReservation,
} from '@/lib/channels/booking-com/reservations';

/**
 * POST /api/channels/reservations/poll
 * 
 * Cron-callable endpoint — polls Booking.com for new reservations.
 * Booking.com requires polling every 20 seconds (60 seconds max for certification).
 * 
 * Flow:
 * 1. Pull new reservations (GET OTA_HotelResNotif)
 * 2. Process each reservation into PMS
 * 3. Acknowledge processed reservations (POST back)
 * 4. Repeat for modifications
 */
export async function POST() {
  const results: {
    connectionId: string;
    channel: string;
    newReservations: number;
    modifications: number;
    actions: Array<{ externalId: string; action: string; pmsId: string | null }>;
    errors: string[];
  }[] = [];

  try {
    const db = getDb();

    // Get all active connections that handle reservations
    const connections = db.prepare(`
      SELECT id, channel, connection_types
      FROM channel_connections
      WHERE status = 'connected'
        AND credentials_id IS NOT NULL
    `).all() as any[];

    for (const conn of connections) {
      const connTypes = JSON.parse(conn.connection_types || '[]');
      if (!connTypes.includes('RESERVATIONS')) continue;

      const connResult = {
        connectionId: conn.id,
        channel: conn.channel,
        newReservations: 0,
        modifications: 0,
        actions: [] as Array<{ externalId: string; action: string; pmsId: string | null }>,
        errors: [] as string[],
      };

      try {
        // 1. Pull new reservations
        const newOnes = await pullNewReservations(conn.id);
        connResult.newReservations = newOnes.length;

        const idsToAck: string[] = [];
        for (const res of newOnes) {
          try {
            const result = processReservation(conn.id, res);
            connResult.actions.push({
              externalId: res.externalReservationId,
              action: result.action,
              pmsId: result.reservationId,
            });
            idsToAck.push(res.externalReservationId);
          } catch (e: any) {
            connResult.errors.push(`Failed to process ${res.externalReservationId}: ${e.message}`);
          }
        }

        // 2. Acknowledge new reservations
        if (idsToAck.length > 0) {
          const acked = await acknowledgeReservations(conn.id, idsToAck);
          if (!acked) {
            connResult.errors.push(`Failed to acknowledge ${idsToAck.length} reservation(s)`);
          }
        }

        // 3. Pull modifications
        const mods = await pullModifications(conn.id);
        connResult.modifications = mods.length;

        const modIdsToAck: string[] = [];
        for (const mod of mods) {
          try {
            const result = processReservation(conn.id, mod);
            connResult.actions.push({
              externalId: mod.externalReservationId,
              action: `mod:${result.action}`,
              pmsId: result.reservationId,
            });
            modIdsToAck.push(mod.externalReservationId);
          } catch (e: any) {
            connResult.errors.push(`Failed to process modification ${mod.externalReservationId}: ${e.message}`);
          }
        }

        // 4. Acknowledge modifications
        if (modIdsToAck.length > 0) {
          await acknowledgeModifications(conn.id, modIdsToAck);
        }

        // Update last_synced_at
        db.prepare(`
          UPDATE channel_connections SET last_synced_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(conn.id);
      } catch (e: any) {
        connResult.errors.push(`Connection ${conn.id}: ${e.message}`);
      }

      results.push(connResult);
    }

    const totalNew = results.reduce((s, r) => s + r.newReservations, 0);
    const totalMods = results.reduce((s, r) => s + r.modifications, 0);

    return NextResponse.json({
      polled: results.length,
      totalNewReservations: totalNew,
      totalModifications: totalMods,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

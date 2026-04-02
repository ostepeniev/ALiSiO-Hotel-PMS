/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dequeueJob, markCompleted, markFailed, getQueueStats } from '@/lib/channels/sync-queue';
import { pushInventory, pushRates, pushRestrictions, buildARIFromPriceCalendar } from '@/lib/channels/booking-com/ari';

/**
 * POST /api/channels/sync/process
 * 
 * Cron-callable endpoint — processes pending ARI sync queue jobs.
 * Call every 1-5 minutes via external cron or setInterval.
 * 
 * Each call processes up to MAX_JOBS_PER_RUN jobs from the queue.
 */
const MAX_JOBS_PER_RUN = 10;

export async function POST() {
  const results: Array<{ jobId: string; syncType: string; success: boolean; error?: string }> = [];

  try {
    for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
      const job = dequeueJob();
      if (!job) break; // Queue empty

      try {
        // Verify connection is still active
        const db = getDb();
        const conn = db.prepare('SELECT status FROM channel_connections WHERE id = ?').get(job.connection_id) as any;
        if (!conn || conn.status !== 'connected') {
          markFailed(job.id, 'Connection not active');
          results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: 'Connection not active' });
          continue;
        }

        // Get mapping for unit type (if specified)
        const unitTypeId = job.unit_type_id;
        if (!unitTypeId) {
          // No unit type — sync ALL mapped unit types
          const mappings = db.prepare(
            'SELECT DISTINCT unit_type_id FROM channel_room_mapping WHERE connection_id = ? AND is_active = 1'
          ).all(job.connection_id) as any[];

          let allSuccess = true;
          for (const m of mappings) {
            const result = await processARIJob(job.connection_id, job.sync_type, m.unit_type_id, job.date_from, job.date_to);
            if (!result.success) allSuccess = false;
          }

          if (allSuccess) {
            markCompleted(job.id);
            results.push({ jobId: job.id, syncType: job.sync_type, success: true });
          } else {
            markFailed(job.id, 'Partial failure — some unit types failed');
            results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: 'Partial failure' });
          }
        } else {
          const result = await processARIJob(job.connection_id, job.sync_type, unitTypeId, job.date_from, job.date_to);
          if (result.success) {
            markCompleted(job.id);
          } else {
            markFailed(job.id, result.error || 'Unknown error');
          }
          results.push({ jobId: job.id, syncType: job.sync_type, success: result.success, error: result.error });
        }
      } catch (error: any) {
        markFailed(job.id, error.message);
        results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: error.message });
      }
    }

    const stats = getQueueStats();
    return NextResponse.json({
      processed: results.length,
      results,
      queueStats: stats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Process a single ARI sync job: build data from PMS and push to Booking.com
 */
async function processARIJob(
  connectionId: string,
  syncType: string,
  unitTypeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ success: boolean; error?: string }> {
  const ari = buildARIFromPriceCalendar(connectionId, unitTypeId, dateFrom, dateTo);

  try {
    switch (syncType) {
      case 'inventory': {
        if (ari.inventory.length === 0) return { success: true };
        const result = await pushInventory(connectionId, ari.inventory);
        if (!result.success) return { success: false, error: result.errors?.[0]?.message };
        return { success: true };
      }

      case 'rates': {
        if (ari.rates.length === 0) return { success: true };
        const result = await pushRates(connectionId, ari.rates);
        if (!result.success) return { success: false, error: result.errors?.[0]?.message };
        return { success: true };
      }

      case 'restrictions': {
        if (ari.restrictions.length === 0) return { success: true };
        const result = await pushRestrictions(connectionId, ari.restrictions);
        if (!result.success) return { success: false, error: result.errors?.[0]?.message };
        return { success: true };
      }

      case 'full': {
        // Push all three in sequence
        const errors: string[] = [];

        if (ari.inventory.length > 0) {
          const r = await pushInventory(connectionId, ari.inventory);
          if (!r.success) errors.push(`Inventory: ${r.errors?.[0]?.message}`);
        }
        if (ari.rates.length > 0) {
          const r = await pushRates(connectionId, ari.rates);
          if (!r.success) errors.push(`Rates: ${r.errors?.[0]?.message}`);
        }
        if (ari.restrictions.length > 0) {
          const r = await pushRestrictions(connectionId, ari.restrictions);
          if (!r.success) errors.push(`Restrictions: ${r.errors?.[0]?.message}`);
        }

        if (errors.length > 0) return { success: false, error: errors.join('; ') };
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown sync type: ${syncType}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

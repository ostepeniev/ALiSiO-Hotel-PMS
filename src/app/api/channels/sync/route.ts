/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getQueueStats, getFailedJobs } from '@/lib/channels';
import { getAllSyncLogs } from '@/lib/channels';

/**
 * GET /api/channels/sync — get sync queue stats + recent logs
 */
export async function GET() {
  try {
    const stats = getQueueStats();
    const failedJobs = getFailedJobs(10);
    const recentLogs = getAllSyncLogs({ limit: 20 });

    return NextResponse.json({
      queue: stats,
      failedJobs,
      recentLogs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

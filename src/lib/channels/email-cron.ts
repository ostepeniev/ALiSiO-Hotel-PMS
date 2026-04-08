/**
 * Email Polling Scheduler
 * Self-scheduling poller that runs every 2 minutes using setTimeout.
 * Started on first import — typically triggered by the first API request.
 */

let isRunning = false;
let intervalId: ReturnType<typeof setTimeout> | null = null;
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function pollEmails() {
  if (isRunning) return;
  isRunning = true;

  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/crm/channels/email/poll?secret=${process.env.EMAIL_POLL_SECRET || 'internal'}`;
    
    console.log('[Email Cron] Polling at', new Date().toISOString());
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'X-Internal-Cron': '1' },
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      if (data.fetched > 0 || data.leads_created > 0) {
        console.log(`[Email Cron] ✅ Fetched: ${data.fetched}, Guests: ${data.classified_guest}, Leads: ${data.leads_created}, Messages: ${data.messages_added}`);
      }
    } else {
      console.error('[Email Cron] ❌ Poll failed:', res.status);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Email Cron] ⏱️ Poll timed out');
    } else {
      console.error('[Email Cron] ❌ Error:', err.message);
    }
  } finally {
    isRunning = false;
  }
}

export function startEmailPoller() {
  if (intervalId) return; // Already started
  
  // Don't start in build/static generation
  if (typeof window !== 'undefined') return;
  if (!process.env.EMAIL_CZ_USER) {
    console.log('[Email Cron] Skipped — EMAIL_CZ_USER not configured');
    return;
  }

  console.log('[Email Cron] 📧 Starting email poller (every 2 min)');
  
  // First poll after 10 seconds (let server stabilize)
  setTimeout(pollEmails, 10000);
  
  // Then every 2 minutes
  intervalId = setInterval(pollEmails, POLL_INTERVAL_MS);
}

export function stopEmailPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Email Cron] Stopped');
  }
}

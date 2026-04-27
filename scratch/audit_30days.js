const { ImapFlow } = require('imapflow');

async function audit30Days() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz', port: 993, secure: true,
    auth: { user: 'kemp-carlsbad@email.cz', pass: 'yhgQ7fmv2!lsj@dqrkptw' },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        
        console.log(`--- AUDIT: EMAILS SINCE ${since.toLocaleDateString()} ---`);
        const searchCriteria = { since };
        const messages = client.fetch(searchCriteria, { uid: true, envelope: true });
        
        let results = [];
        for await (const msg of messages) {
            const subject = msg.envelope.subject || '(no subject)';
            const subjectLower = subject.toLowerCase();
            const from = msg.envelope.from?.[0]?.address || 'unknown';
            const date = msg.envelope.date;
            
            let status = 'Message/Other';
            if (subjectLower.includes('нове бронювання') || subjectLower.includes('new reservation') || subjectLower.includes('nova rezervace')) {
                status = 'NEW RESERVATION';
            } else if (subjectLower.includes('скасовано') || subjectLower.includes('cancelled')) {
                status = 'CANCELLATION';
            } else if (subjectLower.includes('змінено') || subjectLower.includes('modification')) {
                status = 'MODIFICATION';
            } else if (from.includes('guest.booking.com')) {
                status = 'Guest Message';
            }

            results.push({ date, from, subject, status });
        }

        // Sort by date descending
        results.sort((a, b) => b.date - a.date);

        results.forEach(r => {
            console.log(`[${r.date.toISOString().split('T')[0]}] | ${r.status.padEnd(15)} | ${r.subject.substring(0, 60)}`);
        });

        console.log(`\nTotal: ${results.length} emails.`);
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

audit30Days();

const { ImapFlow } = require('imapflow');
const { parseBookingComEmail } = require('../src/lib/channels/booking-com-parser');
const { simpleParser } = require('mailparser');

async function getDetailedData() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz', port: 993, secure: true,
    auth: { user: 'kemp-carlsbad@email.cz', pass: 'yhgQ7fmv2!lsj@dqrkptw' },
    logger: false,
  });

  const ids = ['5326802585', '6688814746', '6478884401'];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        for (const id of ids) {
            console.log(`\n--- PARSING ID: ${id} ---`);
            const searchCriteria = { subject: id };
            const messages = client.fetch(searchCriteria, { source: true, envelope: true });
            
            for await (const msg of messages) {
                const parsedEmail = await simpleParser(msg.source);
                const textBody = parsedEmail.text || '';
                const parsed = parseBookingComEmail(textBody, msg.envelope.from?.[0]?.address || '', msg.envelope.subject || '');
                console.log(JSON.stringify(parsed, null, 2));
            }
        }
        
        // Check Tim Simon (Vrbo)
        console.log('\n--- CHECKING VRBO (Tim Simon) ---');
        const vrboSearch = { subject: '4910935' }; // Using Vrbo number
        const vrboMsgs = client.fetch(vrboSearch, { source: true, envelope: true });
        for await (const msg of vrboMsgs) {
            const parsedEmail = await simpleParser(msg.source);
            console.log(`[${msg.envelope.date.toISOString()}] Subject: ${msg.envelope.subject}`);
            console.log("Text snippet:", parsedEmail.text.substring(0, 500));
        }

    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getDetailedData();

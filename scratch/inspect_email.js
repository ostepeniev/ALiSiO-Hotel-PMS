const { ImapFlow } = require('imapflow');

async function inspectAndDecode() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz', port: 993, secure: true,
    auth: { user: 'kemp-carlsbad@email.cz', pass: 'yhgQ7fmv2!lsj@dqrkptw' },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        const searchCriteria = { subject: '5326802585' };
        const messages = client.fetch(searchCriteria, { uid: true, envelope: true, source: true });
        
        for await (const msg of messages) {
            console.log(`--- Email: ${msg.envelope.subject} ---`);
            const source = msg.source.toString();
            // Basic extraction of base64 parts
            const parts = source.split('--_----------=_');
            for (const part of parts) {
                if (part.includes('base64')) {
                    const content = part.split('\n\n')[1]?.split('\n--')[0];
                    if (content) {
                        const decoded = Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf-8');
                        console.log('--- DECODED PART ---');
                        console.log(decoded);
                    }
                }
            }
        }
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspectAndDecode();

const { ImapFlow } = require('imapflow');

async function searchDuplicateIds() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz', port: 993, secure: true,
    auth: { user: 'kemp-carlsbad@email.cz', pass: 'yhgQ7fmv2!lsj@dqrkptw' },
    logger: false,
  });

  const id = '5326802585';

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        console.log(`Searching for all emails related to ${id}...`);
        const searchCriteria = { or: [ { subject: id }, { body: id } ] };
        const messages = client.fetch(searchCriteria, { envelope: true });
        for await (const msg of messages) {
            console.log(`[${msg.envelope.date.toISOString()}] Subject: ${msg.envelope.subject} | From: ${msg.envelope.from?.[0]?.address}`);
        }
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

searchDuplicateIds();

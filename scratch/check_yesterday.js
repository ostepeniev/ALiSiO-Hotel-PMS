const { ImapFlow } = require('imapflow');

async function checkYesterdayEmails() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz',
    port: 993,
    secure: true,
    auth: {
      user: 'kemp-carlsbad@email.cz',
      pass: 'yhgQ7fmv2!lsj@dqrkptw'
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        console.log(`Searching for emails since ${yesterday.toISOString()}...`);
        const searchCriteria = { since: yesterday };
        const messages = client.fetch(searchCriteria, { uid: true, envelope: true });
        
        let count = 0;
        for await (const msg of messages) {
            count++;
            console.log(`[${msg.envelope.date.toISOString()}] ${msg.envelope.subject} | From: ${msg.envelope.from?.[0]?.address}`);
        }
        console.log(`Found ${count} messages total.`);
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkYesterdayEmails();

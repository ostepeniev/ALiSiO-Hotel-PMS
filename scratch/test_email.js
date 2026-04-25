const { ImapFlow } = require('imapflow');

async function testConnection() {
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
    console.log('Connecting to email.cz...');
    await client.connect();
    console.log('Connected successfully!');
    
    const lock = await client.getMailboxLock('INBOX');
    try {
        console.log('Opened INBOX');
        const searchCriteria = { seen: false };
        const messages = client.fetch(searchCriteria, { uid: true });
        let count = 0;
        for await (const msg of messages) {
            count++;
        }
        console.log(`Found ${count} unread messages.`);
    } finally {
        lock.release();
    }
    
    await client.logout();
    console.log('Logged out.');
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}

testConnection();

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');

async function saveHtml() {
  const client = new ImapFlow({
    host: 'imap.seznam.cz', port: 993, secure: true,
    auth: { user: 'kemp-carlsbad@email.cz', pass: 'yhgQ7fmv2!lsj@dqrkptw' },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
        const searchCriteria = { subject: '6478884401' };
        const messages = client.fetch(searchCriteria, { source: true });
        for await (const msg of messages) {
            const parsedEmail = await simpleParser(msg.source);
            fs.writeFileSync('scratch/email_6478884401.html', parsedEmail.html);
            console.log("Saved to scratch/email_6478884401.html");
        }
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

saveHtml();

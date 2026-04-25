const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function debugHtml() {
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
        const messages = client.fetch(searchCriteria, { source: true });
        for await (const msg of messages) {
            const parsedEmail = await simpleParser(msg.source);
            const html = parsedEmail.html || '';
            // Strip HTML tags for regex matching
            const textFromHtml = html.replace(/<[^>]*>?/gm, ' ');
            console.log("--- TEXT FROM HTML ---");
            console.log(textFromHtml.substring(0, 5000));
        }
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

debugHtml();

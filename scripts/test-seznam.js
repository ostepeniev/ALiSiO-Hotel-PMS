const { ImapFlow } = require('imapflow');

const config = {
    user: 'kemp-carlsbad@email.cz',
    pass: 'Alisio777!Antoniko@',
    host: 'imap.seznam.cz',
    port: 993
};

async function testSeznam() {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: true,
        auth: {
            user: config.user,
            pass: config.pass
        },
        logger: {
            debug: (...args) => console.log('[DEBUG]', ...args),
            info: (...args) => console.log('[INFO]', ...args),
            warn: (...args) => console.warn('[WARN]', ...args),
            error: (...args) => console.error('[ERROR]', ...args)
        }
    });

    try {
        console.log('Connecting to Seznam IMAP...');
        await client.connect();
        console.log('Connected successfully!');
        
        const lock = await client.getMailboxLock('INBOX');
        console.log('Got lock on INBOX');
        
        const status = await client.status('INBOX', { messages: true, unread: true });
        console.log('Mailbox status:', status);
        
        lock.release();
        await client.logout();
    } catch (err) {
        console.error('Connection failed:', err);
        if (err.response) console.error('Server response:', err.response);
        if (err.command) console.error('Last command:', err.command);
    }
}

testSeznam();

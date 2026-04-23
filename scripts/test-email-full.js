const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const config = {
    user: 'kemp-carlsbad@email.cz',
    pass: 'Alisio777!Antoniko@',
    imap: { host: 'imap.seznam.cz', port: 993 },
    smtp: { host: 'smtp.seznam.cz', port: 465 }
};

async function testSmtp() {
    console.log('Testing SMTP...');
    const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: true,
        auth: { user: config.user, pass: config.pass }
    });

    try {
        await transporter.verify();
        console.log('SMTP Verified successfully!');
    } catch (err) {
        console.error('SMTP Verification failed:', err.message);
    }
}

async function testImap() {
    console.log('Testing IMAP...');
    const client = new ImapFlow({
        host: config.imap.host,
        port: config.imap.port,
        secure: true,
        auth: { user: config.user, pass: config.pass },
        logger: false
    });

    try {
        await client.connect();
        console.log('IMAP Connected successfully!');
        await client.logout();
    } catch (err) {
        console.error('IMAP Connection failed:', err.response || err.message);
    }
}

async function runTests() {
    await testSmtp();
    console.log('---');
    await testImap();
}

runTests();

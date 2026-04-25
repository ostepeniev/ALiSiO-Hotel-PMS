const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function getBookingDetails() {
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
        const searchCriteria = { subject: id };
        const messages = client.fetch(searchCriteria, { source: true });
        
        for await (const msg of messages) {
            const parsedEmail = await simpleParser(msg.source);
            const html = parsedEmail.html || '';
            
            // Look for patterns in HTML
            const name = html.match(/Ім'я гостя:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1] || 
                         html.match(/Guest name:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1];
            
            const checkIn = html.match(/Заїзд:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1] ||
                            html.match(/Check-in:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1];
            
            const checkOut = html.match(/Виїзд:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1] ||
                             html.match(/Check-out:\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1];

            const price = html.match(/(?:Ціна|Price|Вартість):\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1];
            
            const guests = html.match(/(?:Усього гостей|Total guests):\s*<\/td>\s*<td[^>]*>\s*<strong>\s*([^<]+)/i)?.[1];

            console.log(`--- DETAILS FOR ${id} ---`);
            console.log(`Guest: ${name}`);
            console.log(`Dates: ${checkIn} - ${checkOut}`);
            console.log(`Price: ${price}`);
            console.log(`Guests: ${guests}`);
        }
    } finally {
        lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getBookingDetails();

const imaps = require('imap-simple');
const db = require('../firebase');


const fetchRecentEmails = async (account) => {
  const imapConfig = {
    imap: {
      user: account.testMail,
      password: account.appPass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 3000,
      tlsOptions: { rejectUnauthorized: false },
    },
  };

  const collected = [];

  try {
    const connection = await imaps.connect(imapConfig);
    const folders = ['INBOX', '[Gmail]/Spam'];

    for (const folder of folders) {
      await connection.openBox(folder);

      const messages = await connection.search(['ALL'], {
        bodies: ['HEADER'],
        markSeen: false,
      });

      const parsed = messages.map((msg) => {
        const header = msg.parts[0].body;
        const fromRaw = header.from?.[0] || '';
        const subject = header.subject?.[0] || '';
        const date = new Date(header.date?.[0] || Date.now());

        const match = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
        const senderName = match ? match[1] : '';
        const senderEmail = match ? match[2] : fromRaw;

        return {
          senderName,
          senderEmail,
          subject,
          folder: folder === 'INBOX' ? 'Inbox' : 'Spam',
          sentTime: date.toISOString(),
        };
      });

      collected.push(...parsed.slice(-10)); // Store only last 30 per folder
    }

    connection.end();
    return collected;
  } catch (err) {
    console.error(`Sync failed for ${account.testMail}:`, err.message);
    return [];
  }
};

const runSync = async () => {
  const testSnapshot = await db.ref('testEmails').once('value');
  const allEmails = testSnapshot.val() || {};

  const groupedByAdmin = {};
  for (const key in allEmails) {
    const acc = allEmails[key];
    const adminId = acc.addedBy;
    if (!groupedByAdmin[adminId]) groupedByAdmin[adminId] = [];
    groupedByAdmin[adminId].push(acc);
  }

  for (const adminId in groupedByAdmin) {
    for (const account of groupedByAdmin[adminId]) {
      const synced = await fetchRecentEmails(account);
      // await db.ref(`syncedEmails/${adminId}/${account.testMail}`).set(synced);
      const safeEmail = account.testMail.replace(/[.#$/[\]]/g, '_');
      await db.ref(`syncedEmails/${adminId}/${safeEmail}`).set(synced);

      console.log(`✅ Synced ${account.testMail} (${synced.length} messages)`);
    }
  }

  console.log('✅ Sync complete.');
  process.exit();
};

runSync();

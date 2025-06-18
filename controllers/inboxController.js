// const imaps = require('imap-simple');
const db = require('../firebase');
require('dotenv').config();
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');


exports.checkEmailStatus = async (req, res) => {
  const { search, userId } = req.query;
  if (!search) return res.status(400).json({ error: 'Search term (name or email) is required' });

  const lowerSearch = search.toLowerCase();
  let testAccounts = [];

  try {
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const user = userSnapshot.val();
    const adminId = user.role === 'admin' ? userId : user.adminId;

    const snapshot = await db.ref('testEmails').once('value');
    const allEmails = snapshot.val();
    const filtered = Object.values(allEmails || {}).filter(email => email.addedBy === adminId);
    testAccounts = filtered ? Object.values(filtered) : [];
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load test accounts from Firebase' });
  }

  const checkAccount = (account) => {
    return new Promise((resolve) => {
      const imap = new Imap({
        user: account.testMail,
        password: account.appPass,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      let totalSent = 0;
      let latestEmail = null;

      const sinceDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const processFolder = (folderName, cb) => {
        imap.openBox(folderName, true, async (err, box) => {
          if (err) return cb();

          const searchCriteria = [['SINCE', sinceDate.toISOString().split('T')[0]]];

          imap.search(searchCriteria, (err, results) => {
            if (err || !results.length) return cb();

            const fetch = imap.fetch(results.slice(-10), { bodies: '' });

            fetch.on('message', (msg) => {
              msg.on('body', async (stream) => {
                const parsed = await simpleParser(stream);
                const fromRaw = parsed.from?.text || '';
                const subject = parsed.subject || '';
                const date = parsed.date || new Date();

                const match = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
                const senderName = match ? match[1].toLowerCase() : '';
                const senderEmail = match ? match[2].toLowerCase() : fromRaw.toLowerCase();

                if (
                  senderEmail.includes(lowerSearch) ||
                  senderName.includes(lowerSearch)
                ) {
                  totalSent++;
                  if (!latestEmail || date > latestEmail.receivedAt) {
                    latestEmail = {
                      sender: senderEmail,
                      senderName,
                      subject,
                      folder: folderName === 'INBOX' ? 'Inbox' : 'Spam',
                      receivedAt: date,
                    };
                  }
                }
              });
            });

            fetch.once('end', cb);
          });
        });
      };

      imap.once('ready', () => {
        processFolder('INBOX', () => {
          processFolder('[Gmail]/Spam', () => {
            imap.end();
          });
        });
      });

      imap.once('error', () => resolve(null));
      imap.once('end', () => {
        if (totalSent > 0 && latestEmail) {
          resolve({
            testEmail: account.testMail,
            totalSent,
            senderName: latestEmail.senderName,
            senderEmail: latestEmail.sender,
            subject: latestEmail.subject,
            folder: latestEmail.folder,
            sentTime: latestEmail.receivedAt.toISOString(),
          });
        } else {
          resolve(null);
        }
      });

      imap.connect();
    });
  };

  const tasks = testAccounts.map(account => checkAccount(account));
  const results = await Promise.all(tasks);
  const finalResults = results.filter(Boolean);

  res.status(200).json(finalResults);

  const inboxPercentageRate = finalResults.reduce((acc, res) => acc + (res.folder === 'Inbox' ? 1 : 0), 0) / finalResults.length * 100 || 0;

  if (userId && finalResults.length > 0) {
    const userSearchRef = db.ref(`userSearches/${userId}`).push();
    await userSearchRef.set({
      searchTerm: search,
      searchedAt: new Date().toISOString(),
      inboxPercentageRate: parseInt(inboxPercentageRate),
      subjectUsed: finalResults[0]?.subject,
      senderName: finalResults[0]?.senderName,
      apiEmail: finalResults[0]?.senderEmail,
    });
  }
};



/*
exports.checkEmailStatus = async (req, res) => {
  const { search, userId } = req.query;
  if (!search || !userId) return res.status(400).json({ error: 'Missing search or userId' });

  const lowerSearch = search.toLowerCase();
  

  try {
    // Get user info
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const user = userSnapshot.val();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const adminId = user.role === 'admin' ? userId : user.adminId;

    // Load synced emails under this admin
    const syncedSnapshot = await db.ref(`syncedEmails/${adminId}`).once('value');
    const syncedData = syncedSnapshot.val();
  //  console.log('syncedData', syncedData);
    if (!syncedData) return res.status(200).json([]); // no synced data

    
    const results = [];

    for (const testMail in syncedData) {
      const messages = [...(syncedData[testMail]?.Inbox || []), ...(syncedData[testMail]?.Spam || [])];
// console.log(syncedData[testMail])
      const matching = syncedData[testMail].filter(msg => {
        return (
          msg.senderEmail?.toLowerCase().includes(lowerSearch) ||
          msg.senderName?.toLowerCase().includes(lowerSearch)
        );
      });
      console.log(matching);

      if (matching.length > 0) {
        const latest = matching.reduce((a, b) =>
          new Date(a.receivedAt) > new Date(b.receivedAt) ? a : b
        );

        results.push({
          testEmail: testMail,
          totalSent: matching.length,
          senderName: latest.senderName,
          subject: latest.subject,
          folder: latest.folder,
          sentTime: latest.sentTime,
        });
      }
    }
    console.log(results);
    // Save this search history (optional)
    const inboxPercentage = results.reduce((acc, res) => acc + (res.folder === 'Inbox' ? 1 : 0), 0) / results.length * 100 || 0;

    await db.ref(`userSearches/${userId}`).push({
      searchTerm: search,
      searchedAt: new Date().toISOString(),
      inboxPercentageRate: inboxPercentage,
      subjectUsed: results[0]?.subject || '',
      nameUsed: results[0]?.senderName || '',
    });

    return res.status(200).json(results);
  } catch (err) {
    console.error('Fast search failed:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
};
*/

/*
exports.checkEmailStatus = async (req, res) => {
  const { search, userId } = req.query;
  if (!search) return res.status(400).json({ error: 'Search term (name or email) is required' });

  const lowerSearch = search.toLowerCase();

  let testAccounts = [];
  try {
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const user = userSnapshot.val();
    const adminId = user.role === 'admin' ? userId : user.adminId;

    const snapshot = await db.ref('testEmails').once('value');
    const allEmails = snapshot.val();
    const filtered = Object.values(allEmails || {}).filter(email => email.addedBy === adminId);
    testAccounts = filtered ? Object.values(filtered) : [];
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load test accounts from Firebase' });
  }

  const checkAccount = async (account) => {
    const imapConfig = {
      imap: {
        user: account.testMail,
        password: account.appPass,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 3000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    try {
      const connection = await imaps.connect(imapConfig);
      let totalSent = 0;
      let latestEmail = null;

      for (const folder of ['INBOX', '[Gmail]/Spam']) {
        await connection.openBox(folder);

        const sinceDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // Last 2 days
        const formattedDate = sinceDate.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).replace(/ /g, '-'); // e.g., 12-Jun-2025

        const messages = await connection.search(
          [['SINCE', formattedDate]],
          { bodies: ['HEADER'], markSeen: false }
        );

        
        const recentMsg = messages.slice(-10);

        for (const msg of recentMsg) {
          const header = msg.parts[0].body;
          const fromRaw = header.from?.[0] || '';
          const date = new Date(header.date?.[0] || Date.now());

          const match = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
          const senderName = match ? match[1].toLowerCase() : '';
          const senderEmail = match ? match[2].toLowerCase() : fromRaw.toLowerCase();

          if (
            senderEmail.includes(lowerSearch) ||
            senderName.includes(lowerSearch)
          ) {
            totalSent++;

            if (!latestEmail || date > latestEmail.receivedAt) {
              latestEmail = {
                sender: senderEmail,
                senderName,
                subject: header.subject?.[0] || '',
                folder: folder === 'INBOX' ? 'Inbox' : 'Spam',
                receivedAt: date
              };
            }
          }
        }
      }


      connection.end();


      if (totalSent > 0 && latestEmail) {
        return {
          testEmail: account.testMail,
          totalSent,
          senderName: latestEmail.senderName,
          senderEmail: latestEmail.sender,
          subject: latestEmail.subject,
          folder: latestEmail.folder,
          sentTime: latestEmail.receivedAt.toISOString(),
        };
      }
    } catch (err) {
      console.error(`Failed for ${account.testMail}:`, err.message);
    }
    return null;
  };

  const tasks = testAccounts.map(account => checkAccount(account));
  const results = await Promise.all(tasks);
  const finalResults = results.filter(Boolean);

  res.status(200).json(finalResults);

  const inboxPercentageRate = finalResults.reduce((acc, res) => acc + (res.folder === 'Inbox' ? 1 : 0), 0) / finalResults.length * 100 || 0;


  if (userId && finalResults.length > 0) {
    const userSearchRef = db.ref(`userSearches/${userId}`).push();
    await userSearchRef.set({
      searchTerm: search,
      searchedAt: new Date().toISOString(),
      inboxPercentageRate: parseInt(inboxPercentageRate),
      subjectUsed: finalResults[0]?.subject,
      senderName: finalResults[0]?.senderName,
      apiEmail: finalResults[0]?.senderEmail,
    });
  }
  
};
*/
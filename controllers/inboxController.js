const imaps = require('imap-simple');
const db = require('../firebase');
require('dotenv').config();


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

  const inboxPercentageRate = finalResults.reduce((acc, res) => acc + (res.folder === 'Inbox' ? 1 : 0), 0) / finalResults.length * 100 || 0;

  if (userId && finalResults.length > 0) {
    const userSearchRef = db.ref(`userSearches/${userId}`).push();
    await userSearchRef.set({
      searchTerm: search,
      searchedAt: new Date().toISOString(),
      inboxPercentageRate,
      subjectUsed: finalResults[0]?.subject,
      nameUsed: finalResults[0]?.senderName,
    });
  }

  res.status(200).json(finalResults);
};

// exports.checkEmailStatus = async (req, res) => {
//   const { search, userId } = req.query;
//   if (!search) return res.status(400).json({ error: 'Search term (name or email) is required' });
//   console.log(`Searching for: ${search}`);

//   const lowerSearch = search.toLowerCase();

//   // Fetch testAccounts from Realtime Database
//   let testAccounts = [];
//   try {
//     const userSnapshot = await db.ref(`users/${userId}`).once('value');
//     const user = userSnapshot.val();

//     const adminId = user.role === 'admin' ? userId : user.adminId;

//     const snapshot = await db.ref('testEmails').once('value');
//     const allEmails = snapshot.val();

//     // Filter emails based on adminId
//     const filtered = Object.values(allEmails || {}).filter(email => email.addedBy === adminId);
//     // Convert object to array if needed
//     testAccounts = filtered ? Object.values(filtered) : [];
//   } catch (err) {
//     return res.status(500).json({ error: 'Failed to load test accounts from Firebase' });
//   }

//   // Process all accounts in parallel
//   const results = await Promise.all(
//     testAccounts.map(async (account) => {
//       const imapConfig = {
//         imap: {
//           user: account.testMail,
//           password: account.appPass,
//           host: 'imap.gmail.com',
//           port: 993,
//           tls: true,
//           authTimeout: 3000,
//           tlsOptions: { rejectUnauthorized: false }
//         }
//       };

//       try {
//         const connection = await imaps.connect(imapConfig);

//         // let inboxCount = 0;
//         // let spamCount = 0;
//         let totalSent = 0;
//         let latestEmail = null;

//         for (const folder of ['INBOX', '[Gmail]/Spam']) {
//           await connection.openBox(folder);

//           const messages = await connection.search(['ALL'], {
//             bodies: ['HEADER'],
//             markSeen: false
//           });

//           for (const msg of messages) {
//             const header = msg.parts[0].body;
//             const fromRaw = header.from?.[0] || '';
//             const subject = header.subject?.[0] || '';
//             const date = new Date(header.date?.[0] || Date.now());

//             const match = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
//             const senderName = match ? match[1] : '';
//             const senderEmail = match ? match[2] : fromRaw;

//             if (
//               senderEmail.toLowerCase().includes(lowerSearch) ||
//               senderName.toLowerCase().includes(lowerSearch)
//             ) {
//               totalSent++;
//               // if (folder === 'INBOX') inboxCount++;
//               // if (folder === '[Gmail]/Spam') spamCount++;

//               if (!latestEmail || date > latestEmail.receivedAt) {
//                 latestEmail = {
//                   sender: senderEmail,
//                   senderName,
//                   subject,
//                   folder: folder === 'INBOX' ? 'Inbox' : 'Spam',
//                   receivedAt: date
//                 };
//               }
//             }
//           }
//         }

//         connection.end();

//         if (totalSent > 0 && latestEmail) {
//           return {
//             testEmail: account.testMail,
//             totalSent,
//             senderName: latestEmail.senderName,
//             subject: latestEmail.subject,
//             folder: latestEmail.folder,
//             sentTime: latestEmail.receivedAt.toISOString(),
//           };
//         }
//       } catch (err) {
//         console.error(`Failed for ${account.user}:`, err.message);
//       }
//       return null;
//     })
//   );

//   // Filter out null results
//   const finalResults = results.filter(Boolean);
//   const inboxPercentageRate = finalResults.reduce((acc, res) => acc + (res.folder === 'Inbox' ? 1 : 0), 0) / finalResults.length * 100 || 0;

//   // Store search result under user in Firebase
//   if (userId && finalResults.length > 0) {
//     // console.log('Saving search for user:', userId, 'search:', search, 'results:', finalResults);
//     const userSearchRef = db.ref(`userSearches/${userId}`).push();
//     await userSearchRef.set({
//       searchTerm: search,
//       searchedAt: new Date().toISOString(),
//       inboxPercentageRate,
//       subjectUsed: finalResults[0]?.subject,
//       nameUsed: finalResults[0]?.senderName,
//     });
//   }

//   // console.log('finalResults:', inboxPercentage);

//   res.status(200).json(finalResults);
// };

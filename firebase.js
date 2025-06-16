// firebase.js
const admin = require('firebase-admin');

let serviceAccount;
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hash-checker-tool-default-rtdb.asia-southeast1.firebasedatabase.app/" // Realtime DB URL
});

const db = admin.database();
module.exports = db;

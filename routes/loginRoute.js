const express = require('express');
const router = express.Router();
const db = require('../firebase');
const admin = require('firebase-admin');

router.post('/login', async (req, res) => {
  const { email, ip } = req.body;

  try {

    const user = await admin.auth().getUserByEmail(email);
    const uid = user.uid;


    // Check if already logged in from another IP
    const sessionRef = db.ref(`activeSessions/${uid}`);
    const sessionSnap = await sessionRef.once('value');

    if (sessionSnap.exists() && sessionSnap.val().ip !== ip) {
      return res.json({ statusCode: 403, message: "Already logged in on another device." });
    }

    // Allow login
    await sessionRef.set({
      ip: ip,
      loginAt: new Date().toISOString()
    });

    res.json({ success: true, uid });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});


router.post('/logout', async (req, res) => {
  const { uid } = req.body;

  try {
    await db.ref(`activeSessions/${uid}`).remove();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Logout failed" });
  }
});



module.exports = router;
// routes/testEmail.js
const express = require('express');
const router = express.Router();
const db = require('../firebase'); // Make sure path matches


router.post('/add-test-email', async (req, res) => {
    const { testMail, appPass, addedBy } = req.body;

    if (!testMail || !appPass) {
        return res.status(400).json({ error: "testMail and appPass are required" });
    }

    try {
        const newRef = db.ref('testEmails').push(); // push creates a unique ID
        await newRef.set({ testMail, appPass, addedBy });

        res.status(200).json({ message: "Test email added successfully", id: newRef.key });
    } catch (error) {
        console.error("Firebase error:", error);
        res.status(500).json({ error: "Failed to save test email" });
    }
});


router.get('/get-test-emails', async (req, res) => {
    try {
        const { id } = req.query;

        const userSnapshot = await db.ref(`users/${id}`).once('value');
        const user = userSnapshot.val();

        const adminId = user.role === 'admin' ? id : user.adminId;

        const snapshot = await db.ref('testEmails').once('value');
        const allEmails = snapshot.val();

        // Filter emails based on adminId and include the Firebase key as id
        const filtered = Object.entries(allEmails || {})
            .filter(([key, email]) => email.addedBy === adminId)
            .map(([key, email]) => ({
                id: key,
                ...email
            }));

        res.status(200).json(filtered);

    } catch (error) {
        console.error('Error fetching test emails:', error);
        res.status(500).json({ message: 'Server error', error });
    }
});

// DELETE /delete-test-email/:id
router.delete('/delete-test-email/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.ref(`testEmails/${id}`).remove();
        res.status(200).json({ message: 'Test email deleted successfully' });
    } catch (error) {
        console.error('Error deleting test email:', error);
        res.status(500).json({ message: 'Failed to delete test email', error });
    }
});


module.exports = router;

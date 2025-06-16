const express = require('express');
const router = express.Router();
const db = require('../firebase');
const admin = require('firebase-admin');

router.post('/create-admin', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: "Email, password, role are required" });
  }

  try {
    // Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    // Set custom claims for role
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    // Optionally, store additional admin info in Realtime Database
    await db.ref('users').child(userRecord.uid).set({
      email,
      role,
    });

    res.status(201).json({ message: "Admin created successfully", uid: userRecord.uid });
  } catch (error) {
    console.error("Firebase admin error:", error);
    res.status(500).json({ error: "Failed to create admin", details: error.message });
  }
});


router.post('/create-user', async (req, res) => {
  const { email, password, role, adminId } = req.body;

  if (!email || !password || !role || !adminId) {
    return res.status(400).json({ error: "Email, password, role, and adminId are required" });
  }

  try {
    // Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    // Set custom claims for role
    await admin.auth().setCustomUserClaims(userRecord.uid, { role, adminId });

    // Optionally, store additional admin info in Realtime Database
    await db.ref('users').child(userRecord.uid).set({
      email,
      role,
      adminId,
    });

    res.status(201).json({ message: "User created successfully", uid: userRecord.uid });
  } catch (error) {
    console.error("Firebase user error:", error);
    res.status(500).json({ error: "Failed to create user", details: error.message });
  }
});


// Update user info
router.put('/update-user/:uid', async (req, res) => {
  const { uid } = req.params;
  const { email, password, role, adminId } = req.body;

  try {
    // Update in Firebase Authentication
    const updateData = {};
    if (email) updateData.email = email;
    if (password) updateData.password = password;
    await admin.auth().updateUser(uid, updateData);

    // Update custom claims if role or adminId provided
    if (role || adminId) {
      await admin.auth().setCustomUserClaims(uid, { role, adminId });
    }

    // Update in Realtime Database
    const userDbUpdate = {};
    if (email) userDbUpdate.email = email;
    if (role) userDbUpdate.role = role;
    if (adminId) userDbUpdate.adminId = adminId;
    await db.ref('users').child(uid).update(userDbUpdate);

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});


// Delete user
router.delete('/delete-user/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    // Delete from Firebase Authentication
    await admin.auth().deleteUser(uid);

    // Delete from Realtime Database
    await db.ref('users').child(uid).remove();

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

module.exports = router;
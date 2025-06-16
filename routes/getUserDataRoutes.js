const express = require('express');
const router = express.Router();
const db = require('../firebase');



// GET /get-user-searches/:userId
router.get('/get-user-searches/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const ref = db.ref(`userSearches/${userId}`);
    ref.once('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        return res.status(404).json({ message: 'No searches found for this user' });
      }
      // Convert object to array
      const result = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      res.status(200).json(result);
    });
  } catch (error) {
    console.error('Error fetching user searches:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});


// Get only role admin user data from Firebase
router.get('/get-admin-users', async (req, res) => {
  try {
    const ref = db.ref('users');
    ref.once('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        return res.status(404).json({ message: 'No users found' });
      }
      // Filter for admin users
      const adminUsers = Object.keys(data)
        .filter(key => data[key].role === 'admin')
        .map(key => ({
          id: key,
          ...data[key]
        }));
      res.status(200).json(adminUsers);
    });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get all users
router.get('/get-all-users', async (req, res) => {
  try {
    const ref = db.ref('users');
    ref.once('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        return res.status(404).json({ message: 'No users found' });
      }
      // Convert object to array and include the key as id
      const users = Object.entries(data).map(([key, value]) => ({
        id: key,
        ...value
      }));
      res.status(200).json(users);
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});


// Get users by admin email
router.get('/get-users-by-admin', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail) {
    return res.status(400).json({ error: 'adminEmail is required' });
  }

  try {
    // Find admin user by email
    const usersSnapshot = await db.ref('users').once('value');
    const usersData = usersSnapshot.val();
    if (!usersData) {
      return res.status(404).json({ message: 'No users found' });
    }

    // Find admin's UID by email
    const adminEntry = Object.entries(usersData).find(
      ([, user]) => user.email === adminEmail && user.role === 'admin'
    );
    if (!adminEntry) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    const adminId = adminEntry[0];

    // Filter users added by this admin
    const filteredUsers = Object.entries(usersData)
      .filter(([, user]) => user.adminId === adminId)
      .map(([key, user]) => ({
        id: key,
        ...user
      }));

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error('Error fetching users by admin:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});


module.exports = router;
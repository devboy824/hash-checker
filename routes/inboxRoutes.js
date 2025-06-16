const express = require('express');
const router = express.Router();
const { checkEmailStatus } = require('../controllers/inboxController');

router.get('/inbox-check', checkEmailStatus);

module.exports = router;

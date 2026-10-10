const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceSummaryController');
const { verifyToken } = require('../middleware/authMiddleware');
router.get('/summary', verifyToken, controller.summary);
module.exports = router;
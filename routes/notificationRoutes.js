const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get(
    "/my-notifications",
    verifyToken,
    notificationController.getNotifications
);
router.post(
 "/mark-read",
 verifyToken,
 notificationController.markAsRead
);
router.get(
 "/unread-count",
 verifyToken,
 notificationController.getUnreadCount
);

module.exports = router;
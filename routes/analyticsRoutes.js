const express = require('express');
const router = express.Router();

const analyticsController = require('../controllers/analyticsController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');


// Event analytics
router.get(
    "/event/:event_id",
    verifyToken,
    allowRoles('organizer','hod','super_admin'),
    analyticsController.getEventAnalytics
);


// System analytics
router.get(
    "/system",
    verifyToken,
    allowRoles('super_admin'),
    analyticsController.getSystemStats
);


module.exports = router;
const express = require('express');
const router = express.Router();

const eventController = require('../controllers/eventController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
"/create",
verifyToken,
allowRoles("organizer"),
eventController.createEvent
);

router.get(
"/pending",
verifyToken,
allowRoles("hod"),
eventController.getPendingEvents
);

router.post(
"/approve",
verifyToken,
allowRoles("hod"),
eventController.approveEvent
);

router.post(
"/reject",
verifyToken,
allowRoles("hod"),
eventController.rejectEvent
);
module.exports = router;
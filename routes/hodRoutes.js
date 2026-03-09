const express = require('express');
const router = express.Router();

const hodController = require('../controllers/hodController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');


router.get(
    "/events/pending",
    verifyToken,
    allowRoles('hod'),
    hodController.getPendingEvents
);


router.post(
    "/events/approve",
    verifyToken,
    allowRoles('hod'),
    hodController.approveEvent
);


router.post(
    "/events/reject",
    verifyToken,
    allowRoles('hod'),
    hodController.rejectEvent
);

module.exports = router;
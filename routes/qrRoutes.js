const express = require('express');
const router = express.Router();

const qrController = require('../controllers/qrController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
    "/generate",
    verifyToken,
    allowRoles('organizer'),
    qrController.getQR
);

router.post(
    "/scan",
    verifyToken,
    allowRoles('student'),
    qrController.scanQR
);

router.post(
 "/start",
 verifyToken,
 allowRoles('organizer'),
 qrController.startAttendance
);

router.post(
 "/close",
 verifyToken,
 allowRoles('organizer'),
 qrController.closeAttendance
);
router.get(
"/stats/:event_id",
verifyToken,
allowRoles("organizer"),
qrController.getEventStats
);

router.post(
"/start-attendance",
verifyToken,
allowRoles("organizer"),
qrController.startAttendance
)

router.post(
"/close-attendance",
verifyToken,
allowRoles("organizer"),
qrController.closeAttendance
);

module.exports = router;
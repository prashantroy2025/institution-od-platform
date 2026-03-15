const express = require('express');
const router = express.Router();
const multer = require('multer');

const hodController = require('../controllers/hodController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');


// configure multer
const upload = multer({
  dest: "uploads/"
});


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

router.get(
"/events/:event_id/participants",
verifyToken,
allowRoles('hod'),
hodController.getParticipants
);


router.post(
"/independent-attendance",
verifyToken,
allowRoles('hod'),
upload.single("file"),
hodController.uploadIndependentAttendance
);
module.exports = router;
const express = require('express');
const router = express.Router();

const participantController = require('../controllers/participantController');
const upload = require('../middleware/uploadMiddleware');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
    "/upload",
    verifyToken,
    allowRoles('organizer'),
    upload.single('file'),
    participantController.uploadParticipants
);

router.get(
"/event/:id",
verifyToken,
allowRoles("organizer"),
participantController.getParticipantsByEvent
);

router.get(
"/count/:eventId",
verifyToken,
participantController.getParticipantCount
);

router.post(
"/add",
verifyToken,
allowRoles("organizer"),
participantController.addParticipant
)

router.post(
"/remove",
verifyToken,
allowRoles("organizer"),
participantController.removeParticipant
)

router.post(
"/reupload",
verifyToken,
allowRoles("organizer"),
upload.single("file"),
participantController.reuploadParticipants
)

module.exports = router;
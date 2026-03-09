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

module.exports = router;
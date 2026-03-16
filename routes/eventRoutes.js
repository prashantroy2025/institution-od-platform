const express = require('express');
const router = express.Router();

const eventController = require('../controllers/eventController');
const participantController = require('../controllers/participantController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
"/create",
verifyToken,
allowRoles("organizer"),
eventController.createEvent
);

router.get(
"/my-events",
verifyToken,
allowRoles("organizer"),
eventController.getMyEvents
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

router.get(
"/find-event",
verifyToken,
allowRoles("organizer"),
eventController.findEventByName
);

router.get(
"/event/:id",
verifyToken,
allowRoles("organizer"),
participantController.getParticipantsByEvent
);

router.delete(
"/delete/:id",
verifyToken,
allowRoles("organizer"),
eventController.deleteEvent
)

router.get(
"/history",
verifyToken,
allowRoles("organizer"),
eventController.getHistory
)

router.post(
"/recover/:id",
verifyToken,
allowRoles("organizer"),
eventController.recoverEvent
)

router.get("/", (req,res)=>{
 res.json({
  message:"Events API working"
 })
});

module.exports = router;
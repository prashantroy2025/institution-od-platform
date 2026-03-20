const express = require('express');
const router = express.Router();

const studentController = require('../controllers/studentController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
    "/apply-od",
    verifyToken,
    allowRoles('student'),
    studentController.applyOD
);
router.get(
"/events",
verifyToken,
allowRoles("student"),
studentController.getEvents
);

router.get(
"/my-od",
verifyToken,
allowRoles("student"),
studentController.getMyOD
)

router.get(
    "/search-events",
    verifyToken,
    allowRoles("student"),
    studentController.searchEvents
);


module.exports = router;
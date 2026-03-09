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

module.exports = router;
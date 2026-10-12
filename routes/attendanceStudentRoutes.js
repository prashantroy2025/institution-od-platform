const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceStudentController');
const upload = require('../middleware/learningUploadMiddleware');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.get('/semesters', verifyToken, allowRoles('student'), controller.semesters);
router.get('/analytics', verifyToken, allowRoles('student'), controller.analytics);
router.get('/records', verifyToken, allowRoles('student'), controller.records);
router.get('/leave', verifyToken, allowRoles('student', 'hod'), controller.listLeave);
router.post('/leave', verifyToken, allowRoles('student'), upload.single('document'), controller.createLeave);
router.get('/leave/:id/document', verifyToken, allowRoles('student', 'hod'), controller.leaveDocument);
router.post('/leave/:id/decision', verifyToken, allowRoles('hod'), controller.decideLeave);

module.exports = router;

const express = require('express');
const router = express.Router();
const controller = require('../controllers/learningController');
const upload = require('../middleware/learningUploadMiddleware');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.get('/assignments', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.listAssignments);
router.post('/assignments', verifyToken, allowRoles('super_admin', 'hod', 'organizer'), upload.single('attachment'), controller.createAssignment);
router.get('/assignments/:id/download', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.assignmentDownload);
router.get('/assignments/:id/submissions', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.submissions);
router.post('/assignments/:id/submissions', verifyToken, allowRoles('student'), upload.single('file'), controller.submit);
router.get('/assignments/:id', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.assignment);
router.patch('/assignments/:id', verifyToken, allowRoles('super_admin', 'hod', 'organizer'), upload.single('attachment'), controller.updateAssignment);
router.patch('/submissions/:id/grade', verifyToken, allowRoles('super_admin', 'hod', 'organizer'), controller.grade);
router.get('/submissions/:id/download', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.submissionDownload);
router.get('/materials', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.materials);
router.post('/materials', verifyToken, allowRoles('super_admin', 'hod', 'organizer'), upload.single('file'), controller.createMaterial);
router.get('/materials/:id/download', verifyToken, allowRoles('super_admin', 'hod', 'organizer', 'student'), controller.materialDownload);

module.exports = router;
const express = require('express');
const router = express.Router();
const controller = require('../controllers/profileController');
const upload = require('../middleware/learningUploadMiddleware');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.get('/', verifyToken, controller.get);
router.patch('/', verifyToken, controller.update);
router.post('/documents', verifyToken, upload.single('document'), controller.upload);
router.get('/documents/:id/download', verifyToken, controller.download);
router.get('/photo', verifyToken, controller.photo);
router.post('/photo', verifyToken, upload.single('photo'), controller.uploadPhoto);
router.get('/student-id', verifyToken, allowRoles('student'), controller.studentId);
router.get('/skills', verifyToken, allowRoles('student'), controller.listSkills);
router.post('/skills', verifyToken, allowRoles('student'), controller.addSkill);
router.patch('/skills/:id', verifyToken, allowRoles('student'), controller.updateSkill);
router.delete('/skills/:id', verifyToken, allowRoles('student'), controller.removeSkill);
router.get('/achievements', verifyToken, allowRoles('student'), controller.listAchievements);
router.post('/achievements', verifyToken, allowRoles('student'), controller.addAchievement);
router.delete('/achievements/:id', verifyToken, allowRoles('student'), controller.removeAchievement);

module.exports = router;

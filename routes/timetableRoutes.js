const express = require('express');
const router = express.Router();
const controller = require('../controllers/timetableController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.get('/classrooms', verifyToken, controller.classrooms);
router.post('/classrooms', verifyToken, allowRoles('super_admin', 'hod'), controller.createClassroom);
router.patch('/classrooms/:id', verifyToken, allowRoles('super_admin', 'hod'), controller.updateClassroom);
router.delete('/classrooms/:id', verifyToken, allowRoles('super_admin', 'hod'), controller.removeClassroom);
router.get('/', verifyToken, controller.list);
router.post('/', verifyToken, allowRoles('super_admin', 'hod'), controller.create);
router.patch('/:id', verifyToken, allowRoles('super_admin', 'hod'), controller.update);
router.delete('/:id', verifyToken, allowRoles('super_admin', 'hod'), controller.remove);

module.exports = router;
const express = require('express');
const router = express.Router();
const controller = require('../controllers/academicController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

const resources = 'sessions|semesters|courses|subjects|batches|sections|studentProfiles|facultyProfiles';
router.get(`/:entity(${resources})`, verifyToken, controller.list);
router.post(`/:entity(${resources})`, verifyToken, allowRoles('super_admin', 'hod', 'student', 'organizer'), controller.create);
router.patch(`/:entity(${resources})/:id`, verifyToken, controller.update);
router.delete(`/:entity(${resources})/:id`, verifyToken, allowRoles('super_admin', 'hod', 'student', 'organizer'), controller.remove);

module.exports = router;
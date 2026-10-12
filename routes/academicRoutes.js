const express = require('express');
const router = express.Router();
const controller = require('../controllers/academicController');
const studentController = require('../controllers/academicStudentController');
const upload = require('../middleware/learningUploadMiddleware');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

const resources = 'sessions|semesters|courses|subjects|batches|sections|studentProfiles|facultyProfiles';
router.get(`/:entity(${resources})`, verifyToken, controller.list);
router.post(`/:entity(${resources})`, verifyToken, allowRoles('super_admin', 'hod', 'student', 'organizer'), controller.create);
router.patch(`/:entity(${resources})/:id`, verifyToken, controller.update);
router.delete(`/:entity(${resources})/:id`, verifyToken, allowRoles('super_admin', 'hod', 'student', 'organizer'), controller.remove);

router.get('/student/subjects', verifyToken, allowRoles('student'), studentController.subjects);
router.get('/student/faculty', verifyToken, allowRoles('student'), studentController.faculty);
router.get('/student/mentor', verifyToken, allowRoles('student'), studentController.mentor);
router.get('/student/syllabus', verifyToken, allowRoles('student'), studentController.syllabus);
router.post('/student/registrations', verifyToken, allowRoles('student'), studentController.register);
router.get('/student/registrations', verifyToken, studentController.registrations);
router.patch('/student/registrations/:id', verifyToken, allowRoles('super_admin', 'hod'), studentController.reviewRegistration);
router.get('/student/calendar', verifyToken, allowRoles('student'), studentController.calendar);
router.post('/student/requests', verifyToken, allowRoles('student'), upload.single('document'), studentController.submitRequest);
router.get('/student/requests', verifyToken, studentController.requests);
router.get('/student/requests/:id/document', verifyToken, studentController.requestDocument);
router.patch('/student/requests/:id', verifyToken, allowRoles('super_admin', 'hod'), studentController.reviewRequest);
router.get('/student/syllabus/manage', verifyToken, allowRoles('super_admin', 'hod'), studentController.manageSyllabus);
router.post('/student/syllabus', verifyToken, allowRoles('super_admin', 'hod'), studentController.createSyllabus);
router.get('/student/calendar/manage', verifyToken, allowRoles('super_admin', 'hod'), studentController.manageCalendar);
router.patch('/student/syllabus/:id', verifyToken, allowRoles('super_admin', 'hod'), studentController.updateSyllabus);
router.delete('/student/syllabus/:id', verifyToken, allowRoles('super_admin', 'hod'), studentController.deleteSyllabus);
router.post('/student/calendar', verifyToken, allowRoles('super_admin'), studentController.createCalendarEvent);
router.patch('/student/calendar/:id', verifyToken, allowRoles('super_admin'), studentController.updateCalendarEvent);
router.delete('/student/calendar/:id', verifyToken, allowRoles('super_admin'), studentController.deleteCalendarEvent);

module.exports = router;

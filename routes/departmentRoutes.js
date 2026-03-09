const express = require('express');
const router = express.Router();

const departmentController = require('../controllers/departmentController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

// GET ALL DEPARTMENTS
router.get(
"/",
verifyToken,
departmentController.getDepartments
);

// CREATE DEPARTMENT
router.post(
"/create",
verifyToken,
allowRoles("super_admin"),
departmentController.createDepartment
);

// ASSIGN HOD
router.post(
"/assign-hod",
verifyToken,
allowRoles("super_admin"),
departmentController.assignHOD
);

// DELETE DEPARTMENT
router.post(
"/delete",
verifyToken,
allowRoles("super_admin"),
departmentController.deleteDepartment
);

module.exports = router;
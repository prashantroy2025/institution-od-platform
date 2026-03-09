const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');


// -------- DEBUG (REMOVE LATER) --------
console.log("Admin Controller:", adminController);
console.log("verifyToken:", verifyToken);
console.log("allowRoles:", allowRoles);
// -------------------------------------

// SYSTEM STATS
router.get(
"/stats",
verifyToken,
allowRoles("super_admin"),
adminController.getSystemStats
);

// GET USERS
router.get(
"/users",
verifyToken,
allowRoles("super_admin"),
adminController.getUsers
);

// DEACTIVATE USER
router.post(
"/deactivate",
verifyToken,
allowRoles("super_admin"),
adminController.deactivateUser
);

router.get(
"/users/:role",
verifyToken,
allowRoles("super_admin"),
adminController.getUsersByRole
)

router.post(
"/delete-user",
verifyToken,
allowRoles("super_admin"),
adminController.deleteUser
)

router.get(
"/participants/:event_id",
verifyToken,
allowRoles("super_admin"),
adminController.getEventParticipants
)

router.get(
"/events",
verifyToken,
allowRoles("super_admin"),
adminController.getAllEvents
)

router.get(
"/search-users",
verifyToken,
allowRoles("super_admin"),
adminController.searchUsers
)

router.get(
"/attendance-analytics",
verifyToken,
allowRoles("super_admin"),
adminController.getAttendanceAnalytics
)

router.get(
"/export-participants/:event_id",
verifyToken,
allowRoles("super_admin"),
adminController.exportParticipants
)

router.get(
"/export-participants-all",
verifyToken,
allowRoles("super_admin"),
adminController.exportAllParticipants
)

router.get(
"/audit-logs",
verifyToken,
allowRoles("super_admin"),
adminController.getAuditLogs
)

router.get(
"/export-users",
verifyToken,
allowRoles("super_admin"),
adminController.exportUsers
)

router.get(
"/export-events",
verifyToken,
allowRoles("super_admin"),
adminController.exportEvents
)

router.get(
"/export-attendance",
verifyToken,
allowRoles("super_admin"),
adminController.exportAttendance
)

router.get(
"/export-audit",
verifyToken,
allowRoles("super_admin"),
adminController.exportAuditLogs
)


module.exports = router;
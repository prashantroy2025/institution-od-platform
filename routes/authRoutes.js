const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);

const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post(
    '/create-user',
    verifyToken,
    allowRoles('super_admin'),
    authController.createUser
);

module.exports = router;
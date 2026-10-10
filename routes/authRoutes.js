const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

router.post('/login', authController.login);

router.get('/me', verifyToken, authController.me);

router.post(
    '/create-user',
    verifyToken,
    allowRoles('super_admin'),
    authController.createUser
);

module.exports = router;
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/login', userController.login);
router.get('/profile', authMiddleware, userController.getProfile);
router.get('/roles', authMiddleware, userController.getRoles);

module.exports = router;

// POST/api/users/login Para login con identificacion y password
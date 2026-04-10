const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');


router.post('/loginUser', userController.login);
router.get('/getProfile', authMiddleware, userController.getProfile);
router.get('/roles', authMiddleware, userController.getRoles);
router.get('/getRoles', authMiddleware, userController.getRoles);
router.get('/roles/:id', authMiddleware, userController.getRoleById);
router.get('/getRoleById/:id', authMiddleware, userController.getRoleById);

module.exports = router;

// POST/api/users/login Para login con identificacion y password
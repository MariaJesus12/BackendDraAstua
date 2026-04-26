const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const readCreateAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];
const adminAccess = [authMiddleware, requireRoles(['admin', 'administrador'])];

router.post('/loginUser', userController.login);
router.get('/getProfile', authMiddleware, userController.getProfile);
router.get('/roles', authMiddleware, userController.getRoles);
router.get('/getRoles', authMiddleware, userController.getRoles);
router.get('/roles/:id', authMiddleware, userController.getRoleById);
router.get('/getRoleById/:id', authMiddleware, userController.getRoleById);
router.get('/', ...readCreateAccess, userController.listUsers);
router.get('/:id', ...readCreateAccess, userController.getUserById);
router.post('/', ...readCreateAccess, userController.createUser);
router.put('/:id', ...adminAccess, userController.updateUser);
router.patch('/:id', ...adminAccess, userController.updateUser);
router.delete('/:id', ...adminAccess, userController.deleteUser);

module.exports = router;

// POST/api/users/login Para login con identificacion y password
const express = require('express');
const router = express.Router();

const catalogoController = require('../controllers/catalogoController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const readAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];
const writeAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];

router.get('/', ...readAccess, catalogoController.listAlergias);
router.post('/', ...writeAccess, catalogoController.createAlergia);

module.exports = router;

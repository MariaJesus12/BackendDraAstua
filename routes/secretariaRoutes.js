const express = require('express');
const router = express.Router();
const secretariaController = require('../controllers/secretariaController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const secretariaAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];
const basicAuth = [authMiddleware];

router.get('/agendas', basicAuth, secretariaController.getAgendas);
router.get('/doctor-visits', basicAuth, secretariaController.getDoctorVisits);
router.get('/doctor-visits/summary', basicAuth, secretariaController.getDoctorVisitsSummary);
router.post('/doctor-visits', basicAuth, secretariaController.createDoctorVisit);

module.exports = router;
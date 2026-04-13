const express = require('express');
const router = express.Router();
const secretariaController = require('../controllers/secretariaController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const secretariaAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];
const basicAuth = [authMiddleware];

router.get('/doctors', basicAuth, secretariaController.getDoctors);
router.get('/getDoctors', basicAuth, secretariaController.getDoctors);
router.get('/agendas', secretariaAccess, secretariaController.getAgendas);
router.get('/doctor-visits', secretariaAccess, secretariaController.getDoctorVisits);
router.get('/doctor-visits/summary', secretariaAccess, secretariaController.getDoctorVisitsSummary);
router.post('/doctor-visits', secretariaAccess, secretariaController.createDoctorVisit);

module.exports = router;
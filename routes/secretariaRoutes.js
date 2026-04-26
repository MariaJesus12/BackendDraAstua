const express = require('express');
const router = express.Router();
const secretariaController = require('../controllers/secretariaController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const secretariaAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];
const basicAuth = [authMiddleware];

// Doctores
router.get('/doctors', basicAuth, secretariaController.getDoctors);
router.get('/getDoctors', basicAuth, secretariaController.getDoctors);
router.get('/getDoctorsList', basicAuth, secretariaController.getDoctorsList);

// Consultorios
router.get('/consultorios', secretariaAccess, secretariaController.getDoctorConsultorios);
router.get('/getConsultorios', secretariaAccess, secretariaController.getDoctorConsultorios);
router.get('/getConsultoriosList', secretariaAccess, secretariaController.getDoctorConsultoriosList);

// Visitas de doctores
router.get('/doctor-visits', secretariaAccess, secretariaController.getDoctorVisits);
router.get('/doctor-visits/:date', secretariaAccess, secretariaController.getDoctorVisitsByDate);
router.post('/doctor-visits', secretariaAccess, secretariaController.createDoctorVisit);

module.exports = router;
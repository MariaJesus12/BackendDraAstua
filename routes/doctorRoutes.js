const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const historialMedicoController = require('../controllers/historialMedicoController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const doctorHistoryAccess = [authMiddleware, requireRoles(['doctor', 'admin', 'administrador'])];

router.post('/', authMiddleware, doctorController.createDoctor);
router.post('/createDoctor', authMiddleware, doctorController.createDoctor);
router.get('/', authMiddleware, doctorController.listDoctors);
router.get('/getDoctors', authMiddleware, doctorController.listDoctors);
router.get('/especialidades', authMiddleware, doctorController.getEspecialidades);
router.get('/getEspecialidades', authMiddleware, doctorController.getEspecialidades);
router.get('/specialties', authMiddleware, doctorController.getEspecialidades);
router.get('/mis-agendas/mes', authMiddleware, doctorController.getMyAgendasByMonth);
router.get('/me/agendas/mes', authMiddleware, doctorController.getMyAgendasByMonth);
router.get('/my-agendas/month', authMiddleware, doctorController.getMyAgendasByMonth);
router.get('/search', authMiddleware, doctorController.searchDoctors);
router.get('/searchDoctors', authMiddleware, doctorController.searchDoctors);
router.get('/getDoctorById/:id', authMiddleware, doctorController.getDoctorById);
router.get('/pacientes/:identificacion/historial-medico/pdf', ...doctorHistoryAccess, historialMedicoController.downloadHistorialMedicoPdfByIdentificacion);
router.get('/patient-history/:identificacion/pdf', ...doctorHistoryAccess, historialMedicoController.downloadHistorialMedicoPdfByIdentificacion);
router.get('/:id', authMiddleware, doctorController.getDoctorById);

module.exports = router;
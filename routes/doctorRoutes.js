const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const authMiddleware = require('../middlewares/authMiddleware');

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
router.get('/:id', authMiddleware, doctorController.getDoctorById);

module.exports = router;
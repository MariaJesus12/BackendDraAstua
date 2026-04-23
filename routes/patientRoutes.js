const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, patientController.createPatient);
router.post('/createPatient', authMiddleware, patientController.createPatient);
router.get('/', authMiddleware, patientController.listPatients);
router.get('/getPatients', authMiddleware, patientController.listPatients);
router.get('/search', authMiddleware, patientController.searchPatients);
router.get('/searchPatients', authMiddleware, patientController.searchPatients);
router.get('/medicamentos', authMiddleware, patientController.getMedicamentos);
router.get('/getMedicamentos', authMiddleware, patientController.getMedicamentos);
router.get('/alergias', authMiddleware, patientController.getAlergias);
router.get('/getAlergias', authMiddleware, patientController.getAlergias);
router.get('/enfermedades', authMiddleware, patientController.getEnfermedades);
router.get('/getEnfermedades', authMiddleware, patientController.getEnfermedades);
router.get('/:id/relaciones', authMiddleware, patientController.getPatientRelationsById);
router.get('/:id/relations', authMiddleware, patientController.getPatientRelationsById);
router.get('/getPatientRelationsById/:id', authMiddleware, patientController.getPatientRelationsById);
router.get('/:id/catalogos-relaciones', authMiddleware, patientController.getPatientSelectableCatalogsById);
router.get('/:id/selectable-relations', authMiddleware, patientController.getPatientSelectableCatalogsById);
router.get('/getPatientSelectableCatalogsById/:id', authMiddleware, patientController.getPatientSelectableCatalogsById);
router.get('/getPatientById/:id', authMiddleware, patientController.getPatientById);
router.get('/:id', authMiddleware, patientController.getPatientById);

module.exports = router;
const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, patientController.createPatient);
router.get('/', authMiddleware, patientController.listPatients);
router.get('/:id', authMiddleware, patientController.getPatientById);

module.exports = router;
const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, doctorController.createDoctor);
router.get('/', authMiddleware, doctorController.listDoctors);
router.get('/:id', authMiddleware, doctorController.getDoctorById);

module.exports = router;
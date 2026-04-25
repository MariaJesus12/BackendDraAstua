const express = require('express');
const router = express.Router();

const expedienteController = require('../controllers/expedienteController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');
const { expedienteDocumentsUpload } = require('../middlewares/uploadMiddleware');

const expedienteReadAccess = [authMiddleware, requireRoles(['doctor', 'admin', 'administrador', 'secretaria'])];
const expedienteWriteAccess = [authMiddleware, requireRoles(['doctor', 'admin', 'administrador'])];

router.get('/citas/:citaId/abrir', ...expedienteReadAccess, expedienteController.openExpedienteByCita);
router.get('/citas/:id/expediente', ...expedienteReadAccess, expedienteController.openExpedienteByCita);
router.get('/documentos/sas-temporal', ...expedienteReadAccess, expedienteController.getDocumentoTemporarySas);
router.post('/documentos/sas-temporal', ...expedienteReadAccess, expedienteController.getDocumentoTemporarySas);
router.get('/:id', ...expedienteReadAccess, expedienteController.getExpedienteById);
router.post('/:id/observaciones', ...expedienteWriteAccess, expedienteController.createObservacion);
router.post('/detalles/:detalleId/documentos', ...expedienteWriteAccess, expedienteDocumentsUpload, expedienteController.attachDocumento);
router.post('/observaciones/:observacionId/documentos', ...expedienteWriteAccess, expedienteDocumentsUpload, expedienteController.attachDocumento);

module.exports = router;

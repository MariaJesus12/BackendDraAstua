const express = require('express');
const router = express.Router();
const agendaController = require('../controllers/agendaController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const agendaReadAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];
const agendaWriteAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];
const agendaStatusAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];

router.post('/agendas', ...agendaWriteAccess, agendaController.createAgenda);
router.get('/agendas/por-mes', ...agendaReadAccess, agendaController.listAgendasByMonth);
router.get('/agendas/por-especialidad', ...agendaReadAccess, agendaController.listAgendasByEspecialidad);
router.get('/agendas', ...agendaReadAccess, agendaController.listAgendas);
router.get('/agendas/:id', ...agendaReadAccess, agendaController.getAgendaById);
router.get('/citas', ...agendaReadAccess, agendaController.listCitas);
router.get('/citas/tipos-consulta', ...agendaReadAccess, agendaController.getTiposConsulta);
router.patch('/citas/:id/asignar', ...agendaWriteAccess, agendaController.assignPacienteToCita);
router.patch('/citas/:id/estado', ...agendaStatusAccess, agendaController.updateCitaEstado);
router.patch('/citas/:id', ...agendaWriteAccess, agendaController.updateCita);
router.patch('/citas/:id/desasignar', ...agendaWriteAccess, agendaController.unassignPacienteFromCita);

module.exports = router;

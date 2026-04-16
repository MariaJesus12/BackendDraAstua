const express = require('express');
const router = express.Router();
const agendaController = require('../controllers/agendaController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRoles = require('../middlewares/roleMiddleware');

const secretariaAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];

router.post('/agendas', ...secretariaAccess, agendaController.createAgenda);
router.get('/agendas', ...secretariaAccess, agendaController.listAgendas);
router.get('/agendas/:id', ...secretariaAccess, agendaController.getAgendaById);
router.get('/citas', ...secretariaAccess, agendaController.listCitas);
router.patch('/citas/:id/asignar', ...secretariaAccess, agendaController.assignPacienteToCita);
router.patch('/citas/:id', ...secretariaAccess, agendaController.updateCita);
router.patch('/citas/:id/desasignar', ...secretariaAccess, agendaController.unassignPacienteFromCita);

module.exports = router;

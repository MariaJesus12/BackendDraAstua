const Agenda = require('../models/agenda');

function pickFirstDefined(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function normalizeDateInput(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  const isoMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const slashMatch = rawValue.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
  }

  return rawValue;
}

function normalizeTimeInput(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  const timeMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hours = String(timeMatch[1]).padStart(2, '0');
    const minutes = String(timeMatch[2]).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  return rawValue;
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractPositiveInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return parsePositiveInt(
      value.id ??
      value.value ??
      value.doctorId ??
      value.doctor_id ??
      value.especialidadId ??
      value.especialidad_id ??
      value.specialtyId ??
      value.specialty_id
    );
  }

  return parsePositiveInt(value);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
}

function handleAgendaError(res, error, fallbackMessage) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'DUPLICATE_AGENDA') {
    return res.status(409).json({ error: error.message });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con los mismos datos únicos' });
  }

  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: 'Falta una tabla requerida en la base de datos para esta operación' });
  }

  if (error && error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ error: 'Existe un campo inválido en una consulta de agendas/citas' });
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Uno de los ids enviados no existe o no cumple una relación requerida' });
  }

  console.error(fallbackMessage, error.message, error.stack);
  return res.status(500).json({ error: fallbackMessage });
}

exports.createAgenda = async (req, res) => {
  try {
    const rawBody = req.body || {};
    const nestedAgenda = rawBody.agenda && typeof rawBody.agenda === 'object' ? rawBody.agenda : {};
    const body = { ...rawBody, ...nestedAgenda };

    const doctorInput = pickFirstDefined([
      body.doctorId,
      body.doctor_id,
      body.doctor,
      body.doctorSeleccionado,
      body.selectedDoctor,
      body.doctorValue
    ]);
    const especialidadInput = pickFirstDefined([
      body.especialidadId,
      body.especialidad_id,
      body.specialtyId,
      body.specialty_id,
      body.especialidad,
      body.specialty,
      body.especialidadSeleccionada,
      body.selectedSpecialty,
      body.specialtyValue
    ]);
    const intervalInput = pickFirstDefined([
      body.intervalMinutes,
      body.intervalo_minutos,
      body.interval,
      body.duracionBase,
      body.intervalo,
      body.intervaloMinutos,
      body.slotDuration,
      body.duracion
    ]);
    const date = normalizeDateInput(pickFirstDefined([
      body.date,
      body.fecha,
      body.selectedDate,
      body.agendaDate,
      body.fechaAgenda
    ]));
    const startTime = normalizeTimeInput(pickFirstDefined([
      body.startTime,
      body.hora_inicio,
      body.start_time,
      body.horaInicio,
      body.horaInicial
    ]));
    const endTime = normalizeTimeInput(pickFirstDefined([
      body.endTime,
      body.hora_fin,
      body.end_time,
      body.horaFin,
      body.horaFinal
    ]));

    const doctorId = extractPositiveInt(doctorInput);
    const especialidadId = extractPositiveInt(especialidadInput);
    const intervalMinutes = extractPositiveInt(intervalInput);

    if (!doctorId) {
      return res.status(400).json({
        error: 'doctorId es obligatorio',
        receivedKeys: Object.keys(body),
        acceptedFields: ['doctorId', 'doctor_id', 'doctor', 'doctorSeleccionado', 'selectedDoctor', 'doctorValue']
      });
    }

    if (!date || !isValidDate(date)) {
      return res.status(400).json({
        error: 'date es obligatorio y debe tener formato YYYY-MM-DD',
        receivedKeys: Object.keys(body),
        acceptedFields: ['date', 'fecha', 'selectedDate', 'agendaDate', 'fechaAgenda']
      });
    }

    if (!startTime || !isValidTime(startTime) || !endTime || !isValidTime(endTime)) {
      return res.status(400).json({
        error: 'startTime y endTime son obligatorios y deben tener formato HH:MM',
        receivedKeys: Object.keys(body),
        acceptedFields: [
          'startTime', 'hora_inicio', 'start_time', 'horaInicio', 'horaInicial',
          'endTime', 'hora_fin', 'end_time', 'horaFin', 'horaFinal'
        ]
      });
    }

    if (!intervalMinutes) {
      return res.status(400).json({
        error: 'intervalMinutes es obligatorio y debe ser un entero positivo',
        receivedKeys: Object.keys(body),
        acceptedFields: ['intervalMinutes', 'intervalo_minutos', 'interval', 'duracionBase', 'intervalo', 'intervaloMinutos', 'slotDuration', 'duracion']
      });
    }

    const agenda = await Agenda.createAgenda({
      doctorId,
      especialidadId,
      intervalMinutes,
      date,
      startTime,
      endTime
    });

    return res.status(201).json({ agenda });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno creando agenda');
  }
};

exports.listAgendas = async (req, res) => {
  try {
    const doctorId = parsePositiveInt(pickFirstDefined([req.query.doctorId, req.query.doctor_id]));
    const date = normalizeDateInput(pickFirstDefined([req.query.date, req.query.fecha]));

    if (date && !isValidDate(date)) {
      return res.status(400).json({ error: 'date debe tener formato YYYY-MM-DD' });
    }

    const agendas = await Agenda.findAgendas({ doctorId, date });
    return res.status(200).json({ agendas, items: agendas, total: agendas.length });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno obteniendo agendas');
  }
};

exports.getAgendaById = async (req, res) => {
  try {
    const agendaId = parsePositiveInt(req.params.id);
    if (!agendaId) {
      return res.status(400).json({ error: 'El id de la agenda es inválido' });
    }

    const agenda = await Agenda.findAgendaById(agendaId);
    if (!agenda) {
      return res.status(404).json({ error: 'Agenda no encontrada' });
    }

    return res.status(200).json({ agenda });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno obteniendo agenda');
  }
};

exports.listCitas = async (req, res) => {
  try {
    const agendaId = parsePositiveInt(pickFirstDefined([req.query.agendaId, req.query.agenda_id]));
    const doctorId = parsePositiveInt(pickFirstDefined([req.query.doctorId, req.query.doctor_id]));
    const date = normalizeDateInput(pickFirstDefined([req.query.date, req.query.fecha]));

    if (!agendaId && !(doctorId && date)) {
      return res.status(400).json({ error: 'Debe enviar agendaId o doctorId + date para consultar citas' });
    }

    if (date && !isValidDate(date)) {
      return res.status(400).json({ error: 'date debe tener formato YYYY-MM-DD' });
    }

    const citas = await Agenda.findCitas({ agendaId, doctorId, date });
    return res.status(200).json({ citas, items: citas, total: citas.length });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno obteniendo citas');
  }
};

exports.assignPacienteToCita = async (req, res) => {
  try {
    const body = req.body || {};
    const citaId = parsePositiveInt(req.params.id);
    const pacienteId = parsePositiveInt(pickFirstDefined([body.pacienteId, body.paciente_id]));
    const expedienteId = parsePositiveInt(pickFirstDefined([body.expedienteId, body.expediente_id]));
    const duracion = parsePositiveInt(pickFirstDefined([body.duracion, body.duration]));
    const motivo = pickFirstDefined([body.motivo, body.reason]);
    const notas = pickFirstDefined([body.notas, body.notes]);
    const tipoConsulta = pickFirstDefined([body.tipoConsulta, body.tipo_consulta, body.consultationType]);

    if (!citaId) {
      return res.status(400).json({ error: 'El id de la cita es inválido' });
    }

    const cita = await Agenda.assignPacienteToCita({
      citaId,
      pacienteId,
      expedienteId,
      duracion,
      motivo,
      notas,
      tipoConsulta
    });

    return res.status(200).json({ cita });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno asignando paciente a cita');
  }
};

exports.updateCita = async (req, res) => {
  try {
    const body = req.body || {};
    const citaId = parsePositiveInt(req.params.id);
    const hasPacienteId = Object.prototype.hasOwnProperty.call(body, 'pacienteId') || Object.prototype.hasOwnProperty.call(body, 'paciente_id');
    const hasExpedienteId = Object.prototype.hasOwnProperty.call(body, 'expedienteId') || Object.prototype.hasOwnProperty.call(body, 'expediente_id');
    const hasConsultorioId =
      Object.prototype.hasOwnProperty.call(body, 'consultorioId') ||
      Object.prototype.hasOwnProperty.call(body, 'consultorio_id') ||
      Object.prototype.hasOwnProperty.call(body, 'roomId') ||
      Object.prototype.hasOwnProperty.call(body, 'room_id');
    const hasMotivo = Object.prototype.hasOwnProperty.call(body, 'motivo') || Object.prototype.hasOwnProperty.call(body, 'reason');
    const hasNotas = Object.prototype.hasOwnProperty.call(body, 'notas') || Object.prototype.hasOwnProperty.call(body, 'notes');
    const hasTipoConsulta =
      Object.prototype.hasOwnProperty.call(body, 'tipoConsulta') ||
      Object.prototype.hasOwnProperty.call(body, 'tipo_consulta') ||
      Object.prototype.hasOwnProperty.call(body, 'consultationType');

    const pacienteId = hasPacienteId ? parsePositiveInt(pickFirstDefined([body.pacienteId, body.paciente_id])) : undefined;
    const expedienteId = hasExpedienteId ? parsePositiveInt(pickFirstDefined([body.expedienteId, body.expediente_id])) : undefined;
    const consultorioId = hasConsultorioId
      ? parsePositiveInt(pickFirstDefined([body.consultorioId, body.consultorio_id, body.roomId, body.room_id]))
      : undefined;
    const motivo = hasMotivo ? (body.motivo ?? body.reason) : undefined;
    const notas = hasNotas ? (body.notas ?? body.notes) : undefined;
    const tipoConsulta = hasTipoConsulta ? (body.tipoConsulta ?? body.tipo_consulta ?? body.consultationType) : undefined;

    if (!citaId) {
      return res.status(400).json({ error: 'El id de la cita es inválido' });
    }

    const cita = await Agenda.updateCita({
      citaId,
      pacienteId,
      expedienteId,
      consultorioId,
      motivo,
      notas,
      tipoConsulta
    });

    return res.status(200).json({ cita });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno actualizando cita');
  }
};

exports.unassignPacienteFromCita = async (req, res) => {
  try {
    const citaId = parsePositiveInt(req.params.id);
    if (!citaId) {
      return res.status(400).json({ error: 'El id de la cita es inválido' });
    }

    const cita = await Agenda.unassignPacienteFromCita({ citaId });
    return res.status(200).json({ cita });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno desasignando paciente de cita');
  }
};

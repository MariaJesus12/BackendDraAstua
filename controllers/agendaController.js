const Agenda = require('../models/agenda');

const TIPO_CONSULTA_OPTIONS = [
  { value: 'primera_vez', label: 'Primera vez' },
  { value: 'control', label: 'Control' },
  { value: 'urgencia', label: 'Urgencia' }
];

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

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function extractPositiveInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return parsePositiveInt(
      value.id ??
      value.value ??
      value.pacienteId ??
      value.paciente_id ??
      value.patientId ??
      value.patient_id ??
      value.expedienteId ??
      value.expediente_id ??
      value.recordId ??
      value.record_id ??
      value.consultorioId ??
      value.consultorio_id ??
      value.roomId ??
      value.room_id ??
      value.duracion ??
      value.duration ??
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

function extractStringFromSelect(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    const candidate =
      value.value ??
      value.id ??
      value.key ??
      value.code ??
      value.tipoConsulta ??
      value.tipo_consulta ??
      value.consultationType;

    return String(candidate || '').trim();
  }

  return String(value).trim();
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

  if (error && error.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({ error: 'Faltan datos requeridos para completar la operación solicitada' });
  }

  if (error && error.code === 'ER_TRUNCATED_WRONG_VALUE') {
    return res.status(400).json({ error: 'Uno de los valores enviados tiene un formato inválido para la base de datos' });
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
      body.slotMinutes,
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
        acceptedFields: ['intervalMinutes', 'intervalo_minutos', 'interval', 'duracionBase', 'intervalo', 'intervaloMinutos', 'slotMinutes', 'slotDuration', 'duracion']
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

exports.listAgendasByMonth = async (req, res) => {
  try {
    const yearRaw = pickFirstDefined([req.query.year, req.query.anio, req.query.año, req.query.anyo]);
    const monthRaw = pickFirstDefined([req.query.month, req.query.mes]);
    const doctorId = parsePositiveInt(pickFirstDefined([req.query.doctorId, req.query.doctor_id]));

    const year = parsePositiveInt(yearRaw);
    const month = parsePositiveInt(monthRaw);

    if (!year || year < 2000 || year > 2100) {
      return res.status(400).json({
        error: 'year es obligatorio y debe ser un año válido (2000-2100)',
        acceptedFields: ['year', 'anio', 'año', 'anyo']
      });
    }

    if (!month || month < 1 || month > 12) {
      return res.status(400).json({
        error: 'month es obligatorio y debe ser un número entre 1 y 12',
        acceptedFields: ['month', 'mes']
      });
    }

    const agendas = await Agenda.findAgendasByMonth({ year, month, doctorId });
    return res.status(200).json({ agendas, items: agendas, total: agendas.length, year, month });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno obteniendo agendas por mes');
  }
};

exports.listAgendasByEspecialidad = async (req, res) => {
  try {
    const especialidadId = parsePositiveInt(pickFirstDefined([
      req.query.especialidadId,
      req.query.especialidad_id,
      req.query.specialtyId,
      req.query.specialty_id,
      req.query.especialidad,
      req.query.specialty
    ]));
    const doctorId = parsePositiveInt(pickFirstDefined([req.query.doctorId, req.query.doctor_id]));
    const date = normalizeDateInput(pickFirstDefined([req.query.date, req.query.fecha]));

    if (!especialidadId) {
      return res.status(400).json({
        error: 'especialidadId es obligatorio',
        acceptedFields: ['especialidadId', 'especialidad_id', 'specialtyId', 'specialty_id', 'especialidad', 'specialty']
      });
    }

    if (date && !isValidDate(date)) {
      return res.status(400).json({ error: 'date debe tener formato YYYY-MM-DD' });
    }

    const agendas = await Agenda.findAgendasByEspecialidad({ especialidadId, doctorId, date });
    return res.status(200).json({ agendas, items: agendas, total: agendas.length });
  } catch (error) {
    return handleAgendaError(res, error, 'Error interno obteniendo agendas por especialidad');
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

exports.getTiposConsulta = async (req, res) => {
  return res.status(200).json({
    tiposConsulta: TIPO_CONSULTA_OPTIONS,
    consultationTypes: TIPO_CONSULTA_OPTIONS,
    items: TIPO_CONSULTA_OPTIONS,
    total: TIPO_CONSULTA_OPTIONS.length
  });
};

exports.assignPacienteToCita = async (req, res) => {
  try {
    const body = req.body || {};
    const citaId = parsePositiveInt(req.params.id);
    const pacienteId = extractPositiveInt(pickFirstDefined([
      body.pacienteId,
      body.paciente_id,
      body.patientId,
      body.patient_id,
      body.paciente,
      body.patient,
      body.selectedPatient,
      body.patientValue
    ]));
    const expedienteId = extractPositiveInt(pickFirstDefined([
      body.expedienteId,
      body.expediente_id,
      body.recordId,
      body.record_id,
      body.expediente,
      body.record,
      body.selectedRecord,
      body.recordValue
    ]));
    const duracion = extractPositiveInt(pickFirstDefined([body.duracion, body.duration]));
    const motivo = pickFirstDefined([body.motivo, body.reason]);
    const notas = pickFirstDefined([body.notas, body.notes]);
    const tipoConsulta = extractStringFromSelect(
      pickFirstDefined([
        body.tipoConsulta,
        body.tipo_consulta,
        body.consultationType,
        body.selectedConsultationType,
        body.consultationTypeValue
      ])
    );

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
    const hasEstado = Object.prototype.hasOwnProperty.call(body, 'estado') || Object.prototype.hasOwnProperty.call(body, 'status');
    const hasDuracion = Object.prototype.hasOwnProperty.call(body, 'duracion') || Object.prototype.hasOwnProperty.call(body, 'duration');
    const hasStartTime =
      Object.prototype.hasOwnProperty.call(body, 'startTime') ||
      Object.prototype.hasOwnProperty.call(body, 'hora_inicio') ||
      Object.prototype.hasOwnProperty.call(body, 'start_time') ||
      Object.prototype.hasOwnProperty.call(body, 'horaInicio');
    const hasEndTime =
      Object.prototype.hasOwnProperty.call(body, 'endTime') ||
      Object.prototype.hasOwnProperty.call(body, 'hora_fin') ||
      Object.prototype.hasOwnProperty.call(body, 'end_time') ||
      Object.prototype.hasOwnProperty.call(body, 'horaFin');
    const hasMoveFollowing =
      Object.prototype.hasOwnProperty.call(body, 'moveFollowing') ||
      Object.prototype.hasOwnProperty.call(body, 'reacomodarSiguientes') ||
      Object.prototype.hasOwnProperty.call(body, 'cascade') ||
      Object.prototype.hasOwnProperty.call(body, 'shiftFollowing');

    const pacienteId = hasPacienteId ? parsePositiveInt(pickFirstDefined([body.pacienteId, body.paciente_id])) : undefined;
    const expedienteId = hasExpedienteId ? parsePositiveInt(pickFirstDefined([body.expedienteId, body.expediente_id])) : undefined;
    const consultorioId = hasConsultorioId
      ? parsePositiveInt(pickFirstDefined([body.consultorioId, body.consultorio_id, body.roomId, body.room_id]))
      : undefined;
    const motivo = hasMotivo ? (body.motivo ?? body.reason) : undefined;
    const notas = hasNotas ? (body.notas ?? body.notes) : undefined;
    const tipoConsulta = hasTipoConsulta
      ? extractStringFromSelect(body.tipoConsulta ?? body.tipo_consulta ?? body.consultationType)
      : undefined;
    const estado = hasEstado ? (body.estado ?? body.status) : undefined;
    const duracion = hasDuracion ? parsePositiveInt(pickFirstDefined([body.duracion, body.duration])) : undefined;
    const startTime = hasStartTime
      ? normalizeTimeInput(pickFirstDefined([body.startTime, body.hora_inicio, body.start_time, body.horaInicio]))
      : undefined;
    const endTime = hasEndTime
      ? normalizeTimeInput(pickFirstDefined([body.endTime, body.hora_fin, body.end_time, body.horaFin]))
      : undefined;
    const moveFollowing = hasMoveFollowing
      ? parseBoolean(pickFirstDefined([body.moveFollowing, body.reacomodarSiguientes, body.cascade, body.shiftFollowing]))
      : undefined;

    if (hasMoveFollowing && moveFollowing === null) {
      return res.status(400).json({
        error: 'moveFollowing debe ser booleano',
        acceptedValues: [true, false, 1, 0, 'true', 'false', 'si', 'no'],
        acceptedFields: ['moveFollowing', 'reacomodarSiguientes', 'cascade', 'shiftFollowing']
      });
    }

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
      tipoConsulta,
      estado,
      duracion,
      startTime,
      endTime,
      moveFollowing
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

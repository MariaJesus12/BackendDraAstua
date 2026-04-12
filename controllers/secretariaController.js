const Secretaria = require('../models/secretaria');
const Doctor = require('../models/doctor');

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

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || '').trim());
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
}

function compareTimes(startTime, endTime) {
  return String(startTime).localeCompare(String(endTime));
}

function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = String(time).split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes + minutesToAdd;
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const resultHours = String(Math.floor(normalizedMinutes / 60)).padStart(2, '0');
  const resultMinutes = String(normalizedMinutes % 60).padStart(2, '0');
  return `${resultHours}:${resultMinutes}`;
}

function normalizeStatus(estado) {
  const normalized = String(estado || '').trim().toLowerCase();
  if (normalized === 'pendiente') {
    return 'scheduled';
  }
  if (normalized === 'atendida') {
    return 'completed';
  }
  if (normalized === 'cancelada') {
    return 'cancelled';
  }
  return normalized || 'scheduled';
}

function parseAuditMetadataRows(rows) {
  const metadataByCitaId = new Map();

  for (const row of rows) {
    if (metadataByCitaId.has(row.cita_id)) {
      continue;
    }

    try {
      const parsed = JSON.parse(row.descripcion);
      if (parsed && parsed.source === 'secretaria-doctor-visit') {
        metadataByCitaId.set(row.cita_id, parsed);
      }
    } catch (error) {
      continue;
    }
  }

  return metadataByCitaId;
}

function mapVisit(row, metadataByCitaId) {
  const metadata = metadataByCitaId.get(row.id) || {};
  const endTime = metadata.endTime && isValidTime(metadata.endTime)
    ? metadata.endTime
    : addMinutes(row.hora_inicio, 30);
  const notes = metadata.notes || null;
  const status = normalizeStatus(row.estado);

  return {
    id: row.id,
    doctor_id: row.doctor_id,
    doctorId: row.doctor_id,
    doctor_name: row.doctor_name,
    doctorName: row.doctor_name,
    fecha: row.fecha,
    date: row.fecha,
    hora_inicio: row.hora_inicio,
    startTime: row.hora_inicio,
    hora_fin: endTime,
    endTime,
    estado: row.estado,
    status,
    motivo: row.motivo || null,
    reason: row.motivo || null,
    notas: notes,
    notes,
    especialidad: row.especialidad || null,
    specialty: row.especialidad || null
  };
}

function groupAgendaItems(visits) {
  const agendasByKey = new Map();

  for (const visit of visits) {
    const key = `${visit.doctor_id}|${visit.fecha}|${visit.especialidad || ''}`;
    const current = agendasByKey.get(key);

    if (!current) {
      agendasByKey.set(key, {
        id: visit.id,
        doctor_id: visit.doctor_id,
        doctorId: visit.doctorId,
        doctor_name: visit.doctor_name,
        doctorName: visit.doctorName,
        especialidad: visit.especialidad,
        specialty: visit.specialty,
        consultorio: null,
        room: null,
        fecha: visit.fecha,
        date: visit.date,
        hora_inicio: visit.hora_inicio,
        startTime: visit.startTime,
        hora_fin: visit.hora_fin,
        endTime: visit.endTime,
        total_citas: 1,
        totalAppointments: 1
      });
      continue;
    }

    if (visit.hora_inicio < current.hora_inicio) {
      current.hora_inicio = visit.hora_inicio;
      current.startTime = visit.startTime;
      current.id = visit.id;
    }

    if (visit.hora_fin > current.hora_fin) {
      current.hora_fin = visit.hora_fin;
      current.endTime = visit.endTime;
    }

    current.total_citas += 1;
    current.totalAppointments += 1;
  }

  return Array.from(agendasByKey.values()).sort((a, b) => {
    const dateComparison = String(a.fecha).localeCompare(String(b.fecha));
    if (dateComparison !== 0) {
      return dateComparison;
    }

    const doctorComparison = String(a.doctor_name).localeCompare(String(b.doctor_name));
    if (doctorComparison !== 0) {
      return doctorComparison;
    }

    return String(a.hora_inicio).localeCompare(String(b.hora_inicio));
  });
}

function handleDatabaseError(res, error, fallbackMessage) {
  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: 'Falta una tabla requerida en la base de datos para esta operacion' });
  }

  if (error && error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ error: 'Existe un campo invalido en la consulta configurada para esta operacion' });
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Uno de los ids enviados no existe o no cumple una relacion requerida' });
  }

  console.error(fallbackMessage, error.message, error.stack);
  return res.status(500).json({ error: fallbackMessage });
}

exports.getAgendas = async (req, res) => {
  try {
    console.log('📅 getAgendas llamado con query:', req.query);
    
    const fromDate = req.query.fromDate || req.query.from_date;
    const toDate = req.query.toDate || req.query.to_date;
    
    console.log('📝 Fechas normalizadas:', { fromDate, toDate });

    if (!fromDate || !toDate || !isValidDate(fromDate) || !isValidDate(toDate)) {
      console.log('❌ Fechas inválidas:', { fromDate, toDate });
      return res.status(400).json({
        error: 'fromDate y toDate son obligatorios y deben tener formato YYYY-MM-DD',
        received: { fromDate, toDate }
      });
    }

    if (String(fromDate) > String(toDate)) {
      return res.status(400).json({ error: 'fromDate no puede ser mayor que toDate' });
    }

    console.log('🔍 Buscando citas entre', fromDate, 'y', toDate);
    const rows = await Secretaria.findDoctorVisitRows(fromDate, toDate);
    console.log('✅ Citas encontradas:', rows.length);
    
    if (!rows.length) {
      return res.status(200).json({ agendas: [] });
    }
    
    const metadataRows = await Secretaria.findAuditMetadataByCitaIds(rows.map((row) => row.id));
    const metadataByCitaId = parseAuditMetadataRows(metadataRows);
    const visits = rows.map((row) => mapVisit(row, metadataByCitaId));
    const agendas = groupAgendaItems(visits);

    console.log('✅ Agendas agrupadas:', agendas.length);
    return res.status(200).json({ agendas });
  } catch (error) {
    console.error('❌ Error en getAgendas:', error.message, error.stack);
    return handleDatabaseError(res, error, 'Error interno obteniendo agendas');
  }
};

exports.getDoctorVisits = async (req, res) => {
  try {
    console.log('📅 getDoctorVisits llamado con query:', req.query);
    
    const date = req.query.date || req.query.fecha;
    console.log('📝 Fecha normalizada:', date);
    
    if (!date || !isValidDate(date)) {
      console.log('❌ Fecha inválida:', date);
      return res.status(400).json({
        error: 'date es obligatorio y debe tener formato YYYY-MM-DD',
        received: { date }
      });
    }

    console.log('🔍 Buscando citas para:', date);
    const rows = await Secretaria.findDoctorVisitRowsByDate(date);
    console.log('✅ Citas encontradas:', rows.length);
    
    if (!rows.length) {
      return res.status(200).json({ visits: [] });
    }
    
    const metadataRows = await Secretaria.findAuditMetadataByCitaIds(rows.map((row) => row.id));
    const metadataByCitaId = parseAuditMetadataRows(metadataRows);
    const visits = rows.map((row) => mapVisit(row, metadataByCitaId));

    console.log('✅ Visitas mappadas:', visits.length);
    return res.status(200).json({ visits });
  } catch (error) {
    console.error('❌ Error en getDoctorVisits:', error.message, error.stack);
    return handleDatabaseError(res, error, 'Error interno obteniendo visitas de doctores');
  }
};

exports.getDoctorVisitsSummary = async (req, res) => {
  try {
    const { month } = req.query;
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'month es obligatorio y debe tener formato YYYY-MM' });
    }

    const rows = await Secretaria.findDoctorVisitsSummaryByMonth(month);
    const summary = {};
    for (const row of rows) {
      summary[row.fecha] = Number(row.cantidad);
    }

    return res.status(200).json(summary);
  } catch (error) {
    return handleDatabaseError(res, error, 'Error interno obteniendo resumen de visitas');
  }
};

exports.getDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.findAll();

    return res.status(200).json({
      doctors,
      items: doctors,
      total: doctors.length
    });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error interno obteniendo doctores');
  }
};

exports.createDoctorVisit = async (req, res) => {
  try {
    const body = req.body || {};
    console.log('🔍 Body recibido en createDoctorVisit:', JSON.stringify(body));

    const doctorIdRaw = pickFirstDefined([body.doctorId, body.doctor_id]);
    const doctorId = doctorIdRaw ? Number(doctorIdRaw) : NaN;

    const expedienteIdRaw = pickFirstDefined([body.expedienteId, body.expediente_id]);
    const expedienteId = expedienteIdRaw && expedienteIdRaw !== '' ? Number(expedienteIdRaw) : null;

    const dateRaw = pickFirstDefined([body.date, body.fecha]);
    const date = normalizeDateInput(dateRaw);

    const startTimeRaw = pickFirstDefined([body.startTime, body.hora_inicio, body.start_time]);
    const startTime = normalizeTimeInput(startTimeRaw);

    const endTimeRaw = pickFirstDefined([body.endTime, body.hora_fin, body.end_time]);
    const endTime = normalizeTimeInput(endTimeRaw);

    const reason = String(pickFirstDefined([body.reason, body.motivo]) || '').trim();
    const notes = String(pickFirstDefined([body.notes, body.notas]) || '').trim();

    console.log('📋 Datos normalizados:', { doctorId, date, startTime, endTime, reason, notes });

    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      console.error('❌ doctorId inválido:', doctorIdRaw, '-> Number:', doctorId);
      return res.status(400).json({
        error: 'doctorId es obligatorio y debe ser un entero positivo',
        received: { doctorIdRaw, doctorId },
        acceptedFields: ['doctorId', 'doctor_id']
      });
    }

    if (!date || !isValidDate(date)) {
      console.error('❌ date inválido:', dateRaw, '-> normalized:', date);
      return res.status(400).json({
        error: 'date es obligatorio y debe tener formato YYYY-MM-DD',
        received: { dateRaw, date },
        acceptedFields: ['date', 'fecha']
      });
    }

    if (!startTime || !isValidTime(startTime)) {
      console.error('❌ startTime inválido:', startTimeRaw, '-> normalized:', startTime);
      return res.status(400).json({
        error: 'startTime es obligatorio y debe tener formato HH:MM',
        received: { startTimeRaw, startTime },
        acceptedFields: ['startTime', 'hora_inicio', 'start_time']
      });
    }

    if (!endTime || !isValidTime(endTime)) {
      console.error('❌ endTime inválido:', endTimeRaw, '-> normalized:', endTime);
      return res.status(400).json({
        error: 'endTime es obligatorio y debe tener formato HH:MM',
        received: { endTimeRaw, endTime },
        acceptedFields: ['endTime', 'hora_fin', 'end_time']
      });
    }

    if (compareTimes(startTime, endTime) >= 0) {
      return res.status(400).json({ error: 'endTime debe ser mayor que startTime', startTime, endTime });
    }

    const doctor = await Secretaria.findDoctorById(doctorId);
    if (!doctor) {
      console.error('❌ Doctor no encontrado:', doctorId);
      return res.status(404).json({ error: 'Doctor no encontrado', doctorId });
    }

    if (!doctor.activo) {
      console.error('❌ Doctor inactivo:', doctorId);
      return res.status(400).json({ error: 'El doctor indicado esta inactivo', doctorId });
    }

    if (String(doctor.rol_nombre).trim().toLowerCase() !== 'doctor') {
      console.error('❌ Usuario no tiene rol doctor:', doctorId, 'rol:', doctor.rol_nombre);
      return res.status(400).json({ error: 'El usuario indicado no pertenece al rol doctor', doctorId });
    }

    const especialidadId = await Secretaria.findDoctorPrimarySpecialtyId(doctorId);
    console.log('✅ Especialidad encontrada:', especialidadId);

    const createdVisitRow = await Secretaria.createDoctorVisit({
      doctorId,
      expedienteId: Number.isInteger(expedienteId) && expedienteId > 0 ? expedienteId : null,
      especialidadId,
      date,
      startTime,
      endTime,
      reason,
      notes,
      createdBy: req.user.id
    });

    if (!createdVisitRow) {
      console.error('❌ No se pudo recuperar la visita creada');
      return res.status(500).json({ error: 'No se pudo recuperar la visita creada' });
    }

    const visit = mapVisit(
      {
        ...createdVisitRow,
        motivo: createdVisitRow.motivo || reason,
        estado: createdVisitRow.estado || 'pendiente'
      },
      new Map([[createdVisitRow.id, { endTime, notes }]])
    );

    console.log('✅ Visita creada exitosamente:', visit.id);
    return res.status(201).json({ visit });
  } catch (error) {
    console.error('❌ Error en createDoctorVisit:', error.message, error.stack);
    return handleDatabaseError(res, error, 'Error interno creando visita de doctor');
  }
};
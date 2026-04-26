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
  if (normalized === 'programada') {
    return 'scheduled';
  }
  if (normalized === 'atendida') {
    return 'completed';
  }
  if (normalized === 'completada') {
    return 'completed';
  }
  if (normalized === 'cancelada') {
    return 'cancelled';
  }
  return normalized || 'scheduled';
}

function normalizeVisitStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'programada';
  }

  if (normalized === 'scheduled' || normalized === 'pendiente') {
    return 'programada';
  }

  if (normalized === 'completed') {
    return 'completada';
  }

  if (normalized === 'cancelled') {
    return 'cancelada';
  }

  return normalized;
}

function isValidVisitStatus(value) {
  return ['programada', 'completada', 'cancelada'].includes(String(value || '').trim().toLowerCase());
}

function normalizePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveActorId(userPayload) {
  const payload = userPayload || {};
  const candidate = pickFirstDefined([
    payload.id,
    payload.userId,
    payload.usuarioId,
    payload.usuario_id,
    payload.sub
  ]);

  return normalizePositiveInt(candidate);
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
  const endTime = row.hora_fin && isValidTime(row.hora_fin)
    ? row.hora_fin
    : (metadata.endTime && isValidTime(metadata.endTime)
      ? metadata.endTime
      : addMinutes(row.hora_inicio, 30));
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
    consultorio_id: row.consultorio_id || null,
    consultorioId: row.consultorio_id || null,
    consultorio_nombre: row.consultorio_nombre || null,
    consultorioNombre: row.consultorio_nombre || null,
    room: row.consultorio_nombre || null,
    especialidad: row.especialidad || null,
    specialty: row.especialidad || null
  };
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

  if (error && error.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({
      error: 'Falta un dato obligatorio para guardar la visita (revise doctorId, consultorioId, fecha y horas)',
      detail: error.sqlMessage || error.message
    });
  }

  if (error && error.code === 'ER_DATA_TOO_LONG') {
    return res.status(422).json({
      error: 'Uno de los campos supera la longitud permitida por la base de datos',
      detail: error.sqlMessage || error.message
    });
  }

  if (error && error.code === 'ER_TRUNCATED_WRONG_VALUE') {
    return res.status(400).json({
      error: 'Uno de los valores enviados tiene formato invalido para la base de datos',
      detail: error.sqlMessage || error.message
    });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'Conflicto de datos: ya existe una visita para el consultorio y fecha indicada',
      detail: error.sqlMessage || error.message
    });
  }

  console.error(fallbackMessage, error.message, error.stack);
  return res.status(500).json({ error: fallbackMessage });
}


exports.getDoctorVisits = async (req, res) => {
  try {
    console.log('📅 getDoctorVisits llamado con query:', req.query);
    
    const date = req.query.date || req.query.fecha;
    console.log('📝 Fecha normalizada:', date);
    
    if (!date || !isValidDate(date)) {
      console.log('❌ Fecha inválida:', date);
      return res.status(400).json({
        error: 'date es obligatorio y debe tener formato YYYY-MM-DD',
        received: { date },
        acceptedFields: ['date', 'fecha']
      });
    }

    console.log('🔍 Buscando visitas para:', date);
    const rows = await Secretaria.findDoctorVisitRowsByDate(date);
    console.log('✅ Visitas encontradas:', rows.length);
    
    if (!rows.length) {
      return res.status(200).json({ visits: [] });
    }
    
    const metadataRows = await Secretaria.findAuditMetadataByCitaIds(rows.map((row) => row.id));
    const metadataByCitaId = parseAuditMetadataRows(metadataRows);
    const visits = rows.map((row) => mapVisit(row, metadataByCitaId));

    console.log('✅ Visitas mappadas y retornadas:', visits.length);
    return res.status(200).json({ visits });
  } catch (error) {
    console.error('❌ Error en getDoctorVisits:', error.message, error.stack);
    return handleDatabaseError(res, error, 'Error interno obteniendo visitas de doctores');
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

exports.getDoctorConsultorios = async (req, res) => {
  try {
    console.log('🏥 getDoctorConsultorios llamado');
    const consultorios = await Secretaria.findAllConsultorios();

    return res.status(200).json({
      consultorios,
      items: consultorios,
      total: consultorios.length
    });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error interno obteniendo consultorios');
  }
};

exports.getDoctorsList = async (req, res) => {
  try {
    console.log('👨‍⚕️ getDoctorsList llamado (retorna array simple)');
    const doctors = await Doctor.findAll();
    return res.status(200).json(doctors);
  } catch (error) {
    return handleDatabaseError(res, error, 'Error interno obteniendo lista de doctores');
  }
};

exports.getDoctorConsultoriosList = async (req, res) => {
  try {
    console.log('🏥 getDoctorConsultoriosList llamado (retorna array simple)');
    const consultorios = await Secretaria.findAllConsultorios();
    return res.status(200).json(consultorios);
  } catch (error) {
    return handleDatabaseError(res, error, 'Error interno obteniendo lista de consultorios');
  }
};

exports.getDoctorVisitsByDate = async (req, res) => {
  try {
    const { date } = req.params;
    console.log('📅 getDoctorVisitsByDate llamado para fecha:', date);

    if (!date || !isValidDate(date)) {
      console.log('❌ Fecha inválida en URL:', date);
      return res.status(400).json({
        error: 'date es obligatorio y debe tener formato YYYY-MM-DD',
        received: { date }
      });
    }

    console.log('🔍 Buscando visitas para:', date);
    const rows = await Secretaria.findDoctorVisitRowsByDate(date);
    console.log('✅ Visitas encontradas:', rows.length);

    if (!rows.length) {
      return res.status(200).json([]);
    }

    const metadataRows = await Secretaria.findAuditMetadataByCitaIds(rows.map((row) => row.id));
    const metadataByCitaId = parseAuditMetadataRows(metadataRows);
    const visits = rows.map((row) => mapVisit(row, metadataByCitaId));

    console.log('✅ Visitas mapeadas:', visits.length);
    return res.status(200).json(visits);
  } catch (error) {
    console.error('❌ Error en getDoctorVisitsByDate:', error.message, error.stack);
    return handleDatabaseError(res, error, 'Error interno obteniendo visitas por fecha');
  }
};

exports.createDoctorVisit = async (req, res) => {
  try {
    const body = req.body || {};
    console.log('🔍 Body recibido en createDoctorVisit:', JSON.stringify(body));

    const doctorIdRaw = pickFirstDefined([body.doctorId, body.doctor_id]);
    const doctorId = doctorIdRaw ? Number(doctorIdRaw) : NaN;

    const dateRaw = pickFirstDefined([body.date, body.fecha]);
    const date = normalizeDateInput(dateRaw);

    const startTimeRaw = pickFirstDefined([body.startTime, body.hora_inicio, body.start_time]);
    const startTime = normalizeTimeInput(startTimeRaw);

    const endTimeRaw = pickFirstDefined([body.endTime, body.hora_fin, body.end_time]);
    const endTime = normalizeTimeInput(endTimeRaw);

    const consultorioIdRaw = pickFirstDefined([body.consultorioId, body.consultorio_id, body.roomId, body.room_id]);
    const consultorioId = normalizePositiveInt(consultorioIdRaw);

    const reason = String(pickFirstDefined([body.reason, body.motivo]) || '').trim();
    const notes = String(pickFirstDefined([body.notes, body.notas]) || '').trim();
    const estado = normalizeVisitStatus(pickFirstDefined([body.status, body.estado]));

    console.log('📋 Datos normalizados:', { doctorId, consultorioId, date, startTime, endTime, estado, reason, notes });

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

    if (!consultorioId) {
      return res.status(400).json({
        error: 'consultorioId es obligatorio y debe ser un entero positivo',
        received: { consultorioIdRaw },
        acceptedFields: ['consultorioId', 'consultorio_id', 'roomId', 'room_id']
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

    if (!isValidVisitStatus(estado)) {
      return res.status(400).json({
        error: 'estado/status invalido. Valores permitidos: programada, completada, cancelada',
        received: { estado }
      });
    }

    const doctor = await Secretaria.findDoctorById(doctorId);
    if (!doctor) {
      console.error('❌ Doctor no encontrado:', doctorId);
      return res.status(404).json({ error: 'Doctor no encontrado', doctorId });
    }

    if (!Number(doctor.activo)) {
      console.error('❌ Doctor inactivo:', doctorId);
      return res.status(400).json({ error: 'El doctor indicado esta inactivo', doctorId });
    }

    const createdBy = resolveActorId(req.user);
    if (!createdBy) {
      console.warn('⚠️ Token sin id de usuario compatible, se omite usuario_id en auditoria');
    }

    if (String(doctor.rol_nombre).trim().toLowerCase() !== 'doctor') {
      console.error('❌ Usuario no tiene rol doctor:', doctorId, 'rol:', doctor.rol_nombre);
      return res.status(400).json({ error: 'El usuario indicado no pertenece al rol doctor', doctorId });
    }

    const consultorio = await Secretaria.findConsultorioById(consultorioId);
    if (!consultorio) {
      return res.status(404).json({ error: 'Consultorio no encontrado', consultorioId });
    }

    const roomConflict = await Secretaria.findDoctorConflictByRoomAndDate({
      consultorioId,
      date,
      doctorId
    });
    if (roomConflict) {
      return res.status(409).json({
        error: 'El consultorio ya tiene asignado otro doctor para esa fecha',
        conflict: {
          visitId: roomConflict.id,
          doctorId: roomConflict.doctor_id,
          doctorName: roomConflict.doctor_name,
          date: roomConflict.fecha,
          consultorioId: roomConflict.consultorio_id,
          consultorioNombre: roomConflict.consultorio_nombre
        }
      });
    }

    const createdVisitRow = await Secretaria.createDoctorVisit({
      doctorId,
      consultorioId,
      date,
      startTime,
      endTime,
      status: estado,
      reason,
      notes,
      createdBy
    });

    if (!createdVisitRow) {
      console.error('❌ No se pudo recuperar la visita creada');
      return res.status(500).json({ error: 'No se pudo recuperar la visita creada' });
    }

    const visit = mapVisit(
      {
        ...createdVisitRow,
        motivo: createdVisitRow.motivo || reason,
        estado: createdVisitRow.estado || estado
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
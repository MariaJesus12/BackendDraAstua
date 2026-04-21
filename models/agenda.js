const DbService = require('../config/database');

const db = DbService.getInstance();
const PLACEHOLDER_IDENTIFICACION = 'SLOT-DISPONIBLE-SISTEMA';
const PLACEHOLDER_NOMBRE = 'Slot Disponible (Sistema)';
const ALLOWED_TIPO_CONSULTA = ['primera_vez', 'control', 'urgencia'];
const ALLOWED_ESTADOS = ['pendiente', 'atendida', 'cancelada'];
const MIN_TIMELINE_STEP_MINUTES = 1;

function createValidationError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);

  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }

  return x;
}

function gcdList(values) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));

  if (!numbers.length) {
    return MIN_TIMELINE_STEP_MINUTES;
  }

  return numbers.reduce((acc, value) => greatestCommonDivisor(acc, value));
}

function timeToMinutes(time) {
  const match = String(time || '').trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }

  return (Number(match[1]) * 60) + Number(match[2]);
}

function addMinutes(time, minutesToAdd) {
  const total = timeToMinutes(time);
  if (total === null) {
    return null;
  }

  const result = total + minutesToAdd;
  const hours = String(Math.floor(result / 60)).padStart(2, '0');
  const minutes = String(result % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDurationBetween(startTime, endTime) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return endMinutes - startMinutes;
}

function isAlignedToInterval(agendaStartTime, targetTime, intervalMinutes) {
  const agendaStartMinutes = timeToMinutes(agendaStartTime);
  const targetMinutes = timeToMinutes(targetTime);
  if (agendaStartMinutes === null || targetMinutes === null) {
    return false;
  }

  return (targetMinutes - agendaStartMinutes) % intervalMinutes === 0;
}

function normalizeNullableText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function getRowDuration(row, intervalMinutes) {
  return toPositiveInt(row.duracion) || getDurationBetween(row.hora_inicio, row.hora_fin) || intervalMinutes;
}

function isPersistentScheduledItem(row, intervalMinutes, targetId) {
  if (Number(row.id) === Number(targetId)) {
    return true;
  }

  const duration = getRowDuration(row, intervalMinutes);
  const isFreePendingSlot =
    !row.paciente_id &&
    !row.consultorio_id &&
    !row.motivo &&
    !row.notas &&
    !row.tipo_consulta &&
    row.estado === 'pendiente';

  if (isFreePendingSlot) {
    return false;
  }

  return Boolean(
    row.paciente_id ||
    row.consultorio_id ||
    row.motivo ||
    row.notas ||
    row.tipo_consulta ||
    row.estado === 'atendida' ||
    row.estado === 'cancelada' ||
    duration !== intervalMinutes
  );
}

async function fetchCitaById(citaId) {
  const rows = await db.query(
    `SELECT c.id,
            c.agenda_id,
            c.expediente_id,
            c.paciente_id,
            c.doctor_id,
            u.nombre AS doctor_nombre,
            c.especialidad_id,
            e.nombre AS especialidad_nombre,
            DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(c.hora, '%H:%i') AS hora,
            TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
            TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
            c.estado,
            c.motivo,
            c.notas,
            c.tipo_consulta,
            c.duracion,
            c.created_at,
            c.updated_at,
            p.nombre AS paciente_nombre
     FROM citas c
     INNER JOIN usuarios u ON u.id = c.doctor_id
     LEFT JOIN especialidades e ON e.id = c.especialidad_id
     LEFT JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.id = ?
     LIMIT 1`,
    [citaId]
  );

  return rows.length ? mapCitaRow(rows[0]) : null;
}

async function rebuildAgendaTimeline(connection, options) {
  const {
    agenda,
    citaId,
    citaRows,
    targetValues,
    placeholderExpedienteId,
    timelineStep,
    preserveFollowingTimes
  } = options;

  const intervalMinutes = Number(agenda.intervalo_minutos);
  const effectiveStepMinutes = Number(timelineStep) > 0 ? Number(timelineStep) : intervalMinutes;
  const agendaStartTime = agenda.hora_inicio;
  const agendaEndTime = agenda.hora_fin;
  const agendaStartMinutes = timeToMinutes(agendaStartTime);
  const agendaEndMinutes = timeToMinutes(agendaEndTime);
  const persistentItems = citaRows
    .filter((row) => isPersistentScheduledItem(row, intervalMinutes, citaId))
    .sort((left, right) => {
      const leftMinutes = timeToMinutes(left.hora_inicio) ?? 0;
      const rightMinutes = timeToMinutes(right.hora_inicio) ?? 0;
      return leftMinutes - rightMinutes || Number(left.id) - Number(right.id);
    })
    .map((row) => ({
      ...row,
      duration: getRowDuration(row, intervalMinutes)
    }));

  const targetIndex = persistentItems.findIndex((row) => Number(row.id) === Number(citaId));
  if (targetIndex === -1) {
    throw createValidationError('Cita no encontrada para recalcular la agenda');
  }

  const targetItem = persistentItems[targetIndex];
  const previousItem = targetIndex > 0 ? persistentItems[targetIndex - 1] : null;
  const previousEndTime = previousItem ? previousItem.hora_fin : agendaStartTime;

  const requestedStartTime = targetValues.startTime !== undefined ? targetValues.startTime : undefined;
  const requestedEndTime = targetValues.endTime !== undefined ? targetValues.endTime : undefined;
  const requestedDuration = targetValues.duration !== undefined ? targetValues.duration : undefined;

  let nextStartTime = targetItem.hora_inicio;
  let nextEndTime = targetItem.hora_fin;
  let nextDuration = targetItem.duration;

  if (requestedStartTime !== undefined && requestedEndTime !== undefined) {
    const derivedDuration = getDurationBetween(requestedStartTime, requestedEndTime);
    if (!derivedDuration) {
      throw createValidationError('La hora_fin debe ser mayor que la hora_inicio');
    }
    if (requestedDuration && requestedDuration !== derivedDuration) {
      throw createValidationError('La duración enviada no coincide con la hora de inicio y fin');
    }
    nextStartTime = requestedStartTime;
    nextEndTime = requestedEndTime;
    nextDuration = derivedDuration;
  } else if (requestedStartTime !== undefined && requestedDuration !== undefined) {
    nextStartTime = requestedStartTime;
    nextDuration = requestedDuration;
    nextEndTime = addMinutes(nextStartTime, nextDuration);
  } else if (requestedEndTime !== undefined && requestedDuration !== undefined) {
    nextEndTime = requestedEndTime;
    nextDuration = requestedDuration;
    nextStartTime = addMinutes(nextEndTime, -nextDuration);
  } else if (requestedStartTime !== undefined) {
    nextStartTime = requestedStartTime;
    nextEndTime = addMinutes(nextStartTime, nextDuration);
  } else if (requestedEndTime !== undefined) {
    const derivedDuration = getDurationBetween(targetItem.hora_inicio, requestedEndTime);
    if (!derivedDuration) {
      throw createValidationError('La hora_fin debe ser mayor que la hora_inicio');
    }
    nextEndTime = requestedEndTime;
    nextDuration = derivedDuration;
  } else if (requestedDuration !== undefined) {
    nextDuration = requestedDuration;
    nextEndTime = addMinutes(nextStartTime, nextDuration);
  }

  if (!nextStartTime || !nextEndTime) {
    throw createValidationError('No fue posible calcular el nuevo horario de la cita');
  }

  if (!isAlignedToInterval(agendaStartTime, nextStartTime, effectiveStepMinutes) || !isAlignedToInterval(agendaStartTime, nextEndTime, effectiveStepMinutes)) {
    throw createValidationError('Las horas de la cita deben respetar el intervalo configurado en la agenda');
  }

  if (nextDuration <= 0 || nextDuration % effectiveStepMinutes !== 0) {
    throw createValidationError('La duración de la cita debe ser múltiplo del intervalo de la agenda');
  }

  if (timeToMinutes(nextStartTime) < agendaStartMinutes || timeToMinutes(nextEndTime) > agendaEndMinutes) {
    throw createValidationError('La cita debe permanecer dentro del horario de la agenda');
  }

  if (timeToMinutes(nextStartTime) < timeToMinutes(previousEndTime)) {
    throw createValidationError('La nueva hora de inicio se traslapa con la cita anterior');
  }

  const rebuiltItems = [];
  for (let index = 0; index < targetIndex; index += 1) {
    rebuiltItems.push({ ...persistentItems[index] });
  }

  rebuiltItems.push({
    ...targetItem,
    expediente_id: targetValues.expedienteId,
    paciente_id: targetValues.pacienteId,
    consultorio_id: targetValues.consultorioId,
    motivo: targetValues.motivo,
    notas: targetValues.notas,
    tipo_consulta: targetValues.tipoConsulta,
    estado: targetValues.estado,
    hora: nextStartTime,
    hora_inicio: nextStartTime,
    hora_fin: nextEndTime,
    duration: nextDuration,
    duracion: nextDuration
  });

  let cursorTime = nextEndTime;
  for (let index = targetIndex + 1; index < persistentItems.length; index += 1) {
    const currentItem = persistentItems[index];
    const currentDuration = currentItem.duration;
    if (preserveFollowingTimes) {
      if (timeToMinutes(currentItem.hora_inicio) < timeToMinutes(cursorTime)) {
        throw createValidationError('La cita modificada se traslapa con la siguiente. Ajuste la hora/duración o habilite reacomodar siguientes.');
      }

      rebuiltItems.push({
        ...currentItem,
        duration: currentDuration,
        duracion: currentDuration
      });

      cursorTime = currentItem.hora_fin;
    } else {
      const shiftedEndTime = addMinutes(cursorTime, currentDuration);
      if (timeToMinutes(shiftedEndTime) > agendaEndMinutes) {
        throw createValidationError('La agenda no tiene suficiente espacio para reacomodar las citas con la nueva duración');
      }

      rebuiltItems.push({
        ...currentItem,
        hora: cursorTime,
        hora_inicio: cursorTime,
        hora_fin: shiftedEndTime,
        duration: currentDuration,
        duracion: currentDuration
      });

      cursorTime = shiftedEndTime;
    }
  }

  const finalItems = rebuiltItems.sort((left, right) => {
    const leftMinutes = timeToMinutes(left.hora_inicio) ?? 0;
    const rightMinutes = timeToMinutes(right.hora_inicio) ?? 0;
    return leftMinutes - rightMinutes || Number(left.id) - Number(right.id);
  });

  let scanTime = agendaStartTime;
  const slotValues = [];
  for (const item of finalItems) {
    const itemStartMinutes = timeToMinutes(item.hora_inicio);
    const scanMinutes = timeToMinutes(scanTime);
    if (itemStartMinutes < scanMinutes) {
      throw createValidationError('El nuevo horario produce un traslape entre citas');
    }

    const gapDuration = itemStartMinutes - scanMinutes;
    if (gapDuration % effectiveStepMinutes !== 0) {
      throw createValidationError('El reajuste dejó un espacio inválido en la agenda');
    }

    while (timeToMinutes(scanTime) < itemStartMinutes) {
      const slotEndTime = addMinutes(scanTime, effectiveStepMinutes);
      slotValues.push([
        placeholderExpedienteId,
        agenda.doctor_id,
        item.especialidad_id || agenda.especialidad_id,
        agenda.fecha,
        scanTime,
        'pendiente',
        null,
        agenda.id,
        null,
        scanTime,
        slotEndTime,
        null,
        effectiveStepMinutes,
        null,
        null
      ]);
      scanTime = slotEndTime;
    }

    scanTime = item.hora_fin;
  }

  const remainingDuration = timeToMinutes(agendaEndTime) - timeToMinutes(scanTime);
  if (remainingDuration % effectiveStepMinutes !== 0) {
    throw createValidationError('El reajuste dejó un espacio inválido al final de la agenda');
  }

  while (timeToMinutes(scanTime) < agendaEndMinutes) {
    const slotEndTime = addMinutes(scanTime, effectiveStepMinutes);
    slotValues.push([
      placeholderExpedienteId,
      agenda.doctor_id,
      finalItems[0]?.especialidad_id || agenda.especialidad_id,
      agenda.fecha,
      scanTime,
      'pendiente',
      null,
      agenda.id,
      null,
      scanTime,
      slotEndTime,
      null,
      effectiveStepMinutes,
      null,
      null
    ]);
    scanTime = slotEndTime;
  }

  for (const item of finalItems) {
    const persistedExpedienteId = item.paciente_id ? item.expediente_id : placeholderExpedienteId;
    const persistedEstado = item.estado || 'pendiente';

    await connection.execute(
      `UPDATE citas
       SET expediente_id = ?,
           paciente_id = ?,
           consultorio_id = ?,
           motivo = ?,
           notas = ?,
           tipo_consulta = ?,
           estado = ?,
           hora = ?,
           hora_inicio = ?,
           hora_fin = ?,
           duracion = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        persistedExpedienteId,
        item.paciente_id || null,
        item.consultorio_id || null,
        item.motivo || null,
        item.notas || null,
        item.tipo_consulta || null,
        persistedEstado,
        item.hora_inicio,
        item.hora_inicio,
        item.hora_fin,
        item.duracion,
        item.id
      ]
    );
  }

  const keepIds = finalItems.map((item) => Number(item.id));
  const keepPlaceholders = keepIds.map(() => '?').join(', ');
  await connection.execute(
    `DELETE FROM citas
     WHERE agenda_id = ?
       AND id NOT IN (${keepPlaceholders})`,
    [agenda.id, ...keepIds]
  );

  if (slotValues.length) {
    const valuesClause = slotValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').join(', ');
    await connection.execute(
      `INSERT INTO citas (
        expediente_id,
        doctor_id,
        especialidad_id,
        fecha,
        hora,
        estado,
        motivo,
        agenda_id,
        paciente_id,
        hora_inicio,
        hora_fin,
        consultorio_id,
        duracion,
        notas,
        tipo_consulta,
        created_at,
        updated_at
      ) VALUES ${valuesClause}`,
      slotValues.flat()
    );
  }
}

function mapCitaRow(row) {
  const disponible = !row.paciente_id && row.estado === 'pendiente';
  const expedienteVisible = row.paciente_id ? row.expediente_id : null;

  return {
    id: row.id,
    agenda_id: row.agenda_id,
    agendaId: row.agenda_id,
    expediente_id: expedienteVisible,
    expedienteId: expedienteVisible,
    paciente_id: row.paciente_id,
    pacienteId: row.paciente_id,
    paciente_nombre: row.paciente_nombre || null,
    pacienteNombre: row.paciente_nombre || null,
    doctor_id: row.doctor_id,
    doctorId: row.doctor_id,
    doctor_nombre: row.doctor_nombre,
    doctorNombre: row.doctor_nombre,
    especialidad_id: row.especialidad_id,
    especialidadId: row.especialidad_id,
    especialidad_nombre: row.especialidad_nombre || null,
    especialidadNombre: row.especialidad_nombre || null,
    fecha: row.fecha,
    date: row.fecha,
    hora: row.hora,
    hora_inicio: row.hora_inicio,
    startTime: row.hora_inicio,
    hora_fin: row.hora_fin,
    endTime: row.hora_fin,
    estado: row.estado,
    status: row.estado,
    motivo: row.motivo || null,
    notas: row.notas || null,
    notes: row.notas || null,
    tipo_consulta: row.tipo_consulta || null,
    tipoConsulta: row.tipo_consulta || null,
    duracion: row.duracion,
    duration: row.duracion,
    disponible,
    available: disponible,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapAgendaRow(row) {
  return {
    id: row.id,
    doctor_id: row.doctor_id,
    doctorId: row.doctor_id,
    doctor_nombre: row.doctor_nombre,
    doctorNombre: row.doctor_nombre,
    doctor: row.doctor_nombre,
    doctorName: row.doctor_nombre,
    nombreDoctor: row.doctor_nombre,
    nombre_doctor: row.doctor_nombre,
    fecha: row.fecha,
    date: row.fecha,
    hora_inicio: row.hora_inicio,
    startTime: row.hora_inicio,
    hora_fin: row.hora_fin,
    endTime: row.hora_fin,
    intervalo_minutos: row.intervalo_minutos,
    intervalMinutes: row.intervalo_minutos,
    especialidad_id: row.especialidad_id || null,
    especialidadId: row.especialidad_id || null,
    especialidad_nombre: row.especialidad_nombre || null,
    especialidadNombre: row.especialidad_nombre || null,
    total_citas: row.total_citas || 0,
    totalCitas: row.total_citas || 0,
    citas_disponibles: row.citas_disponibles || 0,
    citasDisponibles: row.citas_disponibles || 0,
    citas_ocupadas: row.citas_ocupadas || 0,
    citasOcupadas: row.citas_ocupadas || 0,
    created_at: row.created_at
  };
}

async function findDoctorRow(connection, doctorId) {
  const [rows] = await connection.execute(
    `SELECT u.id, u.nombre, u.activo, r.nombre AS rol_nombre
     FROM usuarios u
     INNER JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?
     LIMIT 1`,
    [doctorId]
  );

  return rows.length ? rows[0] : null;
}

async function resolveDoctorEspecialidadId(connection, doctorId, explicitEspecialidadId) {
  const [rows] = await connection.execute(
    `SELECT de.especialidad_id AS id, e.nombre
     FROM doctor_especialidad de
     INNER JOIN especialidades e ON e.id = de.especialidad_id
     WHERE de.doctor_id = ?
     ORDER BY e.nombre ASC`,
    [doctorId]
  );

  const specialtyIds = rows.map((row) => Number(row.id));

  if (explicitEspecialidadId) {
    const [specialtyRows] = await connection.execute(
      `SELECT id
       FROM especialidades
       WHERE id = ?
       LIMIT 1`,
      [explicitEspecialidadId]
    );

    if (!specialtyRows.length) {
      throw createValidationError('La especialidad indicada no existe');
    }

    if (!specialtyIds.includes(explicitEspecialidadId)) {
      // Autorrepara datos: vincula doctor-especialidad si faltaba la relación.
      await connection.execute(
        `INSERT INTO doctor_especialidad (doctor_id, especialidad_id)
         VALUES (?, ?)`,
        [doctorId, explicitEspecialidadId]
      );
    }

    return explicitEspecialidadId;
  }

  if (!rows.length) {
    // Fallback seguro: usa una especialidad disponible para permitir crear agenda
    // y crea la relación faltante para mantener consistencia.
    const [catalogRows] = await connection.execute(
      `SELECT id
       FROM especialidades
       ORDER BY id ASC
       LIMIT 1`
    );

    if (!catalogRows.length) {
      throw createValidationError('No hay especialidades registradas para crear agendas');
    }

    const fallbackEspecialidadId = Number(catalogRows[0].id);
    await connection.execute(
      `INSERT INTO doctor_especialidad (doctor_id, especialidad_id)
       VALUES (?, ?)`,
      [doctorId, fallbackEspecialidadId]
    );

    return fallbackEspecialidadId;
  }

  if (specialtyIds.length > 1) {
    throw createValidationError('Debe indicar la especialidad para un doctor con múltiples especialidades');
  }

  return specialtyIds[0];
}

async function findOrCreateExpediente(connection, pacienteId) {
  const [existingRows] = await connection.execute(
    `SELECT id, paciente_id
     FROM expedientes
     WHERE paciente_id = ? AND activo = 1
     ORDER BY id DESC
     LIMIT 1`,
    [pacienteId]
  );

  if (existingRows.length) {
    return existingRows[0];
  }

  const [result] = await connection.execute(
    `INSERT INTO expedientes (paciente_id, activo, created_at)
     VALUES (?, 1, CURRENT_TIMESTAMP)`,
    [pacienteId]
  );

  return {
    id: result.insertId,
    paciente_id: pacienteId
  };
}

async function findPacienteRow(connection, pacienteId) {
  const [rows] = await connection.execute(
    `SELECT id, nombre, activo
     FROM pacientes
     WHERE id = ?
     LIMIT 1`,
    [pacienteId]
  );

  return rows.length ? rows[0] : null;
}

async function findExpedienteRow(connection, expedienteId) {
  const [rows] = await connection.execute(
    `SELECT e.id, e.paciente_id, e.activo, p.nombre AS paciente_nombre, p.activo AS paciente_activo
     FROM expedientes e
     INNER JOIN pacientes p ON p.id = e.paciente_id
     WHERE e.id = ?
     LIMIT 1`,
    [expedienteId]
  );

  return rows.length ? rows[0] : null;
}

async function getOrCreatePlaceholderExpedienteId(connection) {
  const [existingPlaceholderRows] = await connection.execute(
    `SELECT expediente_id
     FROM citas
     WHERE paciente_id IS NULL
       AND expediente_id IS NOT NULL
     ORDER BY id ASC
     LIMIT 1`
  );

  if (existingPlaceholderRows.length) {
    return Number(existingPlaceholderRows[0].expediente_id);
  }

  const [pacienteRows] = await connection.execute(
    `SELECT id
     FROM pacientes
     WHERE identificacion = ?
     LIMIT 1`,
    [PLACEHOLDER_IDENTIFICACION]
  );

  let pacienteId;
  if (pacienteRows.length) {
    pacienteId = Number(pacienteRows[0].id);
  } else {
    const [pacienteInsert] = await connection.execute(
      `INSERT INTO pacientes (nombre, identificacion, activo, created_at, updated_at)
       VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [PLACEHOLDER_NOMBRE, PLACEHOLDER_IDENTIFICACION]
    );
    pacienteId = Number(pacienteInsert.insertId);
  }

  const [expedienteRows] = await connection.execute(
    `SELECT id
     FROM expedientes
     WHERE paciente_id = ?
     LIMIT 1`,
    [pacienteId]
  );

  if (expedienteRows.length) {
    return Number(expedienteRows[0].id);
  }

  const [expedienteInsert] = await connection.execute(
    `INSERT INTO expedientes (paciente_id, activo, created_at)
     VALUES (?, 0, CURRENT_TIMESTAMP)`,
    [pacienteId]
  );

  return Number(expedienteInsert.insertId);
}

async function findConsultorioRow(connection, consultorioId) {
  const [rows] = await connection.execute(
    `SELECT id, nombre
     FROM consultorios
     WHERE id = ?
     LIMIT 1`,
    [consultorioId]
  );

  return rows.length ? rows[0] : null;
}

const Agenda = {
  async createAgenda(payload) {
    const doctorId = toPositiveInt(payload.doctorId);
    const intervalMinutes = toPositiveInt(payload.intervalMinutes);
    const explicitEspecialidadId = toPositiveInt(payload.especialidadId);
    const date = String(payload.date || '').trim();
    const startTime = String(payload.startTime || '').trim();
    const endTime = String(payload.endTime || '').trim();

    if (!doctorId || !intervalMinutes || !date || !startTime || !endTime) {
      throw createValidationError('doctorId, date, startTime, endTime e intervalMinutes son obligatorios');
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      throw createValidationError('El horario de la agenda es inválido');
    }

    const totalMinutes = endMinutes - startMinutes;
    if (totalMinutes % intervalMinutes !== 0) {
      throw createValidationError('El horario debe dividirse exactamente por el intervalo en minutos');
    }

    let connection;
    let agendaId;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const doctor = await findDoctorRow(connection, doctorId);
      if (!doctor) {
        throw createValidationError('Doctor no encontrado');
      }
      if (!Number(doctor.activo)) {
        throw createValidationError('El doctor indicado está inactivo');
      }
      if (String(doctor.rol_nombre).trim().toLowerCase() !== 'doctor') {
        throw createValidationError('El usuario indicado no pertenece al rol doctor');
      }

      const agendaEspecialidadId = await resolveDoctorEspecialidadId(connection, doctorId, explicitEspecialidadId);

      const [existingAgenda] = await connection.execute(
        `SELECT id
         FROM agendas
         WHERE doctor_id = ? AND fecha = ?
         LIMIT 1`,
        [doctorId, date]
      );

      if (existingAgenda.length) {
        const error = createValidationError('Ya existe una agenda para ese doctor y fecha', 'DUPLICATE_AGENDA');
        throw error;
      }

      const [agendaResult] = await connection.execute(
        `INSERT INTO agendas (doctor_id, fecha, hora_inicio, hora_fin, intervalo_minutos, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [doctorId, date, startTime, endTime, intervalMinutes]
      );

      agendaId = agendaResult.insertId;
      const placeholderExpedienteId = await getOrCreatePlaceholderExpedienteId(connection);

      const slotCount = totalMinutes / intervalMinutes;
      const slotValues = [];
      for (let index = 0; index < slotCount; index += 1) {
        const slotStart = addMinutes(startTime, index * intervalMinutes);
        const slotEnd = addMinutes(slotStart, intervalMinutes);
        slotValues.push([
          placeholderExpedienteId,
          doctorId,
          agendaEspecialidadId,
          date,
          slotStart,
          'pendiente',
          null,
          agendaId,
          null,
          slotStart,
          slotEnd,
          null,
          intervalMinutes,
          null,
          null
        ]);
      }

      const valuesClause = slotValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').join(', ');
      const params = slotValues.flat();
      await connection.execute(
        `INSERT INTO citas (
          expediente_id,
          doctor_id,
          especialidad_id,
          fecha,
          hora,
          estado,
          motivo,
          agenda_id,
          paciente_id,
          hora_inicio,
          hora_fin,
          consultorio_id,
          duracion,
          notas,
          tipo_consulta,
          created_at,
          updated_at
        ) VALUES ${valuesClause}`,
        params
      );

      await connection.commit();
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }

    return this.findAgendaById(agendaId);
  },

  async findAgendaById(agendaId) {
    const rows = await db.query(
      `SELECT a.id,
              a.doctor_id,
              u.nombre AS doctor_nombre,
              DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(a.hora_fin, '%H:%i') AS hora_fin,
              a.intervalo_minutos,
              a.created_at,
              MIN(c.especialidad_id) AS especialidad_id,
              MIN(e.nombre) AS especialidad_nombre,
              COUNT(c.id) AS total_citas,
              SUM(CASE WHEN c.paciente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
       FROM agendas a
       INNER JOIN usuarios u ON u.id = a.doctor_id
       LEFT JOIN citas c ON c.agenda_id = a.id
       LEFT JOIN especialidades e ON e.id = c.especialidad_id
       WHERE a.id = ?
       GROUP BY a.id, a.doctor_id, u.nombre, a.fecha, a.hora_inicio, a.hora_fin, a.intervalo_minutos, a.created_at
       LIMIT 1`,
      [agendaId]
    );

    if (!rows.length) {
      return null;
    }

    const agenda = mapAgendaRow(rows[0]);
    const citas = await this.findCitas({ agendaId });
    return {
      ...agenda,
      citas,
      slots: citas
    };
  },

  async findAgendas({ doctorId, date } = {}) {
    const conditions = [];
    const params = [];

    if (doctorId) {
      conditions.push('a.doctor_id = ?');
      params.push(doctorId);
    }

    if (date) {
      conditions.push('a.fecha = ?');
      params.push(date);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.query(
      `SELECT a.id,
              a.doctor_id,
              u.nombre AS doctor_nombre,
              DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(a.hora_fin, '%H:%i') AS hora_fin,
              a.intervalo_minutos,
              a.created_at,
              MIN(c.especialidad_id) AS especialidad_id,
              MIN(e.nombre) AS especialidad_nombre,
              COUNT(c.id) AS total_citas,
              SUM(CASE WHEN c.paciente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
       FROM agendas a
       INNER JOIN usuarios u ON u.id = a.doctor_id
       LEFT JOIN citas c ON c.agenda_id = a.id
       LEFT JOIN especialidades e ON e.id = c.especialidad_id
       ${whereClause}
       GROUP BY a.id, a.doctor_id, u.nombre, a.fecha, a.hora_inicio, a.hora_fin, a.intervalo_minutos, a.created_at
       ORDER BY a.fecha DESC, a.id DESC`,
      params
    );

    return rows.map(mapAgendaRow);
  },

  async findAgendasByMonth({ year, month, doctorId } = {}) {
    const conditions = [];
    const params = [];

    conditions.push('YEAR(a.fecha) = ?');
    params.push(year);
    conditions.push('MONTH(a.fecha) = ?');
    params.push(month);

    if (doctorId) {
      conditions.push('a.doctor_id = ?');
      params.push(doctorId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db.query(
      `SELECT a.id,
              a.doctor_id,
              u.nombre AS doctor_nombre,
              DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(a.hora_fin, '%H:%i') AS hora_fin,
              a.intervalo_minutos,
              a.created_at,
              MIN(c.especialidad_id) AS especialidad_id,
              MIN(e.nombre) AS especialidad_nombre,
              COUNT(c.id) AS total_citas,
              SUM(CASE WHEN c.paciente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
       FROM agendas a
       INNER JOIN usuarios u ON u.id = a.doctor_id
       LEFT JOIN citas c ON c.agenda_id = a.id
       LEFT JOIN especialidades e ON e.id = c.especialidad_id
       ${whereClause}
       GROUP BY a.id, a.doctor_id, u.nombre, a.fecha, a.hora_inicio, a.hora_fin, a.intervalo_minutos, a.created_at
       ORDER BY a.fecha ASC, a.id ASC`,
      params
    );

    return rows.map(mapAgendaRow);
  },

  async findAgendasByEspecialidad({ especialidadId, especialidadNombre, doctorId, date } = {}) {
    const conditions = [];
    const params = [];

    if (especialidadId) {
      conditions.push('e.id = ?');
      params.push(especialidadId);
    } else if (especialidadNombre) {
      conditions.push('e.nombre LIKE ?');
      params.push(`%${especialidadNombre}%`);
    }

    if (doctorId) {
      conditions.push('a.doctor_id = ?');
      params.push(doctorId);
    }

    if (date) {
      conditions.push('a.fecha = ?');
      params.push(date);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.query(
      `SELECT a.id,
              a.doctor_id,
              u.nombre AS doctor_nombre,
              DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(a.hora_fin, '%H:%i') AS hora_fin,
              a.intervalo_minutos,
              a.created_at,
              MIN(e.id) AS especialidad_id,
              MIN(e.nombre) AS especialidad_nombre,
              COUNT(DISTINCT c.id) AS total_citas,
              SUM(CASE WHEN c.paciente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
       FROM agendas a
       INNER JOIN usuarios u ON u.id = a.doctor_id
       INNER JOIN citas c ON c.agenda_id = a.id
       INNER JOIN especialidades e ON e.id = c.especialidad_id
       ${whereClause}
       GROUP BY a.id, a.doctor_id, u.nombre, a.fecha, a.hora_inicio, a.hora_fin, a.intervalo_minutos, a.created_at
       ORDER BY a.fecha DESC, a.id DESC`,
      params
    );

    return rows.map(mapAgendaRow);
  },

  async findCitas({ agendaId, doctorId, date } = {}) {
    const conditions = [];
    const params = [];

    if (agendaId) {
      conditions.push('c.agenda_id = ?');
      params.push(agendaId);
    }

    if (doctorId) {
      conditions.push('c.doctor_id = ?');
      params.push(doctorId);
    }

    if (date) {
      conditions.push('c.fecha = ?');
      params.push(date);
    }

    if (!conditions.length) {
      throw createValidationError('Debe indicar agendaId o doctorId/date para consultar citas');
    }

    const rows = await db.query(
      `SELECT c.id,
              c.agenda_id,
              c.expediente_id,
              c.paciente_id,
              c.doctor_id,
              u.nombre AS doctor_nombre,
              c.especialidad_id,
              e.nombre AS especialidad_nombre,
              DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora, '%H:%i') AS hora,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
              c.estado,
              c.motivo,
              c.notas,
              c.tipo_consulta,
              c.duracion,
              c.created_at,
              c.updated_at,
              p.nombre AS paciente_nombre
       FROM citas c
       INNER JOIN usuarios u ON u.id = c.doctor_id
       LEFT JOIN especialidades e ON e.id = c.especialidad_id
       LEFT JOIN pacientes p ON p.id = c.paciente_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.fecha ASC, c.hora_inicio ASC, c.id ASC`,
      params
    );

    return rows.map(mapCitaRow);
  },

  async assignPacienteToCita(payload) {
    const citaId = toPositiveInt(payload.citaId);
    const pacienteId = toPositiveInt(payload.pacienteId);
    const expedienteId = toPositiveInt(payload.expedienteId);
    const requestedDuration = toPositiveInt(payload.duracion);
    const tipoConsulta = payload.tipoConsulta ? String(payload.tipoConsulta).trim() : null;
    const motivo = payload.motivo != null ? String(payload.motivo).trim() : null;
    const notas = payload.notas != null ? String(payload.notas).trim() : null;

    if (!citaId) {
      throw createValidationError('citaId es obligatorio');
    }

    if (!pacienteId && !expedienteId) {
      throw createValidationError('Debe enviar pacienteId o expedienteId para asignar la cita');
    }

    if (tipoConsulta && !ALLOWED_TIPO_CONSULTA.includes(tipoConsulta)) {
      throw createValidationError('tipoConsulta invalido. Valores permitidos: primera_vez, control, urgencia');
    }

    let connection;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [citaRows] = await connection.execute(
        `SELECT c.id,
                c.agenda_id,
                c.expediente_id,
                c.paciente_id,
                c.doctor_id,
                c.especialidad_id,
                DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
                TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
                TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
                c.estado,
                c.duracion,
                a.intervalo_minutos,
                TIME_FORMAT(a.hora_fin, '%H:%i') AS agenda_hora_fin
         FROM citas c
         INNER JOIN agendas a ON a.id = c.agenda_id
         WHERE c.id = ?
         LIMIT 1
         FOR UPDATE`,
        [citaId]
      );

      if (!citaRows.length) {
        throw createValidationError('Cita no encontrada');
      }

      const cita = citaRows[0];
      if (cita.paciente_id) {
        throw createValidationError('La cita seleccionada ya está ocupada');
      }
      if (cita.estado === 'cancelada') {
        throw createValidationError('No se puede asignar una cita cancelada');
      }

      const agendaIntervalMinutes = Number(cita.intervalo_minutos);
      const slotStepMinutes = Number(cita.duracion) || agendaIntervalMinutes;
      const duration = requestedDuration || Number(cita.duracion) || agendaIntervalMinutes;
      if (duration % slotStepMinutes !== 0) {
        throw createValidationError('La duración debe ser múltiplo del intervalo del espacio seleccionado');
      }

      const targetEndTime = addMinutes(cita.hora_inicio, duration);
      if (timeToMinutes(targetEndTime) > timeToMinutes(cita.agenda_hora_fin)) {
        throw createValidationError('La duración solicitada excede el horario disponible de la agenda');
      }

      const [rangeRows] = await connection.execute(
        `SELECT id,
                paciente_id,
                expediente_id,
                estado,
                TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
                TIME_FORMAT(hora_fin, '%H:%i') AS hora_fin
         FROM citas
         WHERE agenda_id = ?
           AND hora_inicio >= ?
           AND hora_inicio < ?
         ORDER BY hora_inicio ASC
         FOR UPDATE`,
        [cita.agenda_id, cita.hora_inicio, targetEndTime]
      );

      const requiredSlots = duration / slotStepMinutes;
      if (rangeRows.length !== requiredSlots) {
        throw createValidationError('No hay suficientes espacios consecutivos disponibles para esa duración');
      }

      for (let index = 0; index < rangeRows.length; index += 1) {
        const slot = rangeRows[index];
        const expectedStart = addMinutes(cita.hora_inicio, index * slotStepMinutes);
        if (slot.hora_inicio !== expectedStart) {
          throw createValidationError('Los espacios requeridos no son consecutivos');
        }
        if (slot.paciente_id || slot.estado === 'cancelada') {
          throw createValidationError('Uno de los espacios requeridos ya está ocupado');
        }
      }

      let resolvedPacienteId = pacienteId;
      let resolvedExpedienteId = expedienteId;

      if (resolvedExpedienteId) {
        const expediente = await findExpedienteRow(connection, resolvedExpedienteId);
        if (!expediente || !Number(expediente.activo)) {
          throw createValidationError('El expediente indicado no existe o está inactivo');
        }
        if (!Number(expediente.paciente_activo)) {
          throw createValidationError('El paciente del expediente indicado está inactivo');
        }
        if (resolvedPacienteId && Number(expediente.paciente_id) !== resolvedPacienteId) {
          throw createValidationError('El expediente indicado no pertenece al paciente enviado');
        }
        resolvedPacienteId = Number(expediente.paciente_id);
      }

      if (resolvedPacienteId) {
        const paciente = await findPacienteRow(connection, resolvedPacienteId);
        if (!paciente) {
          throw createValidationError('Paciente no encontrado');
        }
        if (!Number(paciente.activo)) {
          throw createValidationError('El paciente indicado está inactivo');
        }
        const expediente = await findOrCreateExpediente(connection, resolvedPacienteId);
        resolvedExpedienteId = expediente.id;
      }

      await connection.execute(
        `UPDATE citas
         SET expediente_id = ?,
             paciente_id = ?,
             hora = ?,
             hora_inicio = ?,
             hora_fin = ?,
             estado = 'pendiente',
             motivo = ?,
             notas = ?,
             tipo_consulta = ?,
             duracion = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          resolvedExpedienteId,
          resolvedPacienteId,
          cita.hora_inicio,
          cita.hora_inicio,
          targetEndTime,
          motivo,
          notas,
          tipoConsulta,
          duration,
          citaId
        ]
      );

      const consumedSlotIds = rangeRows.slice(1).map((slot) => slot.id);
      if (consumedSlotIds.length) {
        const placeholders = consumedSlotIds.map(() => '?').join(', ');
        await connection.execute(
          `DELETE FROM citas WHERE id IN (${placeholders})`,
          consumedSlotIds
        );
      }

      await connection.commit();
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }

    const rows = await db.query(
      `SELECT c.id,
              c.agenda_id,
              c.expediente_id,
              c.paciente_id,
              c.doctor_id,
              u.nombre AS doctor_nombre,
              c.especialidad_id,
              e.nombre AS especialidad_nombre,
              DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora, '%H:%i') AS hora,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
              c.estado,
              c.motivo,
              c.notas,
              c.tipo_consulta,
              c.duracion,
              c.created_at,
              c.updated_at,
              p.nombre AS paciente_nombre
       FROM citas c
       INNER JOIN usuarios u ON u.id = c.doctor_id
       LEFT JOIN especialidades e ON e.id = c.especialidad_id
       LEFT JOIN pacientes p ON p.id = c.paciente_id
       WHERE c.id = ?
       LIMIT 1`,
      [citaId]
    );

    return rows.length ? mapCitaRow(rows[0]) : null;
  },

  async updateCita(payload) {
    const citaId = toPositiveInt(payload.citaId);
    const pacienteId = payload.pacienteId !== undefined ? toPositiveInt(payload.pacienteId) : undefined;
    const expedienteId = payload.expedienteId !== undefined ? toPositiveInt(payload.expedienteId) : undefined;
    const consultorioId = payload.consultorioId !== undefined ? toPositiveInt(payload.consultorioId) : undefined;
    const motivo = normalizeNullableText(payload.motivo);
    const notas = normalizeNullableText(payload.notas);
    const tipoConsulta = payload.tipoConsulta !== undefined ? normalizeNullableText(payload.tipoConsulta) : undefined;
    const estado = payload.estado !== undefined ? normalizeNullableText(payload.estado)?.toLowerCase() || null : undefined;
    const requestedDuration = payload.duracion !== undefined ? toPositiveInt(payload.duracion) : undefined;
    const requestedStartTime = payload.startTime !== undefined ? String(payload.startTime).trim() : undefined;
    const requestedEndTime = payload.endTime !== undefined ? String(payload.endTime).trim() : undefined;
    const moveFollowing = payload.moveFollowing !== undefined ? Boolean(payload.moveFollowing) : false;
    const clearPaciente = Boolean(payload.clearPaciente);

    if (!citaId) {
      throw createValidationError('citaId es obligatorio');
    }

    if (tipoConsulta && !ALLOWED_TIPO_CONSULTA.includes(tipoConsulta)) {
      throw createValidationError('tipoConsulta invalido. Valores permitidos: primera_vez, control, urgencia');
    }

    if (estado && !ALLOWED_ESTADOS.includes(estado)) {
      throw createValidationError('estado invalido. Valores permitidos: pendiente, atendida, cancelada');
    }

    if (requestedStartTime !== undefined && timeToMinutes(requestedStartTime) === null) {
      throw createValidationError('La hora de inicio debe tener formato HH:MM');
    }

    if (requestedEndTime !== undefined && timeToMinutes(requestedEndTime) === null) {
      throw createValidationError('La hora de fin debe tener formato HH:MM');
    }

    if (payload.duracion !== undefined && !requestedDuration) {
      throw createValidationError('La duración debe ser un entero positivo');
    }

    let connection;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [citaRows] = await connection.execute(
        `SELECT c.id,
                c.agenda_id,
                c.expediente_id,
                c.paciente_id,
                c.doctor_id,
                c.especialidad_id,
                c.consultorio_id,
                c.estado,
                c.motivo,
                c.notas,
                c.tipo_consulta,
                c.duracion,
                TIME_FORMAT(c.hora, '%H:%i') AS hora,
                TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
                TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
                a.doctor_id,
                DATE_FORMAT(a.fecha, '%Y-%m-%d') AS agenda_fecha,
                TIME_FORMAT(a.hora_inicio, '%H:%i') AS agenda_hora_inicio,
                TIME_FORMAT(a.hora_fin, '%H:%i') AS agenda_hora_fin,
                a.intervalo_minutos
         FROM citas c
         INNER JOIN agendas a ON a.id = c.agenda_id
         WHERE c.id = ?
         LIMIT 1
         FOR UPDATE`,
        [citaId]
      );

      if (!citaRows.length) {
        throw createValidationError('Cita no encontrada');
      }

      const cita = citaRows[0];

      const [agendaRows] = await connection.execute(
        `SELECT a.id,
                a.doctor_id,
                DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
                TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
                TIME_FORMAT(a.hora_fin, '%H:%i') AS hora_fin,
                a.intervalo_minutos,
                MIN(c.especialidad_id) AS especialidad_id
         FROM agendas a
         LEFT JOIN citas c ON c.agenda_id = a.id
         WHERE a.id = ?
         GROUP BY a.id, a.doctor_id, a.fecha, a.hora_inicio, a.hora_fin, a.intervalo_minutos
         LIMIT 1
         FOR UPDATE`,
        [cita.agenda_id]
      );

      if (!agendaRows.length) {
        throw createValidationError('La agenda asociada a la cita no existe');
      }

      const agenda = agendaRows[0];

      let resolvedPacienteId = cita.paciente_id;
      let resolvedExpedienteId = cita.expediente_id;
      const placeholderExpedienteId = await getOrCreatePlaceholderExpedienteId(connection);

      if (clearPaciente) {
        resolvedPacienteId = null;
        resolvedExpedienteId = placeholderExpedienteId;
      } else if (pacienteId !== undefined || expedienteId !== undefined) {
        const incomingPacienteId = pacienteId || null;
        const incomingExpedienteId = expedienteId || null;

        if (!incomingPacienteId && !incomingExpedienteId) {
          throw createValidationError('Debe enviar pacienteId o expedienteId para reasignar la cita');
        }

        if (incomingExpedienteId) {
          const expediente = await findExpedienteRow(connection, incomingExpedienteId);
          if (!expediente || !Number(expediente.activo)) {
            throw createValidationError('El expediente indicado no existe o está inactivo');
          }
          if (!Number(expediente.paciente_activo)) {
            throw createValidationError('El paciente del expediente indicado está inactivo');
          }
          if (incomingPacienteId && Number(expediente.paciente_id) !== incomingPacienteId) {
            throw createValidationError('El expediente indicado no pertenece al paciente enviado');
          }

          resolvedPacienteId = Number(expediente.paciente_id);
          resolvedExpedienteId = incomingExpedienteId;
        }

        if (incomingPacienteId) {
          const paciente = await findPacienteRow(connection, incomingPacienteId);
          if (!paciente) {
            throw createValidationError('Paciente no encontrado');
          }
          if (!Number(paciente.activo)) {
            throw createValidationError('El paciente indicado está inactivo');
          }

          const expediente = await findOrCreateExpediente(connection, incomingPacienteId);
          resolvedPacienteId = incomingPacienteId;
          resolvedExpedienteId = expediente.id;
        }
      }

      if (!resolvedExpedienteId) {
        resolvedExpedienteId = placeholderExpedienteId;
      }

      const nextEstado = estado !== undefined ? estado : (resolvedPacienteId ? cita.estado || 'pendiente' : 'pendiente');
      if (!resolvedPacienteId && nextEstado === 'atendida') {
        throw createValidationError('No se puede marcar como atendida una cita sin paciente asignado');
      }

      let resolvedConsultorioId = cita.consultorio_id;
      if (consultorioId !== undefined) {
        if (!consultorioId) {
          resolvedConsultorioId = null;
        } else {
          const consultorio = await findConsultorioRow(connection, consultorioId);
          if (!consultorio) {
            throw createValidationError('Consultorio no encontrado');
          }
          resolvedConsultorioId = consultorioId;
        }
      }

      const [agendaCitaRows] = await connection.execute(
        `SELECT id,
                agenda_id,
                expediente_id,
                paciente_id,
                doctor_id,
                especialidad_id,
                consultorio_id,
                estado,
                motivo,
                notas,
                tipo_consulta,
                duracion,
                TIME_FORMAT(hora, '%H:%i') AS hora,
                TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
                TIME_FORMAT(hora_fin, '%H:%i') AS hora_fin
         FROM citas
         WHERE agenda_id = ?
         ORDER BY hora_inicio ASC, id ASC
         FOR UPDATE`,
        [cita.agenda_id]
      );

      await rebuildAgendaTimeline(connection, {
        agenda,
        citaId,
        citaRows: agendaCitaRows,
        placeholderExpedienteId,
        preserveFollowingTimes: !moveFollowing,
        timelineStep: (() => {
          const baseInterval = Number(agenda.intervalo_minutos);
          const hasCustomDuration = requestedDuration !== undefined && (requestedDuration % baseInterval !== 0);
          const hasCustomStart = requestedStartTime !== undefined && !isAlignedToInterval(agenda.hora_inicio, requestedStartTime, baseInterval);
          const hasCustomEnd = requestedEndTime !== undefined && !isAlignedToInterval(agenda.hora_inicio, requestedEndTime, baseInterval);

          if (!hasCustomDuration && !hasCustomStart && !hasCustomEnd) {
            return baseInterval;
          }

          const startOffset = requestedStartTime !== undefined
            ? Math.abs((timeToMinutes(requestedStartTime) ?? 0) - (timeToMinutes(agenda.hora_inicio) ?? 0))
            : 0;
          const endOffset = requestedEndTime !== undefined
            ? Math.abs((timeToMinutes(requestedEndTime) ?? 0) - (timeToMinutes(agenda.hora_inicio) ?? 0))
            : 0;
          const derivedStep = gcdList([
            baseInterval,
            requestedDuration,
            startOffset,
            endOffset
          ]) || MIN_TIMELINE_STEP_MINUTES;

          if (requestedDuration !== undefined && (requestedDuration % derivedStep !== 0)) {
            throw createValidationError(`La duración personalizada debe ser múltiplo de ${derivedStep} minuto(s)`);
          }

          if (requestedStartTime !== undefined && !isAlignedToInterval(agenda.hora_inicio, requestedStartTime, derivedStep)) {
            throw createValidationError(`La hora de inicio personalizada debe respetar pasos de ${derivedStep} minuto(s)`);
          }

          if (requestedEndTime !== undefined && !isAlignedToInterval(agenda.hora_inicio, requestedEndTime, derivedStep)) {
            throw createValidationError(`La hora de fin personalizada debe respetar pasos de ${derivedStep} minuto(s)`);
          }

          return derivedStep;
        })(),
        targetValues: {
          pacienteId: resolvedPacienteId,
          expedienteId: resolvedExpedienteId,
          consultorioId: resolvedConsultorioId,
          motivo: motivo !== undefined ? motivo : cita.motivo,
          notas: notas !== undefined ? notas : cita.notas,
          tipoConsulta: tipoConsulta !== undefined ? tipoConsulta : cita.tipo_consulta,
          estado: nextEstado,
          duration: requestedDuration !== undefined ? requestedDuration : undefined,
          startTime: requestedStartTime !== undefined ? requestedStartTime : undefined,
          endTime: requestedEndTime !== undefined ? requestedEndTime : undefined
        }
      });

      await connection.commit();
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }

    return fetchCitaById(citaId);
  },

  async unassignPacienteFromCita(payload) {
    return this.updateCita({
      citaId: payload.citaId,
      clearPaciente: true,
      motivo: null,
      notas: null,
      tipoConsulta: null
    });
  }
};

module.exports = Agenda;

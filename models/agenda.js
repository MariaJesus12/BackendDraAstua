const DbService = require('../config/database');

const db = DbService.getInstance();

function createValidationError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function mapCitaRow(row) {
  const disponible = !row.paciente_id && !row.expediente_id && row.estado === 'pendiente';

  return {
    id: row.id,
    agenda_id: row.agenda_id,
    agendaId: row.agenda_id,
    expediente_id: row.expediente_id,
    expedienteId: row.expediente_id,
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

  if (!rows.length) {
    throw createValidationError('El doctor no tiene especialidades asignadas');
  }

  const specialtyIds = rows.map((row) => Number(row.id));

  if (explicitEspecialidadId) {
    if (!specialtyIds.includes(explicitEspecialidadId)) {
      throw createValidationError('La especialidad indicada no pertenece al doctor seleccionado');
    }
    return explicitEspecialidadId;
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

      const slotCount = totalMinutes / intervalMinutes;
      const slotValues = [];
      for (let index = 0; index < slotCount; index += 1) {
        const slotStart = addMinutes(startTime, index * intervalMinutes);
        const slotEnd = addMinutes(slotStart, intervalMinutes);
        slotValues.push([
          null,
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
              SUM(CASE WHEN c.paciente_id IS NULL AND c.expediente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL OR c.expediente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
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
              SUM(CASE WHEN c.paciente_id IS NULL AND c.expediente_id IS NULL AND c.estado = 'pendiente' THEN 1 ELSE 0 END) AS citas_disponibles,
              SUM(CASE WHEN c.paciente_id IS NOT NULL OR c.expediente_id IS NOT NULL THEN 1 ELSE 0 END) AS citas_ocupadas
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

    if (tipoConsulta && !['primera_vez', 'control', 'urgencia'].includes(tipoConsulta)) {
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
      if (cita.paciente_id || cita.expediente_id) {
        throw createValidationError('La cita seleccionada ya está ocupada');
      }
      if (cita.estado === 'cancelada') {
        throw createValidationError('No se puede asignar una cita cancelada');
      }

      const intervalMinutes = Number(cita.intervalo_minutos);
      const duration = requestedDuration || Number(cita.duracion) || intervalMinutes;
      if (duration % intervalMinutes !== 0) {
        throw createValidationError('La duración debe ser múltiplo del intervalo de la agenda');
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

      const requiredSlots = duration / intervalMinutes;
      if (rangeRows.length !== requiredSlots) {
        throw createValidationError('No hay suficientes espacios consecutivos disponibles para esa duración');
      }

      for (let index = 0; index < rangeRows.length; index += 1) {
        const slot = rangeRows[index];
        const expectedStart = addMinutes(cita.hora_inicio, index * intervalMinutes);
        if (slot.hora_inicio !== expectedStart) {
          throw createValidationError('Los espacios requeridos no son consecutivos');
        }
        if (slot.paciente_id || slot.expediente_id || slot.estado === 'cancelada') {
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
    const motivo = payload.motivo !== undefined ? (payload.motivo != null ? String(payload.motivo).trim() : null) : undefined;
    const notas = payload.notas !== undefined ? (payload.notas != null ? String(payload.notas).trim() : null) : undefined;
    const tipoConsulta = payload.tipoConsulta !== undefined ? (payload.tipoConsulta ? String(payload.tipoConsulta).trim() : null) : undefined;
    const clearPaciente = Boolean(payload.clearPaciente);

    if (!citaId) {
      throw createValidationError('citaId es obligatorio');
    }

    if (tipoConsulta && !['primera_vez', 'control', 'urgencia'].includes(tipoConsulta)) {
      throw createValidationError('tipoConsulta invalido. Valores permitidos: primera_vez, control, urgencia');
    }

    let connection;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [citaRows] = await connection.execute(
        `SELECT id, agenda_id, expediente_id, paciente_id, estado, consultorio_id, motivo, notas, tipo_consulta
         FROM citas
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [citaId]
      );

      if (!citaRows.length) {
        throw createValidationError('Cita no encontrada');
      }

      const cita = citaRows[0];
      if (cita.estado === 'cancelada') {
        throw createValidationError('No se puede editar una cita cancelada');
      }

      let resolvedPacienteId = cita.paciente_id;
      let resolvedExpedienteId = cita.expediente_id;

      if (clearPaciente) {
        resolvedPacienteId = null;
        resolvedExpedienteId = null;
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

      const nextEstado = resolvedPacienteId ? 'pendiente' : 'pendiente';

      await connection.execute(
        `UPDATE citas
         SET expediente_id = ?,
             paciente_id = ?,
             consultorio_id = ?,
             motivo = ?,
             notas = ?,
             tipo_consulta = ?,
             estado = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          resolvedExpedienteId,
          resolvedPacienteId,
          resolvedConsultorioId,
          motivo !== undefined ? motivo : cita.motivo,
          notas !== undefined ? notas : cita.notas,
          tipoConsulta !== undefined ? tipoConsulta : cita.tipo_consulta,
          nextEstado,
          citaId
        ]
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

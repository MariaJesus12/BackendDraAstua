const DbService = require('../config/database');

const db = DbService.getInstance();

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function normalizeIdArray(rawValue, fieldName) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return [];
  }

  const asArray = Array.isArray(rawValue) ? rawValue : [rawValue];
  const ids = asArray.map((item) => {
    if (item && typeof item === 'object') {
      return toPositiveInt(item.id ?? item.value);
    }
    return toPositiveInt(item);
  });

  if (ids.some((id) => id === null)) {
    throw createValidationError(`${fieldName} debe contener ids enteros positivos`);
  }

  return [...new Set(ids)];
}

async function ensureCatalogIdsExist(connection, ids, tableName, label) {
  if (!ids.length) {
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id FROM ${tableName} WHERE id IN (${placeholders})`,
    ids
  );

  const existingIds = new Set(rows.map((row) => Number(row.id)));
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    throw createValidationError(`${label} contiene ids inexistentes: ${missingIds.join(', ')}`);
  }
}

async function getCitaBaseById(citaId) {
  const rows = await db.query(
    `SELECT c.id,
            c.expediente_id,
            c.paciente_id,
            c.doctor_id,
            DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora_inicio,
            TIME_FORMAT(c.hora_fin, '%H:%i') AS hora_fin,
            c.estado,
            p.nombre AS paciente_nombre,
            p.identificacion AS paciente_identificacion,
            u.nombre AS doctor_nombre
     FROM citas c
     LEFT JOIN pacientes p ON p.id = c.paciente_id
     LEFT JOIN usuarios u ON u.id = c.doctor_id
     WHERE c.id = ?
     LIMIT 1`,
    [citaId]
  );

  return rows.length ? rows[0] : null;
}

async function getObservacionesByExpedienteId(expedienteId) {
  const observaciones = await db.query(
    `SELECT o.id,
            o.expediente_id,
            o.cita_id,
            o.doctor_id,
            u.nombre AS doctor_nombre,
            o.descripcion,
            o.bloqueada,
            o.editable,
            o.created_at
     FROM observaciones o
     LEFT JOIN usuarios u ON u.id = o.doctor_id
     WHERE o.expediente_id = ?
     ORDER BY o.created_at DESC, o.id DESC`,
    [expedienteId]
  );

  if (!observaciones.length) {
    return [];
  }

  const observationIds = observaciones.map((row) => Number(row.id));
  const placeholders = observationIds.map(() => '?').join(', ');

  const [enfermedades, medicamentos, alergias, documentos] = await Promise.all([
    db.query(
      `SELECT ee.expediente_detalle_id AS observacion_id,
              e.id,
              e.nombre
       FROM expediente_enfermedades ee
       INNER JOIN enfermedades e ON e.id = ee.enfermedad_id
       WHERE ee.expediente_detalle_id IN (${placeholders})
       ORDER BY e.nombre ASC`,
      observationIds
    ),
    db.query(
      `SELECT em.expediente_detalle_id AS observacion_id,
              m.id,
              m.nombre
       FROM expediente_medicamentos em
       INNER JOIN medicamentos m ON m.id = em.medicamento_id
       WHERE em.expediente_detalle_id IN (${placeholders})
       ORDER BY m.nombre ASC`,
      observationIds
    ),
    db.query(
      `SELECT ea.expediente_detalle_id AS observacion_id,
              a.id,
              a.nombre
       FROM expediente_alergias ea
       INNER JOIN alergias a ON a.id = ea.alergia_id
       WHERE ea.expediente_detalle_id IN (${placeholders})
       ORDER BY a.nombre ASC`,
      observationIds
    ),
    db.query(
      `SELECT d.id,
              d.observacion_id,
              d.cita_id,
              d.nombre_archivo,
              d.ruta_archivo,
              d.tipo,
              d.uploaded_by,
              d.created_at
       FROM documentos d
       WHERE d.observacion_id IN (${placeholders})
       ORDER BY d.created_at DESC, d.id DESC`,
      observationIds
    )
  ]);

  const enfermedadesByObs = new Map();
  const medicamentosByObs = new Map();
  const alergiasByObs = new Map();
  const documentosByObs = new Map();

  for (const row of enfermedades) {
    const key = Number(row.observacion_id);
    if (!enfermedadesByObs.has(key)) {
      enfermedadesByObs.set(key, []);
    }
    enfermedadesByObs.get(key).push({ id: row.id, nombre: row.nombre });
  }

  for (const row of medicamentos) {
    const key = Number(row.observacion_id);
    if (!medicamentosByObs.has(key)) {
      medicamentosByObs.set(key, []);
    }
    medicamentosByObs.get(key).push({ id: row.id, nombre: row.nombre });
  }

  for (const row of alergias) {
    const key = Number(row.observacion_id);
    if (!alergiasByObs.has(key)) {
      alergiasByObs.set(key, []);
    }
    alergiasByObs.get(key).push({ id: row.id, nombre: row.nombre });
  }

  for (const row of documentos) {
    const key = Number(row.observacion_id);
    if (!documentosByObs.has(key)) {
      documentosByObs.set(key, []);
    }
    documentosByObs.get(key).push({
      id: row.id,
      observacionId: row.observacion_id,
      citaId: row.cita_id,
      nombreArchivo: row.nombre_archivo,
      rutaArchivo: row.ruta_archivo,
      tipo: row.tipo,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at
    });
  }

  return observaciones.map((row) => {
    const observationId = Number(row.id);
    return {
      id: observationId,
      expedienteId: row.expediente_id,
      citaId: row.cita_id,
      doctorId: row.doctor_id,
      doctorNombre: row.doctor_nombre || null,
      descripcion: row.descripcion || null,
      bloqueada: Boolean(row.bloqueada),
      editable: Boolean(row.editable),
      createdAt: row.created_at,
      enfermedades: enfermedadesByObs.get(observationId) || [],
      medicamentos: medicamentosByObs.get(observationId) || [],
      alergias: alergiasByObs.get(observationId) || [],
      documentos: documentosByObs.get(observationId) || []
    };
  });
}

async function getExpedienteById(expedienteId) {
  const rows = await db.query(
    `SELECT e.id,
            e.paciente_id,
            p.nombre AS paciente_nombre,
            p.identificacion AS paciente_identificacion,
            e.doctor_id,
            u.nombre AS doctor_nombre,
            e.activo,
            e.created_at
     FROM expedientes e
     INNER JOIN pacientes p ON p.id = e.paciente_id
     LEFT JOIN usuarios u ON u.id = e.doctor_id
     WHERE e.id = ?
     LIMIT 1`,
    [expedienteId]
  );

  if (!rows.length) {
    return null;
  }

  const expediente = rows[0];
  const historial = await getObservacionesByExpedienteId(expedienteId);

  return {
    id: expediente.id,
    pacienteId: expediente.paciente_id,
    pacienteNombre: expediente.paciente_nombre,
    pacienteIdentificacion: expediente.paciente_identificacion,
    doctorId: expediente.doctor_id,
    doctorNombre: expediente.doctor_nombre || null,
    activo: Boolean(expediente.activo),
    createdAt: expediente.created_at,
    observaciones: historial,
    historial,
    totalObservaciones: historial.length
  };
}

async function getObservacionById(observacionId) {
  const rows = await db.query(
    `SELECT id, expediente_id
     FROM observaciones
     WHERE id = ?
     LIMIT 1`,
    [observacionId]
  );

  if (!rows.length) {
    return null;
  }

  const expediente = await getExpedienteById(Number(rows[0].expediente_id));
  if (!expediente) {
    return null;
  }

  return expediente.observaciones.find((obs) => Number(obs.id) === Number(observacionId)) || null;
}

const Expediente = {
  async openByCita({ citaId, actorUserId, actorRoleName }) {
    const safeCitaId = toPositiveInt(citaId);
    const safeActorUserId = toPositiveInt(actorUserId);
    const normalizedRoleName = String(actorRoleName || '').trim().toLowerCase();

    if (!safeCitaId) {
      throw createValidationError('citaId es obligatorio');
    }

    if (!safeActorUserId) {
      throw createValidationError('No se pudo identificar al usuario autenticado');
    }

    let connection;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [citaRows] = await connection.execute(
        `SELECT c.id,
                c.expediente_id,
                c.paciente_id,
                c.doctor_id
         FROM citas c
         WHERE c.id = ?
         LIMIT 1
         FOR UPDATE`,
        [safeCitaId]
      );

      if (!citaRows.length) {
        throw createValidationError('Cita no encontrada');
      }

      const cita = citaRows[0];
      if (!cita.paciente_id) {
        throw createValidationError('La cita no tiene paciente asignado. No se puede abrir expediente.');
      }

      if (normalizedRoleName === 'doctor' && Number(cita.doctor_id) !== safeActorUserId) {
        const error = createValidationError('No tiene permisos para abrir expediente de una cita de otro doctor');
        error.code = 'FORBIDDEN';
        throw error;
      }

      const targetDoctorId = normalizedRoleName === 'doctor' ? safeActorUserId : Number(cita.doctor_id || safeActorUserId);
      let resolvedExpedienteId = toPositiveInt(cita.expediente_id);

      if (resolvedExpedienteId) {
        const [expRows] = await connection.execute(
          `SELECT id, paciente_id, doctor_id
           FROM expedientes
           WHERE id = ?
           LIMIT 1`,
          [resolvedExpedienteId]
        );

        const expediente = expRows.length ? expRows[0] : null;
        const matchesPaciente = expediente && Number(expediente.paciente_id) === Number(cita.paciente_id);
        const matchesDoctor = expediente && Number(expediente.doctor_id) === targetDoctorId;

        if (!matchesPaciente || !matchesDoctor) {
          resolvedExpedienteId = null;
        }
      }

      if (!resolvedExpedienteId) {
        // Cada doctor tiene su propio expediente por paciente
        const [existingRows] = await connection.execute(
          `SELECT id
           FROM expedientes
           WHERE paciente_id = ?
             AND doctor_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [cita.paciente_id, targetDoctorId]
        );

        if (existingRows.length) {
          resolvedExpedienteId = Number(existingRows[0].id);
        } else {
          const [insertResult] = await connection.execute(
            `INSERT INTO expedientes (paciente_id, activo, created_at, doctor_id)
             VALUES (?, 1, CURRENT_TIMESTAMP, ?)`,
            [cita.paciente_id, targetDoctorId]
          );
          resolvedExpedienteId = Number(insertResult.insertId);
        }

        await connection.execute(
          `UPDATE citas
           SET expediente_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [resolvedExpedienteId, safeCitaId]
        );
      }

      await connection.commit();

      const expediente = await getExpedienteById(resolvedExpedienteId);
      const citaCompleta = await getCitaBaseById(safeCitaId);
      return {
        cita: citaCompleta,
        expediente
      };
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
  },

  async getByIdForUser({ expedienteId, actorUserId, actorRoleName }) {
    const safeExpedienteId = toPositiveInt(expedienteId);
    const safeActorUserId = toPositiveInt(actorUserId);
    const normalizedRoleName = String(actorRoleName || '').trim().toLowerCase();

    if (!safeExpedienteId) {
      throw createValidationError('expedienteId es obligatorio');
    }

    const expediente = await getExpedienteById(safeExpedienteId);
    if (!expediente) {
      return null;
    }

    if (normalizedRoleName === 'doctor') {
      const accessRows = await db.query(
        `SELECT 1 AS can_access
         FROM citas
         WHERE expediente_id = ?
           AND doctor_id = ?
         LIMIT 1`,
        [safeExpedienteId, safeActorUserId]
      );

      if (!accessRows.length) {
        const error = createValidationError('No tiene permisos para ver un expediente de otro doctor');
        error.code = 'FORBIDDEN';
        throw error;
      }
    }

    return expediente;
  },

  async createObservacion(payload) {
    const expedienteId = toPositiveInt(payload.expedienteId);
    const citaId = toPositiveInt(payload.citaId);
    const doctorId = toPositiveInt(payload.doctorId);
    const descripcion = normalizeText(payload.descripcion);
    const bloqueada = normalizeBoolean(payload.bloqueada, false);
    const editable = normalizeBoolean(payload.editable, true);
    const enfermedadIds = normalizeIdArray(payload.enfermedadIds, 'enfermedadIds');
    const medicamentoIds = normalizeIdArray(payload.medicamentoIds, 'medicamentoIds');
    const alergiaIds = normalizeIdArray(payload.alergiaIds, 'alergiaIds');

    if (!expedienteId) {
      throw createValidationError('expedienteId es obligatorio');
    }
    if (!citaId) {
      throw createValidationError('citaId es obligatorio');
    }
    if (!doctorId) {
      throw createValidationError('doctorId es obligatorio');
    }
    if (!descripcion) {
      throw createValidationError('descripcion es obligatoria');
    }

    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [expRows] = await connection.execute(
        `SELECT id, doctor_id, paciente_id
         FROM expedientes
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [expedienteId]
      );

      if (!expRows.length) {
        throw createValidationError('Expediente no encontrado');
      }

      const expediente = expRows[0];

      const [citaRows] = await connection.execute(
        `SELECT id, paciente_id, doctor_id, expediente_id
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
      if (Number(cita.paciente_id || 0) !== Number(expediente.paciente_id)) {
        throw createValidationError('La cita no pertenece al paciente del expediente');
      }

      if (Number(cita.doctor_id || 0) !== Number(doctorId)) {
        const error = createValidationError('No puede registrar observaciones en una cita de otro doctor');
        error.code = 'FORBIDDEN';
        throw error;
      }

      if (!toPositiveInt(cita.expediente_id) || Number(cita.expediente_id) !== Number(expedienteId)) {
        await connection.execute(
          `UPDATE citas
           SET expediente_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [expedienteId, citaId]
        );
      }

      await ensureCatalogIdsExist(connection, enfermedadIds, 'enfermedades', 'enfermedadIds');
      await ensureCatalogIdsExist(connection, medicamentoIds, 'medicamentos', 'medicamentoIds');
      await ensureCatalogIdsExist(connection, alergiaIds, 'alergias', 'alergiaIds');

      const [insertResult] = await connection.execute(
        `INSERT INTO observaciones (cita_id, doctor_id, descripcion, bloqueada, created_at, expediente_id, editable)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [citaId, doctorId, descripcion, bloqueada ? 1 : 0, expedienteId, editable ? 1 : 0]
      );

      const observacionId = Number(insertResult.insertId);

      if (enfermedadIds.length) {
        const valuesClause = enfermedadIds.map(() => '(?, ?)').join(', ');
        const params = enfermedadIds.flatMap((id) => [observacionId, id]);
        await connection.execute(
          `INSERT INTO expediente_enfermedades (expediente_detalle_id, enfermedad_id) VALUES ${valuesClause}`,
          params
        );
      }

      if (medicamentoIds.length) {
        const valuesClause = medicamentoIds.map(() => '(?, ?)').join(', ');
        const params = medicamentoIds.flatMap((id) => [observacionId, id]);
        await connection.execute(
          `INSERT INTO expediente_medicamentos (expediente_detalle_id, medicamento_id) VALUES ${valuesClause}`,
          params
        );
      }

      if (alergiaIds.length) {
        const valuesClause = alergiaIds.map(() => '(?, ?)').join(', ');
        const params = alergiaIds.flatMap((id) => [observacionId, id]);
        await connection.execute(
          `INSERT INTO expediente_alergias (expediente_detalle_id, alergia_id) VALUES ${valuesClause}`,
          params
        );
      }

      await connection.commit();

      return getObservacionById(observacionId);
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
  },

  async attachDocumento(payload) {
    const observacionId = toPositiveInt(payload.observacionId);
    const citaId = toPositiveInt(payload.citaId);
    const uploadedBy = toPositiveInt(payload.uploadedBy);
    const nombreArchivo = normalizeText(payload.nombreArchivo);
    const rutaArchivo = normalizeText(payload.rutaArchivo);
    const tipo = normalizeText(payload.tipo) || 'archivo';

    if (!observacionId) {
      throw createValidationError('observacionId es obligatorio');
    }
    if (!uploadedBy) {
      throw createValidationError('uploadedBy es obligatorio');
    }
    if (!nombreArchivo) {
      throw createValidationError('nombreArchivo es obligatorio');
    }
    if (!rutaArchivo) {
      throw createValidationError('rutaArchivo es obligatorio');
    }

    const existingObservation = await db.query(
      `SELECT id, cita_id
       FROM observaciones
       WHERE id = ?
       LIMIT 1`,
      [observacionId]
    );

    if (!existingObservation.length) {
      throw createValidationError('Observacion no encontrada');
    }

    const finalCitaId = citaId || Number(existingObservation[0].cita_id);
    if (!finalCitaId) {
      throw createValidationError('No se pudo resolver cita_id para el documento');
    }

    const result = await db.query(
      `INSERT INTO documentos (cita_id, nombre_archivo, ruta_archivo, tipo, uploaded_by, created_at, observacion_id)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [finalCitaId, nombreArchivo, rutaArchivo, tipo, uploadedBy, observacionId]
    );

    const insertedId = Number(result.insertId || 0);
    const rows = await db.query(
      `SELECT id,
              cita_id,
              nombre_archivo,
              ruta_archivo,
              tipo,
              uploaded_by,
              created_at,
              observacion_id
       FROM documentos
       WHERE id = ?
       LIMIT 1`,
      [insertedId]
    );

    const row = rows[0];
    return {
      id: row.id,
      observacionId: row.observacion_id,
      citaId: row.cita_id,
      nombreArchivo: row.nombre_archivo,
      rutaArchivo: row.ruta_archivo,
      tipo: row.tipo,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at
    };
  }
};

module.exports = Expediente;

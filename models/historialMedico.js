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

function normalizeIdentificacion(value) {
  const normalized = String(value || '').trim();
  return normalized;
}

function buildInClause(ids) {
  return ids.map(() => '?').join(', ');
}

async function getPacienteExpedientesByIdentificacionAndDoctor(identificacion, doctorId) {
  return db.query(
    `SELECT p.id AS paciente_id,
            p.nombre AS paciente_nombre,
            p.identificacion,
            p.email,
            p.telefono,
            p.fecha_nacimiento,
            p.direccion,
            e.id AS expediente_id,
            e.activo AS expediente_activo,
            e.created_at AS expediente_created_at
     FROM pacientes p
     INNER JOIN expedientes e ON e.paciente_id = p.id
     WHERE p.identificacion = ?
       AND e.doctor_id = ?
     ORDER BY e.created_at DESC, e.id DESC`,
    [identificacion, doctorId]
  );
}

async function getExpedienteDetalles(expedienteIds) {
  if (!expedienteIds.length) {
    return [];
  }

  const inClause = buildInClause(expedienteIds);
  return db.query(
    `SELECT ed.id,
            ed.expediente_id,
            ed.doctor_id,
            ed.observaciones,
            ed.created_at,
            u.nombre AS doctor_nombre
     FROM expediente_detalle ed
     LEFT JOIN usuarios u ON u.id = ed.doctor_id
     WHERE ed.expediente_id IN (${inClause})
     ORDER BY ed.created_at ASC, ed.id ASC`,
    expedienteIds
  );
}

async function getDetalleRelations(detalleIds) {
  if (!detalleIds.length) {
    return {
      enfermedades: [],
      medicamentos: [],
      alergias: [],
      documentos: []
    };
  }

  const inClause = buildInClause(detalleIds);
  const [enfermedades, medicamentos, alergias, documentos] = await Promise.all([
    db.query(
      `SELECT ee.expediente_detalle_id AS detalle_id,
              e.id,
              e.nombre
       FROM expediente_enfermedades ee
       INNER JOIN enfermedades e ON e.id = ee.enfermedad_id
       WHERE ee.expediente_detalle_id IN (${inClause})
       ORDER BY e.nombre ASC`,
      detalleIds
    ),
    db.query(
      `SELECT em.expediente_detalle_id AS detalle_id,
              m.id,
              m.nombre
       FROM expediente_medicamentos em
       INNER JOIN medicamentos m ON m.id = em.medicamento_id
       WHERE em.expediente_detalle_id IN (${inClause})
       ORDER BY m.nombre ASC`,
      detalleIds
    ),
    db.query(
      `SELECT ea.expediente_detalle_id AS detalle_id,
              a.id,
              a.nombre
       FROM expediente_alergias ea
       INNER JOIN alergias a ON a.id = ea.alergia_id
       WHERE ea.expediente_detalle_id IN (${inClause})
       ORDER BY a.nombre ASC`,
      detalleIds
    ),
    db.query(
      `SELECT d.id,
              d.detalle_id,
              d.cita_id,
              d.nombre_archivo,
              d.ruta_archivo,
              d.tipo,
              d.uploaded_by,
              d.created_at
       FROM documentos d
       WHERE d.detalle_id IN (${inClause})
       ORDER BY d.created_at ASC, d.id ASC`,
      detalleIds
    )
  ]);

  return {
    enfermedades,
    medicamentos,
    alergias,
    documentos
  };
}

function mapRelationRows(rows, detailIdField) {
  const map = new Map();
  for (const row of rows) {
    const detailId = Number(row[detailIdField]);
    if (!map.has(detailId)) {
      map.set(detailId, []);
    }

    map.get(detailId).push({ id: row.id, nombre: row.nombre });
  }

  return map;
}

function mapDocumentRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const detailId = Number(row.detalle_id);
    if (!map.has(detailId)) {
      map.set(detailId, []);
    }

    map.get(detailId).push({
      id: row.id,
      detalleId: row.detalle_id,
      citaId: row.cita_id,
      nombreArchivo: row.nombre_archivo,
      rutaArchivo: row.ruta_archivo,
      tipo: row.tipo,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at
    });
  }

  return map;
}

const HistorialMedico = {
  async getByPacienteIdentificacionAndDoctor({ identificacion, doctorId }) {
    const safeDoctorId = toPositiveInt(doctorId);
    const safeIdentificacion = normalizeIdentificacion(identificacion);

    if (!safeDoctorId) {
      throw createValidationError('doctorId es obligatorio');
    }

    if (!safeIdentificacion) {
      throw createValidationError('identificacion es obligatoria');
    }

    const expedienteRows = await getPacienteExpedientesByIdentificacionAndDoctor(safeIdentificacion, safeDoctorId);
    if (!expedienteRows.length) {
      return null;
    }

    const expedienteIds = [...new Set(expedienteRows.map((row) => Number(row.expediente_id)))];
    const detalles = await getExpedienteDetalles(expedienteIds);
    const detalleIds = detalles.map((row) => Number(row.id));
    const relations = await getDetalleRelations(detalleIds);

    const enfermedadesByDetalle = mapRelationRows(relations.enfermedades, 'detalle_id');
    const medicamentosByDetalle = mapRelationRows(relations.medicamentos, 'detalle_id');
    const alergiasByDetalle = mapRelationRows(relations.alergias, 'detalle_id');
    const documentosByDetalle = mapDocumentRows(relations.documentos);

    const paciente = {
      id: expedienteRows[0].paciente_id,
      nombre: expedienteRows[0].paciente_nombre,
      identificacion: expedienteRows[0].identificacion,
      email: expedienteRows[0].email,
      telefono: expedienteRows[0].telefono,
      fechaNacimiento: expedienteRows[0].fecha_nacimiento,
      direccion: expedienteRows[0].direccion
    };

    const expedientes = expedienteRows.map((row) => ({
      id: row.expediente_id,
      activo: Boolean(row.expediente_activo),
      createdAt: row.expediente_created_at
    }));

    const historial = detalles.map((row) => ({
      id: row.id,
      expedienteId: row.expediente_id,
      doctorId: row.doctor_id,
      doctorNombre: row.doctor_nombre || null,
      observaciones: row.observaciones || '',
      createdAt: row.created_at,
      enfermedades: enfermedadesByDetalle.get(Number(row.id)) || [],
      medicamentos: medicamentosByDetalle.get(Number(row.id)) || [],
      alergias: alergiasByDetalle.get(Number(row.id)) || [],
      documentos: documentosByDetalle.get(Number(row.id)) || []
    }));

    return {
      paciente,
      doctorId: safeDoctorId,
      expedientes,
      historial,
      totalExpedientes: expedientes.length,
      totalDetalles: historial.length,
      totalDocumentos: relations.documentos.length
    };
  }
};

module.exports = HistorialMedico;

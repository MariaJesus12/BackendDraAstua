const DbService = require('../config/database');

const db = DbService.getInstance();

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function parseActivo(value) {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value === 0 ? 0 : 1;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'yes'].includes(normalized)) {
    return 1;
  }

  if (['0', 'false', 'no'].includes(normalized)) {
    return 0;
  }

  throw createValidationError('activo debe ser booleano (true/false)');
}

function normalizeDateOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createValidationError('fecha_nacimiento debe tener formato YYYY-MM-DD');
  }

  return date;
}

function normalizeStringOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) {
    return null;
  }

  const hoy = new Date();
  const nacimiento = new Date(String(fechaNacimiento).trim());

  if (isNaN(nacimiento.getTime())) {
    return null;
  }

  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mesActual = hoy.getMonth();
  const mesNacimiento = nacimiento.getMonth();

  if (
    mesActual < mesNacimiento ||
    (mesActual === mesNacimiento && hoy.getDate() < nacimiento.getDate())
  ) {
    edad -= 1;
  }

  return edad >= 0 ? edad : null;
}

function mapPatientRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    edad: calcularEdad(row.fecha_nacimiento)
  };
}

function normalizeRelationIds(rawValue, fieldName) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return [];
  }

  const asArray = Array.isArray(rawValue) ? rawValue : [rawValue];
  const ids = asArray.map((item) => {
    if (item && typeof item === 'object' && item.id !== undefined) {
      return toPositiveInt(item.id);
    }

    return toPositiveInt(item);
  });

  if (ids.some((id) => id === null)) {
    throw createValidationError(`${fieldName} debe contener ids enteros positivos`);
  }

  return [...new Set(ids)];
}

function getFirstDefined(payload, keys) {
  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key];
    }
  }

  return undefined;
}

function normalizePayload(payload = {}) {
  const sanitized = {};

  const nombre = normalizeStringOrNull(payload.nombre);
  const identificacion = normalizeStringOrNull(payload.identificacion);

  if (!nombre) {
    throw createValidationError('El nombre del paciente es obligatorio');
  }

  if (!identificacion) {
    throw createValidationError('La identificacion del paciente es obligatoria');
  }

  const email = normalizeStringOrNull(payload.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createValidationError('El email del paciente no tiene un formato valido');
  }

  sanitized.nombre = nombre;
  sanitized.identificacion = identificacion;
  sanitized.email = email;
  sanitized.telefono = normalizeStringOrNull(payload.telefono);
  sanitized.fecha_nacimiento = normalizeDateOrNull(payload.fecha_nacimiento);
  sanitized.direccion = normalizeStringOrNull(payload.direccion);
  sanitized.activo = parseActivo(payload.activo);
  sanitized.medicamento_ids = normalizeRelationIds(
    getFirstDefined(payload, ['medicamento_ids', 'medicamentoIds', 'medicamentos']),
    'medicamento_ids'
  );
  sanitized.alergia_ids = normalizeRelationIds(
    getFirstDefined(payload, ['alergia_ids', 'alergiaIds', 'alergias']),
    'alergia_ids'
  );
  sanitized.enfermedad_ids = normalizeRelationIds(
    getFirstDefined(payload, ['enfermedad_ids', 'enfermedadIds', 'enfermedades']),
    'enfermedad_ids'
  );

  // Conserva compatibilidad: si llegan campos permitidos no normalizados, se ignoran para evitar inserts inconsistentes.
  // El create utiliza solo el payload saneado.

  return sanitized;
}

function buildInClause(ids) {
  return ids.map(() => '?').join(', ');
}

async function ensureExistingIds(connection, ids, catalogTable, catalogField, label) {
  if (!ids.length) {
    return;
  }

  const inClause = buildInClause(ids);
  const [rows] = await connection.execute(
    `SELECT ${catalogField} AS id FROM ${catalogTable} WHERE ${catalogField} IN (${inClause})`,
    ids
  );

  const existing = new Set(rows.map((row) => Number(row.id)));
  const missing = ids.filter((id) => !existing.has(id));

  if (missing.length) {
    throw createValidationError(`${label} contiene ids inexistentes: ${missing.join(', ')}`);
  }
}

async function insertPivotRows(connection, tableName, patientId, foreignColumn, ids) {
  if (!ids.length) {
    return;
  }

  const valuesClause = ids.map(() => '(?, ?)').join(', ');
  const params = ids.flatMap((id) => [patientId, id]);
  await connection.execute(
    `INSERT INTO ${tableName} (paciente_id, ${foreignColumn}) VALUES ${valuesClause}`,
    params
  );
}

async function getPatientRelations(patientId) {
  const [medicamentos, alergias, enfermedades] = await Promise.all([
    db.query(
      `SELECT m.id, m.nombre
       FROM paciente_medicamentos pm
       INNER JOIN medicamentos m ON m.id = pm.medicamento_id
       WHERE pm.paciente_id = ?
       ORDER BY m.nombre ASC`,
      [patientId]
    ),
    db.query(
      `SELECT a.id, a.nombre
       FROM paciente_alergias pa
       INNER JOIN alergias a ON a.id = pa.alergia_id
       WHERE pa.paciente_id = ?
       ORDER BY a.nombre ASC`,
      [patientId]
    ),
    db.query(
      `SELECT e.id, e.nombre
       FROM paciente_enfermedades pe
       INNER JOIN enfermedades e ON e.id = pe.enfermedad_id
       WHERE pe.paciente_id = ?
       ORDER BY e.nombre ASC`,
      [patientId]
    )
  ]);

  return {
    medicamentos,
    medicamento_ids: medicamentos.map((item) => item.id),
    alergias,
    alergia_ids: alergias.map((item) => item.id),
    enfermedades,
    enfermedad_ids: enfermedades.map((item) => item.id)
  };
}

const Patient = {
  async create(payload) {
    const sanitized = normalizePayload(payload);

    const fields = ['nombre', 'identificacion', 'email', 'telefono', 'fecha_nacimiento', 'direccion', 'activo'];
    const values = fields.map((field) => sanitized[field]);

    let connection;
    let patientId;

    if (!fields.length) {
      throw createValidationError('No se recibieron campos validos para crear el paciente');
    }

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      await ensureExistingIds(connection, sanitized.medicamento_ids, 'medicamentos', 'id', 'medicamento_ids');
      await ensureExistingIds(connection, sanitized.alergia_ids, 'alergias', 'id', 'alergia_ids');
      await ensureExistingIds(connection, sanitized.enfermedad_ids, 'enfermedades', 'id', 'enfermedad_ids');

      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO pacientes (${fields.join(', ')}) VALUES (${placeholders})`;
      const [result] = await connection.execute(sql, values);

      patientId = result.insertId;

      await insertPivotRows(connection, 'paciente_medicamentos', patientId, 'medicamento_id', sanitized.medicamento_ids);
      await insertPivotRows(connection, 'paciente_alergias', patientId, 'alergia_id', sanitized.alergia_ids);
      await insertPivotRows(connection, 'paciente_enfermedades', patientId, 'enfermedad_id', sanitized.enfermedad_ids);

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

    return this.findById(patientId);
  },

  async findAll() {
    return db.query(
      `SELECT id, nombre, identificacion, email, telefono, fecha_nacimiento, direccion, activo
       FROM pacientes
       ORDER BY id DESC`
    );
  },

  async findAllPaginated({ page = 1, limit = 20 } = {}) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const offset = (safePage - 1) * safeLimit;

    const totalRows = await db.query('SELECT COUNT(*) AS total FROM pacientes');
    const rows = await db.query(
      `SELECT id, nombre, identificacion, email, telefono, fecha_nacimiento, direccion, activo
       FROM pacientes
       ORDER BY id DESC
       LIMIT ${offset}, ${safeLimit}`
    );

    return {
      items: rows.map(mapPatientRow),
      total: Number(totalRows[0] && totalRows[0].total ? totalRows[0].total : 0)
    };
  },

  async findById(id) {
    const rows = await db.query(
      `SELECT id, nombre, identificacion, email, telefono, fecha_nacimiento, direccion, activo
       FROM pacientes
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return null;
    }

    const relations = await getPatientRelations(id);
    return {
      ...mapPatientRow(rows[0]),
      ...relations
    };
  },

  async search({ nombre, identificacion }) {
    const conditions = [];
    const params = [];

    if (nombre) {
      conditions.push('p.nombre LIKE ?');
      params.push(`%${nombre}%`);
    }

    if (identificacion) {
      conditions.push('p.identificacion LIKE ?');
      params.push(`%${identificacion}%`);
    }

    const rows = await db.query(
      `SELECT p.id, p.nombre, p.identificacion, p.email, p.telefono, p.fecha_nacimiento, p.direccion, p.activo
       FROM pacientes p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.nombre ASC`,
      params
    );

    const patientsWithRelations = await Promise.all(
      rows.map(async (row) => ({
        ...mapPatientRow(row),
        ...(await getPatientRelations(row.id))
      }))
    );

    return patientsWithRelations;
  },

  async searchPaginated({ nombre, identificacion, page = 1, limit = 20 }) {
    const conditions = [];
    const params = [];

    if (nombre) {
      conditions.push('p.nombre LIKE ?');
      params.push(`%${nombre}%`);
    }

    if (identificacion) {
      conditions.push('p.identificacion LIKE ?');
      params.push(`%${identificacion}%`);
    }

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const offset = (safePage - 1) * safeLimit;

    const totalRows = await db.query(
      `SELECT COUNT(*) AS total
       FROM pacientes p
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    const rows = await db.query(
      `SELECT p.id, p.nombre, p.identificacion, p.email, p.telefono, p.fecha_nacimiento, p.direccion, p.activo
       FROM pacientes p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.id DESC
       LIMIT ${offset}, ${safeLimit}`,
      params
    );

    const patientsWithRelations = await Promise.all(
      rows.map(async (row) => ({
        ...mapPatientRow(row),
        ...(await getPatientRelations(row.id))
      }))
    );

    return {
      items: patientsWithRelations,
      total: Number(totalRows[0] && totalRows[0].total ? totalRows[0].total : 0)
    };
  },

  async findMedicamentos() {
    return db.query(
      `SELECT id, nombre
       FROM medicamentos
       ORDER BY nombre ASC`
    );
  },

  async findAlergias() {
    return db.query(
      `SELECT id, nombre
       FROM alergias
       ORDER BY nombre ASC`
    );
  },

  async findEnfermedades() {
    return db.query(
      `SELECT id, nombre
       FROM enfermedades
       ORDER BY nombre ASC`
    );
  }
};

module.exports = Patient;
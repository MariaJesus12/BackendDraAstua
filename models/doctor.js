const DbService = require('../config/database');
const bcrypt = require('bcryptjs');

const db = DbService.getInstance();

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function toBool(value, defaultValue = true) {
  if (value === undefined || value === null) {
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

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseEspecialidadIds(input) {
  if (input === undefined || input === null || input === '') {
    return [];
  }

  const values = Array.isArray(input) ? input : [input];
  const ids = values.map((value) => {
    if (value && typeof value === 'object' && value.id !== undefined) {
      return toPositiveInt(value.id);
    }

    return toPositiveInt(value);
  });

  if (ids.some((value) => value === null)) {
    throw createValidationError('especialidad_ids debe contener ids enteros positivos');
  }

  return [...new Set(ids)];
}

function pickFirstDefined(payload, keys) {
  for (const key of keys) {
    if (payload && payload[key] !== undefined) {
      return payload[key];
    }
  }

  return undefined;
}

async function findDoctorRoleId(connection = null) {
  const sql =
    `SELECT id
     FROM roles
     WHERE LOWER(nombre) = 'doctor'
     LIMIT 1`;

  const rows = connection
    ? (await connection.execute(sql))[0]
    : await db.query(sql);

  if (!rows.length) {
    const error = createValidationError('No existe un rol llamado doctor en la tabla roles');
    error.code = 'ROLE_DOCTOR_NOT_FOUND';
    throw error;
  }

  return rows[0].id;
}

async function ensureEspecialidadesExist(connection, especialidadIds) {
  if (!especialidadIds.length) {
    throw createValidationError('Debe enviar al menos una especialidad para el doctor');
  }

  const placeholders = especialidadIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id
     FROM especialidades
     WHERE id IN (${placeholders})`,
    especialidadIds
  );

  const existingIds = new Set(rows.map((row) => Number(row.id)));
  const missingIds = especialidadIds.filter((id) => !existingIds.has(id));

  if (missingIds.length) {
    throw createValidationError(`Especialidades inválidas: ${missingIds.join(', ')}`);
  }
}

async function findEspecialidadesByDoctorId(doctorId) {
  const rows = await db.query(
    `SELECT e.id, e.nombre
     FROM doctor_especialidad de
     INNER JOIN especialidades e ON e.id = de.especialidad_id
     WHERE de.doctor_id = ?
     ORDER BY e.nombre ASC`,
    [doctorId]
  );

  return rows;
}

function parseEspecialidades(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function mapDoctorRow(row, especialidades) {
  const specialtyNames = Array.isArray(especialidades)
    ? especialidades.map((especialidad) => especialidad.nombre)
    : parseEspecialidades(row.especialidades_nombres);
  const specialty = specialtyNames.length ? specialtyNames.join(', ') : null;

  return {
    id: row.id,
    doctor_id: row.id,
    doctorId: row.id,
    nombre: row.nombre,
    doctor_name: row.nombre,
    doctorName: row.nombre,
    email: row.email,
    identificacion: row.identificacion,
    activo: Boolean(row.activo),
    rol: row.rol,
    specialty,
    especialidad: specialty,
    especialidades: Array.isArray(especialidades)
      ? especialidades
      : specialtyNames.map((nombre, index) => ({ id: index + 1, nombre }))
  };
}

const Doctor = {
  async create(payload) {
    const nombre = payload && payload.nombre != null ? String(payload.nombre).trim() : '';
    const email = payload && payload.email != null ? String(payload.email).trim() : '';
    const identificacion = payload && payload.identificacion != null ? String(payload.identificacion).trim() : '';
    const password = payload && payload.password != null ? String(payload.password) : '';
    const activo = toBool(payload && payload.activo, true);
    const especialidadIds = parseEspecialidadIds(
      pickFirstDefined(payload, [
        'especialidad_ids',
        'especialidadIds',
        'especialidades',
        'especialidad_id',
        'especialidadId',
        'specialty_ids',
        'specialtyIds',
        'specialties'
      ])
    );

    if (!nombre || !email || !identificacion || !password) {
      throw createValidationError('nombre, email, identificacion y password son obligatorios');
    }

    if (!especialidadIds.length) {
      throw createValidationError('Debe enviar al menos una especialidad para el doctor');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertSql =
      `INSERT INTO usuarios (nombre, email, password, rol_id, activo, identificacion)
       VALUES (?, ?, ?, ?, ?, ?)`;

    let connection;
    let doctorId;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const roleId = await findDoctorRoleId(connection);
      await ensureEspecialidadesExist(connection, especialidadIds);

      const [result] = await connection.execute(insertSql, [
        nombre,
        email,
        passwordHash,
        roleId,
        activo ? 1 : 0,
        identificacion
      ]);

      doctorId = result.insertId;

      const valuesSql = especialidadIds.map(() => '(?, ?)').join(', ');
      const params = especialidadIds.flatMap((especialidadId) => [doctorId, especialidadId]);
      await connection.execute(
        `INSERT INTO doctor_especialidad (doctor_id, especialidad_id)
         VALUES ${valuesSql}`,
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

    return this.findById(doctorId);
  },

  async findAll() {
    const doctorRows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.identificacion,
              u.activo,
              r.nombre AS rol,
              GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS especialidades_nombres
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       LEFT JOIN doctor_especialidad de ON de.doctor_id = u.id
       LEFT JOIN especialidades e ON e.id = de.especialidad_id
       WHERE LOWER(r.nombre) = 'doctor'
       GROUP BY u.id, u.nombre, u.email, u.identificacion, u.activo, r.nombre
       ORDER BY u.id DESC`
    );

    return doctorRows.map((row) => mapDoctorRow(row));
  },

  async findAllPaginated({ page = 1, limit = 20 } = {}) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const offset = (safePage - 1) * safeLimit;

    const totalRows = await db.query(
      `SELECT COUNT(*) AS total
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       WHERE LOWER(r.nombre) = 'doctor'`
    );

    const doctorRows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.identificacion,
              u.activo,
              r.nombre AS rol,
              GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS especialidades_nombres
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       LEFT JOIN doctor_especialidad de ON de.doctor_id = u.id
       LEFT JOIN especialidades e ON e.id = de.especialidad_id
       WHERE LOWER(r.nombre) = 'doctor'
       GROUP BY u.id, u.nombre, u.email, u.identificacion, u.activo, r.nombre
       ORDER BY u.id DESC
       LIMIT ${offset}, ${safeLimit}`
    );

    return {
      items: doctorRows.map((row) => mapDoctorRow(row)),
      total: Number(totalRows[0] && totalRows[0].total ? totalRows[0].total : 0)
    };
  },

  async findById(id) {
    const doctorRows = await db.query(
      `SELECT u.id, u.nombre, u.email, u.identificacion, u.activo, r.nombre AS rol
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ? AND LOWER(r.nombre) = 'doctor'
       LIMIT 1`,
      [id]
    );

    if (!doctorRows.length) {
      return null;
    }

    const especialidades = await findEspecialidadesByDoctorId(id);
    return mapDoctorRow(doctorRows[0], especialidades);
  },

  async search({ nombre, identificacion }) {
    const conditions = ["LOWER(r.nombre) = 'doctor'"];
    const params = [];

    if (nombre) {
      conditions.push('u.nombre LIKE ?');
      params.push(`%${nombre}%`);
    }

    if (identificacion) {
      conditions.push('u.identificacion LIKE ?');
      params.push(`%${identificacion}%`);
    }

    const doctorRows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.identificacion,
              u.activo,
              r.nombre AS rol,
              GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS especialidades_nombres
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       LEFT JOIN doctor_especialidad de ON de.doctor_id = u.id
       LEFT JOIN especialidades e ON e.id = de.especialidad_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.nombre, u.email, u.identificacion, u.activo, r.nombre
       ORDER BY u.nombre ASC`,
      params
    );

    return doctorRows.map((row) => mapDoctorRow(row));
  },

  async searchPaginated({ nombre, identificacion, page = 1, limit = 20 }) {
    const conditions = ["LOWER(r.nombre) = 'doctor'"];
    const params = [];

    if (nombre) {
      conditions.push('u.nombre LIKE ?');
      params.push(`%${nombre}%`);
    }

    if (identificacion) {
      conditions.push('u.identificacion LIKE ?');
      params.push(`%${identificacion}%`);
    }

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const offset = (safePage - 1) * safeLimit;

    const totalRows = await db.query(
      `SELECT COUNT(*) AS total
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    const doctorRows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.identificacion,
              u.activo,
              r.nombre AS rol,
              GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS especialidades_nombres
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       LEFT JOIN doctor_especialidad de ON de.doctor_id = u.id
       LEFT JOIN especialidades e ON e.id = de.especialidad_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.nombre, u.email, u.identificacion, u.activo, r.nombre
       ORDER BY u.id DESC
       LIMIT ${offset}, ${safeLimit}`,
      params
    );

    return {
      items: doctorRows.map((row) => mapDoctorRow(row)),
      total: Number(totalRows[0] && totalRows[0].total ? totalRows[0].total : 0)
    };
  },

  async findEspecialidadesCatalog() {
    return db.query(
      `SELECT id, nombre
       FROM especialidades
       ORDER BY nombre ASC`
    );
  }
};

module.exports = Doctor;
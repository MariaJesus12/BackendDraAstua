const DbService = require('../config/database');
const bcrypt = require('bcryptjs');

const db = DbService.getInstance();

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBoolean(value, defaultValue = true) {
  if (value == null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDbValue(value) {
  if (value == null) {
    return '';
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return String(value);
}

const User = {
  async roleExists(roleId) {
    const rows = await db.query(
      `SELECT id
       FROM roles
       WHERE id = ?
       LIMIT 1`,
      [roleId]
    );

    return rows.length > 0;
  },

  async findAll() {
    return db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.rol_id,
              r.nombre AS rol_nombre,
              u.activo,
              u.identificacion
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.rol_id
       ORDER BY u.nombre ASC, u.id ASC`
    );
  },

  async findByIdentificacion(identificacion) {
    const normalizedIdentificacion = normalizeDbValue(identificacion).trim();
    const rows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.password,
              u.rol_id,
              r.nombre AS rol_nombre,
              u.activo,
              u.identificacion
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.rol_id
       WHERE u.identificacion = ?
       LIMIT 1`,
      [normalizedIdentificacion]
    );

    if (!rows.length) {
      return null;
    }

    return rows[0];
  },

  async findById(id) {
    const rows = await db.query(
      `SELECT u.id,
              u.nombre,
              u.email,
              u.rol_id,
              r.nombre AS rol_nombre,
              u.activo,
              u.identificacion
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return null;
    }

    return rows[0];
  },

  async findRawById(id) {
    const rows = await db.query(
      `SELECT id, nombre, email, password, rol_id, activo, identificacion
       FROM usuarios
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return rows.length ? rows[0] : null;
  },

  async findByEmail(email) {
    const normalizedEmail = normalizeDbValue(email).trim().toLowerCase();
    const rows = await db.query(
      `SELECT id, nombre, email, rol_id, activo, identificacion
       FROM usuarios
       WHERE LOWER(email) = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    return rows.length ? rows[0] : null;
  },

  async create(payload) {
    const nombre = normalizeDbValue(payload && payload.nombre).trim();
    const email = normalizeDbValue(payload && payload.email).trim().toLowerCase();
    const password = normalizeDbValue(payload && payload.password);
    const identificacion = normalizeDbValue(payload && payload.identificacion).trim();
    const rolId = parsePositiveInt(payload && payload.rol_id);
    const activo = normalizeBoolean(payload && payload.activo, true);

    if (!nombre || !email || !password || !identificacion || !rolId) {
      throw createValidationError('nombre, email, password, identificacion y rol_id son obligatorios');
    }

    if (!isValidEmail(email)) {
      throw createValidationError('El email no tiene un formato valido');
    }

    if (!(await this.roleExists(rolId))) {
      throw createValidationError('El rol seleccionado no existe');
    }

    const existingByIdentificacion = await this.findByIdentificacion(identificacion);
    if (existingByIdentificacion) {
      throw createValidationError('Ya existe un usuario con esa identificacion');
    }

    const existingByEmail = await this.findByEmail(email);
    if (existingByEmail) {
      throw createValidationError('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO usuarios (nombre, email, password, rol_id, activo, identificacion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, email, passwordHash, rolId, activo ? 1 : 0, identificacion]
    );

    return this.findById(result.insertId);
  },

  async update(id, payload) {
    const userId = parsePositiveInt(id);
    if (!userId) {
      throw createValidationError('El id del usuario es invalido');
    }

    const existingUser = await this.findRawById(userId);
    if (!existingUser) {
      return null;
    }

    const nombre = payload && payload.nombre != null
      ? normalizeDbValue(payload.nombre).trim()
      : normalizeDbValue(existingUser.nombre).trim();
    const email = payload && payload.email != null
      ? normalizeDbValue(payload.email).trim().toLowerCase()
      : normalizeDbValue(existingUser.email).trim().toLowerCase();
    const identificacion = payload && payload.identificacion != null
      ? normalizeDbValue(payload.identificacion).trim()
      : normalizeDbValue(existingUser.identificacion).trim();
    const rolId = payload && payload.rol_id != null
      ? parsePositiveInt(payload.rol_id)
      : parsePositiveInt(existingUser.rol_id);
    const activo = payload && Object.prototype.hasOwnProperty.call(payload, 'activo')
      ? normalizeBoolean(payload.activo, Boolean(existingUser.activo))
      : Boolean(existingUser.activo);
    const password = payload && payload.password != null ? normalizeDbValue(payload.password) : '';

    if (!nombre || !email || !identificacion || !rolId) {
      throw createValidationError('nombre, email, identificacion y rol_id son obligatorios');
    }

    if (!isValidEmail(email)) {
      throw createValidationError('El email no tiene un formato valido');
    }

    if (!(await this.roleExists(rolId))) {
      throw createValidationError('El rol seleccionado no existe');
    }

    const existingByIdentificacion = await this.findByIdentificacion(identificacion);
    if (existingByIdentificacion && Number(existingByIdentificacion.id) !== userId) {
      throw createValidationError('Ya existe un usuario con esa identificacion');
    }

    const existingByEmail = await this.findByEmail(email);
    if (existingByEmail && Number(existingByEmail.id) !== userId) {
      throw createValidationError('Ya existe un usuario con ese email');
    }

    let passwordHash = normalizeDbValue(existingUser.password);
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    await db.query(
      `UPDATE usuarios
       SET nombre = ?,
           email = ?,
           password = ?,
           rol_id = ?,
           activo = ?,
           identificacion = ?
       WHERE id = ?`,
      [nombre, email, passwordHash, rolId, activo ? 1 : 0, identificacion, userId]
    );

    return this.findById(userId);
  },

  async softDelete(id) {
    const userId = parsePositiveInt(id);
    if (!userId) {
      throw createValidationError('El id del usuario es invalido');
    }

    const existingUser = await this.findRawById(userId);
    if (!existingUser) {
      return null;
    }

    await db.query(
      `UPDATE usuarios
       SET activo = 0
       WHERE id = ?`,
      [userId]
    );

    return this.findById(userId);
  },

  async validatePassword(plainPassword, storedPassword) {
    const plain = normalizeDbValue(plainPassword);
    const stored = normalizeDbValue(storedPassword).trim();

    if (!plain || !stored) {
      return false;
    }

    // Compatibilidad: bcrypt para contrasenas hasheadas y comparacion directa para datos legacy.
    const looksHashed = /^\$2[aby]\$\d{2}\$/.test(stored);
    if (looksHashed) {
      try {
        return await bcrypt.compare(plain, stored);
      } catch (error) {
        return false;
      }
    }

    return plain === stored;
  },

  toSafeUser(userRow) {
    if (!userRow) {
      return null;
    }

    return {
      id: userRow.id,
      nombre: userRow.nombre,
      email: userRow.email,
      rol_id: userRow.rol_id,
      rol_nombre: userRow.rol_nombre,
      roleId: userRow.rol_id,
      roleName: userRow.rol_nombre,
      role: {
        id: userRow.rol_id,
        nombre: userRow.rol_nombre,
        name: userRow.rol_nombre
      },
      identificacion: userRow.identificacion,
      activo: Boolean(userRow.activo)
    };
  }
};

module.exports = User;
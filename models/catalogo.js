const DbService = require('../config/database');

const db = DbService.getInstance();

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function normalizeNombre(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

const SUPPORTED_TABLES = new Set(['medicamentos', 'alergias', 'enfermedades']);

function validateTableName(tableName) {
  const normalized = String(tableName || '').trim().toLowerCase();
  if (!SUPPORTED_TABLES.has(normalized)) {
    throw createValidationError('Catalogo no soportado');
  }

  return normalized;
}

const Catalogo = {
  async findAll(tableName) {
    const safeTable = validateTableName(tableName);
    return db.query(
      `SELECT id, nombre
       FROM ${safeTable}
       ORDER BY nombre ASC`
    );
  },

  async create(tableName, payload = {}) {
    const safeTable = validateTableName(tableName);
    const nombre = normalizeNombre(payload.nombre);

    if (!nombre) {
      throw createValidationError('nombre es obligatorio');
    }

    const result = await db.query(
      `INSERT INTO ${safeTable} (nombre)
       VALUES (?)`,
      [nombre]
    );

    const insertedId = Number(result.insertId || 0);
    const rows = await db.query(
      `SELECT id, nombre
       FROM ${safeTable}
       WHERE id = ?
       LIMIT 1`,
      [insertedId]
    );

    return rows[0] || { id: insertedId, nombre };
  }
};

module.exports = Catalogo;

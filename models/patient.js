const DbService = require('../config/database');

const db = DbService.getInstance();

const ALLOWED_FIELDS = [
  'nombre',
  'identificacion',
  'email',
  'telefono',
  'fecha_nacimiento',
  'direccion',
  'activo'
];

function normalizePayload(payload = {}) {
  const sanitized = {};

  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) {
      sanitized[field] = payload[field];
    }
  }

  return sanitized;
}

const Patient = {
  async create(payload) {
    const sanitized = normalizePayload(payload);

    const fields = Object.keys(sanitized);
    const values = Object.values(sanitized);

    if (!fields.length) {
      throw new Error('No se recibieron campos validos para crear el paciente');
    }

    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO pacientes (${fields.join(', ')}) VALUES (${placeholders})`;

    const result = await db.query(sql, values);
    return this.findById(result.insertId);
  },

  async findAll() {
    return db.query(
      `SELECT id, nombre, identificacion, email, telefono, fecha_nacimiento, direccion, activo
       FROM pacientes
       ORDER BY id DESC`
    );
  },

  async findById(id) {
    const rows = await db.query(
      `SELECT id, nombre, identificacion, email, telefono, fecha_nacimiento, direccion, activo
       FROM pacientes
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return rows.length ? rows[0] : null;
  }
};

module.exports = Patient;
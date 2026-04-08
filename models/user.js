const DbService = require('../config/database');
const bcrypt = require('bcryptjs');

const db = DbService.getInstance();

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
  async findByIdentificacion(identificacion) {
    const normalizedIdentificacion = normalizeDbValue(identificacion).trim();
    const rows = await db.query(
      `SELECT id, nombre, email, password, rol_id, activo, identificacion
       FROM usuarios
       WHERE identificacion = ?
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
      `SELECT id, nombre, email, rol_id, activo, identificacion
       FROM usuarios
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return null;
    }

    return rows[0];
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
      identificacion: userRow.identificacion,
      activo: Boolean(userRow.activo)
    };
  }
};

module.exports = User;
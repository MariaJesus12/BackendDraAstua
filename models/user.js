const DbService = require('../config/database');
const bcrypt = require('bcryptjs');

const db = DbService.getInstance();

const User = {
  async findByLogin(login) {
    const rows = await db.query(
      `SELECT id, nombre, email, password, rol_id, activo, identificacion
       FROM usuarios
       WHERE email = ? OR identificacion = ?
       LIMIT 1`,
      [login, login]
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
    if (!plainPassword || !storedPassword) {
      return false;
    }

    // Compatibilidad: bcrypt para contrasenas hasheadas y comparacion directa para datos legacy.
    const looksHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
    if (looksHashed) {
      return bcrypt.compare(plainPassword, storedPassword);
    }

    return plainPassword === storedPassword;
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
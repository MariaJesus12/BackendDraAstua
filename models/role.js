const DbService = require('../config/database');

const db = DbService.getInstance();

const Role = {
  async findAll() {
    return db.query(
      `SELECT id, nombre
       FROM roles
       ORDER BY nombre ASC`
    );
  },

  async findById(id) {
    const rows = await db.query(
      `SELECT id, nombre
       FROM roles
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return rows.length ? rows[0] : null;
  }
};

module.exports = Role;
const DbService = require('../config/database');

const db = DbService.getInstance();

const Role = {
  async findAll() {
    return db.query(
      `SELECT id, nombre
       FROM roles
       ORDER BY nombre ASC`
    );
  }
};

module.exports = Role;
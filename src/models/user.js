const pool = require('../db');

const User = {
  findByCredentials: (username, password, callback) => {
    pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    });
  }
};

module.exports = User;
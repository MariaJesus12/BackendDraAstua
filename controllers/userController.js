const User = require('../models/user');
const { generateToken } = require('../auth');

exports.login = (req, res) => {
  const { username, password } = req.body;
  User.findByCredentials(username, password, (err, user) => {
    if (err) return res.status(500).json({ error: 'Error de base de datos' });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = generateToken(user);
    res.json({ token });
  });
};

exports.getProfile = (req, res) => {
  res.json({ user: req.user });
};
const User = require('../models/user');
const { generateToken } = require('../auth');

exports.login = async (req, res) => {
  try {
    const { username, email, identificacion, password } = req.body || {};
    const loginValue = typeof email === 'string' && email.trim()
      ? email.trim()
      : typeof username === 'string' && username.trim()
        ? username.trim()
        : typeof identificacion === 'string'
          ? identificacion.trim()
          : '';

    if (!loginValue || !password) {
      return res.status(400).json({ error: 'Email/identificacion y contraseña son obligatorios' });
    }

    const userRow = await User.findByLogin(loginValue);
    if (!userRow) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!userRow.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    const isValidPassword = await User.validatePassword(password, userRow.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = User.toSafeUser(userRow);
    const token = generateToken(user);

    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      user
    });
  } catch (error) {
    console.error('Error en login:', error.message);
    return res.status(500).json({ error: 'Error interno en el login' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Error obteniendo perfil:', error.message);
    return res.status(500).json({ error: 'Error interno obteniendo el perfil' });
  }
};
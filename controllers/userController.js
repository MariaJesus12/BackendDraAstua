const User = require('../models/user');
const Role = require('../models/role');
const { generateToken } = require('../auth');

exports.login = async (req, res) => {
  try {
    const { identificacion, password } = req.body || {};
    const normalizedIdentificacion = identificacion != null ? String(identificacion).trim() : '';
    const normalizedPassword = password != null ? String(password) : '';

    if (!normalizedIdentificacion || !normalizedPassword) {
      return res.status(400).json({ error: 'Identificacion y contraseña son obligatorios' });
    }

    const userRow = await User.findByIdentificacion(normalizedIdentificacion);
    if (!userRow) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!userRow.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    const isValidPassword = await User.validatePassword(normalizedPassword, userRow.password);
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
    const dbConnectivityErrors = new Set(['ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH']);
    if (error && dbConnectivityErrors.has(error.code)) {
      console.error('Error en login por conectividad a BD:', error.message, error.stack);
      return res.status(503).json({ error: 'Base de datos no disponible temporalmente' });
    }

    console.error('Error en login:', error.message, error.stack);
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

exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    return res.status(200).json({ roles });
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'La tabla de roles no existe en la base de datos' });
    }

    console.error('Error obteniendo roles:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno obteniendo roles' });
  }
};
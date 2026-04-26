const User = require('../models/user');
const Role = require('../models/role');
const { generateToken } = require('../auth');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

exports.getRoleById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del rol es invalido' });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    return res.status(200).json({
      role,
      id: role.id,
      nombre: role.nombre,
      name: role.nombre
    });
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'La tabla de roles no existe en la base de datos' });
    }

    console.error('Error obteniendo rol por id:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno obteniendo rol por id' });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    return res.status(200).json({ users: users.map((user) => User.toSafeUser(user)) });
  } catch (error) {
    console.error('Error listando usuarios:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno listando usuarios' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del usuario es invalido' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ user: User.toSafeUser(user) });
  } catch (error) {
    console.error('Error obteniendo usuario:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno obteniendo usuario' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const user = await User.create(req.body || {});
    return res.status(201).json({ user: User.toSafeUser(user) });
  } catch (error) {
    if (error && error.code === 'VALIDATION_ERROR') {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }

    console.error('Error creando usuario:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno creando usuario' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del usuario es invalido' });
    }

    const user = await User.update(id, req.body || {});
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ user: User.toSafeUser(user) });
  } catch (error) {
    if (error && error.code === 'VALIDATION_ERROR') {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }

    console.error('Error actualizando usuario:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno actualizando usuario' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del usuario es invalido' });
    }

    const authenticatedUserId = parseId(req.user && req.user.id);
    if (authenticatedUserId && authenticatedUserId === id) {
      return res.status(400).json({ error: 'No puede desactivar su propio usuario desde esta ruta' });
    }

    const user = await User.softDelete(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({
      message: 'Usuario desactivado correctamente',
      user: User.toSafeUser(user)
    });
  } catch (error) {
    if (error && error.code === 'VALIDATION_ERROR') {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }

    console.error('Error eliminando usuario:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno eliminando usuario' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const identificacion = req.body && req.body.identificacion != null
      ? String(req.body.identificacion).trim()
      : '';

    const currentPassword = req.body && req.body.currentPassword != null
      ? String(req.body.currentPassword)
      : '';
    const newPassword = req.body && req.body.newPassword != null
      ? String(req.body.newPassword)
      : '';
    const confirmNewPassword = req.body && req.body.confirmNewPassword != null
      ? String(req.body.confirmNewPassword)
      : '';

    if (!identificacion || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'identificacion, currentPassword y newPassword son obligatorios' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    if (confirmNewPassword && newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'La confirmación de contraseña no coincide' });
    }

    const user = await User.findByIdentificacion(identificacion);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    const isCurrentPasswordValid = await User.validatePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const isSamePassword = await User.validatePassword(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ error: 'La nueva contraseña no puede ser igual a la actual' });
    }

    await User.updatePassword(user.id, newPassword);

    return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    if (error && error.code === 'VALIDATION_ERROR') {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }

    console.error('Error cambiando contraseña:', error.message, error.stack);
    return res.status(500).json({ error: 'Error interno cambiando contraseña' });
  }
};
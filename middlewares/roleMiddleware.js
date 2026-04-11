const Role = require('../models/role');

module.exports = function requireRoles(allowedRoles = []) {
  const normalizedAllowedRoles = allowedRoles.map((role) => String(role).trim().toLowerCase());

  return async (req, res, next) => {
    try {
      const roleId = req.user && req.user.rol_id;
      if (!roleId) {
        return res.status(403).json({ error: 'El usuario autenticado no tiene rol asignado' });
      }

      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(403).json({ error: 'El rol del usuario no existe' });
      }

      const roleName = String(role.nombre).trim().toLowerCase();
      req.user.role = role;
      req.user.roleName = roleName;

      if (!normalizedAllowedRoles.includes(roleName)) {
        return res.status(403).json({ error: 'No tiene permisos para acceder a esta ruta' });
      }

      return next();
    } catch (error) {
      console.error('Error validando rol del usuario:', error.message, error.stack);
      return res.status(500).json({ error: 'Error interno validando permisos del usuario' });
    }
  };
};
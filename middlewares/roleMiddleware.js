const Role = require('../models/role');

module.exports = function requireRoles(allowedRoles = []) {
  const normalizedAllowedRoles = allowedRoles.map((role) => String(role).trim().toLowerCase());
  console.log('🔐 RoleMiddleware configurado para roles:', normalizedAllowedRoles);

  return async (req, res, next) => {
    try {
      const roleId = req.user && req.user.rol_id;
      console.log('👤 Usuario en req.user:', { id: req.user?.id, rol_id: roleId });
      
      if (!roleId) {
        console.log('❌ Usuario sin rol_id asignado');
        return res.status(403).json({ error: 'El usuario autenticado no tiene rol asignado' });
      }

      const role = await Role.findById(roleId);
      if (!role) {
        console.log('❌ Rol no encontrado en BD:', roleId);
        return res.status(403).json({ error: 'El rol del usuario no existe en la BD' });
      }

      const roleName = String(role.nombre).trim().toLowerCase();
      console.log('✅ Rol obtenido:', { id: role.id, nombre: role.nombre, normalized: roleName });
      
      req.user.role = role;
      req.user.roleName = roleName;

      if (!normalizedAllowedRoles.includes(roleName)) {
        console.log('❌ Rol no permitido. Usuario:', roleName, 'Permitidos:', normalizedAllowedRoles);
        return res.status(403).json({
          error: 'No tiene permisos para acceder a esta ruta',
          userRole: roleName,
          allowedRoles: normalizedAllowedRoles
        });
      }

      console.log('✅ Acceso permitido para rol:', roleName);
      return next();
    } catch (error) {
      console.error('❌ Error validando rol del usuario:', error.message, error.stack);
      return res.status(500).json({ error: 'Error interno validando permisos del usuario', detail: error.message });
    }
  };
};
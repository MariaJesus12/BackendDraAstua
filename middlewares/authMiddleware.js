const { verifyToken } = require('../auth');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const hasBearerPrefix = authHeader.startsWith('Bearer ');
  const token = hasBearerPrefix ? authHeader.slice(7).trim() : '';

  if (!hasBearerPrefix) {
    return res.status(401).json({ error: 'Formato de token invalido. Use Authorization: Bearer <token>' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const verification = verifyToken(token);
  if (!verification.valid) {
    if (verification.reason === 'expired') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }

  req.user = verification.payload;
  next();
};
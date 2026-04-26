const { verifyToken } = require('../auth');

module.exports = (req, res, next) => {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const xAccessToken = String(req.headers['x-access-token'] || '').trim();

  let token = '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    token = bearerMatch[1].trim();
  } else if (xAccessToken) {
    token = xAccessToken;
  } else if (authHeader && authHeader.split('.').length === 3) {
    // Compatibilidad: algunos clientes envian solo el JWT sin prefijo Bearer
    token = authHeader;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token requerido. Use Authorization: Bearer <token>' });
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
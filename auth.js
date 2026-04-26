const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no esta configurado');
  }
  return secret;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '12h';
}

function generateToken(user) {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpiresIn();

  return jwt.sign(
    {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol_id: user.rol_id,
      identificacion: user.identificacion
    },
    secret,
    { expiresIn }
  );
}

function verifyToken(token) {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    return { valid: true, payload: decoded };
  } catch (error) {
    return {
      valid: false,
      reason: error.name === 'TokenExpiredError' ? 'expired' : 'invalid'
    };
  }
}

module.exports = { generateToken, verifyToken };

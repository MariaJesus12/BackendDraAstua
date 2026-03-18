const { verifyToken } = require('../auth');

module.exports = (req, res, next) => {
  const token = req.headers['authorization'];
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Token inválido' });
  req.user = user;
  next();
};
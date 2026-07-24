const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'transit_secret_2026';

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  next();
}

module.exports = { authMiddleware, adminOnly, JWT_SECRET };

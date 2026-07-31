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
  if (!['admin', 'superviseur'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Accès superviseur ou admin requis' });
  }
  next();
}

function superviseurOnly(req, res, next) {
  if (!['admin', 'superviseur'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Accès superviseur requis' });
  }
  next();
}

function agentOrSuperviseur(req, res, next) {
  if (!['agent', 'superviseur', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Accès agent ou superviseur requis' });
  }
  next();
}

function clientOnly(req, res, next) {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ error: 'Accès client requis' });
  }
  next();
}

module.exports = {
  authMiddleware,
  adminOnly,
  superviseurOnly,
  agentOrSuperviseur,
  clientOnly,
  JWT_SECRET,
};


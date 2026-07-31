const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { login, mot_de_passe } = req.body;
    if (!login || !mot_de_passe) return res.status(400).json({ error: 'Login et mot de passe requis' });

    const user = await get('SELECT * FROM utilisateurs WHERE login = ? AND actif = 1', [login]);
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const ok = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    const tokenPayload = {
      id: user.id,
      login: user.login,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      client_id: user.client_id || null,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: tokenPayload });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = router;

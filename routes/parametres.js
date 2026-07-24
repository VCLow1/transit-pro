const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// ── TVA ──────────────────────────────────────────────────────────────────────
router.get('/tva', async (_, res) => {
  try { res.json(await all('SELECT * FROM tva ORDER BY taux')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/tva', async (req, res) => {
  try {
    const { libelle, taux, defaut } = req.body;
    const r = await run('INSERT INTO tva (libelle,taux,defaut) VALUES (?,?,?)', [libelle, taux||0, defaut?1:0]);
    res.status(201).json({ id: r.lastID });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/tva/:id', async (req, res) => {
  try {
    const { libelle, taux, defaut } = req.body;
    await run('UPDATE tva SET libelle=?,taux=?,defaut=? WHERE id=?', [libelle, taux||0, defaut?1:0, req.params.id]);
    res.json({ message: 'Mis à jour' });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/tva/:id', async (req, res) => {
  try { await run('DELETE FROM tva WHERE id=?', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── Secteurs ─────────────────────────────────────────────────────────────────
router.get('/secteurs', async (_, res) => {
  try { res.json(await all('SELECT * FROM secteur_activite ORDER BY libelle')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/secteurs', async (req, res) => {
  try {
    const { code, libelle } = req.body;
    const r = await run('INSERT INTO secteur_activite (code,libelle) VALUES (?,?)', [code, libelle]);
    res.status(201).json({ id: r.lastID });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/secteurs/:id', async (req, res) => {
  try {
    const { code, libelle } = req.body;
    await run('UPDATE secteur_activite SET code=?,libelle=? WHERE id=?', [code, libelle, req.params.id]);
    res.json({ message: 'Mis à jour' });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/secteurs/:id', async (req, res) => {
  try { await run('DELETE FROM secteur_activite WHERE id=?', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── Types déclaration ─────────────────────────────────────────────────────────
router.get('/types-declaration', async (_, res) => {
  try { res.json(await all('SELECT * FROM type_declaration ORDER BY libelle')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/types-declaration', async (req, res) => {
  try {
    const { code, libelle } = req.body;
    const r = await run('INSERT INTO type_declaration (code,libelle) VALUES (?,?)', [code, libelle]);
    res.status(201).json({ id: r.lastID });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/types-declaration/:id', async (req, res) => {
  try { await run('DELETE FROM type_declaration WHERE id=?', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── Rubriques ─────────────────────────────────────────────────────────────────
router.get('/rubriques', async (_, res) => {
  try {
    res.json(await all(`SELECT r.*, t.taux tva_taux, t.libelle tva_libelle
                        FROM rubrique r LEFT JOIN tva t ON r.tva_id=t.id ORDER BY r.libelle`));
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/rubriques', async (req, res) => {
  try {
    const { code, libelle, prix_defaut, tva_id } = req.body;
    const r = await run('INSERT INTO rubrique (code,libelle,prix_defaut,tva_id) VALUES (?,?,?,?)',
      [code, libelle, prix_defaut||0, tva_id||null]);
    res.status(201).json({ id: r.lastID });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/rubriques/:id', async (req, res) => {
  try {
    const { code, libelle, prix_defaut, tva_id } = req.body;
    await run('UPDATE rubrique SET code=?,libelle=?,prix_defaut=?,tva_id=? WHERE id=?',
      [code, libelle, prix_defaut||0, tva_id||null, req.params.id]);
    res.json({ message: 'Mis à jour' });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/rubriques/:id', async (req, res) => {
  try { await run('DELETE FROM rubrique WHERE id=?', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── Utilisateurs (admin only) ─────────────────────────────────────────────────
router.get('/utilisateurs', adminOnly, async (_, res) => {
  try { res.json(await all('SELECT id,login,nom,prenom,email,role,actif,created_at FROM utilisateurs ORDER BY nom')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/utilisateurs', adminOnly, async (req, res) => {
  try {
    const { login, mot_de_passe, nom, prenom, email, role } = req.body;
    if (!login || !mot_de_passe || !nom) return res.status(400).json({ error: 'Login, mot de passe et nom requis' });
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const r = await run('INSERT INTO utilisateurs (login,mot_de_passe,nom,prenom,email,role) VALUES (?,?,?,?,?,?)',
      [login, hash, nom, prenom||null, email||null, role||'agent']);
    res.status(201).json({ id: r.lastID });
  } catch(e){
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Login déjà utilisé' });
    res.status(500).json({error:e.message});
  }
});
router.put('/utilisateurs/:id', adminOnly, async (req, res) => {
  try {
    const { nom, prenom, email, role, actif, mot_de_passe } = req.body;
    if (mot_de_passe) {
      const hash = await bcrypt.hash(mot_de_passe, 10);
      await run('UPDATE utilisateurs SET nom=?,prenom=?,email=?,role=?,actif=?,mot_de_passe=? WHERE id=?',
        [nom, prenom||null, email||null, role||'agent', actif!==undefined?actif:1, hash, req.params.id]);
    } else {
      await run('UPDATE utilisateurs SET nom=?,prenom=?,email=?,role=?,actif=? WHERE id=?',
        [nom, prenom||null, email||null, role||'agent', actif!==undefined?actif:1, req.params.id]);
    }
    res.json({ message: 'Utilisateur mis à jour' });
  } catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/utilisateurs/:id', adminOnly, async (req, res) => {
  try {
    if (req.user.id == req.params.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
    await run('UPDATE utilisateurs SET actif=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Utilisateur désactivé' });
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;

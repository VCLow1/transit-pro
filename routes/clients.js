const express = require('express');
const { run, get, all } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// Liste avec recherche + pagination
router.get('/', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 50, secteur } = req.query;
    const offset = (page - 1) * limit;
    const search = `%${q}%`;
    let where = 'WHERE c.actif = 1';
    const params = [];
    if (q) { where += ' AND (c.raison_sociale LIKE ? OR c.code LIKE ? OR c.email LIKE ?)'; params.push(search, search, search); }
    if (secteur) { where += ' AND c.secteur_id = ?'; params.push(secteur); }

    const [rows, total] = await Promise.all([
      all(`SELECT c.*, s.libelle secteur_lib,
                  (SELECT COUNT(*) FROM dossiers d WHERE d.client_id=c.id) nb_dossiers,
                  (SELECT COUNT(*) FROM factures f WHERE f.client_id=c.id AND f.statut IN ('emise','partielle')) nb_impayees
           FROM clients c LEFT JOIN secteur_activite s ON c.secteur_id=s.id
           ${where} ORDER BY c.raison_sociale LIMIT ? OFFSET ?`,
        [...params, limit, offset]),
      get(`SELECT COUNT(*) n FROM clients c ${where}`, params),
    ]);
    res.json({ data: rows, total: total.n, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await get(`SELECT c.*, s.libelle secteur_lib FROM clients c
                         LEFT JOIN secteur_activite s ON c.secteur_id=s.id
                         WHERE c.id=?`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Client non trouvé' });
    // Stats dossiers
    const stats = await get(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN statut='ouvert' THEN 1 ELSE 0 END) ouverts,
      SUM(CASE WHEN statut='en_cours' THEN 1 ELSE 0 END) en_cours,
      SUM(CASE WHEN statut='cloture' THEN 1 ELSE 0 END) clotures
      FROM dossiers WHERE client_id=?`, [req.params.id]);
    res.json({ ...c, stats_dossiers: stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { code, raison_sociale, secteur_id, adresse, ville, code_postal, pays,
            telephone, fax, email, contact, nif, tva_num, notes } = req.body;
    if (!code || !raison_sociale) return res.status(400).json({ error: 'Code et raison sociale requis' });
    const r = await run(
      `INSERT INTO clients (code,raison_sociale,secteur_id,adresse,ville,code_postal,pays,telephone,fax,email,contact,nif,tva_num,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, raison_sociale, secteur_id||null, adresse||null, ville||null, code_postal||null,
       pays||'Tunisie', telephone||null, fax||null, email||null, contact||null, nif||null, tva_num||null, notes||null]
    );
    res.status(201).json({ id: r.lastID, message: 'Client créé' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Code client déjà utilisé' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { code, raison_sociale, secteur_id, adresse, ville, code_postal, pays,
            telephone, fax, email, contact, nif, tva_num, notes, actif } = req.body;
    await run(
      `UPDATE clients SET code=?,raison_sociale=?,secteur_id=?,adresse=?,ville=?,code_postal=?,
       pays=?,telephone=?,fax=?,email=?,contact=?,nif=?,tva_num=?,notes=?,actif=? WHERE id=?`,
      [code, raison_sociale, secteur_id||null, adresse||null, ville||null, code_postal||null,
       pays||'Tunisie', telephone||null, fax||null, email||null, contact||null, nif||null,
       tva_num||null, notes||null, actif !== undefined ? actif : 1, req.params.id]
    );
    res.json({ message: 'Client mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    // Soft delete
    await run('UPDATE clients SET actif=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Client archivé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

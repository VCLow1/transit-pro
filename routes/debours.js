const express = require('express');
const { run, get, all } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { dossier_id, q = '', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const conds = []; const params = [];
    if (dossier_id) { conds.push('db.dossier_id=?'); params.push(dossier_id); }
    if (q) { conds.push('(db.libelle LIKE ? OR db.beneficiaire LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [rows, total, sommeTotale] = await Promise.all([
      all(`SELECT db.*, d.reference ref_dossier, c.raison_sociale
           FROM debours db
           JOIN dossiers d ON db.dossier_id=d.id
           JOIN clients c ON d.client_id=c.id
           ${where} ORDER BY db.date_debours DESC LIMIT ? OFFSET ?`, [...params, +limit, offset]),
      get(`SELECT COUNT(*) n FROM debours db ${where}`, params),
      get(`SELECT COALESCE(SUM(montant),0) total FROM debours db ${where}`, params),
    ]);
    res.json({ data: rows, total: total.n, somme_totale: sommeTotale.total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/dossier/:dossierId/recap', async (req, res) => {
  try {
    const rows = await all(
      `SELECT db.*, f.numero facture_numero
       FROM debours db LEFT JOIN factures f ON db.facture_id=f.id
       WHERE db.dossier_id=? ORDER BY db.date_debours`,
      [req.params.dossierId]
    );
    const total = rows.reduce((s, r) => s + r.montant, 0);
    const refactures = rows.filter(r => r.facture_id).reduce((s, r) => s + r.montant, 0);
    res.json({ debours: rows, total, refactures, a_refacturer: total - refactures });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { dossier_id, date_debours, libelle, beneficiaire, montant, devise, notes } = req.body;
    if (!dossier_id || !libelle || !montant) return res.status(400).json({ error: 'Dossier, libelle et montant requis' });
    const r = await run(
      `INSERT INTO debours (dossier_id,date_debours,libelle,beneficiaire,montant,devise,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [dossier_id, date_debours||null, libelle, beneficiaire||null, montant,
       devise||'TND', notes||null, req.user.id]
    );
    res.status(201).json({ id: r.lastID, message: 'Débours enregistré' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { date_debours, libelle, beneficiaire, montant, devise, notes } = req.body;
    await run(
      `UPDATE debours SET date_debours=?,libelle=?,beneficiaire=?,montant=?,devise=?,notes=? WHERE id=?`,
      [date_debours||null, libelle, beneficiaire||null, montant, devise||'TND', notes||null, req.params.id]
    );
    res.json({ message: 'Débours mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM debours WHERE id=?', [req.params.id]);
    res.json({ message: 'Débours supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

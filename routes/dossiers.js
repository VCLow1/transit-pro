const express = require('express');
const { run, get, all, genRefDossier } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

const BASE_SELECT = `
  SELECT d.*,
    c.raison_sociale, c.email client_email, c.telephone client_tel,
    td.code type_code, td.libelle type_libelle,
    u.nom || ' ' || COALESCE(u.prenom,'') cree_par
  FROM dossiers d
  JOIN clients c ON d.client_id = c.id
  JOIN type_declaration td ON d.type_decl_id = td.id
  LEFT JOIN utilisateurs u ON d.created_by = u.id`;

router.get('/', async (req, res) => {
  try {
    const { q='', statut='', type='', page=1, limit=50, client_id } = req.query;
    const offset = (page-1)*limit;
    const conditions = []; const params = [];
    if (q)         { conditions.push("(d.reference LIKE ? OR c.raison_sociale LIKE ? OR d.marchandise LIKE ?)"); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    if (statut)    { conditions.push("d.statut = ?"); params.push(statut); }
    if (type)      { conditions.push("td.code = ?"); params.push(type); }
    if (client_id) { conditions.push("d.client_id = ?"); params.push(client_id); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows, total] = await Promise.all([
      all(`${BASE_SELECT} ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      get(`SELECT COUNT(*) n FROM dossiers d JOIN clients c ON d.client_id=c.id JOIN type_declaration td ON d.type_decl_id=td.id ${where}`, params),
    ]);
    res.json({ data: rows, total: total.n, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const dossier = await get(`${BASE_SELECT} WHERE d.id=?`, [req.params.id]);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });
    const [notes, pieces, debours, factures, preavis] = await Promise.all([
      all(`SELECT dn.*, u.nom||' '||COALESCE(u.prenom,'') auteur FROM dossier_notes dn LEFT JOIN utilisateurs u ON dn.auteur_id=u.id WHERE dn.dossier_id=? ORDER BY dn.created_at DESC`, [req.params.id]),
      all('SELECT * FROM dossier_pieces WHERE dossier_id=? ORDER BY created_at DESC', [req.params.id]),
      all('SELECT * FROM debours WHERE dossier_id=? ORDER BY date_debours DESC', [req.params.id]),
      all(`SELECT f.id, f.numero, f.date_facture, f.statut,
           COALESCE((SELECT SUM(fl.quantite*fl.prix_unitaire*(1+COALESCE(t.taux,0)/100)) FROM facture_lignes fl LEFT JOIN tva t ON fl.tva_id=t.id WHERE fl.facture_id=f.id),0) montant_ttc
           FROM factures f WHERE f.dossier_id=? ORDER BY f.created_at DESC`, [req.params.id]),
      all('SELECT * FROM preavis_arrivee WHERE dossier_id=? ORDER BY created_at DESC', [req.params.id]),
    ]);
    res.json({ ...dossier, notes, pieces, debours, factures, preavis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, type_decl_id, description, marchandise, pays_origine,
            pays_destination, valeur_douane, devise, incoterm, observations } = req.body;
    if (!client_id || !type_decl_id) return res.status(400).json({ error: 'Client et type de déclaration requis' });
    const typeRow = await get('SELECT code FROM type_declaration WHERE id=?', [type_decl_id]);
    if (!typeRow) return res.status(400).json({ error: 'Type de déclaration invalide' });
    const reference = await genRefDossier(typeRow.code);
    const r = await run(
      `INSERT INTO dossiers (reference,client_id,type_decl_id,description,marchandise,pays_origine,pays_destination,valeur_douane,devise,incoterm,observations,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [reference, client_id, type_decl_id, description||null, marchandise||null,
       pays_origine||null, pays_destination||null, valeur_douane||0, devise||'TND',
       incoterm||null, observations||null, req.user.id]
    );
    res.status(201).json({ id: r.lastID, reference, message: 'Dossier créé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { client_id, type_decl_id, statut, description, marchandise, pays_origine,
            pays_destination, valeur_douane, devise, incoterm, observations } = req.body;
    await run(
      `UPDATE dossiers SET client_id=?,type_decl_id=?,statut=?,description=?,marchandise=?,
       pays_origine=?,pays_destination=?,valeur_douane=?,devise=?,incoterm=?,observations=?,updated_at=datetime('now') WHERE id=?`,
      [client_id, type_decl_id, statut||'ouvert', description||null, marchandise||null,
       pays_origine||null, pays_destination||null, valeur_douane||0, devise||'TND',
       incoterm||null, observations||null, req.params.id]
    );
    res.json({ message: 'Dossier mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/statut', async (req, res) => {
  try {
    const { statut } = req.body;
    if (!['ouvert','en_cours','cloture'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
    await run("UPDATE dossiers SET statut=?,updated_at=datetime('now') WHERE id=?", [statut, req.params.id]);
    res.json({ message: 'Statut mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM dossiers WHERE id=?', [req.params.id]);
    res.json({ message: 'Dossier supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Notes
router.post('/:id/notes', async (req, res) => {
  try {
    const { contenu } = req.body;
    if (!contenu) return res.status(400).json({ error: 'Contenu requis' });
    const r = await run('INSERT INTO dossier_notes (dossier_id,contenu,auteur_id) VALUES (?,?,?)',
      [req.params.id, contenu, req.user.id]);
    res.status(201).json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

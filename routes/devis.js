const express = require('express');
const { run, get, all, genNumDevis, genNumFacture } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// ── helpers ──
async function calcTotaux(lignes) {
  let ht = 0, tva = 0;
  for (const l of lignes) {
    const lHt = (l.quantite || 0) * (l.prix_unitaire || 0);
    const lTva = lHt * ((l.tva_taux || 0) / 100);
    ht += lHt; tva += lTva;
  }
  return { ht: Math.round(ht*1000)/1000, tva: Math.round(tva*1000)/1000, ttc: Math.round((ht+tva)*1000)/1000 };
}

async function getLignes(table, parentField, parentId) {
  return all(`SELECT l.*, t.taux tva_taux, t.libelle tva_libelle FROM ${table} l
              LEFT JOIN tva t ON l.tva_id=t.id WHERE l.${parentField}=? ORDER BY l.ordre`, [parentId]);
}

// ── Devis ──
router.get('/', async (req, res) => {
  try {
    const { q='', statut='', page=1, limit=50, client_id } = req.query;
    const offset = (page-1)*limit;
    const conds=[]; const params=[];
    if (q) { conds.push('(dv.numero LIKE ? OR c.raison_sociale LIKE ?)'); params.push(`%${q}%`,`%${q}%`); }
    if (statut) { conds.push('dv.statut=?'); params.push(statut); }
    if (req.user.role === 'client') {
      conds.push('dv.client_id=?');
      params.push(req.user.client_id || 0);
    } else if (client_id) {
      conds.push('dv.client_id=?');
      params.push(client_id);
    }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';

    const [rows, total] = await Promise.all([
      all(`SELECT dv.*, c.raison_sociale, dos.reference ref_dossier FROM devis dv
           JOIN clients c ON dv.client_id=c.id LEFT JOIN dossiers dos ON dv.dossier_id=dos.id
           ${where} ORDER BY dv.created_at DESC LIMIT ? OFFSET ?`, [...params,+limit,offset]),
      get(`SELECT COUNT(*) n FROM devis dv JOIN clients c ON dv.client_id=c.id ${where}`, params),
    ]);
    // Attach totaux
    for (const dv of rows) {
      const lignes = await getLignes('devis_lignes','devis_id',dv.id);
      const tot = await calcTotaux(lignes);
      dv.total_ht = tot.ht; dv.total_tva = tot.tva; dv.total_ttc = tot.ttc;
    }
    res.json({ data: rows, total: total.n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const dv = await get(`SELECT dv.*, c.raison_sociale, c.adresse client_adresse, c.nif client_nif,
                          c.tva_num client_tva, c.email client_email, c.telephone client_tel,
                          c.ville client_ville, dos.reference ref_dossier
                          FROM devis dv JOIN clients c ON dv.client_id=c.id
                          LEFT JOIN dossiers dos ON dv.dossier_id=dos.id WHERE dv.id=?`, [req.params.id]);
    if (!dv) return res.status(404).json({ error: 'Devis non trouvé' });
    if (req.user.role === 'client' && dv.client_id !== req.user.client_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const lignes = await getLignes('devis_lignes','devis_id',dv.id);
    const tot = await calcTotaux(lignes);
    res.json({ ...dv, lignes, ...tot });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, dossier_id, date_devis, date_validite, objet, conditions, notes, remise_globale, lignes=[] } = req.body;
    if (!client_id || !lignes.length) return res.status(400).json({ error: 'Client et lignes requis' });
    const numero = await genNumDevis();
    const r = await run(
      `INSERT INTO devis (numero,client_id,dossier_id,date_devis,date_validite,objet,conditions,notes,remise_globale,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [numero, client_id, dossier_id||null, date_devis||null, date_validite||null,
       objet||null, conditions||null, notes||null, remise_globale||0, req.user.id]
    );
    const dvId = r.lastID;
    for (let i=0; i<lignes.length; i++) {
      const l = lignes[i];
      await run(`INSERT INTO devis_lignes (devis_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre)
                 VALUES (?,?,?,?,?,?,?)`,
        [dvId, l.rubrique_id||null, l.designation, l.quantite||1, l.prix_unitaire||0, l.tva_id||null, i]);
    }
    res.status(201).json({ id: dvId, numero, message: 'Devis créé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { client_id, dossier_id, date_devis, date_validite, statut, objet, conditions, notes, remise_globale, lignes } = req.body;
    await run(
      `UPDATE devis SET client_id=?,dossier_id=?,date_devis=?,date_validite=?,statut=?,objet=?,conditions=?,notes=?,remise_globale=? WHERE id=?`,
      [client_id, dossier_id||null, date_devis, date_validite||null, statut||'brouillon',
       objet||null, conditions||null, notes||null, remise_globale||0, req.params.id]
    );
    if (lignes) {
      await run('DELETE FROM devis_lignes WHERE devis_id=?', [req.params.id]);
      for (let i=0; i<lignes.length; i++) {
        const l = lignes[i];
        await run(`INSERT INTO devis_lignes (devis_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre) VALUES (?,?,?,?,?,?,?)`,
          [req.params.id, l.rubrique_id||null, l.designation, l.quantite||1, l.prix_unitaire||0, l.tva_id||null, i]);
      }
    }
    res.json({ message: 'Devis mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Convertir devis → facture
router.post('/:id/convertir', async (req, res) => {
  try {
    const dv = await get('SELECT * FROM devis WHERE id=?', [req.params.id]);
    if (!dv) return res.status(404).json({ error: 'Devis non trouvé' });
    const lignes = await getLignes('devis_lignes','devis_id',dv.id);
    const numero = await genNumFacture();
    const r = await run(
      `INSERT INTO factures (numero,client_id,dossier_id,devis_id,date_facture,objet,conditions,notes,remise_globale,statut,created_by)
       VALUES (?,?,?,?,date('now'),?,?,?,?,'emise',?)`,
      [numero, dv.client_id, dv.dossier_id, dv.id, dv.objet, dv.conditions, dv.notes, dv.remise_globale, req.user.id]
    );
    const facId = r.lastID;
    for (let i=0; i<lignes.length; i++) {
      const l = lignes[i];
      await run(`INSERT INTO facture_lignes (facture_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre) VALUES (?,?,?,?,?,?,?)`,
        [facId, l.rubrique_id, l.designation, l.quantite, l.prix_unitaire, l.tva_id, i]);
    }
    await run("UPDATE devis SET statut='facture' WHERE id=?", [dv.id]);
    res.json({ id: facId, numero, message: 'Facture créée depuis devis' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM devis WHERE id=?', [req.params.id]);
    res.json({ message: 'Devis supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

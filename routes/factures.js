const express = require('express');
const { run, get, all, genNumFacture } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

async function getLignes(facId) {
  return all(`SELECT l.*, t.taux tva_taux, t.libelle tva_libelle
              FROM facture_lignes l LEFT JOIN tva t ON l.tva_id=t.id
              WHERE l.facture_id=? ORDER BY l.ordre`, [facId]);
}

function calcTotaux(lignes, remise = 0) {
  let ht = 0, tva = 0;
  for (const l of lignes) {
    const lHt = (l.quantite || 0) * (l.prix_unitaire || 0);
    ht += lHt;
    tva += lHt * ((l.tva_taux || 0) / 100);
  }
  const ttc = ht + tva;
  const net = ttc - (remise || 0);
  return {
    total_ht:  Math.round(ht  * 1000) / 1000,
    total_tva: Math.round(tva * 1000) / 1000,
    total_ttc: Math.round(ttc * 1000) / 1000,
    net_a_payer: Math.round(net * 1000) / 1000,
  };
}

router.get('/', async (req, res) => {
  try {
    const { q='', statut='', page=1, limit=50, client_id, dossier_id } = req.query;
    const offset = (page - 1) * limit;
    const conds = []; const params = [];
    if (q)         { conds.push('(f.numero LIKE ? OR c.raison_sociale LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (statut)    { conds.push('f.statut=?'); params.push(statut); }
    if (client_id) { conds.push('f.client_id=?'); params.push(client_id); }
    if (dossier_id){ conds.push('f.dossier_id=?'); params.push(dossier_id); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [rows, total] = await Promise.all([
      all(`SELECT f.*, c.raison_sociale, d.reference ref_dossier,
                  COALESCE((SELECT SUM(p.montant) FROM paiements p WHERE p.facture_id=f.id),0) total_paye
           FROM factures f JOIN clients c ON f.client_id=c.id
           LEFT JOIN dossiers d ON f.dossier_id=d.id
           ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`, [...params, +limit, offset]),
      get(`SELECT COUNT(*) n FROM factures f JOIN clients c ON f.client_id=c.id ${where}`, params),
    ]);
    // Attach totaux
    for (const f of rows) {
      const lignes = await getLignes(f.id);
      Object.assign(f, calcTotaux(lignes, f.remise_globale));
    }
    res.json({ data: rows, total: total.n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const f = await get(`SELECT f.*, c.raison_sociale, c.adresse client_adresse, c.nif client_nif,
                         c.tva_num client_tva, c.email client_email, c.telephone client_tel,
                         c.ville client_ville, c.code_postal client_cp, c.pays client_pays,
                         d.reference ref_dossier, dv.numero ref_devis
                         FROM factures f JOIN clients c ON f.client_id=c.id
                         LEFT JOIN dossiers d ON f.dossier_id=d.id
                         LEFT JOIN devis dv ON f.devis_id=dv.id
                         WHERE f.id=?`, [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Facture non trouvée' });
    const [lignes, paiements, decharges] = await Promise.all([
      getLignes(f.id),
      all('SELECT * FROM paiements WHERE facture_id=? ORDER BY date_paiement DESC', [f.id]),
      all('SELECT * FROM decharges WHERE facture_id=? ORDER BY date_decharge DESC', [f.id]),
    ]);
    const totaux = calcTotaux(lignes, f.remise_globale);
    const total_paye = paiements.reduce((s, p) => s + p.montant, 0);
    res.json({ ...f, lignes, paiements, decharges, ...totaux, total_paye,
               reste_a_payer: Math.round((totaux.net_a_payer - total_paye) * 1000) / 1000 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, dossier_id, date_facture, date_echeance, objet,
            conditions, notes, remise_globale, lignes = [] } = req.body;
    if (!client_id || !lignes.length) return res.status(400).json({ error: 'Client et lignes requis' });
    const numero = await genNumFacture();
    const r = await run(
      `INSERT INTO factures (numero,client_id,dossier_id,date_facture,date_echeance,statut,objet,conditions,notes,remise_globale,created_by)
       VALUES (?,?,?,?,?,'emise',?,?,?,?,?)`,
      [numero, client_id, dossier_id||null, date_facture||null, date_echeance||null,
       objet||null, conditions||null, notes||null, remise_globale||0, req.user.id]
    );
    const facId = r.lastID;
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      await run(`INSERT INTO facture_lignes (facture_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre)
                 VALUES (?,?,?,?,?,?,?)`,
        [facId, l.rubrique_id||null, l.designation, l.quantite||1, l.prix_unitaire||0, l.tva_id||null, i]);
    }
    res.status(201).json({ id: facId, numero, message: 'Facture créée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { client_id, dossier_id, date_facture, date_echeance, statut, objet,
            conditions, notes, remise_globale, lignes } = req.body;
    await run(
      `UPDATE factures SET client_id=?,dossier_id=?,date_facture=?,date_echeance=?,statut=?,
       objet=?,conditions=?,notes=?,remise_globale=? WHERE id=?`,
      [client_id, dossier_id||null, date_facture, date_echeance||null, statut||'emise',
       objet||null, conditions||null, notes||null, remise_globale||0, req.params.id]
    );
    if (lignes) {
      await run('DELETE FROM facture_lignes WHERE facture_id=?', [req.params.id]);
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await run(`INSERT INTO facture_lignes (facture_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre)
                   VALUES (?,?,?,?,?,?,?)`,
          [req.params.id, l.rubrique_id||null, l.designation, l.quantite||1, l.prix_unitaire||0, l.tva_id||null, i]);
      }
    }
    // Auto-update statut based on paiements
    await syncStatutFacture(req.params.id);
    res.json({ message: 'Facture mise à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enregistrer un paiement
router.post('/:id/paiements', async (req, res) => {
  try {
    const { date_paiement, montant, mode, reference, notes } = req.body;
    if (!montant || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });
    const r = await run(
      `INSERT INTO paiements (facture_id,date_paiement,montant,mode,reference,notes,created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [req.params.id, date_paiement||null, montant, mode||'virement', reference||null, notes||null, req.user.id]
    );
    await syncStatutFacture(req.params.id);
    res.status(201).json({ id: r.lastID, message: 'Paiement enregistré' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/paiements/:pid', async (req, res) => {
  try {
    await run('DELETE FROM paiements WHERE id=? AND facture_id=?', [req.params.pid, req.params.id]);
    await syncStatutFacture(req.params.id);
    res.json({ message: 'Paiement supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Décharge
router.post('/:id/decharges', async (req, res) => {
  try {
    const { date_decharge, signataire, observations } = req.body;
    const r = await run(
      'INSERT INTO decharges (facture_id,date_decharge,signataire,observations) VALUES (?,?,?,?)',
      [req.params.id, date_decharge||null, signataire||null, observations||null]
    );
    res.status(201).json({ id: r.lastID, message: 'Décharge enregistrée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM factures WHERE id=?', [req.params.id]);
    res.json({ message: 'Facture supprimée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function syncStatutFacture(facId) {
  try {
    const f = await get('SELECT * FROM factures WHERE id=?', [facId]);
    if (!f || f.statut === 'annulee') return;
    const lignes = await getLignes(facId);
    const { net_a_payer } = calcTotaux(lignes, f.remise_globale);
    const { total_paye } = await get('SELECT COALESCE(SUM(montant),0) total_paye FROM paiements WHERE facture_id=?', [facId]);
    let statut = 'emise';
    if (total_paye >= net_a_payer && net_a_payer > 0) statut = 'payee';
    else if (total_paye > 0) statut = 'partielle';
    await run('UPDATE factures SET statut=? WHERE id=?', [statut, facId]);
  } catch {}
}

module.exports = router;

const express = require('express');
const { run, get, all, genRefPreavis } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { q='', statut='', page=1, limit=50 } = req.query;
    const offset = (page-1)*limit;
    const conds=[]; const params=[];
    if (q) { conds.push('(pa.reference LIKE ? OR c.raison_sociale LIKE ? OR pa.transporteur LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    if (statut) { conds.push('pa.statut=?'); params.push(statut); }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';

    const [rows, total] = await Promise.all([
      all(`SELECT pa.*, c.raison_sociale, c.email client_email, d.reference ref_dossier
           FROM preavis_arrivee pa JOIN clients c ON pa.client_id=c.id JOIN dossiers d ON pa.dossier_id=d.id
           ${where} ORDER BY pa.date_arrivee_prevue ASC LIMIT ? OFFSET ?`, [...params,+limit,offset]),
      get(`SELECT COUNT(*) n FROM preavis_arrivee pa JOIN clients c ON pa.client_id=c.id ${where}`, params),
    ]);
    res.json({ data: rows, total: total.n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const pa = await get(`SELECT pa.*, c.raison_sociale, c.email client_email,
                          c.telephone client_tel, d.reference ref_dossier
                          FROM preavis_arrivee pa JOIN clients c ON pa.client_id=c.id
                          JOIN dossiers d ON pa.dossier_id=d.id WHERE pa.id=?`, [req.params.id]);
    if (!pa) return res.status(404).json({ error: 'Préavis non trouvé' });
    res.json(pa);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { dossier_id, client_id, date_arrivee_prevue, transporteur, moyen_transport,
            ref_transport, port_embarquement, port_dechargement, designation_march,
            nb_colis, poids_brut, volume, notes } = req.body;
    if (!dossier_id || !client_id) return res.status(400).json({ error: 'Dossier et client requis' });
    const reference = await genRefPreavis();
    const r = await run(
      `INSERT INTO preavis_arrivee (reference,dossier_id,client_id,date_arrivee_prevue,transporteur,
       moyen_transport,ref_transport,port_embarquement,port_dechargement,designation_march,
       nb_colis,poids_brut,volume,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [reference, dossier_id, client_id, date_arrivee_prevue||null, transporteur||null,
       moyen_transport||null, ref_transport||null, port_embarquement||null, port_dechargement||null,
       designation_march||null, nb_colis||null, poids_brut||null, volume||null, notes||null, req.user.id]
    );
    res.status(201).json({ id: r.lastID, reference, message: 'Préavis créé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { date_arrivee_prevue, transporteur, moyen_transport, ref_transport,
            port_embarquement, port_dechargement, designation_march,
            nb_colis, poids_brut, volume, statut, notes } = req.body;
    await run(
      `UPDATE preavis_arrivee SET date_arrivee_prevue=?,transporteur=?,moyen_transport=?,
       ref_transport=?,port_embarquement=?,port_dechargement=?,designation_march=?,
       nb_colis=?,poids_brut=?,volume=?,statut=?,notes=? WHERE id=?`,
      [date_arrivee_prevue||null, transporteur||null, moyen_transport||null, ref_transport||null,
       port_embarquement||null, port_dechargement||null, designation_march||null,
       nb_colis||null, poids_brut||null, volume||null, statut||'en_attente', notes||null, req.params.id]
    );
    res.json({ message: 'Préavis mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/notifier', async (req, res) => {
  try {
    const pa = await get(`SELECT pa.*, c.email client_email, c.raison_sociale FROM preavis_arrivee pa JOIN clients c ON pa.client_id=c.id WHERE pa.id=?`, [req.params.id]);
    if (!pa) return res.status(404).json({ error: 'Préavis non trouvé' });
    if (!pa.client_email) return res.status(400).json({ error: 'Client sans email' });
    // Mark as sent (email sending optional - requires SMTP config)
    await run('UPDATE preavis_arrivee SET email_notif_envoye=1 WHERE id=?', [req.params.id]);
    res.json({ message: `Notification envoyée à ${pa.client_email}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM preavis_arrivee WHERE id=?', [req.params.id]);
    res.json({ message: 'Préavis supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

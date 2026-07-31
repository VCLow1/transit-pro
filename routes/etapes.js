const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { run, get, all } = require('../db/database');
const { authMiddleware, superviseurOnly, agentOrSuperviseur } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Configuration Multer pour les pièces jointes
const uploadDir = path.join(__dirname, '../public/uploads/etapes');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'etape-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } }); // Max 15MB

// ── 1. Déclarer une étape (Agent / Superviseur) ──────────────────────────────
router.post('/', agentOrSuperviseur, upload.array('pieces_jointes', 5), async (req, res) => {
  try {
    const { dossier_id, titre_etape, description } = req.body;
    if (!dossier_id || !titre_etape) {
      return res.status(400).json({ error: 'Dossier et titre d\'étape requis' });
    }

    const dossier = await get('SELECT d.*, c.raison_sociale FROM dossiers d JOIN clients c ON d.client_id=c.id WHERE d.id=?', [dossier_id]);
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    // Gestion des fichiers uploadés
    const files = req.files || [];
    const piecesJointes = files.map(f => ({
      filename: f.originalname,
      path: '/uploads/etapes/' + f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    const result = await run(
      `INSERT INTO etapes_dossier (dossier_id, agent_id, titre_etape, description, pieces_jointes, statut, date_declaration)
       VALUES (?, ?, ?, ?, ?, 'en_attente', datetime('now'))`,
      [dossier_id, req.user.id, titre_etape, description || null, JSON.stringify(piecesJointes)]
    );

    const etapeId = result.lastID;

    // Notifier tous les superviseurs / admins
    const supervisors = await all("SELECT id FROM utilisateurs WHERE role IN ('superviseur', 'admin') AND actif = 1");
    const agentName = `${req.user.prenom || ''} ${req.user.nom}`.trim() || req.user.login;
    for (const sup of supervisors) {
      await run(
        `INSERT INTO notifications (user_id, dossier_id, etape_id, message, date_creation)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [sup.id, dossier_id, etapeId, `Nouvelle étape "${titre_etape}" déclarée par ${agentName} (Dossier ${dossier.reference})`]
      );
    }

    res.status(201).json({ id: etapeId, message: 'Étape déclarée avec succès, en attente de validation' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 2. File d'attente des étapes en attente de validation (Superviseur) ──────
router.get('/pending', superviseurOnly, async (req, res) => {
  try {
    const etapes = await all(`
      SELECT e.*,
             d.reference dossier_ref, d.marchandise,
             c.raison_sociale client_nom,
             (u.nom || ' ' || COALESCE(u.prenom, '')) agent_nom
      FROM etapes_dossier e
      JOIN dossiers d ON e.dossier_id = d.id
      JOIN clients c ON d.client_id = c.id
      JOIN utilisateurs u ON e.agent_id = u.id
      WHERE e.statut = 'en_attente'
      ORDER BY e.date_declaration ASC
    `);

    const formatted = etapes.map(e => ({
      ...e,
      pieces_jointes: e.pieces_jointes ? JSON.parse(e.pieces_jointes) : []
    }));

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 3. Mes déclarations (Agent connecté) ─────────────────────────────────────
router.get('/my-declarations', agentOrSuperviseur, async (req, res) => {
  try {
    const etapes = await all(`
      SELECT e.*,
             d.reference dossier_ref,
             c.raison_sociale client_nom,
             (v.nom || ' ' || COALESCE(v.prenom, '')) validateur_nom
      FROM etapes_dossier e
      JOIN dossiers d ON e.dossier_id = d.id
      JOIN clients c ON d.client_id = c.id
      LEFT JOIN utilisateurs v ON e.valide_par = v.id
      WHERE e.agent_id = ?
      ORDER BY e.date_declaration DESC
    `, [req.user.id]);

    const formatted = etapes.map(e => ({
      ...e,
      pieces_jointes: e.pieces_jointes ? JSON.parse(e.pieces_jointes) : []
    }));

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 4. Étapes d'un dossier spécifique (Filtré par rôle) ──────────────────────
router.get('/dossier/:dossier_id', async (req, res) => {
  try {
    const { dossier_id } = req.params;
    const dossier = await get('SELECT * FROM dossiers WHERE id = ?', [dossier_id]);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Si rôle client, vérifier que le dossier lui appartient
    if (req.user.role === 'client') {
      if (dossier.client_id !== req.user.client_id) {
        return res.status(403).json({ error: 'Accès non autorisé à ce dossier' });
      }
    }

    let query = `
      SELECT e.*,
             (u.nom || ' ' || COALESCE(u.prenom, '')) agent_nom,
             (v.nom || ' ' || COALESCE(v.prenom, '')) validateur_nom
      FROM etapes_dossier e
      LEFT JOIN utilisateurs u ON e.agent_id = u.id
      LEFT JOIN utilisateurs v ON e.valide_par = v.id
      WHERE e.dossier_id = ?
    `;

    // Le client ne voit UNIQUEMENT que les étapes validées
    if (req.user.role === 'client') {
      query += ` AND e.statut = 'validee' ORDER BY e.date_validation ASC, e.date_declaration ASC`;
    } else {
      query += ` ORDER BY e.date_declaration ASC`;
    }

    const etapes = await all(query, [dossier_id]);
    const formatted = etapes.map(e => ({
      ...e,
      pieces_jointes: e.pieces_jointes ? JSON.parse(e.pieces_jointes) : []
    }));

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 5. Valider une étape (Superviseur) ───────────────────────────────────────
router.patch('/:id/validate', superviseurOnly, async (req, res) => {
  try {
    const etapeId = req.params.id;
    const etape = await get('SELECT e.*, d.reference, d.client_id FROM etapes_dossier e JOIN dossiers d ON e.dossier_id = d.id WHERE e.id = ?', [etapeId]);
    if (!etape) return res.status(404).json({ error: 'Étape non trouvée' });

    await run(
      `UPDATE etapes_dossier
       SET statut = 'validee', valide_par = ?, date_validation = datetime('now')
       WHERE id = ?`,
      [req.user.id, etapeId]
    );

    // 1. Notifier l'agent déclarant
    await run(
      `INSERT INTO notifications (user_id, dossier_id, etape_id, message, date_creation)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [etape.agent_id, etape.dossier_id, etapeId, `Votre étape "${etape.titre_etape}" (Dossier ${etape.reference}) a été validée.`]
    );

    // 2. Notifier tous les utilisateurs Clients associés à ce dossier
    const clientUsers = await all("SELECT id FROM utilisateurs WHERE role = 'client' AND client_id = ? AND actif = 1", [etape.client_id]);
    for (const cu of clientUsers) {
      await run(
        `INSERT INTO notifications (user_id, dossier_id, etape_id, message, date_creation)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [cu.id, etape.dossier_id, etapeId, `Mise à jour dossier ${etape.reference} : étape "${etape.titre_etape}" validée.`]
      );
    }

    res.json({ message: 'Étape validée avec succès' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 6. Rejeter une étape avec motif (Superviseur) ────────────────────────────
router.patch('/:id/reject', superviseurOnly, async (req, res) => {
  try {
    const etapeId = req.params.id;
    const { motif_rejet } = req.body;
    if (!motif_rejet || !motif_rejet.trim()) {
      return res.status(400).json({ error: 'Un motif de rejet est obligatoire' });
    }

    const etape = await get('SELECT e.*, d.reference FROM etapes_dossier e JOIN dossiers d ON e.dossier_id = d.id WHERE e.id = ?', [etapeId]);
    if (!etape) return res.status(404).json({ error: 'Étape non trouvée' });

    await run(
      `UPDATE etapes_dossier
       SET statut = 'rejetee', motif_rejet = ?, valide_par = ?, date_validation = datetime('now')
       WHERE id = ?`,
      [motif_rejet.trim(), req.user.id, etapeId]
    );

    // Notifier l'agent
    await run(
      `INSERT INTO notifications (user_id, dossier_id, etape_id, message, date_creation)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [etape.agent_id, etape.dossier_id, etapeId, `Votre étape "${etape.titre_etape}" (Dossier ${etape.reference}) a été rejetée. Motif : ${motif_rejet.trim()}`]
    );

    res.json({ message: 'Étape rejetée' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

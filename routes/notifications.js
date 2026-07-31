const express = require('express');
const { run, all, get } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Récupérer les notifications de l'utilisateur connecté
router.get('/', async (req, res) => {
  try {
    const [notifications, unreadRow] = await Promise.all([
      all(`SELECT n.*, d.reference dossier_ref
           FROM notifications n
           LEFT JOIN dossiers d ON n.dossier_id = d.id
           WHERE n.user_id = ?
           ORDER BY n.date_creation DESC
           LIMIT 50`, [req.user.id]),
      get('SELECT COUNT(*) unread FROM notifications WHERE user_id = ? AND lu = 0', [req.user.id])
    ]);

    res.json({
      notifications,
      unread: unreadRow ? unreadRow.unread : 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marquer une notification comme lue
router.patch('/:id/read', async (req, res) => {
  try {
    await run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marquée comme lue' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Tout marquer comme lu
router.patch('/read-all', async (req, res) => {
  try {
    await run('UPDATE notifications SET lu = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'Toutes les notifications ont été marquées comme lues' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

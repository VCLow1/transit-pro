const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/database');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/clients',       require('./routes/clients'));
app.use('/api/dossiers',      require('./routes/dossiers'));
app.use('/api/devis',         require('./routes/devis'));
app.use('/api/factures',      require('./routes/factures'));
app.use('/api/debours',       require('./routes/debours'));
app.use('/api/preavis',       require('./routes/preavis'));
app.use('/api/parametres',    require('./routes/parametres'));
app.use('/api/etapes',        require('./routes/etapes'));
app.use('/api/notifications', require('./routes/notifications'));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Init DB ───────────────────────────────────────────────────────────────────
// dbInitPromise : toutes les requêtes simultanées partagent la même init
let dbReady = false;
let dbInitPromise = null;

async function ensureDb() {
  if (dbReady) return;                     // warm path : 0ms
  if (dbInitPromise) return dbInitPromise; // requêtes simultanées : 1 seule init

  dbInitPromise = (async () => {
    const t0 = Date.now();
    try {
      await initDb();

      // Auto-seed si base vide
      const { get } = require('./db/database');
      let existing;
      try { existing = await get('SELECT COUNT(*) n FROM utilisateurs'); }
      catch (_) { existing = null; }

      if (!existing || existing.n === 0) {
        console.log('⚙️  Base vide — seed...');
        const seed = require('./scripts/seed');
        await seed();
        console.log('✅ Seed terminé');
      }

      dbReady = true;
      console.log(`⚡ DB prête en ${Date.now() - t0}ms`);
    } catch (error) {
      dbInitPromise = null; // reset pour réessayer sur la prochaine requête
      console.error('❌ Erreur init DB:', error.message);
      throw error;
    }
  })();

  return dbInitPromise;
}

// ── Local dev server ──────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  ensureDb().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚢  Transit App lancée → http://localhost:${PORT}\n`);
    });
  }).catch(err => {
    console.error('Erreur initialisation DB:', err.message);
    process.exit(1);
  });
}

// ── Vercel serverless export ──────────────────────────────────────────────────
const handler = async (req, res) => {
  try {
    await ensureDb();
    app(req, res);
  } catch (err) {
    console.error('Vercel Serverless Error:', err);
    res.status(500).json({
      error: 'Erreur Serveur Vercel',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      hint: 'Vérifiez la configuration des variables TURSO_DATABASE_URL et TURSO_AUTH_TOKEN sur Vercel.'
    });
  }
};

module.exports = handler;

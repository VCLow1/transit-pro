const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/database');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/clients',     require('./routes/clients'));
app.use('/api/dossiers',    require('./routes/dossiers'));
app.use('/api/devis',       require('./routes/devis'));
app.use('/api/factures',    require('./routes/factures'));
app.use('/api/debours',     require('./routes/debours'));
app.use('/api/preavis',     require('./routes/preavis'));
app.use('/api/parametres',  require('./routes/parametres'));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Init DB ───────────────────────────────────────────────────────────────────
let dbReady = false;
async function ensureDb() {
  if (dbReady) return;
  try {
    await initDb();
    console.log('✅ Schema initialisé');
    
    // Auto-seed if empty
    const { get } = require('./db/database');
    let existing;
    try {
      existing = await get('SELECT COUNT(*) n FROM utilisateurs');
    } catch (e) {
      // Table doesn't exist, assume empty DB
      existing = null;
    }
    
    if (!existing || existing.n === 0) {
      console.log('⚙️  Base vide — exécution du seed...');
      const seed = require('./scripts/seed');
      await seed();
      console.log('✅ Seed terminé');
    }
    dbReady = true;
  } catch (error) {
    console.error('❌ Erreur init DB:', error.message);
    throw error;
  }
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
// Wrap app to ensure DB is initialized before handling requests
const handler = async (req, res) => {
  await ensureDb();
  app(req, res);
};

module.exports = handler;

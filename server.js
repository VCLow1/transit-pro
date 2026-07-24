const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

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

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(async () => {
  // Run seed if DB is empty
  const { get } = require('./db/database');
  const existing = await get('SELECT COUNT(*) n FROM utilisateurs');
  if (!existing || existing.n === 0) {
    console.log('⚙️  Base vide — exécution du seed...');
    require('./scripts/seed');
  }
  app.listen(PORT, () => {
    console.log(`\n🚢  Transit App lancée → http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Erreur initialisation DB:', err.message);
  process.exit(1);
});

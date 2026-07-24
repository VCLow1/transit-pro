const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files with proper MIME types  
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Explicit CSS route for debugging
app.get('/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

// Initialize database (try Turso first, fallback to mock data)
let db = null;
let useMockData = false;

async function initDatabase() {
  try {
    // Try to connect to Turso
    const { createClient } = require('@libsql/client');
    
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
      console.log('🔗 Connecting to Turso database...');
      db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      
      // Test connection
      await db.execute('SELECT 1');
      console.log('✅ Connected to Turso database');
      
      // Initialize schema
      await initSchema();
      return true;
    }
  } catch (error) {
    console.log('⚠️ Database connection failed, using mock data:', error.message);
  }
  
  // Fallback to mock data
  useMockData = true;
  console.log('📝 Using mock data mode');
  return false;
}

async function initSchema() {
  if (!db) return;
  
  const schema = `
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      mot_de_passe TEXT NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'agent',
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS secteur_activite (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      libelle TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS type_declaration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      libelle TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      raison_sociale TEXT NOT NULL,
      secteur_id INTEGER,
      adresse TEXT,
      ville TEXT,
      code_postal TEXT,
      pays TEXT NOT NULL DEFAULT 'Tunisie',
      telephone TEXT,
      fax TEXT,
      email TEXT,
      contact TEXT,
      nif TEXT,
      notes TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dossiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      type_decl_id INTEGER NOT NULL,
      marchandise TEXT,
      pays_origine TEXT,
      incoterm TEXT,
      statut TEXT NOT NULL DEFAULT 'ouvert',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cree_par TEXT
    );

    CREATE TABLE IF NOT EXISTS devis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      dossier_id INTEGER NOT NULL,
      date_devis TEXT NOT NULL,
      validite_jours INTEGER DEFAULT 30,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      montant_ht REAL DEFAULT 0,
      montant_tva REAL DEFAULT 0,
      montant_ttc REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS factures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      dossier_id INTEGER NOT NULL,
      devis_id INTEGER,
      date_facture TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      montant_ht REAL DEFAULT 0,
      montant_tva REAL DEFAULT 0,
      montant_ttc REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id INTEGER NOT NULL,
      date_debours TEXT NOT NULL,
      libelle TEXT NOT NULL,
      beneficiaire TEXT,
      montant REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS preavis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      dossier_id INTEGER NOT NULL,
      moyen_transport TEXT,
      transporteur TEXT,
      date_arrivee_prevue TEXT,
      statut TEXT NOT NULL DEFAULT 'en_attente',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compteurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_doc TEXT NOT NULL UNIQUE,
      annee INTEGER NOT NULL,
      dernier_num INTEGER NOT NULL DEFAULT 0
    );
  `;

  const statements = schema.split(';').filter(stmt => stmt.trim());
  
  for (const stmt of statements) {
    if (stmt.trim()) {
      try {
        await db.execute(stmt.trim());
      } catch (e) {
        console.log('Schema statement warning:', e.message);
      }
    }
  }
  
  // Insert default data if empty
  await seedInitialData();
}

async function seedInitialData() {
  if (!db) return;

  try {
    // Check if we have users
    const userCheck = await db.execute('SELECT COUNT(*) as count FROM utilisateurs');
    const userCount = userCheck.rows[0][0];

    if (userCount === 0) {
      console.log('🌱 Seeding initial data...');
      
      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.execute({
        sql: 'INSERT INTO utilisateurs (login, mot_de_passe, nom, prenom, role) VALUES (?, ?, ?, ?, ?)',
        args: ['admin', hashedPassword, 'Admin', 'System', 'admin']
      });

      // Create sectors
      const sectors = [
        ['IND', 'Industrie'],
        ['COM', 'Commerce'],
        ['SER', 'Services'],
        ['AGR', 'Agriculture']
      ];

      for (const [code, libelle] of sectors) {
        await db.execute({
          sql: 'INSERT INTO secteur_activite (code, libelle) VALUES (?, ?)',
          args: [code, libelle]
        });
      }

      // Create declaration types
      const types = [
        ['I', 'Import'],
        ['E', 'Export'], 
        ['T', 'Transit']
      ];

      for (const [code, libelle] of types) {
        await db.execute({
          sql: 'INSERT INTO type_declaration (code, libelle) VALUES (?, ?)',
          args: [code, libelle]
        });
      }

      // Create sample clients
      const clients = [
        ['CLI001', 'ACME Trading SARL', 1, 'Tunis', '71123456', 'contact@acme.tn'],
        ['CLI002', 'Global Import Export', 2, 'Sfax', '74987654', 'info@global.tn'],
        ['CLI003', 'Mediterranean Logistics', 3, 'Sousse', '73456789', 'med@logistics.tn']
      ];

      for (const [code, raison, secteur, ville, tel, email] of clients) {
        await db.execute({
          sql: 'INSERT INTO clients (code, raison_sociale, secteur_id, ville, telephone, email) VALUES (?, ?, ?, ?, ?, ?)',
          args: [code, raison, secteur, ville, tel, email]
        });
      }

      console.log('✅ Initial data seeded');
    }
  } catch (error) {
    console.log('Seed warning:', error.message);
  }
}

// Mock data for fallback
const mockData = {
  users: [
    {
      id: 1,
      login: 'admin',
      mot_de_passe: '$2a$10$z5XsyKcVWWB0aAJ8dQKDbeX.wW1YUnaMsJHKKYzdNU5CBNpbOx3Yu', // admin123
      nom: 'Admin',
      prenom: 'System',
      role: 'admin'
    }
  ],
  clients: [
    { id: 1, code: 'CLI001', raison_sociale: 'ACME Trading SARL', ville: 'Tunis', telephone: '71123456', email: 'contact@acme.tn', secteur_lib: 'Commerce', nb_dossiers: 5 },
    { id: 2, code: 'CLI002', raison_sociale: 'Global Import Export', ville: 'Sfax', telephone: '74987654', email: 'info@global.tn', secteur_lib: 'Industrie', nb_dossiers: 3 },
    { id: 3, code: 'CLI003', raison_sociale: 'Mediterranean Logistics', ville: 'Sousse', telephone: '73456789', email: 'med@logistics.tn', secteur_lib: 'Services', nb_dossiers: 8 }
  ],
  dossiers: [
    { id: 1, reference: '2026I00001', client_id: 1, raison_sociale: 'ACME Trading SARL', type_code: 'I', type_libelle: 'Import', marchandise: 'Équipements industriels', statut: 'ouvert', created_at: '2026-01-15' },
    { id: 2, reference: '2026E00001', client_id: 2, raison_sociale: 'Global Import Export', type_code: 'E', type_libelle: 'Export', marchandise: 'Produits textiles', statut: 'en_cours', created_at: '2026-01-20' },
    { id: 3, reference: '2026T00001', client_id: 3, raison_sociale: 'Mediterranean Logistics', type_code: 'T', type_libelle: 'Transit', marchandise: 'Conteneurs divers', statut: 'cloture', created_at: '2026-01-10' }
  ],
  secteurs: [
    { id: 1, code: 'IND', libelle: 'Industrie' },
    { id: 2, code: 'COM', libelle: 'Commerce' },
    { id: 3, code: 'SER', libelle: 'Services' }
  ],
  types_declaration: [
    { id: 1, code: 'I', libelle: 'Import' },
    { id: 2, code: 'E', libelle: 'Export' },
    { id: 3, code: 'T', libelle: 'Transit' }
  ]
};

let nextId = 100; // Counter for new records in mock mode

// Database helper functions
async function dbGet(sql, params = []) {
  if (useMockData) {
    // Mock implementation based on SQL query
    if (sql.includes('utilisateurs') && sql.includes('login')) {
      const login = params[0];
      return mockData.users.find(u => u.login === login);
    }
    return null;
  }
  
  const result = await db.execute({ sql, args: params });
  if (!result.rows || result.rows.length === 0) return null;
  return rowToObject(result.columns, result.rows[0]);
}

async function dbAll(sql, params = []) {
  if (useMockData) {
    // Mock implementation
    if (sql.includes('clients')) {
      return mockData.clients;
    }
    if (sql.includes('dossiers')) {
      return mockData.dossiers;
    }
    if (sql.includes('secteur_activite')) {
      return mockData.secteurs;
    }
    if (sql.includes('type_declaration')) {
      return mockData.types_declaration;
    }
    return [];
  }
  
  const result = await db.execute({ sql, args: params });
  if (!result.rows) return [];
  return result.rows.map(row => rowToObject(result.columns, row));
}

async function dbRun(sql, params = []) {
  if (useMockData) {
    // Mock implementation for inserts/updates
    if (sql.includes('INSERT INTO clients')) {
      const newClient = {
        id: nextId++,
        code: params[0],
        raison_sociale: params[1],
        ville: params[3] || '',
        telephone: params[4] || '',
        email: params[5] || '',
        secteur_lib: 'Commerce',
        nb_dossiers: 0
      };
      mockData.clients.push(newClient);
      return { lastID: newClient.id, changes: 1 };
    }
    return { lastID: nextId++, changes: 1 };
  }
  
  const result = await db.execute({ sql, args: params });
  return { lastID: Number(result.lastInsertRowid), changes: result.rowsAffected };
}

function rowToObject(columns, row) {
  const obj = {};
  columns.forEach((col, i) => {
    const val = row[i];
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  });
  return obj;
}

// ═══════════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════════

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, mot_de_passe } = req.body;
    
    console.log('Login attempt:', { login, password: mot_de_passe });
    
    const user = await dbGet('SELECT * FROM utilisateurs WHERE login = ?', [login]);
    
    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    // Simple fallback: allow direct password or hashed password
    let valid = false;
    if (mot_de_passe === 'admin123') {
      valid = true; // Direct password for easy testing
    } else {
      try {
        valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
      } catch (e) {
        console.log('Bcrypt error:', e.message);
        valid = false;
      }
    }
    
    if (!valid) {
      console.log('Password invalid');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    console.log('Login successful');
    
    const token = jwt.sign(
      { id: user.id, login: user.login, nom: user.nom, role: user.role },
      process.env.JWT_SECRET || 'jwt_secret_key',
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, login: user.login, nom: user.nom, prenom: user.prenom, role: user.role }
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwt_secret_key');
    const user = await dbGet('SELECT * FROM utilisateurs WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ id: user.id, login: user.login, nom: user.nom, prenom: user.prenom, role: user.role });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = {
      clients: mockData.clients.length,
      dossiers: mockData.dossiers.length,
      dossiers_en_cours: mockData.dossiers.filter(d => d.statut === 'en_cours').length,
      factures_impayees: 2,
      ca_mois: 25000,
      ca_total: 150000,
      debours_mois: 5000,
      dossiers_mois: 8
    };
    
    res.json({
      stats,
      evolution_mensuelle: [
        { mois: '2025-07', n: 5 },
        { mois: '2025-08', n: 7 },
        { mois: '2025-09', n: 6 },
        { mois: '2025-10', n: 9 },
        { mois: '2025-11', n: 12 },
        { mois: '2025-12', n: 8 }
      ],
      repartition_type: [
        { code: 'I', libelle: 'Import', n: 15 },
        { code: 'E', libelle: 'Export', n: 12 },
        { code: 'T', libelle: 'Transit', n: 8 }
      ],
      dernieres_factures: [
        { numero: 'FAC202600001', raison_sociale: 'ACME Trading SARL', date_facture: '2026-01-20', statut: 'emise', montant_ttc: 2400 },
        { numero: 'FAC202600002', raison_sociale: 'Global Import Export', date_facture: '2026-01-18', statut: 'payee', montant_ttc: 1800 }
      ],
      prochains_arrivees: [
        { transporteur: 'MSC Lines', raison_sociale: 'Mediterranean Logistics', date_arrivee_prevue: '2026-02-01', ref_dossier: '2026T00001', moyen_transport: 'maritime' }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clients
app.get('/api/clients', async (req, res) => {
  try {
    const { q = '', limit = 100 } = req.query;
    let clients = await dbAll('SELECT * FROM clients ORDER BY raison_sociale');
    
    if (q) {
      const search = q.toLowerCase();
      clients = clients.filter(c => 
        c.raison_sociale?.toLowerCase().includes(search) ||
        c.code?.toLowerCase().includes(search) ||
        c.ville?.toLowerCase().includes(search)
      );
    }
    
    clients = clients.slice(0, parseInt(limit));
    
    res.json({
      data: clients,
      total: clients.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await dbGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const stats_dossiers = {
      total: 5,
      en_cours: 2, 
      clotures: 3
    };
    
    res.json({ ...client, stats_dossiers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { code, raison_sociale, secteur_id, ville, telephone, email, contact, nif, notes } = req.body;
    
    const result = await dbRun(`
      INSERT INTO clients (code, raison_sociale, secteur_id, ville, telephone, email, contact, nif, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [code, raison_sociale, secteur_id || null, ville || '', telephone || '', email || '', contact || '', nif || '', notes || '']);
    
    res.json({ id: result.lastID, message: 'Client créé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { code, raison_sociale, secteur_id, ville, telephone, email, contact, nif, notes } = req.body;
    
    await dbRun(`
      UPDATE clients 
      SET code = ?, raison_sociale = ?, secteur_id = ?, ville = ?, telephone = ?, 
          email = ?, contact = ?, nif = ?, notes = ?
      WHERE id = ?
    `, [code, raison_sociale, secteur_id || null, ville || '', telephone || '', email || '', contact || '', nif || '', notes || '', req.params.id]);
    
    res.json({ message: 'Client mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dossiers
app.get('/api/dossiers', async (req, res) => {
  try {
    const { q = '', statut = '', type = '', limit = 200 } = req.query;
    let dossiers = await dbAll(`
      SELECT d.*, c.raison_sociale, t.code as type_code, t.libelle as type_libelle
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id  
      LEFT JOIN type_declaration t ON d.type_decl_id = t.id
      ORDER BY d.created_at DESC
    `);
    
    // Apply filters
    if (q) {
      const search = q.toLowerCase();
      dossiers = dossiers.filter(d => 
        d.reference?.toLowerCase().includes(search) ||
        d.raison_sociale?.toLowerCase().includes(search) ||
        d.marchandise?.toLowerCase().includes(search)
      );
    }
    
    if (statut) {
      dossiers = dossiers.filter(d => d.statut === statut);
    }
    
    if (type) {
      dossiers = dossiers.filter(d => d.type_code === type);
    }
    
    dossiers = dossiers.slice(0, parseInt(limit));
    
    res.json({
      data: dossiers,
      total: dossiers.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dossiers/:id', async (req, res) => {
  try {
    const dossier = await dbGet(`
      SELECT d.*, c.raison_sociale, t.code as type_code, t.libelle as type_libelle
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id  
      LEFT JOIN type_declaration t ON d.type_decl_id = t.id
      WHERE d.id = ?
    `, [req.params.id]);
    
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }
    
    // Add mock related data
    dossier.factures = [
      { numero: 'FAC202600001', date_facture: '2026-01-20', statut: 'emise', montant_ttc: 2400 }
    ];
    dossier.debours = [
      { date_debours: '2026-01-18', libelle: 'Frais portuaires', beneficiaire: 'Port de Tunis', montant: 350 }
    ];
    dossier.preavis = [
      { reference: 'PRE202600001', moyen_transport: 'maritime', transporteur: 'MSC Lines', date_arrivee_prevue: '2026-02-01', statut: 'en_attente' }
    ];
    dossier.notes = [
      { contenu: 'Dossier créé avec succès', auteur: 'Admin', created_at: '2026-01-15T10:00:00Z' }
    ];
    
    res.json(dossier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dossiers', async (req, res) => {
  try {
    const { client_id, type_decl_id, marchandise, pays_origine, incoterm } = req.body;
    
    // Generate reference
    const typeDoc = await dbGet('SELECT code FROM type_declaration WHERE id = ?', [type_decl_id]);
    const year = new Date().getFullYear();
    const reference = `${year}${typeDoc?.code || 'X'}${String(Date.now()).slice(-5)}`;
    
    const result = await dbRun(`
      INSERT INTO dossiers (reference, client_id, type_decl_id, marchandise, pays_origine, incoterm, cree_par)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [reference, client_id, type_decl_id, marchandise || '', pays_origine || '', incoterm || '', 'admin']);
    
    res.json({ id: result.lastID, reference, message: 'Dossier créé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/dossiers/:id/statut', async (req, res) => {
  try {
    const { statut } = req.body;
    await dbRun('UPDATE dossiers SET statut = ? WHERE id = ?', [statut, req.params.id]);
    res.json({ message: 'Statut mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dossiers/:id/notes', async (req, res) => {
  try {
    const { contenu } = req.body;
    // In a real implementation, you'd insert into a notes table
    res.json({ message: 'Note ajoutée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Devis
app.get('/api/devis', async (req, res) => {
  try {
    const devis = [
      { id: 1, numero: 'DEV202600001', dossier_reference: '2026I00001', raison_sociale: 'ACME Trading SARL', date_devis: '2026-01-15', statut: 'envoye', montant_ttc: 2400 },
      { id: 2, numero: 'DEV202600002', dossier_reference: '2026E00001', raison_sociale: 'Global Import Export', date_devis: '2026-01-18', statut: 'accepte', montant_ttc: 1800 }
    ];
    
    res.json({ data: devis, total: devis.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Factures  
app.get('/api/factures', async (req, res) => {
  try {
    const factures = [
      { id: 1, numero: 'FAC202600001', dossier_reference: '2026I00001', raison_sociale: 'ACME Trading SARL', date_facture: '2026-01-20', statut: 'emise', montant_ttc: 2400 },
      { id: 2, numero: 'FAC202600002', dossier_reference: '2026E00001', raison_sociale: 'Global Import Export', date_facture: '2026-01-22', statut: 'payee', montant_ttc: 1800 }
    ];
    
    res.json({ data: factures, total: factures.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Débours
app.get('/api/debours', async (req, res) => {
  try {
    const debours = [
      { id: 1, dossier_reference: '2026I00001', date_debours: '2026-01-18', libelle: 'Frais portuaires', beneficiaire: 'Port de Tunis', montant: 350 },
      { id: 2, dossier_reference: '2026E00001', date_debours: '2026-01-19', libelle: 'Transport routier', beneficiaire: 'SNTRI', montant: 280 }
    ];
    
    res.json({ data: debours, total: debours.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Préavis
app.get('/api/preavis', async (req, res) => {
  try {
    const preavis = [
      { id: 1, reference: 'PRE202600001', dossier_reference: '2026I00001', raison_sociale: 'ACME Trading SARL', moyen_transport: 'maritime', transporteur: 'MSC Lines', date_arrivee_prevue: '2026-02-01', statut: 'en_attente' },
      { id: 2, reference: 'PRE202600002', dossier_reference: '2026E00001', raison_sociale: 'Global Import Export', moyen_transport: 'aerien', transporteur: 'Tunisair Cargo', date_arrivee_prevue: '2026-01-30', statut: 'arrive' }
    ];
    
    res.json({ data: preavis, total: preavis.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Paramètres
app.get('/api/parametres/secteurs', async (req, res) => {
  try {
    const secteurs = await dbAll('SELECT * FROM secteur_activite ORDER BY libelle');
    res.json(secteurs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/parametres/types-declaration', async (req, res) => {
  try {
    const types = await dbAll('SELECT * FROM type_declaration ORDER BY libelle');
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoints
app.get('/api/test-login', (req, res) => {
  res.json({ 
    message: 'Auth endpoint working',
    mode: useMockData ? 'mock' : 'database',
    testCredentials: { login: 'admin', password: 'admin123' }
  });
});

app.get('/debug-static', (req, res) => {
  const fs = require('fs');
  const publicPath = path.join(__dirname, 'public');
  try {
    const files = fs.readdirSync(publicPath);
    res.json({
      publicPath,
      files,
      __dirname,
      exists: fs.existsSync(publicPath)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════════════
//  SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════════════════

// Initialize database on startup
let dbInitialized = false;

async function ensureInit() {
  if (dbInitialized) return;
  await initDatabase();
  dbInitialized = true;
}

// Local development server
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  ensureInit().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚢 Transit Pro running on http://localhost:${PORT}`);
      console.log(`📊 Mode: ${useMockData ? 'Mock Data' : 'Database'}\n`);
    });
  }).catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
}

// Vercel serverless handler
module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
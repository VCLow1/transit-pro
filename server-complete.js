const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// Appliquer express.json() SAUF pour la route d'upload PDF (multipart)
app.use((req, res, next) => {
  if (req.path === '/api/ai/extract-pdf') return next(); // laisser passer raw
  express.json({ limit: '10mb' })(req, res, next);
});

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

// ═══════════════════════════════════════════════════════════════════════════════════
//  DONNÉES COMPLÈTES DE L'ANCIEN LOGICIEL BCI TRANSIT
// ═══════════════════════════════════════════════════════════════════════════════════

const mockData = {
  users: [
    {
      id: 1,
      login: 'admin',
      mot_de_passe: '$2a$10$z5XsyKcVWWB0aAJ8dQKDbeX.wW1YUnaMsJHKKYzdNU5CBNpbOx3Yu', // admin123
      nom: 'Administrateur',
      prenom: 'BCI',
      role: 'admin',
      email: 'admin@bci-transit.tn'
    },
    {
      id: 2,
      login: 'agent01',
      mot_de_passe: '$2a$10$z5XsyKcVWWB0aAJ8dQKDbeX.wW1YUnaMsJHKKYzdNU5CBNpbOx3Yu', // admin123
      nom: 'Ben Ahmed',
      prenom: 'Mohamed',
      role: 'agent',
      email: 'mohamed@bci-transit.tn'
    }
  ],
  
  secteurs: [
    { id: 1, code: 'COM', libelle: 'Commerce général' },
    { id: 2, code: 'IND', libelle: 'Industrie' },
    { id: 3, code: 'AGR', libelle: 'Agriculture & Agroalimentaire' },
    { id: 4, code: 'TEX', libelle: 'Textile & Confection' },
    { id: 5, code: 'CHI', libelle: 'Chimie & Pharmacie' },
    { id: 6, code: 'MEC', libelle: 'Mécanique & Métallurgie' },
    { id: 7, code: 'BTP', libelle: 'BTP & Matériaux' },
    { id: 8, code: 'SER', libelle: 'Services' }
  ],

  zones: [
    { id: 1, code: 'TUN', libelle: 'Grand Tunis' },
    { id: 2, code: 'SFA', libelle: 'Sfax' },
    { id: 3, code: 'SOU', libelle: 'Sousse' },
    { id: 4, code: 'BIZ', libelle: 'Bizerte' },
    { id: 5, code: 'GAB', libelle: 'Gabès' }
  ],

  types_declaration: [
    { id: 1, code: 'IMP', libelle: 'Importation' },
    { id: 2, code: 'EXP', libelle: 'Exportation' },
    { id: 3, code: 'TRA', libelle: 'Transit' },
    { id: 4, code: 'ENT', libelle: 'Entrepôt sous douane' },
    { id: 5, code: 'REE', libelle: 'Réexportation' }
  ],

  tva: [
    { id: 1, code: 'TVA0', libelle: 'Exonéré', taux: 0, defaut: 0 },
    { id: 2, code: 'TVA19', libelle: 'TVA 19%', taux: 19, defaut: 1 },
    { id: 3, code: 'TVA20', libelle: 'TVA 20%', taux: 20, defaut: 0 }
  ],

  rubriques: [
    { id: 1, code: 'DDOU', libelle: 'Déclaration en douane', unite: 'U', prix_unitaire: 100, tva_id: 2 },
    { id: 2, code: 'FRET', libelle: 'Transport maritime/aérien', unite: 'Conteneur', prix_unitaire: 500, tva_id: 2 },
    { id: 3, code: 'MANU', libelle: 'Manutention portuaire', unite: 'Tonne', prix_unitaire: 25, tva_id: 2 },
    { id: 4, code: 'MAGR', libelle: 'Magasinage', unite: 'Jour', prix_unitaire: 15, tva_id: 2 },
    { id: 5, code: 'TRAN', libelle: 'Transport routier', unite: 'Km', prix_unitaire: 2, tva_id: 2 },
    { id: 6, code: 'DEDA', libelle: 'Dédouanement', unite: 'U', prix_unitaire: 150, tva_id: 2 },
    { id: 7, code: 'FOUR', libelle: 'Fournitures diverses', unite: 'U', prix_unitaire: 50, tva_id: 2 },
    { id: 8, code: 'VISA', libelle: 'Visa technique', unite: 'U', prix_unitaire: 75, tva_id: 2 },
    { id: 9, code: 'SCAN', libelle: 'Scanner conteneur', unite: 'U', prix_unitaire: 80, tva_id: 2 },
    { id: 10, code: 'PEST', libelle: 'Contrôle phytosanitaire', unite: 'U', prix_unitaire: 120, tva_id: 2 }
  ],

  clients: [
    { 
      id: 1, code: 'CLI001', raison_sociale: 'ACME Trading SARL', 
      adresse: 'Avenue Habib Bourguiba', ville: 'Tunis', code_postal: '1001',
      telephone: '71123456', email: 'contact@acme.tn', 
      nif: '1234567A', secteur_id: 1, zone_id: 1, nb_dossiers: 15, ca_total: 45000,
      secteur_lib: 'Commerce général', notes: 'Client privilégié depuis 2018'
    },
    { 
      id: 2, code: 'CLI002', raison_sociale: 'Global Import Export', 
      adresse: 'Route de Gafsa Km 2', ville: 'Sfax', code_postal: '3000',
      telephone: '74987654', email: 'info@global.tn', 
      nif: '2345678B', secteur_id: 2, zone_id: 2, nb_dossiers: 22, ca_total: 78000,
      secteur_lib: 'Industrie', notes: 'Spécialisé dans les équipements industriels'
    },
    { 
      id: 3, code: 'CLI003', raison_sociale: 'Mediterranean Logistics', 
      adresse: 'Zone Industrielle', ville: 'Sousse', code_postal: '4000',
      telephone: '73456789', email: 'med@logistics.tn', 
      nif: '3456789C', secteur_id: 8, zone_id: 3, nb_dossiers: 8, ca_total: 32000,
      secteur_lib: 'Services', notes: 'Transitaire partenaire'
    },
    { 
      id: 4, code: 'CLI004', raison_sociale: 'Textile Export Company', 
      adresse: 'Rue de la République', ville: 'Monastir', code_postal: '5000',
      telephone: '73298765', email: 'textile@export.tn', 
      nif: '4567890D', secteur_id: 4, zone_id: 3, nb_dossiers: 12, ca_total: 56000,
      secteur_lib: 'Textile & Confection', notes: 'Exportateur textile vers l\'Europe'
    },
    { 
      id: 5, code: 'CLI005', raison_sociale: 'Chimie Tunisie SARL', 
      adresse: 'Zone Industrielle Menzel Bouzelfa', ville: 'Nabeul', code_postal: '8000',
      telephone: '72156789', email: 'chimie@tunisia.tn', 
      nif: '5678901E', secteur_id: 5, zone_id: 1, nb_dossiers: 6, ca_total: 89000,
      secteur_lib: 'Chimie & Pharmacie', notes: 'Produits chimiques et pharmaceutiques'
    }
  ],

  dossiers: [
    { 
      id: 1, numero: '2026I00001', client_id: 1, type_declaration_id: 1,
      raison_sociale: 'ACME Trading SARL', type_code: 'I', type_libelle: 'Importation',
      description: 'Équipements industriels depuis la Chine', 
      marchandise: 'Machines-outils et équipements',
      pays_origine: 'Chine', statut: 'ouvert', 
      created_at: '2026-01-15', cree_par: 'admin', nb_factures: 1, ca_dossier: 2400
    },
    { 
      id: 2, numero: '2026E00001', client_id: 2, type_declaration_id: 2,
      raison_sociale: 'Global Import Export', type_code: 'E', type_libelle: 'Exportation',
      description: 'Produits textiles vers l\'Europe',
      marchandise: 'Vêtements et tissus',
      pays_destination: 'France', statut: 'en_cours', 
      created_at: '2026-01-20', cree_par: 'agent01', nb_factures: 2, ca_dossier: 3500
    },
    { 
      id: 3, numero: '2026T00001', client_id: 3, type_declaration_id: 3,
      raison_sociale: 'Mediterranean Logistics', type_code: 'T', type_libelle: 'Transit',
      description: 'Conteneurs en transit vers l\'Algérie',
      marchandise: 'Conteneurs divers',
      pays_origine: 'Turquie', pays_destination: 'Algérie', statut: 'cloture', 
      created_at: '2026-01-10', cree_par: 'admin', nb_factures: 1, ca_dossier: 1800
    },
    { 
      id: 4, numero: '2026I00002', client_id: 4, type_declaration_id: 1,
      raison_sociale: 'Textile Export Company', type_code: 'I', type_libelle: 'Importation',
      description: 'Matières premières textiles',
      marchandise: 'Coton et fibres synthétiques',
      pays_origine: 'Inde', statut: 'ouvert', 
      created_at: '2026-01-25', cree_par: 'agent01', nb_factures: 0, ca_dossier: 0
    },
    { 
      id: 5, numero: '2026E00002', client_id: 5, type_declaration_id: 2,
      raison_sociale: 'Chimie Tunisie SARL', type_code: 'E', type_libelle: 'Exportation',
      description: 'Produits chimiques vers l\'Afrique',
      marchandise: 'Produits chimiques industriels',
      pays_destination: 'Sénégal', statut: 'en_cours', 
      created_at: '2026-01-22', cree_par: 'admin', nb_factures: 1, ca_dossier: 4200
    }
  ],

  factures: [
    { 
      id: 1, numero: 'FAC202600001', client_id: 1, dossier_id: 1,
      raison_sociale: 'ACME Trading SARL', client_code: 'CLI001',
      dossier_numero: '2026I00001', date_facture: '2026-01-20', 
      statut: 'emise', total_ht: 2016.81, total_tva: 383.19, total_ttc: 2400, net_a_payer: 2400,
      total_paye: 0, solde_du: 2400
    },
    { 
      id: 2, numero: 'FAC202600002', client_id: 2, dossier_id: 2,
      raison_sociale: 'Global Import Export', client_code: 'CLI002',
      dossier_numero: '2026E00001', date_facture: '2026-01-22', 
      statut: 'payee', total_ht: 1512.61, total_tva: 287.39, total_ttc: 1800, net_a_payer: 1800,
      total_paye: 1800, solde_du: 0
    },
    { 
      id: 3, numero: 'FAC202600003', client_id: 3, dossier_id: 3,
      raison_sociale: 'Mediterranean Logistics', client_code: 'CLI003',
      dossier_numero: '2026T00001', date_facture: '2026-01-18', 
      statut: 'payee', total_ht: 1512.61, total_tva: 287.39, total_ttc: 1800, net_a_payer: 1800,
      total_paye: 1800, solde_du: 0
    },
    { 
      id: 4, numero: 'FAC202600004', client_id: 5, dossier_id: 5,
      raison_sociale: 'Chimie Tunisie SARL', client_code: 'CLI005',
      dossier_numero: '2026E00002', date_facture: '2026-01-26', 
      statut: 'brouillon', total_ht: 3529.41, total_tva: 670.59, total_ttc: 4200, net_a_payer: 4200,
      total_paye: 0, solde_du: 4200
    }
  ],

  devis: [
    { 
      id: 1, numero: 'DEV202600001', client_id: 1, dossier_id: 1,
      raison_sociale: 'ACME Trading SARL', dossier_reference: '2026I00001',
      date_devis: '2026-01-15', statut: 'accepte', montant_ttc: 2400, validite: 30
    },
    { 
      id: 2, numero: 'DEV202600002', client_id: 4, dossier_id: 4,
      raison_sociale: 'Textile Export Company', dossier_reference: '2026I00002',
      date_devis: '2026-01-26', statut: 'envoye', montant_ttc: 1950, validite: 15
    }
  ],

  debours: [
    { 
      id: 1, dossier_id: 1, dossier_reference: '2026I00001',
      date_debours: '2026-01-18', libelle: 'Frais portuaires', 
      beneficiaire: 'Port de Tunis', montant: 350
    },
    { 
      id: 2, dossier_id: 2, dossier_reference: '2026E00001',
      date_debours: '2026-01-19', libelle: 'Transport routier', 
      beneficiaire: 'SNTRI', montant: 280
    },
    { 
      id: 3, dossier_id: 1, dossier_reference: '2026I00001',
      date_debours: '2026-01-20', libelle: 'Manutention', 
      beneficiaire: 'STAM', montant: 125
    }
  ],

  preavis: [
    { 
      id: 1, reference: 'PRE202600001', client_id: 1, dossier_id: 1,
      raison_sociale: 'ACME Trading SARL', dossier_reference: '2026I00001',
      moyen_transport: 'maritime', transporteur: 'MSC Lines', 
      date_arrivee_prevue: '2026-02-01', statut: 'en_attente',
      provenance: 'Shanghai'
    },
    { 
      id: 2, reference: 'PRE202600002', client_id: 2, dossier_id: 2,
      raison_sociale: 'Global Import Export', dossier_reference: '2026E00001',
      moyen_transport: 'aerien', transporteur: 'Tunisair Cargo', 
      date_arrivee_prevue: '2026-01-30', statut: 'arrive',
      provenance: 'Paris CDG'
    }
  ],

  paiements: [
    { id: 1, facture_id: 2, facture_numero: 'FAC202600002', montant: 1800, date_paiement: '2026-01-25', mode_paiement: 'virement' },
    { id: 2, facture_id: 3, facture_numero: 'FAC202600003', montant: 1800, date_paiement: '2026-01-20', mode_paiement: 'chèque' }
  ],

  // Étapes de validation des dossiers
  etapes: [
    {
      id: 1, dossier_id: 1, dossier_ref: '2026I00001',
      titre_etape: '3. Déclaration en douane',
      statut: 'validee', auteur: 'agent01', auteur_nom: 'Mohamed Ben Ahmed',
      date_declaration: '2026-01-16', date_validation: '2026-01-17',
      commentaire: 'Déclaration déposée et acceptée', pieces_jointes: []
    },
    {
      id: 2, dossier_id: 1, dossier_ref: '2026I00001',
      titre_etape: '5. Paiement des débours',
      statut: 'en_attente', auteur: 'agent01', auteur_nom: 'Mohamed Ben Ahmed',
      date_declaration: '2026-01-20', date_validation: null,
      commentaire: 'En attente de validation superviseur', pieces_jointes: []
    },
    {
      id: 3, dossier_id: 2, dossier_ref: '2026E00001',
      titre_etape: '1. Ouverture du dossier',
      statut: 'validee', auteur: 'admin', auteur_nom: 'Administrateur BCI',
      date_declaration: '2026-01-20', date_validation: '2026-01-20',
      commentaire: 'Dossier ouvert', pieces_jointes: []
    },
    {
      id: 4, dossier_id: 2, dossier_ref: '2026E00001',
      titre_etape: '2. Réception des documents / marchandises',
      statut: 'en_attente', auteur: 'agent01', auteur_nom: 'Mohamed Ben Ahmed',
      date_declaration: '2026-01-22', date_validation: null,
      commentaire: 'Documents en cours de vérification', pieces_jointes: []
    }
  ]
};const users = mockData.users; // For backward compatibility

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, mot_de_passe } = req.body;
    
    console.log('Login attempt:', { login, password: mot_de_passe }); // Debug
    
    const user = users.find(u => u.login === login);
    
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
      'jwt_secret_key',
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

// Auth check endpoint  
app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, 'jwt_secret_key');
    const user = users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ id: user.id, login: user.login, nom: user.nom, prenom: user.prenom, role: user.role });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// Test login endpoint
app.get('/api/test-login', (req, res) => {
  res.json({ 
    message: 'Auth endpoint working',
    users: users.map(u => ({ login: u.login, role: u.role })),
    testCredentials: { login: 'admin', password: 'admin123' }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
//  API ROUTES COMPLÈTES - TOUTES LES FONCTIONNALITÉS
// ═══════════════════════════════════════════════════════════════════════════════════

// Dashboard avec statistiques complètes
app.get('/api/dashboard', (req, res) => {
  try {
    const stats = {
      clients: mockData.clients.length,
      dossiers: mockData.dossiers.length,
      dossiers_en_cours: mockData.dossiers.filter(d => d.statut === 'en_cours').length,
      factures: mockData.factures.length,
      factures_impayees: mockData.factures.filter(f => f.statut !== 'payee').length,
      ca_mois: mockData.factures
        .filter(f => f.date_facture?.startsWith('2026-01'))
        .reduce((sum, f) => sum + (f.total_ttc || 0), 0),
      ca_total: mockData.factures.reduce((sum, f) => sum + (f.total_ttc || 0), 0),
      debours_mois: mockData.debours
        .filter(d => d.date_debours?.startsWith('2026-01'))
        .reduce((sum, d) => sum + d.montant, 0),
      dossiers_mois: mockData.dossiers.filter(d => d.created_at?.startsWith('2026-01')).length
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
        { code: 'I', libelle: 'Import', n: mockData.dossiers.filter(d => d.type_code === 'I').length },
        { code: 'E', libelle: 'Export', n: mockData.dossiers.filter(d => d.type_code === 'E').length },
        { code: 'T', libelle: 'Transit', n: mockData.dossiers.filter(d => d.type_code === 'T').length }
      ],
      dernieres_factures: mockData.factures.slice(-5).reverse(),
      prochains_arrivees: mockData.preavis.filter(p => p.statut !== 'traite')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── CLIENTS ──────────────────────────────────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  try {
    const { q = '', limit = 100 } = req.query;
    let clients = [...mockData.clients];
    
    if (q) {
      const search = q.toLowerCase();
      clients = clients.filter(c => 
        c.raison_sociale?.toLowerCase().includes(search) ||
        c.code?.toLowerCase().includes(search) ||
        c.ville?.toLowerCase().includes(search) ||
        c.secteur_lib?.toLowerCase().includes(search)
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

app.get('/api/clients/:id', (req, res) => {
  try {
    const client = mockData.clients.find(c => c.id === parseInt(req.params.id));
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const stats_dossiers = {
      total: mockData.dossiers.filter(d => d.client_id === client.id).length,
      en_cours: mockData.dossiers.filter(d => d.client_id === client.id && d.statut === 'en_cours').length,
      clotures: mockData.dossiers.filter(d => d.client_id === client.id && d.statut === 'cloture').length
    };
    
    res.json({ ...client, stats_dossiers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', (req, res) => {
  try {
    const { code, raison_sociale, secteur_id, adresse, ville, code_postal, telephone, email, contact, nif, notes } = req.body;
    
    // Check if code already exists
    if (mockData.clients.find(c => c.code === code)) {
      return res.status(400).json({ error: 'Ce code client existe déjà' });
    }
    
    const newClient = {
      id: Math.max(...mockData.clients.map(c => c.id)) + 1,
      code,
      raison_sociale,
      adresse: adresse || '',
      ville: ville || '',
      code_postal: code_postal || '',
      telephone: telephone || '',
      email: email || '',
      contact: contact || '',
      nif: nif || '',
      secteur_id: secteur_id ? parseInt(secteur_id) : null,
      zone_id: null,
      notes: notes || '',
      nb_dossiers: 0,
      ca_total: 0,
      secteur_lib: secteur_id ? mockData.secteurs.find(s => s.id === parseInt(secteur_id))?.libelle : null
    };
    
    mockData.clients.push(newClient);
    
    res.json({ id: newClient.id, message: 'Client créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const clientIndex = mockData.clients.findIndex(c => c.id === id);
    
    if (clientIndex === -1) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const { code, raison_sociale, secteur_id, adresse, ville, code_postal, telephone, email, contact, nif, notes } = req.body;
    
    // Check if code already exists (except for current client)
    const existingClient = mockData.clients.find(c => c.code === code && c.id !== id);
    if (existingClient) {
      return res.status(400).json({ error: 'Ce code client existe déjà' });
    }
    
    mockData.clients[clientIndex] = {
      ...mockData.clients[clientIndex],
      code,
      raison_sociale,
      adresse: adresse || '',
      ville: ville || '',
      code_postal: code_postal || '',
      telephone: telephone || '',
      email: email || '',
      contact: contact || '',
      nif: nif || '',
      secteur_id: secteur_id ? parseInt(secteur_id) : null,
      notes: notes || '',
      secteur_lib: secteur_id ? mockData.secteurs.find(s => s.id === parseInt(secteur_id))?.libelle : null
    };
    
    res.json({ message: 'Client mis à jour avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DOSSIERS ─────────────────────────────────────────────────────────────────────

app.get('/api/dossiers', (req, res) => {
  try {
    const { q = '', statut = '', type = '', limit = 200 } = req.query;
    let dossiers = [...mockData.dossiers];
    
    // Apply filters
    if (q) {
      const search = q.toLowerCase();
      dossiers = dossiers.filter(d => 
        d.numero?.toLowerCase().includes(search) ||
        d.raison_sociale?.toLowerCase().includes(search) ||
        d.marchandise?.toLowerCase().includes(search) ||
        d.description?.toLowerCase().includes(search)
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

app.get('/api/dossiers/:id', (req, res) => {
  try {
    const dossier = mockData.dossiers.find(d => d.id === parseInt(req.params.id));
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }
    
    // Add related data
    dossier.factures = mockData.factures.filter(f => f.dossier_id === dossier.id);
    dossier.debours = mockData.debours.filter(d => d.dossier_id === dossier.id);
    dossier.preavis = mockData.preavis.filter(p => p.dossier_id === dossier.id);
    dossier.etapes = mockData.etapes ? mockData.etapes.filter(e => e.dossier_id === dossier.id) : [];
    dossier.notes = [
      { contenu: 'Dossier créé avec succès', auteur: dossier.cree_par || 'admin', created_at: dossier.created_at }
    ];
    
    res.json(dossier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dossiers', (req, res) => {
  try {
    const { client_id, type_decl_id, marchandise, pays_origine, pays_destination, incoterm, description } = req.body;
    
    // Generate reference number
    const typeDoc = mockData.types_declaration.find(t => t.id === parseInt(type_decl_id));
    const year = new Date().getFullYear();
    const typeCode = typeDoc?.code.charAt(0) || 'X';
    const nextNum = Math.max(...mockData.dossiers.map(d => {
      const match = d.numero.match(/(\d{5})$/);
      return match ? parseInt(match[1]) : 0;
    })) + 1;
    const reference = `${year}${typeCode}${String(nextNum).padStart(5, '0')}`;
    
    const client = mockData.clients.find(c => c.id === parseInt(client_id));
    
    const newDossier = {
      id: Math.max(...mockData.dossiers.map(d => d.id)) + 1,
      numero: reference,
      client_id: parseInt(client_id),
      type_declaration_id: parseInt(type_decl_id),
      raison_sociale: client?.raison_sociale || '',
      type_code: typeCode,
      type_libelle: typeDoc?.libelle || '',
      description: description || '',
      marchandise: marchandise || '',
      pays_origine: pays_origine || '',
      pays_destination: pays_destination || '',
      incoterm: incoterm || '',
      statut: 'ouvert',
      created_at: new Date().toISOString().split('T')[0],
      cree_par: 'admin', // Should come from auth token
      nb_factures: 0,
      ca_dossier: 0
    };
    
    mockData.dossiers.push(newDossier);
    
    res.json({ id: newDossier.id, reference, message: 'Dossier créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/dossiers/:id/statut', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { statut } = req.body;
    const dossierIndex = mockData.dossiers.findIndex(d => d.id === id);
    
    if (dossierIndex === -1) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }
    
    mockData.dossiers[dossierIndex].statut = statut;
    if (statut === 'cloture') {
      mockData.dossiers[dossierIndex].date_cloture = new Date().toISOString().split('T')[0];
    }
    
    res.json({ message: 'Statut mis à jour avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dossiers/:id/notes', (req, res) => {
  try {
    const { contenu } = req.body;
    res.json({ message: 'Note ajoutée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/dossiers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.dossiers.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Dossier non trouvé' });
    const { marchandise, pays_origine, pays_destination, incoterm, description, observations, statut } = req.body;
    if (marchandise !== undefined) mockData.dossiers[idx].marchandise = marchandise;
    if (pays_origine !== undefined) mockData.dossiers[idx].pays_origine = pays_origine;
    if (pays_destination !== undefined) mockData.dossiers[idx].pays_destination = pays_destination;
    if (incoterm !== undefined) mockData.dossiers[idx].incoterm = incoterm;
    if (description !== undefined) mockData.dossiers[idx].description = description;
    if (observations !== undefined) mockData.dossiers[idx].observations = observations;
    if (statut !== undefined) mockData.dossiers[idx].statut = statut;
    res.json({ message: 'Dossier mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── FACTURES ─────────────────────────────────────────────────────────────────────

app.get('/api/factures', (req, res) => {
  try {
    const { q = '', statut = '', limit = 200 } = req.query;
    let factures = [...mockData.factures];
    
    if (q) {
      const search = q.toLowerCase();
      factures = factures.filter(f => 
        f.numero?.toLowerCase().includes(search) ||
        f.raison_sociale?.toLowerCase().includes(search) ||
        f.dossier_numero?.toLowerCase().includes(search)
      );
    }
    
    if (statut) {
      factures = factures.filter(f => f.statut === statut);
    }
    
    factures = factures.slice(0, parseInt(limit));
    
    res.json({
      data: factures,
      total: factures.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DEVIS ────────────────────────────────────────────────────────────────────────

app.get('/api/devis', (req, res) => {
  try {
    const { q = '', statut = '', limit = 200 } = req.query;
    let devis = [...mockData.devis];
    
    if (q) {
      const search = q.toLowerCase();
      devis = devis.filter(d => 
        d.numero?.toLowerCase().includes(search) ||
        d.raison_sociale?.toLowerCase().includes(search) ||
        d.dossier_reference?.toLowerCase().includes(search)
      );
    }
    
    if (statut) {
      devis = devis.filter(d => d.statut === statut);
    }
    
    devis = devis.slice(0, parseInt(limit));
    
    res.json({
      data: devis,
      total: devis.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DÉBOURS ──────────────────────────────────────────────────────────────────────

app.get('/api/debours', (req, res) => {
  try {
    const { q = '', limit = 200 } = req.query;
    let debours = [...mockData.debours];
    
    if (q) {
      const search = q.toLowerCase();
      debours = debours.filter(d => 
        d.libelle?.toLowerCase().includes(search) ||
        d.beneficiaire?.toLowerCase().includes(search) ||
        d.dossier_reference?.toLowerCase().includes(search)
      );
    }
    
    debours = debours.slice(0, parseInt(limit));
    
    res.json({
      data: debours,
      total: debours.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PRÉAVIS ──────────────────────────────────────────────────────────────────────

app.get('/api/preavis', (req, res) => {
  try {
    const { q = '', statut = '', limit = 200 } = req.query;
    let preavis = [...mockData.preavis];
    
    if (q) {
      const search = q.toLowerCase();
      preavis = preavis.filter(p => 
        p.reference?.toLowerCase().includes(search) ||
        p.raison_sociale?.toLowerCase().includes(search) ||
        p.transporteur?.toLowerCase().includes(search) ||
        p.dossier_reference?.toLowerCase().includes(search)
      );
    }
    
    if (statut) {
      preavis = preavis.filter(p => p.statut === statut);
    }
    
    preavis = preavis.slice(0, parseInt(limit));
    
    res.json({
      data: preavis,
      total: preavis.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PARAMÈTRES ───────────────────────────────────────────────────────────────────

app.get('/api/parametres/secteurs', (req, res) => {
  try {
    res.json(mockData.secteurs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/parametres/types-declaration', (req, res) => {
  try {
    res.json(mockData.types_declaration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/parametres/tva', (req, res) => {
  try {
    res.json(mockData.tva);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/parametres/rubriques', (req, res) => {
  try {
    res.json(mockData.rubriques);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── CRÉATION DE DOCUMENTS ────────────────────────────────────────────────────────

// ── MISES À JOUR ET SUPPRESSIONS ────────────────────────────────────────────────

// PUT devis
app.put('/api/devis/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.devis.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Devis non trouvé' });
    mockData.devis[idx] = { ...mockData.devis[idx], ...req.body };
    res.json({ message: 'Devis mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH statut devis
app.patch('/api/devis/:id/statut', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.devis.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Devis non trouvé' });
    mockData.devis[idx].statut = req.body.statut;
    res.json({ message: 'Statut mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT facture
app.put('/api/factures/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.factures.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Facture non trouvée' });
    mockData.factures[idx] = { ...mockData.factures[idx], ...req.body };
    res.json({ message: 'Facture mise à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH statut facture
app.patch('/api/factures/:id/statut', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.factures.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Facture non trouvée' });
    mockData.factures[idx].statut = req.body.statut;
    res.json({ message: 'Statut mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT débours
app.put('/api/debours/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.debours.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Débours non trouvé' });
    mockData.debours[idx] = { ...mockData.debours[idx], ...req.body };
    res.json({ message: 'Débours mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE débours
app.delete('/api/debours/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.debours.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Débours non trouvé' });
    mockData.debours.splice(idx, 1);
    res.json({ message: 'Débours supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE facture
app.delete('/api/factures/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.factures.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Facture non trouvée' });
    if (mockData.factures[idx].statut === 'payee') {
      return res.status(400).json({ error: 'Impossible de supprimer une facture payée' });
    }
    mockData.factures.splice(idx, 1);
    res.json({ message: 'Facture supprimée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE devis
app.delete('/api/devis/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.devis.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Devis non trouvé' });
    mockData.devis.splice(idx, 1);
    res.json({ message: 'Devis supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE dossier
app.delete('/api/dossiers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dossier = mockData.dossiers.find(d => d.id === id);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });
    if (dossier.statut !== 'cloture') {
      return res.status(400).json({ error: 'Seuls les dossiers clôturés peuvent être supprimés' });
    }
    mockData.dossiers.splice(mockData.dossiers.indexOf(dossier), 1);
    res.json({ message: 'Dossier supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE client
app.delete('/api/clients/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.clients.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Client non trouvé' });
    const hasDossiers = mockData.dossiers.some(d => d.client_id === id && d.statut !== 'cloture');
    if (hasDossiers) {
      return res.status(400).json({ error: 'Ce client a des dossiers en cours, impossible de le supprimer' });
    }
    mockData.clients.splice(idx, 1);
    res.json({ message: 'Client supprimé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET détail facture
app.get('/api/factures/:id', (req, res) => {
  try {
    const facture = mockData.factures.find(f => f.id === parseInt(req.params.id));
    if (!facture) return res.status(404).json({ error: 'Facture non trouvée' });
    const paiements = mockData.paiements.filter(p => p.facture_id === facture.id);
    res.json({ ...facture, paiements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET détail devis
app.get('/api/devis/:id', (req, res) => {
  try {
    const devis = mockData.devis.find(d => d.id === parseInt(req.params.id));
    if (!devis) return res.status(404).json({ error: 'Devis non trouvé' });
    res.json(devis);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET paiements d'une facture
app.get('/api/factures/:id/paiements', (req, res) => {
  try {
    const facture_id = parseInt(req.params.id);
    const paiements = mockData.paiements.filter(p => p.facture_id === facture_id);
    res.json({ data: paiements, total: paiements.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT préavis
app.put('/api/preavis/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.preavis.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Préavis non trouvé' });
    mockData.preavis[idx] = { ...mockData.preavis[idx], ...req.body };
    res.json({ message: 'Préavis mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH statut préavis
app.patch('/api/preavis/:id/statut', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.preavis.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Préavis non trouvé' });
    mockData.preavis[idx].statut = req.body.statut;
    res.json({ message: 'Statut mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Créer un nouveau devis
app.post('/api/devis', (req, res) => {
  try {
    const { client_id, dossier_id, date_devis, validite, observations, lignes } = req.body;
    
    // Generate devis number
    const year = new Date().getFullYear();
    const nextNum = Math.max(...mockData.devis.map(d => {
      const match = d.numero.match(/(\d{6})$/);
      return match ? parseInt(match[1]) : 0;
    })) + 1;
    const numero = `DEV${year}${String(nextNum).padStart(6, '0')}`;
    
    const client = mockData.clients.find(c => c.id === parseInt(client_id));
    const dossier = mockData.dossiers.find(d => d.id === parseInt(dossier_id));
    
    // Calculate totals from lines
    let total_ht = 0, total_tva = 0, total_ttc = 0;
    if (lignes && Array.isArray(lignes)) {
      lignes.forEach(ligne => {
        const ht = (ligne.quantite || 1) * (ligne.prix_unitaire || 0);
        const tva = ht * (ligne.tva_taux || 0) / 100;
        total_ht += ht;
        total_tva += tva;
        total_ttc += ht + tva;
      });
    }
    
    const newDevis = {
      id: Math.max(...mockData.devis.map(d => d.id)) + 1,
      numero,
      client_id: parseInt(client_id),
      dossier_id: dossier_id ? parseInt(dossier_id) : null,
      raison_sociale: client?.raison_sociale || '',
      dossier_reference: dossier?.numero || '',
      date_devis: date_devis || new Date().toISOString().split('T')[0],
      validite: validite || 30,
      statut: 'brouillon',
      montant_ht: total_ht,
      montant_tva: total_tva,
      montant_ttc: total_ttc,
      observations: observations || ''
    };
    
    mockData.devis.push(newDevis);
    
    res.json({ id: newDevis.id, numero, message: 'Devis créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Créer une nouvelle facture
app.post('/api/factures', (req, res) => {
  try {
    const { client_id, dossier_id, devis_id, date_facture, date_echeance, observations, lignes } = req.body;
    
    // Generate facture number
    const year = new Date().getFullYear();
    const nextNum = Math.max(...mockData.factures.map(f => {
      const match = f.numero.match(/(\d{6})$/);
      return match ? parseInt(match[1]) : 0;
    })) + 1;
    const numero = `FAC${year}${String(nextNum).padStart(6, '0')}`;
    
    const client = mockData.clients.find(c => c.id === parseInt(client_id));
    const dossier = mockData.dossiers.find(d => d.id === parseInt(dossier_id));
    
    // Calculate totals from lines
    let total_ht = 0, total_tva = 0, total_ttc = 0;
    if (lignes && Array.isArray(lignes)) {
      lignes.forEach(ligne => {
        const ht = (ligne.quantite || 1) * (ligne.prix_unitaire || 0);
        const tva = ht * (ligne.tva_taux || 0) / 100;
        total_ht += ht;
        total_tva += tva;
        total_ttc += ht + tva;
      });
    }
    
    const newFacture = {
      id: Math.max(...mockData.factures.map(f => f.id)) + 1,
      numero,
      client_id: parseInt(client_id),
      dossier_id: dossier_id ? parseInt(dossier_id) : null,
      devis_id: devis_id ? parseInt(devis_id) : null,
      raison_sociale: client?.raison_sociale || '',
      client_code: client?.code || '',
      dossier_numero: dossier?.numero || '',
      date_facture: date_facture || new Date().toISOString().split('T')[0],
      date_echeance: date_echeance,
      statut: 'brouillon',
      total_ht,
      total_tva,
      total_ttc,
      net_a_payer: total_ttc,
      total_paye: 0,
      solde_du: total_ttc,
      observations: observations || ''
    };
    
    mockData.factures.push(newFacture);
    
    res.json({ id: newFacture.id, numero, message: 'Facture créée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Créer un nouveau débours
app.post('/api/debours', (req, res) => {
  try {
    const { dossier_id, date_debours, libelle, beneficiaire, montant, observations } = req.body;
    
    const dossier = mockData.dossiers.find(d => d.id === parseInt(dossier_id));
    
    const newDebours = {
      id: Math.max(...mockData.debours.map(d => d.id)) + 1,
      dossier_id: parseInt(dossier_id),
      dossier_reference: dossier?.numero || '',
      date_debours: date_debours || new Date().toISOString().split('T')[0],
      libelle,
      beneficiaire: beneficiaire || '',
      montant: parseFloat(montant) || 0,
      observations: observations || ''
    };
    
    mockData.debours.push(newDebours);
    
    res.json({ id: newDebours.id, message: 'Débours créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Créer un nouveau préavis
app.post('/api/preavis', (req, res) => {
  try {
    const { client_id, dossier_id, date_arrivee_prevue, moyen_transport, transporteur, provenance, observations } = req.body;
    
    // Generate preavis reference
    const year = new Date().getFullYear();
    const nextNum = Math.max(...mockData.preavis.map(p => {
      const match = p.reference.match(/(\d{5})$/);
      return match ? parseInt(match[1]) : 0;
    })) + 1;
    const reference = `PRE${year}${String(nextNum).padStart(5, '0')}`;
    
    const client = mockData.clients.find(c => c.id === parseInt(client_id));
    const dossier = mockData.dossiers.find(d => d.id === parseInt(dossier_id));
    
    const newPreavis = {
      id: Math.max(...mockData.preavis.map(p => p.id)) + 1,
      reference,
      client_id: parseInt(client_id),
      dossier_id: dossier_id ? parseInt(dossier_id) : null,
      raison_sociale: client?.raison_sociale || '',
      dossier_reference: dossier?.numero || '',
      date_arrivee_prevue,
      moyen_transport: moyen_transport || 'maritime',
      transporteur: transporteur || '',
      provenance: provenance || '',
      statut: 'en_attente',
      observations: observations || ''
    };
    
    mockData.preavis.push(newPreavis);
    
    res.json({ id: newPreavis.id, reference, message: 'Préavis créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GESTION DES PAIEMENTS ────────────────────────────────────────────────────────

app.post('/api/factures/:id/paiements', (req, res) => {
  try {
    const facture_id = parseInt(req.params.id);
    const { montant, date_paiement, mode_paiement, reference, observations } = req.body;
    
    const facture = mockData.factures.find(f => f.id === facture_id);
    if (!facture) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    const newPaiement = {
      id: Math.max(...mockData.paiements.map(p => p.id), 0) + 1,
      facture_id,
      facture_numero: facture.numero,
      montant: parseFloat(montant),
      date_paiement: date_paiement || new Date().toISOString().split('T')[0],
      mode_paiement: mode_paiement || 'especes',
      reference: reference || '',
      observations: observations || ''
    };
    
    mockData.paiements.push(newPaiement);
    
    // Update facture totals
    const totalPaye = mockData.paiements
      .filter(p => p.facture_id === facture_id)
      .reduce((sum, p) => sum + p.montant, 0);
    
    facture.total_paye = totalPaye;
    facture.solde_du = facture.net_a_payer - totalPaye;
    
    if (facture.solde_du <= 0) {
      facture.statut = 'payee';
    } else if (totalPaye > 0) {
      facture.statut = 'partielle';
    }
    
    res.json({ id: newPaiement.id, message: 'Paiement enregistré avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── STATISTIQUES AVANCÉES ───────────────────────────────────────────────────────

app.get('/api/stats/ca-mensuel', (req, res) => {
  try {
    const { annee = 2026 } = req.query;
    
    const stats = [];
    for (let mois = 1; mois <= 12; mois++) {
      const monthStr = `${annee}-${String(mois).padStart(2, '0')}`;
      const ca = mockData.factures
        .filter(f => f.date_facture?.startsWith(monthStr))
        .reduce((sum, f) => sum + (f.total_ttc || 0), 0);
      
      stats.push({
        mois: monthStr,
        ca_realise: ca,
        nb_factures: mockData.factures.filter(f => f.date_facture?.startsWith(monthStr)).length
      });
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/top-clients', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const clientStats = mockData.clients.map(client => {
      const ca = mockData.factures
        .filter(f => f.client_id === client.id)
        .reduce((sum, f) => sum + (f.total_ttc || 0), 0);
      
      const nb_dossiers = mockData.dossiers.filter(d => d.client_id === client.id).length;
      const nb_factures = mockData.factures.filter(f => f.client_id === client.id).length;
      
      return {
        ...client,
        ca_total: ca,
        nb_dossiers,
        nb_factures
      };
    })
    .sort((a, b) => b.ca_total - a.ca_total)
    .slice(0, parseInt(limit));
    
    res.json(clientStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── EXPORTS ET RAPPORTS ─────────────────────────────────────────────────────────

app.get('/api/rapports/facturation', (req, res) => {
  try {
    const { date_debut, date_fin, client_id, statut } = req.query;
    
    let factures = [...mockData.factures];
    
    if (date_debut) {
      factures = factures.filter(f => f.date_facture >= date_debut);
    }
    
    if (date_fin) {
      factures = factures.filter(f => f.date_facture <= date_fin);
    }
    
    if (client_id) {
      factures = factures.filter(f => f.client_id === parseInt(client_id));
    }
    
    if (statut) {
      factures = factures.filter(f => f.statut === statut);
    }
    
    const totaux = {
      nb_factures: factures.length,
      total_ht: factures.reduce((sum, f) => sum + (f.total_ht || 0), 0),
      total_tva: factures.reduce((sum, f) => sum + (f.total_tva || 0), 0),
      total_ttc: factures.reduce((sum, f) => sum + (f.total_ttc || 0), 0),
      total_paye: factures.reduce((sum, f) => sum + (f.total_paye || 0), 0),
      solde_du: factures.reduce((sum, f) => sum + (f.solde_du || 0), 0)
    };
    
    res.json({ factures, totaux });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rapports/debours', (req, res) => {
  try {
    const { date_debut, date_fin, dossier_id } = req.query;
    
    let debours = [...mockData.debours];
    
    if (date_debut) {
      debours = debours.filter(d => d.date_debours >= date_debut);
    }
    
    if (date_fin) {
      debours = debours.filter(d => d.date_debours <= date_fin);
    }
    
    if (dossier_id) {
      debours = debours.filter(d => d.dossier_id === parseInt(dossier_id));
    }
    
    const total = debours.reduce((sum, d) => sum + d.montant, 0);
    
    res.json({ debours, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── RECHERCHE GLOBALE ───────────────────────────────────────────────────────────

app.get('/api/search', (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }
    
    const search = q.toLowerCase();
    const results = [];
    
    // Search clients
    mockData.clients.forEach(client => {
      if (
        client.raison_sociale?.toLowerCase().includes(search) ||
        client.code?.toLowerCase().includes(search) ||
        client.ville?.toLowerCase().includes(search)
      ) {
        results.push({
          type: 'client',
          id: client.id,
          title: client.raison_sociale,
          subtitle: `${client.code} - ${client.ville}`,
          url: `/clients/${client.id}`
        });
      }
    });
    
    // Search dossiers
    mockData.dossiers.forEach(dossier => {
      if (
        dossier.numero?.toLowerCase().includes(search) ||
        dossier.raison_sociale?.toLowerCase().includes(search) ||
        dossier.marchandise?.toLowerCase().includes(search)
      ) {
        results.push({
          type: 'dossier',
          id: dossier.id,
          title: dossier.numero,
          subtitle: `${dossier.raison_sociale} - ${dossier.marchandise}`,
          url: `/dossiers/${dossier.id}`
        });
      }
    });
    
    // Search factures
    mockData.factures.forEach(facture => {
      if (
        facture.numero?.toLowerCase().includes(search) ||
        facture.raison_sociale?.toLowerCase().includes(search)
      ) {
        results.push({
          type: 'facture',
          id: facture.id,
          title: facture.numero,
          subtitle: `${facture.raison_sociale} - ${facture.total_ttc} TND`,
          url: `/factures/${facture.id}`
        });
      }
    });
    
    res.json({ results: results.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── AI PDF Extraction ─────────────────────────────────────────────────────────
app.use('/api/ai', require('./routes/ai-extract'));

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPES DE VALIDATION DES DOSSIERS
// ══════════════════════════════════════════════════════════════════════════════

function getUser(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return null;
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'jwt_secret_key');
    return mockData.users.find(u => u.id === decoded.id) || null;
  } catch { return null; }
}

// GET étapes en attente (superviseur/admin)
app.get('/api/etapes/pending', (req, res) => {
  try {
    const pending = mockData.etapes
      .filter(e => e.statut === 'en_attente')
      .map(e => ({
        ...e,
        raison_sociale: mockData.dossiers.find(d => d.id === e.dossier_id)?.raison_sociale || ''
      }));
    res.json(pending);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET mes déclarations (agent)
app.get('/api/etapes/my-declarations', (req, res) => {
  try {
    const user = getUser(req);
    const login = user?.login || 'agent01';
    const mes = mockData.etapes
      .filter(e => e.auteur === login)
      .map(e => ({
        ...e,
        raison_sociale: mockData.dossiers.find(d => d.id === e.dossier_id)?.raison_sociale || ''
      }));
    res.json(mes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET étapes d'un dossier
app.get('/api/etapes/dossier/:dossierId', (req, res) => {
  try {
    const etapes = mockData.etapes.filter(e => e.dossier_id === parseInt(req.params.dossierId));
    res.json(etapes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST déclarer une étape
app.post('/api/etapes', (req, res) => {
  try {
    const user = getUser(req);
    const { dossier_id, titre_etape, commentaire } = req.body;
    const dossier = mockData.dossiers.find(d => d.id === parseInt(dossier_id));
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });
    const newEtape = {
      id: Math.max(...mockData.etapes.map(e => e.id), 0) + 1,
      dossier_id: parseInt(dossier_id),
      dossier_ref: dossier.numero,
      titre_etape,
      statut: 'en_attente',
      auteur: user?.login || 'agent01',
      auteur_nom: ((user?.prenom || '') + ' ' + (user?.nom || '')).trim(),
      date_declaration: new Date().toISOString().split('T')[0],
      date_validation: null,
      commentaire: commentaire || '',
      pieces_jointes: []
    };
    mockData.etapes.push(newEtape);
    res.json({ id: newEtape.id, message: 'Étape déclarée avec succès' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH valider une étape
app.patch('/api/etapes/:id/validate', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = mockData.etapes.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Étape non trouvée' });
    mockData.etapes[idx].statut = 'validee';
    mockData.etapes[idx].date_validation = new Date().toISOString().split('T')[0];
    res.json({ message: 'Étape validée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH rejeter une étape
app.patch('/api/etapes/:id/reject', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { motif_rejet } = req.body;
    const idx = mockData.etapes.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Étape non trouvée' });
    mockData.etapes[idx].statut = 'rejetee';
    mockData.etapes[idx].motif_rejet = motif_rejet || '';
    mockData.etapes[idx].date_validation = new Date().toISOString().split('T')[0];
    res.json({ message: 'Étape rejetée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Test CSS endpoint
app.get('/test-css', (req, res) => {
  const cssPath = path.join(__dirname, 'public', 'style.css');
  console.log('CSS Path:', cssPath);
  console.log('File exists:', require('fs').existsSync(cssPath));
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(cssPath);
});

// Debug static files
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

// ═══════════════════════════════════════════════════════════════════════════════════
//  ESPACE CLIENT — Portail libre-service pour les clients
// ═══════════════════════════════════════════════════════════════════════════════════

// Middleware d'auth client
function authClient(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'jwt_secret_key');
    if (decoded.type !== 'client') {
      return res.status(403).json({ error: 'Accès réservé aux clients' });
    }
    req.clientId = decoded.clientId;
    req.clientCode = decoded.clientCode;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Login espace client
app.post('/api/client-portal/login', (req, res) => {
  try {
    const { code, mot_de_passe } = req.body;
    if (!code || !mot_de_passe) {
      return res.status(400).json({ error: 'Code et mot de passe requis' });
    }

    // Trouver le client par son code
    const client = mockData.clients.find(
      c => c.code.toLowerCase() === code.trim().toLowerCase()
    );

    if (!client) {
      return res.status(401).json({ error: 'Code client ou mot de passe incorrect' });
    }

    // Mot de passe accepté :
    // 1. "client123" (universel pour la démo)
    // 2. Les 4 derniers chiffres du NIF
    // 3. Le code client en minuscules (ex: cli001)
    const nifDigits = (client.nif || '').replace(/\D/g, '').slice(-4);
    const validPasswords = ['client123', client.code.toLowerCase()];
    if (nifDigits.length === 4) validPasswords.push(nifDigits);

    if (!validPasswords.includes(mot_de_passe.trim())) {
      return res.status(401).json({ error: 'Code client ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { type: 'client', clientId: client.id, clientCode: client.code },
      process.env.JWT_SECRET || 'jwt_secret_key',
      { expiresIn: '8h' }
    );

    res.json({
      token,
      client: {
        id: client.id,
        code: client.code,
        raison_sociale: client.raison_sociale,
        ville: client.ville,
        email: client.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Profil client connecté
app.get('/api/client-portal/me', authClient, (req, res) => {
  const client = mockData.clients.find(c => c.id === req.clientId);
  if (!client) return res.status(404).json({ error: 'Client non trouvé' });
  res.json(client);
});

// Tableau de bord client — ses propres statistiques
app.get('/api/client-portal/dashboard', authClient, (req, res) => {
  try {
    const cid = req.clientId;
    const dossiers = mockData.dossiers.filter(d => d.client_id === cid);
    const factures = mockData.factures.filter(f => f.client_id === cid);
    const preavis  = mockData.preavis.filter(p => p.client_id === cid);

    const stats = {
      dossiers_total:     dossiers.length,
      dossiers_en_cours:  dossiers.filter(d => d.statut === 'en_cours').length,
      dossiers_ouverts:   dossiers.filter(d => d.statut === 'ouvert').length,
      dossiers_clotures:  dossiers.filter(d => d.statut === 'cloture').length,
      factures_total:     factures.length,
      factures_impayees:  factures.filter(f => ['emise','brouillon','partielle'].includes(f.statut)).length,
      solde_du:           factures.reduce((s, f) => s + (f.solde_du || 0), 0),
      ca_total:           factures.reduce((s, f) => s + (f.total_ttc || 0), 0),
      preavis_en_attente: preavis.filter(p => p.statut === 'en_attente').length
    };

    res.json({
      stats,
      derniers_dossiers:  dossiers.slice(-5).reverse(),
      dernieres_factures: factures.slice(-5).reverse(),
      prochains_preavis:  preavis.filter(p => p.statut === 'en_attente')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dossiers du client
app.get('/api/client-portal/dossiers', authClient, (req, res) => {
  try {
    const { q = '', statut = '' } = req.query;
    let dossiers = mockData.dossiers.filter(d => d.client_id === req.clientId);

    if (q) {
      const s = q.toLowerCase();
      dossiers = dossiers.filter(d =>
        d.numero?.toLowerCase().includes(s) ||
        d.marchandise?.toLowerCase().includes(s) ||
        d.description?.toLowerCase().includes(s)
      );
    }
    if (statut) dossiers = dossiers.filter(d => d.statut === statut);

    res.json({ data: dossiers, total: dossiers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Détail d'un dossier (vérifie que le dossier appartient au client)
app.get('/api/client-portal/dossiers/:id', authClient, (req, res) => {
  try {
    const dossier = mockData.dossiers.find(
      d => d.id === parseInt(req.params.id) && d.client_id === req.clientId
    );
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    dossier.factures = mockData.factures.filter(f => f.dossier_id === dossier.id);
    dossier.debours  = mockData.debours.filter(d => d.dossier_id === dossier.id);
    dossier.preavis  = mockData.preavis.filter(p => p.dossier_id === dossier.id);
    res.json(dossier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Factures du client
app.get('/api/client-portal/factures', authClient, (req, res) => {
  try {
    const { statut = '' } = req.query;
    let factures = mockData.factures.filter(f => f.client_id === req.clientId);
    if (statut) factures = factures.filter(f => f.statut === statut);
    res.json({ data: factures, total: factures.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Préavis du client
app.get('/api/client-portal/preavis', authClient, (req, res) => {
  try {
    const preavis = mockData.preavis.filter(p => p.client_id === req.clientId);
    res.json({ data: preavis, total: preavis.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir la page Espace Client
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});
app.get('/client-portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Local dev server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\n🚢 Transit Pro → http://localhost:${PORT}`);
    console.log(`👤 Espace Client → http://localhost:${PORT}/client\n`);
    console.log('   Admin : admin / admin123');
    console.log('   Client demo : CLI001 / 7890\n');
  });
}

module.exports = app;
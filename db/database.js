const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const isVercel = process.env.VERCEL === '1' || !!process.env.LAMBDA_TASK_ROOT;
const dbPath = isVercel
  ? '/tmp/transit.db'
  : path.join(__dirname, 'transit.db');

const tursoUrl = process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.trim() : '';
const tursoToken = process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : '';

let clientConfig;
if (tursoUrl) {
  clientConfig = {
    url: tursoUrl,
    authToken: tursoToken,
  };
} else if (isVercel) {
  console.warn('⚠️ Attention: TURSO_DATABASE_URL non configurée dans l\'environnement Vercel.');
  clientConfig = {
    url: 'file:' + dbPath,
  };
} else {
  clientConfig = {
    url: 'file:' + dbPath,
  };
}

const client = createClient(clientConfig);

async function run(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return { lastID: Number(result.lastInsertRowid), changes: result.rowsAffected };
}

async function get(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  if (!result.rows || result.rows.length === 0) return null;
  return rowToObject(result.columns, result.rows[0]);
}

async function all(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  if (!result.rows) return [];
  return result.rows.map(row => rowToObject(result.columns, row));
}

function rowToObject(columns, row) {
  const obj = {};
  columns.forEach((col, i) => {
    const val = row[i];
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  });
  return obj;
}

async function initDb() {
  let schema = '';
  const schemaPaths = [
    path.join(__dirname, 'schema-simple.sql'),
    path.join(process.cwd(), 'db/schema-simple.sql'),
    path.join(process.cwd(), 'schema-simple.sql')
  ];

  for (const p of schemaPaths) {
    if (fs.existsSync(p)) {
      try { schema = fs.readFileSync(p, 'utf8'); break; } catch(e){}
    }
  }

  if (!schema) {
    schema = `
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL UNIQUE, mot_de_passe TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT, email TEXT, role TEXT NOT NULL DEFAULT 'agent', client_id INTEGER, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tva (id INTEGER PRIMARY KEY AUTOINCREMENT, libelle TEXT NOT NULL, taux REAL NOT NULL DEFAULT 0, defaut INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS secteur_activite (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS type_declaration (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rubrique (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL, prix_defaut REAL NOT NULL DEFAULT 0, tva_id INTEGER);
      CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, raison_sociale TEXT NOT NULL, secteur_id INTEGER, adresse TEXT, ville TEXT, code_postal TEXT, pays TEXT NOT NULL DEFAULT 'Tunisie', telephone TEXT, fax TEXT, email TEXT, contact TEXT, nif TEXT, tva_num TEXT, notes TEXT, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS dossiers (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, client_id INTEGER NOT NULL REFERENCES clients(id), type_decl_id INTEGER NOT NULL REFERENCES type_declaration(id), agent_id INTEGER REFERENCES utilisateurs(id), statut TEXT NOT NULL DEFAULT 'ouvert', description TEXT, marchandise TEXT, pays_origine TEXT, pays_destination TEXT, valeur_douane REAL DEFAULT 0, devise TEXT DEFAULT 'TND', incoterm TEXT, observations TEXT, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS dossier_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, nom_fichier TEXT NOT NULL, chemin TEXT NOT NULL, type_mime TEXT, taille INTEGER, uploaded_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS dossier_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, contenu TEXT NOT NULL, auteur_id INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS devis (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER REFERENCES dossiers(id), client_id INTEGER NOT NULL REFERENCES clients(id), date_devis TEXT NOT NULL DEFAULT (date('now')), date_validite TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS devis_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, devis_id INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE, rubrique_id INTEGER REFERENCES rubrique(id), designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER REFERENCES tva(id), ordre INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS factures (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER REFERENCES dossiers(id), client_id INTEGER NOT NULL REFERENCES clients(id), devis_id INTEGER REFERENCES devis(id), date_facture TEXT NOT NULL DEFAULT (date('now')), date_echeance TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS facture_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, rubrique_id INTEGER REFERENCES rubrique(id), designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER REFERENCES tva(id), ordre INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, date_paiement TEXT NOT NULL DEFAULT (date('now')), montant REAL NOT NULL, mode TEXT NOT NULL DEFAULT 'virement', reference TEXT, notes TEXT, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS decharges (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, date_decharge TEXT NOT NULL DEFAULT (date('now')), signataire TEXT, observations TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS debours (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, date_debours TEXT NOT NULL DEFAULT (date('now')), libelle TEXT NOT NULL, beneficiaire TEXT, montant REAL NOT NULL DEFAULT 0, devise TEXT NOT NULL DEFAULT 'TND', justificatif TEXT, facture_id INTEGER REFERENCES factures(id), notes TEXT, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS preavis_arrivee (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, client_id INTEGER NOT NULL REFERENCES clients(id), date_creation TEXT NOT NULL DEFAULT (date('now')), date_arrivee_prevue TEXT, transporteur TEXT, moyen_transport TEXT, ref_transport TEXT, port_embarquement TEXT, port_dechargement TEXT, designation_march TEXT, nb_colis INTEGER, poids_brut REAL, volume REAL, statut TEXT NOT NULL DEFAULT 'en_attente', email_notif_envoye INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS compteurs (id INTEGER PRIMARY KEY AUTOINCREMENT, type_doc TEXT NOT NULL UNIQUE, annee INTEGER NOT NULL, dernier_num INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS etapes_dossier (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, agent_id INTEGER NOT NULL REFERENCES utilisateurs(id), titre_etape TEXT NOT NULL, description TEXT, pieces_jointes TEXT DEFAULT '[]', statut TEXT NOT NULL DEFAULT 'en_attente', motif_rejet TEXT, valide_par INTEGER REFERENCES utilisateurs(id), date_declaration TEXT NOT NULL DEFAULT (datetime('now')), date_validation TEXT);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE, dossier_id INTEGER REFERENCES dossiers(id) ON DELETE CASCADE, etape_id INTEGER REFERENCES etapes_dossier(id) ON DELETE CASCADE, message TEXT NOT NULL, lu INTEGER NOT NULL DEFAULT 0, date_creation TEXT NOT NULL DEFAULT (datetime('now')));
    `;
  }
  
  const cleanSchema = schema.replace(/--.*$/gm, '');
  const stmts = cleanSchema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Executing ${stmts.length} SQL statements...`);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (!stmt) continue;
    
    try {
      await client.execute(stmt);
      if (stmt.includes('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
        if (match) console.log(`✓ Created table: ${match[1]}`);
      }
    } catch (e) {
      console.error(`❌ SQL Error on statement ${i + 1}:`, stmt.substring(0, 50) + '...', e.message);
      throw e;
    }
  }

  // ── Vérification et migration des colonnes critiques ─────────────────────────
  // Si une table existe mais manque des colonnes clés (schéma ancien sur Turso),
  // on la recrée proprement. Les try/catch ignorent les erreurs silencieuses.
  
  // Vérifier factures.client_id
  try {
    const cols = await all("PRAGMA table_info(factures)");
    const hasClientId = cols.some(c => c.name === 'client_id');
    if (!hasClientId) {
      console.log('🔄 Recreating factures table (missing client_id)...');
      await client.execute('DROP TABLE IF EXISTS facture_lignes');
      await client.execute('DROP TABLE IF EXISTS paiements');
      await client.execute('DROP TABLE IF EXISTS decharges');
      await client.execute('DROP TABLE IF EXISTS factures');
      await client.execute(`CREATE TABLE factures (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER REFERENCES dossiers(id), client_id INTEGER NOT NULL REFERENCES clients(id), devis_id INTEGER REFERENCES devis(id), date_facture TEXT NOT NULL DEFAULT (date('now')), date_echeance TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      await client.execute(`CREATE TABLE IF NOT EXISTS facture_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, rubrique_id INTEGER REFERENCES rubrique(id), designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER REFERENCES tva(id), ordre INTEGER NOT NULL DEFAULT 0)`);
      await client.execute(`CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, date_paiement TEXT NOT NULL DEFAULT (date('now')), montant REAL NOT NULL, mode TEXT NOT NULL DEFAULT 'virement', reference TEXT, notes TEXT, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      await client.execute(`CREATE TABLE IF NOT EXISTS decharges (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE, date_decharge TEXT NOT NULL DEFAULT (date('now')), signataire TEXT, observations TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      console.log('✅ factures table recreated with correct schema.');
    }
  } catch(e) { console.error('Migration factures error:', e.message); }

  // Vérifier devis.client_id
  try {
    const cols = await all("PRAGMA table_info(devis)");
    const hasClientId = cols.some(c => c.name === 'client_id');
    if (!hasClientId) {
      console.log('🔄 Recreating devis table (missing client_id)...');
      await client.execute('DROP TABLE IF EXISTS devis_lignes');
      await client.execute('DROP TABLE IF EXISTS devis');
      await client.execute(`CREATE TABLE devis (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER REFERENCES dossiers(id), client_id INTEGER NOT NULL REFERENCES clients(id), date_devis TEXT NOT NULL DEFAULT (date('now')), date_validite TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER REFERENCES utilisateurs(id), created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      await client.execute(`CREATE TABLE IF NOT EXISTS devis_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, devis_id INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE, rubrique_id INTEGER REFERENCES rubrique(id), designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER REFERENCES tva(id), ordre INTEGER NOT NULL DEFAULT 0)`);
      console.log('✅ devis table recreated with correct schema.');
    }
  } catch(e) { console.error('Migration devis error:', e.message); }

  // Vérifier etapes_dossier.pieces_jointes
  try {
    const cols = await all("PRAGMA table_info(etapes_dossier)");
    const hasPiecesJointes = cols.some(c => c.name === 'pieces_jointes');
    if (!hasPiecesJointes) {
      console.log('🔄 Recreating etapes_dossier table (missing pieces_jointes)...');
      await client.execute('DROP TABLE IF EXISTS etapes_dossier');
      await client.execute(`CREATE TABLE etapes_dossier (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE, agent_id INTEGER NOT NULL REFERENCES utilisateurs(id), titre_etape TEXT NOT NULL, description TEXT, pieces_jointes TEXT DEFAULT '[]', statut TEXT NOT NULL DEFAULT 'en_attente', motif_rejet TEXT, valide_par INTEGER REFERENCES utilisateurs(id), date_declaration TEXT NOT NULL DEFAULT (datetime('now')), date_validation TEXT)`);
      console.log('✅ etapes_dossier table recreated with correct schema.');
    }
  } catch(e) { console.error('Migration etapes_dossier error:', e.message); }

  // Vérifier notifications.dossier_id  
  try {
    const cols = await all("PRAGMA table_info(notifications)");
    const hasDossierId = cols.some(c => c.name === 'dossier_id');
    if (!hasDossierId) {
      console.log('🔄 Recreating notifications table (missing dossier_id)...');
      await client.execute('DROP TABLE IF EXISTS notifications');
      await client.execute(`CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE, dossier_id INTEGER REFERENCES dossiers(id) ON DELETE CASCADE, etape_id INTEGER REFERENCES etapes_dossier(id) ON DELETE CASCADE, message TEXT NOT NULL, lu INTEGER NOT NULL DEFAULT 0, date_creation TEXT NOT NULL DEFAULT (datetime('now')))`);
      console.log('✅ notifications table recreated with correct schema.');
    }
  } catch(e) { console.error('Migration notifications error:', e.message); }


  try {
    const tableInfo = await all("PRAGMA table_info(utilisateurs)");
    const hasClientId = tableInfo.some(c => c.name === 'client_id');
    if (!hasClientId) {
      await run("ALTER TABLE utilisateurs ADD COLUMN client_id INTEGER");
    }
  } catch(e) {}

  // Tester la contrainte CHECK du champ role et recréer si l'ancienne contrainte (admin, agent) bloque
  try {
    await run("INSERT INTO utilisateurs (login, mot_de_passe, nom, role) VALUES ('__test_role_check__', 'x', 'x', 'superviseur')");
    await run("DELETE FROM utilisateurs WHERE login='__test_role_check__'");
  } catch(e) {
    if (e.message && e.message.includes('CHECK constraint failed')) {
      console.log('🔄 Mise à jour du schéma utilisateurs (recréation de la table sans ancienne contrainte CHECK)...');
      await run("PRAGMA foreign_keys = OFF");
      await run("DROP TABLE IF EXISTS usuarios_temp");
      await run("CREATE TABLE usuarios_temp AS SELECT id, login, mot_de_passe, nom, prenom, email, role, client_id, actif, created_at FROM utilisateurs");
      await run("DROP TABLE utilisateurs");
      await run(`CREATE TABLE utilisateurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL UNIQUE,
        mot_de_passe TEXT NOT NULL,
        nom TEXT NOT NULL,
        prenom TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'agent',
        client_id INTEGER,
        actif INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      await run("INSERT INTO utilisateurs (id, login, mot_de_passe, nom, prenom, email, role, client_id, actif, created_at) SELECT id, login, mot_de_passe, nom, prenom, email, role, client_id, actif, created_at FROM usuarios_temp");
      await run("DROP TABLE usuarios_temp");
      await run("PRAGMA foreign_keys = ON");
      console.log('✅ Table utilisateurs migrée avec succès.');
    }
  }
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN agent_id INTEGER'); } catch (_) {}

  // ── Migrations colonnes manquantes ─────────────────────────────────────────
  // factures
  const migrationsFactures = [
    'ALTER TABLE factures ADD COLUMN client_id INTEGER',
    'ALTER TABLE factures ADD COLUMN devis_id INTEGER',
    'ALTER TABLE factures ADD COLUMN conditions TEXT',
    'ALTER TABLE factures ADD COLUMN remise_globale REAL NOT NULL DEFAULT 0',
  ];
  for (const m of migrationsFactures) { try { await client.execute(m); } catch (_) {} }

  // devis
  const migrationsDevis = [
    'ALTER TABLE devis ADD COLUMN client_id INTEGER',
    'ALTER TABLE devis ADD COLUMN conditions TEXT',
    'ALTER TABLE devis ADD COLUMN remise_globale REAL NOT NULL DEFAULT 0',
  ];
  for (const m of migrationsDevis) { try { await client.execute(m); } catch (_) {} }

  // dossiers
  const migrationsDossiers = [
    'ALTER TABLE dossiers ADD COLUMN valeur_douane REAL DEFAULT 0',
    'ALTER TABLE dossiers ADD COLUMN devise TEXT DEFAULT \'TND\'',
    'ALTER TABLE dossiers ADD COLUMN incoterm TEXT',
    'ALTER TABLE dossiers ADD COLUMN observations TEXT',
  ];
  for (const m of migrationsDossiers) { try { await client.execute(m); } catch (_) {} }

  // debours
  const migrationsDebours = [
    'ALTER TABLE debours ADD COLUMN justificatif TEXT',
    'ALTER TABLE debours ADD COLUMN facture_id INTEGER',
    'ALTER TABLE debours ADD COLUMN notes TEXT',
  ];
  for (const m of migrationsDebours) { try { await client.execute(m); } catch (_) {} }

  // preavis_arrivee
  const migrationsPreavis = [
    'ALTER TABLE preavis_arrivee ADD COLUMN client_id INTEGER',
    'ALTER TABLE preavis_arrivee ADD COLUMN email_notif_envoye INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE preavis_arrivee ADD COLUMN notes TEXT',
  ];
  for (const m of migrationsPreavis) { try { await client.execute(m); } catch (_) {} }

  // etapes_dossier
  const migrationsEtapes = [
    'ALTER TABLE etapes_dossier ADD COLUMN pieces_jointes TEXT DEFAULT \'[]\'',
    'ALTER TABLE etapes_dossier ADD COLUMN motif_rejet TEXT',
    'ALTER TABLE etapes_dossier ADD COLUMN date_validation TEXT',
  ];
  for (const m of migrationsEtapes) { try { await client.execute(m); } catch (_) {} }

  // notifications
  const migrationsNotifications = [
    'ALTER TABLE notifications ADD COLUMN dossier_id INTEGER',
    'ALTER TABLE notifications ADD COLUMN etape_id INTEGER',
  ];
  for (const m of migrationsNotifications) { try { await client.execute(m); } catch (_) {} }

  // clients
  const migrationsClients = [
    'ALTER TABLE clients ADD COLUMN fax TEXT',
    'ALTER TABLE clients ADD COLUMN contact TEXT',
    'ALTER TABLE clients ADD COLUMN tva_num TEXT',
    'ALTER TABLE clients ADD COLUMN notes TEXT',
  ];
  for (const m of migrationsClients) { try { await client.execute(m); } catch (_) {} }

  console.log('✅ Schema initialisé');
}

// Generate next document number
async function nextNum(typeDoc, annee) {
  const yr = annee || new Date().getFullYear();
  let row = await get(
    'SELECT * FROM compteurs WHERE type_doc = ? AND annee = ?',
    [typeDoc, yr]
  );
  if (!row) {
    await run(
      'INSERT INTO compteurs (type_doc, annee, dernier_num) VALUES (?,?,0)',
      [typeDoc, yr]
    );
    row = { dernier_num: 0 };
  }
  const next = row.dernier_num + 1;
  await run(
    'UPDATE compteurs SET dernier_num = ? WHERE type_doc = ? AND annee = ?',
    [next, typeDoc, yr]
  );
  return next;
}

async function genRefDossier(typeCode) {
  const yr = new Date().getFullYear();
  const key = `DOSSIER_${typeCode}`;
  const n = await nextNum(key, yr);
  return `${yr}${typeCode}${String(n).padStart(5, '0')}`;
}

async function genNumDevis() {
  const yr = new Date().getFullYear();
  const n = await nextNum('DEVIS', yr);
  return `DEV${yr}${String(n).padStart(4, '0')}`;
}

async function genNumFacture() {
  const yr = new Date().getFullYear();
  const n = await nextNum('FACTURE', yr);
  return `FAC${yr}${String(n).padStart(4, '0')}`;
}

async function genRefPreavis() {
  const yr = new Date().getFullYear();
  const n = await nextNum('PREAVIS', yr);
  return `PRE${yr}${String(n).padStart(4, '0')}`;
}

module.exports = {
  run, get, all, initDb,
  genRefDossier, genNumDevis, genNumFacture, genRefPreavis,
};

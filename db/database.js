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
  const FULL_SCHEMA = `
    CREATE TABLE IF NOT EXISTS utilisateurs (id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL UNIQUE, mot_de_passe TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT, email TEXT, role TEXT NOT NULL DEFAULT 'agent', client_id INTEGER, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tva (id INTEGER PRIMARY KEY AUTOINCREMENT, libelle TEXT NOT NULL, taux REAL NOT NULL DEFAULT 0, defaut INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS secteur_activite (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS type_declaration (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rubrique (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL, prix_defaut REAL NOT NULL DEFAULT 0, tva_id INTEGER);
    CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, raison_sociale TEXT NOT NULL, secteur_id INTEGER, adresse TEXT, ville TEXT, code_postal TEXT, pays TEXT NOT NULL DEFAULT 'Tunisie', telephone TEXT, fax TEXT, email TEXT, contact TEXT, nif TEXT, tva_num TEXT, notes TEXT, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS dossiers (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, client_id INTEGER NOT NULL, type_decl_id INTEGER NOT NULL, agent_id INTEGER, statut TEXT NOT NULL DEFAULT 'ouvert', description TEXT, marchandise TEXT, pays_origine TEXT, pays_destination TEXT, valeur_douane REAL DEFAULT 0, devise TEXT DEFAULT 'TND', incoterm TEXT, observations TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS dossier_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL, nom_fichier TEXT NOT NULL, chemin TEXT NOT NULL, type_mime TEXT, taille INTEGER, uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS dossier_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL, contenu TEXT NOT NULL, auteur_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS devis (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER, client_id INTEGER NOT NULL, date_devis TEXT NOT NULL DEFAULT (date('now')), date_validite TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS devis_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, devis_id INTEGER NOT NULL, rubrique_id INTEGER, designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER, ordre INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS factures (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, dossier_id INTEGER, client_id INTEGER NOT NULL, devis_id INTEGER, date_facture TEXT NOT NULL DEFAULT (date('now')), date_echeance TEXT, statut TEXT NOT NULL DEFAULT 'brouillon', objet TEXT, conditions TEXT, notes TEXT, remise_globale REAL NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS facture_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL, rubrique_id INTEGER, designation TEXT NOT NULL, quantite REAL NOT NULL DEFAULT 1, prix_unitaire REAL NOT NULL DEFAULT 0, tva_id INTEGER, ordre INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL, date_paiement TEXT NOT NULL DEFAULT (date('now')), montant REAL NOT NULL, mode TEXT NOT NULL DEFAULT 'virement', reference TEXT, notes TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS decharges (id INTEGER PRIMARY KEY AUTOINCREMENT, facture_id INTEGER NOT NULL, date_decharge TEXT NOT NULL DEFAULT (date('now')), signataire TEXT, observations TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS debours (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL, date_debours TEXT NOT NULL DEFAULT (date('now')), libelle TEXT NOT NULL, beneficiaire TEXT, montant REAL NOT NULL DEFAULT 0, devise TEXT NOT NULL DEFAULT 'TND', justificatif TEXT, facture_id INTEGER, notes TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS preavis_arrivee (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, dossier_id INTEGER NOT NULL, client_id INTEGER NOT NULL, date_creation TEXT NOT NULL DEFAULT (date('now')), date_arrivee_prevue TEXT, transporteur TEXT, moyen_transport TEXT, ref_transport TEXT, port_embarquement TEXT, port_dechargement TEXT, designation_march TEXT, nb_colis INTEGER, poids_brut REAL, volume REAL, statut TEXT NOT NULL DEFAULT 'en_attente', email_notif_envoye INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS compteurs (id INTEGER PRIMARY KEY AUTOINCREMENT, type_doc TEXT NOT NULL UNIQUE, annee INTEGER NOT NULL, dernier_num INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS etapes_dossier (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL, agent_id INTEGER NOT NULL, titre_etape TEXT NOT NULL, description TEXT, pieces_jointes TEXT DEFAULT '[]', statut TEXT NOT NULL DEFAULT 'en_attente', motif_rejet TEXT, valide_par INTEGER, date_declaration TEXT NOT NULL DEFAULT (datetime('now')), date_validation TEXT);
    CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, dossier_id INTEGER, etape_id INTEGER, message TEXT NOT NULL, lu INTEGER NOT NULL DEFAULT 0, date_creation TEXT NOT NULL DEFAULT (datetime('now')));
  `;

  // ── Vérification: le schéma Turso est-il complet? ────────────────────────────
  const CRITICAL_COLS = [
    { table: 'clients',         col: 'actif' },
    { table: 'factures',        col: 'client_id' },
    { table: 'devis',           col: 'client_id' },
    { table: 'etapes_dossier',  col: 'pieces_jointes' },
    { table: 'notifications',   col: 'dossier_id' },
    { table: 'dossiers',        col: 'valeur_douane' },
    { table: 'debours',         col: 'justificatif' },
    { table: 'preavis_arrivee', col: 'client_id' },
  ];

  let needsReset = false;
  for (const { table, col } of CRITICAL_COLS) {
    try {
      const cols = await all(`PRAGMA table_info(${table})`);
      if (cols.length > 0 && !cols.some(c => c.name === col)) {
        console.log(`⚠️  "${table}" manque la colonne "${col}" → reset`);
        needsReset = true;
        break;
      }
    } catch(_) {}
  }

  if (needsReset) {
    console.log('🔄 Reset complet du schéma (schéma Turso incomplet détecté)...');
    const DROP_ORDER = [
      'notifications', 'etapes_dossier', 'preavis_arrivee', 'debours',
      'decharges', 'paiements', 'facture_lignes', 'factures',
      'devis_lignes', 'devis', 'dossier_notes', 'dossier_pieces', 'dossiers',
      'clients', 'rubrique', 'secteur_activite', 'type_declaration', 'tva',
      'compteurs', 'utilisateurs',
    ];
    for (const t of DROP_ORDER) {
      try { await client.execute(`DROP TABLE IF EXISTS ${t}`); console.log(`  ✗ dropped ${t}`); } catch(_) {}
    }
    console.log('✅ Tables supprimées. Recréation...');
  }

  // ── Création / vérification des tables ───────────────────────────────────────
  const stmts = FULL_SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Executing ${stmts.length} SQL statements...`);
  for (const stmt of stmts) {
    try {
      await client.execute(stmt);
      const m = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
      if (m) console.log(`✓ Created table: ${m[1]}`);
    } catch (e) {
      console.error(`❌ SQL Error:`, stmt.substring(0, 60), e.message);
      throw e;
    }
  }

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


  // ── Migration légère : utilisateurs (CHECK constraint legacy) ─────────────────
  try {
    const tableInfo = await all("PRAGMA table_info(utilisateurs)");
    if (!tableInfo.some(c => c.name === 'client_id')) {
      await run("ALTER TABLE utilisateurs ADD COLUMN client_id INTEGER");
    }
  } catch(e) {}

  try {
    await run("INSERT INTO utilisateurs (login, mot_de_passe, nom, role) VALUES ('__test_role_check__', 'x', 'x', 'superviseur')");
    await run("DELETE FROM utilisateurs WHERE login='__test_role_check__'");
  } catch(e) {
    if (e.message && e.message.includes('CHECK constraint failed')) {
      console.log('🔄 Mise à jour du schéma utilisateurs (contrainte CHECK obsolète)...');
      await run("PRAGMA foreign_keys = OFF");
      await run("CREATE TABLE _u_bak AS SELECT id, login, mot_de_passe, nom, prenom, email, role, client_id, actif, created_at FROM utilisateurs");
      await run("DROP TABLE utilisateurs");
      await run("CREATE TABLE utilisateurs (id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL UNIQUE, mot_de_passe TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT, email TEXT, role TEXT NOT NULL DEFAULT 'agent', client_id INTEGER, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
      await run("INSERT INTO utilisateurs SELECT id, login, mot_de_passe, nom, prenom, email, role, client_id, actif, created_at FROM _u_bak");
      await run("DROP TABLE _u_bak");
      await run("PRAGMA foreign_keys = ON");
      console.log('✅ Table utilisateurs migrée.');
    }
  }

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

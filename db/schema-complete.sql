-- BCI Transit - Schéma complet de base de données
-- Basé sur la structure de l'ancien logiciel HyperFileSQL

PRAGMA foreign_keys = ON;

-- Utilisateurs
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

-- Secteurs d'activité
CREATE TABLE IF NOT EXISTS secteur_activite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL
);

-- Zones géographiques
CREATE TABLE IF NOT EXISTS zone (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL
);

-- Paramètres TVA
CREATE TABLE IF NOT EXISTS parametre_tva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  taux REAL NOT NULL DEFAULT 0,
  defaut INTEGER NOT NULL DEFAULT 0
);

-- Paramètres type de déclaration
CREATE TABLE IF NOT EXISTS parametre_type_declaration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL
);

-- Rubriques (frais/prestations)
CREATE TABLE IF NOT EXISTS rubrique (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  unite TEXT DEFAULT 'U',
  prix_unitaire REAL DEFAULT 0,
  tva_id INTEGER REFERENCES parametre_tva(id),
  actif INTEGER NOT NULL DEFAULT 1
);

-- Clients
CREATE TABLE IF NOT EXISTS client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  raison_sociale TEXT NOT NULL,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  pays TEXT DEFAULT 'Tunisie',
  telephone TEXT,
  telephone2 TEXT,
  fax TEXT,
  email TEXT,
  contact TEXT,
  nif TEXT,
  matricule_fiscal TEXT,
  secteur_id INTEGER REFERENCES secteur_activite(id),
  zone_id INTEGER REFERENCES zone(id),
  notes TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  date_creation TEXT DEFAULT (datetime('now'))
);

-- Dossiers clients
CREATE TABLE IF NOT EXISTS dossier_client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES client(id),
  date_ouverture TEXT DEFAULT (datetime('now')),
  type_declaration_id INTEGER REFERENCES parametre_type_declaration(id),
  description TEXT,
  marchandise TEXT,
  pays_origine TEXT,
  pays_destination TEXT,
  incoterm TEXT,
  navire TEXT,
  transporteur TEXT,
  statut TEXT DEFAULT 'ouvert',
  valeur_marchandise REAL DEFAULT 0,
  devise TEXT DEFAULT 'TND',
  observations TEXT,
  cree_par TEXT,
  date_cloture TEXT
);

-- En-tête Proforma
CREATE TABLE IF NOT EXISTS entete_proforma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  dossier_id INTEGER REFERENCES dossier_client(id),
  client_id INTEGER NOT NULL REFERENCES client(id),
  date_proforma TEXT DEFAULT (datetime('now')),
  validite INTEGER DEFAULT 30,
  statut TEXT DEFAULT 'brouillon',
  observations TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Détail Proforma
CREATE TABLE IF NOT EXISTS detail_proforma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proforma_id INTEGER NOT NULL REFERENCES entete_proforma(id) ON DELETE CASCADE,
  rubrique_id INTEGER REFERENCES rubrique(id),
  libelle TEXT NOT NULL,
  quantite REAL DEFAULT 1,
  prix_unitaire REAL DEFAULT 0,
  tva_taux REAL DEFAULT 0,
  montant_ht REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0
);

-- Pied Proforma (totaux)
CREATE TABLE IF NOT EXISTS pied_proforma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proforma_id INTEGER NOT NULL UNIQUE REFERENCES entete_proforma(id) ON DELETE CASCADE,
  total_ht REAL DEFAULT 0,
  total_tva REAL DEFAULT 0,
  total_ttc REAL DEFAULT 0,
  remise REAL DEFAULT 0,
  net_a_payer REAL DEFAULT 0
);

-- En-tête Devis
CREATE TABLE IF NOT EXISTS entete_devis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  dossier_id INTEGER REFERENCES dossier_client(id),
  client_id INTEGER NOT NULL REFERENCES client(id),
  date_devis TEXT DEFAULT (datetime('now')),
  validite INTEGER DEFAULT 30,
  statut TEXT DEFAULT 'brouillon',
  observations TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Détail Devis
CREATE TABLE IF NOT EXISTS detail_devis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devis_id INTEGER NOT NULL REFERENCES entete_devis(id) ON DELETE CASCADE,
  rubrique_id INTEGER REFERENCES rubrique(id),
  libelle TEXT NOT NULL,
  quantite REAL DEFAULT 1,
  prix_unitaire REAL DEFAULT 0,
  tva_taux REAL DEFAULT 0,
  montant_ht REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0
);

-- En-tête Facture
CREATE TABLE IF NOT EXISTS entete_facture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  dossier_id INTEGER REFERENCES dossier_client(id),
  client_id INTEGER NOT NULL REFERENCES client(id),
  proforma_id INTEGER REFERENCES entete_proforma(id),
  devis_id INTEGER REFERENCES entete_devis(id),
  date_facture TEXT DEFAULT (datetime('now')),
  date_echeance TEXT,
  statut TEXT DEFAULT 'brouillon',
  observations TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Détail Facture
CREATE TABLE IF NOT EXISTS detail_facture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES entete_facture(id) ON DELETE CASCADE,
  rubrique_id INTEGER REFERENCES rubrique(id),
  libelle TEXT NOT NULL,
  quantite REAL DEFAULT 1,
  prix_unitaire REAL DEFAULT 0,
  tva_taux REAL DEFAULT 0,
  montant_ht REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0
);

-- Pied Facture (totaux)
CREATE TABLE IF NOT EXISTS pied_facture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL UNIQUE REFERENCES entete_facture(id) ON DELETE CASCADE,
  total_ht REAL DEFAULT 0,
  total_tva REAL DEFAULT 0,
  total_ttc REAL DEFAULT 0,
  remise REAL DEFAULT 0,
  net_a_payer REAL DEFAULT 0
);

-- Décharge Facture
CREATE TABLE IF NOT EXISTS decharge_facture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES entete_facture(id),
  date_decharge TEXT DEFAULT (datetime('now')),
  nom_signataire TEXT,
  observations TEXT
);

-- Paiements clients
CREATE TABLE IF NOT EXISTS paiement_client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES entete_facture(id),
  client_id INTEGER NOT NULL REFERENCES client(id),
  date_paiement TEXT DEFAULT (datetime('now')),
  montant REAL NOT NULL DEFAULT 0,
  mode_paiement TEXT DEFAULT 'espèces',
  reference TEXT,
  observations TEXT
);

-- En-tête Préavis d'arrivée
CREATE TABLE IF NOT EXISTS entete_preavis_arrivee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  dossier_id INTEGER REFERENCES dossier_client(id),
  client_id INTEGER NOT NULL REFERENCES client(id),
  date_preavis TEXT DEFAULT (datetime('now')),
  date_arrivee_prevue TEXT,
  moyen_transport TEXT,
  transporteur TEXT,
  provenance TEXT,
  statut TEXT DEFAULT 'en_attente',
  observations TEXT
);

-- Détail Préavis d'arrivée
CREATE TABLE IF NOT EXISTS detail_preavis_arrivee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preavis_id INTEGER NOT NULL REFERENCES entete_preavis_arrivee(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  quantite REAL DEFAULT 1,
  unite TEXT DEFAULT 'U',
  poids REAL DEFAULT 0,
  volume REAL DEFAULT 0,
  valeur REAL DEFAULT 0,
  observations TEXT
);

-- Débours
CREATE TABLE IF NOT EXISTS debours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id INTEGER REFERENCES dossier_client(id),
  facture_id INTEGER REFERENCES entete_facture(id),
  date_debours TEXT DEFAULT (datetime('now')),
  libelle TEXT NOT NULL,
  montant REAL NOT NULL DEFAULT 0,
  beneficiaire TEXT,
  justificatif TEXT,
  observations TEXT
);

-- Journal débours
CREATE TABLE IF NOT EXISTS journal_debours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debours_id INTEGER REFERENCES debours(id),
  date_ecriture TEXT DEFAULT (datetime('now')),
  description TEXT,
  montant REAL DEFAULT 0,
  sens TEXT DEFAULT 'debit'
);

-- Notes sur dossiers
CREATE TABLE IF NOT EXISTS note_dossier (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id INTEGER NOT NULL REFERENCES dossier_client(id),
  contenu TEXT NOT NULL,
  auteur TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Compteurs (séquences de numérotation)
CREATE TABLE IF NOT EXISTS compteur (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_document TEXT NOT NULL UNIQUE,
  prefixe TEXT DEFAULT '',
  dernier_numero INTEGER DEFAULT 0,
  annee INTEGER,
  format_numero TEXT DEFAULT '{prefixe}{annee}{numero:06d}'
);

-- Paramètres système
CREATE TABLE IF NOT EXISTS parametre_systeme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cle TEXT NOT NULL UNIQUE,
  valeur TEXT,
  description TEXT,
  type TEXT DEFAULT 'text'
);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- DONNÉES INITIALES
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Utilisateur admin
INSERT OR IGNORE INTO utilisateurs (login, mot_de_passe, nom, prenom, role) 
VALUES ('admin', '$2a$10$z5XsyKcVWWB0aAJ8dQKDbeX.wW1YUnaMsJHKKYzdNU5CBNpbOx3Yu', 'Administrateur', 'BCI', 'admin');

-- Paramètres TVA
INSERT OR IGNORE INTO parametre_tva (code, libelle, taux, defaut) VALUES
  ('TVA0', 'Exonéré', 0, 0),
  ('TVA7', 'TVA 7%', 7, 0),
  ('TVA19', 'TVA 19%', 19, 1),
  ('TVA20', 'TVA 20%', 20, 0);

-- Types de déclaration
INSERT OR IGNORE INTO parametre_type_declaration (code, libelle) VALUES
  ('IMP', 'Importation'),
  ('EXP', 'Exportation'),
  ('TRA', 'Transit'),
  ('ENT', 'Entrepôt sous douane'),
  ('REE', 'Réexportation');

-- Secteurs d'activité
INSERT OR IGNORE INTO secteur_activite (code, libelle) VALUES
  ('COM', 'Commerce général'),
  ('IND', 'Industrie'),
  ('AGR', 'Agriculture & Agroalimentaire'),
  ('TEX', 'Textile & Confection'),
  ('CHI', 'Chimie & Pharmacie'),
  ('MEC', 'Mécanique & Métallurgie'),
  ('BTP', 'BTP & Matériaux'),
  ('SER', 'Services'),
  ('TRA', 'Transport & Logistique'),
  ('INF', 'Informatique & Télécoms');

-- Zones géographiques
INSERT OR IGNORE INTO zone (code, libelle) VALUES
  ('TUN', 'Grand Tunis'),
  ('SFA', 'Sfax'),
  ('SOU', 'Sousse'),
  ('BIZ', 'Bizerte'),
  ('GAB', 'Gabès'),
  ('KAS', 'Kairouan'),
  ('MAH', 'Mahdia'),
  ('MED', 'Médenine'),
  ('MON', 'Monastir'),
  ('NAB', 'Nabeul'),
  ('SID', 'Sidi Bouzid'),
  ('TAT', 'Tataouine'),
  ('TOZ', 'Tozeur'),
  ('ZAG', 'Zaghouan');

-- Rubriques de base
INSERT OR IGNORE INTO rubrique (code, libelle, unite, prix_unitaire, tva_id) VALUES
  ('DDOU', 'Déclaration en douane', 'U', 100, 2),
  ('FRET', 'Transport maritime/aérien', 'Conteneur', 500, 2),
  ('MANU', 'Manutention portuaire', 'Tonne', 25, 2),
  ('MAGR', 'Magasinage', 'Jour', 15, 2),
  ('TRAN', 'Transport routier', 'Km', 2, 2),
  ('DEDA', 'Dédouanement', 'U', 150, 2),
  ('FOUR', 'Fournitures diverses', 'U', 50, 2),
  ('VISA', 'Visa technique', 'U', 75, 2),
  ('SCAN', 'Scanner conteneur', 'U', 80, 2),
  ('PEST', 'Contrôle phytosanitaire', 'U', 120, 2);

-- Compteurs initiaux
INSERT OR IGNORE INTO compteur (type_document, prefixe, dernier_numero, annee, format_numero) VALUES
  ('PROFORMA', 'PRO', 0, 2026, 'PRO{annee}{numero:06d}'),
  ('DEVIS', 'DEV', 0, 2026, 'DEV{annee}{numero:06d}'),
  ('FACTURE', 'FAC', 0, 2026, 'FAC{annee}{numero:06d}'),
  ('DOSSIER', 'DOS', 0, 2026, '{annee}{type}{numero:05d}'),
  ('PREAVIS', 'PRE', 0, 2026, 'PRE{annee}{numero:05d}');

-- Paramètres système
INSERT OR IGNORE INTO parametre_systeme (cle, valeur, description, type) VALUES
  ('entreprise_nom', 'BCI Transit', 'Nom de l\'entreprise', 'text'),
  ('entreprise_adresse', 'Avenue Habib Bourguiba, Tunis', 'Adresse de l\'entreprise', 'text'),
  ('entreprise_telephone', '+216 71 123 456', 'Téléphone de l\'entreprise', 'text'),
  ('entreprise_email', 'contact@bci-transit.tn', 'Email de l\'entreprise', 'email'),
  ('entreprise_nif', '1234567/A/M/000', 'NIF de l\'entreprise', 'text'),
  ('devise_principale', 'TND', 'Devise principale', 'text'),
  ('tva_defaut', '19', 'Taux TVA par défaut (%)', 'number'),
  ('validite_devis', '30', 'Validité des devis (jours)', 'number'),
  ('echeance_facture', '30', 'Échéance des factures (jours)', 'number');

-- Vues pour faciliter les requêtes
CREATE VIEW IF NOT EXISTS v_clients_complet AS
SELECT 
  c.*,
  s.libelle as secteur_libelle,
  z.libelle as zone_libelle,
  COUNT(DISTINCT d.id) as nb_dossiers,
  COUNT(DISTINCT f.id) as nb_factures,
  COALESCE(SUM(pf.net_a_payer), 0) as ca_total
FROM client c
LEFT JOIN secteur_activite s ON c.secteur_id = s.id
LEFT JOIN zone z ON c.zone_id = z.id
LEFT JOIN dossier_client d ON c.id = d.client_id
LEFT JOIN entete_facture f ON c.id = f.client_id
LEFT JOIN pied_facture pf ON f.id = pf.facture_id
WHERE c.actif = 1
GROUP BY c.id;

CREATE VIEW IF NOT EXISTS v_dossiers_complet AS
SELECT 
  d.*,
  c.raison_sociale,
  c.code as client_code,
  t.libelle as type_libelle,
  t.code as type_code,
  COUNT(DISTINCT f.id) as nb_factures,
  COUNT(DISTINCT deb.id) as nb_debours,
  COALESCE(SUM(pf.net_a_payer), 0) as ca_dossier
FROM dossier_client d
LEFT JOIN client c ON d.client_id = c.id
LEFT JOIN parametre_type_declaration t ON d.type_declaration_id = t.id
LEFT JOIN entete_facture f ON d.id = f.dossier_id
LEFT JOIN pied_facture pf ON f.id = pf.facture_id
LEFT JOIN debours deb ON d.id = deb.dossier_id
GROUP BY d.id;

CREATE VIEW IF NOT EXISTS v_factures_complet AS
SELECT 
  f.*,
  c.raison_sociale,
  c.code as client_code,
  d.numero as dossier_numero,
  pf.total_ht,
  pf.total_tva,
  pf.total_ttc,
  pf.net_a_payer,
  COALESCE(SUM(p.montant), 0) as total_paye,
  (pf.net_a_payer - COALESCE(SUM(p.montant), 0)) as solde_du
FROM entete_facture f
LEFT JOIN client c ON f.client_id = c.id
LEFT JOIN dossier_client d ON f.dossier_id = d.id
LEFT JOIN pied_facture pf ON f.id = pf.facture_id
LEFT JOIN paiement_client p ON f.id = p.facture_id
GROUP BY f.id;

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_client_code ON client(code);
CREATE INDEX IF NOT EXISTS idx_client_secteur ON client(secteur_id);
CREATE INDEX IF NOT EXISTS idx_dossier_client ON dossier_client(client_id);
CREATE INDEX IF NOT EXISTS idx_dossier_type ON dossier_client(type_declaration_id);
CREATE INDEX IF NOT EXISTS idx_facture_client ON entete_facture(client_id);
CREATE INDEX IF NOT EXISTS idx_facture_dossier ON entete_facture(dossier_id);
CREATE INDEX IF NOT EXISTS idx_facture_date ON entete_facture(date_facture);
CREATE INDEX IF NOT EXISTS idx_paiement_facture ON paiement_client(facture_id);
CREATE INDEX IF NOT EXISTS idx_debours_dossier ON debours(dossier_id);
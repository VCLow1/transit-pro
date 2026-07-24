PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Utilisateurs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utilisateurs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  login       TEXT    NOT NULL UNIQUE,
  mot_de_passe TEXT   NOT NULL,
  nom         TEXT    NOT NULL,
  prenom      TEXT,
  email       TEXT,
  role        TEXT    NOT NULL DEFAULT 'agent' CHECK(role IN ('admin','agent')),
  actif       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Paramètres ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tva (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  libelle TEXT    NOT NULL,
  taux    REAL    NOT NULL DEFAULT 0,
  defaut  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS secteur_activite (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT    NOT NULL UNIQUE,
  libelle TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS type_declaration (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT    NOT NULL UNIQUE,  -- I, E, T
  libelle TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS rubrique (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  libelle       TEXT    NOT NULL,
  prix_defaut   REAL    NOT NULL DEFAULT 0,
  tva_id        INTEGER REFERENCES tva(id)
);

-- ─── Clients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,
  raison_sociale  TEXT    NOT NULL,
  secteur_id      INTEGER REFERENCES secteur_activite(id),
  adresse         TEXT,
  ville           TEXT,
  code_postal     TEXT,
  pays            TEXT    NOT NULL DEFAULT 'Tunisie',
  telephone       TEXT,
  fax             TEXT,
  email           TEXT,
  contact         TEXT,
  nif             TEXT,
  tva_num         TEXT,
  notes           TEXT,
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Dossiers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dossiers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  reference           TEXT    NOT NULL UNIQUE,   -- ex: 2026I00130
  client_id           INTEGER NOT NULL REFERENCES clients(id),
  type_decl_id        INTEGER NOT NULL REFERENCES type_declaration(id),
  statut              TEXT    NOT NULL DEFAULT 'ouvert'
                              CHECK(statut IN ('ouvert','en_cours','cloture')),
  description         TEXT,
  marchandise         TEXT,   -- désignation marchandise
  pays_origine        TEXT,
  pays_destination    TEXT,
  valeur_douane       REAL    DEFAULT 0,
  devise              TEXT    DEFAULT 'TND',
  incoterm            TEXT,
  observations        TEXT,
  created_by          INTEGER REFERENCES utilisateurs(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dossier_pieces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  nom_fichier TEXT    NOT NULL,
  chemin      TEXT    NOT NULL,
  type_mime   TEXT,
  taille      INTEGER,
  uploaded_by INTEGER REFERENCES utilisateurs(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dossier_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  contenu     TEXT    NOT NULL,
  auteur_id   INTEGER REFERENCES utilisateurs(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Devis ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devis (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT    NOT NULL UNIQUE,
  dossier_id      INTEGER REFERENCES dossiers(id),
  client_id       INTEGER NOT NULL REFERENCES clients(id),
  date_devis      TEXT    NOT NULL DEFAULT (date('now')),
  date_validite   TEXT,
  statut          TEXT    NOT NULL DEFAULT 'brouillon'
                          CHECK(statut IN ('brouillon','envoye','accepte','refuse','expire','facture')),
  objet           TEXT,
  conditions      TEXT,
  notes           TEXT,
  remise_globale  REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES utilisateurs(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devis_lignes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  devis_id      INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  rubrique_id   INTEGER REFERENCES rubrique(id),
  designation   TEXT    NOT NULL,
  quantite      REAL    NOT NULL DEFAULT 1,
  prix_unitaire REAL    NOT NULL DEFAULT 0,
  tva_id        INTEGER REFERENCES tva(id),
  ordre         INTEGER NOT NULL DEFAULT 0
);

-- ─── Factures ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT    NOT NULL UNIQUE,
  dossier_id      INTEGER REFERENCES dossiers(id),
  client_id       INTEGER NOT NULL REFERENCES clients(id),
  devis_id        INTEGER REFERENCES devis(id),
  date_facture    TEXT    NOT NULL DEFAULT (date('now')),
  date_echeance   TEXT,
  statut          TEXT    NOT NULL DEFAULT 'brouillon'
                          CHECK(statut IN ('brouillon','emise','payee','partielle','annulee')),
  objet           TEXT,
  conditions      TEXT,
  notes           TEXT,
  remise_globale  REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES utilisateurs(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS facture_lignes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id    INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  rubrique_id   INTEGER REFERENCES rubrique(id),
  designation   TEXT    NOT NULL,
  quantite      REAL    NOT NULL DEFAULT 1,
  prix_unitaire REAL    NOT NULL DEFAULT 0,
  tva_id        INTEGER REFERENCES tva(id),
  ordre         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paiements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id      INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  date_paiement   TEXT    NOT NULL DEFAULT (date('now')),
  montant         REAL    NOT NULL,
  mode            TEXT    NOT NULL DEFAULT 'virement'
                          CHECK(mode IN ('especes','cheque','virement','traite','autre')),
  reference       TEXT,
  notes           TEXT,
  created_by      INTEGER REFERENCES utilisateurs(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decharges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id      INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  date_decharge   TEXT    NOT NULL DEFAULT (date('now')),
  signataire      TEXT,
  observations    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Débours ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debours (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id      INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  date_debours    TEXT    NOT NULL DEFAULT (date('now')),
  libelle         TEXT    NOT NULL,
  beneficiaire    TEXT,
  montant         REAL    NOT NULL DEFAULT 0,
  devise          TEXT    NOT NULL DEFAULT 'TND',
  justificatif    TEXT,   -- chemin fichier
  facture_id      INTEGER REFERENCES factures(id),  -- si refacturé
  notes           TEXT,
  created_by      INTEGER REFERENCES utilisateurs(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Préavis d'arrivée ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preavis_arrivee (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  reference           TEXT    NOT NULL UNIQUE,
  dossier_id          INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  client_id           INTEGER NOT NULL REFERENCES clients(id),
  date_creation       TEXT    NOT NULL DEFAULT (date('now')),
  date_arrivee_prevue TEXT,
  transporteur        TEXT,
  moyen_transport     TEXT    CHECK(moyen_transport IN ('maritime','aerien','routier','ferroviaire')),
  ref_transport       TEXT,   -- N° BL, LTA, CMR...
  port_embarquement   TEXT,
  port_dechargement   TEXT,
  designation_march   TEXT,
  nb_colis            INTEGER,
  poids_brut          REAL,
  volume              REAL,
  statut              TEXT    NOT NULL DEFAULT 'en_attente'
                              CHECK(statut IN ('en_attente','arrive','traite')),
  email_notif_envoye  INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by          INTEGER REFERENCES utilisateurs(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Compteurs de numérotation ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compteurs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type_doc      TEXT    NOT NULL UNIQUE,  -- DOSSIER_I, DOSSIER_E, DEVIS, FACTURE, PREAVIS
  annee         INTEGER NOT NULL,
  dernier_num   INTEGER NOT NULL DEFAULT 0
);

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dossiers_client   ON dossiers(client_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_statut   ON dossiers(statut);
CREATE INDEX IF NOT EXISTS idx_factures_client   ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut   ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_debours_dossier   ON debours(dossier_id);
CREATE INDEX IF NOT EXISTS idx_preavis_dossier   ON preavis_arrivee(dossier_id);

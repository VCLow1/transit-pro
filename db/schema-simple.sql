-- Schema minimal pour Turso
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

CREATE TABLE IF NOT EXISTS tva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  libelle TEXT NOT NULL,
  taux REAL NOT NULL DEFAULT 0,
  defaut INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  raison_sociale TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
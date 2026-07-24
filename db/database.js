const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Use /data disk on Render/Railway, fallback to local for dev
const DB_PATH = process.env.NODE_ENV === 'production'
  ? path.join('/data', 'transit.db')
  : path.join(__dirname, 'transit.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new sqlite3.Database(DB_PATH);
    _db.run('PRAGMA journal_mode = WAL');
    _db.run('PRAGMA foreign_keys = ON');
  }
  return _db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function initDb() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // Split on semicolons but keep content
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    try { await run(stmt); } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
        // Silently skip known-safe errors
      }
    }
  }
}

// Generate next document number
async function nextNum(typeDoc, annee) {
  const yr = annee || new Date().getFullYear();
  let row = await get('SELECT * FROM compteurs WHERE type_doc = ? AND annee = ?', [typeDoc, yr]);
  if (!row) {
    await run('INSERT INTO compteurs (type_doc, annee, dernier_num) VALUES (?,?,0)', [typeDoc, yr]);
    row = { dernier_num: 0 };
  }
  const next = row.dernier_num + 1;
  await run('UPDATE compteurs SET dernier_num = ? WHERE type_doc = ? AND annee = ?', [next, typeDoc, yr]);
  return next;
}

// Format: 2026I00130
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

module.exports = { getDb, run, get, all, initDb, genRefDossier, genNumDevis, genNumFacture, genRefPreavis };

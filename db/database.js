const { createClient } = require('@libsql/client');

// Turso en prod, SQLite local en dev
const client = createClient(
  process.env.TURSO_DATABASE_URL
    ? {
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: 'file:' + require('path').join(__dirname, 'transit.db'),
      }
);

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
    // Convert BigInt to number
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  });
  return obj;
}

async function initDb() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Execute each statement individually
  const stmts = schema
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of stmts) {
    try {
      await client.execute(stmt);
    } catch (e) {
      if (
        !e.message.includes('already exists') &&
        !e.message.includes('duplicate')
      ) {
        // ignore safe schema errors
      }
    }
  }
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

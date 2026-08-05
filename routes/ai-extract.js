/**
 * AI PDF Extraction Route — Compatible Vercel Serverless
 * POST /api/ai/extract-pdf  (multipart/form-data)
 */

const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// ── Extraction de texte PDF ───────────────────────────────────────────────────

async function extractTextFromPdf(buffer) {
  // Méthode 1 : pdf-parse PDFParse.getText
  try {
    const pdfMod = require('pdf-parse');
    if (pdfMod && pdfMod.PDFParse) {
      const parser = new pdfMod.PDFParse({ verbosity: 0, data: buffer });
      const result = await parser.getText({});
      if (result && result.text && result.text.trim().length > 10) {
        return result.text.slice(0, 6000);
      }
    }
  } catch (e) {
    console.log('pdf-parse failed, using fallback:', e.message);
  }

  // Méthode 2 : extraction brute des blocs texte PDF (BT/ET)
  const raw = buffer.toString('latin1');
  const strings = [];

  const btBlocks = raw.match(/BT[\s\S]{0,2000}?ET/g) || [];
  for (const block of btBlocks) {
    const matches = block.match(/\(([^)\\]{1,100}(?:\\.[^)\\]{0,100})*)\)\s*Tj/g) || [];
    for (const m of matches) {
      const str = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')
        .replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')').trim();
      if (str.length > 1) strings.push(str);
    }
  }

  if (strings.length < 5) {
    const allStr = raw.match(/\(([^\x00-\x1f\x7f-\x9f()\\]{3,80})\)/g) || [];
    for (const s of allStr) {
      const clean = s.slice(1, -1).trim();
      if (clean.length > 3 && /[a-zA-ZÀ-ÿ0-9]/.test(clean)) strings.push(clean);
    }
  }

  return strings.join('\n').replace(/\s{3,}/g, '\n').trim().slice(0, 6000);
}

// ── Parser multipart sans multer (compatible Vercel) ─────────────────────────

function parseMultipartBuffer(req) {
  return new Promise((resolve, reject) => {
    // Si le body est déjà un Buffer (Vercel le pré-parse parfois)
    if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      return resolve({ fileBuffer: req.body, type: req.headers['x-doc-type'] || 'dossier' });
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);

      if (!boundaryMatch) {
        return reject(new Error('No multipart boundary found'));
      }

      const boundary = '--' + boundaryMatch[1];
      const boundaryBuf = Buffer.from(boundary);
      const parts = splitBuffer(raw, boundaryBuf);

      let fileBuffer = null;
      let docType = 'dossier';

      for (const part of parts) {
        if (part.length < 10) continue;
        const headerEnd = indexOfSequence(part, Buffer.from('\r\n\r\n'));
        if (headerEnd === -1) continue;

        const headerStr = part.slice(0, headerEnd).toString('utf8');
        const body = part.slice(headerEnd + 4);
        // Remove trailing \r\n
        const bodyClean = body.slice(0, body.length - (body.slice(-2).toString() === '\r\n' ? 2 : 0));

        if (headerStr.includes('name="type"')) {
          docType = bodyClean.toString('utf8').trim();
        } else if (headerStr.includes('name="pdf"') || headerStr.includes('filename=')) {
          fileBuffer = bodyClean;
        }
      }

      if (!fileBuffer) return reject(new Error('Aucun fichier PDF trouvé dans la requête'));
      resolve({ fileBuffer, type: docType });
    });
    req.on('error', reject);
  });
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  let pos = 0;
  while (pos <= buf.length - delimiter.length) {
    if (buf.slice(pos, pos + delimiter.length).equals(delimiter)) {
      parts.push(buf.slice(start, pos));
      start = pos + delimiter.length;
      pos = start;
    } else {
      pos++;
    }
  }
  parts.push(buf.slice(start));
  return parts.filter(p => p.length > 2);
}

function indexOfSequence(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    if (buf.slice(i, i + seq.length).equals(seq)) return i;
  }
  return -1;
}

// ── Prompts IA ────────────────────────────────────────────────────────────────

const PROMPTS = {
  client: `Analyse ce document et extrais les informations du CLIENT. Retourne UNIQUEMENT un JSON valide :
{
  "code": "code client",
  "raison_sociale": "nom entreprise",
  "adresse": "adresse",
  "ville": "ville",
  "code_postal": "code postal",
  "pays": "pays",
  "telephone": "téléphone",
  "email": "email",
  "contact": "nom contact",
  "nif": "numéro fiscal",
  "matricule_fiscal": "matricule fiscal",
  "secteur_lib": "secteur activité",
  "notes": "infos supplémentaires"
}`,

  dossier: `Analyse ce document de transit (BL, connaissement, facture commerciale, DAU). Retourne UNIQUEMENT un JSON valide :
{
  "description": "description générale",
  "marchandise": "nature/désignation marchandise",
  "pays_origine": "pays d'origine",
  "pays_destination": "pays destination",
  "incoterm": "incoterm (FOB, CIF, etc.)",
  "navire": "nom navire ou vol",
  "transporteur": "compagnie transport",
  "type_transport": "maritime|aerien|routier|ferroviaire",
  "type_declaration": "IMP|EXP|TRA",
  "client_nom": "nom importateur/exportateur",
  "valeur_marchandise": "valeur numérique",
  "devise": "TND|EUR|USD",
  "observations": "remarques et références"
}`,

  debours: `Analyse cette facture/reçu. Retourne UNIQUEMENT un JSON valide :
{
  "libelle": "intitulé du débours",
  "montant": "montant numérique",
  "devise": "TND|EUR|USD",
  "beneficiaire": "nom bénéficiaire",
  "date_debours": "date YYYY-MM-DD",
  "ref_dossier": "référence dossier si visible",
  "justificatif": "numéro facture/reçu",
  "observations": "infos supplémentaires"
}`
};

// ── Extraction intelligente sans IA ──────────────────────────────────────────

function extractWithRegex(text, type) {
  // ── Helpers génériques ────────────────────────────────────────────────
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const T = text; // alias court

  // Cherche la valeur après un label
  function after(patterns, maxLen = 80) {
    for (const pat of patterns) {
      const re = new RegExp(String(pat) + '[\\s:=\\-–|]+([^\\n\\r]{2,' + maxLen + '})', 'i');
      const m = T.match(re);
      if (m) return m[1].trim().split(/\s{3,}/)[0].trim();
    }
    return null;
  }

  // Cherche sur la ligne suivant un label
  function nextLine(patterns) {
    for (const pat of patterns) {
      const re = new RegExp(String(pat) + '[\\s:=\\-–|]*\\r?\\n([^\\n\\r]{2,80})', 'i');
      const m = T.match(re);
      if (m) return m[1].trim();
    }
    return null;
  }

  // Email
  const email = T.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,6}/)?.[0] || null;

  // Téléphone — formats TN/international
  const tel = T.match(
    /(?:(?:Tél|Tel|Phone|GSM|Mob|Fax|Téléphone)\s*[:\-.]?\s*)?(\+?(?:216|33|212|34|39)[\s.-]?\d[\d\s.-]{6,14}|\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b)/i
  )?.[1]?.replace(/\s/g, '') || null;

  // Montant — cherche en TND/DT/EUR/USD
  const montantMatch = T.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[,]\d{1,3})?)\s*(?:TND|DT|EUR|USD|€|\$)/i)
    || T.match(/(?:Montant|Amount|Total|Net)\s*[:\-=]?\s*(\d[\d\s.,]*)/i);
  const montant = montantMatch?.[1]?.replace(/[\s]/g, '').replace(',', '.') || null;

  // Date — plusieurs formats
  const dateMatch = T.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/)?.[1]
    || T.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/)?.[1]?.split(/[-\/]/).reverse().join('-')
    || T.match(/(\d{1,2})\s+(?:jan|fév|mar|avr|mai|jun|jul|aoû|sep|oct|nov|déc)[a-z]*\s+(\d{4})/i)?.[0] || null;
  const dateStr = dateMatch ? normalizeDate(dateMatch) : null;

  // NIF / Matricule fiscal
  const nif = after(['NIF', 'N\\.I\\.F', 'Numéro fiscal', 'N° fiscal'], 30)
    || T.match(/\b\d{7}[A-Z]\/[A-Z]\/[A-Z]\/\d{3}\b/)?.[0]
    || T.match(/\b\d{6,10}[A-Z]?\b/)?.[0] || null;

  const mf = after(['Matricule fiscal', 'MF', 'Mat\\.? fiscal', 'Identifiant fiscal'], 30) || null;

  // Pays
  const pays_list = ['Tunisie','France','Maroc','Algérie','Espagne','Italie','Allemagne','Chine','Turquie','Inde','USA','Belgique','Sénégal','Libye','Égypte'];
  function findPays(hint) {
    const v = after(hint, 40);
    if (v) return v;
    return pays_list.find(p => new RegExp('\\b' + p + '\\b','i').test(T)) || null;
  }

  // ── EXTRACTION PAR TYPE ───────────────────────────────────────────────

  if (type === 'client') {
    // Raison sociale — ligne avec SARL/SA/SAS/SUARL/Ent ou ligne en majuscules
    const raison = after(['Raison sociale','Dénomination','Société','Company','Entreprise','Client'])
      || lines.find(l => /\b(SARL|SA|SAS|SUARL|EURL|Cie|Corp|Ltd|LLC)\b/i.test(l) && l.length < 80)
      || lines.find(l => l.length > 5 && l.length < 60 && /^[A-ZÀÉÈÊËÎÏÔÙÛÇ][A-ZÀ-Ÿa-zà-ÿ\s&.,'-]{4,}$/.test(l))
      || null;

    // Adresse
    const adresse = after(['Adresse','Address','Siège social','Siège'], 100)
      || nextLine(['Adresse','Siège'])
      || lines.find(l => /\b(rue|avenue|bd|boulevard|route|cité|lot|zone|impasse|place)\b/i.test(l) && l.length < 100)
      || null;

    // Ville
    const ville = after(['Ville','City','Localité'])
      || T.match(/\b(\d{4,5})\s+([A-ZÀÉÈÊËÎÏÔÙÛÇ][a-zàéèêëîïôùûç\s-]{3,30})/)?.[2]?.trim()
      || lines.find(l => /^(Tunis|Sfax|Sousse|Bizerte|Nabeul|Monastir|Gabès|Gafsa|Kairouan|Ariana|Ben Arous|Manouba)/i.test(l))
      || null;

    const code_postal = T.match(/\b(\d{4})\b/)?.[1] || null;

    const contact = after(['Contact','Responsable','Gérant','Directeur','Représentant','Interlocuteur'], 50)
      || null;

    const code = after(['Code client','N° client','Réf client','Référence client'], 20) || null;

    const secteur = after(['Secteur','Activité','Domaine','Secteur d\'activité'], 50) || null;

    const notes_parts = [];
    ['RC', 'Registre du commerce', 'R\\.C\\.'].forEach(p => {
      const v = after([p], 30);
      if (v) notes_parts.push('RC: ' + v);
    });

    return {
      code,
      raison_sociale: raison,
      adresse,
      ville,
      code_postal,
      pays: findPays(['Pays','Country']) || 'Tunisie',
      telephone: tel,
      email,
      contact,
      nif,
      matricule_fiscal: mf,
      secteur_lib: secteur,
      notes: notes_parts.length ? notes_parts.join(' | ') : null
    };
  }

  if (type === 'dossier') {
    // Marchandise
    const marchandise = after([
      'Désignation', 'Description des marchandises', 'Nature de la marchandise',
      'Marchandise', 'Goods', 'Commodity', 'Description', 'Libellé'
    ], 120)
    || nextLine(['Désignation', 'Description'])
    || null;

    // Pays
    const pays_origine = after([
      'Pays d\'origine', 'Pays origine', 'Country of origin', 'Origine',
      'Port de chargement', 'Port of loading', 'Provenance'
    ], 50) || findPays(['Origine']);

    const pays_destination = after([
      'Pays de destination', 'Country of destination', 'Destination',
      'Port de déchargement', 'Port of discharge', 'Port destinataire'
    ], 50) || null;

    // Incoterm
    const incoterm = T.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DDU|DAT|DAF)\b/i)?.[1]?.toUpperCase() || null;

    // Navire / transporteur
    const navire = after(['Navire', 'Vessel', 'Ship', 'M/V', 'Vol', 'Flight', 'Numéro vol', 'Flight No'], 50)
      || T.match(/(?:M\/V|S\/S|MV)\s+([\w\s-]{3,40})/i)?.[1]?.trim()
      || null;

    const transporteur = after([
      'Transporteur', 'Carrier', 'Compagnie', 'Shipping line', 'Armateur',
      'Compagnie aérienne', 'Airline', 'Transitaire'
    ], 60) || null;

    // Type transport
    const type_transport =
      /a[eé]rien|flight|cargo|airway|AWB|LTA|avion/i.test(T) ? 'aerien' :
      /routier|truck|TIR|CMR|camion|road/i.test(T) ? 'routier' :
      /ferroviaire|rail|wagon|SNCF/i.test(T) ? 'ferroviaire' : 'maritime';

    // Type déclaration
    const type_declaration =
      /export|expéditi/i.test(T) ? 'EXP' :
      /transit/i.test(T) ? 'TRA' : 'IMP';

    // Client / importateur
    const client_nom = after([
      'Importateur', 'Exportateur', 'Expéditeur', 'Destinataire', 'Consignee',
      'Shipper', 'Notify party', 'Notify', 'Client', 'Donneur d\'ordre'
    ], 60) || null;

    // Valeur
    const valeur = after(['Valeur', 'Value', 'Valeur en douane', 'Valeur facturée', 'Invoice value'], 30)
      || montant || null;

    const devise = T.match(/\b(TND|DT|EUR|USD|GBP|JPY|CHF|MAD|DZD)\b/)?.[1] || 'TND';

    // Références
    const refs = [];
    ['N° BL', 'Bill of Lading', 'B/L No', 'AWB', 'LTA', 'CMR', 'Réf'].forEach(p => {
      const v = after([p], 40);
      if (v) refs.push(p.replace(/[/\\]/g, '') + ': ' + v);
    });

    return {
      description: after(['Objet', 'Description générale', 'Nature opération'], 100) || marchandise?.slice(0, 80) || null,
      marchandise,
      pays_origine,
      pays_destination,
      incoterm,
      navire,
      transporteur,
      type_transport,
      type_declaration,
      client_nom,
      valeur_marchandise: valeur,
      devise,
      observations: refs.length ? refs.join(' | ') : null
    };
  }

  if (type === 'debours') {
    const libelle = after([
      'Objet', 'Libellé', 'Désignation', 'Prestation', 'Nature', 'Pour', 'Motif'
    ], 100)
    || lines.find(l => l.length > 5 && l.length < 80 && !/\d{6,}/.test(l))
    || null;

    const beneficiaire = after([
      'Bénéficiaire', 'Fournisseur', 'Prestataire', 'Payé à', 'À l\'ordre de',
      'Émetteur', 'Société', 'Vendeur', 'Destinataire'
    ], 60)
    || lines.find(l => /\b(SARL|SA|SAS|SUARL|ADII|STAM|SNTRI|Port|Douane)\b/i.test(l) && l.length < 60)
    || null;

    const ref_dossier = T.match(/\b(\d{4}[IET]\d{5})\b/)?.[1]
      || after(['Dossier', 'Réf dossier', 'N° dossier', 'Référence'], 20)
      || null;

    const justificatif = after([
      'N° facture', 'Facture N°', 'Référence facture', 'N° reçu', 'Reçu N°',
      'Invoice No', 'Receipt No', 'N°'
    ], 30) || null;

    return {
      libelle,
      montant,
      devise: T.match(/\b(TND|DT|EUR|USD)\b/)?.[1] || 'TND',
      beneficiaire,
      date_debours: dateStr,
      ref_dossier,
      justificatif,
      observations: after(['Observations', 'Remarques', 'Notes', 'Commentaires'], 100) || null
    };
  }

  return {};
}

function normalizeDate(d) {
  if (!d) return null;
  // YYYY-MM-DD déjà bon
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

// ── Route principale ──────────────────────────────────────────────────────────

// Route de prévisualisation — voir le texte brut extrait du PDF
router.post('/preview-pdf', async (req, res) => {
  try {
    let fileBuffer;
    try {
      ({ fileBuffer } = await parseMultipartBuffer(req));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (!fileBuffer || fileBuffer.length < 100) {
      return res.status(400).json({ error: 'Fichier PDF invalide' });
    }
    const header = fileBuffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      return res.status(422).json({ error: 'Pas un PDF valide' });
    }
    const text = await extractTextFromPdf(fileBuffer);
    res.json({
      length: text.length,
      lines: text.split('\n').filter(l => l.trim()).length,
      preview_full: text.slice(0, 3000),
      has_openai: !!process.env.OPENAI_API_KEY
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/extract-pdf', async (req, res) => {
  try {
    // Parser le multipart manuellement
    let fileBuffer, type;
    try {
      ({ fileBuffer, type } = await parseMultipartBuffer(req));
    } catch (parseErr) {
      return res.status(400).json({ error: 'Erreur lecture fichier: ' + parseErr.message });
    }

    if (!fileBuffer || fileBuffer.length < 100) {
      return res.status(400).json({ error: 'Fichier PDF invalide ou vide' });
    }

    if (!PROMPTS[type]) {
      type = 'dossier'; // fallback
    }

    // Vérifier que c'est bien un PDF (commence par %PDF)
    const header = fileBuffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      return res.status(422).json({ error: 'Le fichier n\'est pas un PDF valide' });
    }

    // Extraire le texte
    let pdfText = '';
    try {
      pdfText = await extractTextFromPdf(fileBuffer);
    } catch (e) {
      pdfText = '';
    }

    if (!pdfText || pdfText.trim().length < 10) {
      return res.status(422).json({
        error: 'Le PDF ne contient pas de texte lisible (PDF scanné ou image)'
      });
    }

    // Essayer OpenAI si clé disponible
    const apiKey = process.env.OPENAI_API_KEY;
    let extracted = null;
    let method = 'regex';

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: PROMPTS[type]
            },
            {
              role: 'user',
              content: 'Voici le texte du document :\n\n' + pdfText.slice(0, 4000)
            }
          ],
          temperature: 0.1,
          max_tokens: 600
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        extracted = JSON.parse(jsonStr);
        method = 'ai';
      } catch (aiErr) {
        console.log('OpenAI error, using regex fallback:', aiErr.message);
        extracted = extractWithRegex(pdfText, type);
      }
    } else {
      extracted = extractWithRegex(pdfText, type);
    }

    // Nettoyer les valeurs nulles/vides
    const cleaned = {};
    for (const [k, v] of Object.entries(extracted || {})) {
      if (v !== null && v !== undefined && v !== '' && v !== 'null' && v !== 'undefined') {
        cleaned[k] = String(v).trim();
      }
    }

    res.json({
      success: true,
      method,
      type,
      data: cleaned,
      fields_count: Object.keys(cleaned).length,
      preview: pdfText.slice(0, 200)
    });

  } catch (error) {
    console.error('AI Extract error:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Erreur multer (au cas où)
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

module.exports = router;

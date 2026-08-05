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

// ── Fallback regex (sans OpenAI) ──────────────────────────────────────────────

function extractWithRegex(text, type) {
  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || null;
  const tel = text.match(/(?:\+?[\d\s.-]{8,15})/)?.[0]?.replace(/\s/g, '') || null;
  const montant = text.match(/(\d[\d\s,.]*)\s*(?:TND|DT|EUR|USD)/i)?.[1]?.replace(/[\s,]/g, '') || null;
  const date = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/)?.[1] || null;
  const nif = text.match(/(?:NIF|N\.I\.F)\s*[:\-=]?\s*([\w/]+)/i)?.[1] || null;

  if (type === 'client') {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 4);
    return {
      raison_sociale: lines.find(l => /[A-Z]{3,}/.test(l) && l.length < 60) || null,
      telephone: tel,
      email,
      nif,
      ville: text.match(/(?:Ville|City)\s*[:\-]?\s*([\w\s]+)/i)?.[1]?.trim() || null,
      adresse: null,
      code: null,
      pays: 'Tunisie',
      notes: null
    };
  }

  if (type === 'dossier') {
    return {
      marchandise: text.match(/(?:marchandise|goods|nature|désignation)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || null,
      pays_origine: text.match(/(?:origine|origin|provenance)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || null,
      pays_destination: text.match(/(?:destination|destinataire)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || null,
      incoterm: text.match(/\b(EXW|FOB|CIF|CFR|DAP|DDP|FCA|CPT|CIP|DAT)\b/i)?.[1] || null,
      navire: text.match(/(?:navire|vessel|ship|vol|flight)\s*[:\-]\s*([\w\s-]+)/i)?.[1]?.trim() || null,
      transporteur: text.match(/(?:transporteur|carrier|compagnie)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || null,
      type_transport: /a[eé]rien|flight|cargo/i.test(text) ? 'aerien' :
                      /routier|truck|camion/i.test(text) ? 'routier' : 'maritime',
      type_declaration: /export/i.test(text) ? 'EXP' : /transit/i.test(text) ? 'TRA' : 'IMP',
      valeur_marchandise: montant,
      devise: text.match(/\b(TND|DT|EUR|USD)\b/)?.[1] || 'TND',
      description: null,
      client_nom: null,
      observations: null
    };
  }

  if (type === 'debours') {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    return {
      libelle: lines[0]?.slice(0, 80) || null,
      montant,
      devise: text.match(/\b(TND|DT|EUR|USD)\b/)?.[1] || 'TND',
      beneficiaire: lines[1]?.slice(0, 50) || null,
      date_debours: date,
      ref_dossier: text.match(/\b(\d{4}[IET]\d{5})\b/)?.[1] || null,
      justificatif: text.match(/(?:facture|reçu|N°|invoice)\s*[:\-#°]?\s*([\w-]+)/i)?.[1] || null,
      observations: null
    };
  }
  return {};
}

// ── Route principale ──────────────────────────────────────────────────────────

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

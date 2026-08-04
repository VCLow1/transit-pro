/**
 * AI PDF Extraction Route
 * POST /api/ai/extract-pdf
 * 
 * Reçoit un PDF, extrait le texte avec pdf-parse,
 * envoie à OpenAI GPT-4o pour en extraire les données structurées
 * selon le type de document (client, dossier, debours).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

// Multer en mémoire (pas de fichier sur disque)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Seuls les fichiers PDF sont acceptés'));
  }
});

// ── Prompts par type de document ─────────────────────────────────────────────

const PROMPTS = {
  client: `Tu es un assistant de gestion de transit. Analyse ce document et extrais les informations du CLIENT.
Retourne UNIQUEMENT un JSON valide avec ces champs (null si non trouvé) :
{
  "code":             "code client (ex: CLI001)",
  "raison_sociale":   "nom de l'entreprise ou du client",
  "adresse":          "adresse complète",
  "ville":            "ville",
  "code_postal":      "code postal",
  "pays":             "pays",
  "telephone":        "numéro de téléphone",
  "email":            "adresse email",
  "contact":          "nom du contact",
  "nif":              "numéro d'identification fiscale",
  "matricule_fiscal": "matricule fiscal",
  "secteur_lib":      "secteur d'activité",
  "notes":            "informations supplémentaires utiles"
}
Ne retourne rien d'autre que le JSON.`,

  dossier: `Tu es un assistant de gestion de transit douanière. Analyse ce document (connaissement, BL, facture commerciale, déclaration douanière, etc.) et extrais les informations du DOSSIER.
Retourne UNIQUEMENT un JSON valide avec ces champs (null si non trouvé) :
{
  "description":       "description générale du dossier",
  "marchandise":       "désignation/nature de la marchandise",
  "pays_origine":      "pays d'origine de la marchandise",
  "pays_destination":  "pays de destination",
  "incoterm":          "incoterm (EXW, FOB, CIF, etc.)",
  "navire":            "nom du navire ou numéro de vol",
  "transporteur":      "nom du transporteur/compagnie",
  "type_transport":    "maritime | aerien | routier | ferroviaire",
  "type_declaration":  "IMP (importation) | EXP (exportation) | TRA (transit)",
  "client_nom":        "nom du client/importateur/exportateur",
  "client_code":       "code client si visible",
  "valeur_marchandise":"valeur en chiffres (sans devise)",
  "devise":            "devise (TND, EUR, USD, etc.)",
  "observations":      "remarques importantes, numéros de référence, etc."
}
Ne retourne rien d'autre que le JSON.`,

  debours: `Tu es un assistant comptable transit. Analyse ce document (facture, reçu, bon de caisse, etc.) et extrais les informations des DÉBOURS.
Retourne UNIQUEMENT un JSON valide avec ces champs (null si non trouvé) :
{
  "libelle":       "intitulé/description du débours",
  "montant":       "montant en chiffres uniquement (ex: 350.000)",
  "devise":        "devise (TND, EUR, USD, etc.)",
  "beneficiaire":  "nom du bénéficiaire/prestataire",
  "date_debours":  "date au format YYYY-MM-DD",
  "ref_dossier":   "référence du dossier associé si visible",
  "justificatif":  "numéro de facture/reçu",
  "observations":  "informations supplémentaires"
}
Ne retourne rien d'autre que le JSON.`
};

// ── Fallback si pas d'API key OpenAI ────────────────────────────────────────

function extractWithRegex(text, type) {
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();

  // Patterns génériques pour extraire des données
  const patterns = {
    email:    text.match(/[\w.-]+@[\w.-]+\.\w{2,}/)?.[0] || null,
    tel:      text.match(/(?:\+216|00216)?[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/)?.[0]?.replace(/\s/g,'') || null,
    montant:  text.match(/(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,3})?)\s*(?:TND|DT|EUR|USD)/i)?.[1]?.replace(/[,\s]/g,'') || null,
    date:     text.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/)?.[1] || null,
    nif:      text.match(/NIF\s*[:=]?\s*([\w\/]+)/i)?.[1] || null,
  };

  if (type === 'client') {
    return {
      raison_sociale: text.split('\n').find(l => l.trim().length > 5 && /[A-Z]{2}/.test(l))?.trim() || null,
      telephone: patterns.tel,
      email: patterns.email,
      nif: patterns.nif,
      ville: text.match(/(?:Ville|City|Tunis|Sfax|Sousse|Bizerte|Nabeul|Monastir)\s*[:=]?\s*([\w\s]+)/i)?.[1]?.trim() || null,
      adresse: null, contact: null, code: null, code_postal: null, pays: 'Tunisie', notes: null
    };
  }

  if (type === 'dossier') {
    const typeDecl = /export/i.test(text) ? 'EXP' : /transit/i.test(text) ? 'TRA' : 'IMP';
    const transport = /a[eé]rien|flight|cargo/i.test(text) ? 'aerien' :
                      /routier|truck|camion/i.test(text) ? 'routier' : 'maritime';
    return {
      description: text.split('\n').find(l => l.trim().length > 10)?.trim()?.slice(0,100) || null,
      marchandise: text.match(/(?:marchandise|goods|nature)[^:\n]*[:]\s*([^\n]+)/i)?.[1]?.trim() || null,
      pays_origine: text.match(/(?:origine|origin|provenance)[^:\n]*[:]\s*([^\n]+)/i)?.[1]?.trim() || null,
      pays_destination: text.match(/(?:destination|destinataire)[^:\n]*[:]\s*([^\n]+)/i)?.[1]?.trim() || null,
      incoterm: text.match(/\b(EXW|FOB|CIF|CFR|DAP|DDP|FCA|CPT|CIP)\b/i)?.[1] || null,
      navire: text.match(/(?:navire|vessel|ship|vol|flight)[^:\n]*[:]\s*([\w\s-]+)/i)?.[1]?.trim() || null,
      transporteur: text.match(/(?:transporteur|carrier|compagnie)[^:\n]*[:]\s*([^\n]+)/i)?.[1]?.trim() || null,
      type_transport: transport,
      type_declaration: typeDecl,
      valeur_marchandise: patterns.montant,
      devise: text.match(/\b(TND|DT|EUR|USD|GBP)\b/)?.[1] || 'TND',
      client_nom: null, client_code: null, observations: null
    };
  }

  if (type === 'debours') {
    return {
      libelle: text.split('\n').find(l => l.trim().length > 5)?.trim()?.slice(0,80) || null,
      montant: patterns.montant,
      devise: text.match(/\b(TND|DT|EUR|USD)\b/)?.[1] || 'TND',
      beneficiaire: text.split('\n')[0]?.trim()?.slice(0,50) || null,
      date_debours: patterns.date,
      ref_dossier: text.match(/\b(\d{4}[IET]\d{5})\b/)?.[1] || null,
      justificatif: text.match(/(?:facture|reçu|invoice|N°)[^:\n]*[:°#]?\s*([\w-]+)/i)?.[1] || null,
      observations: null
    };
  }

  return {};
}

// ── Route principale ─────────────────────────────────────────────────────────

router.post('/extract-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier PDF reçu' });
    }

    const type = req.body.type; // 'client' | 'dossier' | 'debours'
    if (!PROMPTS[type]) {
      return res.status(400).json({ error: 'Type invalide. Choisir: client, dossier, debours' });
    }

    // 1. Extraire le texte du PDF
    let pdfText = '';
    try {
      const pdfData = await pdfParse(req.file.buffer);
      pdfText = pdfData.text;
    } catch (pdfErr) {
      return res.status(422).json({ error: 'Impossible de lire ce PDF : ' + pdfErr.message });
    }

    if (!pdfText || pdfText.trim().length < 10) {
      return res.status(422).json({ error: 'Le PDF ne contient pas de texte lisible (PDF scanné ?)' });
    }

    // Limiter le texte à 4000 caractères pour l'API
    const textToAnalyze = pdfText.slice(0, 4000);

    // 2. Essayer OpenAI d'abord
    const apiKey = process.env.OPENAI_API_KEY;
    let extracted = null;
    let method = 'ai';

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: PROMPTS[type] },
            { role: 'user', content: `Voici le texte du document :\n\n${textToAnalyze}` }
          ],
          temperature: 0.1,
          max_tokens: 600
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        // Nettoyer la réponse (enlever les balises markdown si présentes)
        const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        extracted = JSON.parse(jsonStr);
      } catch (aiErr) {
        console.log('OpenAI error, falling back to regex:', aiErr.message);
        extracted = extractWithRegex(pdfText, type);
        method = 'regex';
      }
    } else {
      // Pas de clé API → regex fallback
      extracted = extractWithRegex(pdfText, type);
      method = 'regex';
    }

    // Nettoyer les valeurs null/undefined
    const cleaned = {};
    for (const [k, v] of Object.entries(extracted || {})) {
      if (v !== null && v !== undefined && v !== '' && v !== 'null') {
        cleaned[k] = v;
      }
    }

    res.json({
      success: true,
      method,           // 'ai' ou 'regex'
      type,
      data: cleaned,
      text_length: pdfText.length,
      preview: pdfText.slice(0, 300) // aperçu du texte extrait
    });

  } catch (error) {
    console.error('AI Extract error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Erreur multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop grand (max 20 MB)' });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;

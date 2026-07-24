/**
 * Données de démonstration — Transit App
 * Clients et dossiers fictifs cohérents avec une activité de transit tunisienne
 */
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../db/database');

async function seed() {
  console.log('🌱  Insertion des données de démonstration...');

  // ── Paramètres de base ────────────────────────────────────────────────────
  const tva0  = await run('INSERT OR IGNORE INTO tva (libelle,taux,defaut) VALUES (?,?,?)', ['Exonéré (0%)', 0, 0]);
  const tva7  = await run('INSERT OR IGNORE INTO tva (libelle,taux,defaut) VALUES (?,?,?)', ['TVA 7%', 7, 0]);
  const tva19 = await run('INSERT OR IGNORE INTO tva (libelle,taux,defaut) VALUES (?,?,?)', ['TVA 19%', 19, 1]);

  const tvIds = await all('SELECT * FROM tva ORDER BY taux');
  const T = {}; tvIds.forEach(t => { T[t.taux] = t.id; });

  await run('INSERT OR IGNORE INTO type_declaration (code,libelle) VALUES (?,?)', ['I', 'Importation']);
  await run('INSERT OR IGNORE INTO type_declaration (code,libelle) VALUES (?,?)', ['E', 'Exportation']);
  await run('INSERT OR IGNORE INTO type_declaration (code,libelle) VALUES (?,?)', ['T', 'Transit']);

  const types = await all('SELECT * FROM type_declaration');
  const TY = {}; types.forEach(t => { TY[t.code] = t.id; });

  const secteurs = [
    ['IND', 'Industrie'], ['AGR', 'Agroalimentaire'], ['TEX', 'Textile & Confection'],
    ['PHR', 'Pharmacie & Médical'], ['ELE', 'Électronique & Informatique'],
    ['BTP', 'BTP & Matériaux'], ['CHI', 'Chimie & Plastique'], ['COM', 'Commerce Général'],
    ['LOG', 'Logistique'], ['ENE', 'Énergie'],
  ];
  for (const [code, libelle] of secteurs) {
    await run('INSERT OR IGNORE INTO secteur_activite (code,libelle) VALUES (?,?)', [code, libelle]);
  }
  const sects = await all('SELECT * FROM secteur_activite');
  const S = {}; sects.forEach(s => { S[s.code] = s.id; });

  const rubriques = [
    ['ASS', 'Assistance dossier',          120, T[19]],
    ['DRD', 'Droits et taxes douane',       0,  T[0]],
    ['TRP', 'Transport routier',           200, T[19]],
    ['MAG', 'Magasinage',                   50, T[19]],
    ['PES', 'Pesage',                       30, T[19]],
    ['VIS', 'Visite douane',                80, T[19]],
    ['ESC', 'Escorte douane',              100, T[19]],
    ['TIM', 'Timbrage compagnie maritime',  40, T[7]],
    ['ASR', 'Assurance FAP-SAUF',          150, T[0]],
    ['INF', 'Taxe informatique',            20, T[19]],
    ['SAI', 'Saisie de déclaration',        90, T[19]],
    ['OUV', 'Ouverture de dossier',         60, T[19]],
    ['REP', 'Répertoire / Imprimés',        15, T[19]],
    ['DEP', 'Dépôt demande agrement',       45, T[19]],
    ['HON', 'Honoraires transit',          300, T[19]],
  ];
  for (const [code, libelle, prix, tva_id] of rubriques) {
    await run('INSERT OR IGNORE INTO rubrique (code,libelle,prix_defaut,tva_id) VALUES (?,?,?,?)',
      [code, libelle, prix, tva_id]);
  }
  const rubs = await all('SELECT * FROM rubrique');
  const R = {}; rubs.forEach(r => { R[r.code] = r; });

  // ── Utilisateurs ─────────────────────────────────────────────────────────
  const hashAdmin = await bcrypt.hash('admin123', 10);
  const hashAgent = await bcrypt.hash('agent123', 10);

  await run('INSERT OR IGNORE INTO utilisateurs (login,mot_de_passe,nom,prenom,email,role) VALUES (?,?,?,?,?,?)',
    ['admin', hashAdmin, 'Ben Salem', 'Karim', 'k.bensalem@bci-transit.tn', 'admin']);
  await run('INSERT OR IGNORE INTO utilisateurs (login,mot_de_passe,nom,prenom,email,role) VALUES (?,?,?,?,?,?)',
    ['agent1', hashAgent, 'Mbarki', 'Sonia', 's.mbarki@bci-transit.tn', 'agent']);
  await run('INSERT OR IGNORE INTO utilisateurs (login,mot_de_passe,nom,prenom,email,role) VALUES (?,?,?,?,?,?)',
    ['agent2', hashAgent, 'Trabelsi', 'Hedi', 'h.trabelsi@bci-transit.tn', 'agent']);

  const admin = await get('SELECT id FROM utilisateurs WHERE login=?', ['admin']);
  const uid = admin.id;

  // ── Clients ───────────────────────────────────────────────────────────────
  const clientsData = [
    { code:'CLI001', rs:'STEG — Société Tunisienne d\'Électricité et de Gaz',    secteur:'ENE', ville:'Tunis',   tel:'+216 71 341 311', email:'import@steg.com.tn',      nif:'0000001A' },
    { code:'CLI002', rs:'SOTUPA — Société Tunisienne de Papier',                  secteur:'IND', ville:'Sfax',    tel:'+216 74 212 456', email:'achat@sotupa.tn',          nif:'1234567B' },
    { code:'CLI003', rs:'POULINA GROUP HOLDING',                                  secteur:'AGR', ville:'Tunis',   tel:'+216 71 748 000', email:'supply@poulina.tn',        nif:'9876543C' },
    { code:'CLI004', rs:'TUNISAIR — Compagnie Tunisienne de Navigation Aérienne', secteur:'LOG', ville:'Tunis',   tel:'+216 71 700 100', email:'fret@tunisair.tn',         nif:'0011223D' },
    { code:'CLI005', rs:'BATINOX SA',                                             secteur:'BTP', ville:'Le Kram', tel:'+216 71 973 972', email:'slim.boussarsar@batinox.tn',nif:'0813684R' },
    { code:'CLI006', rs:'MEDTECH SOLUTIONS',                                      secteur:'PHR', ville:'Ariana',  tel:'+216 71 850 300', email:'import@medtech.tn',        nif:'1272968T' },
    { code:'CLI007', rs:'MAGIC TEXTILES',                                         secteur:'TEX', ville:'Monastir',tel:'+216 73 460 750', email:'logistique@magictex.tn',   nif:'5566778E' },
    { code:'CLI008', rs:'ELECTRONICS MAGHREB',                                    secteur:'ELE', ville:'Tunis',   tel:'+216 71 230 444', email:'import@elecmaghreb.tn',    nif:'3344556F' },
    { code:'CLI009', rs:'CHIMIPLAST SA',                                          secteur:'CHI', ville:'Ben Arous',tel:'+216 71 389 100', email:'achat@chimiplast.tn',     nif:'7788990G' },
    { code:'CLI010', rs:'TRANSIT EXPRESS TUNIS',                                  secteur:'LOG', ville:'Tunis',   tel:'+216 71 260 800', email:'ops@transitexpress.tn',   nif:'2233445H' },
  ];

  const clientIds = {};
  for (const c of clientsData) {
    const r = await run(
      `INSERT OR IGNORE INTO clients (code,raison_sociale,secteur_id,ville,telephone,email,nif,pays,contact)
       VALUES (?,?,?,?,?,?,?,'Tunisie',?)`,
      [c.code, c.rs, S[c.secteur], c.ville, c.tel, c.email, c.nif, c.contact || null]
    );
    const row = await get('SELECT id FROM clients WHERE code=?', [c.code]);
    clientIds[c.code] = row.id;
  }

  // ── Dossiers + Factures + Débours + Préavis ───────────────────────────────
  // Helper to insert a dossier with ref
  async function mkDossier(ref, cliCode, typeCode, statut, marchandise, pays_origine, desc, createdAt) {
    const existing = await get('SELECT id FROM dossiers WHERE reference=?', [ref]);
    if (existing) return existing.id;
    const r = await run(
      `INSERT INTO dossiers (reference,client_id,type_decl_id,statut,description,marchandise,pays_origine,pays_destination,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [ref, clientIds[cliCode], TY[typeCode], statut, desc, marchandise, pays_origine,
       typeCode === 'E' ? 'France' : 'Tunisie', uid, createdAt, createdAt]
    );
    return r.lastID;
  }

  // Incrémenter compteurs manuellement pour les refs historiques
  async function setCompteur(key, annee, val) {
    await run('INSERT OR REPLACE INTO compteurs (type_doc,annee,dernier_num) VALUES (?,?,?)', [key, annee, val]);
  }
  await setCompteur('DOSSIER_I', 2026, 8);
  await setCompteur('DOSSIER_E', 2026, 2);
  await setCompteur('FACTURE', 2026, 6);
  await setCompteur('DEVIS', 2026, 4);
  await setCompteur('PREAVIS', 2026, 3);

  const dossiers = [
    // ref,           cli,      type, statut,      marchandise,                    origine,     desc,                          date
    ['2026I00001','CLI001','I','cloture',  'Câbles électriques HTA',        'Allemagne',  'Import câbles STEG',          '2026-01-10'],
    ['2026I00002','CLI002','I','cloture',  'Papier recyclé 80g/m²',         'Espagne',    'Import papier SOTUPA',        '2026-01-18'],
    ['2026I00003','CLI003','I','cloture',  'Aliments bétail — maïs 500T',   'Argentine',  'Maïs fourrage Poulina',       '2026-02-03'],
    ['2026I00004','CLI005','I','cloture',  'Inox 304L plaques',             'Italie',     'Plaques inox Batinox',        '2026-02-15'],
    ['2026I00005','CLI006','I','cloture',  'Équipement médical échographe', 'USA',        'Échographe Medtech',          '2026-03-01'],
    ['2026I00006','CLI007','I','cloture',  'Fils de coton 40/2',            'Inde',       'Fils coton Magic Textiles',   '2026-03-20'],
    ['2026E00001','CLI007','E','cloture',  'Vêtements confectionnés',       'Italie',     'Export vêtements Magic Tex',  '2026-03-25'],
    ['2026I00007','CLI008','I','en_cours', 'Composants électroniques',      'Chine',      'Composants Electronics Magh', '2026-04-05'],
    ['2026I00008','CLI009','I','en_cours', 'Résine PVC 1000T',              'Belgique',   'Résine PVC Chimiplast',       '2026-04-18'],
    ['2026E00002','CLI003','E','en_cours', 'Huile d\'olive vierge extra',   'France',     'Export huile Poulina',        '2026-05-02'],
    ['2026I00009','CLI001','I','ouvert',   'Transformateurs HTA 220kV',     'Corée du Sud','Transfo STEG urgence',       '2026-05-20'],
    ['2026I00010','CLI010','I','ouvert',   'Mobilier de bureau',            'Chine',      'Mobilier Transit Express',   '2026-06-01'],
  ];

  const dossierIds = {};
  for (const [ref, cli, type, statut, march, origine, desc, dt] of dossiers) {
    dossierIds[ref] = await mkDossier(ref, cli, type, statut, march, origine, desc, dt + 'T08:00:00');
  }

  // ── Devis ─────────────────────────────────────────────────────────────────
  async function mkDevis(num, cliCode, dosRef, dateD, statut, objet, lignesData) {
    const existing = await get('SELECT id FROM devis WHERE numero=?', [num]);
    if (existing) return existing.id;
    const dosId = dossierIds[dosRef] || null;
    const r = await run(
      `INSERT INTO devis (numero,client_id,dossier_id,date_devis,date_validite,statut,objet,created_by)
       VALUES (?,?,?,?,date(?,'+30 days'),?,?,?)`,
      [num, clientIds[cliCode], dosId, dateD, dateD, statut, objet, uid]
    );
    const dvId = r.lastID;
    for (let i = 0; i < lignesData.length; i++) {
      const [rcode, qty, pu, tcode] = lignesData[i];
      const rub = R[rcode];
      await run(`INSERT INTO devis_lignes (devis_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre)
                 VALUES (?,?,?,?,?,?,?)`,
        [dvId, rub?.id||null, rub?.libelle||rcode, qty, pu, T[tcode], i]);
    }
    return dvId;
  }

  await mkDevis('DEV20260001','CLI006','2026I00005','2026-02-25','facture',
    'Dédouanement échographe médical',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['VIS',1,80,19],['HON',1,300,19],['DRD',1,850,0]]);

  await mkDevis('DEV20260002','CLI007','2026I00006','2026-03-15','facture',
    'Dédouanement fils de coton import',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['TRP',1,200,19],['HON',1,300,19]]);

  await mkDevis('DEV20260003','CLI008','2026I00007','2026-03-28','envoye',
    'Dédouanement composants électroniques',
    [['OUV',1,60,19],['ASS',1,150,19],['SAI',1,90,19],['INF',1,20,19],['HON',1,350,19],['DRD',1,1200,0]]);

  await mkDevis('DEV20260004','CLI001','2026I00009','2026-05-18','brouillon',
    'Dédouanement transformateurs urgents',
    [['OUV',1,60,19],['ASS',2,120,19],['SAI',1,90,19],['ESC',1,100,19],['HON',1,500,19],['DRD',1,4500,0]]);

  // ── Factures ──────────────────────────────────────────────────────────────
  async function mkFacture(num, cliCode, dosRef, dateF, statut, objet, lignesData, paiements=[]) {
    const existing = await get('SELECT id FROM factures WHERE numero=?', [num]);
    if (existing) return existing.id;
    const dosId = dossierIds[dosRef] || null;
    const r = await run(
      `INSERT INTO factures (numero,client_id,dossier_id,date_facture,date_echeance,statut,objet,created_by)
       VALUES (?,?,?,?,date(?,'+30 days'),?,?,?)`,
      [num, clientIds[cliCode], dosId, dateF, dateF, statut, objet, uid]
    );
    const fId = r.lastID;
    for (let i = 0; i < lignesData.length; i++) {
      const [rcode, qty, pu, tcode] = lignesData[i];
      const rub = R[rcode];
      await run(`INSERT INTO facture_lignes (facture_id,rubrique_id,designation,quantite,prix_unitaire,tva_id,ordre)
                 VALUES (?,?,?,?,?,?,?)`,
        [fId, rub?.id||null, rub?.libelle||rcode, qty, pu, T[tcode], i]);
    }
    for (const [datePai, montant, mode] of paiements) {
      await run('INSERT INTO paiements (facture_id,date_paiement,montant,mode,created_by) VALUES (?,?,?,?,?)',
        [fId, datePai, montant, mode, uid]);
    }
    return fId;
  }

  // Factures clôturées (payées)
  await mkFacture('FAC20260001','CLI001','2026I00001','2026-01-28','payee',
    'Dédouanement câbles HTA — Réf. 2026I00001',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['VIS',1,80,19],['TRP',1,200,19],['HON',1,300,19],['DRD',1,1850,0]],
    [['2026-02-10', 700, 'virement'], ['2026-02-20', 900, 'virement']]);

  await mkFacture('FAC20260002','CLI002','2026I00002','2026-02-05','payee',
    'Dédouanement papier recyclé — Réf. 2026I00002',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['MAG',3,50,19],['HON',1,280,19],['DRD',1,620,0]],
    [['2026-02-25', 1100, 'cheque']]);

  await mkFacture('FAC20260003','CLI006','2026I00005','2026-03-10','payee',
    'Dédouanement échographe médical — Réf. 2026I00005',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['VIS',1,80,19],['HON',1,300,19],['DRD',1,850,0]],
    [['2026-03-20', 1500, 'virement']]);

  await mkFacture('FAC20260004','CLI007','2026I00006','2026-03-28','payee',
    'Dédouanement fils de coton import — Réf. 2026I00006',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['TRP',1,200,19],['HON',1,300,19]],
    [['2026-04-10', 900, 'virement']]);

  // Factures en cours (impayées / partielles)
  await mkFacture('FAC20260005','CLI008','2026I00007','2026-04-20','partielle',
    'Dédouanement composants électroniques — Réf. 2026I00007',
    [['OUV',1,60,19],['ASS',1,150,19],['SAI',1,90,19],['INF',1,20,19],['HON',1,350,19],['DRD',1,1200,0]],
    [['2026-05-05', 800, 'virement']]);

  await mkFacture('FAC20260006','CLI009','2026I00008','2026-04-30','emise',
    'Dédouanement résine PVC — Réf. 2026I00008',
    [['OUV',1,60,19],['ASS',1,120,19],['SAI',1,90,19],['PES',1,30,19],['TRP',1,200,19],['HON',1,400,19],['DRD',1,2400,0]]);

  // ── Débours ───────────────────────────────────────────────────────────────
  const deboursData = [
    ['2026I00001','2026-01-12','Droits de douane payés ADII',     'ADII Tunis',        1850,'TND'],
    ['2026I00001','2026-01-13','Transport routier port → dépôt',  'COMATRANS',          200,'TND'],
    ['2026I00001','2026-01-13','Frais de pesage',                  'Port de Tunis',       30,'TND'],
    ['2026I00002','2026-01-20','Droits de douane papier',          'ADII Sfax',          620,'TND'],
    ['2026I00002','2026-01-21','Magasinage 3 jours',               'Port de Sfax',       150,'TND'],
    ['2026I00003','2026-02-05','Droits douane maïs (exon.)',       'ADII Tunis',           0,'TND'],
    ['2026I00003','2026-02-06','Frais escorte phytosanitaire',     'DGPA',               120,'TND'],
    ['2026I00005','2026-03-03','Droits douane équipement médical', 'ADII Tunis',         850,'TND'],
    ['2026I00005','2026-03-04','Transport équipement fragile',     'SPECAR',             350,'TND'],
    ['2026I00007','2026-04-07','Acompte droits douane composants', 'ADII Tunis',        1200,'TND'],
    ['2026I00008','2026-04-20','Droits douane résine PVC',         'ADII Ben Arous',    2400,'TND'],
    ['2026I00008','2026-04-21','Pesage et analyse laboratoire',    'IANOR',               85,'TND'],
  ];
  for (const [ref, date, lib, benef, mnt, dev] of deboursData) {
    const dosId = dossierIds[ref];
    if (!dosId) continue;
    await run('INSERT OR IGNORE INTO debours (dossier_id,date_debours,libelle,beneficiaire,montant,devise,created_by) VALUES (?,?,?,?,?,?,?)',
      [dosId, date, lib, benef, mnt, dev, uid]);
  }

  // ── Préavis d'arrivée ─────────────────────────────────────────────────────
  const preavisData = [
    ['PRE20260001','2026I00007','CLI008','2026-07-15','COSCO Shipping','maritime','COSU9876543210','Shanghai','Radès','Composants électroniques 45 colis',45,1200,68,'en_attente'],
    ['PRE20260002','2026I00008','CLI009','2026-07-22','MSC Mediterranean','maritime','MSCU7654321098','Anvers','Radès','Résine PVC 1000T vrac',20,1000,0,'en_attente'],
    ['PRE20260003','2026I00009','CLI001','2026-08-03','Turkish Airlines Cargo','aerien','TK3456/2026','Istanbul','Tunis-Carthage','Transformateurs HTA 3 unités',3,18000,45,'en_attente'],
  ];
  for (const [ref, dosRef, cliCode, dateArr, transp, moyen, refTrp, portEmb, portDech, march, nbColis, poids, vol, statut] of preavisData) {
    const dosId = dossierIds[dosRef];
    const cliId = clientIds[cliCode];
    if (!dosId || !cliId) continue;
    await run('INSERT OR IGNORE INTO preavis_arrivee (reference,dossier_id,client_id,date_arrivee_prevue,transporteur,moyen_transport,ref_transport,port_embarquement,port_dechargement,designation_march,nb_colis,poids_brut,volume,statut,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [ref, dosId, cliId, dateArr, transp, moyen, refTrp, portEmb, portDech, march, nbColis, poids, vol, statut, uid]);
  }

  // ── Notes sur dossiers ────────────────────────────────────────────────────
  await run("INSERT OR IGNORE INTO dossier_notes (dossier_id,contenu,auteur_id) VALUES (?,?,?)",
    [dossierIds['2026I00007'], "Documents Colisage reçus par email — en attente de BL original par courrier.", uid]);
  await run("INSERT OR IGNORE INTO dossier_notes (dossier_id,contenu,auteur_id) VALUES (?,?,?)",
    [dossierIds['2026I00008'], "Analyse laboratoire IANOR obligatoire pour résine PVC. Prendre RDV avant arrivée.", uid]);
  await run("INSERT OR IGNORE INTO dossier_notes (dossier_id,contenu,auteur_id) VALUES (?,?,?)",
    [dossierIds['2026I00009'], "Dossier URGENT — appel client le 20/05. Priorité absolue dès arrivée à Tunis-Carthage.", uid]);

  console.log('✅  Données de démonstration insérées avec succès.');
  console.log('   Login : admin / admin123   (administrateur)');
  console.log('   Login : agent1 / agent123  (agent)');
}

// Run if called directly
if (require.main === module) {
  seed().catch(e => {
    console.error('Erreur seed:', e.message);
    process.exit(1);
  });
}

module.exports = seed;

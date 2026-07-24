const express = require('express');
const { get, all } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const [
      statsClients, statsDossiers, dossiersEnCours,
      statsFactures, facturesImpayees,
      caTotal, caMois,
      dossiersMois, repartitionType,
      dernieresFact, prochainsArrivees,
      deboursMois, evolutionMensuelle
    ] = await Promise.all([
      get('SELECT COUNT(*) n FROM clients WHERE actif=1'),
      get('SELECT COUNT(*) n FROM dossiers'),
      get("SELECT COUNT(*) n FROM dossiers WHERE statut IN ('ouvert','en_cours')"),
      get('SELECT COUNT(*) n FROM factures'),
      get("SELECT COUNT(*) n FROM factures WHERE statut IN ('emise','partielle')"),

      // CA total (sum des paiements)
      get('SELECT COALESCE(SUM(montant),0) total FROM paiements'),
      // CA mois courant
      get("SELECT COALESCE(SUM(montant),0) total FROM paiements WHERE strftime('%Y-%m',date_paiement)=strftime('%Y-%m','now')"),

      // Dossiers ce mois
      get("SELECT COUNT(*) n FROM dossiers WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')"),

      // Répartition import/export
      all(`SELECT td.code, td.libelle, COUNT(*) n FROM dossiers d
           JOIN type_declaration td ON d.type_decl_id=td.id
           GROUP BY td.code`),

      // 5 dernières factures
      all(`SELECT f.id, f.numero, f.date_facture, f.statut,
                  c.raison_sociale,
                  COALESCE((SELECT SUM(fl.quantite*fl.prix_unitaire*(1+(COALESCE(t.taux,0)/100)))
                             FROM facture_lignes fl LEFT JOIN tva t ON fl.tva_id=t.id
                             WHERE fl.facture_id=f.id),0) AS montant_ttc
           FROM factures f JOIN clients c ON f.client_id=c.id
           ORDER BY f.created_at DESC LIMIT 5`),

      // Prochains préavis
      all(`SELECT pa.id, pa.reference, pa.date_arrivee_prevue, pa.transporteur,
                  pa.moyen_transport, c.raison_sociale, d.reference as ref_dossier
           FROM preavis_arrivee pa
           JOIN clients c ON pa.client_id=c.id
           JOIN dossiers d ON pa.dossier_id=d.id
           WHERE pa.statut='en_attente' AND pa.date_arrivee_prevue >= date('now')
           ORDER BY pa.date_arrivee_prevue LIMIT 5`),

      // Débours ce mois
      get("SELECT COALESCE(SUM(montant),0) total FROM debours WHERE strftime('%Y-%m',date_debours)=strftime('%Y-%m','now')"),

      // Évolution mensuelle sur 6 mois (dossiers + factures)
      all(`SELECT strftime('%Y-%m', created_at) mois, COUNT(*) n FROM dossiers
           WHERE created_at >= date('now','-6 months')
           GROUP BY mois ORDER BY mois`)
    ]);

    res.json({
      stats: {
        clients: statsClients.n,
        dossiers: statsDossiers.n,
        dossiers_en_cours: dossiersEnCours.n,
        factures: statsFactures.n,
        factures_impayees: facturesImpayees.n,
        ca_total: caTotal.total,
        ca_mois: caMois.total,
        dossiers_mois: dossiersMois.n,
        debours_mois: deboursMois.total,
      },
      repartition_type: repartitionType,
      dernieres_factures: dernieresFact,
      prochains_arrivees: prochainsArrivees,
      evolution_mensuelle: evolutionMensuelle,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

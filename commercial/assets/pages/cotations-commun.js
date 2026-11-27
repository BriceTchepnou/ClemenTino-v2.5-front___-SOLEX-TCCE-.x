/* =====================================================================
   Commercial · Cotations - fonctions communes aux 3 écrans
   (cotations-liste, cotation-form, cotation-document)
   ---------------------------------------------------------------------
   Expose CX.cot : libellés, petites grilles de prix indicatives propres
   aux cotations, et calculs (expédition, mise à disposition, tarifaire)
   partagés entre le formulaire et le devis imprimable, pour que les deux
   affichent toujours les mêmes montants.

   >>> INTÉGRATION SYMFONY <<<
   Les grilles ci-dessous (PRIX_VEHICULE, OPTIONS_FRET, COEF_TRAJET…) sont
   des valeurs de démonstration : à injecter par Twig depuis le paramétrage
   tarifaire, ou à remplacer par un appel au moteur de tarifs.
   ===================================================================== */
var CX = window.CX || {};
window.CX = CX;

CX.cot = {

    /* Libellés accentués des villes (les référentiels sont stockés sans accent) */
    VILLES_ACCENTS: { YAOUNDE: "YAOUNDÉ", NGAOUNDERE: "NGAOUNDÉRÉ", BUEA: "BUÉA" },
    villeLabel: function (v) { return v ? (CX.cot.VILLES_ACCENTS[v] || v) : ""; },

    /* Types de trajet (cotation d'expédition) */
    TYPES_TRAJET: {
        URBAINE: { label: "Urbaine", desc: "Même ville", icon: "fa-building-o" },
        NATIONALE: { label: "Nationale", desc: "Entre villes du Cameroun", icon: "fa-road" },
        REGIONALE: { label: "Régionale", desc: "Zone CEMAC", icon: "fa-globe" },
        INTERNATIONALE: { label: "Internationale", desc: "Reste du monde", icon: "fa-plane" }
    },
    /* Coefficient appliqué au tarif national pour l'estimation (démo) */
    COEF_TRAJET: { URBAINE: 1, NATIONALE: 1, REGIONALE: 3, INTERNATIONALE: 6 },
    PAYS: {
        REGIONALE: ["Gabon", "Tchad", "Congo", "République centrafricaine", "Guinée équatoriale"],
        INTERNATIONALE: ["Nigeria", "France", "Belgique", "Suisse", "Allemagne", "Royaume-Uni", "États-Unis", "Canada", "Chine", "Émirats arabes unis"]
    },
    /* Déduit le type de trajet à partir des villes (toutes les villes du référentiel sont au Cameroun) */
    deduireTrajet: function (villeDep, villeDest) {
        if (!villeDep || !villeDest) return "NATIONALE";
        return villeDep === villeDest ? "URBAINE" : "NATIONALE";
    },

    /* Mise à disposition : prix / jour indicatifs par type de véhicule (TYPES_VEHICULE) */
    PRIX_VEHICULE: {
        "Moto": { icon: "fa-motorcycle", jour: 10000, carburant: 3000, desc: "Plis et petits colis" },
        "Tricycle": { icon: "fa-bicycle", jour: 20000, carburant: 6000, desc: "Jusqu'à 300 kg" },
        "Fourgonnette (1,5 t)": { icon: "fa-car", jour: 45000, carburant: 20000, desc: "Livraisons urbaines" },
        "Camionnette (3,5 t)": { icon: "fa-truck", jour: 75000, carburant: 30000, desc: "Tournées régionales" },
        "Camion 10 t": { icon: "fa-truck", jour: 180000, carburant: 60000, desc: "Gros volumes, inter-villes" },
        "Semi-remorque": { icon: "fa-truck", jour: 300000, carburant: 90000, desc: "Conteneurs, charges lourdes" }
    },
    OPTIONS_FRET: { chauffeurJour: 15000, manutentionnaireJour: 7500 },

    /* Tranches de poids de la grille tarifaire (borne haute utilisée pour le pré-remplissage) */
    TRANCHES: [
        { code: "0 - 1 kg", max: 1 }, { code: "1 - 5 kg", max: 5 }, { code: "5 - 10 kg", max: 10 },
        { code: "10 - 20 kg", max: 20 }, { code: "20 - 30 kg", max: 30 }, { code: "30 - 50 kg", max: 50 }
    ],

    /* ------------------------------------------------------------------
       Calcul d'une cotation d'EXPÉDITION
       d = details (cf. modèle cot() du seed) ; remisePct = remise client
       Retourne tous les montants intermédiaires.
       ------------------------------------------------------------------ */
    /* tarif (facultatif) = résultat de CX.tarifs.resoudre(clientId, date) : si fourni (et cx-tarifs.js
       chargé), le transport et la livraison automatiques viennent de la grille du client ; sinon on
       garde le calcul indicatif historique (pages qui ne chargent pas le moteur). */
    calcExpedition: function (d, remisePct, tarif) {
        if (tarif && tarif.grille && CX.tarifs) return CX.cot.calcExpeditionGrille(d, remisePct, tarif);
        var U = CX.util, r = { poidsReel: 0, poidsVol: 0, poidsTaxable: 0, nbColis: 0 };
        $.each(d.colis || [], function (_, c) {
            var n = Math.max(1, parseInt(c.nombre, 10) || 1);
            var reel = U.num(c.poids), vol = CX.tarif.poidsVolumetrique(U.num(c.L), U.num(c.l), U.num(c.H));
            r.nbColis += n;
            r.poidsReel += reel * n;
            r.poidsVol += vol * n;
            r.poidsTaxable += Math.max(reel, vol) * n;
        });
        r.poidsReel = Math.round(r.poidsReel * 10) / 10;
        r.poidsVol = Math.round(r.poidsVol * 10) / 10;
        r.poidsTaxable = Math.round(r.poidsTaxable * 10) / 10;

        /* Tarif automatique (indicatif) */
        var type = d.typeTrajet || CX.cot.deduireTrajet(d.villeDep, d.villeDest);
        var destCalc = type === "URBAINE" ? d.villeDep : (d.villeDest && d.villeDest !== d.villeDep ? d.villeDest : "AUTRE");
        r.transportAuto = d.villeDep && r.poidsTaxable > 0
            ? Math.round(CX.tarif.transport(d.villeDep, destCalc, r.poidsTaxable) * (CX.cot.COEF_TRAJET[type] || 1)) : 0;
        r.livraisonAuto = d.livraison === "DOMICILE" ? CX.tarif.livraison(d.zone) : 0;

        var auto = d.tarifAuto !== false && d.tarifAuto != null;
        r.transport = auto ? r.transportAuto : U.round(d.transport);
        r.livraison = auto ? r.livraisonAuto : U.round(d.livraisonMt);
        r.emballage = U.round(d.emballage);
        r.autres = U.round(d.autres);
        r.brut = r.transport + r.livraison + r.emballage + r.autres;
        r.remisePct = U.num(remisePct);
        r.remise = U.round(r.brut * r.remisePct / 100);
        var t = U.taxes(r.brut - r.remise);
        r.ht = t.ht; r.tva = t.tva; r.ttc = t.ttc; r.taux = t.taux;
        return r;
    },

    /* ------------------------------------------------------------------
       Expédition tarifée par la grille du client (moteur CX.tarifs)
       r.calcTarif = détail du moteur (lignes pas à pas, alertes, règle)
       Transport = transport + suppléments + assurance de la grille (HT) ;
       la livraison à domicile reste sur sa ligne. Mêmes clés que calcExpedition.
       ------------------------------------------------------------------ */
    calcExpeditionGrille: function (d, remisePct, tarif) {
        var U = CX.util, T = CX.tarifs, r = {};
        var env = {
            typeTrajet: d.typeTrajet, villeDep: d.villeDep, villeDest: d.villeDest, paysDest: d.paysDest,
            livraison: d.livraison, zone: d.zone, express: !!d.express,
            colis: $.map(d.colis || [], function (c) {
                return { nature: c.nature, poids: c.poids, L: c.L, l: c.l, H: c.H, nombre: c.nombre, valeur: c.valeur };
            })
        };
        var res = T.calculer(tarif.grille, env), div = res.diviseur;
        r.calcTarif = res;
        r.tarif = tarif;
        r.nbColis = 0; r.poidsReel = 0; r.poidsVol = 0; r.poidsTaxable = 0;
        $.each(d.colis || [], function (_, c) {
            var n = Math.max(1, parseInt(c.nombre, 10) || 1), reel = U.num(c.poids), vol = T.poidsVolumetrique(c.L, c.l, c.H, div);
            r.nbColis += n; r.poidsReel += reel * n; r.poidsVol += vol * n; r.poidsTaxable += Math.max(reel, vol) * n;
        });
        r.poidsReel = Math.round(r.poidsReel * 10) / 10;
        r.poidsVol = Math.round(r.poidsVol * 10) / 10;
        r.poidsTaxable = Math.round(r.poidsTaxable * 10) / 10;
        var aucunPoids = !r.poidsTaxable && !$.grep(res.regles, function (x) { return x.regle.modele === "PIECE"; }).length;
        r.transportAuto = d.villeDep && !aucunPoids ? res.parts.transport + res.parts.supplements + res.parts.assurance : 0;
        r.livraisonAuto = d.livraison === "DOMICILE" && !aucunPoids ? res.parts.livraison : 0;

        var auto = d.tarifAuto !== false && d.tarifAuto != null;
        r.transport = auto ? r.transportAuto : U.round(d.transport);
        r.livraison = auto ? r.livraisonAuto : U.round(d.livraisonMt);
        r.emballage = U.round(d.emballage);
        r.autres = U.round(d.autres);
        r.brut = r.transport + r.livraison + r.emballage + r.autres;
        r.remisePct = U.num(remisePct);
        r.remise = U.round(r.brut * r.remisePct / 100);
        var t = U.taxes(r.brut - r.remise);
        r.ht = t.ht; r.tva = t.tva; r.ttc = t.ttc; r.taux = t.taux;
        return r;
    },

    /* ------------------------------------------------------------------
       Calcul d'une cotation de MISE À DISPOSITION (FRET)
       ------------------------------------------------------------------ */
    calcFret: function (d, remisePct) {
        var U = CX.util, j = Math.max(0, parseInt(d.nbJours, 10) || 0), r = { jours: j };
        r.location = U.round(U.num(d.prixJour) * j);
        r.chauffeur = d.chauffeur ? U.round(U.num(d.chauffeurJour) * j) : 0;
        r.carburant = d.carburant ? U.round(U.num(d.carburantJour) * j) : 0;
        r.nbManut = Math.max(0, parseInt(d.manutention, 10) || 0);
        r.manutention = U.round(r.nbManut * U.num(d.manutJour) * j);
        r.frais = U.round(d.frais);
        r.brut = r.location + r.chauffeur + r.carburant + r.manutention + r.frais;
        r.remisePct = U.num(remisePct);
        r.remise = U.round(r.brut * r.remisePct / 100);
        var t = U.taxes(r.brut - r.remise);
        r.ht = t.ht; r.tva = t.tva; r.ttc = t.ttc; r.taux = t.taux;
        return r;
    },

    /* ------------------------------------------------------------------
       Statistiques d'une cotation TARIFAIRE (prix nets après remise globale)
       ------------------------------------------------------------------ */
    prixNet: function (prix, remiseGlobale) {
        return CX.util.round(CX.util.num(prix) * (1 - CX.util.num(remiseGlobale) / 100));
    },
    calcTarifaire: function (d) {
        var r = { nb: 0, min: null, max: null, trajets: 0 }, vus = {};
        $.each(d.lignes || [], function (_, l) {
            var p = CX.cot.prixNet(l.prix, d.remiseGlobale);
            r.nb++;
            if (l.villeDep && l.villeDest) vus[l.villeDep + ">" + l.villeDest] = 1;
            if (p > 0) {
                r.min = r.min == null ? p : Math.min(r.min, p);
                r.max = r.max == null ? p : Math.max(r.max, p);
            }
        });
        r.trajets = $.map(vus, function () { return 1; }).length;
        return r;
    },

    /* Client par id (lecture synchrone pour les rendus) */
    client: function (id) {
        return $.grep(CX.api.clientsSync() || [], function (c) { return c.id == id; })[0] || null;
    },
    /* Email du client pour l'envoi du devis */
    emailClient: function (c) {
        if (!c) return "";
        return (c.contacts && c.contacts[0] && c.contacts[0].email) || c.emailFacturation || c.email || "";
    },

    /* Message « flash » transmis d'une page à l'autre (toast après redirection) */
    flash: function (msg, type) {
        try { sessionStorage.setItem("cx_cot_flash", JSON.stringify({ msg: msg, type: type || "success" })); } catch (e) { /* stockage indisponible */ }
    },
    showFlash: function () {
        try {
            var f = JSON.parse(sessionStorage.getItem("cx_cot_flash") || "null");
            sessionStorage.removeItem("cx_cot_flash");
            if (f && f.msg) CX.util.toast(f.msg, f.type);
        } catch (e) { /* rien */ }
    }
};

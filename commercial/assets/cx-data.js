/* =====================================================================
   ClemenTino 2.0 - Module COMMERCIAL - référentiels + données simulées
   ---------------------------------------------------------------------
   CX.REF  : référentiels (villes, agences, natures de colis, statuts…)
   CX.tarif: calcul indicatif d'un tarif (grille simplifiée de démo)
   CX.api  : persistance simulée dans le localStorage.

   >>> INTÉGRATION SYMFONY <<<
   Chaque méthode de CX.api renvoie une promesse jQuery. Il suffit de
   remplacer son corps par un $.ajax vers la route Symfony équivalente :
       CX.api.list("clients", filtre)   -> GET    /commercial/clients
       CX.api.get("clients", id)        -> GET    /commercial/clients/{id}
       CX.api.save("clients", obj)      -> POST   /commercial/clients  (ou PUT /{id})
       CX.api.remove("clients", id)     -> DELETE /commercial/clients/{id}
   (même logique pour "cotations", "expeditions", "factures")
   Les référentiels CX.REF sont à injecter par Twig, par exemple :
       <script>CX.REF.AGENCES = {{ agences|json_encode|raw }};</script>
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.REF = {
    VILLES: [
        { code: "DLA", nom: "DOUALA" }, { code: "YDE", nom: "YAOUNDE" }, { code: "BFS", nom: "BAFOUSSAM" },
        { code: "GRA", nom: "GAROUA" }, { code: "KRI", nom: "KRIBI" }, { code: "LIM", nom: "LIMBE" },
        { code: "BUE", nom: "BUEA" }, { code: "NGD", nom: "NGAOUNDERE" }, { code: "BDA", nom: "BAMENDA" },
        { code: "EBO", nom: "EBOLOWA" }, { code: "BRT", nom: "BERTOUA" }, { code: "MRA", nom: "MAROUA" }
    ],
    AGENCES: [
        { id: 1, nom: "AKWA", ville: "DOUALA" }, { id: 2, nom: "BONANJO", ville: "DOUALA" },
        { id: 3, nom: "BONABERI", ville: "DOUALA" }, { id: 4, nom: "CENTRALE", ville: "YAOUNDE" },
        { id: 5, nom: "BASTOS", ville: "YAOUNDE" }, { id: 6, nom: "MVAN", ville: "YAOUNDE" },
        { id: 7, nom: "CENTRE", ville: "BAFOUSSAM" }, { id: 8, nom: "CENTRE", ville: "GAROUA" },
        { id: 9, nom: "CENTRE", ville: "KRIBI" }, { id: 10, nom: "CENTRE", ville: "LIMBE" },
        { id: 11, nom: "MOLYKO", ville: "BUEA" }, { id: 12, nom: "CENTRE", ville: "NGAOUNDERE" }
    ],
    NATURES_COLIS: ["Colis", "Pli fermé", "Document", "Fragile", "Alimentaire", "Électronique", "Médicament"],
    SECTEURS: ["Banque / Assurance", "Pharmacie / Santé", "Industrie", "Commerce / Distribution", "Presse / Médias",
        "Télécoms", "Énergie", "Administration", "ONG / International", "Services", "Autre"],
    MODES_PAIEMENT: ["Virement", "Chèque", "Espèces", "Orange Money", "MTN MoMo"],
    TYPES_VEHICULE: ["Moto", "Tricycle", "Fourgonnette (1,5 t)", "Camionnette (3,5 t)", "Camion 10 t", "Semi-remorque"],
    ZONES_LIVRAISON: [
        { code: "Z1", nom: "Zone 1 · Centre-ville", prix: 1500 },
        { code: "Z2", nom: "Zone 2 · Périphérie", prix: 2500 },
        { code: "Z3", nom: "Zone 3 · Banlieue", prix: 4000 }
    ],

    /* Statuts (libellé + couleur de badge cx-badge-*) */
    STATUT_COTATION: {
        ENREGISTREE: { label: "Enregistrée", color: "grey" },
        SOUMISE: { label: "Soumise", color: "blue" },
        VALIDEE: { label: "Validée", color: "green" },
        EN_ATTENTE: { label: "En attente client", color: "orange" },
        ACCEPTEE: { label: "Acceptée", color: "purple" },
        REJETEE: { label: "Rejetée", color: "red" },
        ANNULEE: { label: "Annulée", color: "grey" }
    },
    TYPE_COTATION: {
        EXPEDITION: { label: "Expédition", icon: "fa-cube" },
        FRET: { label: "Mise à disposition (FRET)", icon: "fa-truck" },
        TARIFAIRE: { label: "Tarifaire", icon: "fa-table" }
    },
    STATUT_FACTURE: {
        BROUILLON: { label: "Brouillon", color: "grey" },
        EMISE: { label: "Émise", color: "blue" },
        ENVOYEE: { label: "Envoyée", color: "purple" },
        PARTIELLE: { label: "Partiellement payée", color: "orange" },
        PAYEE: { label: "Payée", color: "green" },
        ANNULEE: { label: "Annulée", color: "red" }
    },
    STATUT_CLIENT: {
        ACTIF: { label: "Actif", color: "green" },
        SUSPENDU: { label: "Suspendu", color: "orange" },
        INACTIF: { label: "Inactif", color: "grey" }
    },

    agencesDe: function (ville) { return $.grep(CX.REF.AGENCES, function (a) { return a.ville === ville; }); },
    agence: function (id) { return $.grep(CX.REF.AGENCES, function (a) { return a.id == id; })[0] || null; },
    badge: function (map, code) {
        var s = map[code] || { label: code || "—", color: "grey" };
        return "<span class='cx-badge cx-badge-" + s.color + "'>" + CX.util.esc(s.label) + "</span>";
    }
};

/* =====================================================================
   Ajouts : conditions de facturation des clients, comptabilité (journal
   de vente, export Sage), apporteurs d'affaires et commissions.
   ---------------------------------------------------------------------
   Nouveaux champs d'un client (tous facultatifs ; absents = comportement
   historique) :
     compte          n° de compte client (411 + 5 chiffres, ex. 41100006)
     avecTva         facture avec TVA (défaut true) - tauxTva (défaut CX.CONFIG.TVA)
     abonnementIs    acompte d'impôt sur les sociétés retenu à la source
     tauxIs          taux de l'acompte IS (défaut 2,2 %)
     assurance, manutention, emballage   frais fixes ajoutés à chaque facture (HT)
     afficherPuMoyen colonnes « Poids V. » et « P.U. moyen » sur la facture
     sousTotal       AUCUN | DEPART | DESTINATION (sous-totaux par ville)
     apporteurId     apporteur d'affaires qui a apporté le client
   ===================================================================== */
$.extend(CX.REF, {
    TAUX_IS: 2.2,   // % acompte IS retenu à la source (régime du réel) - TODO : paramètre société
    TYPES_APPORTEUR: {
        COMMERCIAL: { label: "Commercial interne", color: "blue" },
        AGENT: { label: "Agent indépendant", color: "purple" },
        PARTENAIRE: { label: "Partenaire", color: "orange" },
        PARRAIN: { label: "Client parrain", color: "green" }
    },
    STATUT_APPORTEUR: {
        ACTIF: { label: "Activé", color: "green" },
        SUSPENDU: { label: "Suspendu", color: "orange" }
    },
    BASES_COMMISSION: {
        FACTURE: { label: "CA HT facturé", desc: "Factures émises sur la période (net HT)" },
        ENCAISSE: { label: "CA encaissé", desc: "Paiements reçus sur la période (part HT)" }
    },
    STATUT_COMMISSION: {
        A_PAYER: { label: "À payer", color: "orange" },
        PAYEE: { label: "Payée", color: "green" }
    },
    SOUS_TOTAL: { AUCUN: "Aucun", DEPART: "Par ville de départ", DESTINATION: "Par ville de destination" },

    /* Code ville sur 3 lettres (DOUALA -> DLA) */
    villeCode: function (nom) {
        var v = $.grep(CX.REF.VILLES, function (x) { return x.nom === nom; })[0];
        return v ? v.code : String(nom || "XXX").substr(0, 3).toUpperCase();
    },
    /* N° de compte comptable du client : champ « compte » ou 411 + id sur 5 chiffres */
    compteClient: function (c) {
        if (!c) return "";
        if (c.compte) return String(c.compte);
        return "411" + ("00000" + (c.id || 0)).slice(-5);
    },
    /* Conditions de facturation d'un client, valeurs par défaut comprises */
    conditionsFacturation: function (c) {
        c = c || {};
        function n(v, def) { return v == null || v === "" || isNaN(Number(v)) ? def : Number(v); }
        return {
            remisePct: n(c.remisePct, 0),
            delaiPaiement: n(c.delaiPaiement, 0) || CX.CONFIG.DELAI_PAIEMENT_JOURS,
            avecTva: c.avecTva !== false,
            tauxTva: n(c.tauxTva, CX.CONFIG.TVA),
            abonnementIs: !!c.abonnementIs,
            tauxIs: n(c.tauxIs, CX.REF.TAUX_IS),
            assurance: n(c.assurance, 0),
            manutention: n(c.manutention, 0),
            emballage: n(c.emballage, 0),
            afficherPuMoyen: !!c.afficherPuMoyen,
            sousTotal: CX.REF.SOUS_TOTAL[c.sousTotal] ? c.sousTotal : "AUCUN"
        };
    }
});

/* =====================================================================
   Tarification indicative - conservée pour compatibilité.
   ---------------------------------------------------------------------
   Le moteur de tarification complet est CX.tarifs (assets/cx-tarifs.js,
   grilles tarifaires, contrats, groupes de clients). Quand il est chargé
   dans la page, CX.tarif.transport() et livraison() s'appuient sur la
   grille STANDARD active ; sinon on garde le calcul indicatif historique
   (identique aux règles « Urbain · colis » et « National · colis » de la
   grille standard de démonstration).
   ===================================================================== */
CX.tarif = {
    /* poids volumétrique : L x l x H (cm) / 5000 */
    poidsVolumetrique: function (L, l, H) { return Math.round(((L || 0) * (l || 0) * (H || 0)) / 5000 * 10) / 10; },
    poidsTaxable: function (reel, L, l, H) { return Math.max(reel || 0, CX.tarif.poidsVolumetrique(L, l, H)); },

    /* Transport selon le type de trajet et le poids taxable (kg) */
    transport: function (villeDep, villeDest, poidsTaxable) {
        if (CX.tarifs && CX.tarifs.transportStandard) {
            var m = CX.tarifs.transportStandard(villeDep, villeDest, poidsTaxable);
            if (m != null) return m;
        }
        return CX.tarif.transportIndicatif(villeDep, villeDest, poidsTaxable);
    },
    /* Calcul historique (sans grille) : urbain 1 500 F + 150 F/kg, national 3 000 F + 250 F/kg, arrondi à 100 F */
    transportIndicatif: function (villeDep, villeDest, poidsTaxable) {
        var urbain = villeDep && villeDep === villeDest;
        var base = urbain ? 1500 : 3000, parKg = urbain ? 150 : 250;
        var p = Math.max(1, Math.ceil(poidsTaxable || 0));
        return Math.round((base + Math.max(0, p - 1) * parKg) / 100) * 100;
    },
    livraison: function (codeZone) {
        if (CX.tarifs && CX.tarifs.livraisonStandard) {
            var m = CX.tarifs.livraisonStandard(codeZone);
            if (m != null) return m;
        }
        var z = $.grep(CX.REF.ZONES_LIVRAISON, function (x) { return x.code === codeZone; })[0];
        return z ? z.prix : 0;
    }
};

/* =====================================================================
   Store simulé
   ===================================================================== */
CX.STORAGE_KEY = "cx_commercial_demo_v1";

CX.api = (function () {
    var db = null;

    function load() {
        if (db) return db;
        try { db = JSON.parse(localStorage.getItem(CX.STORAGE_KEY)); } catch (e) { db = null; }
        if (!db || !db.clients) { db = seed(); completer(db); persist(); }
        else if (completer(db)) persist();
        return db;
    }
    /* Collections ajoutées après la première version des maquettes : si le
       navigateur contient déjà des données de démo, on ajoute seulement les
       collections manquantes (le reste des données saisies est conservé). */
    var COLLECTIONS_AJOUTEES = ["tarifaires", "groupesClients", "contrats"];
    /* Rubrique « Apporteurs d'affaires » (ajoutée ensuite, même principe) */
    var COLLECTIONS_APPORTEURS = ["apporteurs", "commissions"];
    function completer(d) {
        var ajout = null, app = null;
        d.seq = d.seq || {};
        $.each(COLLECTIONS_AJOUTEES, function (_, k) {
            if ($.isArray(d[k])) return;
            ajout = ajout || seedTarifs();
            d[k] = ajout[k];
        });
        if (ajout) $.each(ajout.seq, function (k, v) { if (!d.seq[k]) d.seq[k] = v; });
        $.each(COLLECTIONS_APPORTEURS, function (_, k) {
            if ($.isArray(d[k])) return;
            app = app || seedApporteurs();
            d[k] = app[k];
        });
        if (app) {
            $.each(app.seq, function (k, v) { if (!d.seq[k]) d.seq[k] = v; });
            /* rattachement des clients de démo à leurs apporteurs + conditions de facturation
               (uniquement les champs absents : les saisies du navigateur sont conservées) */
            if (d.apporteurs === app.apporteurs) complementsClientsDemo(d.clients || []);
        }
        var semaine = false;
        if (!d.demoSemaine && $.isArray(d.factures) && $.isArray(d.expeditions)) { complementSemaine(d); d.demoSemaine = 1; semaine = true; }
        return !!(ajout || app || semaine);
    }
    /* Jeu de données « semaine » (J-7 à J+4) : factures brouillon / annulée /
       émise cette semaine et cotations récentes, pour remplir tous les onglets. */
    function complementSemaine(d) {
        var U = CX.util, t = U.today(), y = t.substr(0, 4);
        d.seq = d.seq || {};
        function num(coll, pre) { var k = coll + "-" + y; d.seq[k] = (d.seq[k] || 0) + 1; return pre + "-" + y + "-" + ("0000" + d.seq[k]).slice(-4); }
        function nid(coll) { return (d[coll] || []).reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1; }
        $.each([
            { cid: 8, j: -1, statut: "BROUILLON" }, { cid: 4, j: 0, statut: "BROUILLON" },
            { cid: 11, j: -3, statut: "EMISE" }, { cid: 1, j: -5, statut: "ANNULEE" }
        ], function (_, p) {
            var lignes = $.grep(d.expeditions, function (e) { return e.clientId === p.cid && !e.factureId && e.statut === "LIVREE" && e.preuveLivraison && e.montant > 0; }).slice(0, 5);
            if (!lignes.length) return;
            var id = nid("factures"), ht = 0, dateEm = U.addDays(t, p.j), du = lignes[0].dateExp, au = lignes[0].dateExp;
            $.each(lignes, function (_, e) { ht += e.montant; if (e.dateExp < du) du = e.dateExp; if (e.dateExp > au) au = e.dateExp; if (p.statut !== "ANNULEE") e.factureId = id; });
            var tx = U.taxes(ht), c = $.grep(d.clients, function (x) { return x.id === p.cid; })[0] || {};
            var f = {
                id: id, numero: num("factures", "FAC"), clientId: p.cid, dateEmission: dateEm, dateEcheance: U.addDays(dateEm, c.delaiPaiement || 30),
                periodeDu: du, periodeAu: au, expeditionIds: $.map(lignes, function (e) { return e.id; }),
                montantHT: tx.ht, remisePct: 0, remise: 0, tauxTva: tx.taux, tva: tx.tva, montantTTC: tx.ttc,
                statut: p.statut, paiements: [], notes: "", creePar: "Support KuTiWa", dateCreation: dateEm,
                historique: [{ date: dateEm + " 10:15", user: "Support KuTiWa", action: p.statut === "BROUILLON" ? "Brouillon de facture enregistré" : "Facture émise" }]
            };
            if (p.statut === "ANNULEE") {
                f.dateAnnulation = U.addDays(dateEm, 1);
                f.historique.unshift({ date: f.dateAnnulation + " 09:05", user: "Support KuTiWa", action: "Facture annulée - erreur de période, expéditions libérées" });
            }
            d.factures.push(f);
        });
        if ($.isArray(d.cotations) && d.clients.length >= 10) {
            $.each([
                { cid: 10, j: -2, statut: "SOUMISE", nom: "Livraison palettes Bafoussam", mt: 185000 },
                { cid: 6, j: 0, statut: "ENREGISTREE", nom: "Plis urgents Yaoundé - décembre", mt: 36000 }
            ], function (_, p) {
                var c = d.clients[p.cid - 1], dt = U.addDays(t, p.j);
                d.cotations.push({
                    id: nid("cotations"), numero: num("cotations", "COT"), type: "EXPEDITION", nom: p.nom, description: p.nom, clientId: p.cid,
                    statut: p.statut, dateCreation: dt, dateSoumission: p.statut === "ENREGISTREE" ? null : dt, dateValidite: U.addDays(t, 4),
                    creePar: "M. NJOYA", montantHT: p.mt, montantTTC: U.taxes(p.mt).ttc, motifRejet: "",
                    details: { villeDep: "DOUALA", bureauDep: "AKWA", villeDest: p.cid === 10 ? "BAFOUSSAM" : "YAOUNDE", bureauDest: p.cid === 10 ? "CENTRE" : "CENTRALE",
                        livraison: "BUREAU", colis: [{ nature: "Colis", poids: p.cid === 10 ? 120 : 2, L: 40, l: 30, H: 25, nombre: p.cid === 10 ? 4 : 6, valeur: 50000, description: p.nom }],
                        transport: p.mt, emballage: 0, livraisonMt: 0, autres: 0,
                        expediteur: { nom: c.raisonSociale, tel: c.contacts[0].tel1 }, destinataire: { nom: "Agence " + (c.sigle || ""), tel: "" } },
                    historique: [{ date: dt + " 11:00", user: "M. NJOYA", action: "Cotation enregistrée" }]
                });
            });
        }
    }
    function persist() { localStorage.setItem(CX.STORAGE_KEY, JSON.stringify(db)); }
    function ok(v) { return $.Deferred().resolve(JSON.parse(JSON.stringify(v))).promise(); }   // copie défensive
    function ko(v) { return $.Deferred().reject(v).promise(); }

    /* Numérotation : CLI-0001, COT-2026-0001, FAC-2026-0001, RT-2611-00001 */
    function nextNumero(coll) {
        var d = load(), year = CX.util.today().substr(0, 4);
        d.seq = d.seq || {};
        /* séquence annuelle (CLI, COT, FAC, CTR) ou continue (TAR, GRP) */
        var annuelle = coll !== "tarifaires" && coll !== "groupesClients";
        var key = annuelle ? coll + "-" + year : coll;
        d.seq[key] = (d.seq[key] || 0) + 1;
        var n = d.seq[key];
        if (coll === "clients") return "CLI-" + ("0000" + n).slice(-4);
        if (coll === "cotations") return "COT-" + year + "-" + ("0000" + n).slice(-4);
        if (coll === "factures") return "FAC-" + year + "-" + ("0000" + n).slice(-4);
        if (coll === "contrats") return "CTR-" + year + "-" + ("0000" + n).slice(-4);
        if (coll === "tarifaires") return "TAR-" + ("0000" + n).slice(-4);
        if (coll === "groupesClients") return "GRP-" + ("000" + n).slice(-3);
        if (coll === "commissions") return "COM-" + year + "-" + ("0000" + n).slice(-4);
        return coll.toUpperCase() + "-" + n;
    }

    return {
        /* filtre : fonction(row) -> bool, optionnelle */
        list: function (coll, filtre) {
            var rows = load()[coll] || [];
            return ok(filtre ? $.grep(rows, filtre) : rows);
        },
        get: function (coll, id) {
            var r = $.grep(load()[coll] || [], function (x) { return x.id == id; })[0];
            return r ? ok(r) : ko("Élément introuvable (" + coll + " #" + id + ")");
        },
        save: function (coll, obj) {
            var d = load(), list = d[coll] = d[coll] || [];
            obj = JSON.parse(JSON.stringify(obj));
            if (obj.id) {
                for (var i = 0; i < list.length; i++) if (list[i].id == obj.id) { list[i] = obj; break; }
            } else {
                obj.id = list.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
                if (!obj.numero) obj.numero = nextNumero(coll);
                if ((coll === "clients" || coll === "tarifaires" || coll === "groupesClients") && !obj.code) obj.code = obj.numero;
                obj.dateCreation = obj.dateCreation || CX.util.today();
                obj.creePar = obj.creePar || CX.CONFIG.USER.nom;
                list.push(obj);
            }
            persist();
            return ok(obj);
        },
        /* Mise à jour partielle de plusieurs éléments : ids = [..], patch = {..} */
        patchMany: function (coll, ids, patch) {
            var d = load();
            var wanted = {}; $.each(ids || [], function (_, id) { wanted[String(id)] = true; });   // "12" ou 12 indifféremment
            $.each(d[coll] || [], function (_, r) { if (wanted[String(r.id)]) $.extend(r, patch); });
            persist();
            return ok(true);
        },
        remove: function (coll, id) {
            var d = load();
            d[coll] = $.grep(d[coll] || [], function (x) { return x.id != id; });
            persist();
            return ok(true);
        },
        /* Ajoute une entrée d'historique à un élément */
        log: function (coll, id, action) {
            var r = $.grep(load()[coll] || [], function (x) { return x.id == id; })[0];
            if (!r) return ko("introuvable");
            r.historique = r.historique || [];
            r.historique.unshift({ date: CX.util.now(), user: CX.CONFIG.USER.nom, action: action });
            persist();
            return ok(r);
        },
        reset: function () { localStorage.removeItem(CX.STORAGE_KEY); db = null; load(); return ok(true); },

        /* Aides de lecture fréquentes (synchrones, pour les rendus) */
        clientNom: function (id) {
            var c = $.grep(load().clients, function (x) { return x.id == id; })[0];
            return c ? c.raisonSociale : "";
        },
        clientsSync: function () { return load().clients; },
        /* Copie synchrone d'une collection (moteur de tarifs, rendus) */
        listSync: function (coll) { return JSON.parse(JSON.stringify(load()[coll] || [])); }
    };

    /* -----------------------------------------------------------------
       Jeu de données de démonstration
       ----------------------------------------------------------------- */
    function seed() {
        var today = CX.util.today();
        function d(n) { return CX.util.addDays(today, -n); }

        var clients = [
            cli(1, "CLI-0001", "PHARMACIE PACIFIC", "PPAC", "Pharmacie / Santé", "DOUALA", true, false, 1, "Mme Ngo Bassa Esther", "699 12 34 56", "achats@pharmaciepacific.cm", 45),
            cli(2, "CLI-0002", "MESSA PRESSE (JOUR)", "MESSA", "Presse / Médias", "DOUALA", true, true, 2, "M. Eyango Paul", "677 45 22 10", "logistique@messapresse.cm", 30),
            cli(3, "CLI-0003", "SOCIETE PARTHENON", "PARTH", "Commerce / Distribution", "YAOUNDE", true, false, 4, "M. Abena Joseph", "690 33 11 02", "contact@parthenon.cm", 30),
            cli(4, "CLI-0004", "LABORATOIRE CARINE MONGOUE", "LCM", "Pharmacie / Santé", "DOUALA", true, false, 1, "Dr Carine Mongoue", "655 01 02 03", "labo@carinemongoue.cm", 15),
            cli(5, "CLI-0005", "AZUR", "", "Industrie", "DOUALA", false, false, 1, "M. Tchoua André", "693 41 41 41", "azur@azur.cm", 0),
            cli(6, "CLI-0006", "TOTAL ENERGIES MARKETING CAMEROUN", "TEMC", "Énergie", "DOUALA", true, false, 2, "Mme Fotso Clarisse", "699 80 70 60", "courrier.cm@totalenergies.com", 60),
            cli(7, "CLI-0007", "ORANGE CAMEROUN", "OCM", "Télécoms", "DOUALA", true, true, 2, "M. Biyong Serge", "699 00 00 07", "servicecourrier@orange.cm", 45),
            cli(8, "CLI-0008", "HOPITAL LAQUINTINIE", "HLD", "Pharmacie / Santé", "DOUALA", true, false, 1, "M. Ewane Samuel", "677 77 66 55", "dg@laquintinie.cm", 30),
            cli(9, "CLI-0009", "CABINET MBARGA & ASSOCIES", "CMA", "Services", "YAOUNDE", false, false, 5, "Me Mbarga Hervé", "677 10 20 30", "secretariat@cabinetmbarga.cm", 0),
            cli(10, "CLI-0010", "BRASSERIES DU CAMEROUN", "SABC", "Industrie", "DOUALA", true, false, 3, "Mme Ekotto Rose", "690 55 44 33", "achats@sabc.cm", 45),
            cli(11, "CLI-0011", "AFRILAND FIRST BANK", "AFB", "Banque / Assurance", "YAOUNDE", true, false, 4, "M. Nkoulou Jean", "677 90 80 70", "moyensgeneraux@afriland.cm", 30),
            cli(12, "CLI-0012", "ENTREPRISE TEST MAJ", "", "Autre", "DOUALA", false, false, 1, "", "+237 699 000 001", "", 0)
        ];
        clients[4].statut = "ACTIF";
        clients[11].statut = "INACTIF";
        clients[8].statut = "SUSPENDU";

        /* Expéditions des 2 derniers mois pour les clients en compte */
        var exps = [], id = 0, carnetSeq = { 1: 456101, 6: 100063, 10: 780034 };
        var dests = ["YAOUNDE", "BAFOUSSAM", "GAROUA", "KRIBI", "LIMBE", "BUEA", "DOUALA", "NGAOUNDERE"];
        var contenus = ["Documents administratifs", "Médicaments", "Journaux", "Pièces détachées", "Échantillons", "Plis confidentiels", "Cartons de produits", "Matériel informatique"];
        var noms = ["NANA Brice", "ETOGA Marie", "MBALLA Luc", "FOTSO Alain", "NJOYA Aïcha", "BELLO Ibrahim", "KAMGA Odile", "ATANGANA Paul"];
        $.each([1, 2, 3, 4, 6, 7, 8, 10, 11], function (_, cid) {
            var c = clients[cid - 1], nb = 4 + (cid * 7) % 9;
            for (var k = 0; k < nb; k++) {
                id++;
                var age = (cid * 11 + k * 6) % 58 + 1;
                var dest = dests[(cid + k) % dests.length];
                var dep = c.ville;
                if (dest === dep) dest = dep === "DOUALA" ? "YAOUNDE" : "DOUALA";
                var poids = ((cid + k) % 7) + 1;
                var montant = CX.tarif.transportIndicatif(dep, dest, poids) + ((k % 3 === 0) ? 2500 : 0);
                var nRtMan = carnetSeq[cid] ? String(carnetSeq[cid]++) : null;
                var depAg = CX.REF.agencesDe(dep)[0], destAg = CX.REF.agencesDe(dest)[0];
                exps.push({
                    id: id,
                    nRt: "RT-" + d(age).substr(2, 2) + d(age).substr(5, 2) + "-" + ("00000" + (1200 + id)).slice(-5),
                    nRtMan: nRtMan,
                    clientId: cid,
                    dateExp: d(age),
                    dateLivraison: age > 3 ? d(age - 2) : null,
                    villeDep: dep, bureauDep: depAg ? depAg.nom : "",
                    villeDest: dest, bureauDest: destAg ? destAg.nom : "",
                    expediteur: c.raisonSociale,
                    destinataire: noms[(cid + k) % noms.length],
                    telDestinataire: "6" + (70000000 + id * 1234567 % 29999999),
                    contenu: contenus[(cid * 3 + k) % contenus.length],
                    nbColis: 1 + (k % 3),
                    poids: poids,
                    montant: (k % 11 === 5) ? 0 : montant,          // 0 = montant à régulariser
                    statut: age > 3 ? "LIVREE" : "EN_TRANSIT",
                    preuveLivraison: age > 3 && (k % 9 !== 4),       // décharge (feuille originale) revenue au siège
                    factureId: null
                });
            }
        });

        /* Factures déjà émises : on facture le mois précédent de quelques clients */
        var factures = [], fid = 0, moisPrec = CX.util.addDays(CX.util.firstOfMonth(today), -1);
        var du = CX.util.firstOfMonth(moisPrec), au = CX.util.lastOfMonth(moisPrec);
        var plan = [
            { cid: 2, statut: "PAYEE" }, { cid: 6, statut: "PARTIELLE" }, { cid: 7, statut: "ENVOYEE" },
            { cid: 10, statut: "EMISE" }, { cid: 3, statut: "ENVOYEE", retard: true }
        ];
        $.each(plan, function (_, p) {
            var lignes = $.grep(exps, function (e) {
                return e.clientId === p.cid && e.dateExp >= du && e.dateExp <= au && e.montant > 0 && e.preuveLivraison;
            });
            if (!lignes.length) return;
            fid++;
            var ht = 0; $.each(lignes, function (_, e) { ht += e.montant; e.factureId = fid; });
            var t = CX.util.taxes(ht);
            var dateEm = p.retard ? CX.util.addDays(au, -20) : CX.util.addDays(au, 2);
            var delai = clients[p.cid - 1].delaiPaiement || 30;
            var f = {
                id: fid, numero: "FAC-" + today.substr(0, 4) + "-" + ("0000" + fid).slice(-4),
                clientId: p.cid, dateEmission: dateEm, dateEcheance: CX.util.addDays(dateEm, delai),
                periodeDu: du, periodeAu: au, expeditionIds: $.map(lignes, function (e) { return e.id; }),
                montantHT: t.ht, remisePct: 0, remise: 0, tauxTva: t.taux, tva: t.tva, montantTTC: t.ttc,
                statut: p.statut, paiements: [], notes: "", creePar: "Support KuTiWa", dateCreation: dateEm,
                historique: [{ date: dateEm + " 09:30", user: "Support KuTiWa", action: "Facture émise" }]
            };
            if (p.statut === "PAYEE") f.paiements.push({ date: CX.util.addDays(dateEm, 12), montant: t.ttc, mode: "Virement", reference: "VIR-88231" });
            if (p.statut === "PARTIELLE") f.paiements.push({ date: CX.util.addDays(dateEm, 8), montant: Math.round(t.ttc / 2), mode: "Chèque", reference: "CHQ 0045512" });
            factures.push(f);
        });

        var cotations = [
            cot(1, "COT-" + today.substr(0, 4) + "-0001", "EXPEDITION", "Envoi mensuel échantillons", 4, "ENREGISTREE", 1, 18500),
            cot(2, "COT-" + today.substr(0, 4) + "-0002", "FRET", "Mise à dispo camion 10 t - inventaire", 10, "SOUMISE", 3, 450000),
            cot(3, "COT-" + today.substr(0, 4) + "-0003", "TARIFAIRE", "Grille 2027 - réseau national", 11, "VALIDEE", 6, 0),
            cot(4, "COT-" + today.substr(0, 4) + "-0004", "EXPEDITION", "Plis confidentiels Yaoundé", 9, "EN_ATTENTE", 4, 12000),
            cot(5, "COT-" + today.substr(0, 4) + "-0005", "EXPEDITION", "Cartons promotionnels", 5, "REJETEE", 12, 64000),
            cot(6, "COT-" + today.substr(0, 4) + "-0006", "FRET", "Fourgonnette journée Douala", 1, "ACCEPTEE", 15, 85000),
            cot(7, "COT-" + today.substr(0, 4) + "-0007", "EXPEDITION", "Matériel informatique Garoua", 8, "ENREGISTREE", 0, 42500),
            cot(8, "COT-" + today.substr(0, 4) + "-0008", "TARIFAIRE", "Tarifs spéciaux pharmacie", 1, "SOUMISE", 2, 0),
            cot(9, "COT-" + today.substr(0, 4) + "-0009", "EXPEDITION", "Retour matériel défectueux", 7, "ANNULEE", 20, 9500)
        ];

        var year = today.substr(0, 4), seq = {};
        seq["clients-" + year] = clients.length;
        seq["cotations-" + year] = cotations.length;
        seq["factures-" + year] = fid;
        var tar = seedTarifs();
        $.extend(seq, tar.seq);
        var app = seedApporteurs();
        $.extend(seq, app.seq);
        complementsClientsDemo(clients);
        return {
            clients: clients, expeditions: exps, factures: factures, cotations: cotations,
            tarifaires: tar.tarifaires, groupesClients: tar.groupesClients, contrats: tar.contrats,
            apporteurs: app.apporteurs, commissions: app.commissions, seq: seq
        };

        function cli(id, code, rs, sigle, secteur, ville, enCompte, forfait, agenceId, contact, tel, email, delai) {
            return {
                id: id, code: code, numero: code, raisonSociale: rs, sigle: sigle, secteur: secteur,
                rccm: enCompte ? "RC/" + (ville === "DOUALA" ? "DLA" : "YAO") + "/20" + (10 + id) + "/B/" + (1000 + id * 37) : "",
                niu: enCompte ? "M0" + (10000000000 + id * 7919) + "Z" : "",
                ville: ville, localisation: ville === "DOUALA" ? "Akwa, Rue " + (id * 3) + " Joss" : "Centre-ville",
                telStandard: "233 " + (40 + id) + " " + (20 + id) + " " + (30 + id), email: email,   // 9 chiffres
                adresse: "BP " + (1000 + id * 11) + " " + ville, activites: secteur, note: "",
                contacts: [
                    { role: "PRINCIPAL", nom: contact, tel1: tel, tel2: "", email: email, titre: "Responsable courrier" },
                    { role: "SECOND", nom: "", tel1: "", tel2: "", email: "", titre: "" },
                    { role: "DG", nom: "", tel1: "", tel2: "", email: "" }
                ],
                enCompte: enCompte, forfait: forfait, montantForfait: forfait ? 250000 : 0,
                tarifAuto: enCompte, tarifToutesAgences: enCompte && id % 2 === 0, tarifAgences: enCompte && id % 2 ? [agenceId] : [],
                remisePct: enCompte ? (id % 3) * 5 : 0, delaiPaiement: delai, periodicite: "MENSUELLE", plafondCredit: enCompte ? 2000000 : 0,
                emailFacturation: email, agenceId: agenceId, commercial: "Support KuTiWa",
                ficheClient: enCompte ? "fiche-" + code.toLowerCase() + ".pdf" : null,
                statut: "ACTIF", dateCreation: d(200 - id * 9), creePar: "Support KuTiWa",
                historique: [{ date: d(200 - id * 9) + " 10:00", user: "Support KuTiWa", action: "Création du compte client" }]
            };
        }
        function cot(id, num, type, nom, clientId, statut, age, montant) {
            var c = clients[clientId - 1];
            var o = {
                id: id, numero: num, type: type, nom: nom, clientId: clientId, description: nom,
                statut: statut, dateCreation: d(age + 2), dateSoumission: statut === "ENREGISTREE" ? null : d(age),
                dateValidite: CX.util.addDays(d(age), 30), creePar: id % 2 ? "Support KuTiWa" : "M. NJOYA",
                montantHT: montant, montantTTC: CX.util.taxes(montant).ttc, motifRejet: statut === "REJETEE" ? "Tarif jugé trop élevé par le client" : "",
                details: {}, historique: [{ date: d(age + 2) + " 11:00", user: "Support KuTiWa", action: "Cotation enregistrée" }]
            };
            if (type === "EXPEDITION") {
                o.details = {
                    villeDep: c.ville, bureauDep: "AKWA", villeDest: c.ville === "DOUALA" ? "YAOUNDE" : "DOUALA", bureauDest: "CENTRALE",
                    livraison: "BUREAU", colis: [{ nature: "Colis", poids: 4, L: 40, l: 30, H: 25, nombre: 1, valeur: 25000, description: nom }],
                    transport: montant, emballage: 0, livraisonMt: 0, autres: 0,
                    expediteur: { nom: c.raisonSociale, tel: c.contacts[0].tel1 }, destinataire: { nom: "Agence " + c.sigle, tel: "" }
                };
            } else if (type === "FRET") {
                o.details = { vehicule: "Camion 10 t", dateDebut: CX.util.addDays(today, 7), nbJours: 2, villeDep: "DOUALA", villeDest: "YAOUNDE", chauffeur: true, carburant: true, manutention: 2, prixJour: montant / 2 };
            } else {
                o.details = { lignes: [
                    { villeDep: "DOUALA", villeDest: "YAOUNDE", tranche: "0 - 1 kg", prix: 2500 },
                    { villeDep: "DOUALA", villeDest: "YAOUNDE", tranche: "1 - 5 kg", prix: 4500 },
                    { villeDep: "DOUALA", villeDest: "BAFOUSSAM", tranche: "0 - 1 kg", prix: 3000 },
                    { villeDep: "DOUALA", villeDest: "GAROUA", tranche: "0 - 1 kg", prix: 6000 }
                ], dateEffet: CX.util.addDays(today, 30) };
            }
            return o;
        }
    }

    /* -----------------------------------------------------------------
       Données de démonstration de la rubrique « Tarifaires »
       (grilles, groupes de clients, contrats). Les règles sont décrites
       dans assets/cx-tarifs.js (modèle de données en tête de fichier).
       ----------------------------------------------------------------- */
    function seedTarifs() {
        var today = CX.util.today(), U = CX.util, year = today.substr(0, 4);
        function d(n) { return U.addDays(today, n); }
        function per(o) {
            return $.extend({ typeTrajet: "", villesDep: [], villesDest: [], bidirectionnel: true, zones: [], typesEnvoi: [], natures: [], poidsMin: "", poidsMax: "" }, o);
        }
        function regle(id, libelle, perimetre, modele, params, cumulable) {
            return { id: id, libelle: libelle, actif: true, cumulable: !!cumulable, perimetre: per(perimetre), modele: modele, params: params };
        }
        function grille(o) {
            return $.extend({
                description: "", devise: "FCFA", baseId: null, remiseBasePct: 0, heriterSupplements: false,
                diviseurVol: 5000, minimum: 0, arrondi: 100, arrondiMode: "SUP", tvaIncluse: false, regles: [],
                supplements: { natures: [], livraison: [], express: { actif: false, mode: "PCT", valeur: 0 }, emballage: { actif: false, mode: "PAR_COLIS", valeur: 0 } },
                affectation: { clientIds: [], groupeIds: [] }, creePar: "Support KuTiWa", dateCreation: d(-340),
                historique: [{ date: d(-340) + " 09:00", user: "Support KuTiWa", action: "Grille créée" }]
            }, o);
        }
        var debutAnnee = year + "-01-01";

        var tarifaires = [
            /* 1. Grille standard nationale : reprend le tarif indicatif historique (urbain / national)
                  et le complète (plis, Grand Nord, fret, CEMAC, international, assurance). */
            grille({
                id: 1, code: "TAR-0001", numero: "TAR-0001", nom: "Grille standard nationale " + year, type: "STANDARD", statut: "ACTIVE",
                description: "Tarif public du réseau, appliqué à tout client sans contrat ni grille spécifique.",
                du: debutAnnee, au: "", minimum: 1500, arrondi: 100, arrondiMode: "PROCHE",
                regles: [
                    regle("s1", "Urbain · plis et documents", { typeTrajet: "URBAIN", typesEnvoi: ["DOCUMENT"], poidsMax: 2 }, "PIECE",
                        { prix: 1000, degressif: [{ des: 10, prix: 800 }, { des: 50, prix: 600 }] }),
                    regle("s2", "Urbain · colis", { typeTrajet: "URBAIN" }, "INCREMENTIEL", { prixBase: 1500, poidsBase: 1, increment: 150, pas: 1 }),
                    regle("s3", "National · plis et documents", { typeTrajet: "NATIONAL", typesEnvoi: ["DOCUMENT"], poidsMax: 2 }, "TRANCHES",
                        { tranches: [{ max: 0.5, prix: 2000 }, { max: 1, prix: 2500 }, { max: 2, prix: 3500 }], auDelaParKg: 0, auDelaPas: 1 }),
                    regle("s4", "National · colis", { typeTrajet: "NATIONAL" }, "INCREMENTIEL", { prixBase: 3000, poidsBase: 1, increment: 250, pas: 1 }),
                    regle("s5", "Grand Nord (Garoua, Ngaoundéré, Maroua)", {
                        typeTrajet: "NATIONAL", villesDep: ["DOUALA", "YAOUNDE"], villesDest: ["GAROUA", "NGAOUNDERE", "MAROUA"], typesEnvoi: ["COLIS"]
                    }, "TRANCHES", {
                        tranches: [{ max: 1, prix: 4500 }, { max: 5, prix: 7500 }, { max: 10, prix: 11000 }, { max: 20, prix: 17000 }, { max: 30, prix: 23000 }],
                        auDelaParKg: 600, auDelaPas: 1
                    }),
                    regle("s6", "Fret national (messagerie lourde)", { typeTrajet: "NATIONAL", typesEnvoi: ["FRET"] }, "PALIERS", {
                        paliers: [{ max: 50, prixKg: 300 }, { max: 200, prixKg: 250 }, { max: "", prixKg: 200 }], mode: "CUMULATIF", priseEnCharge: 5000, minimum: 15000
                    }),
                    regle("s7", "Régional · zone CEMAC", { typeTrajet: "REGIONAL", zones: ["CEMAC"] }, "AU_KG", { prixKg: 4500, minimum: 15000, pasKg: 0.5 }),
                    regle("s8", "International", { typeTrajet: "INTERNATIONAL" }, "INCREMENTIEL", { prixBase: 25000, poidsBase: 0.5, increment: 6000, pas: 0.5 }),
                    regle("s9", "Assurance ad valorem", {}, "AD_VALOREM", { taux: 1, minimum: 1000 }, true)
                ],
                supplements: {
                    natures: [{ nature: "Fragile", mode: "PCT", valeur: 25 }, { nature: "Alimentaire", mode: "PCT", valeur: 15 },
                        { nature: "Électronique", mode: "PCT", valeur: 10 }, { nature: "Médicament", mode: "FIXE", valeur: 1000 }],
                    livraison: [{ zone: "Z1", prix: 1500 }, { zone: "Z2", prix: 2500 }, { zone: "Z3", prix: 4000 }],
                    express: { actif: true, mode: "PCT", valeur: 50 },
                    emballage: { actif: true, mode: "PAR_COLIS", valeur: 500 }
                }
            }),
            /* 2. Grille de groupe : pharmacies, laboratoires, hôpitaux (base standard - 10 %) */
            grille({
                id: 2, code: "TAR-0002", numero: "TAR-0002", nom: "Pharmacies & santé", type: "GROUPE", statut: "ACTIVE",
                description: "Médicaments au poids par pas de 0,5 kg ; le reste au tarif standard remisé de 10 %.",
                du: debutAnnee, au: year + "-12-31", baseId: 1, remiseBasePct: 10, heriterSupplements: true,
                regles: [
                    regle("p1", "Médicaments · national", { typeTrajet: "NATIONAL", natures: ["Médicament"] }, "INCREMENTIEL",
                        { prixBase: 2800, poidsBase: 1, increment: 200, pas: 0.5 }),
                    regle("p2", "Médicaments · urbain", { typeTrajet: "URBAIN", natures: ["Médicament"] }, "AU_KG", { prixKg: 300, minimum: 1200, pasKg: 1 })
                ],
                affectation: { clientIds: [], groupeIds: [1] }
            }),
            /* 3. Grille propre à PHARMACIE PACIFIC, attachée à son contrat */
            grille({
                id: 3, code: "TAR-0003", numero: "TAR-0003", nom: "PHARMACIE PACIFIC - contrat " + year, type: "CLIENT", statut: "ACTIVE",
                description: "Navette Douala ⇄ Yaoundé au palier atteint, plis urbains à la pièce ; le reste : grille Pharmacies & santé.",
                du: d(-330), au: d(20), baseId: 2, remiseBasePct: 0, heriterSupplements: true, arrondi: 100, arrondiMode: "SUP",
                regles: [
                    regle("c1", "Navette Douala ⇄ Yaoundé", { typeTrajet: "NATIONAL", villesDep: ["DOUALA"], villesDest: ["YAOUNDE"], typesEnvoi: ["COLIS"] }, "PALIERS", {
                        paliers: [{ max: 5, prixKg: 700 }, { max: 20, prixKg: 500 }, { max: "", prixKg: 400 }], mode: "ATTEINT", priseEnCharge: 0, minimum: 2500
                    }),
                    regle("c2", "Plis urbains Douala", { typeTrajet: "URBAIN", villesDep: ["DOUALA"], typesEnvoi: ["DOCUMENT"] }, "PIECE", { prix: 700, degressif: [] })
                ],
                affectation: { clientIds: [1], groupeIds: [] }
            }),
            /* 4. Banques : plis et documents (base standard pour les colis) */
            grille({
                id: 4, code: "TAR-0004", numero: "TAR-0004", nom: "Banques · plis et documents", type: "GROUPE", statut: "ACTIVE",
                description: "Courrier bancaire : plis à la pièce (dégressif) en urbain, par tranches en national.",
                du: debutAnnee, au: "", baseId: 1, remiseBasePct: 0, heriterSupplements: true, minimum: 500,
                regles: [
                    regle("b1", "Plis urbains", { typeTrajet: "URBAIN", typesEnvoi: ["DOCUMENT"] }, "PIECE",
                        { prix: 800, degressif: [{ des: 20, prix: 650 }, { des: 100, prix: 500 }] }),
                    regle("b2", "Plis nationaux", { typeTrajet: "NATIONAL", typesEnvoi: ["DOCUMENT"] }, "TRANCHES",
                        { tranches: [{ max: 0.5, prix: 1800 }, { max: 1, prix: 2200 }, { max: 2, prix: 3000 }], auDelaParKg: 400, auDelaPas: 1 })
                ],
                affectation: { clientIds: [], groupeIds: [2] }
            }),
            /* 5. Projet de grille standard de l'année suivante (brouillon, majoration de 5 %) */
            grille({
                id: 5, code: "TAR-0005", numero: "TAR-0005", nom: "Grille standard " + (Number(year) + 1) + " (projet)", type: "STANDARD", statut: "BROUILLON",
                description: "Projet : tarif standard majoré de 5 %, international revu.",
                du: (Number(year) + 1) + "-01-01", au: "", baseId: 1, remiseBasePct: -5, heriterSupplements: true, minimum: 1500, arrondiMode: "PROCHE",
                regles: [regle("n1", "International", { typeTrajet: "INTERNATIONAL" }, "INCREMENTIEL", { prixBase: 27000, poidsBase: 0.5, increment: 6500, pas: 0.5 })],
                dateCreation: d(-10), historique: [{ date: d(-10) + " 15:20", user: "M. NJOYA", action: "Grille créée (brouillon)" }]
            })
        ];

        var groupesClients = [
            { id: 1, code: "GRP-001", numero: "GRP-001", nom: "Pharmacies & laboratoires", description: "Officines, laboratoires d'analyses et hôpitaux du réseau",
              clientIds: [1, 4, 8], dateCreation: d(-340), creePar: "Support KuTiWa" },
            { id: 2, code: "GRP-002", numero: "GRP-002", nom: "Banques & assurances", description: "Établissements bancaires et compagnies d'assurance",
              clientIds: [11], dateCreation: d(-300), creePar: "Support KuTiWa" }
        ];

        function ctr(id, numero, clientId, objet, sig, du, au, tarifaireId, fichier, cond, statut, extra) {
            return $.extend({
                id: id, numero: numero, clientId: clientId, objet: objet, dateSignature: sig, du: du, au: au, tarifaireId: tarifaireId,
                fichier: fichier, fichierTaille: fichier ? 245760 : 0, conditions: cond, statut: statut,
                dateCreation: sig, creePar: "Support KuTiWa",
                historique: [{ date: sig + " 10:30", user: "Support KuTiWa", action: "Contrat enregistré" }]
            }, extra || {});
        }
        var contrats = [
            ctr(1, "CTR-" + year + "-0001", 1, "Contrat cadre de messagerie " + year, d(-335), d(-330), d(20), 3, "contrat-ppac-" + year + ".pdf",
                { delaiPaiement: 45, remisePct: 0, plafondCredit: 2000000, notes: "Révision tarifaire possible au renouvellement." }, "ACTIF"),
            ctr(2, "CTR-" + (Number(year) - 1) + "-0007", 1, "Contrat de messagerie " + (Number(year) - 1), d(-700), d(-695), d(-331), 2, "contrat-ppac-" + (Number(year) - 1) + ".pdf",
                { delaiPaiement: 30, remisePct: 5, plafondCredit: 1500000, notes: "" }, "ACTIF"),
            ctr(3, "CTR-" + year + "-0002", 11, "Convention courrier bancaire", d(-120), d(-100), d(265), 4, "convention-afriland.pdf",
                { delaiPaiement: 30, remisePct: 0, plafondCredit: 3000000, notes: "Ramassage quotidien à 16 h au siège." }, "ACTIF"),
            ctr(4, "CTR-" + year + "-0003", 6, "Contrat de distribution régionale", d(-200), d(-190), d(175), 1, null,
                { delaiPaiement: 60, remisePct: 8, plafondCredit: 0, notes: "" }, "RESILIE",
                { dateResiliation: d(-40), motifResiliation: "Fin de la campagne de distribution" })
        ];

        var seq = { tarifaires: tarifaires.length, groupesClients: groupesClients.length };
        seq["contrats-" + year] = 3;
        return { tarifaires: tarifaires, groupesClients: groupesClients, contrats: contrats, seq: seq };
    }

    /* -----------------------------------------------------------------
       Données de démonstration « Apporteurs d'affaires »
       Code = CRS + n° d'ordre + code de la ville d'affectation (CRS513DLA).
       Les commissions (collection « commissions ») sont créées par
       commissions.html quand une commission est marquée payée.
       ----------------------------------------------------------------- */
    function seedApporteurs() {
        var today = CX.util.today();
        function d(n) { return CX.util.addDays(today, -n); }
        function app(id, n, matricule, type, nom, prenoms, sexe, naissance, tel1, tel2, email, adresse, ville, agenceId, taux, base, statut, age) {
            var code = "CRS" + n + CX.REF.villeCode(ville);
            return {
                id: id, code: code, numero: code, matricule: matricule, type: type, nom: nom, prenoms: prenoms, sexe: sexe,
                dateNaissance: naissance, tel1: tel1, tel2: tel2, email: email, adresse: adresse, ville: ville, agenceId: agenceId,
                tauxCommission: taux, baseCommission: base, statut: statut, notes: "",
                dateCreation: d(age), creePar: "Support KuTiWa",
                historique: [{ date: d(age) + " 09:15", user: "Support KuTiWa", action: "Apporteur d'affaires enregistré" }]
                    .concat(statut === "SUSPENDU" ? [{ date: d(20) + " 16:40", user: "Support KuTiWa", action: "Apporteur suspendu - contrat d'agent non renouvelé" }] : [])
            };
        }
        var apporteurs = [
            app(1, 502, "MAT-2018-0142", "COMMERCIAL", "NANA", "Brice Arnaud", "M", "1988-04-12", "699 45 12 78", "", "b.nana@solex.cm", "Bonapriso, rue Njo-Njo", "DOUALA", 1, 3, "FACTURE", "ACTIF", 420),
            app(2, 503, "AGT-0031", "AGENT", "EKOTTO", "Marie-Claire", "F", "1991-09-03", "677 21 08 55", "655 10 20 30", "mc.ekotto@gmail.com", "Akwa Nord", "DOUALA", 2, 5, "ENCAISSE", "ACTIF", 380),
            app(3, 504, "PART-0007", "PARTENAIRE", "MBARGA", "Thierry", "M", "1979-01-27", "690 87 44 12", "", "contact@medicaconseil.cm", "Bali, BP 3310 Douala", "DOUALA", 1, 4, "FACTURE", "ACTIF", 300),
            app(4, 505, "MAT-2020-0210", "COMMERCIAL", "ABENA", "Josiane", "F", "1993-06-18", "699 30 41 52", "", "j.abena@solex.cm", "Bastos, Yaoundé", "YAOUNDE", 4, 3, "FACTURE", "ACTIF", 290),
            app(5, 506, "AGT-0044", "AGENT", "ONANA", "Serge Patrice", "M", "1985-11-02", "677 55 66 77", "", "serge.onana@yahoo.fr", "Mvan, Yaoundé", "YAOUNDE", 6, 5, "ENCAISSE", "ACTIF", 240),
            app(6, 507, "AGT-0052", "AGENT", "FOTSO", "Gisèle", "F", "1990-02-14", "696 12 13 14", "", "gisele.fotso@gmail.com", "Marché A, Bafoussam", "BAFOUSSAM", 7, 4, "FACTURE", "ACTIF", 210),
            app(7, 508, "MAT-2021-0305", "COMMERCIAL", "BELLO", "Ibrahim", "M", "1987-07-30", "699 70 80 90", "", "i.bello@solex.cm", "Quartier Plateau, Garoua", "GAROUA", 8, 3, "FACTURE", "ACTIF", 190),
            app(8, 509, "AGT-0058", "AGENT", "ESSOMBA", "Rodrigue", "M", "1994-12-09", "650 11 22 33", "", "r.essomba@gmail.com", "Kribi centre", "KRIBI", 9, 5, "ENCAISSE", "SUSPENDU", 160),
            app(9, 510, "PAR-0003", "PARRAIN", "KAMGA", "Odile", "F", "1982-03-21", "677 77 66 55", "", "odile.kamga@pharmaciepacific.cm", "Akwa, Douala", "DOUALA", 1, 2, "ENCAISSE", "ACTIF", 120),
            app(10, 511, "AGT-0061", "AGENT", "TABI", "Emmanuel", "M", "1989-08-05", "670 45 45 45", "", "emmanuel.tabi@gmail.com", "Down Beach, Limbé", "LIMBE", 10, 4, "FACTURE", "ACTIF", 90),
            app(11, 512, "PART-0011", "PARTENAIRE", "NJOYA", "Aïcha", "F", "1986-05-16", "699 01 23 45", "", "a.njoya@transitplus.cm", "Elig-Essono, Yaoundé", "YAOUNDE", 5, 3.5, "FACTURE", "ACTIF", 60),
            app(12, 513, "MAT-2024-0412", "COMMERCIAL", "ETOGA", "Marie", "F", "1996-10-11", "655 98 76 54", "", "m.etoga@solex.cm", "Bonabéri, Douala", "DOUALA", 3, 3, "FACTURE", "ACTIF", 30)
        ];
        return { apporteurs: apporteurs, commissions: [], seq: { apporteurs: 513 } };
    }

    /* Compléments des clients de démo (n° de compte, conditions de facturation,
       apporteur) : n'écrase jamais un champ déjà renseigné. */
    function complementsClientsDemo(clients) {
        var demo = {
            1: { apporteurId: 2 },
            2: { apporteurId: 1 },
            3: { apporteurId: 4 },
            4: { apporteurId: 3 },
            6: { apporteurId: 1, abonnementIs: true, tauxIs: 2.2, afficherPuMoyen: true, sousTotal: "DESTINATION" },
            7: { apporteurId: 1, abonnementIs: true, tauxIs: 2.2, assurance: 5000 },
            8: { apporteurId: 3, avecTva: false },
            10: { apporteurId: 2, manutention: 5000, emballage: 2500, afficherPuMoyen: true },
            11: { apporteurId: 4, abonnementIs: true, tauxIs: 2.2, sousTotal: "DEPART" }
        };
        $.each(clients, function (_, c) {
            if (!c || !c.id || c.id > 12) return;
            var ajout = $.extend({ compte: "411" + ("00000" + c.id).slice(-5) }, demo[c.id] || {});
            $.each(ajout, function (k, v) { if (c[k] == null) c[k] = v; });
        });
    }
})();

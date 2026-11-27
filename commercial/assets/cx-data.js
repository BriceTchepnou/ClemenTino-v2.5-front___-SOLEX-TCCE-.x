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
   Tarification indicative (démo) - à remplacer par le moteur de tarifs
   réel (route Symfony /commercial/tarif/calcul).
   ===================================================================== */
CX.tarif = {
    /* poids volumétrique : L x l x H (cm) / 5000 */
    poidsVolumetrique: function (L, l, H) { return Math.round(((L || 0) * (l || 0) * (H || 0)) / 5000 * 10) / 10; },
    poidsTaxable: function (reel, L, l, H) { return Math.max(reel || 0, CX.tarif.poidsVolumetrique(L, l, H)); },

    /* Transport selon le type de trajet et le poids taxable (kg) */
    transport: function (villeDep, villeDest, poidsTaxable) {
        var urbain = villeDep && villeDep === villeDest;
        var base = urbain ? 1500 : 3000, parKg = urbain ? 150 : 250;
        var p = Math.max(1, Math.ceil(poidsTaxable || 0));
        return Math.round((base + Math.max(0, p - 1) * parKg) / 100) * 100;
    },
    livraison: function (codeZone) {
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
        if (!db || !db.clients) { db = seed(); persist(); }
        return db;
    }
    function persist() { localStorage.setItem(CX.STORAGE_KEY, JSON.stringify(db)); }
    function ok(v) { return $.Deferred().resolve(JSON.parse(JSON.stringify(v))).promise(); }   // copie défensive
    function ko(v) { return $.Deferred().reject(v).promise(); }

    /* Numérotation : CLI-0001, COT-2026-0001, FAC-2026-0001, RT-2611-00001 */
    function nextNumero(coll) {
        var d = load(), year = CX.util.today().substr(0, 4);
        d.seq = d.seq || {};
        var key = coll + "-" + year;
        d.seq[key] = (d.seq[key] || 0) + 1;
        var n = d.seq[key];
        if (coll === "clients") return "CLI-" + ("0000" + n).slice(-4);
        if (coll === "cotations") return "COT-" + year + "-" + ("0000" + n).slice(-4);
        if (coll === "factures") return "FAC-" + year + "-" + ("0000" + n).slice(-4);
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
                if (coll === "clients" && !obj.code) obj.code = obj.numero;
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
        clientsSync: function () { return load().clients; }
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
                var montant = CX.tarif.transport(dep, dest, poids) + ((k % 3 === 0) ? 2500 : 0);
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
        return { clients: clients, expeditions: exps, factures: factures, cotations: cotations, seq: seq };

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
})();

/* =====================================================================
   ClemenTino - Gestion des carnets de LT : code commun (maquette)
   ---------------------------------------------------------------------
   jQuery uniquement. Les données sont simulées dans le localStorage
   (objet CarnetStore). À l'intégration, remplacer chaque méthode de
   CarnetStore par l'appel AJAX correspondant (voir les "TODO API").
   ===================================================================== */

/* ---------------------------------------------------------------------
   MODÈLE DE DONNÉES
   ---------------------------------------------------------------------
   Carnet {
     id              : int
     numero          : string   (ex "TOTAL-354935")  - unique
     prefixe         : string   (ex "LT-")  imprimé devant chaque n° de feuille (optionnel)
     debut           : int      premier n° de feuille du carnet
     fin             : int      dernier n° de feuille du carnet
     dernierUtilise  : int|null dernier n° de feuille coupé/utilisé (incrémental)
     clientId        : int|null client en compte auquel le carnet est remis
     agenceId        : int|null agence qui gère le carnet
     dateCreation    : "YYYY-MM-DD"
     dateAffectation : "YYYY-MM-DD"|null
     cloture         : bool     carnet clôturé manuellement
     observation     : string
     anomalies       : [ { numero:int, type:"PERDUE"|"ANNULEE", motif:string,
                           date:"YYYY-MM-DD", user:string } ]
     historique      : [ { date:"YYYY-MM-DD HH:mm", user:string, action:string } ]
   }

   Statut d'une feuille (calculé, jamais stocké) :
     PERDUE / ANNULEE  -> si présente dans anomalies
     UTILISEE          -> numero <= dernierUtilise
     DISPONIBLE        -> sinon

   Statut d'un carnet (calculé) :
     CLOTURE  -> cloture = true
     EPUISE   -> plus aucune feuille disponible
     AFFECTE  -> clientId renseigné
     STOCK    -> pas encore remis à un client
   --------------------------------------------------------------------- */

var CT = window.CT || {};

CT.CURRENT_USER = "Support KuTiWa";
CT.STORAGE_KEY = "ct_carnets_demo_v1";

/* Référentiels (TODO API : charger depuis le serveur) */
CT.CLIENTS = [
    { id: 1, nom: "PHARMACIE PACIFIC" },
    { id: 2, nom: "TOTAL ENERGIES CAMEROUN" },
    { id: 3, nom: "BRASSERIES DU CAMEROUN" },
    { id: 4, nom: "ORANGE CAMEROUN" },
    { id: 5, nom: "HOPITAL LAQUINTINIE" },
    { id: 6, nom: "CABINET MBARGA & ASSOCIES" }
];
CT.AGENCES = [
    { id: 1, nom: "AKWA", ville: "DOUALA" },
    { id: 2, nom: "BONANJO", ville: "DOUALA" },
    { id: 3, nom: "BASTOS", ville: "YAOUNDE" },
    { id: 4, nom: "CENTRE", ville: "BAFOUSSAM" }
];
CT.MOTIFS_ANOMALIE = [
    "Feuille perdue par le client",
    "Feuille perdue par le livreur",
    "Feuille déchirée / illisible",
    "Erreur de saisie - feuille annulée",
    "Carnet endommagé",
    "Autre"
];
CT.STATUTS_CARNET = {
    STOCK:   "En stock",
    AFFECTE: "Affecté",
    EPUISE:  "Épuisé",
    CLOTURE: "Clôturé"
};
CT.STATUTS_FEUILLE = {
    DISPONIBLE: "Disponible",
    UTILISEE:   "Utilisée",
    PERDUE:     "Perdue",
    ANNULEE:    "Annulée"
};

/* =====================================================================
   Utilitaires
   ===================================================================== */
CT.util = {
    today: function () {
        var d = new Date();
        return d.getFullYear() + "-" + CT.util.pad(d.getMonth() + 1) + "-" + CT.util.pad(d.getDate());
    },
    now: function () {
        var d = new Date();
        return CT.util.today() + " " + CT.util.pad(d.getHours()) + ":" + CT.util.pad(d.getMinutes());
    },
    pad: function (n) { return (n < 10 ? "0" : "") + n; },

    /* "2026-11-27" -> "27/11/2026" */
    toFr: function (iso) {
        if (!iso) return "";
        var p = iso.substr(0, 10).split("-");
        return p[2] + "/" + p[1] + "/" + p[0] + (iso.length > 10 ? iso.substr(10) : "");
    },
    /* "27/11/2026" -> "2026-11-27" */
    toIso: function (fr) {
        if (!fr) return "";
        var p = fr.split("/");
        return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : fr;
    },
    esc: function (s) {
        return $("<div>").text(s == null ? "" : String(s)).html();
    },
    fmt: function (n) {
        return (n == null || isNaN(n)) ? "" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    },
    clientNom: function (id) {
        var c = $.grep(CT.CLIENTS, function (x) { return x.id == id; })[0];
        return c ? c.nom : "";
    },
    agenceNom: function (id) {
        var a = $.grep(CT.AGENCES, function (x) { return x.id == id; })[0];
        return a ? a.nom : "";
    },
    queryParam: function (name) {
        var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
        return m ? decodeURIComponent(m[1]) : null;
    },

    /* Analyse une saisie de numéros : "456101, 456105-456110 ; 456200"
       Retourne { numeros:[...triés, uniques], erreurs:[...] } */
    parseNumeros: function (texte) {
        var res = { numeros: [], erreurs: [] }, seen = {};
        $.each(String(texte || "").split(/[,;\s]+/), function (_, part) {
            part = $.trim(part);
            if (!part) return;
            var m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
            if (m) {
                var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
                if (a > b) { var t = a; a = b; b = t; }
                if (b - a > 5000) { res.erreurs.push("Plage trop grande : " + part); return; }
                for (var i = a; i <= b; i++) { if (!seen[i]) { seen[i] = 1; res.numeros.push(i); } }
            } else if (/^\d+$/.test(part)) {
                var n = parseInt(part, 10);
                if (!seen[n]) { seen[n] = 1; res.numeros.push(n); }
            } else {
                res.erreurs.push("Valeur invalide : " + part);
            }
        });
        res.numeros.sort(function (a, b) { return a - b; });
        return res;
    },

    /* [1,2,3,7,9,10] -> "1-3, 7, 9-10" */
    compactNumeros: function (nums) {
        if (!nums.length) return "";
        nums = nums.slice().sort(function (a, b) { return a - b; });
        var out = [], start = nums[0], prev = nums[0];
        for (var i = 1; i <= nums.length; i++) {
            if (nums[i] === prev + 1) { prev = nums[i]; continue; }
            out.push(start === prev ? String(start) : start + "-" + prev);
            start = prev = nums[i];
        }
        return out.join(", ");
    },

    toast: function (msg, type) {
        if (!$("#ct-toasts").length) $("body").append('<div id="ct-toasts"></div>');
        var $a = $('<div class="alert alert-' + (type || "success") + '">' + msg + "</div>").hide();
        $("#ct-toasts").append($a);
        $a.fadeIn(150);
        setTimeout(function () { $a.fadeOut(300, function () { $a.remove(); }); }, 3500);
    }
};

/* =====================================================================
   Règles métier (à reproduire aussi côté serveur)
   ===================================================================== */
CT.metier = {
    nbFeuilles: function (c) { return c.fin - c.debut + 1; },

    statutFeuille: function (c, numero) {
        for (var i = 0; i < c.anomalies.length; i++) {
            if (c.anomalies[i].numero === numero) return c.anomalies[i].type;
        }
        if (c.dernierUtilise != null && numero <= c.dernierUtilise) return "UTILISEE";
        return "DISPONIBLE";
    },

    /* Prochain n° attendu = premier n° disponible après le dernier utilisé */
    prochainNumero: function (c) {
        var start = c.dernierUtilise == null ? c.debut : c.dernierUtilise + 1;
        for (var n = start; n <= c.fin; n++) {
            if (CT.metier.statutFeuille(c, n) === "DISPONIBLE") return n;
        }
        return null;
    },

    stats: function (c) {
        var total = CT.metier.nbFeuilles(c), perdues = 0, annulees = 0, utilisees = 0;
        $.each(c.anomalies, function (_, a) {
            if (a.numero < c.debut || a.numero > c.fin) return;
            if (a.type === "PERDUE") perdues++; else annulees++;
        });
        if (c.dernierUtilise != null) {
            var rangeUsed = Math.max(0, Math.min(c.dernierUtilise, c.fin) - c.debut + 1);
            var anomaliesInUsed = $.grep(c.anomalies, function (a) {
                return a.numero >= c.debut && a.numero <= c.dernierUtilise;
            }).length;
            utilisees = rangeUsed - anomaliesInUsed;
        }
        var disponibles = total - utilisees - perdues - annulees;
        return {
            total: total, utilisees: utilisees, perdues: perdues, annulees: annulees,
            disponibles: disponibles,
            pctUtilise: total ? Math.round((utilisees / total) * 100) : 0,
            pctPerdu: total ? Math.round(((perdues + annulees) / total) * 100) : 0
        };
    },

    statutCarnet: function (c) {
        if (c.cloture) return "CLOTURE";
        if (CT.metier.stats(c).disponibles <= 0) return "EPUISE";
        if (c.clientId) return "AFFECTE";
        return "STOCK";
    },

    /* Validation d'un carnet avant enregistrement.
       Retourne un tableau d'erreurs { champ, message } (vide = OK) */
    valider: function (c, tous) {
        var err = [];
        if (!$.trim(c.numero)) err.push({ champ: "numero", message: "Le numéro de carnet est obligatoire." });
        if (isNaN(c.debut)) err.push({ champ: "debut", message: "Le numéro de début est obligatoire." });
        if (isNaN(c.fin)) err.push({ champ: "fin", message: "Le numéro de fin est obligatoire." });
        if (!isNaN(c.debut) && !isNaN(c.fin)) {
            if (c.fin < c.debut) err.push({ champ: "fin", message: "Le numéro de fin doit être supérieur ou égal au numéro de début." });
            if (c.fin - c.debut + 1 > 10000) err.push({ champ: "fin", message: "Un carnet ne peut pas dépasser 10 000 feuilles." });
            if (c.dernierUtilise != null && !isNaN(c.dernierUtilise) &&
                (c.dernierUtilise < c.debut || c.dernierUtilise > c.fin)) {
                err.push({ champ: "dernierUtilise", message: "Le dernier numéro utilisé doit être compris entre " + c.debut + " et " + c.fin + "." });
            }
            $.each(c.anomalies || [], function (_, a) {
                if (a.numero < c.debut || a.numero > c.fin) {
                    err.push({ champ: "perdus", message: "Le numéro " + a.numero + " n'appartient pas à la plage du carnet." });
                    return false;
                }
            });
            /* Unicité : pas de chevauchement de plage avec un autre carnet de même préfixe */
            $.each(tous || [], function (_, o) {
                if (o.id === c.id) return;
                if ($.trim(o.numero).toUpperCase() === $.trim(c.numero).toUpperCase()) {
                    err.push({ champ: "numero", message: "Ce numéro de carnet existe déjà." });
                }
                if ((o.prefixe || "") === (c.prefixe || "") && c.debut <= o.fin && c.fin >= o.debut) {
                    err.push({ champ: "debut", message: "La plage chevauche le carnet " + o.numero + " (" + o.debut + " - " + o.fin + ")." });
                }
            });
        }
        return err;
    }
};

/* =====================================================================
   CarnetStore : persistance simulée.
   TODO API : remplacer par des $.ajax vers le back-end, ex :
     GET    /carnets?du=&au=&client=&agence=&statut=
     GET    /carnets/{id}
     POST   /carnets
     PUT    /carnets/{id}
     DELETE /carnets/{id}
     POST   /carnets/{id}/anomalies        { numeros:[...], type, motif }
     DELETE /carnets/{id}/anomalies/{num}
     PUT    /carnets/{id}/dernier-utilise  { numero }
     PUT    /carnets/{id}/cloture
     GET    /carnets/recherche-feuille?numero=
   Les méthodes renvoient des Promise jQuery ($.Deferred) pour que le
   remplacement par $.ajax soit transparent pour les pages.
   ===================================================================== */
CT.store = (function () {
    function load() {
        var raw = localStorage.getItem(CT.STORAGE_KEY);
        if (raw) { try { return JSON.parse(raw); } catch (e) { /* ignore */ } }
        var seed = seedData();
        save(seed);
        return seed;
    }
    function save(list) { localStorage.setItem(CT.STORAGE_KEY, JSON.stringify(list)); }
    function done(v) { return $.Deferred().resolve(v).promise(); }
    function fail(v) { return $.Deferred().reject(v).promise(); }
    function hist(c, action) {
        c.historique = c.historique || [];
        c.historique.unshift({ date: CT.util.now(), user: CT.CURRENT_USER, action: action });
    }

    function seedData() {
        function an(n, t, m, d) { return { numero: n, type: t, motif: m, date: d, user: "M. NJOYA" }; }
        return [
            { id: 1, numero: "TOTAL-354935", prefixe: "", debut: 456000, fin: 456999, dernierUtilise: 456100,
              clientId: 1, agenceId: 1, dateCreation: "2026-11-02", dateAffectation: "2026-11-03", cloture: false,
              observation: "",
              anomalies: [an(456045, "PERDUE", "Feuille perdue par le livreur", "2026-11-12"),
                          an(456077, "ANNULEE", "Erreur de saisie - feuille annulée", "2026-11-18")],
              historique: [{ date: "2026-11-18 10:12", user: "M. NJOYA", action: "Feuille 456077 annulée" },
                           { date: "2026-11-12 16:40", user: "M. NJOYA", action: "Feuille 456045 déclarée perdue" },
                           { date: "2026-11-03 09:05", user: "Support KuTiWa", action: "Carnet affecté à PHARMACIE PACIFIC (agence AKWA)" },
                           { date: "2026-11-02 14:30", user: "Support KuTiWa", action: "Création du carnet (456000 - 456999)" }] },
            { id: 2, numero: "CRN-2026-0012", prefixe: "LT", debut: 100001, fin: 100050, dernierUtilise: 100050,
              clientId: 2, agenceId: 2, dateCreation: "2026-10-01", dateAffectation: "2026-10-02", cloture: false,
              observation: "Carnet terminé, prévoir un nouveau carnet", anomalies: [an(100013, "PERDUE", "Feuille perdue par le client", "2026-10-20")],
              historique: [{ date: "2026-10-01 08:00", user: "Support KuTiWa", action: "Création du carnet (100001 - 100050)" }] },
            { id: 3, numero: "CRN-2026-0013", prefixe: "LT", debut: 100051, fin: 100100, dernierUtilise: 100062,
              clientId: 2, agenceId: 2, dateCreation: "2026-11-20", dateAffectation: "2026-11-21", cloture: false,
              observation: "", anomalies: [],
              historique: [{ date: "2026-11-20 08:00", user: "Support KuTiWa", action: "Création du carnet (100051 - 100100)" }] },
            { id: 4, numero: "CRN-2026-0014", prefixe: "LT", debut: 100101, fin: 100150, dernierUtilise: null,
              clientId: null, agenceId: 3, dateCreation: "2026-11-25", dateAffectation: null, cloture: false,
              observation: "En stock à Yaoundé", anomalies: [],
              historique: [{ date: "2026-11-25 11:20", user: "Support KuTiWa", action: "Création du carnet (100101 - 100150)" }] },
            { id: 5, numero: "SABC-0007", prefixe: "", debut: 780001, fin: 780100, dernierUtilise: 780033,
              clientId: 3, agenceId: 1, dateCreation: "2026-09-15", dateAffectation: "2026-09-16", cloture: true,
              observation: "Contrat résilié - carnet récupéré", anomalies: [],
              historique: [{ date: "2026-11-05 15:00", user: "Support KuTiWa", action: "Carnet clôturé" }] }
        ];
    }

    return {
        lister: function (filtres) {
            filtres = filtres || {};
            var list = $.grep(load(), function (c) {
                var ref = c.dateAffectation || c.dateCreation;
                if (filtres.du && ref < filtres.du) return false;
                if (filtres.au && ref > filtres.au) return false;
                if (filtres.clientId && c.clientId != filtres.clientId) return false;
                if (filtres.agenceId && c.agenceId != filtres.agenceId) return false;
                if (filtres.statut && CT.metier.statutCarnet(c) !== filtres.statut) return false;
                return true;
            });
            return done(list);
        },
        tous: function () { return load(); },
        obtenir: function (id) {
            var c = $.grep(load(), function (x) { return x.id == id; })[0];
            return c ? done(c) : fail("Carnet introuvable");
        },
        enregistrer: function (carnet) {
            var list = load(), err = CT.metier.valider(carnet, list);
            if (err.length) return fail(err);
            if (carnet.id) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === carnet.id) {
                        var old = list[i];
                        carnet.historique = old.historique || [];
                        if (old.clientId != carnet.clientId) {
                            hist(carnet, carnet.clientId ? "Carnet affecté à " + CT.util.clientNom(carnet.clientId) : "Affectation client retirée");
                            if (carnet.clientId && !carnet.dateAffectation) carnet.dateAffectation = CT.util.today();
                        }
                        if (old.dernierUtilise != carnet.dernierUtilise) hist(carnet, "Dernier n° utilisé : " + (old.dernierUtilise || "-") + " → " + (carnet.dernierUtilise || "-"));
                        hist(carnet, "Modification du carnet");
                        list[i] = carnet;
                    }
                }
            } else {
                carnet.id = list.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
                carnet.dateCreation = CT.util.today();
                if (carnet.clientId) carnet.dateAffectation = CT.util.today();
                carnet.historique = [];
                hist(carnet, "Création du carnet (" + carnet.debut + " - " + carnet.fin + ")" +
                    (carnet.clientId ? " affecté à " + CT.util.clientNom(carnet.clientId) : ""));
                list.push(carnet);
            }
            save(list);
            return done(carnet);
        },
        supprimer: function (id) {
            var list = $.grep(load(), function (x) { return x.id != id; });
            save(list);
            return done(true);
        },
        /* type = "PERDUE" | "ANNULEE" */
        declarerAnomalies: function (id, numeros, type, motif) {
            var list = load(), c = $.grep(list, function (x) { return x.id == id; })[0];
            if (!c) return fail("Carnet introuvable");
            var hors = $.grep(numeros, function (n) { return n < c.debut || n > c.fin; });
            if (hors.length) return fail("Numéro(s) hors plage du carnet : " + CT.util.compactNumeros(hors));
            $.each(numeros, function (_, n) {
                c.anomalies = $.grep(c.anomalies, function (a) { return a.numero !== n; });
                c.anomalies.push({ numero: n, type: type, motif: motif, date: CT.util.today(), user: CT.CURRENT_USER });
            });
            c.anomalies.sort(function (a, b) { return a.numero - b.numero; });
            hist(c, (type === "PERDUE" ? "Déclaration de feuille(s) perdue(s) : " : "Annulation de feuille(s) : ") +
                CT.util.compactNumeros(numeros) + " (" + motif + ")");
            save(list);
            return done(c);
        },
        retablirFeuilles: function (id, numeros) {
            var list = load(), c = $.grep(list, function (x) { return x.id == id; })[0];
            c.anomalies = $.grep(c.anomalies, function (a) { return $.inArray(a.numero, numeros) < 0; });
            hist(c, "Feuille(s) rétablie(s) : " + CT.util.compactNumeros(numeros));
            save(list);
            return done(c);
        },
        majDernierUtilise: function (id, numero) {
            var list = load(), c = $.grep(list, function (x) { return x.id == id; })[0];
            if (numero != null && (numero < c.debut || numero > c.fin)) return fail("Numéro hors plage du carnet");
            hist(c, "Dernier n° utilisé : " + (c.dernierUtilise || "-") + " → " + (numero || "-"));
            c.dernierUtilise = numero;
            save(list);
            return done(c);
        },
        cloturer: function (id, cloture, motif) {
            var list = load(), c = $.grep(list, function (x) { return x.id == id; })[0];
            c.cloture = cloture;
            hist(c, cloture ? "Carnet clôturé" + (motif ? " : " + motif : "") : "Carnet réouvert");
            save(list);
            return done(c);
        },
        /* Retrouve le carnet qui contient un n° de feuille */
        rechercherFeuille: function (numero) {
            var res = $.grep(load(), function (c) { return numero >= c.debut && numero <= c.fin; });
            return done(res);
        },
        reinitialiser: function () { localStorage.removeItem(CT.STORAGE_KEY); return done(true); }
    };
})();

/* =====================================================================
   Formulaire "Ajouter / Modifier un carnet" (modale partagée)
   Utilisé par la liste ET par la page détail.
   ===================================================================== */
CT.formCarnet = (function () {
    var $m, onSaved, current;

    function readForm() {
        function intOrNull(sel) { var v = $.trim($(sel).val()); return v === "" ? null : parseInt(v, 10); }
        var c = $.extend(true, {}, current || { anomalies: [], cloture: false });
        c.numero = $.trim($("#fc-numero").val());
        c.prefixe = $.trim($("#fc-prefixe").val());
        c.debut = parseInt($("#fc-debut").val(), 10);
        c.fin = parseInt($("#fc-fin").val(), 10);
        c.dernierUtilise = intOrNull("#fc-dernier");
        c.clientId = $("#fc-client").val() ? parseInt($("#fc-client").val(), 10) : null;
        c.agenceId = $("#fc-agence").val() ? parseInt($("#fc-agence").val(), 10) : null;
        c.observation = $.trim($("#fc-observation").val());

        /* Numéros perdus saisis à la création/modification */
        var parsed = CT.util.parseNumeros($("#fc-perdus").val());
        var motif = $("#fc-perdus-motif").val();
        var existingLost = {};
        $.each(c.anomalies, function (_, a) { if (a.type === "PERDUE") existingLost[a.numero] = a; });
        c.anomalies = $.grep(c.anomalies, function (a) { return a.type !== "PERDUE"; });
        $.each(parsed.numeros, function (_, n) {
            c.anomalies.push(existingLost[n] || { numero: n, type: "PERDUE", motif: motif, date: CT.util.today(), user: CT.CURRENT_USER });
        });
        c._parseErreurs = parsed.erreurs;
        return c;
    }

    function refreshSummary() {
        var debut = parseInt($("#fc-debut").val(), 10), fin = parseInt($("#fc-fin").val(), 10);
        var $s = $("#fc-summary");
        if (isNaN(debut) || isNaN(fin) || fin < debut) { $s.hide(); return; }
        var c = readForm();
        delete c._parseErreurs;
        var st = CT.metier.stats(c), pre = c.prefixe || "";
        $s.html(
            "Le carnet contiendra <strong>" + CT.util.fmt(st.total) + " feuilles</strong> : de <strong>" +
            CT.util.esc(pre + debut) + "</strong> à <strong>" + CT.util.esc(pre + fin) + "</strong>.<br>" +
            "Utilisées : <strong>" + st.utilisees + "</strong> · Perdues : <strong>" + st.perdues + "</strong> · " +
            "Disponibles : <strong>" + st.disponibles + "</strong>" +
            (CT.metier.prochainNumero(c) ? " · Prochaine feuille attendue : <strong>" + CT.util.esc(pre + CT.metier.prochainNumero(c)) + "</strong>" : "")
        ).show();
    }

    function clearErrors() {
        $m.find(".form-group").removeClass("has-error");
        $m.find(".ct-err").remove();
    }
    function showErrors(errs) {
        $.each(errs, function (_, e) {
            var $g = $("#fc-" + ({ numero: "numero", debut: "debut", fin: "fin", dernierUtilise: "dernier", perdus: "perdus" }[e.champ] || "numero")).closest(".form-group");
            $g.addClass("has-error");
            $g.find("> div").first().append('<span class="help-block ct-err">' + CT.util.esc(e.message) + "</span>");
        });
    }

    function init() {
        $m = $("#modalCarnet");
        $.each(CT.CLIENTS, function (_, c) { $("#fc-client").append($("<option>").val(c.id).text(c.nom)); });
        $.each(CT.AGENCES, function (_, a) { $("#fc-agence").append($("<option>").val(a.id).text(a.nom + " (" + a.ville + ")")); });
        $.each(CT.MOTIFS_ANOMALIE, function (_, m) { $("#fc-perdus-motif").append($("<option>").text(m)); });
        if ($.fn.select2) {
            $("#fc-client").select2({ dropdownParent: $m, placeholder: "Sélectionner un client", allowClear: true, width: "100%" });
        }

        $m.on("input change", "input, select, textarea", refreshSummary);

        /* Saisie de la fin : proposer automatiquement fin = début + 49 si vide */
        $("#fc-debut").on("blur", function () {
            if ($.trim($("#fc-fin").val()) === "" && $(this).val() !== "") {
                $("#fc-fin").val(parseInt($(this).val(), 10) + parseInt($("#fc-taille").val(), 10) - 1);
                refreshSummary();
            }
        });
        $("#fc-taille").on("change", function () {
            if ($("#fc-debut").val() !== "") {
                $("#fc-fin").val(parseInt($("#fc-debut").val(), 10) + parseInt($(this).val(), 10) - 1);
                refreshSummary();
            }
        });

        $("#fc-save").on("click", function () {
            clearErrors();
            var c = readForm(), perr = c._parseErreurs;
            delete c._parseErreurs;
            if (perr.length) { showErrors([{ champ: "perdus", message: perr.join(" ; ") }]); return; }
            CT.store.enregistrer(c).done(function (saved) {
                $m.modal("hide");
                CT.util.toast("Carnet <b>" + CT.util.esc(saved.numero) + "</b> enregistré.");
                if (onSaved) onSaved(saved);
            }).fail(function (errs) {
                showErrors($.isArray(errs) ? errs : [{ champ: "numero", message: errs }]);
            });
        });
    }

    function open(carnet, callback) {
        current = carnet ? $.extend(true, {}, carnet) : null;
        onSaved = callback;
        clearErrors();
        $("#fc-title").text(carnet ? "Modifier le carnet " + carnet.numero : "Ajouter un carnet");
        $("#fc-numero").val(carnet ? carnet.numero : "");
        $("#fc-prefixe").val(carnet ? carnet.prefixe : "");
        $("#fc-debut").val(carnet ? carnet.debut : "");
        $("#fc-fin").val(carnet ? carnet.fin : "");
        $("#fc-dernier").val(carnet && carnet.dernierUtilise != null ? carnet.dernierUtilise : "");
        $("#fc-client").val(carnet && carnet.clientId ? carnet.clientId : "").trigger("change");
        $("#fc-agence").val(carnet && carnet.agenceId ? carnet.agenceId : (CT.AGENCES[0] && CT.AGENCES[0].id));
        $("#fc-observation").val(carnet ? carnet.observation : "");
        $("#fc-perdus").val(carnet ? CT.util.compactNumeros($.map($.grep(carnet.anomalies, function (a) { return a.type === "PERDUE"; }), function (a) { return a.numero; })) : "");
        $("#fc-taille-group").toggle(!carnet);
        refreshSummary();
        $m.modal("show");
        setTimeout(function () { $("#fc-numero").focus(); }, 400);
    }

    return { init: init, open: open };
})();

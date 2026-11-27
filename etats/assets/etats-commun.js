/* =====================================================================
   ClemenTino 2.0 - Module ÉTATS - socle commun (CX.etats)
   ---------------------------------------------------------------------
   À charger après cx-core.js, cx-data.js, cx-tarifs.js,
   cx-demo-exploitation.js, cx-pdf.js et guichet-commun.js (facultatif :
   CX.guichet.normaliser est utilisé s'il est présent).

     CX.etats.CONFIG          paramètres (TVA guichet, délais cibles, plafond de caisse)
     CX.etats.COUL / PALETTE  couleurs des graphiques (charte : marine, vert, orange, gris)
     CX.etats.donnees()       chargement + préparation des données (une seule fois par page)
     CX.etats.Filtres         barre de filtres commune (période, comparaison, géo,
                              type client, produit, apporteur, statut, source), mémorisée dans l'URL
     CX.etats.filtrer()       application des filtres à des lignes préparées
     CX.etats.agreger()       moteur d'agrégation en une passe (group by sur dimensions)
     CX.etats.croiser()       tableau croisé (lignes × colonnes) avec totaux
     CX.etats.serie()         série temporelle jour / semaine / mois (cases vides comprises)
     CX.etats.graph.*         graphiques SVG faits main (barres, barres horizontales,
                              courbes, anneau, carte de chaleur) + infobulles
     CX.etats.tableau()       rendu HTML d'un état (sous-totaux, total) ; tableauCsv()
     CX.etats.csv()           export CSV (UTF-8 avec BOM, séparateur « ; »)
     CX.etats.pdf()/imprimer() état A4 (portrait / paysage) avec en-tête société,
                              filtres appliqués et date d'édition
     CX.etats.caisse()        encaissements comptant / versements / excédent par agence

   Ligne « préparée » (expédition ou ligne de facture) : champs calculés
   préfixés par « _ » : _jour, _mois, _semaine, _heure, _dow, _agId, _agLib,
   _ville, _villeDest, _agDestId, _clientKey, _client, _typeClient, _appId,
   _service, _nature, _guichetier, _livreurId, _actif et les mesures
   _nb, _colis, _poids, _ht, _tva, _ttc, _enc.

   >>> INTÉGRATION SYMFONY <<<
   En production, les agrégats sont calculés par le serveur (requêtes SQL
   GROUP BY) : chaque page indique la route attendue (« TODO API »). Ce
   fichier garde le rendu (graphiques, tableaux, exports) qui consomme
   directement le JSON renvoyé : { groupes: [{ cles, libs, m: {nb, colis,
   poids, ht, tva, ttc, enc} }], total: {...} }.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.etats = (function () {
    var U = CX.util;

    /* ------------------------------------------------------------------
       Paramètres
       ------------------------------------------------------------------ */
    var CONFIG = {
        /* Les montants encaissés au guichet (particuliers) sont des prix TTC :
           HT = TTC / (1 + TVA). Les expéditions des clients en compte sont
           valorisées HT (la TVA est ajoutée sur la facture).
           TODO : paramètre société (prix publics TTC ou HT). */
        PRIX_GUICHET_TTC: true,
        /* Délai cible de livraison (jours calendaires) par service */
        DELAIS_CIBLE: { URBAINE: 1, NATIONALE: 3, REGIONALE: 5, INTERNATIONALE: 5 },
        /* Plafond de caisse par défaut (FCFA) ; surchargeable par agence (tresorerie.html)
           TODO : paramètre agence côté serveur */
        PLAFOND_CAISSE: 50000,
        TOP: 10
    };

    /* Couleurs (contraste AA sur fond blanc pour les textes ; séries distinguables) */
    /* couleurs principales : charte de l'entreprise courante (CX.societe) */
    var TH = (CX.CONFIG.SOCIETE && CX.CONFIG.SOCIETE.theme) || {};
    var COUL = {
        marine: TH.navy2 || "#1d4fa3", marineF: TH.navy || "#13306b", bleuC: TH.navy3 ? CX.societe.ombre(TH.navy3, 0.35) : "#7aa2e3", vert: "#1e9e5a", vertC: "#8fd1ad",
        orange: "#d97706", orangeC: "#f2b766", gris: "#6b7280", grisC: "#c3cbd9", rouge: "#dc2626", violet: "#6d28d9",
        grille: "#e3e7ef", texte: "#475467"
    };
    var PALETTE = [COUL.marine, COUL.vert, COUL.orange, COUL.gris, COUL.bleuC, COUL.marineF, COUL.vertC, COUL.orangeC, COUL.violet, COUL.grisC];

    var SERVICES = {
        URBAINE: { label: "Urbaine", icon: "fa-bicycle" },
        NATIONALE: { label: "Nationale", icon: "fa-truck" },
        REGIONALE: { label: "Régionale", icon: "fa-globe" },
        INTERNATIONALE: { label: "Internationale", icon: "fa-plane" }
    };
    var TYPES_CLIENT = { PARTICULIER: "Particuliers (comptant)", COMPTE: "Clients en compte" };
    var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    var JOURS_C = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    var MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    var MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

    /* ------------------------------------------------------------------
       Libellés
       ------------------------------------------------------------------ */
    var ACCENTS = { YAOUNDE: "YAOUNDÉ", NGAOUNDERE: "NGAOUNDÉRÉ", BUEA: "BUÉA" };
    function titre(s) {
        s = String(s || "").toLowerCase();
        return s.replace(/(^|[\s\-'])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    function villeNom(v) { v = String(v || "").toUpperCase(); return v ? titre(ACCENTS[v] || v) : "—"; }
    function agLib(id) {
        var a = CX.REF.agence(id);
        return a ? villeNom(a.ville) + " · " + titre(a.nom) : "Agence inconnue";
    }
    function agenceDe(ville, bureau) {
        var a = $.grep(CX.REF.AGENCES, function (x) { return x.ville === ville && x.nom === bureau; })[0];
        return a || CX.REF.agencesDe(ville)[0] || null;
    }
    function moisLib(cle, long) {   // "2026-11" -> "nov. 2026"
        var p = String(cle).split("-");
        return (long ? MOIS_L : MOIS_C)[parseInt(p[1], 10) - 1] + " " + p[0];
    }
    function kg(n) { n = Math.round((Number(n) || 0) * 10) / 10; return U.fmt(n, n % 1 ? 1 : 0) + " kg"; }
    function pct(n, dec) { return n == null || isNaN(n) ? "—" : U.fmt(n, dec == null ? 1 : dec) + " %"; }

    /* ------------------------------------------------------------------
       Dates
       ------------------------------------------------------------------ */
    var memoDow = {}, memoSem = {};
    function dow(iso) {             // 0 = lundi … 6 = dimanche
        if (memoDow[iso] == null) memoDow[iso] = (new Date(iso + "T12:00:00").getDay() + 6) % 7;
        return memoDow[iso];
    }
    function semaine(iso) {         // semaine ISO : "2026-S48"
        if (memoSem[iso]) return memoSem[iso];
        var d = new Date(iso + "T12:00:00");
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);           // jeudi de la semaine
        var an = d.getFullYear(), j1 = new Date(an, 0, 4, 12);
        var n = 1 + Math.round(((d - j1) / 86400000 - 3 + (j1.getDay() + 6) % 7) / 7);
        memoSem[iso] = an + "-S" + U.pad(n);
        return memoSem[iso];
    }
    function lundi(iso) { return U.addDays(iso, -dow(iso)); }
    function addMois(iso, n) {
        var p = iso.split("-"), a = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1 + n, j = parseInt(p[2], 10);
        a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
        var fin = new Date(a, m + 1, 0).getDate();
        return a + "-" + U.pad(m + 1) + "-" + U.pad(Math.min(j, fin));
    }
    function debutTrimestre(iso) { var m = parseInt(iso.substr(5, 2), 10); return iso.substr(0, 5) + U.pad(m - (m - 1) % 3) + "-01"; }

    /* Période d'un raccourci */
    var RACCOURCIS = [
        { p: "jour", label: "Aujourd'hui" }, { p: "semaine", label: "Cette semaine" }, { p: "mois", label: "Ce mois" },
        { p: "trimestre", label: "Ce trimestre" }, { p: "annee", label: "Cette année" }, { p: "perso", label: "Définir…" }
    ];
    function periodeDe(p, du, au) {
        var t = U.today();
        if (p === "jour") return { du: t, au: t };
        if (p === "semaine") return { du: lundi(t), au: t };
        if (p === "mois") return { du: U.firstOfMonth(t), au: t };
        if (p === "trimestre") return { du: debutTrimestre(t), au: t };
        if (p === "annee") return { du: t.substr(0, 4) + "-01-01", au: t };
        if (p === "12m") return { du: addMois(U.firstOfMonth(t), -11), au: t };
        du = du || U.firstOfMonth(t); au = au || t;
        return du <= au ? { du: du, au: au } : { du: au, au: du };
    }
    /* Période de comparaison : « période précédente » (même durée juste avant,
       ou mois / trimestre / année précédents pour ces raccourcis) ou « N-1 » */
    function periodeComparee(p, per, mode) {
        if (!mode) return null;
        if (mode === "N1") return { du: addMois(per.du, -12), au: addMois(per.au, -12) };
        var decal = { mois: 1, trimestre: 3, annee: 12, "12m": 12 }[p];
        if (decal) return { du: addMois(per.du, -decal), au: addMois(per.au, -decal) };
        var n = U.daysBetween(per.du, per.au) + 1;
        return { du: U.addDays(per.du, -n), au: U.addDays(per.au, -n) };
    }
    function libPeriode(per) {
        if (!per) return "";
        return per.du === per.au ? "le " + U.toFr(per.du) : "du " + U.toFr(per.du) + " au " + U.toFr(per.au);
    }
    /* Granularité adaptée à la durée */
    function granularite(per) {
        var n = U.daysBetween(per.du, per.au) + 1;
        return n <= 35 ? "jour" : n <= 140 ? "semaine" : "mois";
    }
    /* Cases temporelles entre deux dates : [{ cle, lib }] */
    function cases(per, gran) {
        var out = [], vu = {}, d = per.du, garde = 0;
        if (gran === "mois") {
            d = per.du.substr(0, 7) + "-01";
            while (d.substr(0, 7) <= per.au.substr(0, 7) && garde++ < 400) { out.push({ cle: d.substr(0, 7), lib: moisLib(d.substr(0, 7)) }); d = addMois(d, 1); }
            return out;
        }
        while (d <= per.au && garde++ < 4000) {
            var c = gran === "semaine" ? semaine(d) : d;
            if (!vu[c]) {
                vu[c] = 1;
                out.push({ cle: c, lib: gran === "semaine" ? "S" + c.substr(6) + " (" + U.toFr(lundi(d)).substr(0, 5) + ")" : JOURS_C[dow(d)] + " " + U.toFr(d).substr(0, 5) });
            }
            d = U.addDays(d, 1);
        }
        return out;
    }

    /* ------------------------------------------------------------------
       Préparation des données (une passe à l'ouverture de la page)
       ------------------------------------------------------------------ */
    var cache = null;

    function normaliser(e) {
        if (CX.guichet && CX.guichet.normaliser) return CX.guichet.normaliser(e);
        /* repli si guichet-commun.js n'est pas chargé */
        var n = $.extend(true, {}, e);
        n.typeClient = n.typeClient || (n.clientId ? "COMPTE" : "PARTICULIER");
        n.service = n.service || (n.villeDep === n.villeDest ? "URBAINE" : "NATIONALE");
        n.livraison = n.livraison || { mode: "BUREAU" };
        n.colis = n.colis && n.colis.length ? n.colis : [{ nature: "Colis", poids: n.poids || 0, nombre: n.nbColis || 1 }];
        n.montants = n.montants || { transport: U.round(n.montant), emballage: 0, livraison: 0, autres: 0, total: U.round(n.montant) };
        n.paiement = n.paiement || (n.clientId ? { mode: "En compte", statut: "EN_COMPTE" } : { mode: "Espèces", statut: "PAYE" });
        n.guichetier = n.guichetier || n.creePar || "";
        return n;
    }

    function taxes(e, client) {
        var taux = client && client.tauxTva != null && client.tauxTva !== "" ? Number(client.tauxTva) : CX.CONFIG.TVA;
        var montant = U.round(e.montant);
        if (e.typeClient === "COMPTE") {
            var tva = client && client.avecTva === false ? 0 : U.round(montant * taux / 100);
            return { ht: montant, tva: tva, ttc: montant + tva };
        }
        if (CONFIG.PRIX_GUICHET_TTC) {
            var ht = U.round(montant / (1 + CX.CONFIG.TVA / 100));
            return { ht: ht, tva: montant - ht, ttc: montant };
        }
        var t = U.taxes(montant);
        return { ht: t.ht, tva: t.tva, ttc: t.ttc };
    }

    function preparerExp(e0, ctx) {
        var e = normaliser(e0);
        var client = e.clientId ? ctx.clients[e.clientId] || null : null;
        var agId = e.bureau && e.bureau.agenceId ? e.bureau.agenceId : (function () { var a = agenceDe(e.villeDep, e.bureauDep); return a ? a.id : 0; })();
        var agD = agenceDe(e.villeDest, e.bureauDest);
        var t = taxes(e, client);
        var nb = 0; $.each(e.colis || [], function (_, c) { nb += Math.max(1, parseInt(c.nombre, 10) || 1); });
        var h = parseInt(String(e.heure || "").substr(0, 2), 10);
        var echec = false; $.each(e.suivi || [], function (_, s) { if (s.etape === "ECHEC") echec = true; });
        e._jour = e.dateExp;
        e._mois = String(e.dateExp).substr(0, 7);
        e._semaine = semaine(e.dateExp);
        e._dow = dow(e.dateExp);
        e._heure = isNaN(h) ? null : h;
        e._agId = agId;
        e._agLib = agId ? agLib(agId) : villeNom(e.villeDep) + " · " + titre(e.bureauDep);
        e._ville = e.villeDep;
        e._villeDest = e.villeDest;
        e._agDestId = agD ? agD.id : 0;
        e._typeClient = e.typeClient;
        e._clientKey = client ? "C" + client.id : "PART";
        e._client = client ? client.raisonSociale : TYPES_CLIENT.PARTICULIER;
        e._appId = client && client.apporteurId ? client.apporteurId : 0;
        e._service = e.service || "NATIONALE";
        e._nature = (e.colis && e.colis[0] && e.colis[0].nature) || "Colis";
        e._guichetier = e.guichetier || "—";
        e._livreurId = e.livreurId || 0;
        e._actif = e.statut !== "ANNULEE";
        e._echec = echec;
        e._delai = e.statut === "LIVREE" && e.dateLivraison ? U.daysBetween(e.dateExp, e.dateLivraison) : null;
        e._nb = 1;
        e._colis = Number(e.nbColis) || nb || 1;
        e._poids = Number(e.poids) || 0;
        e._ht = t.ht; e._tva = t.tva; e._ttc = t.ttc;
        e._enc = e.paiement && e.paiement.statut === "PAYE" && e._actif ? t.ttc : 0;
        e._mode = e.paiement ? e.paiement.mode : "";
        e._src = "EXP";
        return e;
    }

    /* Factures émises -> lignes ventilées par expédition (CA « à partir des factures »).
       Le net HT, la TVA, le TTC et l'encaissé de la facture sont répartis au prorata du
       montant de chaque expédition (le reste d'arrondi va sur la dernière ligne), ce qui
       permet les mêmes axes d'analyse (agence, produit…) que les expéditions. */
    function lignesFacture(f, ctx) {
        var client = ctx.clients[f.clientId] || null;
        var paye = CX.fac ? CX.fac.paye(f) : (function () { var s = 0; $.each(f.paiements || [], function (_, p) { s += Number(p.montant) || 0; }); return U.round(s); })();
        var tot = { ht: U.round(f.montantHT) - U.round(f.remise || 0), tva: U.round(f.tva), ttc: U.round(f.montantTTC) };
        tot.enc = Math.min(paye, tot.ttc);
        var exps = $.map(f.expeditionIds || [], function (id) { return ctx.expsById[id] || null; });
        var base = 0; $.each(exps, function (_, e) { base += U.round(e.montant); });
        var out = [], reste = $.extend({}, tot);
        var agCli = client && client.agenceId ? client.agenceId : 0;
        if (!exps.length) exps = [null];
        $.each(exps, function (i, e) {
            var dernier = i === exps.length - 1, part = base ? U.round(e ? e.montant : 0) / base : 1 / exps.length;
            var l = {
                _src: "FAC", _factureId: f.id, _facture: f.numero, _statutFacture: f.statut,
                _jour: f.dateEmission, _mois: String(f.dateEmission).substr(0, 7), _semaine: semaine(f.dateEmission), _dow: dow(f.dateEmission), _heure: null,
                _agId: e ? e._agId : agCli, _agLib: e ? e._agLib : (agCli ? agLib(agCli) : "—"),
                _ville: e ? e._ville : (client ? client.ville : ""), _villeDest: e ? e._villeDest : "", _agDestId: e ? e._agDestId : 0,
                _typeClient: "COMPTE", _clientKey: client ? "C" + client.id : "C0", _client: client ? client.raisonSociale : "Client #" + f.clientId,
                _appId: client && client.apporteurId ? client.apporteurId : 0,
                _service: e ? e._service : "NATIONALE", _nature: e ? e._nature : "Colis", _guichetier: e ? e._guichetier : "—", _livreurId: 0,
                _actif: f.statut !== "ANNULEE" && f.statut !== "BROUILLON",
                _nb: e ? 1 : 0, _colis: e ? e._colis : 0, _poids: e ? e._poids : 0,
                numero: e ? e.nRt : f.numero, dateExp: e ? e.dateExp : f.dateEmission
            };
            $.each(["ht", "tva", "ttc", "enc"], function (_, k) {
                var v = dernier ? reste[k] : U.round(tot[k] * part);
                l["_" + k] = v; reste[k] -= v;
            });
            out.push(l);
        });
        return out;
    }

    function donnees(force) {
        if (cache && !force) return cache;
        var t0 = new Date().getTime();
        var ctx = { clients: {}, apporteurs: {}, livreurs: {}, expsById: {} };
        var clients = CX.api.listSync("clients");
        $.each(clients, function (_, c) { ctx.clients[c.id] = c; });
        var apporteurs = CX.api.listSync("apporteurs");
        $.each(apporteurs, function (_, a) { ctx.apporteurs[a.id] = a; });
        var livreurs = CX.api.listSync("livreurs");
        $.each(livreurs, function (_, l) { ctx.livreurs[l.id] = l; });
        var exps = $.map(CX.api.listSync("expeditions"), function (e) { return preparerExp(e, ctx); });
        $.each(exps, function (_, e) { ctx.expsById[e.id] = e; });
        var factures = CX.api.listSync("factures");
        var lignesFac = [];
        $.each(factures, function (_, f) { if (f.statut !== "BROUILLON") lignesFac = lignesFac.concat(lignesFacture(f, ctx)); });
        cache = {
            exps: exps, factures: factures, lignesFac: lignesFac, clients: clients, apporteurs: apporteurs, livreurs: livreurs,
            versements: CX.api.listSync("versements"), ctx: ctx,
            premierJour: exps.reduce(function (m, e) { return !m || e._jour < m ? e._jour : m; }, null) || U.today()
        };
        cache.ms = new Date().getTime() - t0;
        return cache;
    }
    function rechargerVersements() { if (cache) cache.versements = CX.api.listSync("versements"); return cache ? cache.versements : []; }

    function nomApporteur(id) {
        if (!id) return "Sans apporteur";
        var a = cache && cache.ctx.apporteurs[id];
        return a ? a.code + " · " + a.nom + " " + (a.prenoms || "") : "Apporteur #" + id;
    }
    function nomLivreur(id) {
        if (!id) return "Sans livreur (retrait en agence)";
        var l = cache && cache.ctx.livreurs[id];
        return l ? l.nom : "Livreur #" + id;
    }

    /* ------------------------------------------------------------------
       Dimensions d'agrégation : cle(r) -> identifiant, lib(r) -> libellé
       temps : tri chronologique
       ------------------------------------------------------------------ */
    var DIMS = {
        agence: { titre: "Agence", cle: function (r) { return r._agId || r._agLib; }, lib: function (r) { return r._agLib; } },
        ville: { titre: "Ville", cle: function (r) { return r._ville; }, lib: function (r) { return villeNom(r._ville); } },
        villeDest: { titre: "Ville de destination", cle: function (r) { return r._villeDest; }, lib: function (r) { return villeNom(r._villeDest); } },
        agenceDest: { titre: "Agence de destination", cle: function (r) { return r._agDestId || r._villeDest; }, lib: function (r) { return r._agDestId ? agLib(r._agDestId) : villeNom(r._villeDest); } },
        trajet: { titre: "Trajet", cle: function (r) { return r._ville + ">" + r._villeDest; }, lib: function (r) { return villeNom(r._ville) + " → " + villeNom(r._villeDest); } },
        client: { titre: "Client", cle: function (r) { return r._clientKey; }, lib: function (r) { return r._client; } },
        typeClient: { titre: "Type de client", cle: function (r) { return r._typeClient; }, lib: function (r) { return TYPES_CLIENT[r._typeClient] || r._typeClient; } },
        service: { titre: "Service", cle: function (r) { return r._service; }, lib: function (r) { return (SERVICES[r._service] || { label: r._service }).label; } },
        nature: { titre: "Nature", cle: function (r) { return r._nature; }, lib: function (r) { return r._nature; } },
        produit: { titre: "Produit", cle: function (r) { return r._service + "|" + r._nature; }, lib: function (r) { return (SERVICES[r._service] || { label: r._service }).label + " · " + r._nature; } },
        apporteur: { titre: "Apporteur d'affaires", cle: function (r) { return r._appId || 0; }, lib: function (r) { return nomApporteur(r._appId); } },
        guichetier: { titre: "Guichetier", cle: function (r) { return r._guichetier; }, lib: function (r) { return r._guichetier === "—" ? "Non renseigné (saisies en compte)" : r._guichetier; } },
        livreur: { titre: "Livreur", cle: function (r) { return r._livreurId || 0; }, lib: function (r) { return nomLivreur(r._livreurId); } },
        mode: { titre: "Mode de paiement", cle: function (r) { return r._mode || "—"; }, lib: function (r) { return r._mode || "—"; } },
        jour: { titre: "Jour", temps: true, cle: function (r) { return r._jour; }, lib: function (r) { return U.toFr(r._jour); } },
        semaine: { titre: "Semaine", temps: true, cle: function (r) { return r._semaine; }, lib: function (r) { return "Semaine " + r._semaine.substr(6) + " · " + r._semaine.substr(0, 4); } },
        mois: { titre: "Mois", temps: true, cle: function (r) { return r._mois; }, lib: function (r) { return moisLib(r._mois, true); } },
        dow: { titre: "Jour de la semaine", temps: true, cle: function (r) { return r._dow; }, lib: function (r) { return JOURS[r._dow]; } },
        heure: { titre: "Heure", temps: true, cle: function (r) { return r._heure == null ? -1 : r._heure; }, lib: function (r) { return r._heure == null ? "—" : r._heure + " h"; } }
    };

    /* ------------------------------------------------------------------
       Moteur d'agrégation (une passe)
       ------------------------------------------------------------------ */
    function mVide() { return { nb: 0, colis: 0, poids: 0, ht: 0, tva: 0, ttc: 0, enc: 0 }; }
    function mAjouter(m, r) {
        m.nb += r._nb; m.colis += r._colis; m.poids += r._poids;
        m.ht += r._ht; m.tva += r._tva; m.ttc += r._ttc; m.enc += r._enc;
    }
    function mSomme(a, b) { var m = $.extend({}, a); $.each(b, function (k, v) { m[k] = (m[k] || 0) + v; }); return m; }

    /* agreger(rows, ["agence", "mois"], { tri: "ht"|"nb"|"colis"|"poids"|"cle", extra: fn(groupe, ligne), init: fn(groupe) })
       -> { groupes: [{ cle, cles: [], libs: [], m: {...} }], index: { cle: groupe }, total: {...} } */
    function agreger(rows, dims, opts) {
        opts = opts || {};
        dims = $.isArray(dims) ? dims : [dims];
        var defs = [];
        $.each(dims, function (_, d) { defs.push(typeof d === "string" ? DIMS[d] : d); });
        var idx = {}, groupes = [], total = mVide(), nd = defs.length;
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i], cles = [], k;
            for (var j = 0; j < nd; j++) cles.push(defs[j].cle(r));
            k = cles.join("¦");
            var g = idx[k];
            if (!g) {
                g = idx[k] = { cle: k, cles: cles, libs: [], m: mVide() };
                for (j = 0; j < nd; j++) g.libs.push(defs[j].lib(r));
                if (opts.init) opts.init(g);
                groupes.push(g);
            }
            mAjouter(g.m, r); mAjouter(total, r);
            if (opts.extra) opts.extra(g, r);
        }
        trier(groupes, defs, opts.tri);
        return { groupes: groupes, index: idx, total: total, dims: defs };
    }
    function trier(groupes, defs, tri) {
        if (!tri) tri = defs[0] && defs[0].temps ? "cle" : "ht";
        groupes.sort(function (a, b) {
            if (tri === "cle") {
                for (var j = 0; j < a.cles.length; j++) { if (a.cles[j] < b.cles[j]) return -1; if (a.cles[j] > b.cles[j]) return 1; }
                return 0;
            }
            if (tri === "lib") return a.libs.join(" ") < b.libs.join(" ") ? -1 : 1;
            return (b.m[tri] || 0) - (a.m[tri] || 0);
        });
        return groupes;
    }

    /* Tableau croisé : croiser(rows, "ville", "villeDest", "colis")
       mesure : nom de mesure (nb, colis, poids, ht…) ou fonction(ligne) -> nombre */
    function croiser(rows, dL, dC, mesure) {
        var DL = typeof dL === "string" ? DIMS[dL] : dL, DC = typeof dC === "string" ? DIMS[dC] : dC;
        var f = typeof mesure === "function" ? mesure : function (r) { return r["_" + mesure] || 0; };
        var L = {}, C = {}, val = {}, totL = {}, totC = {}, total = 0, lignes = [], colonnes = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i], kl = DL.cle(r), kc = DC.cle(r), v = f(r);
            if (!L[kl]) { L[kl] = { cle: kl, lib: DL.lib(r) }; lignes.push(L[kl]); val[kl] = {}; totL[kl] = 0; }
            if (!C[kc]) { C[kc] = { cle: kc, lib: DC.lib(r) }; colonnes.push(C[kc]); totC[kc] = 0; }
            val[kl][kc] = (val[kl][kc] || 0) + v; totL[kl] += v; totC[kc] += v; total += v;
        }
        lignes.sort(function (a, b) { return totL[b.cle] - totL[a.cle]; });
        colonnes.sort(function (a, b) { return totC[b.cle] - totC[a.cle]; });
        return { lignes: lignes, colonnes: colonnes, val: val, totL: totL, totC: totC, total: total };
    }

    /* Série temporelle : valeurs par case (zéros compris) */
    function serie(rows, per, gran, mesure) {
        var cs = cases(per, gran), idx = {}, vals = [];
        var f = typeof mesure === "function" ? mesure : function (r) { return r["_" + (mesure || "ht")] || 0; };
        $.each(cs, function (i, c) { idx[c.cle] = i; vals.push(0); });
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i], k = gran === "mois" ? r._mois : gran === "semaine" ? r._semaine : r._jour;
            if (idx[k] != null) vals[idx[k]] += f(r);
        }
        return { cases: cs, vals: vals };
    }

    /* Médiane */
    function mediane(arr) {
        if (!arr.length) return null;
        var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    function ecartPct(a, b) { return b ? (a - b) / Math.abs(b) * 100 : null; }
    function ecartHtml(a, b, inverse) {
        var e = ecartPct(a, b);
        if (e == null) return a ? "<span class='ex-ecart ex-new' title='Pas de valeur sur la période comparée'>nouveau</span>" : "<span class='ex-ecart'>—</span>";
        var up = e >= 0, bon = inverse ? !up : up;
        if (Math.abs(e) < 0.05) return "<span class='ex-ecart'>= 0 %</span>";
        return "<span class='ex-ecart " + (bon ? "ex-up" : "ex-down") + "'><i class='fa fa-caret-" + (up ? "up" : "down") + "' aria-hidden='true'></i> " +
            (up ? "+" : "") + U.fmt(e, 1) + " %</span>";
    }

    /* ------------------------------------------------------------------
       URL (état partageable)
       ------------------------------------------------------------------ */
    var url = {
        lire: function () {
            var o = {}, q = window.location.search.replace(/^\?/, "");
            if (!q) return o;
            $.each(q.split("&"), function (_, kv) {
                var p = kv.split("="); if (!p[0]) return;
                o[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
            });
            return o;
        },
        ecrire: function (patch) {
            var o = $.extend(url.lire(), patch), parts = [];
            $.each(o, function (k, v) { if (v != null && v !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); });
            var u = window.location.pathname + (parts.length ? "?" + parts.join("&") : "") + window.location.hash;
            try { window.history.replaceState(null, "", u); } catch (e) { /* fichier local : ignoré */ }
        },
        get: function (k, def) { var v = url.lire()[k]; return v == null || v === "" ? def : v; }
    };

    /* ------------------------------------------------------------------
       Barre de filtres commune
       ------------------------------------------------------------------
       var F = new CX.etats.Filtres("#ex-filtres", {
           source: true,          // sélecteur « À partir des expéditions / des factures émises »
           comparaison: true, geo: true, typeClient: true, produit: true, apporteur: true, statut: true,
           periodes: ["jour","semaine","mois","trimestre","annee","perso"], defaut: { p: "mois", cmp: "PREC" },
           onChange: function (f) { ... }
       });
       F.get() -> { p, du, au, per: {du, au}, comp: {du, au} | null, cmp, geo, tc, srv, nat, app: [], st, src }
       F.resume() -> ["Période : …", "Agence : …", …] (en-têtes PDF / CSV)
       ------------------------------------------------------------------ */
    function Filtres(sel, opts) {
        this.$c = $(sel);
        this.o = $.extend({
            source: false, comparaison: true, geo: true, typeClient: true, produit: true, apporteur: true, statut: true,
            periodes: ["jour", "semaine", "mois", "trimestre", "annee", "perso"], defaut: {}, onChange: null, extraHtml: ""
        }, opts);
        this.defaut = $.extend({ p: "mois", du: "", au: "", cmp: "", geo: "", tc: "", srv: "", nat: "", app: "", st: "ACTIF", src: "EXP" }, this.o.defaut);
        this.f = this._lireUrl();
        this._rendre();
        this._lier();
        this._sync();
    }
    Filtres.prototype = {
        _lireUrl: function () {
            var u = url.lire(), d = this.defaut, f = {};
            $.each(d, function (k, v) { f[k] = u[k] != null ? u[k] : v; });
            if ($.inArray(f.p, this.o.periodes) < 0 && f.p !== "perso") f.p = d.p;
            if (f.cmp && f.cmp !== "PREC" && f.cmp !== "N1") f.cmp = "";
            if (f.st !== "TOUT") f.st = "ACTIF";
            if (f.src !== "FAC") f.src = "EXP";
            f.app = f.app ? String(f.app).split(",") : [];
            return f;
        },
        _rendre: function () {
            var o = this.o, h = [];
            var pills = $.map($.grep(RACCOURCIS, function (r) { return $.inArray(r.p, o.periodes) >= 0; }), function (r) {
                return "<button type='button' class='ex-seg-btn' data-p='" + r.p + "'>" + r.label + "</button>";
            }).join("");
            h.push("<div class='ex-f-row'>");
            h.push("<div class='cx-field ex-f-periode'><span class='cx-label' id='ex-f-p-lbl'>Période</span><div class='ex-seg' role='group' aria-labelledby='ex-f-p-lbl'>" + pills + "</div></div>");
            h.push("<div class='cx-field'><label class='cx-label' for='ex-f-du'>Du</label><input type='date' class='form-control' id='ex-f-du'></div>");
            h.push("<div class='cx-field'><label class='cx-label' for='ex-f-au'>Au</label><input type='date' class='form-control' id='ex-f-au'></div>");
            if (o.comparaison) {
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-cmp'>Comparer à</label><select class='form-control' id='ex-f-cmp'>" +
                    "<option value=''>Sans comparaison</option><option value='PREC'>Période précédente</option><option value='N1'>Même période N-1</option></select></div>");
            }
            if (o.source) {
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-src'>Source</label><select class='form-control' id='ex-f-src'>" +
                    "<option value='EXP'>À partir des expéditions</option><option value='FAC'>À partir des factures émises</option></select></div>");
            }
            h.push("</div><div class='ex-f-row'>");
            if (o.geo) {
                var villes = {}, opt = "<option value=''>Tout le réseau</option>";
                $.each(CX.REF.AGENCES, function (_, a) { (villes[a.ville] = villes[a.ville] || []).push(a); });
                $.each(villes, function (v, ags) {
                    opt += "<optgroup label='" + U.esc(villeNom(v)) + "'><option value='V:" + U.esc(v) + "'>" + U.esc(villeNom(v)) + " (toutes agences)</option>" +
                        $.map(ags, function (a) { return "<option value='A:" + a.id + "'>" + U.esc(agLib(a.id)) + "</option>"; }).join("") + "</optgroup>";
                });
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-geo'>Niveau géographique <span class='cx-opt'>(départ)</span></label><select class='form-control' id='ex-f-geo'>" + opt + "</select></div>");
            }
            if (o.typeClient) {
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-tc'>Type de client</label><select class='form-control' id='ex-f-tc'>" +
                    "<option value=''>Tous</option><option value='PARTICULIER'>Particuliers (comptant)</option><option value='COMPTE'>Clients en compte</option></select></div>");
            }
            if (o.produit) {
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-srv'>Produit · service</label><select class='form-control' id='ex-f-srv'><option value=''>Tous les services</option>" +
                    $.map(SERVICES, function (s, k) { return "<option value='" + k + "'>" + s.label + "</option>"; }).join("") + "</select></div>");
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-nat'>Nature</label><select class='form-control' id='ex-f-nat'><option value=''>Toutes</option>" +
                    $.map(CX.REF.NATURES_COLIS, function (n) { return "<option>" + U.esc(n) + "</option>"; }).join("") + "</select></div>");
            }
            var apps = CX.api.listSync("apporteurs");
            if (o.apporteur && apps.length) {
                h.push("<div class='cx-field ex-f-app'><label class='cx-label' for='ex-f-app'>Apporteur d'affaires</label><select class='form-control' id='ex-f-app' multiple>" +
                    "<option value='0'>Sans apporteur</option>" +
                    $.map(apps, function (a) { return "<option value='" + a.id + "'>" + U.esc(a.code + " · " + a.nom + " " + (a.prenoms || "")) + "</option>"; }).join("") + "</select></div>");
            }
            if (o.statut) {
                h.push("<div class='cx-field'><label class='cx-label' for='ex-f-st'>Données</label><select class='form-control' id='ex-f-st'>" +
                    "<option value='ACTIF'>Données actives</option><option value='TOUT'>Toutes (y compris annulées)</option></select></div>");
            }
            h.push(o.extraHtml || "");
            h.push("<div class='cx-field ex-f-actions'><button type='button' class='cx-btn cx-btn-link cx-btn-sm' id='ex-f-reset'><i class='fa fa-times'></i> Réinitialiser</button>" +
                "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' id='ex-f-lien' title='Copier l’adresse de cet état avec ses filtres'><i class='fa fa-link'></i> Copier le lien</button></div>");
            h.push("</div><div class='ex-f-resume' id='ex-f-resume' aria-live='polite'></div>");
            this.$c.addClass("ex-filtres cx-card cx-no-print").html(h.join(""));
            if ($.fn.select2 && this.$c.find("#ex-f-app").length) {
                this.$c.find("#ex-f-app").select2({ width: "100%", placeholder: "Tous", allowClear: true, language: { noResults: function () { return "Aucun apporteur"; } } });
            }
        },
        _lier: function () {
            var self = this, $c = this.$c;
            $c.on("click", ".ex-seg-btn", function () {
                var p = $(this).data("p");
                self.f.p = p;
                if (p === "perso") {
                    var per = periodeDe(self._ancienP || "mois");
                    if (!self.f.du) self.f.du = per.du;
                    if (!self.f.au) self.f.au = per.au;
                }
                self._changer();
            });
            $c.on("change", "#ex-f-du, #ex-f-au", function () {
                self.f.p = "perso"; self.f.du = $("#ex-f-du").val(); self.f.au = $("#ex-f-au").val();
                if (!self.f.du || !self.f.au) return;
                self._changer();
            });
            $.each({ cmp: "#ex-f-cmp", src: "#ex-f-src", geo: "#ex-f-geo", tc: "#ex-f-tc", srv: "#ex-f-srv", nat: "#ex-f-nat", st: "#ex-f-st" }, function (k, s) {
                $c.on("change", s, function () { self.f[k] = $(this).val() || ""; self._changer(); });
            });
            $c.on("change", "#ex-f-app", function () { self.f.app = $(this).val() || []; self._changer(); });
            $c.on("click", "#ex-f-reset", function () {
                self.f = $.extend({}, self.defaut, { app: [] });
                self._changer();
            });
            $c.on("click", "#ex-f-lien", function () {
                var lien = window.location.href;
                var fait = function () { U.toast("Lien de l'état copié : il rouvre cet état avec les mêmes filtres."); };
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lien).then(fait, function () { window.prompt("Copiez le lien :", lien); });
                else window.prompt("Copiez le lien :", lien);
            });
        },
        _sync: function () {
            var f = this.f, $c = this.$c, g = this.get();
            if (f.p !== "perso") this._ancienP = f.p;
            $c.find(".ex-seg-btn").each(function () { $(this).toggleClass("active", $(this).data("p") === f.p).attr("aria-pressed", $(this).data("p") === f.p); });
            $c.find("#ex-f-du").val(g.per.du); $c.find("#ex-f-au").val(g.per.au);
            $c.find("#ex-f-cmp").val(f.cmp); $c.find("#ex-f-src").val(f.src); $c.find("#ex-f-geo").val(f.geo);
            $c.find("#ex-f-tc").val(f.tc); $c.find("#ex-f-srv").val(f.srv); $c.find("#ex-f-nat").val(f.nat); $c.find("#ex-f-st").val(f.st);
            var $app = $c.find("#ex-f-app");
            if ($app.length) { $app.val(f.app); $app.trigger("change.select2"); }
            $c.find("#ex-f-resume").html("<i class='fa fa-filter' aria-hidden='true'></i> " + $.map(this.resume(), U.esc).join(" <span class='ex-dot'>·</span> "));
        },
        _changer: function () {
            var f = this.f;
            var g = this.get();
            url.ecrire({
                p: f.p === this.defaut.p ? "" : f.p, du: f.p === "perso" ? g.per.du : "", au: f.p === "perso" ? g.per.au : "",
                cmp: f.cmp === this.defaut.cmp ? "" : (f.cmp || "0"), geo: f.geo, tc: f.tc, srv: f.srv, nat: f.nat,
                app: (f.app || []).join(","), st: f.st === "TOUT" ? "TOUT" : "", src: f.src === "FAC" ? "FAC" : ""
            });
            this._sync();
            if (this.o.onChange) this.o.onChange(this.get());
        },
        get: function () {
            var f = $.extend({}, this.f);
            if (f.cmp === "0") f.cmp = "";
            f.app = (f.app || []).slice();
            f.per = periodeDe(f.p, f.du, f.au);
            f.comp = this.o.comparaison ? periodeComparee(f.p, f.per, f.cmp) : null;
            return f;
        },
        resume: function () {
            var f = this.get(), r = [];
            var lp = $.grep(RACCOURCIS, function (x) { return x.p === f.p; })[0];
            r.push("Période : " + (lp && f.p !== "perso" ? lp.label.toLowerCase() + ", " : "") + libPeriode(f.per));
            if (f.comp) r.push("Comparée " + (f.cmp === "N1" ? "à N-1" : "à la période précédente") + " (" + libPeriode(f.comp) + ")");
            if (this.o.source) r.push("Source : " + (f.src === "FAC" ? "factures émises" : "expéditions"));
            if (f.geo) r.push("Départ : " + (f.geo.charAt(0) === "V" ? villeNom(f.geo.substr(2)) + " (toutes agences)" : agLib(f.geo.substr(2))));
            if (f.tc) r.push("Clients : " + TYPES_CLIENT[f.tc]);
            if (f.srv) r.push("Service : " + SERVICES[f.srv].label);
            if (f.nat) r.push("Nature : " + f.nat);
            if (f.app.length) r.push("Apporteur : " + $.map(f.app, function (id) { return nomApporteur(parseInt(id, 10)); }).join(", "));
            r.push(f.st === "TOUT" ? "Toutes les données (annulées comprises)" : "Données actives");
            return r;
        },
        /* Filtres d'une page : permet de forcer un champ (ex. période imposée) */
        set: function (patch) { $.extend(this.f, patch); this._changer(); }
    };

    /* Applique les filtres (hors période si per = null) */
    function filtrer(rows, f, per, opts) {
        opts = opts || {};
        var out = [], geoV = f.geo && f.geo.charAt(0) === "V" ? f.geo.substr(2) : null, geoA = f.geo && f.geo.charAt(0) === "A" ? parseInt(f.geo.substr(2), 10) : null;
        var apps = null;
        if (f.app && f.app.length) { apps = {}; $.each(f.app, function (_, a) { apps[parseInt(a, 10) || 0] = true; }); }
        var tous = f.st === "TOUT" || opts.inclureAnnulees;
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (per && (r._jour < per.du || r._jour > per.au)) continue;
            if (!tous && !r._actif) continue;
            if (geoV && r._ville !== geoV) continue;
            if (geoA && r._agId !== geoA) continue;
            if (f.tc && r._typeClient !== f.tc) continue;
            if (f.srv && r._service !== f.srv) continue;
            if (f.nat && r._nature !== f.nat) continue;
            if (apps && !apps[r._appId || 0]) continue;
            out.push(r);
        }
        return out;
    }

    /* ------------------------------------------------------------------
       Formats
       ------------------------------------------------------------------ */
    function fmtCourt(n) {
        var a = Math.abs(n || 0);
        if (a >= 1e9) return U.fmt(n / 1e9, 2).replace(/,?0+$/, "") + " Md";
        if (a >= 1e6) return U.fmt(n / 1e6, 2).replace(/,?0+$/, "") + " M";
        if (a >= 1e4) return U.fmt(n / 1e3, 1).replace(/,0$/, "") + " k";
        return U.fmt(n, a % 1 && a < 100 ? 1 : 0);
    }
    function fmtVal(v, f) {
        if (v == null || v === "" || (typeof v === "number" && isNaN(v))) return "—";
        switch (f) {
            case "money": return U.fmt(U.round(v));
            case "int": return U.fmt(Math.round(v));
            case "kg": return U.fmt(v, 1);
            case "pct": return pct(v);
            case "jours": return U.fmt(v, 1) + " j";
            default: return U.esc(v);
        }
    }

    /* Indicateur (carte KPI) avec tendance */
    function kpi(o) {
        var t = "";
        if (o.cur != null && o.prev != null) {
            t = " " + ecartHtml(o.cur, o.prev, o.inverse) + " <span class='ex-kpi-vs'>" + U.esc(o.vs || "vs période comparée") + "</span>";
        }
        return "<div class='cx-kpi ex-kpi " + (o.couleur || "") + "'" + (o.tip ? " title='" + U.esc(o.tip) + "'" : "") + ">" +
            "<div class='cx-kpi-ico'><i class='fa " + (o.icon || "fa-bar-chart") + "' aria-hidden='true'></i></div>" +
            "<div class='cx-kpi-label'>" + U.esc(o.label) + "</div><div class='cx-kpi-value'>" + o.valeur + "</div>" +
            "<div class='cx-kpi-foot'>" + (o.foot || "") + t + "</div></div>";
    }

    /* ------------------------------------------------------------------
       Tableaux d'état
       ------------------------------------------------------------------
       def = {
         cols: [{ t: "Titre", v: function(ligne){ return valeur brute }, f: "money"|"int"|"kg"|"pct"|"jours"|"txt",
                  h: function(ligne){ return html } (facultatif), num: true, cls: "", csv: false (exclure) }],
         lignes: [{ ..., _niv: "grp" (en-tête de groupe) | "st" (sous-total) | undefined }],
         total: { ... } | null, vide: "Aucune donnée", id: "…", cls: ""
       } */
    function tableau(def) {
        var cols = def.cols, h = [];
        h.push("<div class='cx-table-wrap'><table class='cx-table ex-table " + (def.cls || "") + "'" + (def.id ? " id='" + def.id + "'" : "") + ">");
        h.push("<thead><tr>" + $.map(cols, function (c) {
            return "<th class='" + (c.num ? "num " : "") + (c.cls || "") + "' scope='col'>" + c.t + "</th>";
        }).join("") + "</tr></thead><tbody>");
        if (!def.lignes.length) {
            h.push("<tr><td colspan='" + cols.length + "'><div class='cx-empty'><i class='fa fa-bar-chart'></i><b>" + U.esc(def.vide || "Aucune donnée sur la période") + "</b>Modifiez la période ou les filtres.</div></td></tr>");
        }
        $.each(def.lignes, function (_, l) {
            if (l._niv === "grp") {
                h.push("<tr class='ex-tr-grp'><th colspan='" + cols.length + "' scope='rowgroup'>" + U.esc(l.lib) + "</th></tr>");
                return;
            }
            h.push("<tr class='" + (l._niv === "st" ? "ex-tr-st" : "") + (l._cls ? " " + l._cls : "") + "'" + (l._id != null ? " data-id='" + U.esc(l._id) + "'" : "") + ">" + $.map(cols, function (c) {
                return "<td class='" + (c.num ? "num " : "") + (c.cls || "") + "'>" + (c.h ? c.h(l) : fmtVal(c.v(l), c.f)) + "</td>";
            }).join("") + "</tr>");
        });
        h.push("</tbody>");
        if (def.total && def.lignes.length) {
            h.push("<tfoot><tr>" + $.map(cols, function (c, i) {
                var v = c.tot ? c.tot(def.total) : (c.h ? c.h(def.total) : fmtVal(c.v(def.total), c.f));
                return "<td class='" + (c.num ? "num " : "") + (c.cls || "") + "'>" + (i === 0 && !c.tot ? "Total" : v) + "</td>";
            }).join("") + "</tr></tfoot>");
        }
        h.push("</table></div>");
        return h.join("");
    }
    /* Même définition -> { entetes, lignes } pour l'export CSV */
    function tableauCsv(def) {
        var cols = $.grep(def.cols, function (c) { return c.csv !== false; });
        var ent = $.map(cols, function (c) { return $("<div>").html(c.t).text(); });
        var lignes = [];
        function brut(c, l) {
            if (c.csvV) return c.csvV(l);
            var v = c.v ? c.v(l) : "";
            if (v != null && typeof v === "number" && (c.f === "money" || c.f === "int")) return Math.round(v);
            if (v != null && typeof v === "number") return Math.round(v * 10) / 10;
            return v == null ? "" : v;
        }
        $.each(def.lignes, function (_, l) {
            if (l._niv === "grp") { lignes.push([l.lib]); return; }
            lignes.push($.map(cols, function (c) { return [brut(c, l)]; }));
        });
        if (def.total) lignes.push($.map(cols, function (c, i) { return [i === 0 ? "TOTAL" : brut(c, def.total)]; }));
        return { entetes: ent, lignes: lignes };
    }

    /* ------------------------------------------------------------------
       Export CSV (Excel FR : UTF-8 avec BOM, séparateur « ; », virgule décimale)
       ------------------------------------------------------------------ */
    function csvCell(v) {
        if (v == null) return "";
        if (typeof v === "number") return String(v).replace(".", ",");
        var s = String(v);
        return /[";\n\r]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    }
    /* csv("nom-fichier", { entetes: [...], lignes: [[...]] } | [{...}], { titre, filtres: [] }) */
    function csv(nom, tab, meta) {
        meta = meta || {};
        var out = [];
        if (meta.titre) out.push(csvCell(CX.CONFIG.SOCIETE.nom + " - " + meta.titre));
        $.each(meta.filtres || [], function (_, f) { out.push(csvCell(f)); });
        out.push(csvCell("Édité le " + U.toFr(U.now()) + " par " + CX.CONFIG.USER.nom));
        out.push("");
        $.each($.isArray(tab) ? tab : [tab], function (i, t) {
            if (i) out.push("");
            if (t.titre) out.push(csvCell(t.titre));
            out.push($.map(t.entetes, csvCell).join(";"));
            $.each(t.lignes, function (_, l) { out.push($.map(l, function (v) { return [csvCell(v)]; }).join(";")); });
        });
        var blob = new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var fichier = String(nom || "etat").replace(/[\\\/:*?"<>|]+/g, "-") + ".csv";
        if (window.navigator && window.navigator.msSaveBlob) { window.navigator.msSaveBlob(blob, fichier); return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = fichier; a.style.display = "none";
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); $(a).remove(); }, 500);
        U.toast("Export CSV : <b>" + U.esc(fichier) + "</b>");
        return out.length;
    }

    /* ------------------------------------------------------------------
       Feuille A4 (PDF direct + impression)
       o = { titre, sousTitre, filtres: [], blocs: [html], orientation: "portrait"|"landscape", nom, bouton }
       ------------------------------------------------------------------ */
    function cheminLogo() {
        var l = CX.CONFIG.SOCIETE.logo || "";
        if (!l || /^(https?:|data:|\/)/.test(l)) return l;
        return (window.CX_BASE || "") + l;
    }
    function feuilleHtml(o) {
        var S = CX.CONFIG.SOCIETE, land = o.orientation === "landscape";
        return "<div class='ex-sheet" + (land ? " ex-land" : "") + "'>" +
            "<div class='ex-sheet-head'>" +
            "<div class='ex-sheet-soc'>" + (cheminLogo() ? "<img src='" + U.esc(cheminLogo()) + "' alt=''>" : "") +
            "<div><b>" + U.esc(S.nom) + "</b><small>" + U.esc(S.adresse) + "<br>" + U.esc(S.tel) + " · " + U.esc(S.email) + "</small></div></div>" +
            "<div class='ex-sheet-meta'>Édité le " + U.esc(U.toFr(U.now())) + "<br>par " + U.esc(CX.CONFIG.USER.nom) + "</div></div>" +
            "<h1 class='ex-sheet-title'>" + U.esc(o.titre) + "</h1>" +
            (o.sousTitre ? "<div class='ex-sheet-sub'>" + U.esc(o.sousTitre) + "</div>" : "") +
            (o.filtres && o.filtres.length ? "<div class='ex-sheet-filtres'><b>Filtres appliqués :</b> " + $.map(o.filtres, U.esc).join(" · ") + "</div>" : "") +
            "<div class='ex-sheet-body'>" + (o.blocs || []).join("") + "</div>" +
            "<div class='ex-sheet-foot'>" + U.esc(S.nom) + " · RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu) + " — ClemenTino 2.0, module États</div></div>";
    }
    function chargerLib() {
        if (window.html2pdf) return $.Deferred().resolve().promise();
        if (CX.pdf && CX.pdf._lib) return CX.pdf._lib();
        return $.ajax({ url: "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js", dataType: "script", cache: true });
    }
    function pdf(o) {
        var land = o.orientation === "landscape", px = land ? 1123 : 794;
        var nom = (CX.pdf ? CX.pdf.nomFichier(o.nom || o.titre) : (o.nom || o.titre) + ".pdf");
        var $btn = o.bouton ? $(o.bouton) : $();
        if ($btn.length) U.busy($btn, true);
        var dfd = $.Deferred();
        chargerLib().then(function () {
            var $stage = $("<div class='ex-pdf-stage'></div>").css({ position: "fixed", left: "-14000px", top: 0, width: px + "px", background: "#fff", zIndex: -1 }).appendTo("body");
            var $f = $(feuilleHtml(o)).addClass("ex-pdf-mode").appendTo($stage);
            var lignes = $f.find("tr").length;
            var opt = {
                margin: [8, 0, 10, 0], filename: nom, image: { type: "jpeg", quality: 0.95 },
                html2canvas: { scale: lignes > 250 ? 1.4 : 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: px, scrollX: 0, scrollY: 0, logging: false },
                jsPDF: { unit: "mm", format: "a4", orientation: land ? "landscape" : "portrait", compress: true },
                pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".ex-avoid", ".ex-chart"] }
            };
            var imgs = $f.find("img").get();
            $.when.apply($, $.map(imgs, function (img) {
                var d = $.Deferred(); if (img.complete) d.resolve(); else img.onload = img.onerror = function () { d.resolve(); }; return d.promise();
            })).then(function () {
                window.html2pdf().set(opt).from($f[0]).save().then(function () { $stage.remove(); dfd.resolve(nom); }, function (e) { $stage.remove(); dfd.reject(e); });
            });
        }, function (e) { dfd.reject(e); });
        dfd.done(function () { U.toast("PDF téléchargé : <b>" + U.esc(nom) + "</b>"); })
            .fail(function () { U.toast("Le PDF n'a pas pu être généré (bibliothèque indisponible hors ligne ?). Utilisez « Imprimer » puis « Enregistrer au format PDF ».", "error"); })
            .always(function () { if ($btn.length) U.busy($btn, false); });
        return dfd.promise();
    }
    function imprimer(o) {
        $("#ex-print-zone, #ex-page-style").remove();
        $("<style id='ex-page-style'>@page { size: A4 " + (o.orientation === "landscape" ? "landscape" : "portrait") + "; margin: 10mm 8mm; }</style>").appendTo("head");
        $("<div id='ex-print-zone'></div>").html(feuilleHtml(o)).appendTo("body");
        $("body").addClass("ex-printing");
        var fin = function () { $("body").removeClass("ex-printing"); $("#ex-print-zone, #ex-page-style").remove(); };
        if (window.matchMedia) {
            var mq = window.matchMedia("print"), h = function (m) { if (!m.matches) { fin(); if (mq.removeListener) mq.removeListener(h); } };
            if (mq.addListener) mq.addListener(h);
        }
        setTimeout(function () { window.print(); setTimeout(fin, 800); }, 60);
    }

    /* ------------------------------------------------------------------
       Graphiques SVG (aucune bibliothèque) + infobulles
       Chaque fonction renvoie une chaîne HTML (<div class="ex-chart"><svg>…).
       Les éléments survolables portent data-tip (HTML échappé).
       ------------------------------------------------------------------ */
    var graph = (function () {
        function niceMax(v) {
            if (!(v > 0)) return 1;
            var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / e;
            return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
        }
        function tronquer(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.substr(0, n - 1) + "…" : s; }
        function tip(s) { return " data-tip='" + U.esc(s) + "' tabindex='0'"; }
        function vide(msg) { return "<div class='ex-vide'><i class='fa fa-bar-chart' aria-hidden='true'></i>" + U.esc(msg || "Aucune donnée sur la période") + "</div>"; }
        function legende(items) {
            return "<ul class='ex-legende'>" + $.map(items, function (it) {
                return "<li><span class='ex-sw" + (it.pointille ? " ex-sw-dash" : "") + "' style='background:" + it.couleur + ";border-color:" + it.couleur + "'></span>" + U.esc(it.lib) + "</li>";
            }).join("") + "</ul>";
        }
        function axeY(s, max, ml, mt, iw, ih, fmt) {
            for (var i = 0; i <= 4; i++) {
                var y = Math.round(mt + ih - ih * i / 4) + 0.5;
                s.push("<line x1='" + ml + "' x2='" + (ml + iw) + "' y1='" + y + "' y2='" + y + "' stroke='" + COUL.grille + "'" + (i ? " stroke-dasharray='3 3'" : "") + "/>");
                s.push("<text x='" + (ml - 6) + "' y='" + (y + 4) + "' text-anchor='end' class='ex-ax'>" + U.esc((fmt || fmtCourt)(max * i / 4)) + "</text>");
            }
        }

        /* Barres verticales : data [{ lib, v, v2 (comparaison, facultatif), tip }]
           o = { h, w, fmt (infobulle), serie, serie2, couleur, couleur2, titre (aria) } */
        function barres(data, o) {
            o = $.extend({ h: 240, w: 720, fmt: U.money, serie: "Période", serie2: "Comparaison", couleur: COUL.marine, couleur2: COUL.grisC, etiquettes: true }, o);
            var n = data.length, tot = 0;
            $.each(data, function (_, d) { tot += Math.abs(d.v || 0) + Math.abs(d.v2 || 0); });
            if (!n || !tot) return vide(o.vide);
            var a2 = false, max = 0;
            $.each(data, function (_, d) { max = Math.max(max, d.v || 0, d.v2 || 0); if (d.v2 != null) a2 = true; });
            max = niceMax(max);
            var W = o.w, H = o.h, ml = 54, mr = 10, mt = 16, mb = 38, iw = W - ml - mr, ih = H - mt - mb;
            var s = ["<svg class='ex-svg' viewBox='0 0 " + W + " " + H + "' style='max-width:" + W + "px' role='img' aria-label='" + U.esc(o.titre || "Graphique en barres") + "'>"];
            axeY(s, max, ml, mt, iw, ih);
            var band = iw / n, bw = Math.max(2, Math.min(46, band * (a2 ? 0.36 : 0.62))), k = Math.max(1, Math.ceil(n / Math.floor(iw / 58)));
            $.each(data, function (i, d) {
                var grp = a2 ? bw * 2 + 2 : bw, x0 = ml + band * i + (band - grp) / 2;
                var t = "<b>" + U.esc(d.lib) + "</b><br>" + o.serie + " : " + o.fmt(d.v || 0) + (a2 ? "<br>" + o.serie2 + " : " + o.fmt(d.v2 || 0) + " " + ecartHtml(d.v || 0, d.v2 || 0) : "") + (d.tip ? "<br>" + d.tip : "");
                s.push("<g class='ex-hit'" + tip(t) + "><rect x='" + (ml + band * i) + "' y='" + mt + "' width='" + band + "' height='" + ih + "' fill='transparent'/>");
                if (a2) {
                    var h2 = ih * (d.v2 || 0) / max;
                    s.push("<rect x='" + x0.toFixed(1) + "' y='" + (mt + ih - h2).toFixed(1) + "' width='" + bw.toFixed(1) + "' height='" + Math.max(0, h2).toFixed(1) + "' rx='2' fill='" + o.couleur2 + "'/>");
                    x0 += bw + 2;
                }
                var h1 = ih * (d.v || 0) / max;
                s.push("<rect x='" + x0.toFixed(1) + "' y='" + (mt + ih - h1).toFixed(1) + "' width='" + bw.toFixed(1) + "' height='" + Math.max(0, h1).toFixed(1) + "' rx='2' fill='" + (d.couleur || o.couleur) + "'/>");
                if (o.etiquettes && n <= 16 && d.v) s.push("<text x='" + (x0 + bw / 2).toFixed(1) + "' y='" + (mt + ih - h1 - 4).toFixed(1) + "' text-anchor='middle' class='ex-val'>" + U.esc(fmtCourt(d.v)) + "</text>");
                s.push("</g>");
                if (i % k === 0) s.push("<text x='" + (ml + band * i + band / 2).toFixed(1) + "' y='" + (H - mb + 16) + "' text-anchor='middle' class='ex-ax'>" + U.esc(tronquer(d.lib, k > 1 ? 14 : Math.max(6, Math.floor(band / 6.2)))) + "</text>");
            });
            s.push("</svg>");
            return "<div class='ex-chart'>" + (a2 ? legende([{ lib: o.serie, couleur: o.couleur }, { lib: o.serie2, couleur: o.couleur2 }]) : "") + s.join("") + "</div>";
        }

        /* Barres horizontales (classements / top 10) : data [{ lib, v, v2, sous }] */
        function barresH(data, o) {
            o = $.extend({ w: 560, lw: 180, fmt: U.money, court: fmtCourt, couleur: COUL.marine, serie: "Période", serie2: "Comparaison" }, o);
            var n = data.length, max = 0;
            $.each(data, function (_, d) { max = Math.max(max, d.v || 0, d.v2 || 0); });
            if (!n || !max) return vide(o.vide);
            var row = 26, W = o.w, vw = 78, H = n * row + 6, bwMax = W - o.lw - vw - 8;
            var s = ["<svg class='ex-svg' viewBox='0 0 " + W + " " + H + "' style='max-width:" + W + "px' role='img' aria-label='" + U.esc(o.titre || "Classement") + "'>"];
            $.each(data, function (i, d) {
                var y = 4 + i * row, bw = Math.max(1, bwMax * (d.v || 0) / max);
                var t = "<b>" + U.esc(d.lib) + "</b><br>" + o.serie + " : " + o.fmt(d.v || 0) + (d.v2 != null ? "<br>" + o.serie2 + " : " + o.fmt(d.v2) + " " + ecartHtml(d.v || 0, d.v2) : "") + (d.sous ? "<br>" + d.sous : "");
                s.push("<g class='ex-hit'" + tip(t) + "><rect x='0' y='" + y + "' width='" + W + "' height='" + row + "' fill='transparent'/>");
                s.push("<text x='" + (o.lw - 8) + "' y='" + (y + 16) + "' text-anchor='end' class='ex-lbl'>" + U.esc(tronquer(d.lib, Math.floor(o.lw / 7.4))) + "</text>");
                s.push("<rect x='" + o.lw + "' y='" + (y + 5) + "' width='" + bw.toFixed(1) + "' height='15' rx='3' fill='" + (d.couleur || o.couleur) + "'/>");
                if (d.v2 != null) {
                    var x2 = o.lw + bwMax * d.v2 / max;
                    s.push("<line x1='" + x2.toFixed(1) + "' x2='" + x2.toFixed(1) + "' y1='" + (y + 2) + "' y2='" + (y + 23) + "' stroke='" + COUL.gris + "' stroke-width='2'/>");
                }
                s.push("<text x='" + (o.lw + bw + 6).toFixed(1) + "' y='" + (y + 17) + "' class='ex-val'>" + U.esc(o.court(d.v || 0)) + "</text></g>");
            });
            s.push("</svg>");
            return "<div class='ex-chart'>" + (o.legende2 ? legende([{ lib: o.serie, couleur: o.couleur }, { lib: o.serie2 + " (repère)", couleur: COUL.gris }]) : "") + s.join("") + "</div>";
        }

        /* Courbes : labels [..], series [{ nom, couleur, vals: [..], pointille, aire }] */
        function courbes(labels, series, o) {
            o = $.extend({ h: 250, w: 720, fmt: U.money }, o);
            var n = labels.length, max = 0;
            $.each(series, function (_, se) { $.each(se.vals, function (_, v) { max = Math.max(max, v || 0); }); });
            if (!n || !max) return vide(o.vide);
            max = niceMax(max);
            var W = o.w, H = o.h, ml = 54, mr = 14, mt = 14, mb = 38, iw = W - ml - mr, ih = H - mt - mb;
            function X(i) { return n === 1 ? ml + iw / 2 : ml + iw * i / (n - 1); }
            function Y(v) { return mt + ih - ih * (v || 0) / max; }
            var s = ["<svg class='ex-svg' viewBox='0 0 " + W + " " + H + "' style='max-width:" + W + "px' role='img' aria-label='" + U.esc(o.titre || "Évolution") + "'>"];
            axeY(s, max, ml, mt, iw, ih);
            if (o.seuil) {
                var ys = Y(Math.min(o.seuil.v, max));
                s.push("<line x1='" + ml + "' x2='" + (ml + iw) + "' y1='" + ys.toFixed(1) + "' y2='" + ys.toFixed(1) + "' stroke='" + COUL.rouge + "' stroke-dasharray='6 4' stroke-width='1.5'/>" +
                    "<text x='" + (ml + iw) + "' y='" + (ys - 5).toFixed(1) + "' text-anchor='end' class='ex-ax' fill='" + COUL.rouge + "'>" + U.esc(o.seuil.lib) + "</text>");
            }
            for (var si = series.length - 1; si >= 0; si--) {
                var se = series[si], d = "";
                $.each(se.vals, function (i, v) { d += (i ? " L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
                if (se.aire) s.push("<path d='" + d + " L" + X(n - 1).toFixed(1) + " " + (mt + ih) + " L" + X(0).toFixed(1) + " " + (mt + ih) + " Z' fill='" + se.couleur + "' opacity='.09'/>");
                s.push("<path d='" + d + "' fill='none' stroke='" + se.couleur + "' stroke-width='" + (se.pointille ? 1.8 : 2.4) + "'" + (se.pointille ? " stroke-dasharray='5 4'" : "") + " stroke-linejoin='round' stroke-linecap='round'/>");
                if (n <= 45) $.each(se.vals, function (i, v) { s.push("<circle cx='" + X(i).toFixed(1) + "' cy='" + Y(v).toFixed(1) + "' r='" + (se.pointille ? 2.2 : 3) + "' fill='#fff' stroke='" + se.couleur + "' stroke-width='1.8'/>"); });
            }
            var k = Math.max(1, Math.ceil(n / Math.floor(iw / 62))), band = n > 1 ? iw / (n - 1) : iw;
            $.each(labels, function (i, lib) {
                var t = "<b>" + U.esc(lib) + "</b>" + $.map(series, function (se) { return "<br>" + se.nom + " : " + o.fmt(se.vals[i] || 0); }).join("");
                if (series.length > 1 && series[1].comparaison) t += " " + ecartHtml(series[0].vals[i] || 0, series[1].vals[i] || 0);
                s.push("<rect class='ex-hit'" + tip(t) + " x='" + (X(i) - band / 2).toFixed(1) + "' y='" + mt + "' width='" + band.toFixed(1) + "' height='" + ih + "' fill='transparent'/>");
                if (i % k === 0 || (i === n - 1 && n <= 14)) s.push("<text x='" + X(i).toFixed(1) + "' y='" + (H - mb + 16) + "' text-anchor='middle' class='ex-ax'>" + U.esc(tronquer(lib, 14)) + "</text>");
            });
            s.push("</svg>");
            return "<div class='ex-chart'>" + legende($.map(series, function (se) { return { lib: se.nom, couleur: se.couleur, pointille: se.pointille }; })) + s.join("") + "</div>";
        }

        /* Anneau : data [{ lib, v, couleur }] ; o = { fmt, centre: "libellé du total" } */
        function anneau(data, o) {
            o = $.extend({ fmt: U.money, centre: "Total", taille: 190 }, o);
            var tot = 0;
            data = $.grep(data, function (d) { return (d.v || 0) > 0; });
            $.each(data, function (_, d) { tot += d.v; });
            if (!tot) return vide(o.vide);
            var S = o.taille, cx = S / 2, cy = S / 2, R = S / 2 - 4, r = R * 0.62, a = -Math.PI / 2;
            var s = ["<svg class='ex-svg ex-svg-donut' viewBox='0 0 " + S + " " + S + "' role='img' aria-label='" + U.esc(o.titre || "Répartition") + "'>"];
            function pt(rad, ang) { return (cx + rad * Math.cos(ang)).toFixed(2) + " " + (cy + rad * Math.sin(ang)).toFixed(2); }
            $.each(data, function (i, d) {
                var part = d.v / tot, a2 = a + part * Math.PI * 2 - (part >= 1 ? 0.0001 : 0), big = part > 0.5 ? 1 : 0, c = d.couleur || PALETTE[i % PALETTE.length];
                d.couleur = c;
                var path = "M" + pt(R, a) + " A" + R + " " + R + " 0 " + big + " 1 " + pt(R, a2) + " L" + pt(r, a2) + " A" + r + " " + r + " 0 " + big + " 0 " + pt(r, a) + " Z";
                s.push("<path class='ex-hit' d='" + path + "' fill='" + c + "' stroke='#fff' stroke-width='1.5'" + tip("<b>" + U.esc(d.lib) + "</b><br>" + o.fmt(d.v) + " · " + pct(part * 100)) + "/>");
                a = a2;
            });
            s.push("<text x='" + cx + "' y='" + (cy - 2) + "' text-anchor='middle' class='ex-donut-v'>" + U.esc(fmtCourt(tot)) + "</text>");
            s.push("<text x='" + cx + "' y='" + (cy + 15) + "' text-anchor='middle' class='ex-ax'>" + U.esc(o.centre) + "</text></svg>");
            var leg = "<ul class='ex-legende-v'>" + $.map(data, function (d) {
                return "<li><span class='ex-sw' style='background:" + d.couleur + "'></span><span class='ex-lg-lib'>" + U.esc(d.lib) + "</span><b>" + pct(d.v / tot * 100) + "</b><small>" + U.esc(o.fmt(d.v)) + "</small></li>";
            }).join("") + "</ul>";
            return "<div class='ex-chart ex-donut'>" + s.join("") + leg + "</div>";
        }

        /* Carte de chaleur : lignes [..], colonnes [..], mat[l][c] ; o = { fmt, unite, valeurs } */
        function chaleur(lignes, colonnes, mat, o) {
            o = $.extend({ fmt: function (v) { return U.fmt(v); }, unite: "", cw: 30, ch: 26, lw: 74, valeurs: true }, o);
            var max = 0;
            $.each(mat, function (_, l) { $.each(l, function (_, v) { max = Math.max(max, v || 0); }); });
            if (!max) return vide(o.vide);
            var W = o.lw + colonnes.length * o.cw + 4, H = 20 + lignes.length * o.ch + 4;
            var s = ["<svg class='ex-svg' viewBox='0 0 " + W + " " + H + "' style='max-width:" + W + "px' role='img' aria-label='" + U.esc(o.titre || "Carte de chaleur") + "'>"];
            var c0 = [238, 243, 251], c1 = [19, 48, 107];
            function col(t) { return "rgb(" + $.map([0, 1, 2], function (i) { return Math.round(c0[i] + (c1[i] - c0[i]) * t); }).join(",") + ")"; }
            $.each(colonnes, function (j, c) { s.push("<text x='" + (o.lw + j * o.cw + o.cw / 2) + "' y='13' text-anchor='middle' class='ex-ax'>" + U.esc(c) + "</text>"); });
            $.each(lignes, function (i, l) {
                var y = 20 + i * o.ch;
                s.push("<text x='" + (o.lw - 8) + "' y='" + (y + o.ch / 2 + 4) + "' text-anchor='end' class='ex-lbl'>" + U.esc(l) + "</text>");
                $.each(colonnes, function (j, c) {
                    var v = (mat[i] && mat[i][j]) || 0, t = v / max;
                    s.push("<rect class='ex-hit' x='" + (o.lw + j * o.cw + 1) + "' y='" + (y + 1) + "' width='" + (o.cw - 2) + "' height='" + (o.ch - 2) + "' rx='3' fill='" + (v ? col(0.08 + t * 0.92) : "#f6f7fa") + "'" +
                        tip("<b>" + U.esc(l) + " · " + U.esc(c) + "</b><br>" + o.fmt(v) + (o.unite ? " " + o.unite : "")) + "/>");
                    if (o.valeurs && v) s.push("<text x='" + (o.lw + j * o.cw + o.cw / 2) + "' y='" + (y + o.ch / 2 + 4) + "' text-anchor='middle' class='ex-hm-v' fill='" + (t > 0.5 ? "#fff" : "#13306b") + "'>" + U.esc(fmtCourt(v)) + "</text>");
                });
            });
            s.push("</svg>");
            return "<div class='ex-chart'>" + s.join("") + "<div class='ex-hm-leg'><span>0</span><i style='background:linear-gradient(90deg," + col(0.08) + "," + col(1) + ")'></i><span>" + U.esc(o.fmt(max)) + (o.unite ? " " + U.esc(o.unite) : "") + "</span></div></div>";
        }

        /* Infobulle unique, déléguée (fonctionne pour tous les graphiques injectés) */
        var $tip = null;
        function placer(e) {
            if (!$tip) return;
            var x = e.clientX + 14, y = e.clientY + 14, w = $tip.outerWidth(), h = $tip.outerHeight();
            if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
            if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
            $tip.css({ left: x, top: y });
        }
        $(document).on("mouseenter focus", "[data-tip]", function (e) {
            if (!$tip) $tip = $("<div class='ex-tip' role='tooltip'></div>").appendTo("body");
            $tip.html($(this).attr("data-tip")).show();
            if (e.clientX == null) { var r = this.getBoundingClientRect(); e = { clientX: r.left + r.width / 2, clientY: r.top }; }
            placer(e);
        }).on("mousemove", "[data-tip]", placer).on("mouseleave blur", "[data-tip]", function () { if ($tip) $tip.hide(); });

        return { barres: barres, barresH: barresH, courbes: courbes, anneau: anneau, chaleur: chaleur, legende: legende, vide: vide, niceMax: niceMax };
    })();

    /* ------------------------------------------------------------------
       Caisse des agences (excédent de trésorerie)
       Encaissements comptant des particuliers (paiement.statut = PAYE, non
       annulés) par mode ; versements (collection « versements ») ; solde de
       caisse = espèces encaissées - versements, cumulés depuis l'origine.
       Mobile money (Orange Money, MTN MoMo) : encaissé sur le compte marchand
       de la société, hors caisse physique.
       ------------------------------------------------------------------ */
    function estEspeces(mode) { return /esp[eè]ces/i.test(String(mode || "")); }
    function caisse(D, jusquA) {
        var parAg = {};
        function ag(id) {
            if (!parAg[id]) parAg[id] = { agId: id, lib: agLib(id), esp: {}, mm: {}, modes: {}, vers: {}, totEsp: 0, totVers: 0 };
            return parAg[id];
        }
        $.each(D.exps, function (_, e) {
            if (!e._actif || !e.paiement || e.paiement.statut !== "PAYE" || !e._enc || !e._agId) return;
            if (jusquA && e._jour > jusquA) return;
            var a = ag(e._agId), m = e._mode || "Espèces";
            a.modes[m] = a.modes[m] || {};
            a.modes[m][e._jour] = (a.modes[m][e._jour] || 0) + e._enc;
            if (estEspeces(m)) { a.esp[e._jour] = (a.esp[e._jour] || 0) + e._enc; a.totEsp += e._enc; }
            else a.mm[e._jour] = (a.mm[e._jour] || 0) + e._enc;
        });
        $.each(D.versements || [], function (_, v) {
            if (v.statut === "ANNULE" || (jusquA && v.date > jusquA)) return;
            var a = ag(v.agenceId);
            a.vers[v.date] = (a.vers[v.date] || 0) + U.round(v.montant);
            a.totVers += U.round(v.montant);
        });
        $.each(parAg, function (_, a) { a.solde = a.totEsp - a.totVers; });
        return parAg;
    }
    function soldeAu(a, date) {
        var s = 0;
        $.each(a.esp, function (j, v) { if (j <= date) s += v; });
        $.each(a.vers, function (j, v) { if (j <= date) s -= v; });
        return s;
    }
    function plafonds() { try { return JSON.parse(localStorage.getItem("cx_etats_plafonds") || "{}") || {}; } catch (e) { return {}; } }
    function plafondDe(agId) { var p = plafonds()[agId]; return p ? Number(p) : CONFIG.PLAFOND_CAISSE; }

    /* N° de versement VER-AAAA-NNNN (attribué par le serveur en production) */
    function numeroVersement(date) {
        var an = String(date || U.today()).substr(0, 4), max = 0;
        $.each(CX.api.listSync("versements"), function (_, v) { var m = /^VER-(\d{4})-(\d+)$/.exec(v.numero || ""); if (m && m[1] === an) max = Math.max(max, parseInt(m[2], 10)); });
        return "VER-" + an + "-" + ("0000" + (max + 1)).slice(-4);
    }

    /* Versements de démonstration (une seule fois, store simulé) : chaque agence
       verse ses espèces à la banque un lundi sur deux ; AKWA n'a rien versé depuis
       trois semaines (alerte de plafond). Ne pas reprendre en production. */
    function assurerVersementsDemo() {
        var deja = $.grep(CX.api.listSync("meta"), function (m) { return m.cle === "demoVersements"; }).length;
        if (deja || CX.api.listSync("versements").length) return false;
        var D = donnees(), t = U.today(), c = caisse(D, null), n = 0;
        $.each(c, function (id, a) {
            var acc = 0, jours = $.map(a.esp, function (v, j) { return j; }).sort(), d = jours[0], semaineNo = 0;
            if (!d) return;
            while (d < t) {
                acc += a.esp[d] || 0;
                if (dow(d) === 0) {
                    semaineNo++;
                    var stop = Number(id) === 1 && U.daysBetween(d, t) < 22;
                    if (semaineNo % 2 === 0 && acc >= 10000 && !stop) {
                        var m = Math.floor(acc * 0.92 / 5000) * 5000;
                        n++;
                        CX.api.save("versements", {
                            numero: numeroVersement(d), date: d, heure: "15:30", agenceId: Number(id), montant: m, destination: n % 3 ? "BANQUE" : "SIEGE",
                            banque: n % 3 ? "Afriland First Bank" : "", reference: (n % 3 ? "BV-" : "RS-") + d.replace(/-/g, "").substr(2) + "-" + id,
                            deposant: "Chef d'agence", observation: "Versement hebdomadaire (démo)", statut: "VALIDE", user: "Chef d'agence"
                        });
                        acc -= m;
                    }
                }
                d = U.addDays(d, 1);
            }
        });
        CX.api.save("meta", { cle: "demoVersements", version: 1, date: U.now(), numero: "META-VERS" });
        rechargerVersements();
        return n;
    }

    /* Liens entre états (en conservant les filtres communs de l'URL) */
    function lien(page, patch) {
        var u = url.lire(), keep = ["p", "du", "au", "cmp", "geo", "tc", "srv", "nat", "app", "st"], parts = [];
        $.each(keep, function (_, k) { if (u[k]) parts.push(k + "=" + encodeURIComponent(u[k])); });
        $.each(patch || {}, function (k, v) { if (v != null && v !== "") parts.push(k + "=" + encodeURIComponent(v)); });
        return page + (parts.length ? "?" + parts.join("&") : "");
    }

    return {
        CONFIG: CONFIG, COUL: COUL, PALETTE: PALETTE, SERVICES: SERVICES, TYPES_CLIENT: TYPES_CLIENT, JOURS: JOURS, JOURS_C: JOURS_C, DIMS: DIMS, RACCOURCIS: RACCOURCIS,
        titre: titre, villeNom: villeNom, agLib: agLib, moisLib: moisLib, kg: kg, pct: pct, fmtCourt: fmtCourt, fmtVal: fmtVal,
        dow: dow, semaine: semaine, addMois: addMois, periodeDe: periodeDe, periodeComparee: periodeComparee, libPeriode: libPeriode, granularite: granularite, cases: cases,
        donnees: donnees, rechargerVersements: rechargerVersements, nomApporteur: nomApporteur, nomLivreur: nomLivreur, estEspeces: estEspeces,
        Filtres: Filtres, filtrer: filtrer, url: url, lien: lien,
        mVide: mVide, mAjouter: mAjouter, mSomme: mSomme, agreger: agreger, trier: trier, croiser: croiser, serie: serie, mediane: mediane,
        ecartPct: ecartPct, ecartHtml: ecartHtml, kpi: kpi, tableau: tableau, tableauCsv: tableauCsv, csv: csv,
        feuilleHtml: feuilleHtml, pdf: pdf, imprimer: imprimer, graph: graph,
        caisse: caisse, soldeAu: soldeAu, numeroVersement: numeroVersement, plafonds: plafonds, plafondDe: plafondDe, assurerVersementsDemo: assurerVersementsDemo
    };
})();

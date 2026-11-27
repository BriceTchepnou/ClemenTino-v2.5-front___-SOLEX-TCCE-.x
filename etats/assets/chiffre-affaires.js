/* =====================================================================
   États · Chiffre d'affaires (chiffre-affaires.html)
   ---------------------------------------------------------------------
   CA à partir des EXPÉDITIONS (date d'expédition, toutes les ventes :
   comptant + en compte) ou des FACTURES ÉMISES (date d'émission, clients
   en compte ; montants ventilés par expédition facturée).
   Type d'état : par agence (sous-totaux par ville), par ville, par client
   (sous-totaux par type de client), par produit (service > nature), par
   apporteur (apporteur > clients), par mois.
   Onglets États (tableau détaillé) / Statistiques (graphiques).

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/chiffre-affaires?source=&du=&au=&groupe=&geo=&typeClient=&service=&nature=&apporteurs[]=&statut=
   Requête attendue (source = expéditions, groupe = agence) :
     SELECT a.ville, a.id, a.nom, COUNT(e.id) nb, SUM(e.nb_colis) colis, SUM(e.poids) poids,
            SUM(e.montant_ht) ht, SUM(e.montant_tva) tva, SUM(e.montant_ttc) ttc,
            SUM(CASE WHEN e.paiement_statut = 'PAYE' THEN e.montant_ttc ELSE 0 END) encaisse
       FROM expedition e JOIN agence a ON a.id = e.agence_dep_id
       LEFT JOIN client c ON c.id = e.client_id
      WHERE e.date_exp BETWEEN :du AND :au AND e.statut <> 'ANNULEE' [AND filtres]
      GROUP BY a.ville, a.id, a.nom ORDER BY ht DESC
   Source = factures : FROM facture_ligne fl JOIN facture f ... WHERE f.date_emission BETWEEN :du AND :au
   AND f.statut NOT IN ('BROUILLON','ANNULEE') (encaissé = paiements imputés au prorata).
   La même requête est rejouée sur la période de comparaison (paramètres du2 / au2).
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    var D = E.donnees();

    var TYPES = {
        agence: { lib: "Par agence", grp: "ville", dim: "agence", titre: "Agence" },
        ville: { lib: "Par ville", grp: null, dim: "ville", titre: "Ville de départ" },
        client: { lib: "Par client", grp: "typeClient", dim: "client", titre: "Client" },
        produit: { lib: "Par produit", grp: "service", dim: "nature", titre: "Produit (service · nature)" },
        apporteur: { lib: "Par apporteur", grp: "apporteur", dim: "client", titre: "Apporteur / client" },
        mois: { lib: "Par mois", grp: null, dim: "mois", titre: "Mois" }
    };
    var type = TYPES[E.url.get("type")] ? E.url.get("type") : "agence";
    var onglet = E.url.get("tab") === "stats" ? "stats" : "etats";
    var dernier = null;   // dernier calcul (exports)

    $("#ca-type").html($.map(TYPES, function (t, k) {
        return "<button type='button' class='ex-seg-btn' data-type='" + k + "'>" + t.lib + "</button>";
    }).join(""));

    var F = new E.Filtres("#ex-filtres", { source: true, defaut: { p: "mois", cmp: "PREC" }, onChange: rendre });

    /* ------------------------------------------------------------------ */
    function calculer(f) {
        var base = f.src === "FAC" ? D.lignesFac : D.exps;
        var T = TYPES[type];
        var rows = E.filtrer(base, f, f.per), rowsC = f.comp ? E.filtrer(base, f, f.comp) : null;
        var dims = T.grp ? [T.grp, T.dim] : [T.dim];
        var extra = { init: function (g) { g.fac = {}; }, extra: function (g, r) { if (r._factureId) g.fac[r._factureId] = 1; } };
        var r = {
            f: f, T: T, rows: rows, rowsC: rowsC,
            agg: E.agreger(rows, dims, extra),
            aggG: T.grp ? E.agreger(rows, T.grp) : null,
            aggC: rowsC ? E.agreger(rowsC, dims) : null,
            aggGC: rowsC && T.grp ? E.agreger(rowsC, T.grp) : null
        };
        /* comparaison des mois : alignement par rang (mois M ↔ mois M-1 / M-12) */
        r.compDe = function (g, niveau) {
            var src = niveau === "grp" ? r.aggGC : r.aggC;
            if (!src) return null;
            if (E.DIMS[T.dim].temps && !T.grp) {
                var i = $.inArray(g, r.agg.groupes), cg = src.groupes;
                var cases = E.cases(f.per, "mois"), casesC = E.cases(f.comp, "mois");
                var k = -1; $.each(cases, function (j, c) { if (c.cle === g.cle) k = j; });
                var cle = k >= 0 && casesC[k] ? casesC[k].cle : null;
                return cle && src.index[cle] ? src.index[cle].m : (i < 0 ? null : E.mVide());
            }
            var x = src.index[g.cle];
            return x ? x.m : E.mVide();
        };
        return r;
    }

    function definition(r) {
        var f = r.f, T = r.T, tot = r.agg.total, comp = !!r.aggC;
        var lignes = [];
        function ligne(g, niv) {
            return { lib: niv === "st" ? "Sous-total " + g.libs[0] : g.libs[g.libs.length - 1], m: g.m, c: comp ? r.compDe(g, niv === "st" ? "grp" : null) : null, _niv: niv, nbFac: g.fac ? U.fmt(Object.keys(g.fac).length) : "" };
        }
        if (T.grp) {
            var parGrp = {};
            $.each(r.agg.groupes, function (_, g) { (parGrp[g.cles[0]] = parGrp[g.cles[0]] || []).push(g); });
            $.each(r.aggG.groupes, function (_, gg) {
                lignes.push({ _niv: "grp", lib: gg.libs[0] });
                $.each(parGrp[gg.cles[0]] || [], function (_, g) { lignes.push(ligne(g)); });
                lignes.push(ligne(gg, "st"));
            });
        } else {
            $.each(r.agg.groupes, function (_, g) { lignes.push(ligne(g)); });
        }
        var cols = [
            { t: T.titre, v: function (l) { return l.lib; }, f: "txt" },
            { t: f.src === "FAC" ? "Exp. facturées" : "Expéditions", v: function (l) { return l.m.nb; }, f: "int", num: true },
            { t: "Colis", v: function (l) { return l.m.colis; }, f: "int", num: true },
            { t: "Poids (kg)", v: function (l) { return l.m.poids; }, f: "kg", num: true },
            { t: "CA HT", v: function (l) { return l.m.ht; }, f: "money", num: true },
            { t: "TVA", v: function (l) { return l.m.tva; }, f: "money", num: true },
            { t: "CA TTC", v: function (l) { return l.m.ttc; }, f: "money", num: true },
            { t: "Encaissé", v: function (l) { return l.m.enc; }, f: "money", num: true },
            {
                t: "Part", v: function (l) { return tot.ht ? l.m.ht / tot.ht * 100 : 0; }, f: "pct", num: true,
                h: function (l) { var p = tot.ht ? l.m.ht / tot.ht * 100 : 0; return E.pct(p) + "<span class='ex-part' aria-hidden='true'><i style='width:" + Math.min(100, p).toFixed(1) + "%'></i></span>"; }
            }
        ];
        if (comp) {
            cols.push({ t: "CA HT comparé", v: function (l) { return l.c ? l.c.ht : 0; }, f: "money", num: true });
            cols.push({ t: "Écart", v: function (l) { return l.c ? E.ecartPct(l.m.ht, l.c.ht) : null; }, f: "pct", num: true, h: function (l) { return E.ecartHtml(l.m.ht, l.c ? l.c.ht : 0); } });
        }
        return {
            cols: cols, lignes: lignes, id: "ca-etat",
            total: { lib: "Total", m: tot, c: comp ? r.aggC.total : null },
            vide: "Aucun chiffre d'affaires sur la période"
        };
    }

    /* ------------------------------------------------------------------ */
    function kpis(r) {
        var m = r.agg.total, c = r.aggC ? r.aggC.total : null, vs = r.f.cmp === "N1" ? "vs N-1" : "vs période préc.";
        var compte = 0; $.each(r.rows, function (_, x) { if (x._typeClient === "COMPTE") compte += x._ht; });
        var nbFac = {}; $.each(r.rows, function (_, x) { if (x._factureId) nbFac[x._factureId] = 1; });
        var h = [
            E.kpi({ label: "Chiffre d'affaires HT", valeur: U.fmt(m.ht) + " <small>FCFA</small>", icon: "fa-line-chart", cur: m.ht, prev: c ? c.ht : null, vs: vs }),
            E.kpi({ label: "CA TTC", valeur: U.fmt(m.ttc) + " <small>FCFA</small>", icon: "fa-money", couleur: "green", foot: "TVA " + U.fmt(m.tva), cur: m.ttc, prev: c ? c.ttc : null, vs: vs }),
            E.kpi({ label: "Encaissé", valeur: U.fmt(m.enc) + " <small>FCFA</small>", icon: "fa-check-circle", couleur: "green", foot: E.pct(m.ttc ? m.enc / m.ttc * 100 : 0) + " du TTC", cur: m.enc, prev: c ? c.enc : null, vs: vs }),
            E.kpi({ label: r.f.src === "FAC" ? "Factures émises" : "Expéditions", valeur: U.fmt(r.f.src === "FAC" ? Object.keys(nbFac).length : m.nb), icon: r.f.src === "FAC" ? "fa-file-text-o" : "fa-cube", couleur: "purple", foot: U.fmt(m.colis) + " colis · " + E.kg(m.poids), cur: m.nb, prev: c ? c.nb : null, vs: vs }),
            E.kpi({ label: "Panier moyen HT", valeur: U.fmt(m.nb ? m.ht / m.nb : 0) + " <small>FCFA</small>", icon: "fa-shopping-basket", couleur: "orange", foot: "par expédition", cur: m.nb ? m.ht / m.nb : 0, prev: c && c.nb ? c.ht / c.nb : null, vs: vs }),
            E.kpi({ label: "Part en compte", valeur: E.pct(m.ht ? compte / m.ht * 100 : 0), icon: "fa-building-o", foot: U.fmt(compte) + " F HT clients en compte" })
        ];
        $("#ca-kpis").html(h.join(""));
    }

    function stats(r) {
        var f = r.f, vs = f.cmp === "N1" ? "N-1" : "Période précédente";
        /* Évolution */
        var gran = E.granularite(f.per), s1 = E.serie(r.rows, f.per, gran, "ht");
        var series = [{ nom: "Période", couleur: E.COUL.marine, vals: s1.vals, aire: true }];
        if (r.rowsC) series.push({ nom: vs, couleur: E.COUL.gris, vals: E.serie(r.rowsC, f.comp, gran, "ht").vals, pointille: true, comparaison: true });
        $("#st-evol-sub").text("Par " + gran + " · " + E.libPeriode(f.per));
        $("#st-evol").html(G.courbes($.map(s1.cases, function (c) { return c.lib; }), series, { titre: "Évolution du CA HT" }));

        /* Comptant / en compte */
        var tc = E.agreger(r.rows, "typeClient");
        $("#st-type").html(G.anneau($.map(tc.groupes, function (g) {
            return { lib: g.libs[0], v: g.m.ht, couleur: g.cles[0] === "COMPTE" ? E.COUL.marine : E.COUL.vert };
        }), { centre: "CA HT", titre: "Comptant ou en compte" }));

        /* Top 10 de la dimension de l'état */
        var dim = r.T.dim === "mois" ? "client" : r.T.dim, top = E.agreger(r.rows, dim), topC = r.rowsC ? E.agreger(r.rowsC, dim) : null;
        $("#st-top-titre").text("Top 10 · " + E.DIMS[dim].titre.toLowerCase().replace(/^./, function (x) { return x.toUpperCase(); }));
        $("#st-top-sub").text("CA HT" + (topC ? " · repère gris : " + vs.toLowerCase() : ""));
        $("#st-top").html(G.barresH($.map($.grep(top.groupes, function (g) { return g.m.ht > 0; }).slice(0, E.CONFIG.TOP), function (g) {
            return { lib: g.libs[0], v: g.m.ht, v2: topC ? (topC.index[g.cle] ? topC.index[g.cle].m.ht : 0) : null, sous: U.fmt(g.m.nb) + " expédition(s)" };
        }), { titre: "Top 10", serie2: vs, legende2: !!topC }));

        /* Services */
        var sv = E.agreger(r.rows, "service");
        $("#st-service").html(G.anneau($.map(sv.groupes, function (g, i) { return { lib: g.libs[0], v: g.m.ht, couleur: E.PALETTE[i] }; }), { centre: "CA HT" }));

        /* Comparaison par groupe de l'état */
        var dimC = r.T.grp || r.T.dim, a = E.agreger(r.rows, dimC), b = r.rowsC ? E.agreger(r.rowsC, dimC) : null;
        $("#st-comp-titre").text(b ? "Comparaison " + E.DIMS[dimC].titre.toLowerCase() + " · " + vs.toLowerCase() : "CA HT par " + E.DIMS[dimC].titre.toLowerCase());
        $("#st-comp-sub").text(b ? E.libPeriode(f.per) + " comparé " + E.libPeriode(f.comp) : E.libPeriode(f.per));
        var data;
        if (E.DIMS[dimC].temps && b) {
            var cs = E.cases(f.per, "mois"), csC = E.cases(f.comp, "mois");
            data = $.map(cs, function (c, i) {
                var g = a.index[c.cle], gc = csC[i] && b.index[csC[i].cle];
                return { lib: c.lib, v: g ? g.m.ht : 0, v2: gc ? gc.m.ht : 0 };
            });
        } else {
            data = $.map(a.groupes.slice(0, 14), function (g) { return { lib: g.libs[0], v: g.m.ht, v2: b ? (b.index[g.cle] ? b.index[g.cle].m.ht : 0) : null }; });
        }
        $("#st-comp").html(G.barres(data, { serie: "Période", serie2: vs, titre: "Comparaison", w: 1100, h: 260 }));
    }

    function rendre(f) {
        f = f || F.get();
        var t0 = new Date().getTime();
        var r = calculer(f);
        dernier = r;
        $("#ca-type .ex-seg-btn").each(function () { $(this).toggleClass("active", $(this).data("type") === type).attr("aria-pressed", $(this).data("type") === type); });
        $("#ca-sous-titre").text((f.src === "FAC" ? "à partir des factures émises" : "à partir des expéditions") + " · " + TYPES[type].lib.toLowerCase());
        kpis(r);
        r.def = definition(r);
        $("#ca-table").html(E.tableau(r.def));
        if (onglet === "stats") stats(r);
        r.statsFaites = onglet === "stats";
        $("#ca-info").text(U.fmt(r.rows.length) + " ligne(s) analysée(s) en " + (new Date().getTime() - t0) + " ms");
    }

    /* ------------------------------------------------------------------ */
    $("#ca-type").on("click", ".ex-seg-btn", function () {
        type = $(this).data("type");
        E.url.ecrire({ type: type === "agence" ? "" : type });
        rendre();
    });
    function activerOnglet(t) {
        onglet = t;
        $("#ca-onglets a").each(function () { $(this).toggleClass("active", $(this).data("tab") === t).attr("aria-selected", $(this).data("tab") === t); });
        $("#ca-panel-etats").toggleClass("active", t === "etats");
        $("#ca-panel-stats").toggleClass("active", t === "stats");
        E.url.ecrire({ tab: t === "stats" ? "stats" : "" });
        if (t === "stats" && dernier && !dernier.statsFaites) { stats(dernier); dernier.statsFaites = true; }
    }
    $("#ca-onglets").on("click", "a", function () { activerOnglet($(this).data("tab")); });

    function titreEtat() { return "Chiffre d'affaires " + TYPES[type].lib.toLowerCase() + (dernier.f.src === "FAC" ? " (factures émises)" : " (expéditions)"); }
    function blocs() {
        var b = ["<div class='ex-avoid'>" + $("#ca-kpis").clone().wrap("<div>").parent().html() + "</div>", "<h2>État détaillé</h2>" + E.tableau(dernier.def)];
        if (onglet === "stats") {
            if (!dernier.statsFaites) stats(dernier);
            b.push("<h2>Statistiques</h2><div class='ex-grid'><div>" + $("#st-evol").html() + "</div><div>" + $("#st-type").html() + "</div></div>" +
                "<div class='ex-grid'><div>" + $("#st-top").html() + "</div><div>" + $("#st-service").html() + "</div></div>" + $("#st-comp").html());
        }
        return b;
    }
    $("#btn-csv").on("click", function () {
        var t = E.tableauCsv(dernier.def);
        E.csv("etat-ca-" + type + "-" + dernier.f.per.du + "-" + dernier.f.per.au, t, { titre: titreEtat(), filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () {
        E.pdf({ titre: titreEtat(), sousTitre: E.libPeriode(dernier.f.per).replace(/^./, function (x) { return x.toUpperCase(); }), filtres: F.resume(), blocs: blocs(),
            orientation: "landscape", nom: "Etat CA " + TYPES[type].lib + " " + dernier.f.per.du + " au " + dernier.f.per.au, bouton: this });
    });
    $("#btn-imprimer").on("click", function () {
        E.imprimer({ titre: titreEtat(), sousTitre: E.libPeriode(dernier.f.per), filtres: F.resume(), blocs: blocs(), orientation: "landscape" });
    });

    activerOnglet(onglet);
    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };   // aide au test / débogage
});

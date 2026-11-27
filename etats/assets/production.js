/* =====================================================================
   États · Production (production.html)
   ---------------------------------------------------------------------
   Saisies par agence de départ et par guichetier : nombre, CA, panier
   moyen, colis, saisies par jour ouvré ; heures de pointe (carte de
   chaleur jour de la semaine × heure de saisie) ; évolution quotidienne.

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/production?du=&au=&geo=&typeClient=&service=&nature=&groupe=agence|guichetier
     SELECT a.id, a.ville, a.nom, e.guichetier_id, u.nom, COUNT(*) nb, SUM(e.nb_colis), SUM(e.poids),
            SUM(e.montant_ht), SUM(e.montant_ttc), SUM(CASE WHEN e.paiement_statut='PAYE' THEN e.montant_ttc END)
       FROM expedition e JOIN agence a ON a.id = e.agence_dep_id LEFT JOIN utilisateur u ON u.id = e.guichetier_id
      WHERE e.date_exp BETWEEN :du AND :au AND e.statut <> 'ANNULEE' GROUP BY a.id, e.guichetier_id
   TODO API : GET /etats/production/heures?du=&au=&geo=  (carte de chaleur)
     SELECT WEEKDAY(e.date_exp) j, HOUR(e.heure_saisie) h, COUNT(*), SUM(e.montant_ht) ... GROUP BY j, h
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    var D = E.donnees();
    var mesureHm = E.url.get("hm") === "ht" ? "ht" : "nb";
    var dernier = null;

    var F = new E.Filtres("#ex-filtres", { defaut: { p: "mois", cmp: "PREC" }, onChange: rendre });

    function joursOuvres(per) {
        var n = 0, d = per.du, t = U.today();
        while (d <= per.au && d <= t) { if (E.dow(d) < 6) n++; d = U.addDays(d, 1); }
        return Math.max(1, n);
    }

    function calculer(f) {
        var rows = E.filtrer(D.exps, f, f.per), rowsC = f.comp ? E.filtrer(D.exps, f, f.comp) : null;
        var ext = { init: function (g) { g.ags = {}; }, extra: function (g, r) { g.ags[r._agLib] = 1; } };
        return {
            f: f, rows: rows, rowsC: rowsC, jo: joursOuvres(f.per),
            ag: E.agreger(rows, "agence"), agC: rowsC ? E.agreger(rowsC, "agence") : null,
            gu: E.agreger(rows, "guichetier", ext), guC: rowsC ? E.agreger(rowsC, "guichetier") : null
        };
    }

    function colsCommunes(r, titre, compIdx) {
        var tot = r.rows.length;
        var cols = [
            { t: titre, v: function (l) { return l.lib; }, f: "txt", h: function (l) { return "<span class='cx-cell-main'>" + U.esc(l.lib) + "</span>" + (l.sous ? "<div class='cx-cell-sub'>" + U.esc(l.sous) + "</div>" : ""); } },
            { t: "Saisies", v: function (l) { return l.m.nb; }, f: "int", num: true },
            { t: "Part", v: function (l) { return tot ? l.m.nb / tot * 100 : 0; }, f: "pct", num: true },
            { t: "Saisies / jour ouvré", v: function (l) { return l.m.nb / r.jo; }, f: "kg", num: true },
            { t: "Colis", v: function (l) { return l.m.colis; }, f: "int", num: true },
            { t: "CA HT", v: function (l) { return l.m.ht; }, f: "money", num: true },
            { t: "CA TTC", v: function (l) { return l.m.ttc; }, f: "money", num: true },
            { t: "Encaissé", v: function (l) { return l.m.enc; }, f: "money", num: true },
            { t: "Panier moyen HT", v: function (l) { return l.m.nb ? l.m.ht / l.m.nb : 0; }, f: "money", num: true }
        ];
        if (compIdx) {
            cols.push({ t: "Saisies comparées", v: function (l) { return l.c ? l.c.nb : 0; }, f: "int", num: true });
            cols.push({ t: "Écart saisies", v: function (l) { return l.c ? E.ecartPct(l.m.nb, l.c.nb) : null; }, f: "pct", num: true, h: function (l) { return E.ecartHtml(l.m.nb, l.c ? l.c.nb : 0); } });
        }
        return cols;
    }
    function defAgences(r) {
        return {
            cols: colsCommunes(r, "Agence", r.agC), vide: "Aucune saisie sur la période",
            lignes: $.map(r.ag.groupes, function (g) { return { lib: g.libs[0], m: g.m, c: r.agC ? (r.agC.index[g.cle] || { m: E.mVide() }).m : null }; }),
            total: { lib: "Total", m: r.ag.total, c: r.agC ? r.agC.total : null }
        };
    }
    function defGuichetiers(r) {
        return {
            cols: colsCommunes(r, "Guichetier", r.guC), vide: "Aucune saisie sur la période",
            lignes: $.map(r.gu.groupes, function (g) { return { lib: g.libs[0], sous: Object.keys(g.ags).join(", "), m: g.m, c: r.guC ? (r.guC.index[g.cle] || { m: E.mVide() }).m : null }; }),
            total: { lib: "Total", m: r.gu.total, c: r.guC ? r.guC.total : null }
        };
    }

    function chaleur(r) {
        var heures = [], mat = [], hMin = 7, hMax = 19, pointe = null;
        for (var h = hMin; h <= hMax; h++) heures.push(h + " h");
        for (var j = 0; j < 7; j++) { mat.push([]); for (h = hMin; h <= hMax; h++) mat[j].push(0); }
        var sansHeure = 0;
        $.each(r.rows, function (_, e) {
            if (e._heure == null) { sansHeure++; return; }
            var hh = Math.min(hMax, Math.max(hMin, e._heure));
            mat[e._dow][hh - hMin] += mesureHm === "ht" ? e._ht : 1;
        });
        $.each(mat, function (j, l) { $.each(l, function (i, v) { if (!pointe || v > pointe.v) pointe = { v: v, j: j, h: hMin + i }; }); });
        r.pointe = pointe && pointe.v ? pointe : null;
        $("#pr-hm").html(G.chaleur(E.JOURS_C, heures, mat, {
            titre: "Saisies par jour et par heure", unite: mesureHm === "ht" ? "FCFA HT" : "saisie(s)",
            fmt: function (v) { return U.fmt(v); }, cw: 34, ch: 28, lw: 44
        }));
        $("#pr-hm-sub").text((mesureHm === "ht" ? "CA HT" : "Nombre de saisies") + " · heure d'enregistrement au guichet" + (sansHeure ? " · " + sansHeure + " saisie(s) sans heure (clients en compte du jeu de démo) non représentée(s)" : ""));
    }

    function rendre(f) {
        f = f || F.get();
        var r = calculer(f);
        dernier = r;
        r.defA = defAgences(r); r.defG = defGuichetiers(r);
        $("#pr-agences").html(E.tableau(r.defA));
        $("#pr-guichetiers").html(E.tableau(r.defG));
        chaleur(r);
        var m = r.ag.total, c = r.agC ? r.agC.total : null, vs = f.cmp === "N1" ? "vs N-1" : "vs période préc.";
        $("#pr-kpis").html([
            E.kpi({ label: "Saisies", valeur: U.fmt(m.nb), icon: "fa-pencil-square-o", foot: U.fmt(m.nb / r.jo, 1) + " / jour ouvré", cur: m.nb, prev: c ? c.nb : null, vs: vs }),
            E.kpi({ label: "CA HT", valeur: U.fmt(m.ht) + " <small>FCFA</small>", icon: "fa-line-chart", couleur: "green", cur: m.ht, prev: c ? c.ht : null, vs: vs }),
            E.kpi({ label: "Panier moyen HT", valeur: U.fmt(m.nb ? m.ht / m.nb : 0) + " <small>FCFA</small>", icon: "fa-shopping-basket", couleur: "orange", cur: m.nb ? m.ht / m.nb : 0, prev: c && c.nb ? c.ht / c.nb : null, vs: vs }),
            E.kpi({ label: "Colis", valeur: U.fmt(m.colis), icon: "fa-archive", couleur: "purple", foot: E.kg(m.poids) }),
            E.kpi({ label: "Guichetiers actifs", valeur: U.fmt($.grep(r.gu.groupes, function (g) { return g.cles[0] !== "—"; }).length), icon: "fa-users", foot: U.fmt(r.ag.groupes.length) + " agence(s)" }),
            E.kpi({ label: "Heure de pointe", valeur: r.pointe ? E.JOURS[r.pointe.j] + " " + r.pointe.h + " h" : "—", icon: "fa-clock-o", couleur: "red", foot: r.pointe ? U.fmt(r.pointe.v) + (mesureHm === "ht" ? " F HT" : " saisie(s)") + " sur la période" : "" })
        ].join(""));
        var gran = E.granularite(f.per), s = E.serie(r.rows, f.per, gran, "nb"), sC = r.rowsC ? E.serie(r.rowsC, f.comp, gran, "nb") : null;
        $("#pr-evol-sub").text("Saisies par " + gran + (sC ? " · comparées à la " + (f.cmp === "N1" ? "même période N-1" : "période précédente") : ""));
        $("#pr-evol").html(G.barres($.map(s.cases, function (cs, i) { return { lib: cs.lib, v: s.vals[i], v2: sC ? sC.vals[i] || 0 : null }; }),
            { fmt: function (v) { return U.fmt(v) + " saisie(s)"; }, serie: "Période", serie2: f.cmp === "N1" ? "N-1" : "Période précédente", titre: "Saisies par jour" }));
        $("#pr-ag-chart").html(G.barresH($.map(r.ag.groupes.slice(0, 12), function (g) { return { lib: g.libs[0], v: g.m.nb, sous: U.money(g.m.ht) + " HT" }; }),
            { fmt: function (v) { return U.fmt(v) + " saisie(s)"; }, court: function (v) { return U.fmt(v); }, titre: "Saisies par agence" }));
    }

    $("#pr-hm-mesure").on("click", ".ex-seg-btn", function () {
        mesureHm = $(this).data("m");
        $("#pr-hm-mesure .ex-seg-btn").each(function () { $(this).toggleClass("active", $(this).data("m") === mesureHm); });
        E.url.ecrire({ hm: mesureHm === "ht" ? "ht" : "" });
        chaleur(dernier);
    });
    $("#pr-hm-mesure .ex-seg-btn").each(function () { $(this).toggleClass("active", $(this).data("m") === mesureHm); });

    function feuille() {
        var f = dernier.f;
        return { titre: "État de production des agences", sousTitre: E.libPeriode(f.per).replace(/^./, function (x) { return x.toUpperCase(); }), filtres: F.resume(), orientation: "landscape",
            blocs: [$("#pr-kpis").clone().wrap("<div>").parent().html(), "<h2>Par agence</h2>" + E.tableau(dernier.defA), "<h2>Par guichetier</h2>" + E.tableau(dernier.defG),
                "<div class='ex-grid ex-avoid'><div><h2>Heures de pointe</h2>" + $("#pr-hm").html() + "</div><div><h2>Évolution</h2>" + $("#pr-evol").html() + "</div></div>"] };
    }
    $("#btn-csv").on("click", function () {
        var a = E.tableauCsv(dernier.defA), g = E.tableauCsv(dernier.defG);
        a.titre = "Par agence"; g.titre = "Par guichetier";
        E.csv("etat-production-" + dernier.f.per.du + "-" + dernier.f.per.au, [a, g], { titre: "État de production", filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () { var o = feuille(); o.nom = "Production " + dernier.f.per.du + " au " + dernier.f.per.au; o.bouton = this; E.pdf(o); });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };
});

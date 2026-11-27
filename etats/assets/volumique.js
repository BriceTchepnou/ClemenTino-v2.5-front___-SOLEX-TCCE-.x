/* =====================================================================
   États · Volumique (volumique.html)
   ---------------------------------------------------------------------
   Colis et poids taxables par trajet : matrice origine × destination
   (mesure au choix : colis, poids, expéditions, CA HT), répartition par
   nature et par service, distribution des poids, principaux trajets.

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/volumique/matrice?du=&au=&mesure=colis|poids|nb|ht&geo=&typeClient=&service=&nature=
     SELECT e.ville_dep, e.ville_dest, COUNT(*) nb, SUM(e.nb_colis) colis, SUM(e.poids) poids, SUM(e.montant_ht) ht
       FROM expedition e WHERE e.date_exp BETWEEN :du AND :au AND e.statut <> 'ANNULEE' GROUP BY e.ville_dep, e.ville_dest
   TODO API : GET /etats/volumique/natures (GROUP BY ec.nature sur expedition_colis)
   TODO API : GET /etats/volumique/poids (GROUP BY tranche : CASE WHEN e.poids <= 1 THEN '0-1' … END)
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    var D = E.donnees();
    var MESURES = { colis: { lib: "Colis", f: "int" }, poids: { lib: "Poids (kg)", f: "kg" }, nb: { lib: "Expéditions", f: "int" }, ht: { lib: "CA HT", f: "money" } };
    var mesure = MESURES[E.url.get("mesure")] ? E.url.get("mesure") : "colis";
    var TRANCHES = [{ max: 1, lib: "≤ 1 kg" }, { max: 2, lib: "1 à 2 kg" }, { max: 5, lib: "2 à 5 kg" }, { max: 10, lib: "5 à 10 kg" }, { max: 20, lib: "10 à 20 kg" }, { max: 30, lib: "20 à 30 kg" }, { max: Infinity, lib: "> 30 kg" }];
    var dernier = null;

    var F = new E.Filtres("#ex-filtres", { defaut: { p: "mois", cmp: "" }, onChange: rendre });

    function matrice(r) {
        var X = E.croiser(r.rows, "ville", "villeDest", mesure), fm = MESURES[mesure].f, max = 0;
        $.each(X.lignes, function (_, l) { $.each(X.colonnes, function (_, c) { max = Math.max(max, X.val[l.cle][c.cle] || 0); }); });
        r.X = X;
        if (!X.lignes.length) return G.vide("Aucune expédition sur la période");
        var h = ["<div class='cx-table-wrap'><table class='cx-table ex-table ex-matrice' id='vo-matrice-table'><thead><tr><th class='ex-th-l' scope='col'>Départ \\ Arrivée</th>"];
        $.each(X.colonnes, function (_, c) { h.push("<th class='num' scope='col'>" + U.esc(c.lib) + "</th>"); });
        h.push("<th class='num' scope='col'>Total</th></tr></thead><tbody>");
        $.each(X.lignes, function (_, l) {
            h.push("<tr><th scope='row' class='ex-th-l'>" + U.esc(l.lib) + "</th>");
            $.each(X.colonnes, function (_, c) {
                var v = X.val[l.cle][c.cle] || 0, t = max ? v / max : 0;
                var bg = v ? "background:rgba(29,79,163," + (0.06 + t * 0.6).toFixed(2) + ");color:" + (t > 0.55 ? "#fff" : "inherit") : "";
                h.push("<td class='ex-cell-hm' style='" + bg + "'" + (v ? " data-tip='" + U.esc("<b>" + U.esc(l.lib) + " → " + U.esc(c.lib) + "</b><br>" + MESURES[mesure].lib + " : " + E.fmtVal(v, fm) + "<br>" + E.pct(X.total ? v / X.total * 100 : 0) + " du total") + "'" : "") + ">" + (v ? E.fmtVal(v, fm) : "<span class='cx-muted'>·</span>") + "</td>");
            });
            h.push("<td class='num'><b>" + E.fmtVal(X.totL[l.cle], fm) + "</b></td></tr>");
        });
        h.push("</tbody><tfoot><tr><td>Total</td>");
        $.each(X.colonnes, function (_, c) { h.push("<td class='num'>" + E.fmtVal(X.totC[c.cle], fm) + "</td>"); });
        h.push("<td class='num'>" + E.fmtVal(X.total, fm) + "</td></tr></tfoot></table></div>");
        return h.join("");
    }
    function matriceCsv(r) {
        var X = r.X, fm = MESURES[mesure].f;
        function v(x) { return fm === "kg" ? Math.round(x * 10) / 10 : Math.round(x); }
        return {
            titre: "Matrice origine × destination - " + MESURES[mesure].lib,
            entetes: ["Départ \\ Arrivée"].concat($.map(X.colonnes, function (c) { return c.lib; })).concat(["Total"]),
            lignes: $.map(X.lignes, function (l) { return [[l.lib].concat($.map(X.colonnes, function (c) { return v(X.val[l.cle][c.cle] || 0); })).concat([v(X.totL[l.cle])])]; })
                .concat([["TOTAL"].concat($.map(X.colonnes, function (c) { return v(X.totC[c.cle]); })).concat([v(X.total)])])
        };
    }

    function defDim(r, dim, titre) {
        var a = E.agreger(r.rows, dim, { tri: "colis" }), tot = a.total;
        return {
            cols: [
                { t: titre, v: function (l) { return l.lib; }, f: "txt" },
                { t: "Expéditions", v: function (l) { return l.m.nb; }, f: "int", num: true },
                { t: "Colis", v: function (l) { return l.m.colis; }, f: "int", num: true },
                { t: "Part colis", v: function (l) { return tot.colis ? l.m.colis / tot.colis * 100 : 0; }, f: "pct", num: true },
                { t: "Poids (kg)", v: function (l) { return l.m.poids; }, f: "kg", num: true },
                { t: "Poids moyen / colis", v: function (l) { return l.m.colis ? l.m.poids / l.m.colis : 0; }, f: "kg", num: true },
                { t: "CA HT", v: function (l) { return l.m.ht; }, f: "money", num: true },
                { t: "CA HT / kg", v: function (l) { return l.m.poids ? l.m.ht / l.m.poids : 0; }, f: "money", num: true }
            ],
            lignes: $.map(a.groupes, function (g) { return { lib: g.libs[0], m: g.m }; }),
            total: { lib: "Total", m: tot }, agg: a
        };
    }

    function rendre(f) {
        f = f || F.get();
        var r = { f: f, rows: E.filtrer(D.exps, f, f.per) };
        dernier = r;
        $("#vo-mesure .ex-seg-btn").each(function () { $(this).toggleClass("active", $(this).data("m") === mesure).attr("aria-pressed", $(this).data("m") === mesure); });
        $("#vo-matrice").html(matrice(r));
        r.defN = defDim(r, "nature", "Nature");
        r.defS = defDim(r, "service", "Service");
        r.defT = defDim(r, "trajet", "Trajet");
        $("#vo-natures").html(E.tableau(r.defN));
        $("#vo-services").html(E.tableau(r.defS));
        $("#vo-natures-chart").html(G.anneau($.map(r.defN.agg.groupes, function (g, i) { return { lib: g.libs[0], v: g.m.colis, couleur: E.PALETTE[i % E.PALETTE.length] }; }),
            { fmt: function (v) { return U.fmt(v) + " colis"; }, centre: "colis" }));
        /* Distribution des poids (poids taxable de l'expédition) */
        var dist = $.map(TRANCHES, function (t) { return { lib: t.lib, v: 0, n: 0 }; });
        $.each(r.rows, function (_, e) {
            for (var i = 0; i < TRANCHES.length; i++) if (e._poids <= TRANCHES[i].max) { dist[i].v++; dist[i].n += e._colis; break; }
        });
        r.dist = dist;
        $("#vo-poids").html(G.barres($.map(dist, function (d) { return { lib: d.lib, v: d.v, tip: U.fmt(d.n) + " colis", couleur: E.COUL.vert }; }),
            { fmt: function (v) { return U.fmt(v) + " expédition(s)"; }, serie: "Expéditions", h: 220, titre: "Distribution des poids" }));
        $("#vo-trajets").html(G.barresH($.map(r.defT.agg.groupes.slice(0, E.CONFIG.TOP), function (g) { return { lib: g.libs[0], v: g.m.colis, sous: E.kg(g.m.poids) + " · " + U.money(g.m.ht) + " HT" }; }),
            { fmt: function (v) { return U.fmt(v) + " colis"; }, court: function (v) { return U.fmt(v); }, couleur: E.COUL.orange, titre: "Principaux trajets", lw: 200 }));
        var t = r.defN.agg.total, urb = 0;
        $.each(r.rows, function (_, e) { if (e._service === "URBAINE") urb += e._colis; });
        $("#vo-kpis").html([
            E.kpi({ label: "Colis", valeur: U.fmt(t.colis), icon: "fa-archive", foot: U.fmt(t.nb) + " expédition(s)" }),
            E.kpi({ label: "Poids taxable", valeur: U.fmt(t.poids, 1) + " <small>kg</small>", icon: "fa-balance-scale", couleur: "purple", foot: (t.poids / 1000).toFixed(2).replace(".", ",") + " tonne(s)" }),
            E.kpi({ label: "Poids moyen / colis", valeur: U.fmt(t.colis ? t.poids / t.colis : 0, 1) + " <small>kg</small>", icon: "fa-cube", couleur: "orange" }),
            E.kpi({ label: "Trajets desservis", valeur: U.fmt(r.defT.agg.groupes.length), icon: "fa-exchange", couleur: "green", foot: U.fmt(r.X ? r.X.lignes.length : 0) + " ville(s) de départ" }),
            E.kpi({ label: "Part urbaine", valeur: E.pct(t.colis ? urb / t.colis * 100 : 0), icon: "fa-bicycle", foot: U.fmt(urb) + " colis livrés en ville" })
        ].join(""));
        $("#vo-mat-sub").text(MESURES[mesure].lib + " · " + E.libPeriode(f.per) + " · lignes : ville de départ, colonnes : ville d'arrivée");
    }

    $("#vo-mesure").on("click", ".ex-seg-btn", function () {
        mesure = $(this).data("m");
        E.url.ecrire({ mesure: mesure === "colis" ? "" : mesure });
        rendre();
    });

    function feuille() {
        var f = dernier.f;
        return { titre: "État volumique", sousTitre: E.libPeriode(f.per).replace(/^./, function (x) { return x.toUpperCase(); }), filtres: F.resume(), orientation: "landscape",
            blocs: [$("#vo-kpis").clone().wrap("<div>").parent().html(), "<h2>Matrice origine × destination · " + MESURES[mesure].lib + "</h2>" + $("#vo-matrice").html(),
                "<div class='ex-grid'><div><h2>Par nature</h2>" + E.tableau(dernier.defN) + "</div><div><h2>Par service</h2>" + E.tableau(dernier.defS) + "</div></div>",
                "<div class='ex-grid ex-avoid'><div><h2>Distribution des poids</h2>" + $("#vo-poids").html() + "</div><div><h2>Principaux trajets (colis)</h2>" + $("#vo-trajets").html() + "</div></div>"] };
    }
    $("#btn-csv").on("click", function () {
        var n = E.tableauCsv(dernier.defN), s = E.tableauCsv(dernier.defS), t = E.tableauCsv(dernier.defT);
        n.titre = "Par nature"; s.titre = "Par service"; t.titre = "Par trajet";
        var d = { titre: "Distribution des poids", entetes: ["Tranche de poids", "Expéditions", "Colis"], lignes: $.map(dernier.dist, function (x) { return [[x.lib, x.v, x.n]]; }) };
        E.csv("etat-volumique-" + dernier.f.per.du + "-" + dernier.f.per.au, dernier.X && dernier.X.lignes.length ? [matriceCsv(dernier), t, n, s, d] : [t, n, s, d], { titre: "État volumique", filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () { var o = feuille(); o.nom = "Volumique " + dernier.f.per.du + " au " + dernier.f.per.au; o.bouton = this; E.pdf(o); });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };
});

/* =====================================================================
   États · Statistiques (statistiques.html) - tableau de bord synthétique
   ---------------------------------------------------------------------
   KPI de la période avec tendance (période précédente ou N-1), CA mensuel
   sur 12 mois glissants (finissant au mois de fin de période) comparé à
   N-1, répartition par service et par type de client, top clients /
   agences / trajets, tableau de croissance mensuelle.
   Les montants sont ceux des expéditions (même base que le journal et
   l'état de CA « à partir des expéditions »).

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/statistiques/kpi?du=&au=&du2=&au2=&geo=&typeClient=&service=&nature=&apporteurs[]=
   TODO API : GET /etats/statistiques/mensuel?fin=AAAA-MM&mois=12&geo=…
     SELECT DATE_FORMAT(e.date_exp,'%Y-%m') mois, COUNT(*), SUM(e.montant_ht) FROM expedition e
      WHERE e.date_exp BETWEEN :debut_n1 AND :fin AND e.statut <> 'ANNULEE' GROUP BY mois
   TODO API : GET /etats/statistiques/top?dim=client|agence|trajet&n=10&du=&au=
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    var D = E.donnees();
    var dernier = null;

    var F = new E.Filtres("#ex-filtres", { defaut: { p: "mois", cmp: "PREC" }, onChange: rendre });

    function rendre(f) {
        f = f || F.get();
        var rows = E.filtrer(D.exps, f, f.per), rowsC = f.comp ? E.filtrer(D.exps, f, f.comp) : null;
        var m = E.agreger(rows, "typeClient").total, c = rowsC ? E.agreger(rowsC, "typeClient").total : null;
        var vs = f.cmp === "N1" ? "vs N-1" : "vs période préc.";
        var r = { f: f, rows: rows, rowsC: rowsC, m: m, c: c };
        dernier = r;
        function nbClients(rs) { var o = {}; $.each(rs, function (_, e) { if (e._typeClient === "COMPTE") o[e._clientKey] = 1; }); return Object.keys(o).length; }
        function livres(rs) { var n = 0; $.each(rs, function (_, e) { if (e.statut === "LIVREE") n++; }); return rs.length ? n / rs.length * 100 : 0; }
        $("#st-kpis").html([
            E.kpi({ label: "Chiffre d'affaires HT", valeur: U.fmt(m.ht) + " <small>FCFA</small>", icon: "fa-line-chart", cur: m.ht, prev: c ? c.ht : null, vs: vs }),
            E.kpi({ label: "Expéditions", valeur: U.fmt(m.nb), icon: "fa-cube", couleur: "purple", cur: m.nb, prev: c ? c.nb : null, vs: vs }),
            E.kpi({ label: "Colis", valeur: U.fmt(m.colis), icon: "fa-archive", couleur: "orange", foot: E.kg(m.poids), cur: m.colis, prev: c ? c.colis : null, vs: vs }),
            E.kpi({ label: "Panier moyen HT", valeur: U.fmt(m.nb ? m.ht / m.nb : 0) + " <small>FCFA</small>", icon: "fa-shopping-basket", couleur: "orange", cur: m.nb ? m.ht / m.nb : 0, prev: c && c.nb ? c.ht / c.nb : null, vs: vs }),
            E.kpi({ label: "Encaissé (comptant)", valeur: U.fmt(m.enc) + " <small>FCFA</small>", icon: "fa-money", couleur: "green", cur: m.enc, prev: c ? c.enc : null, vs: vs }),
            E.kpi({ label: "Clients en compte actifs", valeur: U.fmt(nbClients(rows)), icon: "fa-building-o", foot: "taux livré : " + E.pct(livres(rows)), cur: nbClients(rows), prev: rowsC ? nbClients(rowsC) : null, vs: vs })
        ].join(""));

        /* 12 mois glissants + N-1 */
        var fin = f.per.au, p12 = { du: E.addMois(U.firstOfMonth(fin), -11), au: fin }, p12n1 = { du: E.addMois(p12.du, -12), au: E.addMois(fin, -12) };
        var r12 = E.filtrer(D.exps, f, p12), r12n1 = E.filtrer(D.exps, f, p12n1);
        var s = E.serie(r12, p12, "mois", "ht"), sn1 = E.serie(r12n1, p12n1, "mois", "ht"), sNb = E.serie(r12, p12, "mois", "nb");
        r.s12 = { s: s, sn1: sn1, sNb: sNb };
        $("#st-12m-sub").text("CA HT par mois de " + E.moisLib(p12.du.substr(0, 7), true) + " à " + E.moisLib(fin.substr(0, 7), true) + " · barre grise : même mois N-1");
        $("#st-12m").html(G.barres($.map(s.cases, function (cs, i) { return { lib: cs.lib, v: s.vals[i], v2: sn1.vals[i] || 0, tip: U.fmt(sNb.vals[i]) + " expédition(s)" }; }),
            { serie: "CA HT", serie2: "N-1", titre: "CA mensuel sur 12 mois", h: 280, w: 1160 }));

        /* Répartitions */
        var sv = E.agreger(rows, "service"), tc = E.agreger(rows, "typeClient");
        $("#st-services").html(G.anneau($.map(sv.groupes, function (g, i) { return { lib: g.libs[0], v: g.m.ht, couleur: E.PALETTE[i] }; }), { centre: "CA HT" }));
        $("#st-types").html(G.anneau($.map(tc.groupes, function (g) { return { lib: g.libs[0], v: g.m.ht, couleur: g.cles[0] === "COMPTE" ? E.COUL.marine : E.COUL.vert }; }), { centre: "CA HT" }));

        /* Top 10 */
        function top(dim, rs, rsC, couleur, sel, filtre) {
            var a = E.agreger(filtre ? $.grep(rs, filtre) : rs, dim), b = rsC ? E.agreger(filtre ? $.grep(rsC, filtre) : rsC, dim) : null;
            $(sel).html(G.barresH($.map($.grep(a.groupes, function (g) { return g.m.ht > 0; }).slice(0, E.CONFIG.TOP), function (g) {
                return { lib: g.libs[0], v: g.m.ht, v2: b ? (b.index[g.cle] ? b.index[g.cle].m.ht : 0) : null, sous: U.fmt(g.m.nb) + " expédition(s) · " + U.fmt(g.m.colis) + " colis" };
            }), { couleur: couleur, serie2: f.cmp === "N1" ? "N-1" : "Période précédente", legende2: !!b, lw: 150, w: 420 }));
            return a;
        }
        r.topC = top("client", rows, rowsC, E.COUL.marine, "#st-top-clients", function (e) { return e._typeClient === "COMPTE"; });
        r.topA = top("agence", rows, rowsC, E.COUL.vert, "#st-top-agences");
        r.topT = top("trajet", rows, rowsC, E.COUL.orange, "#st-top-trajets");

        /* Croissance mensuelle */
        var cumul = 0, an = null, lignes = $.map(s.cases, function (cs, i) {
            if (cs.cle.substr(0, 4) !== an) { an = cs.cle.substr(0, 4); cumul = 0; }
            cumul += s.vals[i];
            return { lib: E.moisLib(cs.cle, true), nb: sNb.vals[i], ht: s.vals[i], prec: i ? s.vals[i - 1] : null, n1: sn1.vals[i] || 0, cumul: cumul };
        });
        var t = { lib: "Total 12 mois", nb: 0, ht: 0, n1: 0, prec: null, cumul: null };
        $.each(lignes, function (_, l) { t.nb += l.nb; t.ht += l.ht; t.n1 += l.n1; });
        r.defCr = {
            cols: [
                { t: "Mois", v: function (l) { return l.lib; }, f: "txt" },
                { t: "Expéditions", v: function (l) { return l.nb; }, f: "int", num: true },
                { t: "CA HT", v: function (l) { return l.ht; }, f: "money", num: true },
                { t: "Évolution / mois préc.", v: function (l) { return l.prec == null ? null : E.ecartPct(l.ht, l.prec); }, f: "pct", num: true, h: function (l) { return l.prec == null ? "—" : E.ecartHtml(l.ht, l.prec); } },
                { t: "CA HT N-1", v: function (l) { return l.n1; }, f: "money", num: true },
                { t: "Évolution / N-1", v: function (l) { return E.ecartPct(l.ht, l.n1); }, f: "pct", num: true, h: function (l) { return E.ecartHtml(l.ht, l.n1); } },
                { t: "Cumul de l'année", v: function (l) { return l.cumul; }, f: "money", num: true }
            ],
            lignes: lignes, total: t
        };
        $("#st-croissance").html(E.tableau(r.defCr));
    }

    function feuille() {
        var f = dernier.f;
        return { titre: "Statistiques - tableau de bord", sousTitre: E.libPeriode(f.per).replace(/^./, function (x) { return x.toUpperCase(); }), filtres: F.resume(), orientation: "landscape",
            blocs: [$("#st-kpis").clone().wrap("<div>").parent().html(), "<div class='ex-avoid'><h2>CA mensuel sur 12 mois</h2>" + $("#st-12m").html() + "</div>",
                "<div class='ex-grid ex-avoid'><div><h2>Par service</h2>" + $("#st-services").html() + "</div><div><h2>Comptant / en compte</h2>" + $("#st-types").html() + "</div></div>",
                "<div class='ex-grid ex-grid-3 ex-avoid'><div><h2>Top clients en compte</h2>" + $("#st-top-clients").html() + "</div><div><h2>Top agences</h2>" + $("#st-top-agences").html() + "</div><div><h2>Top trajets</h2>" + $("#st-top-trajets").html() + "</div></div>",
                "<h2>Croissance mensuelle</h2>" + E.tableau(dernier.defCr)] };
    }
    $("#btn-csv").on("click", function () {
        function topCsv(a, titre, lib) {
            return { titre: titre, entetes: [lib, "Expéditions", "Colis", "CA HT"], lignes: $.map(a.groupes.slice(0, E.CONFIG.TOP), function (g) { return [[g.libs[0], g.m.nb, g.m.colis, Math.round(g.m.ht)]]; }) };
        }
        var cr = E.tableauCsv(dernier.defCr); cr.titre = "Croissance mensuelle (12 mois)";
        E.csv("statistiques-" + dernier.f.per.du + "-" + dernier.f.per.au, [cr, topCsv(dernier.topC, "Top clients en compte", "Client"), topCsv(dernier.topA, "Top agences", "Agence"), topCsv(dernier.topT, "Top trajets", "Trajet")],
            { titre: "Statistiques", filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () { var o = feuille(); o.nom = "Statistiques " + dernier.f.per.du + " au " + dernier.f.per.au; o.bouton = this; E.pdf(o); });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };
});

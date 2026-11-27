/* =====================================================================
   États · Livraisons & performance (livraisons.html)
   ---------------------------------------------------------------------
   Expéditions de la période (date d'expédition) : délai moyen et médian
   de livraison (jours calendaires entre l'expédition et la remise), taux
   livré dans le délai cible (urbain 1 j, national 3 j, autres 5 j :
   CX.etats.CONFIG.DELAIS_CIBLE), en cours / en retard (non livrées au-delà
   du délai cible), échecs de livraison (étape ECHEC dans suivi[]) ; par
   trajet, par agence de destination, par service et par livreur.

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/livraisons?du=&au=&geo=&typeClient=&service=&nature=&groupe=trajet|agenceDest|livreur|service
     SELECT e.ville_dep, e.ville_dest, COUNT(*) nb,
            SUM(e.statut = 'LIVREE') livrees,
            AVG(DATEDIFF(e.date_livraison, e.date_exp)) delai_moyen,
            SUM(e.statut = 'LIVREE' AND DATEDIFF(e.date_livraison, e.date_exp) <= s.delai_cible) dans_delai,
            SUM(e.statut <> 'LIVREE' AND DATEDIFF(CURDATE(), e.date_exp) > s.delai_cible) en_retard,
            SUM(EXISTS(SELECT 1 FROM expedition_suivi es WHERE es.expedition_id = e.id AND es.etape = 'ECHEC')) echecs
       FROM expedition e JOIN service s ON s.code = e.service
      WHERE e.date_exp BETWEEN :du AND :au AND e.statut <> 'ANNULEE' GROUP BY e.ville_dep, e.ville_dest
   (médiane : PERCENTILE_CONT(0.5) ou calcul applicatif sur la liste des délais)
   TODO API : GET /etats/livraisons/retards?du=&au=  (liste détaillée)
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    var D = E.donnees();
    var dernier = null, today = U.today();
    var ETAPES = { ENREGISTREE: "Enregistrée", GROUPEE: "Groupée", EN_TRANSIT: "En transit", ARRIVEE: "Arrivée", EN_INSTANCE: "En instance", EN_LIVRAISON: "En livraison", LIVREE: "Livrée", ECHEC: "Échec" };

    var F = new E.Filtres("#ex-filtres", { defaut: { p: "mois", cmp: "" }, apporteur: false, onChange: rendre });

    function cible(e) { return E.CONFIG.DELAIS_CIBLE[e._service] || 5; }
    var PERF = {
        init: function (g) { g.p = { delais: [], liv: 0, ok: 0, cours: 0, retard: 0, echec: 0 }; },
        extra: function (g, e) {
            var p = g.p;
            if (e.statut === "LIVREE" && e._delai != null) { p.liv++; p.delais.push(e._delai); if (e._delai <= cible(e)) p.ok++; }
            else { p.cours++; if (U.daysBetween(e.dateExp, today) > cible(e)) p.retard++; }
            if (e._echec) p.echec++;
        }
    };
    function perfTotale(rows) { var g = {}; PERF.init(g); $.each(rows, function (_, e) { PERF.extra(g, e); }); return g.p; }
    function moy(a) { var s = 0; $.each(a, function (_, v) { s += v; }); return a.length ? s / a.length : null; }
    function tauxOk(p) { return p.liv ? p.ok / p.liv * 100 : null; }

    function def(rows, dim, titre, filtreGroupe) {
        var a = E.agreger(rows, dim, $.extend({ tri: "nb" }, PERF));
        var groupes = filtreGroupe ? $.grep(a.groupes, filtreGroupe) : a.groupes;
        var tot = perfTotale(filtreGroupe ? $.grep(rows, function (e) { return filtreGroupe({ cles: [E.DIMS[dim].cle(e)] }); }) : rows);
        function ligne(lib, m, p, cle) { return { lib: lib, m: m, p: p, cle: cle }; }
        var totM = E.mVide(); $.each(groupes, function (_, g) { totM = E.mSomme(totM, g.m); });
        return {
            cols: [
                { t: titre, v: function (l) { return l.lib; }, f: "txt" },
                { t: "Expéditions", v: function (l) { return l.m.nb; }, f: "int", num: true },
                { t: "Livrées", v: function (l) { return l.p.liv; }, f: "int", num: true },
                { t: "Délai moyen", v: function (l) { return moy(l.p.delais); }, f: "jours", num: true },
                { t: "Délai médian", v: function (l) { return E.mediane(l.p.delais); }, f: "jours", num: true },
                {
                    t: "Dans le délai", v: function (l) { return tauxOk(l.p); }, f: "pct", num: true,
                    h: function (l) { var t = tauxOk(l.p); if (t == null) return "—"; return "<span class='" + (t >= 90 ? "ex-solde-ok" : t < 75 ? "ex-solde-ko" : "") + "'>" + E.pct(t) + "</span>"; }
                },
                { t: "En cours", v: function (l) { return l.p.cours; }, f: "int", num: true },
                { t: "En retard", v: function (l) { return l.p.retard; }, f: "int", num: true, h: function (l) { return l.p.retard ? "<b style='color:var(--cx-red)'>" + U.fmt(l.p.retard) + "</b>" : "0"; } },
                { t: "Échecs", v: function (l) { return l.p.echec; }, f: "int", num: true }
            ],
            lignes: $.map(groupes, function (g) { return ligne(g.libs[0], g.m, g.p, g.cles[0]); }),
            total: ligne("Total", totM, tot), vide: "Aucune expédition sur la période"
        };
    }

    function rendre(f) {
        f = f || F.get();
        var rows = E.filtrer(D.exps, f, f.per, { inclureAnnulees: false });
        rows = $.grep(rows, function (e) { return e._actif; });
        var rowsC = f.comp ? $.grep(E.filtrer(D.exps, f, f.comp), function (e) { return e._actif; }) : null;
        var r = { f: f, rows: rows };
        dernier = r;
        var p = perfTotale(rows), pc = rowsC ? perfTotale(rowsC) : null, vs = f.cmp === "N1" ? "vs N-1" : "vs période préc.";
        r.p = p;
        $("#lv-kpis").html([
            E.kpi({ label: "Taux de livraison", valeur: E.pct(rows.length ? p.liv / rows.length * 100 : 0), icon: "fa-check-circle", couleur: "green", foot: U.fmt(p.liv) + " livrée(s) sur " + U.fmt(rows.length) }),
            E.kpi({ label: "Délai moyen", valeur: p.delais.length ? U.fmt(moy(p.delais), 1) + " <small>jour(s)</small>" : "—", icon: "fa-clock-o", foot: "médian : " + (p.delais.length ? U.fmt(E.mediane(p.delais), 1) + " j" : "—"), cur: moy(p.delais), prev: pc ? moy(pc.delais) : null, inverse: true, vs: vs }),
            E.kpi({ label: "Livrées dans le délai", valeur: tauxOk(p) == null ? "—" : E.pct(tauxOk(p)), icon: "fa-bullseye", couleur: tauxOk(p) != null && tauxOk(p) < 80 ? "red" : "green", foot: "cibles : urbain 1 j, national 3 j, autres 5 j", cur: tauxOk(p), prev: pc ? tauxOk(pc) : null, vs: vs }),
            E.kpi({ label: "En cours", valeur: U.fmt(p.cours), icon: "fa-truck", couleur: "purple", foot: "non encore livrées" }),
            E.kpi({ label: "En retard", valeur: U.fmt(p.retard), icon: "fa-exclamation-triangle", couleur: p.retard ? "red" : "green", foot: "au-delà du délai cible", cur: p.retard, prev: pc ? pc.retard : null, inverse: true, vs: vs }),
            E.kpi({ label: "Échecs de livraison", valeur: U.fmt(p.echec), icon: "fa-times-circle", couleur: "orange", foot: "tentatives échouées (suivi)" })
        ].join(""));

        r.defT = def(rows, "trajet", "Trajet");
        r.defA = def(rows, "agenceDest", "Agence de destination");
        r.defS = def(rows, "service", "Service");
        var avecLivreurs = D.livreurs.length > 0;
        r.defL = avecLivreurs ? def(rows, "livreur", "Livreur", function (g) { return !!g.cles[0]; }) : null;
        $("#lv-trajets").html(E.tableau(r.defT));
        $("#lv-agences").html(E.tableau(r.defA));
        $("#lv-services").html(E.tableau(r.defS));
        $("#lv-livreurs-card").toggle(avecLivreurs);
        if (avecLivreurs) $("#lv-livreurs").html(E.tableau(r.defL));

        /* Distribution des délais */
        var dist = []; for (var i = 0; i <= 8; i++) dist.push({ lib: i === 8 ? "8 j et +" : i + " j", v: 0 });
        $.each(p.delais, function (_, d) { dist[Math.min(8, Math.max(0, d))].v++; });
        $("#lv-dist").html(G.barres(dist, { fmt: function (v) { return U.fmt(v) + " livraison(s)"; }, serie: "Livraisons", couleur: E.COUL.marine, h: 220, titre: "Distribution des délais" }));
        /* Taux dans le délai par service */
        $("#lv-taux").html(G.barresH($.map(r.defS.lignes, function (l) {
            var t = tauxOk(l.p) || 0;
            return { lib: l.lib + " (cible " + (E.CONFIG.DELAIS_CIBLE[l.cle] || 5) + " j)", v: t, couleur: t >= 90 ? E.COUL.vert : t >= 75 ? E.COUL.orange : E.COUL.rouge, sous: U.fmt(l.p.ok) + " / " + U.fmt(l.p.liv) + " livrées à temps" };
        }), { fmt: function (v) { return E.pct(v); }, court: function (v) { return E.pct(v, 0); }, titre: "Taux dans le délai par service", lw: 190 }));

        /* Retards */
        var retards = $.grep(rows, function (e) { return e.statut !== "LIVREE" && U.daysBetween(e.dateExp, today) > cible(e); })
            .sort(function (a, b) { return a.dateExp < b.dateExp ? -1 : 1; });
        r.retards = retards;
        r.defR = {
            cols: [
                { t: "N° LT", v: function (e) { return e.nRt || e.numero; }, f: "txt" },
                { t: "Expédiée le", v: function (e) { return U.toFr(e.dateExp); }, f: "txt" },
                { t: "Trajet", v: function (e) { return E.villeNom(e.villeDep) + " → " + E.villeNom(e.villeDest); }, f: "txt" },
                { t: "Client", v: function (e) { return e._typeClient === "COMPTE" ? e._client : e.expediteur; }, f: "txt" },
                { t: "Étape", v: function (e) { return ETAPES[e.etape] || e.etape || "—"; }, f: "txt" },
                { t: "Âge", v: function (e) { return U.daysBetween(e.dateExp, today); }, f: "jours", num: true },
                { t: "Cible", v: function (e) { return cible(e); }, f: "jours", num: true },
                { t: "Retard", v: function (e) { return U.daysBetween(e.dateExp, today) - cible(e); }, f: "jours", num: true, h: function (e) { return "<b style='color:var(--cx-red)'>+" + U.fmt(U.daysBetween(e.dateExp, today) - cible(e)) + " j</b>"; } },
                { t: "Échec", v: function (e) { return e._echec ? "Oui" : ""; }, f: "txt" }
            ],
            lignes: retards.slice(0, 50), total: null, vide: "Aucune expédition en retard"
        };
        $("#lv-retards").html(E.tableau(r.defR));
        $("#lv-retards-sub").text(retards.length ? U.fmt(retards.length) + " expédition(s) non livrée(s) au-delà du délai cible" + (retards.length > 50 ? " · 50 plus anciennes affichées" : "") : "Aucun retard sur la période");
    }

    function feuille() {
        var f = dernier.f, b = [$("#lv-kpis").clone().wrap("<div>").parent().html(), "<h2>Par trajet</h2>" + E.tableau(dernier.defT),
            "<h2>Par agence de destination</h2>" + E.tableau(dernier.defA), "<h2>Par service</h2>" + E.tableau(dernier.defS)];
        if (dernier.defL) b.push("<h2>Par livreur</h2>" + E.tableau(dernier.defL));
        b.push("<div class='ex-grid ex-avoid'><div><h2>Distribution des délais</h2>" + $("#lv-dist").html() + "</div><div><h2>Dans le délai par service</h2>" + $("#lv-taux").html() + "</div></div>");
        b.push("<h2>Expéditions en retard</h2>" + E.tableau(dernier.defR));
        return { titre: "Performance des livraisons", sousTitre: "Expéditions " + E.libPeriode(f.per), filtres: F.resume(), orientation: "landscape", blocs: b };
    }
    $("#btn-csv").on("click", function () {
        var t = [["Par trajet", dernier.defT], ["Par agence de destination", dernier.defA], ["Par service", dernier.defS]];
        if (dernier.defL) t.push(["Par livreur", dernier.defL]);
        t.push(["Expéditions en retard", $.extend({}, dernier.defR, { lignes: dernier.retards })]);
        E.csv("etat-livraisons-" + dernier.f.per.du + "-" + dernier.f.per.au, $.map(t, function (x) { var c = E.tableauCsv(x[1]); c.titre = x[0]; return c; }), { titre: "Performance des livraisons", filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () { var o = feuille(); o.nom = "Livraisons " + dernier.f.per.du + " au " + dernier.f.per.au; o.bouton = this; E.pdf(o); });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };
});

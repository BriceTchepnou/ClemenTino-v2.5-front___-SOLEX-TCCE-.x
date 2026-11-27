/* =====================================================================
   États · Excédent de trésorerie des agences (tresorerie.html)
   ---------------------------------------------------------------------
   Encaissements comptant du guichet (particuliers, paiement PAYE, hors
   annulations) par mode de paiement, par agence et par jour ; versements
   à la banque / au siège (collection « versements ») ; solde de caisse
   (excédent) = espèces encaissées - espèces versées, cumulés depuis
   l'ouverture ; alertes au-delà du plafond de caisse de l'agence.
   Le mobile money (Orange Money, MTN MoMo) est encaissé sur le compte
   marchand de la société : il est suivi mais n'entre pas dans la caisse.

   Collection « versements » (créée par ce module) :
     { id, numero, date, heure, agenceId, montant, destination BANQUE | SIEGE | COFFRE,
       banque, reference (n° de bordereau), deposant, observation, statut VALIDE | ANNULE,
       user, dateCreation, creePar, annulation { date, user, motif } }

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/tresorerie?du=&au=&geo=
     encaissements : SELECT e.agence_dep_id, e.date_exp, e.paiement_mode, SUM(e.montant_ttc)
                       FROM expedition e WHERE e.paiement_statut = 'PAYE' AND e.statut <> 'ANNULEE'
                        AND e.date_exp <= :au GROUP BY e.agence_dep_id, e.date_exp, e.paiement_mode
     versements    : SELECT v.agence_id, v.date, SUM(v.montant) FROM versement v
                      WHERE v.statut = 'VALIDE' AND v.date <= :au GROUP BY v.agence_id, v.date
     (solde de début = cumul jusqu'à :du - 1 ; à terme : table caisse_journal clôturée chaque soir)
   TODO API : GET|POST /etats/tresorerie/versements · POST /etats/tresorerie/versements/{id}/annuler
   TODO API : PUT /parametres/agences/{id}/plafond-caisse
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats, G = E.graph;
    E.assurerVersementsDemo();
    var D = E.donnees();
    var MODES = ["Espèces", "Orange Money", "MTN MoMo"];
    var DEST = { BANQUE: "Banque", SIEGE: "Siège (caisse centrale)", COFFRE: "Coffre de l'agence" };
    var agSel = E.url.get("ag", "");
    var dernier = null;

    var F = new E.Filtres("#ex-filtres", { comparaison: false, typeClient: false, produit: false, apporteur: false, statut: false, defaut: { p: "mois" }, onChange: rendre });

    function agencesVisibles(f) {
        return $.grep(CX.REF.AGENCES, function (a) {
            if (!f.geo) return true;
            return f.geo.charAt(0) === "V" ? a.ville === f.geo.substr(2) : String(a.id) === f.geo.substr(2);
        });
    }
    function somme(obj, per) { var s = 0; $.each(obj || {}, function (j, v) { if (j >= per.du && j <= per.au) s += v; }); return s; }

    function calculer(f) {
        var C = E.caisse(D, null), veille = U.addDays(f.per.du, -1);
        var lignes = [], tot = { lib: "Total", debut: 0, modes: {}, total: 0, vers: 0, fin: 0, plafond: 0, alerte: 0 };
        $.each(MODES, function (_, m) { tot.modes[m] = 0; });
        $.each(agencesVisibles(f), function (_, ag) {
            var a = C[ag.id] || { agId: ag.id, lib: E.agLib(ag.id), esp: {}, mm: {}, modes: {}, vers: {} };
            var l = { _id: ag.id, agId: ag.id, lib: a.lib, a: a, modes: {}, debut: E.soldeAu(a, veille), vers: somme(a.vers, f.per), fin: E.soldeAu(a, f.per.au), plafond: E.plafondDe(ag.id) };
            l.total = 0;
            $.each(MODES, function (_, m) { l.modes[m] = somme(a.modes[m], f.per); l.total += l.modes[m]; tot.modes[m] += l.modes[m]; });
            $.each(a.modes, function (m, jours) { if ($.inArray(m, MODES) < 0) { var s = somme(jours, f.per); l.total += s; } });
            l.alerte = l.fin > l.plafond;
            if (l.alerte) l._cls = "ex-tr-alerte";
            if (!l.total && !l.vers && !l.debut && !l.fin) return;
            tot.debut += l.debut; tot.total += l.total; tot.vers += l.vers; tot.fin += l.fin; tot.plafond += l.plafond; if (l.alerte) tot.alerte++;
            lignes.push(l);
        });
        lignes.sort(function (x, y) { return y.fin - x.fin; });
        return { f: f, C: C, lignes: lignes, tot: tot };
    }

    function defAgences(r) {
        var cols = [{ t: "Agence", v: function (l) { return l.lib; }, f: "txt", h: function (l) { return "<span class='cx-cell-main'>" + U.esc(l.lib) + "</span>"; } },
            { t: "Solde au début", v: function (l) { return l.debut; }, f: "money", num: true }];
        $.each(MODES, function (_, m) { cols.push({ t: m, v: function (l) { return l.modes ? l.modes[m] : 0; }, f: "money", num: true }); });
        cols.push(
            { t: "Total encaissé", v: function (l) { return l.total; }, f: "money", num: true },
            { t: "Versements", v: function (l) { return l.vers; }, f: "money", num: true },
            { t: "Excédent (solde caisse)", v: function (l) { return l.fin; }, f: "money", num: true, h: function (l) { return "<span class='" + (l.alerte ? "ex-solde-ko" : "ex-solde-ok") + "'>" + U.fmt(l.fin) + "</span>"; } },
            {
                t: "Plafond", v: function (l) { return l.plafond; }, f: "money", num: true,
                h: function (l) { return l.agId ? "<input type='text' class='form-control ex-plafond-in' data-ag='" + l.agId + "' value='" + U.fmt(l.plafond) + "' aria-label='Plafond de caisse " + U.esc(l.lib) + "'>" : U.fmt(l.plafond); },
                tot: function (t) { return U.fmt(t.plafond); }
            },
            {
                t: "État", v: function (l) { return l.agId ? (l.alerte ? "Au-delà du plafond" : "Conforme") : (l.alerte ? l.alerte + " alerte(s)" : ""); }, f: "txt",
                h: function (l) { return l.agId ? (l.alerte ? "<span class='cx-badge cx-badge-red'>+" + U.fmt(l.fin - l.plafond) + " F</span>" : "<span class='cx-badge cx-badge-green'>Conforme</span>") : (l.alerte ? "<span class='cx-badge cx-badge-red'>" + l.alerte + " alerte(s)</span>" : ""); }
            },
            { t: "", csv: false, v: function () { return ""; }, h: function (l) { return l.agId ? "<button type='button' class='cx-btn cx-btn-soft cx-btn-xs' data-verser='" + l.agId + "'><i class='fa fa-bank'></i> Verser</button>" : ""; } }
        );
        return { cols: cols, lignes: r.lignes, total: r.tot, vide: "Aucun encaissement comptant sur la période", id: "tr-table-agences" };
    }

    /* Journal de caisse par jour (une agence ou tout le périmètre) */
    function journal(r) {
        var f = r.f, ags = agSel ? $.grep(r.lignes, function (l) { return String(l.agId) === String(agSel); }) : r.lignes;
        var jours = [], d = f.per.du, solde = 0;
        $.each(ags, function (_, l) { solde += l.debut; });
        var serieSolde = [], libs = [];
        while (d <= f.per.au) {
            var j = { jour: d, modes: {}, total: 0, vers: 0 };
            $.each(MODES, function (_, m) { j.modes[m] = 0; });
            $.each(ags, function (_, l) {
                $.each(l.a.modes, function (m, js) { var v = js[d] || 0; if (j.modes[m] != null) j.modes[m] += v; j.total += v; });
                j.vers += l.a.vers[d] || 0;
                solde += (l.a.esp[d] || 0) - (l.a.vers[d] || 0);
            });
            j.solde = solde;
            serieSolde.push(solde); libs.push(U.toFr(d).substr(0, 5));
            if (j.total || j.vers) jours.push(j);
            d = U.addDays(d, 1);
        }
        var cols = [{ t: "Jour", v: function (x) { return x._tot ? "Total" : E.JOURS_C[E.dow(x.jour)] + " " + U.toFr(x.jour); }, f: "txt" }];
        $.each(MODES, function (_, m) { cols.push({ t: m, v: function (x) { return x.modes[m]; }, f: "money", num: true }); });
        cols.push({ t: "Total encaissé", v: function (x) { return x.total; }, f: "money", num: true },
            { t: "Versé", v: function (x) { return x.vers; }, f: "money", num: true },
            { t: "Solde de caisse (fin de journée)", v: function (x) { return x.solde; }, f: "money", num: true });
        var t = { _tot: true, modes: {}, total: 0, vers: 0, solde: solde };
        $.each(MODES, function (_, m) { t.modes[m] = 0; });
        $.each(jours, function (_, x) { $.each(MODES, function (_, m) { t.modes[m] += x.modes[m]; }); t.total += x.total; t.vers += x.vers; });
        r.defJ = { cols: cols, lignes: jours, total: t, vide: "Aucun mouvement de caisse sur la période" };
        $("#tr-journal").html(E.tableau(r.defJ));
        var plafond = 0; $.each(ags, function (_, l) { plafond += l.plafond; });
        $("#tr-courbe").html(G.courbes(libs, [{ nom: "Solde de caisse (espèces)", couleur: E.COUL.marine, vals: serieSolde, aire: true }],
            { titre: "Solde de caisse", seuil: ags.length ? { v: plafond, lib: "Plafond " + U.fmt(plafond) + " F" } : null }));
        $("#tr-courbe-sub").text((agSel ? E.agLib(agSel) : "Toutes les agences du périmètre") + " · fin de journée");
    }

    function versementsPeriode(r) {
        var f = r.f, ids = {}; $.each(agencesVisibles(f), function (_, a) { ids[a.id] = 1; });
        var vs = $.grep(D.versements, function (v) { return ids[v.agenceId] && v.date >= f.per.du && v.date <= f.per.au; })
            .sort(function (a, b) { return (b.date + (b.heure || "")) < (a.date + (a.heure || "")) ? -1 : 1; });
        var tot = { montant: 0 }; $.each(vs, function (_, v) { if (v.statut !== "ANNULE") tot.montant += U.round(v.montant); });
        r.defV = {
            cols: [
                { t: "Date", v: function (v) { return v._tot ? "Total" : U.toFr(v.date) + (v.heure ? " " + v.heure : ""); }, f: "txt" },
                { t: "N°", v: function (v) { return v.numero || ""; }, f: "txt" },
                { t: "Agence", v: function (v) { return v._tot ? "" : E.agLib(v.agenceId); }, f: "txt" },
                { t: "Montant", v: function (v) { return v._tot ? v.montant : U.round(v.montant); }, f: "money", num: true, h: function (v) { return v.statut === "ANNULE" ? "<s>" + U.fmt(v.montant) + "</s>" : U.fmt(v.montant); } },
                { t: "Destination", v: function (v) { return v._tot ? "" : (DEST[v.destination] || v.destination) + (v.banque ? " · " + v.banque : ""); }, f: "txt" },
                { t: "Référence", v: function (v) { return v.reference || ""; }, f: "txt" },
                { t: "Déposant", v: function (v) { return v.deposant || ""; }, f: "txt" },
                { t: "Statut", v: function (v) { return v._tot ? "" : v.statut === "ANNULE" ? "Annulé" : "Validé"; }, f: "txt", h: function (v) { return v._tot ? "" : v.statut === "ANNULE" ? "<span class='cx-badge cx-badge-grey' title='" + U.esc(v.annulation ? v.annulation.motif : "") + "'>Annulé</span>" : "<span class='cx-badge cx-badge-green'>Validé</span>"; } },
                { t: "", csv: false, v: function () { return ""; }, h: function (v) { return !v._tot && v.statut !== "ANNULE" ? "<button type='button' class='cx-btn cx-btn-danger cx-btn-xs' data-annuler='" + v.id + "' title='Annuler ce versement'><i class='fa fa-ban'></i></button>" : ""; } }
            ],
            lignes: $.map(vs, function (v) { return $.extend({}, v, { _cls: v.statut === "ANNULE" ? "cx-row-muted" : "" }); }), total: $.extend({ _tot: true }, tot), vide: "Aucun versement sur la période"
        };
        $("#tr-versements").html(E.tableau(r.defV));
        $("#tr-vers-sub").text(U.fmt(vs.length) + " versement(s) · " + U.money(tot.montant));
    }

    function rendre(f) {
        f = f || F.get();
        var r = calculer(f);
        dernier = r;
        r.defA = defAgences(r);
        $("#tr-agences").html(E.tableau(r.defA));
        /* sélecteur d'agence du journal de caisse */
        var opts = "<option value=''>Toutes les agences du périmètre</option>" + $.map(r.lignes, function (l) { return "<option value='" + l.agId + "'>" + U.esc(l.lib) + "</option>"; }).join("");
        if (agSel && !$.grep(r.lignes, function (l) { return String(l.agId) === String(agSel); }).length) agSel = "";
        $("#tr-agence").html(opts).val(agSel);
        journal(r);
        versementsPeriode(r);
        var t = r.tot, mm = 0; $.each(MODES, function (_, m) { if (!E.estEspeces(m)) mm += t.modes[m]; });
        $("#tr-kpis").html([
            E.kpi({ label: "Encaissements comptant", valeur: U.fmt(t.total) + " <small>FCFA</small>", icon: "fa-money", foot: E.libPeriode(f.per) }),
            E.kpi({ label: "dont espèces", valeur: U.fmt(t.modes["Espèces"]) + " <small>FCFA</small>", icon: "fa-money", couleur: "green", foot: E.pct(t.total ? t.modes["Espèces"] / t.total * 100 : 0) + " des encaissements" }),
            E.kpi({ label: "dont mobile money", valeur: U.fmt(mm) + " <small>FCFA</small>", icon: "fa-mobile", couleur: "purple", foot: "Orange Money " + U.fmt(t.modes["Orange Money"]) + " · MoMo " + U.fmt(t.modes["MTN MoMo"]) }),
            E.kpi({ label: "Versements", valeur: U.fmt(t.vers) + " <small>FCFA</small>", icon: "fa-bank", couleur: "orange", foot: "banque et siège" }),
            E.kpi({ label: "Excédent de caisse", valeur: U.fmt(t.fin) + " <small>FCFA</small>", icon: "fa-archive", couleur: t.alerte ? "red" : "green", foot: "au " + U.toFr(f.per.au) + " (espèces non versées)" }),
            E.kpi({ label: "Agences au-delà du plafond", valeur: U.fmt(t.alerte), icon: "fa-exclamation-triangle", couleur: t.alerte ? "red" : "green", foot: "plafond par défaut " + U.fmt(E.CONFIG.PLAFOND_CAISSE) + " F" })
        ].join(""));
        var al = $.grep(r.lignes, function (l) { return l.alerte; });
        $("#tr-alertes").html($.map(al, function (l) {
            return "<div class='cx-note cx-note-err' style='margin:0'><i class='fa fa-exclamation-triangle'></i><div><b>" + U.esc(l.lib) + "</b> : excédent de caisse de <b>" + U.money(l.fin) +
                "</b> au " + U.toFr(f.per.au) + ", au-delà du plafond de " + U.money(l.plafond) + " (+" + U.money(l.fin - l.plafond) + "). Un versement est à effectuer. " +
                "<button type='button' class='cx-btn cx-btn-soft cx-btn-xs' data-verser='" + l.agId + "'><i class='fa fa-bank'></i> Enregistrer le versement</button></div></div>";
        }).join(""));
    }

    /* ---------------- Plafonds ---------------- */
    $("#tr-agences").on("change", ".ex-plafond-in", function () {
        var p = E.plafonds(), v = U.round(U.num($(this).val()));
        if (v > 0) p[$(this).data("ag")] = v; else delete p[$(this).data("ag")];
        try { localStorage.setItem("cx_etats_plafonds", JSON.stringify(p)); } catch (e) { /* ignoré */ }
        // TODO API : PUT /parametres/agences/{id}/plafond-caisse { plafond }
        U.toast("Plafond de caisse enregistré.");
        rendre();
    });
    $("#tr-agence").on("change", function () { agSel = $(this).val(); E.url.ecrire({ ag: agSel }); journal(dernier); });

    /* ---------------- Formulaire « Enregistrer un versement » ---------------- */
    function solde(agId, date) { var a = E.caisse(D, null)[agId]; return a ? E.soldeAu(a, date) : 0; }
    function majInfo() {
        var ag = $("#tv-agence").val(), date = $("#tv-date").val() || U.today(), m = U.round(U.num($("#tv-montant").val()));
        var s = ag ? solde(ag, date) : 0, apres = s - m;
        var err = m <= 0 ? "Saisissez un montant positif." : m > s ? "Le montant dépasse les espèces en caisse (" + U.money(s) + ")." : "";
        $("#tv-info").toggleClass("cx-note-err", !!err).toggleClass("cx-note-info", !err)
            .html("<i class='fa fa-info-circle'></i><div>Espèces en caisse au " + U.toFr(date) + " : <b>" + U.money(s) + "</b>" + (err ? "<br>" + err : "<br>Solde après versement : <b>" + U.money(apres) + "</b> (plafond " + U.money(E.plafondDe(ag)) + ")") + "</div>");
        return !err;
    }
    function ouvrirVersement(agId) {
        var $m = $("#tv-modal");
        $("#tv-agence").html($.map(CX.REF.AGENCES, function (a) { return "<option value='" + a.id + "'>" + U.esc(E.agLib(a.id)) + "</option>"; }).join(""));
        var ag = agId || agSel || (dernier.lignes[0] ? dernier.lignes[0].agId : CX.REF.AGENCES[0].id);
        $("#tv-agence").val(String(ag));
        $("#tv-date").val(U.today()).attr("max", U.today());
        var s = solde(ag, U.today());
        $("#tv-montant").val(s > 0 ? U.fmt(Math.floor(s / 5000) * 5000 || s) : "");
        $("#tv-destination").val("BANQUE"); $("#tv-banque").val("Afriland First Bank"); $("#tv-reference, #tv-observation").val(""); $("#tv-deposant").val(CX.CONFIG.USER.nom);
        $m.find(".cx-field.has-error").removeClass("has-error");
        majInfo();
        $m.modal("show");
    }
    $(document).on("click", "[data-verser]", function () { ouvrirVersement($(this).data("verser")); });
    $("#btn-verser").on("click", function () { ouvrirVersement(null); });
    $("#tv-modal").on("input change", "#tv-montant, #tv-agence, #tv-date", majInfo);
    $("#tv-destination").on("change", function () { $("#tv-banque").closest(".cx-field").toggle($(this).val() === "BANQUE"); });
    $("#tv-modal").on("shown.bs.modal", function () { $("#tv-montant").focus().select(); });
    $("#tv-ok").on("click", function () {
        var $b = $(this), ok = true;
        $("#tv-modal .cx-field.has-error").removeClass("has-error");
        if (!$("#tv-date").val() || $("#tv-date").val() > U.today()) { $("#tv-date").closest(".cx-field").addClass("has-error"); ok = false; }
        if (!$.trim($("#tv-reference").val())) { $("#tv-reference").closest(".cx-field").addClass("has-error"); ok = false; }
        if (!majInfo()) { $("#tv-montant").closest(".cx-field").addClass("has-error"); ok = false; }
        if (!ok) { U.toast("Vérifiez les champs signalés.", "warning"); return; }
        var v = {
            numero: E.numeroVersement($("#tv-date").val()), date: $("#tv-date").val(), heure: U.now().substr(11, 5), agenceId: parseInt($("#tv-agence").val(), 10), montant: U.round(U.num($("#tv-montant").val())),
            destination: $("#tv-destination").val(), banque: $("#tv-destination").val() === "BANQUE" ? $.trim($("#tv-banque").val()) : "",
            reference: $.trim($("#tv-reference").val()), deposant: $.trim($("#tv-deposant").val()), observation: $.trim($("#tv-observation").val()),
            statut: "VALIDE", user: CX.CONFIG.USER.nom
        };
        U.busy($b, true);
        // TODO API : POST /etats/tresorerie/versements { date, agenceId, montant, destination, banque, reference, deposant, observation }
        CX.api.save("versements", v).done(function (res) {
            E.rechargerVersements();
            $("#tv-modal").modal("hide");
            U.toast("Versement " + U.esc(res.numero) + " de " + U.money(res.montant) + " enregistré pour " + U.esc(E.agLib(res.agenceId)) + ".");
            rendre();
        }).fail(function (e) { U.toast(e || "Erreur d'enregistrement", "error"); }).always(function () { U.busy($b, false); });
    });
    $("#tr-versements").on("click", "[data-annuler]", function () {
        var id = $(this).data("annuler"), v = $.grep(D.versements, function (x) { return x.id == id; })[0];
        if (!v) return;
        U.confirm({ title: "Annuler le versement", message: "Annuler le versement <b>" + U.esc(v.numero || "") + "</b> de <b>" + U.money(v.montant) + "</b> (" + U.esc(E.agLib(v.agenceId)) + ") ? Le montant revient dans le solde de caisse de l'agence.", okText: "Annuler le versement", okClass: "cx-btn-danger", cancelText: "Retour" })
            .done(function () {
                // TODO API : POST /etats/tresorerie/versements/{id}/annuler { motif }
                CX.api.patchMany("versements", [id], { statut: "ANNULE", annulation: { date: U.now(), user: CX.CONFIG.USER.nom, motif: "Annulé depuis l'état de trésorerie" } }).done(function () {
                    E.rechargerVersements(); U.toast("Versement annulé.", "info"); rendre();
                });
            });
    });

    /* ---------------- Exports ---------------- */
    function feuille() {
        var f = dernier.f;
        return { titre: "Excédent de trésorerie des agences", sousTitre: E.libPeriode(f.per).replace(/^./, function (x) { return x.toUpperCase(); }), filtres: F.resume(), orientation: "landscape",
            blocs: [$("#tr-kpis").clone().wrap("<div>").parent().html(), "<h2>Situation de caisse par agence</h2>" + E.tableau($.extend({}, dernier.defA, { cols: $.map(dernier.defA.cols, function (c) { return c.csv === false ? null : $.extend({}, c, c.t === "Plafond" ? { h: null } : {}); }) })),
                "<h2>Journal de caisse · " + U.esc(agSel ? E.agLib(agSel) : "toutes agences") + "</h2>" + E.tableau(dernier.defJ),
                "<div class='ex-avoid'><h2>Solde de caisse</h2>" + $("#tr-courbe").html() + "</div>", "<h2>Versements de la période</h2>" + E.tableau($.extend({}, dernier.defV, { cols: $.grep(dernier.defV.cols, function (c) { return c.csv !== false; }) }))] };
    }
    $("#btn-csv").on("click", function () {
        var a = E.tableauCsv(dernier.defA), j = E.tableauCsv(dernier.defJ), v = E.tableauCsv(dernier.defV);
        a.titre = "Situation par agence"; j.titre = "Journal de caisse - " + (agSel ? E.agLib(agSel) : "toutes agences"); v.titre = "Versements";
        E.csv("etat-tresorerie-" + dernier.f.per.du + "-" + dernier.f.per.au, [a, j, v], { titre: "Excédent de trésorerie", filtres: F.resume() });
    });
    $("#btn-pdf").on("click", function () { var o = feuille(); o.nom = "Tresorerie agences " + dernier.f.per.du + " au " + dernier.f.per.au; o.bouton = this; E.pdf(o); });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { calcul: function () { return dernier; }, filtres: F };
});

/* =====================================================================
   Commercial · Commissions des apporteurs d'affaires (commissions.html)
   ---------------------------------------------------------------------
   Pour une période, calcule la commission de chaque apporteur à partir
   des factures de ses clients (CX.app.calculer) :
     - base FACTURE  : net HT des factures émises dans la période
     - base ENCAISSE : part HT des paiements reçus dans la période
   Statut : « À payer » tant qu'aucun paiement n'est enregistré ;
   « Marquer payée » fige le calcul dans la collection « commissions »
   (montant, détail par client, date, mode, référence).
   Exports : CSV (« ; », BOM) et état imprimable.
   Paramètre d'URL : ?apporteur=ID pré-sélectionne un apporteur.
   Dépend de facturation.js (CX.fac), apporteurs.js (CX.app), exports.js.
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, A = CX.app, today = U.today();

    var apporteurs = [], clients = [], factures = [], commissions = [];
    var lignes = [];          // une ligne par apporteur
    var ouverts = {};         // détails dépliés (id d'apporteur)

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function client(id) { return $.grep(clients, function (c) { return String(c.id) === String(id); })[0] || { raisonSociale: "Client #" + id }; }

    /* ---------- Période ---------- */
    function periode(code) {
        var d = today, m = parseInt(d.substr(5, 2), 10), y = d.substr(0, 4);
        if (code === "MOIS_PREC") { var p = U.addDays(U.firstOfMonth(d), -1); return { du: U.firstOfMonth(p), au: U.lastOfMonth(p) }; }
        if (code === "TRIMESTRE") { var m1 = Math.floor((m - 1) / 3) * 3 + 1; return { du: y + "-" + U.pad(m1) + "-01", au: U.lastOfMonth(y + "-" + U.pad(m1 + 2) + "-01") }; }
        if (code === "ANNEE") return { du: y + "-01-01", au: y + "-12-31" };
        return { du: U.firstOfMonth(d), au: U.lastOfMonth(d) };
    }
    function du() { return $("#f-du").val(); }
    function au() { return $("#f-au").val(); }
    function libPeriode() { return "du " + U.toFr(du()) + " au " + U.toFr(au()); }

    /* Commission enregistrée pour cet apporteur et cette période */
    function enregistrement(apporteurId) {
        return $.grep(commissions, function (k) { return String(k.apporteurId) === String(apporteurId) && k.du === du() && k.au === au(); })[0] || null;
    }

    /* ---------- Calcul des lignes ---------- */
    function calculer() {
        var fa = $("#f-apporteur").val(), st = $("#f-statut").val(), zero = $("#f-zero").is(":checked");
        lignes = [];
        $.each(apporteurs, function (_, a) {
            if (fa && String(a.id) !== String(fa)) return;
            var rec = enregistrement(a.id);
            if (a.statut !== "ACTIF" && !rec) return;              // apporteur suspendu : seulement si déjà enregistré
            var calc = A.calculer(a, clients, factures, du(), au());
            var paye = rec && rec.statut === "PAYEE";
            var l = {
                id: a.id, apporteur: a, calc: calc, rec: rec,
                statut: rec ? rec.statut : "A_PAYER",
                montantBase: paye ? rec.montantBase : calc.montantBase,
                taux: paye ? rec.taux : calc.taux,
                montant: paye ? rec.montant : calc.montant,
                details: paye ? rec.details : calc.details,
                ecart: paye && rec.montant !== calc.montant ? calc.montant : null,
                nbClients: calc.nbClients
            };
            if (!zero && !l.montant && !rec) return;
            if (st && l.statut !== st) return;
            lignes.push(l);
        });
        return lignes;
    }

    /* ---------- Indicateurs ---------- */
    function kpi(label, value, foot, icon, color) {
        return "<div class='cx-kpi " + (color || "") + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    function totaux(rows) {
        var t = { base: 0, montant: 0, aPayer: 0, paye: 0, nbAPayer: 0, nbPaye: 0, clients: 0 };
        $.each(rows, function (_, l) {
            t.base += l.montantBase; t.montant += l.montant; t.clients += $.grep(l.details, function (d) { return d.base > 0; }).length;
            if (l.statut === "PAYEE") { t.paye += l.montant; t.nbPaye++; } else { t.aPayer += l.montant; t.nbAPayer++; }
        });
        return t;
    }
    function majKpis(t, rows) {
        $("#kpis").html([
            kpi("Base de commission", U.fmt(t.base) + " <small>FCFA</small>", pluriel(t.clients, "client") + " générateur" + (t.clients > 1 ? "s" : "") + " de CA", "fa-line-chart", ""),
            kpi("Commissions de la période", U.fmt(t.montant) + " <small>FCFA</small>", pluriel(rows.length, "apporteur"), "fa-percent", "purple"),
            kpi("À payer", U.fmt(t.aPayer) + " <small>FCFA</small>", pluriel(t.nbAPayer, "apporteur"), "fa-hourglass-half", "orange"),
            kpi("Payées", U.fmt(t.paye) + " <small>FCFA</small>", pluriel(t.nbPaye, "apporteur"), "fa-check-circle", "green")
        ].join(""));
        $("#h-periode").text("· " + libPeriode());
    }

    /* ---------- Tableau ---------- */
    function btn(act, icon, titre, cls) {
        return "<button type='button' class='cx-btn " + (cls || "cx-btn-ghost") + " cx-btn-xs' data-act='" + act + "' data-toggle='tooltip' title='" + U.esc(titre) + "'><i class='fa " + icon + "'></i></button>";
    }
    var dt = new CX.DataTable("#dt", {
        columns: [
            { key: "code", title: "Apporteur", sortValue: function (l) { return l.apporteur.code; }, searchValue: function (l) { return l.apporteur.code + " " + A.nom(l.apporteur); },
                render: function (l) {
                    return "<div class='cx-who'><i class='fa " + (ouverts[l.id] ? "fa-chevron-down" : "fa-chevron-right") + " cm-toggle' data-act='detail'></i><div>" +
                        "<a class='cx-cell-main' href='apporteur-form.html?id=" + l.id + "'>" + U.esc(A.nom(l.apporteur)) + "</a>" +
                        "<div class='cx-cell-sub'><span class='cx-mono'>" + U.esc(l.apporteur.code) + "</span> · " + U.esc((REF.TYPES_APPORTEUR[l.apporteur.type] || {}).label || "") + "</div></div></div>";
                } },
            { key: "nbClients", title: "Clients", className: "num", render: function (l) { return U.fmt(l.nbClients); } },
            { key: "base", title: "Base", sortValue: function (l) { return l.apporteur.baseCommission; }, render: function (l) { return U.esc(A.baseLib(l.apporteur)); } },
            { key: "montantBase", title: "Montant de base", className: "num", render: function (l) { return "<span class='cx-nowrap'>" + U.money(l.montantBase) + "</span>"; } },
            { key: "taux", title: "Taux", className: "num", render: function (l) { return U.fmt(l.taux, l.taux % 1 ? 1 : 0) + " %"; } },
            { key: "montant", title: "Commission", className: "num", render: function (l) {
                return "<b class='cx-nowrap'>" + U.money(l.montant) + "</b>" + (l.ecart != null ? "<div class='cm-ecart' title='Montant recalculé aujourd&#39;hui'>recalcul : " + U.money(l.ecart) + "</div>" : "");
            } },
            { key: "statut", title: "Statut", render: function (l) {
                return REF.badge(REF.STATUT_COMMISSION, l.statut) + (l.rec && l.rec.statut === "PAYEE" ? "<div class='cx-cell-sub'>le " + U.toFr(l.rec.datePaiement) + " · " + U.esc(l.rec.modePaiement || "") + "</div>" : "");
            }, searchValue: function (l) { return (REF.STATUT_COMMISSION[l.statut] || {}).label; } },
            { key: "actions", title: "", sortable: false, className: "cx-right", searchValue: function () { return ""; }, render: function (l) {
                return "<div class='ap-actions'>" + btn("detail", "fa-list", "Détail par client") +
                    (l.statut === "PAYEE" ? btn("rouvrir", "fa-undo", "Annuler le paiement (remettre à payer)") :
                        (l.montant > 0 ? btn("payer", "fa-check-circle", "Marquer payée", "cx-btn-success") : "")) + "</div>";
            } }
        ],
        rows: [], pageSize: 25, sortKey: "montant", sortDir: -1,
        emptyText: "Aucune commission sur la période", emptyIcon: "fa-percent",
        footer: function (rows) {
            var t = totaux(rows);
            return "<tr><td colspan='3'>Total · " + pluriel(rows.length, "apporteur") + "</td><td class='num cx-nowrap'>" + U.money(t.base) + "</td><td></td>" +
                "<td class='num cx-nowrap'>" + U.money(t.montant) + "</td><td colspan='2' class='cx-nowrap'>À payer : " + U.money(t.aPayer) + "</td></tr>";
        },
        onRender: function () {
            /* ré-insère les détails dépliés après chaque rendu */
            $("#dt tbody > tr[data-id]").each(function () {
                var id = $(this).data("id");
                if (ouverts[id]) $(this).after(detailHtml(ligne(id)));
            });
        }
    });
    function ligne(id) { return $.grep(lignes, function (l) { return String(l.id) === String(id); })[0]; }
    function detailHtml(l) {
        if (!l) return "";
        var d = l.details || [];
        return "<tr class='cm-detail'><td colspan='8'><table><thead><tr><th>Client</th><th>N° de compte</th><th class='num'>Factures</th><th class='num'>Base</th><th class='num'>Commission</th></tr></thead><tbody>" +
            ($.map(d, function (x) {
                var c = client(x.clientId);
                return "<tr><td><a href='client-fiche.html?id=" + x.clientId + "#factures'>" + U.esc(x.client || c.raisonSociale) + "</a></td><td class='cx-mono'>" + U.esc(REF.compteClient(c)) + "</td>" +
                    "<td class='num'>" + (x.factureIds || []).length + "</td><td class='num cx-nowrap'>" + U.money(x.base) + "</td><td class='num cx-nowrap'>" + U.money(x.commission) + "</td></tr>";
            }).join("") || "<tr><td colspan='5' class='cx-muted'>Aucun client rattaché à cet apporteur.</td></tr>") +
            "</tbody></table></td></tr>";
    }

    function rendre() {
        var rows = calculer();
        majKpis(totaux(rows), rows);
        dt.setRows(rows);
    }

    /* ---------- Actions ---------- */
    $("#dt").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var l = ligne($(this).closest("tr").data("id"));
        if (!l) return;
        $(this).tooltip("hide");
        var act = $(this).data("act");
        if (act === "detail") { ouverts[l.id] = !ouverts[l.id]; dt.refresh(); }
        else if (act === "payer") ouvrirPaiement(l);
        else if (act === "rouvrir") rouvrir(l);
    });

    var enCours = null;
    function ouvrirPaiement(l) {
        enCours = l;
        $("#mp-apporteur").text(A.nom(l.apporteur) + " (" + l.apporteur.code + ")");
        $("#mp-periode").text(libPeriode());
        $("#mp-base").text(U.money(l.montantBase) + " · " + A.baseLib(l.apporteur).toLowerCase() + " · " + U.fmt(l.taux, l.taux % 1 ? 1 : 0) + " %");
        $("#mp-montant").text(U.money(l.montant));
        $("#mp-date").val(today);
        $("#mp-reference").val("");
        $("#m-payer").modal("show");
    }
    $("#mp-ok").on("click", function () {
        var l = enCours;
        if (!l) return;
        var date = $("#mp-date").val();
        if (!date) { U.toast("Indiquez la date du paiement.", "warning"); return; }
        var $b = $(this);
        U.busy($b, true);
        var rec = $.extend(true, {}, l.rec || {}, {
            apporteurId: l.id, du: du(), au: au(), base: l.calc.base, taux: l.calc.taux,
            montantBase: l.calc.montantBase, montant: l.calc.montant,
            details: $.map(l.calc.details, function (d) { return { clientId: d.clientId, client: d.client, factureIds: d.factureIds, base: d.base, commission: d.commission }; }),
            statut: "PAYEE", datePaiement: date, modePaiement: $("#mp-mode").val(), reference: $.trim($("#mp-reference").val())
        });
        rec.historique = (rec.historique || []).concat([{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Commission de " + U.money(rec.montant) + " marquée payée (" + rec.modePaiement + ")" }]);
        // TODO API : POST /commercial/commissions  { apporteurId, du, au, datePaiement, modePaiement, reference }  (calcul figé côté serveur)
        CX.api.save("commissions", rec).then(function () {
            return CX.api.log("apporteurs", l.id, "Commission " + libPeriode() + " payée : " + U.money(rec.montant));
        }).done(function () {
            U.toast("Commission de " + U.esc(A.nom(l.apporteur)) + " marquée payée : " + U.money(rec.montant) + ".", "success");
            $("#m-payer").modal("hide");
            recharger();
        }).always(function () { U.busy($b, false); });
    });
    function rouvrir(l) {
        U.confirm({
            title: "Annuler le paiement de la commission",
            message: "<p>La commission de <b>" + U.esc(A.nom(l.apporteur)) + "</b> (" + U.money(l.montant) + ", " + U.esc(libPeriode()) + ") repassera <b>à payer</b> et sera recalculée.</p>",
            okText: "Remettre à payer", okClass: "cx-btn-danger", cancelText: "Conserver"
        }).done(function () {
            var rec = $.extend(true, {}, l.rec, { statut: "A_PAYER", datePaiement: null, modePaiement: null, reference: "" });
            rec.historique = (rec.historique || []).concat([{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Paiement annulé" }]);
            // TODO API : POST /commercial/commissions/{id}/annuler-paiement
            CX.api.save("commissions", rec).then(function () { return CX.api.log("apporteurs", l.id, "Paiement de la commission " + libPeriode() + " annulé"); })
                .done(function () { U.toast("Commission remise à payer.", "info"); recharger(); });
        });
    }

    /* ---------- Exports ---------- */
    function lignesTriees() { return dt.getFiltered(); }
    $("#btn-csv").on("click", function () {
        var rows = lignesTriees();
        if (!rows.length) { U.toast("Aucune commission à exporter.", "warning"); return; }
        var l = [["Commissions des apporteurs " + libPeriode()], [],
            ["Code apporteur", "Apporteur", "Type", "Base", "Taux (%)", "Client", "N° de compte", "Nb factures", "Montant de base", "Commission", "Statut", "Date de paiement"]];
        $.each(rows, function (_, x) {
            var a = x.apporteur, st = (REF.STATUT_COMMISSION[x.statut] || {}).label;
            $.each(x.details.length ? x.details : [{ client: "", factureIds: [], base: 0, commission: 0 }], function (_, d) {
                l.push([a.code, A.nom(a), (REF.TYPES_APPORTEUR[a.type] || {}).label, A.baseLib(a), String(x.taux).replace(".", ","), d.client || "",
                    d.clientId ? REF.compteClient(client(d.clientId)) : "", (d.factureIds || []).length, d.base, d.commission, st, x.rec && x.rec.datePaiement ? U.toFr(x.rec.datePaiement) : ""]);
            });
            l.push([a.code, A.nom(a), "", "", "", "TOTAL APPORTEUR", "", "", x.montantBase, x.montant, st, ""]);
        });
        var t = totaux(rows);
        l.push([]); l.push(["", "TOTAL GÉNÉRAL", "", "", "", "", "", "", t.base, t.montant, "", ""]);
        CX.exporter.telecharger("Commissions " + du() + "_" + au() + ".csv", CX.exporter.csv(l, ";"), { bom: true });
        U.toast("Export des commissions téléchargé.", "success");
    });
    $("#btn-imprimer").on("click", function () {
        var rows = lignesTriees(), t = totaux(rows), S = CX.CONFIG.SOCIETE;
        var corps = $.map(rows, function (x) {
            var a = x.apporteur;
            return "<tr><td><b>" + U.esc(a.code) + "</b></td><td><b>" + U.esc(A.nom(a)) + "</b></td><td>" + U.esc(A.baseLib(a)) + "</td>" +
                "<td class='num'>" + U.fmt(x.montantBase) + "</td><td class='num'>" + U.fmt(x.taux, x.taux % 1 ? 1 : 0) + " %</td><td class='num'><b>" + U.fmt(x.montant) + "</b></td>" +
                "<td>" + U.esc((REF.STATUT_COMMISSION[x.statut] || {}).label) + (x.rec && x.rec.datePaiement ? " le " + U.toFr(x.rec.datePaiement) : "") + "</td></tr>" +
                $.map(x.details, function (d) {
                    return d.base ? "<tr class='cm-sous'><td></td><td>" + U.esc(d.client) + "</td><td>" + (d.factureIds || []).length + " facture(s)</td><td class='num'>" + U.fmt(d.base) + "</td><td></td><td class='num'>" + U.fmt(d.commission) + "</td><td></td></tr>" : "";
                }).join("");
        }).join("");
        $("#cm-print").html("<div class='cm-sheet'><div class='cm-sheet-head'><div><b>" + U.esc(S.nom) + "</b><div>" + U.esc(S.adresse) + "</div></div>" +
            "<div style='text-align:right'><h1>ÉTAT DES COMMISSIONS</h1><div>Apporteurs d'affaires · " + U.esc(libPeriode()) + "</div></div></div>" +
            "<table><thead><tr><th>Code</th><th>Apporteur / client</th><th>Base</th><th class='num'>Montant de base</th><th class='num'>Taux</th><th class='num'>Commission</th><th>Statut</th></tr></thead>" +
            "<tbody>" + (corps || "<tr><td colspan='7'>Aucune commission sur la période.</td></tr>") + "</tbody>" +
            "<tfoot><tr><td colspan='3'>Total · " + pluriel(rows.length, "apporteur") + "</td><td class='num'>" + U.fmt(t.base) + "</td><td></td><td class='num'>" + U.fmt(t.montant) + "</td><td>À payer : " + U.fmt(t.aPayer) + "</td></tr></tfoot></table>" +
            "<div class='cm-signatures'><div>Le responsable commercial</div><div>Le directeur financier</div></div>" +
            "<p style='margin-top:14px;color:#6b7280;font-size:9px'>Édité le " + U.toFr(U.now()) + " par " + U.esc(CX.CONFIG.USER.nom) + " - montants en francs CFA.</p></div>");
        window.print();
    });

    /* ---------- Chargement ---------- */
    function recharger() {
        // TODO API : GET /commercial/commissions/calcul?du=&au=&apporteur=  (calcul serveur + commissions enregistrées)
        return $.when(CX.api.list("apporteurs"), CX.api.list("clients"), CX.api.list("factures"), CX.api.list("commissions"))
            .done(function (a, c, f, k) { apporteurs = a; clients = c; factures = f; commissions = k; rendre(); });
    }
    function appliquerRaccourci() {
        var code = $("#f-raccourci").val();
        if (code === "PERSO") return;
        var p = periode(code); $("#f-du").val(p.du); $("#f-au").val(p.au);
    }

    $("#mp-mode").html($.map(CX.REF.MODES_PAIEMENT, function (m) { return "<option>" + U.esc(m) + "</option>"; }).join(""));
    appliquerRaccourci();
    // TODO API : GET /commercial/apporteurs (liste du filtre)
    CX.api.list("apporteurs").done(function (list) {
        list.sort(function (a, b) { return a.code > b.code ? 1 : -1; });
        $("#f-apporteur").html("<option value=''></option>" + $.map(list, function (a) {
            return "<option value='" + a.id + "'>" + U.esc(a.code + " · " + A.nom(a)) + "</option>";
        }).join("")).select2({ width: "100%", allowClear: true, placeholder: "Tous les apporteurs" });
        var pre = U.queryParam("apporteur");
        if (pre) { $("#f-apporteur").val(pre).trigger("change.select2"); $("#f-zero").prop("checked", true); }
        $("#f-raccourci").on("change", function () { appliquerRaccourci(); rendre(); });
        $("#f-du, #f-au").on("change", function () { $("#f-raccourci").val("PERSO"); rendre(); });
        $("#f-apporteur, #f-statut, #f-zero").on("change", rendre);
        recharger();
    });
});

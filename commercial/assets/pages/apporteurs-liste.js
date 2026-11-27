/* =====================================================================
   Commercial · Liste des apporteurs d'affaires (apporteurs-liste.html)
   ---------------------------------------------------------------------
   Indicateurs, filtres (ville, agence, type, statut, recherche),
   tableau et actions : fiche / modifier, activer / suspendre, voir ses
   clients (modale), commissions (commissions.html?apporteur=ID).
   Paramètre d'URL : ?ville=DOUALA pré-filtre la ville.
   Dépend de facturation.js (CX.fac) et apporteurs.js (CX.app).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, A = CX.app;

    var apporteurs = [], clients = [], factures = [], commissions = [];
    var ca = {};    // apporteurId -> CA HT de l'année des clients apportés

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function apporteur(id) { return $.grep(apporteurs, function (a) { return String(a.id) === String(id); })[0]; }

    /* ------------------------------------------------------------------
       Filtres
       ------------------------------------------------------------------ */
    function filtres() {
        var v = $("#f-ville").val(), ag = $("#f-agence").val(), t = $("#f-type").val(), s = $("#f-statut").val();
        return $.grep(apporteurs, function (a) {
            if (v && a.ville !== v) return false;
            if (ag && String(a.agenceId) !== String(ag)) return false;
            if (t && a.type !== t) return false;
            if (s && a.statut !== s) return false;
            return true;
        });
    }
    function majAgences() {
        var v = $("#f-ville").val(), cur = $("#f-agence").val();
        var liste = v ? REF.agencesDe(v) : REF.AGENCES;
        $("#f-agence").html("<option value=''>Toutes les agences</option>" + $.map(liste, function (a) {
            return "<option value='" + a.id + "'>" + U.esc(a.nom + (v ? "" : " · " + a.ville)) + "</option>";
        }).join(""));
        if ($.grep(liste, function (a) { return String(a.id) === String(cur); }).length) $("#f-agence").val(cur);
    }

    /* ------------------------------------------------------------------
       Indicateurs
       ------------------------------------------------------------------ */
    function kpi(label, value, foot, icon, color) {
        return "<div class='cx-kpi " + (color || "") + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    function majKpis(rows) {
        var actifs = 0, nbCli = 0, caTot = 0, ids = {};
        $.each(rows, function (_, a) { if (a.statut === "ACTIF") actifs++; ids[a.id] = 1; nbCli += A.clientsDe(a.id, clients).length; caTot += ca[a.id] || 0; });
        var y = U.today().substr(0, 4), paye = 0, aPayer = 0;
        $.each(commissions, function (_, c) {
            if (!ids[c.apporteurId]) return;
            if (c.statut === "PAYEE" && (c.datePaiement || "").substr(0, 4) === y) paye += c.montant;
            if (c.statut === "A_PAYER") aPayer += c.montant;
        });
        $("#kpis").html([
            kpi("Apporteurs activés", U.fmt(actifs) + " <small>/ " + rows.length + "</small>", pluriel(rows.length - actifs, "suspendu"), "fa-handshake-o", ""),
            kpi("Clients apportés", U.fmt(nbCli), "Comptes rattachés à un apporteur", "fa-building-o", "purple"),
            kpi("CA apporté " + y, U.fmt(caTot) + " <small>FCFA</small>", "Net HT facturé aux clients apportés", "fa-line-chart", "green"),
            kpi("Commissions payées " + y, U.fmt(paye) + " <small>FCFA</small>", aPayer ? U.money(aPayer) + " enregistrées à payer" : "Voir le calcul des commissions", "fa-percent", "orange")
        ].join(""));
        $("#h-sous-titre").text("· " + pluriel(rows.length, "apporteur"));
    }

    /* ------------------------------------------------------------------
       Tableau
       ------------------------------------------------------------------ */
    function btn(act, icon, titre, cls) {
        return "<button type='button' class='cx-btn " + (cls || "cx-btn-ghost") + " cx-btn-xs' data-act='" + act + "' data-toggle='tooltip' title='" + U.esc(titre) + "'><i class='fa " + icon + "'></i></button>";
    }
    var dt = new CX.DataTable("#dt", {
        columns: [
            { key: "code", title: "Code", render: function (a) { return "<a class='cx-mono cx-strong' href='apporteur-form.html?id=" + a.id + "'>" + U.esc(a.code) + "</a><div class='cx-cell-sub'>" + U.esc(a.matricule || "") + "</div>"; },
                searchValue: function (a) { return a.code + " " + (a.matricule || ""); } },
            { key: "nom", title: "Apporteur", sortValue: function (a) { return a.nom + " " + a.prenoms; },
                searchValue: function (a) { return a.nom + " " + a.prenoms; },
                render: function (a) {
                    return "<div class='cx-who'><span class='cx-avatar'>" + U.esc(U.initials(a.prenoms + " " + a.nom)) + "</span><div><div class='cx-cell-main'>" +
                        U.esc(a.prenoms) + " " + U.esc(a.nom) + "</div><div class='cx-cell-sub'>" + (a.dateNaissance ? "Né" + (a.sexe === "F" ? "e" : "") + " le " + U.toFr(a.dateNaissance) : "") + "</div></div></div>";
                } },
            { key: "type", title: "Type", render: A.typeHtml, searchValue: function (a) { return (REF.TYPES_APPORTEUR[a.type] || {}).label || ""; } },
            { key: "tel1", title: "Contact", render: function (a) {
                return "<div class='cx-nowrap'>" + U.esc(a.tel1 || "") + (a.tel2 ? " · " + U.esc(a.tel2) : "") + "</div><div class='cx-cell-sub'>" + (a.email ? "<a href='mailto:" + U.esc(a.email) + "'>" + U.esc(a.email) + "</a>" : "") + "</div>";
            }, searchValue: function (a) { return (a.tel1 || "") + " " + (a.tel2 || "") + " " + (a.email || "") + " " + String(a.tel1 || "").replace(/\s/g, ""); } },
            { key: "ville", title: "Affectation", render: function (a) {
                var ag = REF.agence(a.agenceId);
                return U.esc(a.ville) + "<div class='cx-cell-sub'>" + (ag ? "Agence " + U.esc(ag.nom) : "") + "</div>";
            } },
            { key: "clients", title: "Clients", className: "num", sortValue: function (a) { return A.clientsDe(a.id, clients).length; }, searchValue: function () { return ""; },
                render: function (a) { var n = A.clientsDe(a.id, clients).length; return n ? "<a href='#' data-act='clients'>" + n + "</a>" : "<span class='cx-muted'>0</span>"; } },
            { key: "tauxCommission", title: "Commission", className: "num", render: function (a) { return "<b>" + A.taux(a) + "</b><div class='cx-cell-sub'>" + U.esc(A.baseLib(a)) + "</div>"; },
                searchValue: function () { return ""; } },
            { key: "ca", title: "CA de l'année", className: "num", sortValue: function (a) { return ca[a.id] || 0; }, searchValue: function () { return ""; },
                render: function (a) { return ca[a.id] ? "<span class='cx-nowrap'>" + U.money(ca[a.id]) + "</span>" : "<span class='cx-muted'>—</span>"; } },
            { key: "statut", title: "Statut", render: A.statutHtml, searchValue: function (a) { return (REF.STATUT_APPORTEUR[a.statut] || {}).label || ""; } },
            { key: "actions", title: "", sortable: false, className: "cx-right", searchValue: function () { return ""; }, render: function (a) {
                return "<div class='ap-actions'>" +
                    "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='apporteur-form.html?id=" + a.id + "' data-toggle='tooltip' title='Fiche / modifier'><i class='fa fa-pencil'></i></a>" +
                    btn("clients", "fa-building-o", "Voir ses clients") +
                    "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='commissions.html?apporteur=" + a.id + "' data-toggle='tooltip' title='Commissions'><i class='fa fa-percent'></i></a>" +
                    (a.statut === "ACTIF" ? btn("statut", "fa-pause-circle", "Suspendre", "cx-btn-danger") : btn("statut", "fa-play-circle", "Activer", "cx-btn-soft")) +
                    "</div>";
            } }
        ],
        rows: [], pageSize: 25, sortKey: "code", sortDir: 1, searchInput: "#q",
        emptyText: "Aucun apporteur d'affaires", emptyIcon: "fa-handshake-o",
        rowClass: function (a) { return a.statut !== "ACTIF" ? "cx-row-muted" : ""; }
    });

    function rendre() {
        var rows = filtres();
        majKpis(rows);
        dt.setRows(rows);
    }

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */
    $("#dt").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var a = apporteur($(this).closest("tr").data("id"));
        if (!a) return;
        $(this).tooltip("hide");
        var act = $(this).data("act");
        if (act === "clients") voirClients(a);
        else if (act === "statut") basculerStatut(a);
    });

    function voirClients(a) {
        var mes = A.clientsDe(a.id, clients);
        $("#mc-titre").text("Clients apportés par " + A.nom(a) + " (" + a.code + ")");
        $("#mc-commissions").attr("href", "commissions.html?apporteur=" + a.id);
        var y = U.today().substr(0, 4);
        var calc = A.calculer($.extend({}, a, { baseCommission: "FACTURE" }), clients, factures, y + "-01-01", y + "-12-31");
        $("#mc-liste").html(mes.length ? "<div class='cx-table-wrap'><table class='cx-table'><thead><tr><th>Client</th><th>N° de compte</th><th>Ville</th><th class='num'>CA HT " + y + "</th><th>Statut</th></tr></thead><tbody>" +
            $.map(mes, function (c) {
                var d = $.grep(calc.details, function (x) { return x.clientId === c.id; })[0] || { base: 0 };
                return "<tr><td><a class='cx-cell-main' href='client-fiche.html?id=" + c.id + "'>" + U.esc(c.raisonSociale) + "</a><div class='cx-cell-sub'>" + U.esc(c.code) + "</div></td>" +
                    "<td class='cx-mono'>" + U.esc(REF.compteClient(c)) + "</td><td>" + U.esc(c.ville || "") + "</td><td class='num cx-nowrap'>" + U.money(d.base) + "</td>" +
                    "<td>" + REF.badge(REF.STATUT_CLIENT, c.statut) + "</td></tr>";
            }).join("") + "</tbody><tfoot><tr><td colspan='3'>Total · " + pluriel(mes.length, "client") + "</td><td class='num cx-nowrap'>" + U.money(calc.montantBase) + "</td><td></td></tr></tfoot></table></div>"
            : "<div class='cx-empty'><i class='fa fa-building-o'></i><b>Aucun client rattaché</b>Rattachez un client depuis son formulaire (« Apporteur d'affaires »).</div>");
        $("#m-clients").modal("show");
    }

    function basculerStatut(a) {
        var suspendre = a.statut === "ACTIF";
        var motif = "";
        $(document).off("input.apmotif").on("input.apmotif", "#ap-motif", function () { motif = $.trim($(this).val()); });
        U.confirm({
            title: (suspendre ? "Suspendre " : "Activer ") + A.nom(a),
            message: suspendre
                ? "<p>L'apporteur <b>" + U.esc(a.code) + "</b> ne pourra plus être rattaché à de nouveaux clients et ses commissions ne seront plus calculées.</p>" +
                  "<div class='cx-field' style='margin:0'><label class='cx-label' for='ap-motif'>Motif <span class='cx-opt'>(facultatif)</span></label><input type='text' class='form-control' id='ap-motif' maxlength='120'></div>"
                : "<p>L'apporteur <b>" + U.esc(a.code) + "</b> sera de nouveau actif.</p>",
            okText: suspendre ? "Suspendre" : "Activer", okClass: suspendre ? "cx-btn-danger" : "cx-btn-success"
        }).done(function () {
            var maj = $.extend(true, {}, a, { statut: suspendre ? "SUSPENDU" : "ACTIF" });
            // TODO API : POST /commercial/apporteurs/{id}/suspendre | /activer  { motif }
            CX.api.save("apporteurs", maj).then(function () {
                return CX.api.log("apporteurs", a.id, suspendre ? "Apporteur suspendu" + (motif ? " - " + motif : "") : "Apporteur réactivé");
            }).done(function () { U.toast(A.nom(a) + (suspendre ? " suspendu." : " activé."), "success"); recharger(); });
        }).always(function () { $(document).off("input.apmotif"); });
    }

    /* ------------------------------------------------------------------
       Chargement
       ------------------------------------------------------------------ */
    function recharger() {
        // TODO API : GET /commercial/apporteurs?ville=&agence=&type=&statut=  (avec nb de clients et CA de l'année calculés côté serveur)
        return $.when(CX.api.list("apporteurs"), CX.api.list("clients"), CX.api.list("factures"), CX.api.list("commissions"))
            .done(function (a, c, f, k) {
                apporteurs = a; clients = c; factures = f; commissions = k;
                ca = {};
                $.each(apporteurs, function (_, x) { ca[x.id] = A.caAnnee(x, clients, factures); });
                rendre();
            });
    }

    $("#f-ville").append($.map(REF.VILLES, function (v) { return "<option value='" + v.nom + "'>" + U.esc(v.nom) + "</option>"; }).join(""));
    $("#f-type").append($.map(REF.TYPES_APPORTEUR, function (t, k) { return "<option value='" + k + "'>" + U.esc(t.label) + "</option>"; }).join(""));
    majAgences();
    if (U.queryParam("ville")) $("#f-ville").val(U.queryParam("ville"));
    majAgences();
    $("#f-ville").on("change", function () { majAgences(); rendre(); });
    $("#f-agence, #f-type, #f-statut").on("change", rendre);
    $("#btn-reinit").on("click", function () {
        $("#f-ville, #f-type, #f-statut").val(""); majAgences(); $("#f-agence").val("");
        $("#q").val(""); dt.setSearch(""); rendre();
    });
    recharger();
});

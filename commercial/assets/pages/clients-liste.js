/* =====================================================================
   Commercial · Liste des comptes clients (clients-liste.html)
   ---------------------------------------------------------------------
   - Indicateurs cliquables (appliquent un filtre)
   - Filtres : recherche, type de compte, statut, ville, agence,
     interrupteur « en compte uniquement »
   - Tableau CX.DataTable + menu d'actions par ligne
   - Export CSV des lignes filtrées (séparateur « ; », BOM UTF-8 pour Excel)
   Paramètres d'URL acceptés : ?type=COMPTE|COMPTANT|FORFAIT, ?statut=SUSPENDU,
   ?ville=DOUALA, ?agence=1, ?encompte=1, ?q=texte
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF;

    var TYPE = {
        COMPTANT: { label: "Au comptant", color: "grey" },
        COMPTE: { label: "En compte", color: "blue" },
        FORFAIT: { label: "Forfait", color: "purple" }
    };
    var state = { clients: [], usage: {} };   // usage[id] = { exp, fac, cot }

    function typeDe(c) { return c.forfait ? "FORFAIT" : (c.enCompte ? "COMPTE" : "COMPTANT"); }
    function contact(c, role) { return $.grep(c.contacts || [], function (x) { return x.role === role; })[0] || {}; }
    function agenceLib(c) { var a = REF.agence(c.agenceId); return a ? a.nom + " · " + a.ville : ""; }
    function telHref(t) { return "tel:" + String(t || "").replace(/[^\d+]/g, ""); }

    /* =================================================================
       Filtres
       ================================================================= */
    function initFiltres() {
        $("#f-statut").html("<option value=''>Tous</option>" + $.map(REF.STATUT_CLIENT, function (s, k) {
            return "<option value='" + k + "'>" + U.esc(s.label) + "</option>";
        }).join(""));
        $("#f-ville").html("<option value=''>Toutes</option>" + $.map(REF.VILLES, function (v) {
            return "<option value='" + U.esc(v.nom) + "'>" + U.esc(v.nom) + "</option>";
        }).join(""));
        remplirAgences("");

        /* Valeurs initiales depuis l'URL */
        if (U.queryParam("type")) $("#f-type").val(U.queryParam("type"));
        if (U.queryParam("statut")) $("#f-statut").val(U.queryParam("statut"));
        if (U.queryParam("ville")) { $("#f-ville").val(U.queryParam("ville")); remplirAgences(U.queryParam("ville")); }
        if (U.queryParam("agence")) $("#f-agence").val(U.queryParam("agence"));
        if (U.queryParam("encompte") === "1") $("#f-encompte").prop("checked", true);
        if (U.queryParam("q")) $("#q").val(U.queryParam("q"));
    }

    /* Les agences proposées suivent la ville choisie */
    function remplirAgences(ville) {
        var actuelle = $("#f-agence").val();
        var liste = ville ? REF.agencesDe(ville) : REF.AGENCES;
        $("#f-agence").html("<option value=''>Toutes</option>" + $.map(liste, function (a) {
            return "<option value='" + a.id + "'>" + U.esc(a.nom + (ville ? "" : " · " + a.ville)) + "</option>";
        }).join(""));
        if (actuelle && $("#f-agence option[value='" + actuelle + "']").length) $("#f-agence").val(actuelle);
    }

    function filtres() {
        return {
            type: $("#f-type").val(), statut: $("#f-statut").val(), ville: $("#f-ville").val(),
            agence: $("#f-agence").val(), enCompte: $("#f-encompte").is(":checked")
        };
    }

    function appliquerFiltres() {
        var f = filtres();
        var rows = $.grep(state.clients, function (c) {
            if (f.type && typeDe(c) !== f.type) return false;
            if (f.statut && c.statut !== f.statut) return false;
            if (f.ville && c.ville !== f.ville) return false;
            if (f.agence && String(c.agenceId) !== String(f.agence)) return false;
            if (f.enCompte && !c.enCompte) return false;
            return true;
        });
        dt.setRows(rows);
        var actif = !!(f.type || f.statut || f.ville || f.agence || f.enCompte || $.trim($("#q").val()));
        $("#btn-reset").toggleClass("cx-hidden", !actif);
        /* KPI surligné selon le filtre */
        $("#kpis .cx-kpi").removeClass("active");
        if (!actif) $("#kpis [data-kpi='total']").addClass("active");
        else if (f.enCompte && !f.type && !f.statut) $("#kpis [data-kpi='encompte']").addClass("active");
        else if (f.type === "FORFAIT") $("#kpis [data-kpi='forfait']").addClass("active");
        else if (f.statut === "SUSPENDU") $("#kpis [data-kpi='suspendus']").addClass("active");
    }

    function effacerFiltres() {
        $("#f-type, #f-statut, #f-ville").val("");
        remplirAgences("");
        $("#f-agence").val("");
        $("#f-encompte").prop("checked", false);
        $("#q").val("");
        dt.setSearch("");
    }

    /* =================================================================
       Indicateurs
       ================================================================= */
    function rendreKpis() {
        var c = state.clients;
        var nbCompte = $.grep(c, function (x) { return x.enCompte; }).length;
        var nbForfait = $.grep(c, function (x) { return x.forfait; }).length;
        var nbSusp = $.grep(c, function (x) { return x.statut === "SUSPENDU"; }).length;
        var nbActifs = $.grep(c, function (x) { return x.statut === "ACTIF"; }).length;
        $("#kpis").html([
            kpi("total", "Comptes clients", c.length, nbActifs + " actifs", "fa-building-o", ""),
            kpi("encompte", "Clients en compte", nbCompte, "Facturés en fin de période", "fa-calendar-check-o", "green"),
            kpi("forfait", "Au forfait", nbForfait, "Montant fixe par période", "fa-refresh", "purple"),
            kpi("suspendus", "Comptes suspendus", nbSusp, nbSusp ? "À régulariser ou réactiver" : "Aucun compte bloqué", "fa-pause-circle", nbSusp ? "orange" : "")
        ].join(""));
        $("#l-count").text("· " + c.length + " compte" + (c.length > 1 ? "s" : ""));
    }
    function kpi(id, label, value, foot, icon, color) {
        return "<div class='cx-kpi clickable " + color + "' data-kpi='" + id + "' title='Filtrer la liste'>" +
            "<div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div>" +
            "<div class='cx-kpi-foot'>" + foot + "</div></div>";
    }

    /* =================================================================
       Tableau
       ================================================================= */
    function menuActions(c) {
        var id = c.id, u = state.usage[id] || { exp: 0, fac: 0, cot: 0 };
        var utilise = u.exp + u.fac + u.cot > 0;
        var raison = [];
        if (u.exp) raison.push(u.exp + " expédition" + (u.exp > 1 ? "s" : ""));
        if (u.fac) raison.push(u.fac + " facture" + (u.fac > 1 ? "s" : ""));
        if (u.cot) raison.push(u.cot + " cotation" + (u.cot > 1 ? "s" : ""));
        return "<div class='dropdown cx-actions'>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-toggle='dropdown' aria-haspopup='true' title='Actions'><i class='fa fa-ellipsis-v'></i></button>" +
            "<ul class='dropdown-menu dropdown-menu-right'>" +
            "<li><a href='client-fiche.html?id=" + id + "'><i class='fa fa-id-card-o'></i> Voir la fiche</a></li>" +
            "<li><a href='client-form.html?id=" + id + "'><i class='fa fa-pencil'></i> Modifier</a></li>" +
            "<li class='divider'></li>" +
            (c.statut === "SUSPENDU"
                ? "<li class='disabled'><a href='#' data-noop><i class='fa fa-calculator'></i> Nouvelle cotation<small>Compte suspendu</small></a></li>"
                : "<li><a href='cotation-form.html?type=EXPEDITION&client=" + id + "'><i class='fa fa-calculator'></i> Nouvelle cotation</a></li>") +
            (c.enCompte
                ? "<li><a href='facture-emettre.html?client=" + id + "'><i class='fa fa-file-text-o'></i> Émettre une facture</a></li>"
                : "<li class='disabled'><a href='#' data-noop><i class='fa fa-file-text-o'></i> Émettre une facture<small>Client au comptant</small></a></li>") +
            "<li><a href='../maquettes-carnets/carnets-liste.html?client=" + id + "'><i class='fa fa-book'></i> Carnets de LT</a></li>" +
            "<li class='divider'></li>" +
            (c.statut === "ACTIF"
                ? "<li><a href='#' data-act='suspendre'><i class='fa fa-pause-circle'></i> Suspendre le compte</a></li>"
                : "<li><a href='#' data-act='reactiver'><i class='fa fa-play-circle'></i> Réactiver le compte</a></li>") +
            (utilise
                ? "<li class='disabled'><a href='#' data-noop><i class='fa fa-trash-o'></i> Supprimer<small>Lié à " + raison.join(", ") + "</small></a></li>"
                : "<li><a href='#' data-act='supprimer' class='text-danger'><i class='fa fa-trash-o'></i> Supprimer</a></li>") +
            "</ul></div>";
    }

    var dt = new CX.DataTable("#dt-clients", {
        pageSize: 25,
        sortKey: "raisonSociale", sortDir: 1,
        searchInput: "#q",
        emptyText: "Aucun client ne correspond aux filtres", emptyIcon: "fa-building-o",
        rowClass: function (c) { return c.statut === "INACTIF" ? "cx-row-muted" : ""; },
        columns: [
            { key: "code", title: "Code", width: "96px", render: function (c) { return "<span class='cx-mono cx-muted'>" + U.esc(c.code) + "</span>"; } },
            {
                key: "raisonSociale", title: "Raison sociale",
                searchValue: function (c) { return [c.raisonSociale, c.sigle, c.code, c.secteur].join(" "); },
                render: function (c) {
                    return "<div class='cx-who'><span class='cx-avatar'>" + U.initials(c.raisonSociale) + "</span><div>" +
                        "<span class='cx-cli-name'><a class='cx-cell-main' href='client-fiche.html?id=" + c.id + "'>" + U.esc(c.raisonSociale) + "</a>" +
                        (c.sigle ? "<span class='cx-tag'>" + U.esc(c.sigle) + "</span>" : "") + "</span>" +
                        "<div class='cx-cell-sub'>" + (c.telStandard ? "<i class='fa fa-phone'></i> " + U.esc(c.telStandard) : U.esc(c.secteur || "")) + "</div></div></div>";
                }
            },
            {
                key: "ville", title: "Ville / localisation",
                searchValue: function (c) { return (c.ville || "") + " " + (c.localisation || ""); },
                render: function (c) { return U.esc(c.ville || "—") + "<div class='cx-cell-sub'>" + U.esc(c.localisation || "") + "</div>"; }
            },
            {
                key: "interlocuteur", title: "Interlocuteur",
                sortValue: function (c) { return contact(c, "PRINCIPAL").nom || ""; },
                searchValue: function (c) { return contact(c, "PRINCIPAL").nom || ""; },
                render: function (c) {
                    var p = contact(c, "PRINCIPAL");
                    return p.nom ? U.esc(p.nom) + "<div class='cx-cell-sub'>" + U.esc(p.titre || "") + "</div>" : "<span class='cx-muted'>—</span>";
                }
            },
            {
                key: "coordonnees", title: "Téléphone / email", sortable: false,
                searchValue: function (c) {
                    var p = contact(c, "PRINCIPAL");
                    return [p.tel1, String(p.tel1 || "").replace(/\D/g, ""), p.email, c.email].join(" ");
                },
                render: function (c) {
                    var p = contact(c, "PRINCIPAL"), tel = p.tel1 || c.telStandard, mail = p.email || c.email;
                    return "<div class='cx-cli-contact'>" +
                        (tel ? "<a class='cx-nowrap' href='" + telHref(tel) + "'>" + U.esc(tel) + "</a>" : "<span class='cx-muted'>—</span>") +
                        (mail ? "<div class='cx-cell-sub'><a href='mailto:" + U.esc(mail) + "'>" + U.esc(mail) + "</a></div>" : "") + "</div>";
                }
            },
            {
                key: "type", title: "Type",
                sortValue: function (c) { return typeDe(c); },
                searchValue: function (c) { return TYPE[typeDe(c)].label; },
                render: function (c) {
                    return "<div class='cx-cli-badges'>" + REF.badge(TYPE, typeDe(c)) +
                        (c.tarifAuto ? "<span class='cx-badge cx-badge-green cx-no-dot' data-toggle='tooltip' title='Tarification automatique " +
                            (c.tarifToutesAgences ? "(toutes agences)" : "(certaines agences)") + "'><i class='fa fa-bolt'></i></span>" : "") + "</div>";
                }
            },
            {
                key: "agence", title: "Agence",
                sortValue: function (c) { return agenceLib(c); },
                searchValue: function (c) { return agenceLib(c) + " " + (c.commercial || ""); },
                render: function (c) {
                    var a = REF.agence(c.agenceId);
                    return a ? U.esc(a.nom) + "<div class='cx-cell-sub'>" + U.esc(a.ville) + "</div>" : "<span class='cx-muted'>—</span>";
                }
            },
            {
                key: "statut", title: "Statut",
                searchValue: function (c) { return (REF.STATUT_CLIENT[c.statut] || {}).label || ""; },
                render: function (c) { return REF.badge(REF.STATUT_CLIENT, c.statut); }
            },
            { key: "actions", title: "", sortable: false, className: "cx-right", searchValue: function () { return ""; }, render: menuActions }
        ],
        onRender: function (rows) {
            $("#btn-export").prop("disabled", !rows.length);
        }
    });

    /* =================================================================
       Chargement des données
       ================================================================= */
    function charger() {
        // TODO API : GET /commercial/clients  (avec, par client, le nombre d'expéditions / factures / cotations
        //            pour savoir si la suppression est permise : champs nbExpeditions, nbFactures, nbCotations)
        return $.when(CX.api.list("clients"), CX.api.list("expeditions"), CX.api.list("factures"), CX.api.list("cotations"))
            .done(function (clients, exps, factures, cotations) {
                var usage = {};
                function u(id) { return usage[id] = usage[id] || { exp: 0, fac: 0, cot: 0 }; }
                $.each(exps, function (_, e) { u(e.clientId).exp++; });
                $.each(factures, function (_, f) { u(f.clientId).fac++; });
                $.each(cotations, function (_, c) { u(c.clientId).cot++; });
                state.clients = clients;
                state.usage = usage;
                rendreKpis();
                appliquerFiltres();
            });
    }

    function clientParId(id) { return $.grep(state.clients, function (c) { return c.id == id; })[0]; }

    /* =================================================================
       Actions
       ================================================================= */
    function suspendreOuReactiver(c, suspendre) {
        var motif = "";
        $(document).off("input.cxmotif").on("input.cxmotif", "#susp-motif", function () { motif = $(this).val(); });
        U.confirm({
            title: suspendre ? "Suspendre le compte" : "Réactiver le compte",
            message: suspendre
                ? "<p>Le compte <b>" + U.esc(c.raisonSociale) + "</b> sera suspendu : plus de nouvelles expéditions en compte ni de cotation tant qu'il n'est pas réactivé.</p>" +
                  "<label class='cx-label' for='susp-motif'>Motif <span class='cx-opt'>(conservé dans l'historique)</span></label>" +
                  "<textarea class='form-control' id='susp-motif' rows='2' placeholder='Ex. : factures impayées au-delà du délai'></textarea>"
                : "<p>Le compte <b>" + U.esc(c.raisonSociale) + "</b> redeviendra actif.</p>",
            okText: suspendre ? "Suspendre" : "Réactiver",
            okClass: suspendre ? "cx-btn-danger" : "cx-btn-success"
        }).done(function () {
            $(document).off("input.cxmotif");
            var statut = suspendre ? "SUSPENDU" : "ACTIF";
            var action = suspendre ? "Compte suspendu" + ($.trim(motif) ? " - motif : " + $.trim(motif) : "") : "Compte réactivé";
            // TODO API : POST /commercial/clients/{id}/suspendre  { motif }  |  POST /commercial/clients/{id}/reactiver
            CX.api.patchMany("clients", [Number(c.id)], { statut: statut })
                .then(function () { return CX.api.log("clients", c.id, action); })
                .done(function () {
                    U.toast(suspendre ? "Compte <b>" + U.esc(c.raisonSociale) + "</b> suspendu." : "Compte <b>" + U.esc(c.raisonSociale) + "</b> réactivé.",
                        suspendre ? "warning" : "success");
                    charger();
                });
        }).fail(function () { $(document).off("input.cxmotif"); });
    }

    function supprimer(c) {
        var u = state.usage[c.id];
        if (u && u.exp + u.fac + u.cot > 0) { U.toast("Ce client a des expéditions, factures ou cotations : suspendez-le plutôt.", "warning"); return; }
        U.confirm({
            title: "Supprimer le client",
            message: "<p>Supprimer définitivement <b>" + U.esc(c.raisonSociale) + "</b> (" + U.esc(c.code) + ") ?</p>" +
                "<p class='cx-muted'>Cette action est irréversible. Le client n'a aucune expédition, facture ni cotation.</p>",
            okText: "Supprimer", okClass: "cx-btn-danger"
        }).done(function () {
            // TODO API : DELETE /commercial/clients/{id}  (le serveur refuse si des expéditions / factures / cotations existent)
            CX.api.remove("clients", c.id).done(function () {
                U.toast("Client <b>" + U.esc(c.raisonSociale) + "</b> supprimé.");
                charger();
            });
        });
    }

    /* =================================================================
       Export CSV (lignes filtrées, dans l'ordre affiché)
       ================================================================= */
    function exporterCsv() {
        var rows = dt._filtered();   // lignes filtrées + recherche + tri (toutes les pages)
        if (!rows.length) return;
        var entetes = ["Code", "Raison sociale", "Sigle", "Type de compte", "Statut", "Secteur", "Ville", "Localisation",
            "Tél. standard", "Email entreprise", "Contact principal", "Tél. contact", "Email contact", "Agence de rattachement",
            "Commercial", "NIU", "RCCM", "Délai de paiement (j)", "Plafond de crédit (FCFA)", "Remise (%)", "Montant forfait (FCFA)",
            "Email de facturation", "Créé le"];
        function cell(v) {
            var s = v == null ? "" : String(v);
            return /[";\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
        }
        var lignes = [entetes.join(";")];
        $.each(rows, function (_, c) {
            var p = contact(c, "PRINCIPAL");
            lignes.push($.map([
                c.code, c.raisonSociale, c.sigle, TYPE[typeDe(c)].label, (REF.STATUT_CLIENT[c.statut] || {}).label || c.statut,
                c.secteur, c.ville, c.localisation, c.telStandard, c.email, p.nom, p.tel1, p.email, agenceLib(c),
                c.commercial, c.niu, c.rccm, c.enCompte ? c.delaiPaiement : "", c.enCompte ? c.plafondCredit : "",
                c.enCompte ? String(c.remisePct || 0).replace(".", ",") : "", c.forfait ? c.montantForfait : "",
                c.emailFacturation, U.toFr(c.dateCreation)
            ], function (v) { return [cell(v)]; }).join(";"));
        });
        var contenu = "﻿" + lignes.join("\r\n");
        var nom = "comptes-clients-" + U.today() + ".csv";
        // TODO API : en production, possibilité de GET /commercial/clients/export.csv?filtres... (export côté serveur)
        var blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
        if (window.navigator && window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, nom); return; }
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = nom; document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        U.toast(rows.length + " client" + (rows.length > 1 ? "s" : "") + " exporté" + (rows.length > 1 ? "s" : "") + " (" + nom + ").", "info");
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#f-type, #f-statut, #f-agence, #f-encompte").on("change", appliquerFiltres);
    $("#f-ville").on("change", function () { remplirAgences($(this).val()); appliquerFiltres(); });
    $("#q").on("input", U.debounce(appliquerFiltres, 200));
    $("#btn-reset").on("click", function () { effacerFiltres(); appliquerFiltres(); });

    $("#kpis").on("click", ".cx-kpi", function () {
        var k = $(this).data("kpi");
        effacerFiltres();
        if (k === "encompte") $("#f-encompte").prop("checked", true);
        if (k === "forfait") $("#f-type").val("FORFAIT");
        if (k === "suspendus") $("#f-statut").val("SUSPENDU");
        appliquerFiltres();
    });

    $("#btn-refresh").on("click", function () {
        var $b = $(this);
        U.busy($b, true);
        charger().always(function () { U.busy($b, false); U.toast("Liste actualisée.", "info"); });
    });
    $("#btn-export").on("click", exporterCsv);

    $("#dt-clients").on("click", "[data-noop]", function (e) { e.preventDefault(); e.stopPropagation(); });
    $("#dt-clients").on("click", "[data-act]", function (e) {
        e.preventDefault();
        var c = clientParId($(this).closest("tr").data("id"));
        if (!c) return;
        var act = $(this).data("act");
        if (act === "suspendre") suspendreOuReactiver(c, true);
        if (act === "reactiver") suspendreOuReactiver(c, false);
        if (act === "supprimer") supprimer(c);
    });
    /* Contournement : .cx-table-wrap (overflow-x:auto) rogne les menus déroulants.
       Le menu ouvert est positionné en « fixed » par rapport au bouton, vers le
       haut s'il n'y a pas la place en dessous ; il suit le bouton au défilement. */
    function placerMenu(dd) {
        var $m = $(dd).find(".dropdown-menu"), r = $(dd).find("[data-toggle='dropdown']")[0].getBoundingClientRect();
        var h = $m.outerHeight(), w = $m.outerWidth();
        var top = r.bottom + 4;
        if (top + h > window.innerHeight - 40 && r.top - h - 4 > 0) top = r.top - h - 4;
        $m.css({ position: "fixed", top: top, left: Math.max(8, r.right - w), right: "auto", bottom: "auto" });
    }
    $("#dt-clients").on("shown.bs.dropdown", ".dropdown", function () { placerMenu(this); });
    $("#dt-clients").on("hidden.bs.dropdown", ".dropdown", function () {
        $(this).find(".dropdown-menu").css({ position: "", top: "", left: "", right: "", bottom: "" });
    });
    $(window).on("scroll resize", function () { $("#dt-clients .dropdown.open").each(function () { placerMenu(this); }); });
    $("#dt-clients .cx-table-wrap").on("scroll", function () { $("#dt-clients .dropdown.open").each(function () { placerMenu(this); }); });

    /* =================================================================
       Démarrage
       ================================================================= */
    initFiltres();
    if ($("#q").val()) dt.setSearch($("#q").val());
    charger();
});

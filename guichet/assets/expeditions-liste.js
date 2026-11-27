/* =====================================================================
   ClemenTino 2.0 - Module GUICHET - historique des saisies
   (guichet/expeditions-liste.html[?statut=][&client=])
   ---------------------------------------------------------------------
   Toutes les expéditions saisies (guichet + clients en compte du jeu de
   démonstration) : indicateurs du jour, filtres (période et raccourcis,
   bureau, type de client, client, statut, mode de paiement, recherche),
   onglets par statut, tableau CX.DataTable avec totaux, export CSV,
   menu d'actions (reçu, correction, annulation, WhatsApp, facture) et
   carte « Caisse du jour » du guichetier connecté.
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, G = CX.guichet, today = U.today(), USER = CX.CONFIG.USER;
    var toutes = [];          // expéditions normalisées
    var onglet = U.queryParam("statut") || "";

    /* =================================================================
       Filtres
       ================================================================= */
    $("#f-bureau").html("<option value=''>Tous les bureaux</option>" + $.map(REF.AGENCES, function (a) {
        return "<option value='" + U.esc(a.ville + "|" + a.nom) + "'>" + U.esc(G.villeNom(a.ville) + " · " + G.titre(a.nom)) + "</option>";
    }).join(""));
    $("#f-paiement").html("<option value=''>Tous</option><option value='" + U.esc(G.MODE_COMPTE) + "'>En compte (NATEX)</option>" +
        $.map(REF.MODES_PAIEMENT, function (m) { return "<option>" + U.esc(m) + "</option>"; }).join(""));
    $.each(CX.api.clientsSync(), function (_, c) {
        if (c.enCompte) $("#f-client").append($("<option>").val(c.id).text(c.raisonSociale + (c.code ? " (" + c.code + ")" : "")));
    });
    $("#f-client").select2({ width: "100%", placeholder: "Tous les clients", allowClear: true });
    if (U.queryParam("client")) $("#f-client").val(U.queryParam("client")).trigger("change.select2");

    function periode(code) {
        if (code === "jour") return { du: today, au: today };
        if (code === "hier") { var h = U.addDays(today, -1); return { du: h, au: h }; }
        if (code === "7j") return { du: U.addDays(today, -6), au: today };
        if (code === "mois") return { du: U.firstOfMonth(today), au: today };
        return { du: "", au: "" };
    }
    function appliquerPeriode(code) {
        var p = periode(code);
        $("#f-du").val(p.du); $("#f-au").val(p.au);
        $("#f-raccourcis button").removeClass("active").filter("[data-p='" + code + "']").addClass("active");
    }
    function lireFiltres() {
        var b = ($("#f-bureau").val() || "").split("|");
        return {
            du: $("#f-du").val() || "", au: $("#f-au").val() || "", ville: b[0] || "", bureau: b[1] || "",
            type: $("#f-type").val() || "", client: $("#f-client").val() || "", statut: onglet,
            paiement: $("#f-paiement").val() || ""
        };
    }
    /* tous les filtres sauf le statut (compteurs des onglets) */
    function passe(e, f) {
        if (f.du && e.dateExp < f.du) return false;
        if (f.au && e.dateExp > f.au) return false;
        if (f.ville && (e.villeDep !== f.ville || e.bureauDep !== f.bureau)) return false;
        if (f.type && e.typeClient !== f.type) return false;
        if (f.client && String(e.clientId) !== String(f.client)) return false;
        if (f.paiement && e.paiement.mode !== f.paiement) return false;
        return true;
    }
    function appliquer() {
        var f = lireFiltres();
        var base = $.grep(toutes, function (e) { return passe(e, f); });
        $("#n-tout").text(base.length);
        $.each(G.STATUTS, function (k) { $("#n-" + k).text($.grep(base, function (e) { return e.statut === k; }).length); });
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $("#f-statut").val(onglet);
        dt.setRows(onglet ? $.grep(base, function (e) { return e.statut === onglet; }) : base);
        var actifs = f.type || f.client || f.paiement || f.ville || onglet || $.trim($("#q").val());
        $("#btn-reset").toggleClass("cx-hidden", !actifs && !(f.du || f.au));
        $("#l-count").text(dt.getFiltered().length + " expédition" + (dt.getFiltered().length > 1 ? "s" : ""));
    }

    /* =================================================================
       Tableau
       ================================================================= */
    var MODE_COULEUR = { "En compte": "purple", "Espèces": "green", "Orange Money": "orange", "MTN MoMo": "orange", "Virement": "blue", "Chèque": "blue" };
    function dateTri(e) { return e.dateExp + " " + (e.heure || "00:00") + " " + ("000000" + e.id).slice(-6); }
    function dest(e) {
        if (e.service === "REGIONALE" || e.service === "INTERNATIONALE") return (e.villeEtranger ? e.villeEtranger + ", " : "") + (e.paysDest || "Étranger");
        return G.villeNom(e.villeDest);
    }
    function actionsHtml(e) {
        var modif = G.estModifiable(e), motif = G.motifNonModifiable(e), wa = e.statut !== "ANNULEE" && G.whatsapp(e, "EXPEDITEUR");
        function item(act, icon, label, ok, raison, cls) {
            return ok ? "<li><a href='#' data-act='" + act + "'" + (cls ? " class='" + cls + "'" : "") + "><i class='fa " + icon + "'></i> " + label + "</a></li>"
                : "<li class='disabled'><a href='#' data-noop><i class='fa " + icon + "'></i> " + label + (raison ? "<small>" + U.esc(raison) + "</small>" : "") + "</a></li>";
        }
        return "<div class='dropdown cx-actions'>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-toggle='dropdown' aria-haspopup='true' aria-label='Actions' title='Actions'><i class='fa fa-ellipsis-v'></i></button>" +
            "<ul class='dropdown-menu dropdown-menu-right'>" +
            "<li><a href='recu.html?id=" + e.id + "'><i class='fa fa-print'></i> Voir / réimprimer le reçu</a></li>" +
            item("corriger", "fa-pencil", "Corriger la saisie", modif, motif) +
            item("wa", "fa-whatsapp", "Renvoyer par WhatsApp", !!wa, e.statut === "ANNULEE" ? "Expédition annulée" : "Numéro WhatsApp invalide") +
            (e.factureId ? "<li><a href='" + G.lienCommercial("facture.html?id=" + e.factureId) + "'><i class='fa fa-file-text-o'></i> Voir la facture</a></li>" : "") +
            "<li class='divider'></li>" +
            item("annuler", "fa-ban", "Annuler l'expédition", modif, motif, "text-danger") +
            "</ul></div>";
    }
    var dt = new CX.DataTable("#dt-exp", {
        pageSize: 25, sortKey: "date", sortDir: -1, searchInput: "#q",
        emptyText: "Aucune expédition pour ces critères", emptyIcon: "fa-cube",
        rowClass: function (e) { return e.statut === "ANNULEE" ? "gx-annulee" : ""; },
        columns: [
            { key: "nRt", title: "N° LT", render: function (e) {
                return "<div class='cx-cell-main cx-mono cx-nowrap'><a href='recu.html?id=" + e.id + "'>" + U.esc(e.nRt) + "</a></div>" +
                    (e.nRtMan || e.nRtManLibere ? "<span class='cx-tag cx-mono' title='Feuille du carnet de LT'>" + U.esc(e.nRtMan || e.nRtManLibere) + (e.nRtManLibere ? " (libérée)" : "") + "</span>"
                        : e.recuManuel ? "<span class='cx-cell-sub'>Reçu man. " + U.esc(e.recuManuel) + "</span>" : "");
            }, searchValue: function (e) { return e.nRt + " " + (e.nRtMan || "") + " " + (e.nRtManLibere || "") + " " + (e.recuManuel || ""); } },
            { key: "date", title: "Date", sortValue: dateTri, render: function (e) {
                return "<div class='cx-nowrap'>" + U.toFr(e.dateExp) + "</div><div class='cx-cell-sub'>" + (e.heure || "—") + "</div>";
            }, searchValue: function (e) { return U.toFr(e.dateExp); } },
            { key: "trajet", title: "Trajet", sortValue: function (e) { return e.villeDep + dest(e); }, render: function (e) {
                return "<div class='cx-nowrap'>" + U.esc(G.villeNom(e.villeDep)) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(dest(e)) + "</div>" +
                    "<div class='cx-cell-sub'>" + U.esc(G.SERVICES[e.service].label) + " · " + (e.livraison.mode === "DOMICILE" ? "domicile" + (e.livraison.quartier ? " (" + U.esc(e.livraison.quartier) + ")" : "") : "retrait " + U.esc(G.titre(e.bureauDest))) + "</div>";
            }, searchValue: function (e) { return e.villeDep + " " + dest(e) + " " + e.bureauDep + " " + e.bureauDest; } },
            { key: "exp", title: "Expéditeur", sortValue: function (e) { return e.expediteurInfo.nom; }, render: function (e) {
                return "<div class='cx-cell-main'>" + U.esc(e.expediteurInfo.nom) + "</div><div class='cx-cell-sub'>" +
                    (e.typeClient === "COMPTE" ? "<span class='cx-tag cx-tag-dark'>NATEX</span> " + U.esc(e.client ? e.client.code : "") : U.esc(G.telAff(e.expediteurInfo.tel))) + "</div>";
            }, searchValue: function (e) { return e.expediteurInfo.nom + " " + e.expediteurInfo.tel + " " + (e.client ? e.client.code + " " + e.client.raisonSociale : ""); } },
            { key: "dst", title: "Destinataire", sortValue: function (e) { return e.destinataireInfo.nom; }, render: function (e) {
                return "<div>" + U.esc(e.destinataireInfo.nom) + "</div><div class='cx-cell-sub cx-nowrap'>" + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div>";
            }, searchValue: function (e) { return e.destinataireInfo.nom + " " + e.destinataireInfo.tel + " " + G.telFmt(e.destinataireInfo.tel); } },
            { key: "colis", title: "Colis", className: "num", sortValue: function (e) { return e.nbColis || 0; }, render: function (e) {
                return (e.nbColis || 0) + "<div class='cx-cell-sub cx-nowrap'>" + G.kg(e.poids) + "</div>";
            } },
            { key: "montant", title: "Montant", className: "num", sortValue: function (e) { return e.montants.total; }, render: function (e) {
                return "<span class='cx-nowrap cx-strong'>" + U.money(e.montants.total) + "</span>";
            } },
            { key: "paiement", title: "Paiement", sortValue: function (e) { return e.paiement.mode; }, render: function (e) {
                return "<span class='cx-badge cx-badge-" + (MODE_COULEUR[e.paiement.mode] || "grey") + " cx-no-dot'>" + U.esc(e.paiement.mode) + "</span>";
            }, searchValue: function (e) { return e.paiement.mode + " " + (e.paiement.reference || ""); } },
            { key: "statut", title: "Statut", sortValue: function (e) { return e.statut; }, render: function (e) {
                return G.statutBadge(e.statut) + (e.factureId ? "<div class='cx-cell-sub'><i class='fa fa-file-text-o'></i> Facturée</div>" : "");
            }, searchValue: function (e) { return (G.STATUTS[e.statut] || {}).label; } },
            { key: "guichetier", title: "Guichetier", render: function (e) { return U.esc(e.guichetier || "—"); } },
            { key: "act", title: "", sortable: false, width: "48px", render: actionsHtml, searchValue: function () { return ""; } }
        ],
        footer: function (rows) {
            var act = $.grep(rows, function (e) { return e.statut !== "ANNULEE"; }), nb = 0, poids = 0, mt = 0;
            $.each(act, function (_, e) { nb += e.nbColis || 0; poids += Number(e.poids) || 0; mt += e.montants.total; });
            return "<tr><td colspan='5'>Total · " + act.length + " expédition" + (act.length > 1 ? "s" : "") + (rows.length > act.length ? " <span class='cx-muted' style='font-weight:500'>(hors " + (rows.length - act.length) + " annulée" + (rows.length - act.length > 1 ? "s" : "") + ")</span>" : "") + "</td>" +
                "<td class='num'>" + nb + "<div class='cx-cell-sub'>" + G.kg(poids) + "</div></td><td class='num cx-nowrap'>" + U.money(mt) + "</td><td colspan='4'></td></tr>";
        },
        onRender: function (rows) { $("#l-count").text(rows.length + " expédition" + (rows.length > 1 ? "s" : "")); }
    });

    /* Vues : tableau | cartes | Kanban par étape du colis | calendrier des saisies */
    var ETAPES_G = [
        { code: "ENREGISTREE", label: "Enregistrées", color: "grey" }, { code: "GROUPEE", label: "Groupées", color: "purple" },
        { code: "EN_TRANSIT", label: "En transit", color: "blue" }, { code: "ARRIVEE", label: "Arrivées", color: "blue" },
        { code: "EN_INSTANCE", label: "En agence", color: "orange" }, { code: "EN_LIVRAISON", label: "En livraison", color: "orange" },
        { code: "LIVREE", label: "Livrées", color: "green" }, { code: "ANNULEE", label: "Annulées", color: "red" }
    ];
    function etapeG(e) { var et = e.etape || (e.statut === "LIVREE" ? "LIVREE" : e.statut === "ANNULEE" ? "ANNULEE" : "ENREGISTREE"); return et === "ECHEC" ? "EN_LIVRAISON" : et; }
    function couleurG(e) { var c = $.grep(ETAPES_G, function (x) { return x.code === etapeG(e); })[0]; return c ? c.color : "grey"; }
    function carteExp(e) {
        return "<div class='cx-vc-top'><span class='cx-vc-num'>" + U.esc(e.nRt) + "</span><span class='cx-badge cx-badge-" + couleurG(e) + "'>" + U.esc(($.grep(ETAPES_G, function (x) { return x.code === etapeG(e); })[0] || {}).label || "") + "</span></div>" +
            "<div class='cx-vc-l'><b>" + U.esc(G.villeNom(e.villeDep)) + "</b> <i class='fa fa-long-arrow-right cx-muted'></i> <b>" + U.esc(G.villeNom(e.villeDest) || e.paysDest || "") + "</b>" + (e.livraison && e.livraison.mode === "DOMICILE" ? " <i class='fa fa-home cx-muted' title='Livraison à domicile'></i>" : "") + "</div>" +
            "<div class='cx-vc-s'>" + U.esc((e.expediteurInfo || {}).nom || e.expediteur || "") + " → " + U.esc((e.destinataireInfo || {}).nom || e.destinataire || "") + "</div>" +
            "<div class='cx-vc-pied'><span>" + (e.nbColis || 1) + " colis · " + U.esc(G.kg(e.poids)) + " · <b>" + U.money(e.montants.total) + "</b></span><span class='cx-muted'>" + U.esc(U.toFr(e.dateExp)) + "</span></div>";
    }
    CX.vues.brancher(dt, {
        slot: "#vue-slot", cle: "guichet-exp", vues: ["table", "cartes", "kanban", "calendrier"],
        cartes: { carte: carteExp, vide: "Aucune expédition", icone: "fa-cube" },
        kanban: {
            colonnes: ETAPES_G, valeur: etapeG, carte: carteExp,
            entete: function (col, l) { var t = 0; $.each(l, function (_, e) { t += e.montants.total; }); return U.money(t); }
        },
        calendrier: {
            date: function (e) { return e.dateExp; }, max: 3,
            puce: function (e) { return "<span class='cx-cal-pt " + couleurG(e) + "'></span><b>" + U.esc(e.heure || "") + "</b> " + U.esc(CX.REF.villeCode(e.villeDest) || e.paysDest || "") + " · " + U.esc((e.destinataireInfo || {}).nom || e.destinataire || ""); }
        },
        onOuvrir: function (e) { location.href = "recu.html?id=" + e.id; }
    });

    /* =================================================================
       Indicateurs du jour + caisse
       ================================================================= */
    function kpi(label, valeur, foot, icon, color) {
        return "<div class='cx-kpi " + (color || "") + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + valeur + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    function majIndicateurs() {
        var jour = $.grep(toutes, function (e) { return e.dateExp === today && e.statut !== "ANNULEE"; });
        var miennes = $.grep(jour, function (e) { return e.guichetier === USER.nom; }).length;
        var comptant = 0, nComptant = 0, compte = 0, nCompte = 0, colis = 0, poids = 0;
        $.each(jour, function (_, e) {
            if (e.paiement.statut === "EN_COMPTE") { compte += e.montants.total; nCompte++; }
            else { comptant += e.montants.total; nComptant++; }
            colis += e.nbColis || 0; poids += Number(e.poids) || 0;
        });
        var annulees = $.grep(toutes, function (e) { return e.statut === "ANNULEE" && e.annulation && String(e.annulation.date).substr(0, 10) === today; }).length;
        $("#kpis").html([
            kpi("Saisies du jour", jour.length, miennes + " par vous" + (annulees ? " · " + annulees + " annulée" + (annulees > 1 ? "s" : "") : ""), "fa-cube"),
            kpi("Encaissé comptant du jour", U.fmt(comptant) + " <small>FCFA</small>", nComptant + " expédition" + (nComptant > 1 ? "s" : "") + " particulier" + (nComptant > 1 ? "s" : ""), "fa-money", "green"),
            kpi("En compte du jour", U.fmt(compte) + " <small>FCFA</small>", nCompte + " expédition" + (nCompte > 1 ? "s" : "") + " NATEX · facturé en fin de période", "fa-building-o", "purple"),
            kpi("Colis du jour", colis, G.kg(poids) + " taxable" + (poids > 1 ? "s" : ""), "fa-cubes", "orange")
        ].join(""));

        /* Caisse du guichetier connecté */
        var mes = $.grep(toutes, function (e) { return e.dateExp === today && e.guichetier === USER.nom; });
        var parMode = {}, total = 0, enCompte = 0, nEnCompte = 0, annul = 0, nAnnul = 0;
        $.each(mes, function (_, e) {
            if (e.statut === "ANNULEE") { if (e.paiement.statut === "PAYE") { annul += e.montants.total; nAnnul++; } return; }
            if (e.paiement.statut === "EN_COMPTE") { enCompte += e.montants.total; nEnCompte++; return; }
            var p = parMode[e.paiement.mode] = parMode[e.paiement.mode] || { n: 0, mt: 0, recu: 0, rendu: 0 };
            p.n++; p.mt += e.montants.total; p.recu += U.num(e.paiement.recu); p.rendu += U.num(e.paiement.rendu);
            total += e.montants.total;
        });
        $("#caisse-sub").text(USER.nom + " · " + U.toFrLong(today) + " · bureau " + G.titre(USER.agence));
        var lignes = $.map(REF.MODES_PAIEMENT, function (m) {
            var p = parMode[m];
            if (!p) return null;
            return "<tr><td>" + U.esc(m) + "<br><small>" + p.n + " expédition" + (p.n > 1 ? "s" : "") +
                (m === "Espèces" && p.rendu ? " · reçu " + U.money(p.recu) + ", rendu " + U.money(p.rendu) : "") + "</small></td><td class='num'>" + U.money(p.mt) + "</td></tr>";
        });
        $("#caisse-body").html(
            (lignes.length ? "<table>" + lignes.join("") +
                "<tr class='total'><td>Total encaissé</td><td class='num'>" + U.money(total) + "</td></tr>" +
                (nEnCompte ? "<tr class='gx-caisse-compte'><td>En compte (non encaissé)<br><small>" + nEnCompte + " expédition" + (nEnCompte > 1 ? "s" : "") + " NATEX</small></td><td class='num'>" + U.money(enCompte) + "</td></tr>" : "") +
                "</table>"
                : "<div class='cx-empty' style='padding:20px 10px'><i class='fa fa-inbox'></i><b>Aucun encaissement aujourd'hui</b>" +
                (nEnCompte ? nEnCompte + " expédition(s) en compte : " + U.money(enCompte) : "Les expéditions au comptant saisies aujourd'hui apparaîtront ici.") + "</div>") +
            (nAnnul ? "<div class='cx-note cx-note-warn'><i class='fa fa-ban'></i><div>" + nAnnul + " expédition" + (nAnnul > 1 ? "s" : "") + " annulée" + (nAnnul > 1 ? "s" : "") +
                " après encaissement : <b>" + U.money(annul) + "</b> à rembourser (non comptées).</div></div>" : "") +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm cx-btn-block' href='#' id='btn-mes-saisies' style='margin-top:10px'><i class='fa fa-filter'></i> Voir mes saisies du jour</a>");
        // TODO API : GET /guichet/caisse?date={today}&guichetier={id}  (arrêté de caisse côté serveur)
    }

    /* =================================================================
       Chargement
       ================================================================= */
    function charger() {
        // TODO API : GET /guichet/expeditions?du=&au=&bureau=&type=&client=&statut=&paiement=&q=  (pagination serveur)
        return CX.api.list("expeditions").done(function (rows) {
            toutes = $.map(rows, function (e) { return G.normaliser(e); });
            majIndicateurs();
            appliquer();
        });
    }

    /* =================================================================
       Actions
       ================================================================= */
    function parId(id) { return $.grep(toutes, function (e) { return String(e.id) === String(id); })[0]; }
    $("#dt-exp").on("click", "[data-noop]", function (ev) { ev.preventDefault(); ev.stopPropagation(); });
    $("#dt-exp").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var e = parId($(this).closest("tr").data("id")), act = $(this).data("act");
        if (!e) return;
        if (act === "corriger") window.location.href = "expedition-form.html?id=" + e.id;
        if (act === "wa") {
            var url = G.whatsapp(e, "EXPEDITEUR");
            if (url) window.open(url, "_blank");
            // TODO API : POST /guichet/expeditions/{id}/whatsapp
            CX.api.log("expeditions", e.id, "Reçu renvoyé par WhatsApp à l'expéditeur");
        }
        if (act === "annuler") {
            G.modaleAnnulation(e).done(function (maj) {
                U.toast("Expédition <b>" + U.esc(maj.nRt) + "</b> annulée" + (maj.nRtManLibere ? " · feuille " + U.esc(maj.nRtManLibere) + " libérée" : "") + ".", "success");
                charger();
            });
        }
    });
    /* Menus d'actions : positionnés en « fixed » (sinon rognés par .cx-table-wrap) */
    function placerMenu(dd) {
        var $m = $(dd).find(".dropdown-menu"), r = $(dd).find("[data-toggle='dropdown']")[0].getBoundingClientRect();
        var h = $m.outerHeight(), w = $m.outerWidth(), top = r.bottom + 4;
        if (top + h > window.innerHeight - 40 && r.top - h - 4 > 0) top = r.top - h - 4;
        $m.css({ position: "fixed", top: top, left: Math.max(8, r.right - w), right: "auto", bottom: "auto" });
    }
    $("#dt-exp").on("shown.bs.dropdown", ".dropdown", function () { placerMenu(this); });
    $("#dt-exp").on("hidden.bs.dropdown", ".dropdown", function () { $(this).find(".dropdown-menu").css({ position: "", top: "", left: "", right: "", bottom: "" }); });
    $(window).on("scroll resize", function () { $("#dt-exp .dropdown.open").each(function () { placerMenu(this); }); });

    /* Export CSV (lignes filtrées, toutes pages) */
    function exporterCsv() {
        var rows = dt.getFiltered();
        if (!rows.length) { U.toast("Aucune ligne à exporter.", "warning"); return; }
        function cell(v) { var s = v == null ? "" : String(v); return /[";\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }
        var entetes = ["N° LT", "N° LT manuel / feuille", "Date", "Heure", "Type d'expédition", "Ville départ", "Bureau départ", "Destination", "Bureau destination",
            "Remise", "Quartier", "Type de client", "Client", "Expéditeur", "Tél. expéditeur", "Destinataire", "Tél. destinataire", "Nb colis", "Poids taxable (kg)",
            "Contenu", "Transport", "Emballage", "Livraison", "Autres", "Montant total (FCFA)", "Paiement", "Référence", "Statut", "Facture", "Guichetier", "Motif d'annulation"];
        var lignes = [entetes.join(";")];
        $.each(rows, function (_, e) {
            lignes.push($.map([
                e.nRt, e.nRtMan || e.nRtManLibere || e.recuManuel || "", U.toFr(e.dateExp), e.heure, G.SERVICES[e.service].label, e.villeDep, e.bureauDep, dest(e), e.bureauDest,
                e.livraison.mode === "DOMICILE" ? "Domicile" : "Bureau", e.livraison.quartier, e.typeClient === "COMPTE" ? "En compte" : "Particulier",
                e.client ? e.client.raisonSociale : "", e.expediteurInfo.nom, G.telFmt(e.expediteurInfo.tel), e.destinataireInfo.nom, G.telFmt(e.destinataireInfo.tel),
                e.nbColis, String(e.poids || 0).replace(".", ","), e.contenu, e.montants.transport, e.montants.emballage, e.montants.livraison, e.montants.autres, e.montants.total,
                e.paiement.mode, e.paiement.reference || "", (G.STATUTS[e.statut] || {}).label || e.statut, e.factureId ? "Oui" : "Non", e.guichetier,
                e.annulation ? e.annulation.motif : ""
            ], function (v) { return [cell(v)]; }).join(";"));
        });
        var nom = "guichet-expeditions-" + today.replace(/-/g, "") + ".csv";
        // TODO API (option) : GET /guichet/expeditions/export.csv?filtres…
        var blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
        if (window.navigator && window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, nom); return; }
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = nom; document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        U.toast(rows.length + " expédition" + (rows.length > 1 ? "s" : "") + " exportée" + (rows.length > 1 ? "s" : "") + " (" + nom + ").", "info");
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#f-raccourcis").on("click", "button", function () { appliquerPeriode($(this).data("p")); appliquer(); });
    $("#f-du, #f-au").on("change", function () { $("#f-raccourcis button").removeClass("active"); appliquer(); });
    $("#f-bureau, #f-type, #f-client, #f-paiement").on("change", appliquer);
    $("#f-statut").on("change", function () { onglet = $(this).val() || ""; appliquer(); });
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab") || ""; appliquer(); });
    $("#q").on("input", U.debounce(appliquer, 160));
    $("#btn-reset").on("click", function () {
        $("#f-bureau, #f-type, #f-paiement").val(""); $("#f-client").val("").trigger("change.select2");
        $("#q").val(""); dt.setSearch(""); onglet = ""; appliquerPeriode("tout"); appliquer();
    });
    $("#btn-refresh").on("click", function () {
        var $b = $(this); U.busy($b, true);
        charger().always(function () { U.busy($b, false); U.toast("Liste actualisée.", "info"); });
    });
    $("#btn-export").on("click", exporterCsv);
    $("#gx-caisse").on("click", "#btn-mes-saisies", function (ev) {
        ev.preventDefault();
        appliquerPeriode("jour"); onglet = "";
        $("#q").val(USER.nom); dt.setSearch(USER.nom);
        appliquer();
    });

    /* Démarrage : ce mois-ci par défaut (le jeu de démo couvre les deux derniers mois) */
    appliquerPeriode(U.queryParam("periode") || "mois");
    charger();
});

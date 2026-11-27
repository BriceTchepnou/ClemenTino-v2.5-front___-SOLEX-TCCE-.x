/* =====================================================================
   Commercial · Suivi des factures (factures-suivi.html)
   ---------------------------------------------------------------------
   Indicateurs, onglets par statut (dont « En retard », calculé),
   filtres (recherche, client, période d'émission) et actions :
   voir / imprimer, émettre un brouillon, marquer envoyée (+ mailto),
   enregistrer un paiement, « Facture réglée » (paiement du solde en un
   clic), « Recalculer les montants » (CX.fac.recalculer), relancer
   (mailto + historique), annuler (libère les expéditions, qui
   redeviennent facturables).
   Paramètre d'URL : ?relance=ID ouvre directement la relance.
   Dépend de assets/pages/facturation.js (CX.fac).
   ===================================================================== */
$(function () {
    var U = CX.util, F = CX.fac, today = U.today();

    var clients = {};   // id -> client
    var factures = [];  // toutes les factures chargées
    var onglet = "TOUTES";

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function client(id) { return clients[id] || { raisonSociale: "Client #" + id, contacts: [] }; }

    /* Période par défaut : 12 mois glissants (du 1er du mois, il y a 11 mois) */
    function debut12Mois() {
        var d = U.firstOfMonth(today);
        for (var i = 0; i < 11; i++) d = U.firstOfMonth(U.addDays(d, -1));
        return d;
    }

    /* ------------------------------------------------------------------
       Filtres (client + période) : base des indicateurs et des compteurs
       ------------------------------------------------------------------ */
    function filtrees() {
        var cid = $("#f-client").val(), du = $("#f-du").val(), au = $("#f-au").val();
        return $.grep(factures, function (f) {
            if (cid && String(f.clientId) !== String(cid)) return false;
            if (du && f.dateEmission < du) return false;
            if (au && f.dateEmission > au) return false;
            return true;
        });
    }
    function dansOnglet(f, code) {
        if (code === "TOUTES") return true;
        if (code === "RETARD") return F.enRetard(f);
        return f.statut === code;
    }

    /* ------------------------------------------------------------------
       Indicateurs
       ------------------------------------------------------------------ */
    function kpi(label, value, foot, icon, color, tab) {
        return "<div class='cx-kpi clickable " + color + "' data-goto='" + tab + "'>" +
            "<div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div>" +
            "<div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    function majKpis(rows) {
        var facture = 0, nbF = 0, encaisse = 0, encours = 0, nbEnc = 0, echu = 0, nbEchu = 0, echu30 = 0;
        $.each(rows, function (_, f) {
            if (!F.active(f)) return;
            facture += U.round(f.montantTTC); nbF++;
            encaisse += F.paye(f);
            var r = F.reste(f);
            if (r > 0) { encours += r; nbEnc++; }
            if (F.enRetard(f)) { echu += r; nbEchu++; if (F.joursRetard(f) > 30) echu30 += r; }
        });
        var taux = facture ? Math.round(encaisse / facture * 100) : 0;
        $("#kpis").html([
            kpi("Facturé sur la période", U.fmt(facture) + " <small>FCFA</small>", pluriel(nbF, "facture") + " TTC (hors brouillons et annulées)", "fa-file-text-o", "", "TOUTES"),
            kpi("Encaissé", U.fmt(encaisse) + " <small>FCFA</small>", taux + " % du facturé", "fa-check-circle", "green", "PAYEE"),
            kpi("Encours", U.fmt(encours) + " <small>FCFA</small>", "Reste à encaisser sur " + pluriel(nbEnc, "facture"), "fa-hourglass-half", "purple", "TOUTES"),
            kpi("Échu", U.fmt(echu) + " <small>FCFA</small>", pluriel(nbEchu, "facture") + " en retard" + (echu30 ? " · " + U.money(echu30) + " à plus de 30 j" : ""), "fa-exclamation-triangle", "red", "RETARD")
        ].join(""));
        var du = $("#f-du").val(), au = $("#f-au").val();
        $("#h-periode").text(du || au ? "· émises " + (du ? "du " + U.toFr(du) : "") + (au ? " au " + U.toFr(au) : " à aujourd'hui") : "· toutes périodes");
    }
    $("#kpis").on("click", "[data-goto]", function () { choisirOnglet($(this).data("goto")); });

    /* ------------------------------------------------------------------
       Tableau
       ------------------------------------------------------------------ */
    function btn(act, icon, titre, cls) {
        return "<button type='button' class='cx-btn " + (cls || "cx-btn-ghost") + " cx-btn-xs' data-act='" + act +
            "' data-toggle='tooltip' title='" + U.esc(titre) + "'><i class='fa " + icon + "'></i></button>";
    }
    function actions(f) {
        var h = ["<a class='cx-btn cx-btn-ghost cx-btn-xs' href='facture.html?id=" + f.id + "' data-toggle='tooltip' title='Voir / imprimer'><i class='fa fa-eye'></i></a>"];
        if (f.statut === "BROUILLON") h.push(btn("emettre", "fa-check", "Émettre la facture", "cx-btn-soft"));
        if (F.active(f)) h.push(btn("envoyer", "fa-envelope-o", f.statut === "EMISE" ? "Marquer envoyée (ouvre la messagerie)" : "Renvoyer par e-mail"));
        if (F.peutPayer(f)) h.push(btn("paiement", "fa-money", "Enregistrer un paiement"));
        if (F.peutPayer(f)) h.push(btn("reglee", "fa-check-circle", "Facture réglée (paiement du solde en un clic)", "cx-btn-soft"));
        if (f.statut !== "ANNULEE" && f.statut !== "PAYEE") h.push(btn("recalculer", "fa-refresh", "Recalculer les montants"));
        if (F.peutPayer(f)) h.push(btn("relance", "fa-bell-o", "Relancer le client", F.enRetard(f) ? "cx-btn-danger" : "cx-btn-ghost"));
        if (f.statut !== "ANNULEE" && !(f.paiements && f.paiements.length)) h.push(btn("annuler", "fa-ban", "Annuler la facture", "cx-btn-danger"));
        return "<div class='fs-actions'>" + h.join("") + "</div>";
    }

    var dt = new CX.DataTable("#dt", {
        columns: [
            { key: "numero", title: "N° facture", render: function (f) {
                return "<a class='cx-strong cx-mono cx-nowrap' href='facture.html?id=" + f.id + "'>" + U.esc(f.numero) + "</a>" +
                    "<div class='cx-cell-sub'>" + pluriel((f.expeditionIds || []).length, "expédition") + "</div>";
            } },
            { key: "clientId", title: "Client", sortValue: function (f) { return client(f.clientId).raisonSociale; },
                searchValue: function (f) { return client(f.clientId).raisonSociale + " " + (client(f.clientId).code || ""); },
                render: function (f) {
                    var c = client(f.clientId);
                    return "<div class='cx-cell-main'>" + U.esc(c.raisonSociale) + "</div><div class='cx-cell-sub'>" + U.esc(c.code || "") + "</div>";
                } },
            { key: "periodeDu", title: "Période", render: function (f) {
                return "<span class='cx-nowrap'>" + U.toFr(f.periodeDu).substr(0, 5) + " → " + U.toFr(f.periodeAu) + "</span>";
            }, searchValue: function (f) { return U.toFr(f.periodeDu) + " " + U.toFr(f.periodeAu); } },
            { key: "dateEmission", title: "Émission", render: function (f) { return "<span class='cx-nowrap'>" + U.toFr(f.dateEmission) + "</span>"; },
                searchValue: function (f) { return U.toFr(f.dateEmission); } },
            { key: "dateEcheance", title: "Échéance", render: function (f) {
                var sub = "";
                if (F.enRetard(f)) sub = "<div class='cx-cell-sub fs-retard'>" + F.joursRetard(f) + " j de retard</div>";
                else if (F.peutPayer(f)) {
                    var j = U.daysBetween(today, f.dateEcheance);
                    sub = "<div class='cx-cell-sub'>" + (j === 0 ? "aujourd'hui" : "dans " + j + " j") + "</div>";
                }
                return "<span class='cx-nowrap'>" + U.toFr(f.dateEcheance) + "</span>" + sub;
            }, searchValue: function (f) { return U.toFr(f.dateEcheance); } },
            { key: "montantTTC", title: "Montant TTC", className: "num", render: function (f) {
                /* solde à payer différent du TTC : acompte IS retenu à la source et/ou acompte */
                return "<span class='cx-nowrap'>" + U.money(f.montantTTC) + "</span>" +
                    (F.aPayer(f) !== U.round(f.montantTTC) ? "<div class='cx-cell-sub cx-nowrap'>Solde " + U.money(F.aPayer(f)) + (f.montantIS ? " (IS retenu)" : "") + "</div>" : "");
            },
                searchValue: function (f) { return U.fmt(f.montantTTC) + " " + f.montantTTC; } },
            { key: "paye", title: "Payé", className: "num", sortValue: function (f) { return F.paye(f); }, searchValue: function () { return ""; },
                render: function (f) { var p = F.paye(f); return p ? "<span class='cx-nowrap'>" + U.money(p) + "</span>" : "<span class='cx-muted'>—</span>"; } },
            { key: "reste", title: "Reste", className: "num", sortValue: function (f) { return F.reste(f); }, searchValue: function () { return ""; },
                render: function (f) {
                    var r = F.reste(f);
                    if (f.statut === "ANNULEE") return "<span class='cx-muted'>—</span>";
                    return r ? "<span class='cx-strong cx-nowrap" + (F.enRetard(f) ? " fs-retard" : "") + "'>" + U.money(r) + "</span>" : "<span class='cx-muted'>0</span>";
                } },
            { key: "statut", title: "Statut", render: F.statutHtml, sortValue: function (f) { return f.statut; },
                searchValue: function (f) { return (CX.REF.STATUT_FACTURE[f.statut] || {}).label + (F.enRetard(f) ? " en retard" : ""); } },
            { key: "actions", title: "", sortable: false, className: "cx-right", render: actions, searchValue: function () { return ""; } }
        ],
        rows: [], pageSize: 25, sortKey: "dateEmission", sortDir: -1, searchInput: "#q",
        emptyText: "Aucune facture", emptyIcon: "fa-file-text-o",
        rowClass: function (f) { return f.statut === "ANNULEE" ? "cx-row-muted" : ""; },
        footer: function (rows) {
            var ttc = 0, paye = 0, reste = 0;
            $.each(rows, function (_, f) { if (f.statut === "ANNULEE") return; ttc += U.round(f.montantTTC); paye += F.paye(f); reste += F.reste(f); });
            return "<tr><td colspan='5'>Total · " + pluriel(rows.length, "facture") + " <span class='cx-muted' style='font-weight:500'>(hors annulées)</span></td>" +
                "<td class='num cx-nowrap'>" + U.money(ttc) + "</td><td class='num cx-nowrap'>" + U.money(paye) + "</td>" +
                "<td class='num cx-nowrap'>" + U.money(reste) + "</td><td colspan='2'></td></tr>";
        }
    });

    function rendre() {
        var rows = filtrees();
        majKpis(rows);
        $("#tabs [data-count]").each(function () {
            var code = $(this).data("count");
            $(this).text($.grep(rows, function (f) { return dansOnglet(f, code); }).length);
        });
        dt.setRows($.grep(rows, function (f) { return dansOnglet(f, onglet); }));
    }
    function choisirOnglet(code) {
        onglet = code;
        $("#tabs a").removeClass("active").filter("[data-tab='" + code + "']").addClass("active");
        rendre();
    }
    $("#tabs").on("click", "a", function () { choisirOnglet($(this).data("tab")); });

    /* Rechargement des factures depuis le serveur */
    function recharger() {
        // TODO API : GET /commercial/factures?client=&du=&au=  (avec paiements ; le statut « en retard » peut être calculé côté serveur)
        return CX.api.list("factures").done(function (list) { factures = list; rendre(); });
    }
    function facture(id) { return $.grep(factures, function (f) { return String(f.id) === String(id); })[0]; }

    /* ------------------------------------------------------------------
       Actions en ligne
       ------------------------------------------------------------------ */
    $("#dt").on("click", "[data-act]", function () {
        var f = facture($(this).closest("tr").data("id"));
        if (!f) return;
        $(this).tooltip("hide");
        var act = $(this).data("act");
        if (act === "emettre") emettre(f);
        else if (act === "envoyer") F.marquerEnvoyee(f, client(f.clientId)).done(recharger);
        else if (act === "paiement") F.ouvrirPaiement(f, recharger);
        else if (act === "reglee") F.marquerReglee(f).done(recharger);
        else if (act === "recalculer") F.recalculer(f).done(recharger);
        else if (act === "relance") ouvrirRelance(f);
        else if (act === "annuler") annuler(f);
    });

    /* Émission d'un brouillon : date d'émission = aujourd'hui, échéance recalculée */
    function emettre(f) {
        var c = client(f.clientId), delai = c.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS;
        var dateEm = f.dateEmission > today ? f.dateEmission : today;
        U.confirm({
            title: "Émettre la facture " + f.numero,
            message: "<p>La facture sera émise le <b>" + U.toFrLong(dateEm) + "</b>, échéance au <b>" + U.toFrLong(U.addDays(dateEm, delai)) +
                "</b> (" + delai + " jours).</p><p>Montant : <b>" + U.money(f.montantTTC) + " TTC</b> - " + U.esc(c.raisonSociale) + ".</p>" +
                "<p class='cx-muted'>Une fois émise, la facture n'est plus modifiable : elle ne peut qu'être annulée.</p>",
            okText: "Émettre", okClass: "cx-btn-primary"
        }).done(function () {
            var maj = $.extend(true, {}, f, { statut: "EMISE", dateEmission: dateEm, dateEcheance: U.addDays(dateEm, delai) });
            // TODO API : POST /commercial/factures/{id}/emettre
            CX.api.save("factures", maj).then(function () { return CX.api.log("factures", f.id, "Facture émise"); })
                .done(function () { U.toast("Facture " + U.esc(f.numero) + " émise.", "success"); recharger(); });
        });
    }

    /* Annulation : libère les expéditions (factureId = null) */
    function annuler(f) {
        var n = (f.expeditionIds || []).length;
        U.confirm({
            title: "Annuler la facture " + f.numero,
            message: "<p>La facture <b>" + U.esc(f.numero) + "</b> (" + U.money(f.montantTTC) + " TTC, " + U.esc(client(f.clientId).raisonSociale) +
                ") sera annulée.</p><p>Ses <b>" + pluriel(n, "expédition") + "</b> redeviendront disponibles dans « Émettre une facture ».</p>" +
                (F.active(f) ? "<div class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><div>Si la facture a déjà été transmise au client, " +
                    "prévenez-le de l'annulation.</div></div>" : ""),
            okText: "Annuler la facture", okClass: "cx-btn-danger", cancelText: "Conserver"
        }).done(function () {
            var maj = $.extend(true, {}, f, { statut: "ANNULEE", dateAnnulation: today });
            // TODO API : POST /commercial/factures/{id}/annuler  (libère les expéditions côté serveur, dans la même transaction)
            CX.api.save("factures", maj).then(function () {
                return CX.api.patchMany("expeditions", $.map(f.expeditionIds || [], Number), { factureId: null });
            }).then(function () {
                return CX.api.log("factures", f.id, "Facture annulée - " + pluriel(n, "expédition") + " libérée" + (n > 1 ? "s" : ""));
            }).done(function () { U.toast("Facture " + U.esc(f.numero) + " annulée.", "success"); recharger(); });
        });
    }

    /* ------------------------------------------------------------------
       Relance
       ------------------------------------------------------------------ */
    var relanceId = null;
    function texteRelance(f, c) {
        var S = CX.CONFIG.SOCIETE, r = F.reste(f), partiel = r < U.round(f.montantTTC);
        var retard = F.joursRetard(f);
        return "Bonjour " + F.contactClient(c) + ",\n\n" +
            "Sauf erreur ou omission de notre part, notre facture n° " + f.numero + " du " + U.toFr(f.dateEmission) +
            ", d'un montant de " + U.money(f.montantTTC) + " TTC (expéditions du " + U.toFr(f.periodeDu) + " au " + U.toFr(f.periodeAu) + "), " +
            (retard
                ? "échue depuis le " + U.toFr(f.dateEcheance) + " (" + retard + " jours de retard), reste impayée" + (partiel ? " à hauteur de " + U.money(r) : "") + ".\n\n"
                : "arrive à échéance le " + U.toFr(f.dateEcheance) + ". Le montant restant dû à ce jour est de " + U.money(r) + ".\n\n") +
            "Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais :\n" +
            "- par virement : " + S.banque + "\n" +
            "- ou par chèque à l'ordre de " + S.nom + ".\n\n" +
            "Si votre règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message et de nous en communiquer la référence.\n\n" +
            "Cordialement,\n" + CX.CONFIG.USER.nom + "\nService facturation - " + S.nom + "\n" + S.tel + " · " + S.email;
    }
    function ouvrirRelance(f) {
        if (!F.peutPayer(f)) { U.toast("La facture " + U.esc(f.numero) + " n'a pas de reste à payer : pas de relance possible.", "info"); return; }
        var c = client(f.clientId);
        relanceId = f.id;
        var retard = F.joursRetard(f);
        $("#r-resume").html("<i class='fa fa-exclamation-triangle'></i><div><b>" + U.esc(f.numero) + "</b> · " + U.esc(c.raisonSociale) +
            "<br>Reste à payer : <b>" + U.money(F.reste(f)) + "</b> · échéance " + U.toFr(f.dateEcheance) +
            (retard ? " · <b>" + retard + " j de retard</b>" : "") + "</div>");
        $("#r-to").val(F.emailClient(c));
        $("#r-objet").val((retard ? "Relance - " : "Rappel - ") + "facture " + f.numero + " (échéance " + U.toFr(f.dateEcheance) + ")");
        $("#r-texte").val(texteRelance(f, c));
        var prec = $.grep(f.historique || [], function (h) { return /relance/i.test(h.action); });
        $("#r-historique").html(prec.length ? $.map(prec, function (h) {
            return "<div><i class='fa fa-bell-o'></i> " + U.toFr(h.date) + " - " + U.esc(h.action) + " (" + U.esc(h.user) + ")</div>";
        }).join("") : "Aucune relance pour cette facture.");
        $("#m-relance").modal("show");
    }
    $("#r-ok").on("click", function () {
        var f = facture(relanceId);
        if (!f) return;
        var to = $.trim($("#r-to").val());
        if (!to || to.indexOf("@") < 1) { U.toast("Indiquez une adresse e-mail valide.", "warning"); $("#r-to").focus(); return; }
        window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent($("#r-objet").val()) +
            "&body=" + encodeURIComponent($("#r-texte").val());
        var n = $.grep(f.historique || [], function (h) { return /relance/i.test(h.action); }).length + 1;
        var maj = $.extend(true, {}, f, { nbRelances: n, derniereRelance: today });
        // TODO API : POST /commercial/factures/{id}/relances  { destinataire, objet, message }  (envoi par Symfony Mailer + trace)
        CX.api.save("factures", maj).then(function () {
            return CX.api.log("factures", f.id, "Relance n° " + n + " envoyée à " + to);
        }).done(function () {
            $("#m-relance").modal("hide");
            U.toast("Relance n° " + n + " tracée pour la facture " + U.esc(f.numero) + ".", "success");
            recharger();
        });
    });

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */
    // TODO API : GET /commercial/clients (ou injection Twig)
    CX.api.list("clients").done(function (list) {
        list.sort(function (a, b) { return a.raisonSociale > b.raisonSociale ? 1 : -1; });
        $.each(list, function (_, c) { clients[c.id] = c; });
        $("#f-client").append($.map(list, function (c) {
            return "<option value='" + c.id + "'>" + U.esc(c.raisonSociale) + "</option>";
        }).join("")).select2({
            width: "100%", allowClear: true, placeholder: "Tous les clients",
            language: { noResults: function () { return "Aucun client trouvé"; } }
        });
        $("#f-du").val(debut12Mois());

        $("#f-client, #f-du, #f-au").on("change", rendre);
        $("#btn-reinit").on("click", function () {
            $("#f-client").val("").trigger("change.select2");
            $("#f-du").val(debut12Mois()); $("#f-au").val("");
            $("#q").val(""); dt.setSearch("");
            choisirOnglet("TOUTES");
        });

        recharger().done(function () {
            var rid = U.queryParam("relance");
            if (rid) {
                var f = facture(rid);
                if (f) ouvrirRelance(f); else U.toast("Facture introuvable (#" + U.esc(rid) + ").", "error");
            }
        });
    });
});

/* =====================================================================
   Commercial · Liste des cotations (cotations-liste.html)
   ---------------------------------------------------------------------
   - Onglets par étape du circuit, avec compteurs (tenant compte des filtres)
   - Filtres : recherche, client (Select2), type, période de création
   - Tableau CX.DataTable + menu d'actions selon le statut
   - Modale « Nouvelle cotation » (ouverte aussi par l'URL #nouvelle)

   Circuit d'une cotation :
     ENREGISTREE -> SOUMISE (au responsable) -> VALIDEE (en interne)
       -> EN_ATTENTE (envoyée au client) -> ACCEPTEE | REJETEE
     ANNULEE possible à tout moment avant l'acceptation.
   Chaque action est tracée dans l'historique (CX.api.log).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, today = U.today();

    /* Onglets -> statuts couverts */
    var ONGLETS = {
        ENREGISTREES: ["ENREGISTREE"],
        SOUMISES: ["SOUMISE"],
        VALIDEES: ["VALIDEE", "ACCEPTEE"],
        EN_ATTENTE: ["EN_ATTENTE"],
        REJETEES: ["REJETEE", "ANNULEE"],
        TOUTES: null
    };
    /* Statuts à partir desquels on peut encore annuler */
    var ANNULABLES = ["ENREGISTREE", "SOUMISE", "VALIDEE", "EN_ATTENTE"];

    var state = { tab: "ENREGISTREES", cotations: [], clients: {} };
    var dt = null;

    /* ------------------------------------------------------------------
       Chargement
       ------------------------------------------------------------------ */
    function charger() {
        // TODO API : GET /commercial/cotations (+ GET /commercial/clients pour les libellés)
        return $.when(CX.api.list("cotations"), CX.api.list("clients")).done(function (cots, clis) {
            state.cotations = cots;
            state.clients = {};
            $.each(clis, function (_, c) { state.clients[c.id] = c; });
            rafraichir();
        });
    }

    /* Applique les filtres (hors onglet et hors recherche, gérée par la DataTable) */
    function filtrees() {
        var cid = $("#fClient").val(), type = $("#fType").val(), du = $("#fDu").val(), au = $("#fAu").val();
        return $.grep(state.cotations, function (c) {
            if (cid && String(c.clientId) !== String(cid)) return false;
            if (type && c.type !== type) return false;
            if (du && c.dateCreation < du) return false;
            if (au && c.dateCreation > au) return false;
            return true;
        });
    }
    function dansOnglet(c, tab) {
        var st = ONGLETS[tab];
        return !st || $.inArray(c.statut, st) >= 0;
    }

    function rafraichir() {
        var base = filtrees();
        /* compteurs */
        $.each(ONGLETS, function (tab) {
            $("[data-count='" + tab + "']").text($.grep(base, function (c) { return dansOnglet(c, tab); }).length);
        });
        $("#tabs a").removeClass("active").filter("[data-tab='" + state.tab + "']").addClass("active");
        var rows = $.grep(base, function (c) { return dansOnglet(c, state.tab); });
        dt.setRows(rows);
        var enCours = $.grep(state.cotations, function (c) { return $.inArray(c.statut, ANNULABLES) >= 0; }).length;
        $("#l-resume").text("· " + state.cotations.length + " cotation(s), " + enCours + " en cours");
    }

    /* ------------------------------------------------------------------
       Tableau
       ------------------------------------------------------------------ */
    function nomClient(c) { var cl = state.clients[c.clientId]; return cl ? cl.raisonSociale : "—"; }
    function estExpiree(c) { return c.statut === "EN_ATTENTE" && c.dateValidite && c.dateValidite < today; }

    dt = new CX.DataTable("#tCotations", {
        searchInput: "#q",
        pageSize: 25,
        sortKey: "numero", sortDir: -1,
        emptyText: "Aucune cotation dans cet onglet", emptyIcon: "fa-calculator",
        rowClass: function (c) { return c.statut === "ANNULEE" ? "cx-row-muted" : ""; },
        columns: [
            { key: "id", title: "#", className: "cx-muted", width: "46px" },
            {
                key: "numero", title: "N° cota.",
                render: function (c) {
                    return "<a class='cx-strong cx-mono' href='cotation-document.html?id=" + c.id + "'>" + U.esc(c.numero) + "</a>";
                }
            },
            {
                key: "nom", title: "Nom",
                render: function (c) {
                    return "<div class='cx-cell-main'>" + U.esc(c.nom) + "</div>" +
                        (c.details && c.details.convertie ? "<span class='cx-tag cx-tag-dark'><i class='fa fa-exchange'></i> Convertie</span>" : "");
                }
            },
            {
                key: "clientId", title: "Client",
                render: function (c) { return U.esc(nomClient(c)); },
                sortValue: nomClient, searchValue: nomClient
            },
            {
                key: "description", title: "Description",
                render: function (c) {
                    var t = c.description || "";
                    return "<div class='cl-desc cx-muted' title='" + U.esc(t) + "'>" + U.esc(t || "—") + "</div>";
                }
            },
            {
                key: "montantTTC", title: "Solde à payer", className: "num",
                render: function (c) {
                    if (c.type === "TARIFAIRE") return "<span class='cx-muted'>Grille</span>";
                    return "<span class='cx-strong'>" + U.money(c.montantTTC) + "</span><div class='cx-cell-sub'>" + U.money(c.montantHT) + " HT</div>";
                }
            },
            {
                key: "dateSoumission", title: "Soumis le",
                render: function (c) { return c.dateSoumission ? U.toFr(c.dateSoumission) : "<span class='cx-muted'>—</span>"; }
            },
            {
                key: "creePar", title: "Créé par",
                render: function (c) { return U.esc(c.creePar) + "<div class='cx-cell-sub'>le " + U.toFr(c.dateCreation) + "</div>"; }
            },
            {
                key: "type", title: "Type",
                render: function (c) {
                    var t = REF.TYPE_COTATION[c.type] || { label: c.type, icon: "fa-file-o" };
                    return "<span class='cl-type-cell'><i class='fa " + t.icon + "'></i>" + U.esc(t.label) + "</span>";
                },
                searchValue: function (c) { return (REF.TYPE_COTATION[c.type] || {}).label || c.type; }
            },
            {
                key: "statut", title: "Statut",
                render: function (c) {
                    return REF.badge(REF.STATUT_COTATION, c.statut) +
                        (estExpiree(c) ? "<div class='cl-expire'><i class='fa fa-clock-o'></i> Validité dépassée</div>" : "") +
                        (c.statut === "REJETEE" && c.motifRejet ? "<div class='cx-cell-sub' title='" + U.esc(c.motifRejet) + "'>" + U.esc(c.motifRejet.substr(0, 40)) + (c.motifRejet.length > 40 ? "…" : "") + "</div>" : "");
                },
                searchValue: function (c) { return (REF.STATUT_COTATION[c.statut] || {}).label || c.statut; }
            },
            {
                key: "actions", title: "", sortable: false, className: "cx-right",
                render: function (c) {
                    return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-menu='" + c.id + "'>Actions <i class='fa fa-angle-down'></i></button>";
                }
            }
        ],
        footer: function (rows) {
            var ttc = 0; $.each(rows, function (_, c) { if (c.type !== "TARIFAIRE" && c.statut !== "ANNULEE") ttc += c.montantTTC || 0; });
            return "<tr><td colspan='5'>" + rows.length + " cotation(s)</td><td class='num'>" + U.money(ttc) + "</td><td colspan='5' class='cx-muted' style='font-weight:500'>Total TTC hors cotations tarifaires et annulées</td></tr>";
        }
    });

    /* ------------------------------------------------------------------
       Filtres et onglets
       ------------------------------------------------------------------ */
    $("#tabs").on("click", "a", function () { state.tab = $(this).data("tab"); rafraichir(); });
    $("#fType, #fDu, #fAu").on("change", rafraichir);

    $.each(CX.api.clientsSync(), function (_, c) {
        $("#fClient").append($("<option>").val(c.id).text(c.raisonSociale + (c.code ? " · " + c.code : "")));
    });
    $("#fClient").select2({ width: "100%", placeholder: "Tous les clients", allowClear: true }).on("change", rafraichir);

    $("#fReset").on("click", function () {
        $("#q").val(""); dt.setSearch("");
        $("#fType, #fDu, #fAu").val("");
        $("#fClient").val("").trigger("change.select2");
        rafraichir();
    });

    /* Filtre client transmis par l'URL (ex. depuis la fiche client) */
    if (U.queryParam("client")) { $("#fClient").val(U.queryParam("client")).trigger("change.select2"); state.tab = "TOUTES"; }

    /* ------------------------------------------------------------------
       Menu d'actions (positionné dans <body> pour ne pas être rogné)
       ------------------------------------------------------------------ */
    function item(action, icon, label, cls) {
        return "<li><a data-action='" + action + "' class='" + (cls || "") + "'><i class='fa " + icon + "'></i> " + label + "</a></li>";
    }
    function menuHtml(c) {
        var h = [], s = c.statut, conv = c.details && c.details.convertie;
        h.push("<li class='dropdown-header'>" + U.esc(c.numero) + " · " + U.esc((REF.STATUT_COTATION[s] || {}).label || s) + "</li>");
        if (s === "ENREGISTREE") {
            h.push(item("modifier", "fa-pencil", "Modifier"));
            h.push(item("soumettre", "fa-paper-plane-o", "Soumettre au responsable", "cl-primary"));
        }
        if (s === "SOUMISE") {
            h.push(item("valider", "fa-check", "Valider la cotation", "cl-primary"));
            h.push(item("rejeter", "fa-times", "Rejeter…"));
        }
        if (s === "VALIDEE") h.push(item("envoyer", "fa-envelope-o", "Envoyer au client", "cl-primary"));
        if (s === "EN_ATTENTE") {
            h.push(item("accepter", "fa-thumbs-o-up", "Marquer acceptée par le client", "cl-primary"));
            h.push(item("refuser", "fa-thumbs-o-down", "Marquer refusée par le client…"));
            h.push(item("envoyer", "fa-envelope-o", "Renvoyer / relancer le client"));
        }
        if (s === "ACCEPTEE" && !conv) {
            var lib = c.type === "FRET" ? "Convertir en mise à disposition" : c.type === "TARIFAIRE" ? "Appliquer la grille au compte client" : "Convertir en expédition";
            h.push(item("convertir", "fa-exchange", lib, "cl-primary"));
        }
        h.push("<li class='divider'></li>");
        h.push(item("voir", "fa-file-text-o", "Voir le devis"));
        h.push(item("imprimer", "fa-print", "Imprimer le devis"));
        h.push(item("dupliquer", "fa-files-o", "Dupliquer"));
        h.push(item("historique", "fa-history", "Historique"));
        if ($.inArray(s, ANNULABLES) >= 0) {
            h.push("<li class='divider'></li>");
            h.push(item("annuler", "fa-ban", "Annuler la cotation…", "text-danger"));
        }
        return h.join("");
    }
    function fermerMenu() { $(".cl-menu").remove(); }

    $("#tCotations").on("click", "[data-menu]", function (e) {
        e.stopPropagation();
        var $b = $(this), id = parseInt($b.data("menu"), 10);
        var dejaOuvert = $(".cl-menu").data("id") === id;
        fermerMenu();
        if (dejaOuvert) return;
        var c = trouver(id); if (!c) return;
        var $m = $("<ul class='dropdown-menu cl-menu'></ul>").html(menuHtml(c)).data("id", id).appendTo("body");
        var off = $b.offset(), w = $m.outerWidth(), h = $m.outerHeight();
        var top = off.top + $b.outerHeight() + 4;
        /* ouvre vers le haut si le menu dépasse le bas de la fenêtre */
        if (top + h > $(window).scrollTop() + $(window).height() - 40) top = Math.max($(window).scrollTop() + 10, off.top - h - 4);
        $m.css({ top: top, left: Math.max(10, off.left + $b.outerWidth() - w) });
    });
    $(document).on("click", function (e) { if (!$(e.target).closest(".cl-menu").length) fermerMenu(); });
    $(document).on("keydown", function (e) { if (e.which === 27) fermerMenu(); });
    $(window).on("resize", fermerMenu);

    $(document).on("click", ".cl-menu [data-action]", function () {
        var id = $(".cl-menu").data("id"), action = $(this).data("action");
        fermerMenu();
        var c = trouver(id);
        if (c && ACTIONS[action]) ACTIONS[action](c);
    });

    function trouver(id) { return $.grep(state.cotations, function (c) { return c.id == id; })[0] || null; }

    /* Change le statut + trace dans l'historique, puis recharge */
    function changerStatut(c, patch, libelleHisto, msg) {
        // TODO API : POST /commercial/cotations/{id}/statut  { statut, motif } (la route trace l'historique)
        return CX.api.patchMany("cotations", [c.id], patch)
            .then(function () { return CX.api.log("cotations", c.id, libelleHisto); })
            .done(function () { U.toast(msg); charger(); });
    }

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */
    var ACTIONS = {
        voir: function (c) { location.href = "cotation-document.html?id=" + c.id; },
        imprimer: function (c) { location.href = "cotation-document.html?id=" + c.id + "&print=1"; },
        modifier: function (c) { location.href = "cotation-form.html?id=" + c.id; },

        soumettre: function (c) {
            U.confirm({
                title: "Soumettre la cotation",
                message: "La cotation <b>" + U.esc(c.numero) + "</b> sera transmise au responsable pour validation. Elle ne sera plus modifiable.",
                okText: "Soumettre"
            }).done(function () {
                changerStatut(c, { statut: "SOUMISE", dateSoumission: today }, "Soumise au responsable pour validation",
                    "Cotation " + c.numero + " soumise au responsable.");
            });
        },

        valider: function (c) {
            U.confirm({
                title: "Valider la cotation",
                message: "Valider la cotation <b>" + U.esc(c.numero) + "</b> (" + U.esc(nomClient(c)) + ")" +
                    (c.type !== "TARIFAIRE" ? " pour un montant de <b>" + U.money(c.montantTTC) + " TTC</b>" : "") +
                    " ?<br><span class='cx-muted'>Elle pourra ensuite être envoyée au client.</span>",
                okText: "Valider", okClass: "cx-btn-success"
            }).done(function () {
                changerStatut(c, { statut: "VALIDEE", dateValidation: today, validePar: CX.CONFIG.USER.nom },
                    "Validée en interne", "Cotation " + c.numero + " validée.");
            });
        },

        rejeter: function (c) {
            demanderMotif({
                titre: "Rejeter la cotation", ok: "Rejeter",
                intro: "La cotation <b>" + U.esc(c.numero) + "</b> sera rejetée et renvoyée à son auteur.",
                suggestions: ["Tarif hors grille", "Informations incomplètes", "Remise non autorisée", "Client non solvable"]
            }).done(function (motif) {
                changerStatut(c, { statut: "REJETEE", motifRejet: motif }, "Rejetée en interne : " + motif, "Cotation " + c.numero + " rejetée.");
            });
        },

        envoyer: function (c) {
            var cl = state.clients[c.clientId], email = CX.cot.emailClient(cl);
            var lien = location.href.replace(/cotations-liste\.html.*$/, "cotation-document.html?id=" + c.id);
            var contact = cl && cl.contacts && cl.contacts[0] && cl.contacts[0].nom ? cl.contacts[0].nom : "Madame, Monsieur";
            var corps = "Bonjour " + contact + ",\n\n" +
                "Veuillez trouver ci-joint notre proposition commerciale n° " + c.numero + " (" + c.nom + ")" +
                (c.type !== "TARIFAIRE" ? ", d'un montant de " + U.money(c.montantTTC) + " TTC" : "") + ".\n" +
                "Cette offre est valable jusqu'au " + U.toFr(c.dateValidite) + ".\n\n" +
                "Consulter le devis : " + lien + "\n\n" +
                "Pour l'accepter, merci de nous retourner le devis revêtu de la mention « Bon pour accord », daté, signé et cacheté.\n\n" +
                "Cordialement,\n" + CX.CONFIG.USER.nom + "\n" + CX.CONFIG.SOCIETE.nom + " - " + CX.CONFIG.SOCIETE.tel;
            var mailto = "mailto:" + encodeURIComponent(email) +
                "?subject=" + encodeURIComponent("Devis " + c.numero + " - " + CX.CONFIG.SOCIETE.nom) +
                "&body=" + encodeURIComponent(corps);
            var relance = c.statut === "EN_ATTENTE";
            U.confirm({
                title: relance ? "Relancer le client" : "Envoyer au client",
                message: "Votre messagerie va s'ouvrir avec un e-mail pré-rempli pour <b>" + U.esc(nomClient(c)) + "</b>" +
                    (email ? " (<span class='cx-mono'>" + U.esc(email) + "</span>)" : " <span class='cx-error-text'>(aucune adresse e-mail renseignée sur la fiche client)</span>") +
                    ".<br>Pensez à joindre le devis en PDF (bouton « Télécharger en PDF » du devis)." +
                    (relance ? "" : "<br><br>La cotation passera au statut <b>En attente client</b>."),
                okText: relance ? "Ouvrir la messagerie" : "Ouvrir la messagerie et marquer envoyée"
            }).done(function () {
                // TODO API : POST /commercial/cotations/{id}/envoyer (envoi serveur avec PDF joint, à préférer au mailto)
                window.location.href = mailto;
                if (relance) {
                    CX.api.log("cotations", c.id, "Relance envoyée au client" + (email ? " (" + email + ")" : "")).done(function () {
                        U.toast("Relance tracée dans l'historique.", "info"); charger();
                    });
                } else {
                    changerStatut(c, { statut: "EN_ATTENTE", dateEnvoi: today }, "Envoyée au client" + (email ? " (" + email + ")" : ""),
                        "Cotation " + c.numero + " envoyée au client.");
                }
            });
        },

        accepter: function (c) {
            U.confirm({
                title: "Acceptation du client",
                message: "Confirmez-vous que <b>" + U.esc(nomClient(c)) + "</b> a accepté la cotation <b>" + U.esc(c.numero) + "</b> ?" +
                    (estExpiree(c) ? "<div class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><div>La date de validité (" + U.toFr(c.dateValidite) + ") est dépassée.</div></div>" : ""),
                okText: "Marquer acceptée", okClass: "cx-btn-success"
            }).done(function () {
                changerStatut(c, { statut: "ACCEPTEE", dateAcceptation: today }, "Acceptée par le client", "Cotation " + c.numero + " acceptée par le client.");
            });
        },

        refuser: function (c) {
            demanderMotif({
                titre: "Refus du client", ok: "Marquer refusée",
                intro: "Indiquez pourquoi <b>" + U.esc(nomClient(c)) + "</b> a refusé la cotation <b>" + U.esc(c.numero) + "</b>.",
                suggestions: ["Tarif jugé trop élevé", "Délai trop long", "Offre concurrente retenue", "Besoin annulé par le client"]
            }).done(function (motif) {
                changerStatut(c, { statut: "REJETEE", motifRejet: motif }, "Refusée par le client : " + motif, "Cotation " + c.numero + " marquée refusée.");
            });
        },

        convertir: function (c) {
            var quoi = c.type === "FRET" ? "un ordre de mise à disposition" : c.type === "TARIFAIRE" ? "une grille tarifaire du compte client" : "une expédition (lettre de transport)";
            U.confirm({
                title: "Convertir la cotation",
                message: "La cotation <b>" + U.esc(c.numero) + "</b> sera transformée en " + quoi + ".<br>" +
                    "<span class='cx-muted'>Le module Guichet / Exploitation reprendra les informations (trajet, colis, expéditeur, destinataire, montant).</span>",
                okText: "Convertir"
            }).done(function () {
                // TODO API : POST /commercial/cotations/{id}/convertir  -> crée l'expédition (Guichet) et renvoie son n° de LT
                var details = $.extend({}, c.details, { convertie: true, dateConversion: today });
                CX.api.patchMany("cotations", [c.id], { details: details })
                    .then(function () { return CX.api.log("cotations", c.id, "Convertie en " + quoi); })
                    .done(function () {
                        U.toast("Cotation " + c.numero + " convertie. La création de l'expédition se fait dans le module Guichet (hors maquette).", "info");
                        charger();
                    });
            });
        },

        dupliquer: function (c) {
            var copie = JSON.parse(JSON.stringify(c));
            delete copie.id; delete copie.numero;
            delete copie.dateValidation; delete copie.validePar; delete copie.dateEnvoi; delete copie.dateAcceptation;
            if (copie.details) { delete copie.details.convertie; delete copie.details.dateConversion; }
            $.extend(copie, {
                nom: "Copie de " + c.nom, statut: "ENREGISTREE", dateCreation: today, dateSoumission: null,
                dateValidite: U.addDays(today, CX.CONFIG.VALIDITE_COTATION_JOURS), creePar: CX.CONFIG.USER.nom,
                motifRejet: "", historique: []
            });
            // TODO API : POST /commercial/cotations/{id}/dupliquer
            CX.api.save("cotations", copie)
                .then(function (n) { copie = n; return CX.api.log("cotations", n.id, "Créée par duplication de " + c.numero); })
                .done(function () {
                    U.toast("Cotation dupliquée : <b>" + U.esc(copie.numero) + "</b> · <a href='cotation-form.html?id=" + copie.id + "' style='color:#93c5fd'>Modifier</a>");
                    state.tab = "ENREGISTREES";
                    charger();
                });
        },

        annuler: function (c) {
            demanderMotif({
                titre: "Annuler la cotation", ok: "Annuler la cotation",
                intro: "La cotation <b>" + U.esc(c.numero) + "</b> sera annulée. Cette action est définitive (vous pourrez la dupliquer).",
                suggestions: ["Doublon", "Erreur de saisie", "Demande retirée par le client"]
            }).done(function (motif) {
                changerStatut(c, { statut: "ANNULEE", motifRejet: motif }, "Annulée : " + motif, "Cotation " + c.numero + " annulée.");
            });
        },

        historique: function (c) {
            $("#histoNumero").text(c.numero);
            $("#histoListe").html($.map(c.historique || [], function (h) {
                return "<li><div class='cx-tl-date'>" + U.toFr(h.date) + " · " + U.esc(h.user) + "</div><div class='cx-tl-text'>" + U.esc(h.action) + "</div></li>";
            }).join("") || "<li><div class='cx-tl-text cx-muted'>Aucun évènement</div></li>");
            $("#modalHisto").modal("show");
        }
    };

    /* ------------------------------------------------------------------
       Modale « motif » -> promesse résolue avec le motif saisi
       ------------------------------------------------------------------ */
    function demanderMotif(o) {
        var dfd = $.Deferred(), $m = $("#modalMotif");
        $("#motifTitre").text(o.titre);
        $("#motifIntro").html(o.intro);
        $("#btnMotifOk").text(o.ok);
        $("#motifTexte").val("");
        U.showErrors("#motifForm", []);
        $("#motifSuggestions").html($.map(o.suggestions || [], function (s) { return "<a data-sugg>" + U.esc(s) + "</a>"; }).join(""));
        $("#btnMotifOk").off("click").on("click", function () {
            var motif = $.trim($("#motifTexte").val());
            if (motif.length < 3) { U.showErrors("#motifForm", [{ field: "motif", message: "Le motif est obligatoire." }]); return; }
            dfd.resolve(motif);
            $m.modal("hide");
        });
        $m.off("hidden.bs.modal.motif").on("hidden.bs.modal.motif", function () { if (dfd.state() === "pending") dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }
    $("#motifSuggestions").on("click", "[data-sugg]", function () { $("#motifTexte").val($(this).text()).focus(); });
    $("#modalMotif").on("shown.bs.modal", function () { $("#motifTexte").focus(); });

    /* ------------------------------------------------------------------
       Modale « Nouvelle cotation »
       ------------------------------------------------------------------ */
    function ouvrirNouvelle() {
        $("input[name='typeCotation']").prop("checked", false);
        $("#btnContinuer").prop("disabled", true);
        var cid = $("#fClient").val(), cl = cid ? state.clients[cid] : null;
        $("#nvClientInfo").html(cl ? "<i class='fa fa-building-o'></i> Le client <b>" + U.esc(cl.raisonSociale) + "</b> (filtre en cours) sera présélectionné." : "");
        $("#modalNouvelle").modal("show");
    }
    function continuer() {
        var type = $("input[name='typeCotation']:checked").val();
        if (!type) return;
        var cid = $("#fClient").val();
        location.href = "cotation-form.html?type=" + type + (cid ? "&client=" + cid : "");
    }
    $("#btnNouvelle").on("click", ouvrirNouvelle);
    $("#choixType").on("change", "input", function () { $("#btnContinuer").prop("disabled", false); });
    $("#choixType").on("dblclick", ".cl-type", function () { $(this).find("input").prop("checked", true); continuer(); });
    $("#btnContinuer").on("click", continuer);
    $("#modalNouvelle").on("hidden.bs.modal", function () {
        /* retire le #nouvelle de l'URL pour qu'un nouveau clic du menu rouvre la modale */
        if (location.hash === "#nouvelle" && window.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    });
    /* Lien « Émettre une cotation » du menu : même page, seul le hash change */
    $(window).on("hashchange", function () { if (location.hash === "#nouvelle") ouvrirNouvelle(); });

    $("#resetDemo").on("click", function (e) {
        e.preventDefault();
        CX.api.reset().done(function () { location.reload(); });
    });

    /* ------------------------------------------------------------------
       Démarrage
       ------------------------------------------------------------------ */
    charger().done(function () {
        CX.cot.showFlash();
        /* onglet demandé par l'URL (ex. ?onglet=SOUMISES après enregistrement) */
        var o = U.queryParam("onglet");
        if (o && o in ONGLETS) { state.tab = o; rafraichir(); }
        if (location.hash === "#nouvelle") ouvrirNouvelle();
    });
});

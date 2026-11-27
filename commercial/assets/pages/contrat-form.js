/* =====================================================================
   Commercial · Contrat client (contrat-form.html)
   ---------------------------------------------------------------------
   Paramètres d'URL :
     ?id=2                     modification
     ?client=1                 création pour un client (retour sur sa fiche)
     ?client=1&renouveler=2    renouvellement : reprend le contrat 2 à la suite
   Règle métier : un client ne peut avoir qu'un contrat en vigueur à une
   date donnée -> les périodes des contrats non résiliés ne se chevauchent pas.
   La grille attachée est soit une grille existante, soit une grille
   « dédiée » créée à l'enregistrement (grille de base + remise).
   ===================================================================== */
$(function () {
    var U = CX.util, T = CX.tarifs, REF = CX.REF, today = U.today();
    var $form = $("#f-contrat");
    var editId = U.queryParam("id"), clientParam = U.queryParam("client"), renouveler = U.queryParam("renouveler");
    var FICHIER_MAX = 10 * 1024 * 1024;

    var state = { contrat: null, fichier: null, fichierTaille: 0, tente: false, dirty: false, saving: false, client: null };
    var clients = CX.api.clientsSync(), contrats = CX.api.listSync("contrats"), grilles = CX.api.listSync("tarifaires");

    function client(id) { return $.grep(clients, function (c) { return String(c.id) === String(id); })[0] || null; }
    function grille(id) { return $.grep(grilles, function (g) { return String(g.id) === String(id); })[0] || null; }
    function addMois(iso, n) {
        var d = new Date(iso + "T12:00:00"); d.setMonth(d.getMonth() + n); d.setDate(d.getDate() - 1);
        return U.isoDate(d);
    }

    /* =================================================================
       Listes
       ================================================================= */
    $.each(clients, function (_, c) {
        var $o = $("<option>").val(c.id).text(c.raisonSociale).attr("data-sub", (c.code || "") + " · " + T.villeLabel(c.ville) + (c.enCompte ? " · en compte" : " · comptant"));
        if (c.statut === "INACTIF") $o.prop("disabled", true);
        $("#clientId").append($o);
    });
    $("#clientId").select2({
        width: "100%", placeholder: "Rechercher un client…", allowClear: true,
        templateResult: function (o) {
            if (!o.id) return o.text;
            return $("<div><div style='font-weight:600'>" + U.esc(o.text) + "</div><small style='opacity:.7'>" + U.esc($(o.element).attr("data-sub")) + "</small></div>");
        }
    });
    function optionsGrilles(inclureStd) {
        var parType = {};
        $.each(grilles, function (_, g) {
            if (g.statut === "ARCHIVEE" || (!inclureStd && g.type === "STANDARD")) return;
            (parType[g.type] = parType[g.type] || []).push(g);
        });
        return $.map(["CLIENT", "GROUPE", "STANDARD"], function (t) {
            if (!parType[t]) return null;
            return "<optgroup label='Grilles « " + T.TYPES_GRILLE[t].label.toLowerCase() + " »'>" + $.map(parType[t], function (g) {
                return "<option value='" + g.id + "'>" + U.esc(g.code + " · " + g.nom) + (g.statut === "BROUILLON" ? " (brouillon)" : "") + "</option>";
            }).join("") + "</optgroup>";
        }).join("");
    }
    $("#tarifaireId").html("<option value=''>Choisir une grille…</option>" + optionsGrilles(true));
    $("#ng-base").html(optionsGrilles(true));

    /* =================================================================
       Lecture / contrôles
       ================================================================= */
    function lire() {
        var mode = $("input[name='modeGrille']:checked").val();
        return {
            clientId: $("#clientId").val() ? Number($("#clientId").val()) : null,
            objet: $.trim($("#objet").val()), dateSignature: $("#dateSignature").val(), du: $("#du").val(), au: $("#au").val(),
            conditions: {
                delaiPaiement: parseInt($("#delaiPaiement").val(), 10) || 0, remisePct: U.num($("#remisePct").val()),
                plafondCredit: U.num($("#plafondCredit").val()), notes: $.trim($("#notes").val())
            },
            modeGrille: mode,
            tarifaireId: mode === "EXISTANTE" && $("#tarifaireId").val() ? Number($("#tarifaireId").val()) : null,
            nouvelle: { nom: $.trim($("#ng-nom").val()), baseId: $("#ng-base").val() ? Number($("#ng-base").val()) : null, remise: U.num($("#ng-remise").val()) },
            reporterFiche: $("#reporterFiche").is(":checked")
        };
    }
    /* contrats du même client dont la période chevauche [du, au] */
    function chevauchements(d) {
        if (!d.clientId || !d.du || !d.au) return [];
        return $.grep(contrats, function (c) {
            return String(c.clientId) === String(d.clientId) && String(c.id) !== String(editId) && c.statut !== "RESILIE" &&
                c.du <= d.au && (!c.au || c.au >= d.du);
        });
    }
    function controle(d) {
        var errs = [];
        function err(field, msg) { errs.push({ field: field, message: msg }); }
        if (!d.clientId) err("clientId", "Choisissez le client.");
        if (!d.objet) err("objet", "L'objet du contrat est obligatoire.");
        if (!d.du) err("du", "Date de début obligatoire.");
        if (!d.au) err("au", "Date de fin obligatoire.");
        if (d.du && d.au && d.au < d.du) err("au", "La date de fin précède la date de début.");
        if (d.dateSignature && d.du && d.dateSignature > d.au) err("dateSignature", "Signature postérieure à la fin du contrat.");
        var ch = chevauchements(d);
        if (ch.length) err("du", "Période en conflit avec le contrat " + ch[0].numero + " (" + U.toFr(ch[0].du) + " → " + U.toFr(ch[0].au) + ").");
        if (d.conditions.delaiPaiement < 0 || d.conditions.delaiPaiement > 180) err("delaiPaiement", "Délai entre 0 et 180 jours.");
        if (d.conditions.remisePct < 0 || d.conditions.remisePct > 100) err("remisePct", "Remise entre 0 et 100 %.");
        if (d.modeGrille === "EXISTANTE" && !d.tarifaireId) err("tarifaireId", "Choisissez la grille tarifaire du contrat.");
        if (d.modeGrille === "NOUVELLE") {
            if (!d.nouvelle.nom) err("ngNom", "Nom de la grille à créer.");
            if (d.nouvelle.remise < -50 || d.nouvelle.remise > 80) err("ngRemise", "Remise entre −50 et 80 %.");
        }
        return errs;
    }

    /* Grille telle qu'elle sera appliquée (existante, ou dédiée simulée) */
    function grilleEffective(d) {
        if (d.modeGrille === "EXISTANTE") return grille(d.tarifaireId);
        if (!d.nouvelle.baseId) return null;
        var g = T.nouvelleGrille("CLIENT");
        return $.extend(g, { nom: d.nouvelle.nom || "Nouvelle grille", baseId: d.nouvelle.baseId, remiseBasePct: d.nouvelle.remise, heriterSupplements: true, statut: "ACTIVE", du: d.du, au: d.au, minimum: 0, arrondi: 100 });
    }

    /* =================================================================
       Aperçu
       ================================================================= */
    function majApercu() {
        var d = lire(), c = client(d.clientId), g = grilleEffective(d);
        state.client = c;
        $("#ap-client").text(c ? c.raisonSociale : "Client à choisir");
        var duree = d.du && d.au && d.au >= d.du ? U.daysBetween(d.du, d.au) + 1 : 0;
        $("#ap-periode").text(d.du && d.au ? "Du " + U.toFrLong(d.du) + " au " + U.toFrLong(d.au) : "Période à préciser");
        var statut = state.contrat && state.contrat.statut === "RESILIE" ? "RESILIE" : T.statutContrat({ du: d.du, au: d.au, statut: "ACTIF" }, today);
        $("#ap-statut").html(d.du && d.au ? T.badge(T.STATUTS_CONTRAT, statut) : "");
        var tags = [];
        if (duree) tags.push("<span class='light'>" + (duree >= 360 ? U.fmt(Math.round(duree / 365 * 10) / 10, 1).replace(",0", "") + " an(s)" : Math.round(duree / 30.4) + " mois") + "</span>");
        if (statut === "ACTIF" && d.au) tags.push("<span>expire dans " + U.daysBetween(today, d.au) + " j</span>");
        if (c) tags.push("<span>" + U.esc(c.code) + "</span>");
        $("#ap-tags").html(tags.join(""));
        $("#ap-grille").html(g ? U.esc(g.nom) : "—");
        $("#ap-delai").text(d.conditions.delaiPaiement + " jours");
        $("#ap-remise").text(U.fmt(d.conditions.remisePct, d.conditions.remisePct % 1 ? 1 : 0) + " %");
        $("#ap-plafond").text(d.conditions.plafondCredit ? U.money(d.conditions.plafondCredit) : "Sans plafond");
        $("#ap-doc").html(state.fichier ? "<i class='fa fa-check-circle' style='color:var(--cx-green)'></i> PDF" : "<span style='color:var(--cx-orange)'>à charger</span>");

        /* exemple de prix */
        if (g) {
            var dep = c && c.ville ? c.ville : CX.CONFIG.USER.ville, dest = dep === "YAOUNDE" ? "DOUALA" : "YAOUNDE";
            var r = T.calculer(g, { villeDep: dep, villeDest: dest, nature: "Colis", poids: 5 });
            var std = T.grilleStandard(), rs = std ? T.calculer(std, { villeDep: dep, villeDest: dest, nature: "Colis", poids: 5 }) : null;
            $("#ap-exemple").html(T.villeLabel(dep) + " → " + T.villeLabel(dest) + " : <b style='color:var(--cx-ink)'>" + U.money(r.ht) + " HT</b>" +
                (rs && rs.ht && rs.ht !== r.ht ? "<br>Grille standard : " + U.money(rs.ht) + " (" + (r.ht < rs.ht ? "−" : "+") + U.fmt(Math.abs(Math.round((r.ht - rs.ht) / rs.ht * 100))) + " %)" : "") +
                (r.regle ? "<br><small>Règle « " + U.esc(r.regle.libelle) + " »</small>" : ""));
        } else $("#ap-exemple").text("—");

        /* infos sur la grille existante choisie */
        var gi = d.modeGrille === "EXISTANTE" ? grille(d.tarifaireId) : null, notes = [];
        if (gi) {
            if (gi.statut !== "ACTIVE") notes.push("<div class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><div>Cette grille est au statut <b>" + T.STATUTS_GRILLE[gi.statut].label.toLowerCase() + "</b> : elle ne sera appliquée qu'une fois activée.</div></div>");
            if (d.du && d.au && ((gi.du && gi.du > d.du) || (gi.au && gi.au < d.au))) notes.push("<div class='cx-note cx-note-warn'><i class='fa fa-calendar-times-o'></i><div>La grille n'est valable que " + T.libValidite(gi) + " : en dehors, le client basculera sur son groupe ou la grille standard.</div></div>");
            if (gi.type === "STANDARD") notes.push("<div class='cx-note cx-note-info'><i class='fa fa-info-circle'></i><div>Grille standard : le contrat fixe les conditions de paiement sans tarif négocié.</div></div>");
            $("#grille-info").html("<div class='cx-block'><div class='cx-sum-line' style='padding-top:0'><span>" + T.badge(T.TYPES_GRILLE, gi.type) + " " + T.badge(T.STATUTS_GRILLE, gi.statut) + "</span>" +
                "<a href='tarif-form.html?id=" + gi.id + "'>Ouvrir la grille <i class='fa fa-external-link'></i></a></div>" +
                "<ul>" + $.map((gi.regles || []).slice(0, 5), function (r) { return "<li><b>" + U.esc(r.libelle || T.MODELES[r.modele].label) + "</b> · " + U.esc(T.libModele(r)) + "</li>"; }).join("") +
                ((gi.regles || []).length > 5 ? "<li>… " + ((gi.regles || []).length - 5) + " autre(s) règle(s)</li>" : "") +
                (gi.baseId ? "<li>Repli : grille " + U.esc((grille(gi.baseId) || {}).code || "?") + (gi.remiseBasePct ? " (" + (gi.remiseBasePct > 0 ? "−" : "+") + Math.abs(gi.remiseBasePct) + " %)" : "") + "</li>" : "") +
                "</ul></div>" + notes.join(""));
        } else $("#grille-info").empty();

        /* conflits de période */
        var ch = chevauchements(d);
        $("#chevauchement").toggleClass("cx-hidden", !ch.length);
        $("#chevauchement-texte").html(ch.length ? "<b>" + U.esc(c ? c.raisonSociale : "") + "</b> a déjà le contrat <a href='contrat-form.html?id=" + ch[0].id + "'>" + U.esc(ch[0].numero) +
            "</a> du " + U.toFr(ch[0].du) + " au " + U.toFr(ch[0].au) + ". Un client ne peut avoir qu'un contrat en vigueur à une date donnée : décalez la période ou résiliez l'ancien contrat." : "");

        $(".cx-step[data-step='contrat']").toggleClass("done", !!(d.clientId && d.objet && d.du && d.au && !ch.length));
        $(".cx-step[data-step='document']").toggleClass("done", !!state.fichier);
        $(".cx-step[data-step='conditions']").toggleClass("done", true);
        $(".cx-step[data-step='grille']").toggleClass("done", !!g);

        var errs = controle(d);
        if (state.tente) U.showErrors($form, errs);
        $("#r-nbManq").text(errs.length);
        $("#r-listeManq").html($.map(errs, function (e) { return "<li>" + U.esc(e.message) + "</li>"; }).join(""));
        $("#r-manquants").toggleClass("cx-hidden", !errs.length || !state.tente);
        return errs;
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $form.on("input change", "input, select, textarea", function () { state.dirty = true; majDiff(); });
    var majDiff = U.debounce(majApercu, 80);
    $("#clientId").on("change", function () {
        var c = client($(this).val());
        if (c && !state.contrat) {
            /* valeurs proposées depuis la fiche client */
            if (!$("#objet").data("touched")) $("#objet").val("Contrat cadre de messagerie " + ($("#du").val() || today).substr(0, 4));
            if (!$("#delaiPaiement").data("touched")) $("#delaiPaiement").val(c.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS);
            if (!$("#remisePct").data("touched")) $("#remisePct").val(c.remisePct || 0);
            if (!$("#plafondCredit").data("touched")) $("#plafondCredit").val(c.plafondCredit || "");
            if (!$("#ng-nom").data("touched")) $("#ng-nom").val((c.raisonSociale + " - contrat " + ($("#du").val() || today).substr(0, 4)).substr(0, 100));
            /* grille proposée : grille propre du client, sinon celle de son groupe */
            if (!$("#tarifaireId").data("touched")) {
                var res = T.resoudre(c.id, today);
                if (res.grille && res.origine !== "STANDARD") $("#tarifaireId").val(String(res.grille.id));
            }
        }
        var r = c ? T.resoudre(c.id, today) : null;
        $("#client-info").html(c ? "Grille appliquée aujourd'hui : <b>" + U.esc(r.grille ? r.grille.nom : "aucune") + "</b> · " + U.esc(r.libelle) : "Recherchez par raison sociale, sigle ou code client.");
        majApercu();
    });
    $form.on("change input", "#objet, #delaiPaiement, #remisePct, #plafondCredit, #ng-nom, #tarifaireId", function () { $(this).data("touched", true); });
    $("#durees").on("change", "input", function () {
        var du = $("#du").val() || today;
        $("#du").val(du);
        $("#au").val(addMois(du, parseInt($(this).val(), 10)));
        majApercu();
    });
    $("#du, #au").on("change", function () { $("#durees input").prop("checked", false); });
    $("#seg-grille").on("change", "input", function () {
        var n = $(this).val() === "NOUVELLE";
        $("#bloc-existante").toggleClass("cx-hidden", n);
        $("#bloc-nouvelle").toggleClass("cx-hidden", !n);
    });

    /* Fichier PDF : choix, glisser-déposer, retrait */
    function choisirFichier(f) {
        if (!f) return;
        if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) { U.toast("Le contrat doit être un fichier <b>PDF</b>.", "error"); return; }
        if (f.size > FICHIER_MAX) { U.toast("Fichier trop volumineux (10 Mo maximum).", "error"); return; }
        state.fichier = f.name; state.fichierTaille = f.size; state.dirty = true;
        // TODO API : POST /commercial/contrats/{id}/document (multipart/form-data, champ "document") - envoyé avec le formulaire
        afficherFichier("sera envoyé à l'enregistrement");
    }
    function afficherFichier(meta) {
        var has = !!state.fichier;
        $("#drop-contrat").toggleClass("cx-hidden", has);
        $("#fichier-current").toggleClass("cx-hidden", !has);
        $("#fichier-nom").text(state.fichier || "");
        $("#fichier-meta").text(has ? (state.fichierTaille ? U.fmt(state.fichierTaille / 1024) + " Ko · " : "") + (meta || "fichier enregistré") : "");
        majApercu();
    }
    $("#fichierFile").on("change", function () { choisirFichier(this.files && this.files[0]); });
    $("#drop-contrat").on("dragenter dragover", function (e) { e.preventDefault(); $(this).addClass("over"); })
        .on("dragleave drop", function (e) { e.preventDefault(); $(this).removeClass("over"); })
        .on("drop", function (e) { var dt = e.originalEvent && e.originalEvent.dataTransfer; choisirFichier(dt && dt.files && dt.files[0]); });
    $("#btn-fichier-change").on("click", function () { $("#fichierFile").trigger("click"); });
    $("#btn-fichier-remove").on("click", function () { state.fichier = null; state.fichierTaille = 0; $("#fichierFile").val(""); state.dirty = true; afficherFichier(); });
    $("#btn-fichier-voir").on("click", function () {
        // TODO API : GET /commercial/contrats/{id}/document
        U.toast("Ouverture de « " + U.esc(state.fichier) + " » (disponible après intégration).", "info");
    });

    /* =================================================================
       Enregistrement
       ================================================================= */
    function destination(saved) {
        if (U.queryParam("retour")) return U.queryParam("retour");
        if (clientParam) return "client-fiche.html?id=" + saved.clientId + "#tarif";
        return "tarifs-liste.html#contrats";
    }
    $form.on("submit", function (e) {
        e.preventDefault();
        if (state.saving) return;
        state.tente = true;
        var d = lire(), errs = majApercu();
        U.showErrors($form, errs);
        if (errs.length) { U.toast(errs.length + " point(s) à corriger.", "error"); return; }
        var $btn = $("#btn-save");
        state.saving = true;
        U.busy($btn, true);

        /* 1. grille dédiée éventuelle */
        var etapeGrille;
        if (d.modeGrille === "NOUVELLE") {
            var g = grilleEffective(d);
            g.nom = d.nouvelle.nom;
            g.description = "Grille dédiée au contrat de " + (state.client ? state.client.raisonSociale : "");
            g.historique = [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Grille créée depuis un contrat client" }];
            // TODO API : POST /commercial/tarifs  (grille dédiée, créée dans la même transaction que le contrat)
            etapeGrille = CX.api.save("tarifaires", g).then(function (s) { return s.id; });
        } else etapeGrille = $.Deferred().resolve(d.tarifaireId).promise();

        etapeGrille.then(function (tarifaireId) {
            var obj = state.contrat ? T.clone(state.contrat) : { statut: "ACTIF", historique: [] };
            $.extend(obj, {
                clientId: d.clientId, objet: d.objet, dateSignature: d.dateSignature, du: d.du, au: d.au, tarifaireId: tarifaireId,
                fichier: state.fichier, fichierTaille: state.fichierTaille, conditions: d.conditions
            });
            /* un contrat expiré prolongé redevient actif ; un contrat résilié le reste */
            if (obj.statut !== "RESILIE") obj.statut = "ACTIF";
            obj.historique = [{ date: U.now(), user: CX.CONFIG.USER.nom, action: state.contrat ? "Contrat modifié" : (renouveler ? "Contrat enregistré (renouvellement)" : "Contrat enregistré") }].concat(obj.historique || []);
            // TODO API : POST /commercial/contrats (création) | PUT /commercial/contrats/{id}
            return CX.api.save("contrats", obj);
        }).then(function (saved) {
            var suite = [];
            if (d.reporterFiche) {
                // TODO API : fait côté serveur lors de l'enregistrement du contrat (option « reporter sur la fiche »)
                suite.push(CX.api.patchMany("clients", [saved.clientId], { delaiPaiement: d.conditions.delaiPaiement, remisePct: d.conditions.remisePct, plafondCredit: d.conditions.plafondCredit }));
            }
            suite.push(CX.api.log("clients", saved.clientId, (state.contrat ? "Contrat modifié : " : "Contrat enregistré : ") + saved.numero + " (" + U.toFr(saved.du) + " → " + U.toFr(saved.au) + ")"));
            return $.when.apply($, suite).then(function () { return saved; });
        }).done(function (saved) {
            state.dirty = false;
            T.flash("Contrat <b>" + U.esc(saved.numero) + "</b> enregistré" + (d.modeGrille === "NOUVELLE" ? " avec sa grille dédiée « " + U.esc(d.nouvelle.nom) + " »" : "") + ".");
            location.href = destination(saved);
        }).fail(function (e) {
            state.saving = false; U.busy($btn, false);
            U.toast("Enregistrement impossible : " + U.esc(e || "erreur inconnue"), "error");
        });
    });
    $("#btn-cancel").on("click", function (e) {
        if (!state.dirty) return;
        e.preventDefault();
        var href = $(this).attr("href");
        U.confirm({ title: "Abandonner la saisie ?", message: "Le contrat ne sera pas enregistré.", okText: "Abandonner", okClass: "cx-btn-danger", cancelText: "Continuer" })
            .done(function () { state.dirty = false; location.href = href; });
    });
    $(window).on("beforeunload", function () { if (state.dirty && !state.saving) return "Des modifications ne sont pas enregistrées."; });

    /* =================================================================
       Démarrage
       ================================================================= */
    function remplir(c, nouveau) {
        $("#clientId").val(c.clientId ? String(c.clientId) : "").trigger("change.select2");
        $("#objet").val(c.objet || ""); $("#dateSignature").val(c.dateSignature || "");
        $("#du").val(c.du || ""); $("#au").val(c.au || "");
        var k = c.conditions || {};
        $("#delaiPaiement").val(k.delaiPaiement != null ? k.delaiPaiement : ""); $("#remisePct").val(k.remisePct != null ? k.remisePct : 0);
        $("#plafondCredit").val(k.plafondCredit || ""); $("#notes").val(k.notes || "");
        $("#tarifaireId").val(c.tarifaireId ? String(c.tarifaireId) : "");
        $("#objet, #delaiPaiement, #remisePct, #plafondCredit, #tarifaireId").data("touched", true);
        state.fichier = nouveau ? null : c.fichier || null; state.fichierTaille = nouveau ? 0 : c.fichierTaille || 0;
        afficherFichier();
        var cl = client(c.clientId);
        $("#ng-nom").val(cl ? (cl.raisonSociale + " - contrat " + (c.du || today).substr(0, 4)).substr(0, 100) : "");
        $("#clientId").trigger("change");
    }
    var grBase = T.grilleStandard();
    if (grBase) $("#ng-base").val(String(grBase.id));

    if (editId) {
        // TODO API : GET /commercial/contrats/{id}
        CX.api.get("contrats", editId).done(function (c) {
            state.contrat = c;
            $("#page-title").text("Contrat " + c.numero);
            $("#page-sub").text(CX.api.clientNom(c.clientId));
            $("#crumb-current").text(c.numero);
            $("#numero-display").text(c.numero);
            $("#ap-mode").text("Modification");
            document.title = "Commercial · Contrat " + c.numero + " - ClemenTino";
            $("#clientId").prop("disabled", true);
            if (c.statut === "RESILIE") {
                $("#bloc-resiliation").removeClass("cx-hidden");
                $("#resiliation-texte").html("Contrat <b>résilié</b>" + (c.dateResiliation ? " le " + U.toFr(c.dateResiliation) : "") + (c.motifResiliation ? " - " + U.esc(c.motifResiliation) : "") + ". Il n'est plus appliqué.");
            }
            $(".cx-page-actions").prepend("<a class='cx-btn cx-btn-ghost' href='client-fiche.html?id=" + c.clientId + "#tarif'><i class='fa fa-id-card-o'></i> Fiche client</a>");
            remplir(c, false);
            state.dirty = false;
        }).fail(function () { $form.addClass("cx-hidden"); $("#not-found").removeClass("cx-hidden"); });
    } else {
        var ancien = renouveler ? $.grep(contrats, function (x) { return String(x.id) === String(renouveler); })[0] : null;
        if (ancien) {
            var du = U.addDays(ancien.au || today, 1);
            remplir($.extend(T.clone(ancien), {
                du: du, au: addMois(du, 12), dateSignature: today,
                objet: (ancien.objet || "Contrat").replace(/\b20\d\d\b/, addMois(du, 12).substr(0, 4))
            }), true);
            $("#page-title").text("Renouvellement du contrat " + ancien.numero);
        } else {
            $("#du").val(today); $("#au").val(addMois(today, 12)); $("#dateSignature").val(today);
            $("#durees input[value='12']").prop("checked", true);
            if (clientParam && client(clientParam)) $("#clientId").val(String(clientParam)).trigger("change");
            else majApercu();
        }
        state.dirty = false;
    }
    T.showFlash();
});

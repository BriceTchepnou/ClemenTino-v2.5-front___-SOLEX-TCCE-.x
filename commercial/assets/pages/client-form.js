/* =====================================================================
   Commercial · Formulaire compte client (client-form.html)
   ---------------------------------------------------------------------
   - Création : client-form.html
   - Modification : client-form.html?id=12
   Le formulaire est lu / rempli via les attributs [name] (CX.util.readForm /
   fillForm). Les contacts sont « aplatis » en champs PRINCIPAL_nom,
   SECOND_tel1, DG_email… puis reconstitués en tableau contacts[3].

   Type de compte (choix segmenté « typeCompte ») -> modèle de données :
       COMPTANT -> enCompte = false, forfait = false
       COMPTE   -> enCompte = true,  forfait = false
       FORFAIT  -> enCompte = true,  forfait = true  (forfait facturé par période)

   >>> INTÉGRATION SYMFONY <<<
   Le formulaire peut rester un formulaire Symfony classique (FormType
   ClientType) rendu en Twig avec les mêmes [name] ; ce script ne fait
   qu'ajouter le confort (aperçu, validations, contacts, fichier).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, USER = CX.CONFIG.USER;

    /* ---------- Paramètres de la page ---------- */
    var editId = U.queryParam("id");                       // null en création
    var ROLES = ["PRINCIPAL", "SECOND", "DG"];
    var CHAMPS_CONTACT = {
        PRINCIPAL: ["nom", "titre", "tel1", "tel2", "email"],
        SECOND: ["nom", "titre", "tel1", "tel2", "email"],
        DG: ["nom", "tel1", "tel2", "email"]
    };
    var LIB_ROLE = { PRINCIPAL: "Contact principal", SECOND: "Second contact", DG: "Directeur général" };
    var LIB_TYPE = { COMPTANT: "Au comptant", COMPTE: "En compte", FORFAIT: "Forfait" };
    // TODO API : GET /commercial/commerciaux (liste des utilisateurs ayant le rôle commercial)
    var COMMERCIAUX = ["Support KuTiWa", "M. NJOYA Ibrahim", "Mme EBOGO Christelle", "M. TCHAMBA Hervé"];
    var FICHE_MAX_OCTETS = 5 * 1024 * 1024;

    var state = {
        client: null,      // client chargé (modification)
        clients: [],       // tous les clients (détection de doublons)
        original: {},      // valeurs initiales « à plat » (tolérance des anciens numéros)
        fiche: null,       // nom du fichier PDF de la fiche client
        ficheMeta: "",
        dirty: false,
        saving: false
    };

    var $form = $("#f-client");

    /* =================================================================
       Outils de validation / mise en forme
       ================================================================= */

    /* Téléphone camerounais : 9 chiffres commençant par 2 (fixe) ou 6 (mobile),
       indicatif +237 / 00237 / 237 facultatif, séparateurs libres. */
    function telDecompose(v) {
        var s = String(v || "").replace(/[\s.\-()\/]/g, ""), intl = false;
        if (/^\+237/.test(s)) { s = s.substr(4); intl = true; }
        else if (/^00237/.test(s)) { s = s.substr(5); intl = true; }
        else if (/^237\d{9}$/.test(s)) { s = s.substr(3); intl = true; }
        return { chiffres: s, intl: intl };
    }
    function telValide(v) { return /^[26]\d{8}$/.test(telDecompose(v).chiffres); }
    function telFormate(v) {
        var p = telDecompose(v), d = p.chiffres;
        if (!/^[26]\d{8}$/.test(d)) return $.trim(v || "");
        return (p.intl ? "+237 " : "") + d.substr(0, 3) + " " + d.substr(3, 2) + " " + d.substr(5, 2) + " " + d.substr(7, 2);
    }
    function emailValide(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

    /* Clé de comparaison des raisons sociales (accents, ponctuation, formes juridiques ignorés) */
    function cleRs(s) {
        return U.normalize(s).replace(/\b(sarl|sa|sas|sarlu|ets|etablissements?|societe|ste)\b/g, "").replace(/[^a-z0-9]/g, "");
    }
    function doublon(rs) {
        var k = cleRs(rs);
        if (k.length < 3) return null;
        return $.grep(state.clients, function (c) { return c.id != editId && cleRs(c.raisonSociale) === k; })[0] || null;
    }

    function typeDe(c) { return c.forfait ? "FORFAIT" : (c.enCompte ? "COMPTE" : "COMPTANT"); }
    function estEnCompte(type) { return type === "COMPTE" || type === "FORFAIT"; }
    function val(name) { return $.trim($form.find("[name='" + name + "']").val() || ""); }
    function typeCourant() { return $form.find("[name='typeCompte']:checked").val() || "COMPTANT"; }

    /* =================================================================
       Listes déroulantes
       ================================================================= */
    function optionsAgences() {
        var parVille = {}, ordre = [];
        $.each(REF.AGENCES, function (_, a) {
            if (!parVille[a.ville]) { parVille[a.ville] = []; ordre.push(a.ville); }
            parVille[a.ville].push(a);
        });
        return $.map(ordre, function (v) {
            return "<optgroup label='" + U.esc(v) + "'>" + $.map(parVille[v], function (a) {
                return "<option value='" + a.id + "'>" + U.esc(a.nom + " · " + v) + "</option>";
            }).join("") + "</optgroup>";
        }).join("");
    }

    function initListes() {
        $("#secteur").html("<option value=''>— Choisir —</option>" + $.map(REF.SECTEURS, function (s) {
            return "<option>" + U.esc(s) + "</option>";
        }).join(""));
        $("#ville").html("<option value=''>— Choisir —</option>" + $.map(REF.VILLES, function (v) {
            return "<option value='" + U.esc(v.nom) + "'>" + U.esc(v.nom) + "</option>";
        }).join(""));
        $("#agenceId").html("<option value=''>— Choisir —</option>" + optionsAgences());
        $("#tarifAgences").html(optionsAgences());
        remplirCommerciaux(null);

        $("#ville").select2({ width: "100%", placeholder: "— Choisir —" });
        $("#agenceId").select2({ width: "100%", placeholder: "— Choisir —" });
        $("#commercial").select2({ width: "100%", minimumResultsForSearch: 8 });
        $("#tarifAgences").select2({ width: "100%", placeholder: "Choisir une ou plusieurs agences", closeOnSelect: false });
    }

    function remplirCommerciaux(actuel) {
        var liste = COMMERCIAUX.slice();
        if (actuel && $.inArray(actuel, liste) < 0) liste.unshift(actuel);
        $("#commercial").html($.map(liste, function (n) { return "<option>" + U.esc(n) + "</option>"; }).join(""));
    }

    /* =================================================================
       Conversion modèle <-> formulaire
       ================================================================= */
    function valeursVides() {
        var o = {};
        $form.find("[name]").each(function () { o[$(this).attr("name")] = ""; });
        return $.extend(o, {
            typeCompte: "COMPTANT", tarifPortee: "TOUTES", tarifAuto: false, tarifAgences: [],
            periodicite: "MENSUELLE", delaiPaiement: CX.CONFIG.DELAI_PAIEMENT_JOURS, remisePct: 0,
            ville: USER.ville, commercial: USER.nom,
            agenceId: (function () {
                var a = $.grep(REF.AGENCES, function (x) { return x.ville === USER.ville && x.nom === USER.agence; })[0];
                return a ? String(a.id) : "";
            })()
        });
    }

    function versFormulaire(c) {
        var o = valeursVides();
        $.each(["raisonSociale", "sigle", "secteur", "rccm", "niu", "ville", "localisation", "telStandard", "email",
            "adresse", "activites", "note", "periodicite", "delaiPaiement", "plafondCredit", "remisePct",
            "emailFacturation", "montantForfait", "commercial"], function (_, k) {
            if (c[k] != null) o[k] = c[k];
        });
        o.typeCompte = typeDe(c);
        o.tarifAuto = !!c.tarifAuto;
        o.tarifPortee = c.tarifToutesAgences || !(c.tarifAgences || []).length ? "TOUTES" : "CERTAINES";
        o.tarifAgences = $.map(c.tarifAgences || [], function (id) { return String(id); });
        o.agenceId = c.agenceId ? String(c.agenceId) : "";
        if (!c.plafondCredit) o.plafondCredit = "";
        if (!c.montantForfait) o.montantForfait = "";
        $.each(ROLES, function (_, r) {
            var ct = $.grep(c.contacts || [], function (x) { return x.role === r; })[0] || {};
            $.each(CHAMPS_CONTACT[r], function (_, f) { o[r + "_" + f] = ct[f] || ""; });
        });
        return o;
    }

    function depuisFormulaire(raw) {
        var base = state.client ? $.extend(true, {}, state.client) : {
            statut: "ACTIF",
            historique: [{ date: U.now(), user: USER.nom, action: "Création du compte client" }]
        };
        var type = raw.typeCompte || "COMPTANT", enCompte = estEnCompte(type);
        var t = function (k) { return $.trim(raw[k] || ""); };

        $.extend(base, {
            raisonSociale: t("raisonSociale").toUpperCase(),
            sigle: t("sigle").toUpperCase(),
            secteur: t("secteur"),
            rccm: t("rccm").toUpperCase(),
            niu: t("niu").toUpperCase(),
            ville: t("ville"),
            localisation: t("localisation"),
            telStandard: telFormate(t("telStandard")),
            email: t("email").toLowerCase(),
            adresse: t("adresse"),
            activites: t("activites"),
            note: t("note"),
            contacts: $.map(ROLES, function (r) {
                var ct = { role: r };
                $.each(CHAMPS_CONTACT[r], function (_, f) {
                    var v = t(r + "_" + f);
                    if (f === "tel1" || f === "tel2") v = telFormate(v);
                    if (f === "email") v = v.toLowerCase();
                    ct[f] = v;
                });
                return ct;
            }),
            enCompte: enCompte,
            forfait: type === "FORFAIT",
            montantForfait: type === "FORFAIT" ? U.num(raw.montantForfait) : 0,
            periodicite: enCompte ? (raw.periodicite || "MENSUELLE") : "MENSUELLE",
            delaiPaiement: enCompte ? parseInt(U.num(raw.delaiPaiement), 10) : 0,
            plafondCredit: enCompte ? U.num(raw.plafondCredit) : 0,
            remisePct: enCompte ? U.num(raw.remisePct) : 0,
            emailFacturation: t("emailFacturation").toLowerCase(),
            tarifAuto: !!raw.tarifAuto,
            tarifToutesAgences: !!raw.tarifAuto && raw.tarifPortee !== "CERTAINES",
            tarifAgences: raw.tarifAuto && raw.tarifPortee === "CERTAINES" ? $.map(raw.tarifAgences || [], function (id) { return Number(id); }) : [],
            agenceId: raw.agenceId ? Number(raw.agenceId) : null,
            commercial: raw.commercial || "",
            ficheClient: state.fiche
        });
        return base;
    }

    /* =================================================================
       Validation
       ================================================================= */
    function valider(raw) {
        var errs = [], type = raw.typeCompte || "COMPTANT", enCompte = estEnCompte(type);
        function err(f, m) { errs.push({ field: f, message: m }); }
        function vide(k) { return !$.trim(raw[k] || ""); }

        if (vide("raisonSociale")) err("raisonSociale", "La raison sociale est obligatoire.");
        else if ($.trim(raw.raisonSociale).length < 2) err("raisonSociale", "La raison sociale est trop courte.");

        if (enCompte) {
            if (vide("rccm")) err("rccm", "Le RCCM est obligatoire pour un client en compte.");
            if (vide("niu")) err("niu", "Le NIU est obligatoire pour un client en compte.");
            else if (!/^[A-Z0-9]{10,20}$/i.test($.trim(raw.niu))) err("niu", "NIU invalide (lettres et chiffres, sans espace).");
        }

        /* Téléphones : un ancien numéro non modifié est toléré (données historiques) */
        $form.find("[data-phone]").each(function () {
            var n = $(this).attr("name"), v = $.trim(raw[n] || "");
            if (v && !telValide(v) && v !== $.trim(state.original[n] || "")) {
                err(n, "Numéro invalide : 9 chiffres commençant par 2 ou 6 (+237 facultatif).");
            }
        });
        $form.find("[data-email]").each(function () {
            var n = $(this).attr("name"), v = $.trim(raw[n] || "");
            if (v && !emailValide(v)) err(n, "Adresse email invalide.");
        });

        if (enCompte) {
            if (vide("PRINCIPAL_nom")) err("PRINCIPAL_nom", "Le contact principal est obligatoire pour un client en compte.");
            if (vide("PRINCIPAL_tel1")) err("PRINCIPAL_tel1", "Téléphone du contact principal obligatoire pour un client en compte.");
            if (vide("emailFacturation")) err("emailFacturation", "L'email de facturation est obligatoire pour un client en compte.");
            var d = U.num(raw.delaiPaiement);
            if (d < 0 || d > 180) err("delaiPaiement", "Délai entre 0 et 180 jours.");
            var r = U.num(raw.remisePct);
            if (r < 0 || r > 100) err("remisePct", "Remise entre 0 et 100 %.");
            if (U.num(raw.plafondCredit) < 0) err("plafondCredit", "Le plafond ne peut pas être négatif.");
        }
        if (type === "FORFAIT" && U.num(raw.montantForfait) <= 0) err("montantForfait", "Indiquez le montant du forfait.");
        if (raw.tarifAuto && raw.tarifPortee === "CERTAINES" && !(raw.tarifAgences || []).length) {
            err("tarifAgences", "Choisissez au moins une agence, ou appliquez le tarif à toutes les agences.");
        }
        return errs;
    }

    function afficherErreurs(errs) {
        U.showErrors($form, errs);
        /* Onglets de contacts en erreur */
        $("#contact-tabs a").removeClass("has-error");
        $.each(errs, function (_, e) {
            var role = e.field.split("_")[0];
            if (CHAMPS_CONTACT[role] && e.field.indexOf("_") > 0) $("#contact-tabs a[data-tab='" + role + "']").addClass("has-error");
        });
        /* Si la première erreur est dans un onglet de contact masqué : on l'ouvre */
        var $first = $form.find(".has-error").first(), $pane = $first.closest(".cx-contact-pane");
        if ($pane.length && $pane.hasClass("cx-hidden")) {
            ouvrirContact($pane.data("pane"));
            $("html, body").stop().animate({ scrollTop: $first.offset().top - 120 }, 200);
        }
    }

    /* =================================================================
       Affichage conditionnel
       ================================================================= */
    function appliquerAffichage() {
        var type = typeCourant(), enCompte = estEnCompte(type);
        $("#bloc-compte").toggleClass("cx-hidden", !enCompte);
        $("#bloc-forfait").toggleClass("cx-hidden", type !== "FORFAIT");
        var auto = $("#tarifAuto").is(":checked");
        $("#bloc-tarif").toggleClass("cx-hidden", !auto);
        $("#bloc-tarif-agences").toggleClass("cx-hidden", !auto || $form.find("[name='tarifPortee']:checked").val() !== "CERTAINES");
        /* Champs devenant obligatoires pour un client en compte */
        $("#lbl-rccm, #lbl-niu, #lbl-principal-nom, #lbl-principal-tel").toggleClass("req", enCompte);
    }

    function ouvrirContact(role) {
        $("#contact-tabs a").removeClass("active").filter("[data-tab='" + role + "']").addClass("active");
        $(".cx-contact-pane").addClass("cx-hidden").filter("[data-pane='" + role + "']").removeClass("cx-hidden");
    }

    /* =================================================================
       Aperçu (colonne de droite) + complétude
       ================================================================= */
    function rafraichirApercu() {
        var raw = U.readForm($form), type = raw.typeCompte || "COMPTANT", enCompte = estEnCompte(type);
        var rs = $.trim(raw.raisonSociale || "");

        $("#ap-nom").text(rs ? rs.toUpperCase() : "Raison sociale");
        $("#ap-avatar").text(rs ? U.initials(rs) : "?");
        var sub = [];
        sub.push(state.client ? state.client.code : "Code attribué à l'enregistrement");
        if (raw.sigle) sub.push($.trim(raw.sigle).toUpperCase());
        if (raw.ville) sub.push(raw.ville);
        $("#ap-sub").text(sub.join(" · "));

        var tags = ["<span class='light'>" + LIB_TYPE[type] + "</span>"];
        if (raw.secteur) tags.push("<span>" + U.esc(raw.secteur) + "</span>");
        if (enCompte && U.num(raw.remisePct) > 0) tags.push("<span>Remise " + U.fmt(U.num(raw.remisePct), U.num(raw.remisePct) % 1 ? 1 : 0) + " %</span>");
        if (type === "FORFAIT" && U.num(raw.montantForfait) > 0) tags.push("<span>" + U.money(U.num(raw.montantForfait)) + " / période</span>");
        if (raw.tarifAuto) tags.push("<span><i class='fa fa-bolt'></i> Tarif auto</span>");
        $("#ap-tags").html(tags.join(""));

        /* Liste de contrôle */
        var items = [
            { l: "Raison sociale", ok: !!rs, req: true },
            { l: "Coordonnées de l'entreprise", h: "téléphone ou email", ok: !!(raw.telStandard || raw.email) },
            { l: "Identifiants fiscaux", h: "NIU et RCCM", ok: !!($.trim(raw.niu) && $.trim(raw.rccm)), req: enCompte },
            { l: "Contact principal joignable", h: "nom et téléphone", ok: !!($.trim(raw.PRINCIPAL_nom) && $.trim(raw.PRINCIPAL_tel1)), req: enCompte }
        ];
        if (enCompte) items.push({ l: "Email de facturation", ok: !!$.trim(raw.emailFacturation), req: true });
        if (type === "FORFAIT") items.push({ l: "Montant du forfait", ok: U.num(raw.montantForfait) > 0, req: true });
        items.push({ l: "Agence de rattachement", ok: !!raw.agenceId });
        items.push({ l: "Fiche client (PDF)", ok: !!state.fiche });

        var nbOk = $.grep(items, function (i) { return i.ok; }).length, pct = Math.round(nbOk / items.length * 100);
        $("#ap-pct").text(pct + " %");
        $("#ap-bar").css("width", pct + "%").parent().toggleClass("green", pct === 100);
        $("#ap-checklist").html($.map(items, function (i) {
            return "<li class='" + (i.ok ? "ok" : "") + "'><i class='fa " + (i.ok ? "fa-check-circle" : "fa-circle-o") + "'></i>" +
                U.esc(i.l) + (i.req && !i.ok ? " <span class='cx-badge cx-badge-orange cx-no-dot'>obligatoire</span>" : "") +
                (i.h ? "<small>" + U.esc(i.h) + "</small>" : "") + "</li>";
        }).join(""));

        /* Étapes numérotées */
        $(".cx-step[data-step='entreprise']").toggleClass("done", !!rs && (!enCompte || !!($.trim(raw.niu) && $.trim(raw.rccm))));
        $(".cx-step[data-step='contacts']").toggleClass("done", !!($.trim(raw.PRINCIPAL_nom) && $.trim(raw.PRINCIPAL_tel1)));
        $(".cx-step[data-step='compte']").toggleClass("done", !enCompte ||
            (!!$.trim(raw.emailFacturation) && (type !== "FORFAIT" || U.num(raw.montantForfait) > 0)));
        $(".cx-step[data-step='documents']").toggleClass("done", !!state.fiche);

        /* Onglets de contacts renseignés */
        $.each(ROLES, function (_, r) {
            $("#contact-tabs a[data-tab='" + r + "'] .cx-tab-ok").toggleClass("cx-hidden", !$.trim(raw[r + "_nom"] || ""));
        });
    }

    function verifierDoublon() {
        var d = doublon(val("raisonSociale"));
        if (d) {
            var msg = "Un client porte déjà ce nom : <a href='client-fiche.html?id=" + d.id + "' target='_blank'>" +
                U.esc(d.raisonSociale) + "</a> (" + U.esc(d.code) + ", " + U.esc(CX.REF.STATUT_CLIENT[d.statut] ? CX.REF.STATUT_CLIENT[d.statut].label.toLowerCase() : d.statut) + ").";
            $("#dup-help").html("<i class='fa fa-exclamation-triangle'></i> " + msg).removeClass("cx-hidden").css("color", "var(--cx-orange)");
            $("#ap-dup-text").html(msg + " Vérifiez qu'il ne s'agit pas d'un doublon.");
            $("#ap-dup").removeClass("cx-hidden");
        } else {
            $("#dup-help").addClass("cx-hidden").empty();
            $("#ap-dup").addClass("cx-hidden");
        }
        return d;
    }

    /* =================================================================
       Fiche client (PDF)
       ================================================================= */
    function choisirFiche(f) {
        if (!f) return;
        if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) { U.toast("La fiche client doit être un fichier <b>PDF</b>.", "error"); return; }
        if (f.size > FICHE_MAX_OCTETS) { U.toast("Fichier trop volumineux (5 Mo maximum).", "error"); return; }
        state.fiche = f.name;
        state.ficheMeta = U.fmt(f.size / 1024, f.size < 102400 ? 1 : 0) + " Ko · sera envoyé à l'enregistrement";
        // TODO API : POST /commercial/clients/{id}/fiche (multipart/form-data, champ "ficheClient") - envoyé avec le formulaire
        afficherFiche(); marquerModifie();
    }
    function afficherFiche() {
        var has = !!state.fiche;
        $("#drop-fiche").toggleClass("cx-hidden", has);
        $("#fiche-current").toggleClass("cx-hidden", !has);
        $("#fiche-name").text(state.fiche || "");
        $("#fiche-meta").text(state.ficheMeta || "");
        rafraichirApercu();
    }

    /* =================================================================
       Chargement / réinitialisation
       ================================================================= */
    function remplir(c) {
        state.client = c;
        var data = c ? versFormulaire(c) : valeursVides();
        state.original = c ? $.extend({}, data) : {};
        remplirCommerciaux(data.commercial);
        U.fillForm($form, data);
        $form.find("select").trigger("change.select2");
        state.fiche = c && c.ficheClient ? c.ficheClient : null;
        state.ficheMeta = state.fiche ? "Fichier enregistré" : "";
        $("#ficheFile").val("");
        U.showErrors($form, []);
        $("#contact-tabs a").removeClass("has-error");
        ouvrirContact("PRINCIPAL");

        if (c) {
            document.title = "Commercial · Modifier " + c.raisonSociale + " - ClemenTino";
            $("#page-title").text("Modifier le compte client");
            $("#page-sub").text(c.code + " · " + c.raisonSociale);
            $("#crumb-current").html("<a href='client-fiche.html?id=" + c.id + "'>" + U.esc(c.raisonSociale) + "</a> / Modifier");
            $("#code-display").text(c.code).addClass("cx-mono");
            $("#ap-mode").text("Modification");
            $("#ap-statut").html(REF.badge(REF.STATUT_CLIENT, c.statut));
            $("#btn-save-new").addClass("cx-hidden");
            $(".cx-page-actions").prepend("<a class='cx-btn cx-btn-ghost' href='client-fiche.html?id=" + c.id + "'><i class='fa fa-id-card-o'></i> Voir la fiche</a>");
        } else {
            $("#page-title").text("Nouveau compte client");
            $("#page-sub").text("Les champs marqués * sont obligatoires");
            $("#crumb-current").text("Nouveau");
            $("#code-display").text("attribué à l'enregistrement").removeClass("cx-mono");
            $("#ap-mode").text("Nouveau compte");
            $("#ap-statut").empty();
        }
        appliquerAffichage();
        afficherFiche();
        verifierDoublon();
        state.dirty = false;
    }

    function marquerModifie() { state.dirty = true; }

    /* =================================================================
       Enregistrement
       ================================================================= */
    function enregistrer(puisNouveau) {
        if (state.saving) return;
        /* Remise en forme des numéros avant lecture */
        $form.find("[data-phone]").each(function () { $(this).val(telFormate($(this).val())); });
        var raw = U.readForm($form);
        var errs = valider(raw);
        afficherErreurs(errs);
        if (errs.length) {
            U.toast(errs.length === 1 ? "Un champ est à corriger." : errs.length + " champs sont à corriger.", "error");
            return;
        }
        var d = verifierDoublon();
        var suite = d ? U.confirm({
            title: "Client déjà existant ?",
            message: "<p>Un client nommé <b>" + U.esc(d.raisonSociale) + "</b> existe déjà (" + U.esc(d.code) + ").</p>" +
                "<p class='cx-muted'>Enregistrer quand même ce nouveau compte ?</p>",
            okText: "Enregistrer quand même"
        }) : $.Deferred().resolve().promise();
        suite.done(function () { envoyer(raw, puisNouveau); });
    }

    function envoyer(raw, puisNouveau) {
        var creation = !state.client, avant = state.client;
        var c = depuisFormulaire(raw);
        var $btn = puisNouveau ? $("#btn-save-new") : $("#btn-save");
        state.saving = true;
        U.busy($btn, true);

        // TODO API : POST /commercial/clients (création) | PUT /commercial/clients/{id} (modification)
        //            -> renvoie le client avec son code (CLI-xxxx) attribué par le serveur
        CX.api.save("clients", c).then(function (saved) {
            if (creation) {
                saved.code = saved.numero;               // le code client = numéro attribué
                return CX.api.save("clients", saved);
            }
            var action = "Fiche client modifiée";
            if (typeDe(avant) !== typeDe(saved)) action += " · type de compte : " + LIB_TYPE[typeDe(avant)] + " → " + LIB_TYPE[typeDe(saved)];
            // TODO API : historique écrit côté serveur lors du PUT
            return CX.api.log("clients", saved.id, action);
        }).done(function (saved) {
            state.dirty = false;
            var msg = creation ? "Compte client <b>" + U.esc(saved.raisonSociale) + "</b> créé (" + U.esc(saved.code) + ")."
                : "Modifications enregistrées.";
            if (puisNouveau) {
                state.saving = false;
                U.busy($btn, false);
                state.clients.push(saved);
                U.toast(msg + " Vous pouvez saisir le client suivant.");
                editId = null;
                remplir(null);
                $("html, body").animate({ scrollTop: 0 }, 200);
                $("#raisonSociale").focus();
            } else {
                /* Le toast est réaffiché par la fiche après la redirection */
                try { sessionStorage.setItem("cx_flash", msg); } catch (e) { /* stockage indisponible */ }
                U.toast(msg);
                setTimeout(function () { location.href = "client-fiche.html?id=" + saved.id; }, 500);
            }
        }).fail(function (e) {
            state.saving = false;
            U.busy($btn, false);
            U.toast("Enregistrement impossible : " + U.esc(e || "erreur inconnue"), "error");
        });
    }

    /* =================================================================
       Évènements
       ================================================================= */
    var apercuDiffere = U.debounce(rafraichirApercu, 120);
    $form.on("input change", "input, select, textarea", function () { marquerModifie(); apercuDiffere(); });
    $form.on("change", "[name='typeCompte'], [name='tarifPortee'], #tarifAuto", appliquerAffichage);

    /* Passage en compte : pré-remplissage des conditions par défaut */
    $form.on("change", "[name='typeCompte']", function () {
        if (!estEnCompte(typeCourant())) return;
        if (!val("emailFacturation")) $("#emailFacturation").val(val("email") || val("PRINCIPAL_email"));
        if (!val("delaiPaiement")) $("#delaiPaiement").val(CX.CONFIG.DELAI_PAIEMENT_JOURS);
        rafraichirApercu();
    });

    $("#raisonSociale").on("input", U.debounce(verifierDoublon, 300));

    /* Mise en forme à la sortie des champs */
    $form.on("blur", "[data-phone]", function () { $(this).val(telFormate($(this).val())); });
    $form.on("blur", "[data-email]", function () { $(this).val($.trim($(this).val()).toLowerCase()); });
    $form.on("blur", "#rccm, #niu, #sigle", function () { $(this).val($.trim($(this).val()).toUpperCase()); });

    /* Contacts */
    $("#contact-tabs").on("click", "a", function (e) { e.preventDefault(); ouvrirContact($(this).data("tab")); });
    $form.on("click", "[data-copy-principal]", function () {
        var cible = $(this).data("copy-principal");
        if (!val("PRINCIPAL_nom") && !val("PRINCIPAL_tel1")) { U.toast("Le contact principal n'est pas encore renseigné.", "warning"); return; }
        $.each(CHAMPS_CONTACT[cible], function (_, f) { $("#" + cible + "_" + f).val(val("PRINCIPAL_" + f)); });
        marquerModifie(); rafraichirApercu();
        U.toast("Contact principal copié dans « " + LIB_ROLE[cible] + " ».", "info");
    });
    $form.on("click", "[data-clear-contact]", function () {
        var cible = $(this).data("clear-contact");
        $.each(CHAMPS_CONTACT[cible], function (_, f) { $("#" + cible + "_" + f).val(""); });
        marquerModifie(); rafraichirApercu();
    });
    $("#btn-copy-email").on("click", function () {
        var e = val("PRINCIPAL_email") || val("email");
        if (!e) { U.toast("Aucun email à reprendre (entreprise ou contact principal).", "warning"); return; }
        $("#emailFacturation").val(e).trigger("change");
    });

    /* Fiche client : sélection, glisser-déposer, retrait */
    $("#ficheFile").on("change", function () { choisirFiche(this.files && this.files[0]); });
    $("#drop-fiche").on("dragenter dragover", function (e) { e.preventDefault(); $(this).addClass("over"); })
        .on("dragleave drop", function (e) { e.preventDefault(); $(this).removeClass("over"); })
        .on("drop", function (e) {
            var dt = e.originalEvent && e.originalEvent.dataTransfer;
            choisirFiche(dt && dt.files && dt.files[0]);
        });
    $("#btn-fiche-change").on("click", function () { $("#ficheFile").trigger("click"); });
    $("#btn-fiche-remove").on("click", function () {
        state.fiche = null; state.ficheMeta = ""; $("#ficheFile").val("");
        marquerModifie(); afficherFiche();
    });

    /* Boutons d'action */
    $form.on("submit", function (e) { e.preventDefault(); enregistrer(false); });
    $("#btn-save-new").on("click", function () { enregistrer(true); });
    $("#btn-cancel").on("click", function () {
        var dest = state.client ? "client-fiche.html?id=" + state.client.id : "clients-liste.html";
        if (!state.dirty) { location.href = dest; return; }
        U.confirm({
            title: "Abandonner la saisie ?",
            message: "Les informations saisies ne seront pas enregistrées.",
            okText: "Abandonner", okClass: "cx-btn-danger", cancelText: "Continuer la saisie"
        }).done(function () { state.dirty = false; location.href = dest; });
    });
    $(window).on("beforeunload", function () {
        if (state.dirty && !state.saving) return "Des modifications ne sont pas enregistrées.";
    });

    /* =================================================================
       Démarrage
       ================================================================= */
    initListes();
    // TODO API : GET /commercial/clients?champs=id,code,raisonSociale,statut (contrôle des doublons)
    //            ou mieux : GET /commercial/clients/doublons?raisonSociale=... à la volée
    CX.api.list("clients").done(function (clients) {
        state.clients = clients;
        if (!editId) { remplir(null); $("#raisonSociale").focus(); return; }
        // TODO API : GET /commercial/clients/{id}
        CX.api.get("clients", editId).done(function (c) { remplir(c); })
            .fail(function () { $form.addClass("cx-hidden"); $("#not-found").removeClass("cx-hidden"); });
    });
});

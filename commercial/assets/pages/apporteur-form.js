/* =====================================================================
   Commercial · Formulaire apporteur d'affaires (apporteur-form.html[?id=])
   ---------------------------------------------------------------------
   Cartes : 1 Identité, 2 Coordonnées, 3 Affectation & commission.
   Récapitulatif à droite : code, type, clients apportés, CA HT de l'année,
   commission estimée.
   Code : CRS + n° d'ordre + code de la ville d'affectation (CRS513DLA),
   attribué à la création (TODO API : attribué par le serveur) ; il ne
   change plus ensuite, même si la ville d'affectation change.
   Dépend de facturation.js (CX.fac) et apporteurs.js (CX.app).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, A = CX.app, USER = CX.CONFIG.USER;
    var editId = U.queryParam("id");
    var $form = $("#f-apporteur");
    var state = { apporteur: null, apporteurs: [], clients: [], factures: [], dirty: false, saving: false };

    /* ---------- Téléphone camerounais (mêmes règles que le formulaire client) ---------- */
    function telChiffres(v) {
        var s = String(v || "").replace(/[\s.\-()\/]/g, "");
        if (/^\+237/.test(s)) s = s.substr(4); else if (/^00237/.test(s)) s = s.substr(5); else if (/^237\d{9}$/.test(s)) s = s.substr(3);
        return s;
    }
    function telValide(v) { return /^[26]\d{8}$/.test(telChiffres(v)); }
    function telFormate(v) {
        var d = telChiffres(v);
        return /^[26]\d{8}$/.test(d) ? d.substr(0, 3) + " " + d.substr(3, 2) + " " + d.substr(5, 2) + " " + d.substr(7, 2) : $.trim(v || "");
    }
    function emailValide(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

    /* ---------- Listes ---------- */
    function initListes() {
        $("#ville").html("<option value=''></option>" + $.map(REF.VILLES, function (v) {
            return "<option value='" + U.esc(v.nom) + "'>" + U.esc(v.nom + " (" + v.code + ")") + "</option>";
        }).join("")).select2({ width: "100%", placeholder: "— Choisir —" });
        $("#agenceId").select2({ width: "100%", placeholder: "— Choisir la ville d'abord —" });
    }
    function remplirAgences(ville, valeur) {
        var liste = REF.agencesDe(ville);
        $("#agenceId").html("<option value=''></option>" + $.map(liste, function (a) { return "<option value='" + a.id + "'>" + U.esc(a.nom + " · " + a.ville) + "</option>"; }).join(""));
        if (valeur && $.grep(liste, function (a) { return String(a.id) === String(valeur); }).length) $("#agenceId").val(String(valeur));
        else if (liste.length === 1) $("#agenceId").val(String(liste[0].id));
        $("#agenceId").trigger("change.select2");
    }

    /* ---------- Modèle <-> formulaire ---------- */
    function versFormulaire(a) {
        return {
            type: a.type || "COMMERCIAL", nom: a.nom || "", prenoms: a.prenoms || "", sexe: a.sexe || null, dateNaissance: a.dateNaissance || "",
            matricule: a.matricule || "", tel1: a.tel1 || "", tel2: a.tel2 || "", email: a.email || "", adresse: a.adresse || "",
            ville: a.ville || "", agenceId: a.agenceId ? String(a.agenceId) : "", tauxCommission: a.tauxCommission != null ? a.tauxCommission : 3,
            baseCommission: a.baseCommission || "FACTURE", actif: a.statut !== "SUSPENDU", notes: a.notes || ""
        };
    }
    function depuisFormulaire(raw) {
        var base = state.apporteur ? $.extend(true, {}, state.apporteur) : {
            historique: [{ date: U.now(), user: USER.nom, action: "Apporteur d'affaires enregistré" }]
        };
        $.extend(base, {
            type: raw.type || "COMMERCIAL", nom: $.trim(raw.nom).toUpperCase(), prenoms: $.trim(raw.prenoms),
            sexe: raw.sexe || "", dateNaissance: raw.dateNaissance || "", matricule: $.trim(raw.matricule).toUpperCase(),
            tel1: telFormate(raw.tel1), tel2: telFormate(raw.tel2), email: $.trim(raw.email).toLowerCase(), adresse: $.trim(raw.adresse),
            ville: raw.ville, agenceId: raw.agenceId ? Number(raw.agenceId) : null,
            tauxCommission: U.num(raw.tauxCommission), baseCommission: raw.baseCommission || "FACTURE",
            statut: raw.actif ? "ACTIF" : "SUSPENDU", notes: $.trim(raw.notes)
        });
        if (!base.code) { base.code = A.prochainCode(state.apporteurs, base.ville); base.numero = base.code; }
        return base;
    }

    /* ---------- Validation ---------- */
    function valider(raw) {
        var errs = [];
        function err(f, m) { errs.push({ field: f, message: m }); }
        if (!$.trim(raw.nom)) err("nom", "Le nom est obligatoire.");
        if (!$.trim(raw.prenoms)) err("prenoms", "Les prénoms sont obligatoires.");
        if (!$.trim(raw.tel1)) err("tel1", "Le téléphone est obligatoire.");
        else if (!telValide(raw.tel1)) err("tel1", "Numéro invalide : 9 chiffres commençant par 2 ou 6 (+237 facultatif).");
        if ($.trim(raw.tel2) && !telValide(raw.tel2)) err("tel2", "Numéro invalide.");
        if ($.trim(raw.email) && !emailValide($.trim(raw.email))) err("email", "Adresse email invalide.");
        if (!raw.ville) err("ville", "Choisissez la ville d'affectation.");
        if (!raw.agenceId) err("agenceId", "Choisissez l'agence d'affectation.");
        var t = U.num(raw.tauxCommission);
        if ($.trim(raw.tauxCommission) === "" || t < 0 || t > 100) err("tauxCommission", "Taux entre 0 et 100 %.");
        if (raw.dateNaissance && raw.dateNaissance > U.addDays(U.today(), -365 * 16)) err("dateNaissance", "Date de naissance improbable (moins de 16 ans).");
        var mat = $.trim(raw.matricule).toUpperCase();
        if (mat) {
            var dbl = $.grep(state.apporteurs, function (a) { return String(a.id) !== String(editId) && String(a.matricule || "").toUpperCase() === mat; })[0];
            if (dbl) err("matricule", "Matricule déjà attribué à " + A.nom(dbl) + " (" + dbl.code + ").");
        }
        return errs;
    }

    /* ---------- Récapitulatif ---------- */
    function rafraichir() {
        var raw = U.readForm($form), a = state.apporteur;
        var nom = $.trim(($.trim(raw.prenoms) + " " + $.trim(raw.nom).toUpperCase()));
        var code = a ? a.code : (raw.ville ? A.prochainCode(state.apporteurs, raw.ville) : "—");
        $("#ap-nom").text(nom || "Prénoms NOM");
        $("#ap-avatar").text(nom ? U.initials(nom) : "?");
        var ag = REF.agence(raw.agenceId);
        $("#ap-sub").text([code, raw.ville, ag ? "agence " + ag.nom : ""].filter(Boolean).join(" · "));
        $("#code-display").text(a ? a.code : code + (raw.ville ? " (provisoire)" : ""));
        var type = REF.TYPES_APPORTEUR[raw.type] || {};
        var tags = ["<span class='light'>" + U.esc(type.label || "") + "</span>",
            "<span>" + U.fmt(U.num(raw.tauxCommission), U.num(raw.tauxCommission) % 1 ? 1 : 0) + " % · " + U.esc((REF.BASES_COMMISSION[raw.baseCommission] || {}).label || "") + "</span>"];
        if (!raw.actif) tags.push("<span>Suspendu</span>");
        $("#ap-tags").html(tags.join(""));

        /* Clients apportés + CA HT de l'année + commission estimée */
        if (a) {
            var mes = A.clientsDe(a.id, state.clients), y = U.today().substr(0, 4);
            var calcFac = A.calculer($.extend({}, a, { baseCommission: "FACTURE" }), state.clients, state.factures, y + "-01-01", y + "-12-31");
            var calc = A.calculer($.extend({}, a, { baseCommission: raw.baseCommission, tauxCommission: U.num(raw.tauxCommission) }), state.clients, state.factures, y + "-01-01", y + "-12-31");
            $("#ap-nb-clients").text(mes.length);
            $("#ap-ca").html(U.fmt(calcFac.montantBase) + " <small class='cx-muted'>F</small>");
            $("#ap-commission").text(U.money(calc.montant));
            $("#ap-clients").html(mes.length ? $.map(calcFac.details, function (d) {
                return "<li><span><a href='client-fiche.html?id=" + d.clientId + "'>" + U.esc(d.client) + "</a></span><b>" + U.money(d.base) + "</b></li>";
            }).join("") : "<li><span class='cx-muted'>Aucun client rattaché</span></li>");
        }
        $(".cx-step[data-step='identite']").toggleClass("done", !!($.trim(raw.nom) && $.trim(raw.prenoms)));
        $(".cx-step[data-step='coordonnees']").toggleClass("done", telValide(raw.tel1));
        $(".cx-step[data-step='affectation']").toggleClass("done", !!(raw.ville && raw.agenceId && $.trim(raw.tauxCommission) !== ""));
    }

    /* ---------- Chargement ---------- */
    function remplir(a) {
        state.apporteur = a;
        var data = versFormulaire(a || {
            ville: USER.ville,
            agenceId: (function () { var x = $.grep(REF.AGENCES, function (g) { return g.ville === USER.ville && g.nom === USER.agence; })[0]; return x ? x.id : ""; })()
        });
        U.fillForm($form, data);
        $("#ville").val(data.ville).trigger("change.select2");
        remplirAgences(data.ville, data.agenceId);
        if (a) {
            document.title = "Commercial · " + a.code + " " + A.nom(a) + " - ClemenTino";
            $("#page-title").text("Apporteur " + a.code);
            $("#page-sub").text(A.nom(a));
            $("#crumb-current").text(a.code);
            $("#ap-mode").text("Modification");
            $("#ap-statut").html(A.statutHtml(a));
            $("#btn-commissions").removeClass("cx-hidden").attr("href", "commissions.html?apporteur=" + a.id);
            var h = a.historique || [];
            $("#card-histo").removeClass("cx-hidden");
            $("#timeline").html(h.length ? $.map(h, function (x) {
                return "<li><div class='cx-tl-date'>" + U.toFr(x.date) + " · " + U.esc(x.user || "") + "</div><div class='cx-tl-text'>" + U.esc(x.action) + "</div></li>";
            }).join("") : "<li><div class='cx-tl-text cx-muted'>Aucun évènement</div></li>");
        }
        rafraichir();
        state.dirty = false;
    }

    /* ---------- Enregistrement ---------- */
    function enregistrer() {
        if (state.saving) return;
        $form.find("[data-phone]").each(function () { $(this).val(telFormate($(this).val())); });
        var raw = U.readForm($form), errs = valider(raw);
        U.showErrors($form, errs);
        if (errs.length) { U.toast(errs.length === 1 ? "Un champ est à corriger." : errs.length + " champs sont à corriger.", "error"); return; }
        var creation = !state.apporteur, avant = state.apporteur, ap = depuisFormulaire(raw);
        state.saving = true;
        U.busy($("#btn-save"), true);
        // TODO API : POST /commercial/apporteurs (création, code CRSnnnVVV attribué par le serveur) | PUT /commercial/apporteurs/{id}
        CX.api.save("apporteurs", ap).then(function (saved) {
            if (creation) return saved;
            var action = "Fiche modifiée";
            if (avant.tauxCommission !== saved.tauxCommission || avant.baseCommission !== saved.baseCommission)
                action += " · commission : " + A.taux(avant) + " " + A.baseLib(avant).toLowerCase() + " → " + A.taux(saved) + " " + A.baseLib(saved).toLowerCase();
            if (avant.statut !== saved.statut) action += " · " + (saved.statut === "ACTIF" ? "réactivé" : "suspendu");
            return CX.api.log("apporteurs", saved.id, action);
        }).done(function (saved) {
            state.dirty = false;
            U.toast(creation ? "Apporteur <b>" + U.esc(saved.code) + "</b> créé : " + U.esc(A.nom(saved)) + "." : "Modifications enregistrées.", "success");
            setTimeout(function () { location.href = creation ? "apporteurs-liste.html" : "apporteur-form.html?id=" + saved.id; }, 600);
        }).fail(function (e) {
            state.saving = false; U.busy($("#btn-save"), false);
            U.toast("Enregistrement impossible : " + U.esc(e || "erreur inconnue"), "error");
        });
    }

    /* ---------- Évènements ---------- */
    $form.on("input change", "input, select, textarea", U.debounce(function () { state.dirty = true; rafraichir(); }, 120));
    $("#ville").on("change", function () { remplirAgences($(this).val(), null); });
    $form.on("blur", "[data-phone]", function () { $(this).val(telFormate($(this).val())); });
    $form.on("submit", function (e) { e.preventDefault(); enregistrer(); });
    $(window).on("beforeunload", function () { if (state.dirty && !state.saving) return "Des modifications ne sont pas enregistrées."; });

    /* ---------- Démarrage ---------- */
    initListes();
    // TODO API : GET /commercial/apporteurs/{id}  (avec ses clients et son CA de l'année)
    $.when(CX.api.list("apporteurs"), CX.api.list("clients"), CX.api.list("factures")).done(function (aps, cls, fac) {
        state.apporteurs = aps; state.clients = cls; state.factures = fac;
        if (!editId) { remplir(null); $("#nom").focus(); return; }
        var a = $.grep(aps, function (x) { return String(x.id) === String(editId); })[0];
        if (!a) { $form.addClass("cx-hidden"); $("#not-found").removeClass("cx-hidden"); return; }
        remplir(a);
    });
});

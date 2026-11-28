/* =====================================================================
   ClemenTino 2.0 - Connexion (accueil/connexion.html)
   ---------------------------------------------------------------------
   Maquette : n'importe quel identifiant (≥ 2 caractères) et mot de passe
   (≥ 4 caractères) ouvre une session de démonstration puis redirige vers
   l'accueil. ?deconnexion=1 ferme la session.
   >>> INTÉGRATION SYMFONY <<< : formulaire du firewall (form_login) :
   action = path('login_check'), champs _username / _password,
   jeton CSRF {{ csrf_token('authenticate') }}, erreur = last_error ;
   « Se souvenir de moi » = _remember_me. L'entreprise vient du tenant.
   ===================================================================== */
$(function () {
    var U = CX.util, CLE_SESSION = "cx_session", CLE_ID = "cx_dernier_identifiant";

    /* Entreprises (charte + logo) */
    $("#lg-societe").html($.map(CX.societe.liste(), function (s) {
        return "<option value='" + U.esc(s.code) + "'" + (s.code === CX.societe.code() ? " selected" : "") + ">" + U.esc(s.nom) + "</option>";
    }).join(""));
    function logoSociete() {
        var s = CX.societe.trouver($("#lg-societe").val()) || CX.CONFIG.SOCIETE, src = CX.societe.logoUrl($.extend({}, s, { logo: s.icone || s.logo }));
        $("#lg-societe-logo").html(src ? "<img src='" + U.esc(src) + "' alt=''>" : "<b>" + U.esc(U.initials(s.nom)) + "</b>");
    }
    logoSociete();
    $("#lg-societe").on("change", function () {
        try { localStorage.setItem(CX.SOCIETE_CLE, this.value); } catch (e) { /* */ }
        CX.societe.init();   // applique la charte sans recharger
        logoSociete();
    });

    /* Déconnexion */
    if (U.queryParam("deconnexion")) {
        try { sessionStorage.removeItem(CLE_SESSION); localStorage.removeItem(CLE_SESSION); } catch (e) { /* */ }
        $("#lg-info-txt").text("Vous êtes déconnecté. À bientôt !");
        $("#lg-info").removeClass("cx-hidden");
    }
    try { var dernier = localStorage.getItem(CLE_ID); if (dernier) { $("#lg-id").val(dernier); $("#lg-souvenir").prop("checked", true); $("#lg-mdp").focus(); } } catch (e) { /* */ }

    /* Afficher / masquer le mot de passe, avertissement majuscules */
    $("#lg-oeil").on("click", function () {
        var $i = $("#lg-mdp"), voir = $i.attr("type") === "password";
        $i.attr("type", voir ? "text" : "password");
        $(this).attr("aria-label", voir ? "Masquer le mot de passe" : "Afficher le mot de passe").find(".fa").toggleClass("fa-eye", !voir).toggleClass("fa-eye-slash", voir);
    });
    $("#lg-mdp").on("keyup keydown", function (e) {
        if (e.originalEvent && e.originalEvent.getModifierState) $("#lg-maj").toggleClass("cx-hidden", !e.originalEvent.getModifierState("CapsLock"));
    });

    function erreur(msg, champ) {
        $("#lg-erreur-txt").text(msg);
        $("#lg-erreur").removeClass("cx-hidden");
        $(".ac-input").removeClass("has-error");
        if (champ) $(champ).closest(".ac-input").addClass("has-error").end().focus();
    }
    $("#lg-oubli").on("click", function (e) {
        e.preventDefault();
        var id = $.trim($("#lg-id").val());
        // TODO API : POST /mot-de-passe-oublie  { identifiant } (lien de réinitialisation par e-mail)
        $("#lg-erreur").addClass("cx-hidden");
        $("#lg-info-txt").text(id ? "Si un compte correspond à « " + id + " », un lien de réinitialisation vient d'être envoyé." : "Saisissez d'abord votre nom d'utilisateur ou votre e-mail, puis cliquez à nouveau sur « Mot de passe oublié ? ».");
        $("#lg-info").removeClass("cx-hidden");
        if (!id) $("#lg-id").focus();
    });

    $("#lg-form").on("submit", function (e) {
        e.preventDefault();
        $("#lg-erreur, #lg-info").addClass("cx-hidden");
        var id = $.trim($("#lg-id").val()), mdp = $("#lg-mdp").val();
        if (id.length < 2) return erreur("Saisissez votre nom d'utilisateur ou votre adresse e-mail.", "#lg-id");
        if (mdp.length < 4) return erreur("Mot de passe trop court.", "#lg-mdp");
        var $b = $("#lg-ok").prop("disabled", true).html("<i class='fa fa-circle-o-notch fa-spin'></i> Connexion…");
        // TODO API : soumission au firewall Symfony (login_check) ; ici session de démonstration
        setTimeout(function () {
            try {
                var session = JSON.stringify({ identifiant: id, societe: $("#lg-societe").val(), date: U.now() });
                sessionStorage.setItem(CLE_SESSION, session);
                if ($("#lg-souvenir").is(":checked")) localStorage.setItem(CLE_ID, id); else localStorage.removeItem(CLE_ID);
            } catch (err) { /* navigation privée */ }
            $b.html("<i class='fa fa-check'></i> Bienvenue");
            window.location.href = "index.html";
        }, 550);
    });
});

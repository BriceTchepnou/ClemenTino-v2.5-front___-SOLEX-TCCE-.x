/* =====================================================================
   Commercial · Facturation - fonctions partagées
   ---------------------------------------------------------------------
   Utilisé par factures-suivi.html et facture.html (chargé AVANT le JS
   de la page). Expose CX.fac :
     CX.fac.paye(f) / reste(f)      montants payés / restant dus (TTC)
     CX.fac.netHT(f)                montant HT après remise
     CX.fac.enRetard(f)             reste > 0 et échéance dépassée
     CX.fac.joursRetard(f)          nombre de jours de retard (0 si à jour)
     CX.fac.statutHtml(f)           badge de statut (+ badge « En retard »)
     CX.fac.peutPayer(f)            un paiement peut-il être enregistré ?
     CX.fac.mailtoEnvoi(f, client)  lien mailto: d'envoi de la facture
     CX.fac.marquerEnvoyee(f, c)    ouvre le mailto + statut ENVOYEE + historique
     CX.fac.ouvrirPaiement(f, cb)   modale « Enregistrer un paiement »
   >>> INTÉGRATION SYMFONY <<<
   La modale de paiement est injectée par JS : elle peut devenir un
   include Twig (_modal_paiement.html.twig) partagé par les deux écrans.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.fac = (function () {
    var U = CX.util;

    /* ---------- Calculs ---------- */
    function paye(f) {
        var s = 0;
        $.each(f.paiements || [], function (_, p) { s += Number(p.montant) || 0; });
        return U.round(s);
    }
    function reste(f) {
        if (f.statut === "ANNULEE") return 0;
        return Math.max(0, U.round(f.montantTTC) - paye(f));
    }
    function netHT(f) { return U.round(f.montantHT) - U.round(f.remise || 0); }

    /* Une facture compte dans l'encours dès qu'elle est émise (ni brouillon, ni annulée) */
    function active(f) { return f.statut !== "BROUILLON" && f.statut !== "ANNULEE"; }
    function enRetard(f) { return active(f) && reste(f) > 0 && !!f.dateEcheance && f.dateEcheance < U.today(); }
    function joursRetard(f) { return enRetard(f) ? U.daysBetween(f.dateEcheance, U.today()) : 0; }
    function peutPayer(f) { return active(f) && reste(f) > 0; }

    function statutHtml(f) {
        return CX.REF.badge(CX.REF.STATUT_FACTURE, f.statut) +
            (enRetard(f) ? " <span class='cx-badge cx-badge-red'>En retard</span>" : "");
    }

    /* ---------- Contact de facturation du client ---------- */
    function emailClient(c) {
        if (!c) return "";
        return c.emailFacturation || c.email || (c.contacts && c.contacts[0] ? c.contacts[0].email : "") || "";
    }
    function contactClient(c) {
        var k = c && c.contacts && c.contacts[0];
        return k && k.nom ? k.nom : "Madame, Monsieur";
    }

    /* ---------- Envoi de la facture par e-mail ---------- */
    function mailtoEnvoi(f, c) {
        var S = CX.CONFIG.SOCIETE;
        var objet = "Facture " + f.numero + " - " + S.nom;
        var corps = "Bonjour " + contactClient(c) + ",\n\n" +
            "Veuillez trouver ci-jointe notre facture n° " + f.numero + " du " + U.toFr(f.dateEmission) +
            ", relative aux expéditions livrées du " + U.toFr(f.periodeDu) + " au " + U.toFr(f.periodeAu) + ".\n\n" +
            "Montant TTC : " + U.money(f.montantTTC) + "\n" +
            "Date d'échéance : " + U.toFr(f.dateEcheance) + "\n\n" +
            "Règlement par virement : " + S.banque + "\n\n" +
            "Nous restons à votre disposition pour toute information.\n\n" +
            "Cordialement,\n" + CX.CONFIG.USER.nom + "\nService facturation - " + S.nom + "\n" + S.tel + " · " + S.email;
        return "mailto:" + encodeURIComponent(emailClient(c)) +
            "?subject=" + encodeURIComponent(objet) + "&body=" + encodeURIComponent(corps);
    }

    /* Ouvre la messagerie + passe la facture à ENVOYEE (sauf si déjà partiellement payée)
       Retourne une promesse résolue avec la facture mise à jour. */
    function marquerEnvoyee(f, c) {
        var dfd = $.Deferred();
        if (!active(f)) { U.toast("Seule une facture émise peut être envoyée.", "warning"); return dfd.reject().promise(); }
        window.location.href = mailtoEnvoi(f, c);
        var maj = $.extend(true, {}, f);
        if (maj.statut === "EMISE") maj.statut = "ENVOYEE";
        maj.dateEnvoi = U.today();
        // TODO API : POST /commercial/factures/{id}/envoyer (envoi Symfony Mailer avec la facture PDF en pièce jointe)
        CX.api.save("factures", maj).then(function () {
            return CX.api.log("factures", maj.id, "Facture envoyée par e-mail à " + (emailClient(c) || "(adresse non renseignée)"));
        }).done(function (r) {
            U.toast("Facture " + U.esc(maj.numero) + " marquée « Envoyée ». Pensez à joindre le PDF au message.", "success");
            dfd.resolve(r);
        }).fail(function (e) { U.toast(e || "Erreur lors de l'enregistrement", "error"); dfd.reject(e); });
        return dfd.promise();
    }

    /* ---------- Modale « Enregistrer un paiement » ---------- */
    function modalHtml() {
        var modes = $.map(CX.REF.MODES_PAIEMENT, function (m) { return "<option>" + U.esc(m) + "</option>"; }).join("");
        return "" +
            "<div class='modal fade' id='m-paiement' tabindex='-1' role='dialog'><div class='modal-dialog' style='max-width:520px'><div class='modal-content'>" +
            "<div class='modal-header'><button type='button' class='close' data-dismiss='modal'>&times;</button>" +
            "<h4 class='modal-title'><i class='fa fa-money'></i>Enregistrer un paiement</h4></div>" +
            "<div class='modal-body'>" +
            "  <div class='cx-block' style='margin-bottom:14px'>" +
            "    <div class='cx-sum-line'><span>Facture</span><b id='pm-numero'></b></div>" +
            "    <div class='cx-sum-line'><span>Client</span><b id='pm-client'></b></div>" +
            "    <div class='cx-sum-line'><span>Total TTC</span><b id='pm-ttc'></b></div>" +
            "    <div class='cx-sum-line'><span>Déjà encaissé</span><b id='pm-paye'></b></div>" +
            "    <div class='cx-sum-line'><span>Reste à payer</span><b id='pm-reste' style='color:var(--cx-red)'></b></div>" +
            "  </div>" +
            "  <div class='row'>" +
            "    <div class='col-sm-6 cx-field'><label class='cx-label req' for='pm-date'>Date du paiement</label><input type='date' class='form-control' id='pm-date'></div>" +
            "    <div class='col-sm-6 cx-field'><label class='cx-label req' for='pm-montant'>Montant (FCFA)</label><input type='text' class='form-control' id='pm-montant' style='text-align:right'></div>" +
            "    <div class='col-sm-6 cx-field'><label class='cx-label req' for='pm-mode'>Mode de paiement</label><select class='form-control' id='pm-mode'>" + modes + "</select></div>" +
            "    <div class='col-sm-6 cx-field'><label class='cx-label' for='pm-reference'>Référence <span class='cx-opt'>(n° chèque, virement…)</span></label><input type='text' class='form-control' id='pm-reference'></div>" +
            "  </div>" +
            "  <div class='cx-note cx-note-info' id='pm-info' style='margin-bottom:0'></div>" +
            "</div>" +
            "<div class='modal-footer'><button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button>" +
            "<button type='button' class='cx-btn cx-btn-success' id='pm-ok'><i class='fa fa-check'></i> Enregistrer le paiement</button></div>" +
            "</div></div></div>";
    }

    /* Ouvre la modale. onDone(factureMiseAJour) est appelé après enregistrement. */
    function ouvrirPaiement(f, onDone) {
        if (!peutPayer(f)) { U.toast("Aucun paiement à enregistrer sur cette facture.", "info"); return; }
        $("#m-paiement").remove();
        var $m = $(modalHtml()).appendTo("body");
        var r = reste(f);
        $m.find("#pm-numero").text(f.numero);
        $m.find("#pm-client").text(CX.api.clientNom(f.clientId));
        $m.find("#pm-ttc").text(U.money(f.montantTTC));
        $m.find("#pm-paye").text(U.money(paye(f)));
        $m.find("#pm-reste").text(U.money(r));
        $m.find("#pm-date").val(U.today());
        $m.find("#pm-montant").val(U.fmt(r));

        function majInfo() {
            var m = U.round(U.num($m.find("#pm-montant").val()));
            var apres = r - m;
            var txt;
            if (m <= 0) txt = "Saisissez un montant positif.";
            else if (apres < 0) txt = "Le montant dépasse le reste à payer de " + U.money(-apres) + ".";
            else if (apres === 0) txt = "La facture sera soldée : statut <b>Payée</b>.";
            else txt = "Il restera " + U.money(apres) + " à encaisser : statut <b>Partiellement payée</b>.";
            $m.find("#pm-info").toggleClass("cx-note-err", m <= 0 || apres < 0).toggleClass("cx-note-info", !(m <= 0 || apres < 0))
                .html("<i class='fa fa-info-circle'></i><div>" + txt + "</div>");
        }
        $m.on("input", "#pm-montant", majInfo);
        majInfo();

        $m.on("click", "#pm-ok", function () {
            var m = U.round(U.num($m.find("#pm-montant").val()));
            var date = $m.find("#pm-date").val();
            if (!date) { U.toast("Indiquez la date du paiement.", "warning"); return; }
            if (m <= 0 || m > r) { U.toast("Montant invalide : il doit être compris entre 1 et " + U.money(r) + ".", "warning"); return; }
            var $b = $(this);
            U.busy($b, true);
            var maj = $.extend(true, {}, f);
            maj.paiements = maj.paiements || [];
            maj.paiements.push({ date: date, montant: m, mode: $m.find("#pm-mode").val(), reference: $.trim($m.find("#pm-reference").val()) });
            maj.statut = reste(maj) === 0 ? "PAYEE" : "PARTIELLE";
            // TODO API : POST /commercial/factures/{id}/paiements  { date, montant, mode, reference }
            CX.api.save("factures", maj).then(function () {
                return CX.api.log("factures", maj.id, "Paiement de " + U.money(m) + " (" + $m.find("#pm-mode").val() + ") enregistré");
            }).done(function (res) {
                U.toast("Paiement enregistré - facture " + U.esc(maj.numero) + " : " +
                    CX.REF.STATUT_FACTURE[maj.statut].label.toLowerCase() + ".", "success");
                $m.modal("hide");
                if (onDone) onDone(res);
            }).fail(function (e) { U.toast(e || "Erreur lors de l'enregistrement", "error"); U.busy($b, false); });
        });
        $m.on("shown.bs.modal", function () { $m.find("#pm-montant").focus().select(); });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    return {
        paye: paye, reste: reste, netHT: netHT, active: active, enRetard: enRetard, joursRetard: joursRetard,
        peutPayer: peutPayer, statutHtml: statutHtml, emailClient: emailClient, contactClient: contactClient,
        mailtoEnvoi: mailtoEnvoi, marquerEnvoyee: marquerEnvoyee, ouvrirPaiement: ouvrirPaiement
    };
})();

/* =====================================================================
   ClemenTino 2.0 - Module GUICHET - réimpression d'un reçu (recu.html?id=)
   ---------------------------------------------------------------------
   Paramètres d'URL : id (obligatoire), print=1 (lance l'impression).
   Le rendu de la feuille est partagé avec la saisie : CX.recu.html().
   ===================================================================== */
$(function () {
    var U = CX.util, G = CX.guichet, id = U.queryParam("id"), exp = null;

    function erreur(msg) {
        $("#gx-outils").find("#btn-pdf, #btn-imprimer, #btn-wa").addClass("cx-hidden");
        $("#gx-recu").html("<div class='cx-empty'><i class='fa fa-file-o'></i><b>" + U.esc(msg) + "</b><a href='expeditions-liste.html'>Retour à l'historique des saisies</a></div>");
    }
    if (!id) { erreur("Aucune expédition indiquée."); return; }

    // TODO API : GET /guichet/expeditions/{id}
    CX.api.get("expeditions", id).done(function (e0) {
        exp = G.normaliser(e0);
        document.title = "Reçu " + exp.nRt + " - Guichet ClemenTino";
        $("#h-numero").text(exp.nRt);
        $("#h-statut").html(G.statutBadge(exp.statut));
        $("#gx-recu").html(CX.recu.html(e0));

        var al = [];
        if (exp.statut === "ANNULEE") {
            al.push("<div class='cx-note cx-note-err'><i class='fa fa-ban'></i><div><b>Expédition annulée</b>" +
                (exp.annulation ? " le " + U.esc(U.toFr(exp.annulation.date)) + " par " + U.esc(exp.annulation.user) + " : " + U.esc(exp.annulation.motif) : "") +
                ". Le reçu est réimprimé avec la mention « ANNULÉE ».</div></div>");
        }
        if (exp.factureId) {
            al.push("<div class='cx-note cx-note-info'><i class='fa fa-file-text-o'></i><div>Expédition facturée : <a href='" +
                G.lienCommercial("facture.html?id=" + exp.factureId) + "'>voir la facture</a>.</div></div>");
        }
        if (!e0.montants) {
            al.push("<div class='cx-note cx-note-info'><i class='fa fa-info-circle'></i><div>Expédition enregistrée avant le module Guichet : le détail (colis, contacts, ventilation du montant) est reconstitué à partir des informations disponibles.</div></div>");
        }
        $("#gx-alertes").html(al.join(""));

        var wa = G.whatsapp(exp, "EXPEDITEUR");
        $("#btn-wa").attr("href", wa || "#").toggleClass("cx-hidden", !wa || exp.statut === "ANNULEE");
        if (G.estModifiable(exp)) $("#btn-corriger").removeClass("cx-hidden").attr("href", "expedition-form.html?id=" + exp.id);

        if ((e0.historique || []).length) {
            $("#gx-histo-card").removeClass("cx-hidden");
            $("#gx-historique").html($.map(e0.historique, function (h) {
                return "<li><div class='cx-tl-date'>" + U.esc(U.toFr(h.date)) + " · " + U.esc(h.user) + "</div><div class='cx-tl-text'>" + U.esc(h.action) + "</div></li>";
            }).join(""));
        }
        if (U.queryParam("print") === "1") setTimeout(function () { window.print(); }, 500);
    }).fail(function () { erreur("Expédition introuvable."); });

    $("#btn-imprimer").on("click", function () { window.print(); });
    $("#btn-pdf").on("click", function () {
        if (!exp) return;
        // TODO API (option) : GET /guichet/expeditions/{id}/recu.pdf  (PDF serveur, ex. KnpSnappyBundle)
        CX.recu.telechargerPdf("#gx-recu .gx-sheet", "Reçu " + exp.nRt, this);
    });
    $("#btn-wa").on("click", function () {
        if (!exp) return;
        // TODO API : POST /guichet/expeditions/{id}/whatsapp  (renvoi du reçu, tracé dans l'historique)
        CX.api.log("expeditions", exp.id, "Reçu renvoyé par WhatsApp à l'expéditeur");
    });
});

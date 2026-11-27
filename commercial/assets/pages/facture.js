/* =====================================================================
   Commercial · Facture imprimable A4 (facture.html?id=ID)
   ---------------------------------------------------------------------
   Affiche la facture (en-tête société, client, détail des expéditions,
   totaux, montant en lettres, paiements, conditions, cachet) et propose :
   Imprimer, Télécharger en PDF (via la boîte d'impression du navigateur),
   Envoyer (mailto), Enregistrer un paiement, Émettre (si brouillon).
   Paramètres d'URL : id (obligatoire), print=1 (lance l'impression).
   Dépend de assets/pages/facturation.js (CX.fac).
   ===================================================================== */
$(function () {
    var U = CX.util, F = CX.fac, S = CX.CONFIG.SOCIETE, today = U.today();
    var id = U.queryParam("id");
    var facture = null, client = null;

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function capitale(s) { return s.charAt(0).toUpperCase() + s.substr(1); }
    function erreur(txt) {
        $("#fx-doc, #fx-histo-card").addClass("cx-hidden");
        $("#fx-outils button").addClass("cx-hidden");
        $("#fx-erreur").removeClass("cx-hidden");
        $("#fx-erreur-texte").text(txt);
    }

    /* ------------------------------------------------------------------
       Chargement
       ------------------------------------------------------------------ */
    function charger() {
        if (!id) { erreur("Aucun identifiant de facture n'a été fourni (paramètre « id »)."); return $.Deferred().reject().promise(); }
        // TODO API : GET /commercial/factures/{id}  (facture + client + expéditions en une seule réponse JSON)
        return CX.api.get("factures", id).then(function (f) {
            facture = f;
            return $.when(
                CX.api.get("clients", f.clientId),
                CX.api.list("expeditions", function (e) { return $.inArray(e.id, f.expeditionIds || []) >= 0; })
            );
        }).done(function (c, exps) {
            client = c;
            rendre(facture, client, exps);
        }).fail(function (e) { if (e) erreur(String(e)); });
    }

    /* ------------------------------------------------------------------
       Rendu du document
       ------------------------------------------------------------------ */
    function rendre(f, c, exps) {
        var statut = CX.REF.STATUT_FACTURE[f.statut] || { label: f.statut };
        document.title = "Facture " + f.numero + " - " + c.raisonSociale;   // = nom proposé pour le PDF

        /* Barre d'outils */
        $("#h-numero").text(f.numero);
        $("#h-statut").html(F.statutHtml(f));
        $("#btn-emettre").toggleClass("cx-hidden", f.statut !== "BROUILLON");
        $("#btn-paiement").toggleClass("cx-hidden", !F.peutPayer(f));
        $("#btn-envoyer").toggleClass("cx-hidden", !F.active(f));

        var alertes = [];
        if (f.statut === "BROUILLON") alertes.push(note("warn", "fa-pencil", "<b>Brouillon</b> - cette facture n'a pas encore été émise. Vérifiez-la puis cliquez sur « Émettre »."));
        if (f.statut === "ANNULEE") alertes.push(note("err", "fa-ban", "<b>Facture annulée</b>" + (f.dateAnnulation ? " le " + U.toFr(f.dateAnnulation) : "") + " - ses expéditions ont été libérées."));
        if (F.enRetard(f)) alertes.push(note("err", "fa-exclamation-triangle", "Échéance dépassée de <b>" + F.joursRetard(f) + " jours</b> - reste à payer : <b>" + U.money(F.reste(f)) +
            "</b>. <a href='factures-suivi.html?relance=" + f.id + "'>Relancer le client</a>"));
        if (exps.length !== (f.expeditionIds || []).length) alertes.push(note("warn", "fa-info-circle",
            ((f.expeditionIds || []).length - exps.length) + " expédition(s) rattachée(s) à la facture sont introuvables."));
        $("#fx-alertes").html(alertes.join(""));

        /* Filigrane */
        var fili = f.statut === "BROUILLON" ? "BROUILLON" : f.statut === "ANNULEE" ? "ANNULÉE" : "";
        $("#fx-filigrane").text(fili).toggleClass("cx-hidden", !fili).toggleClass("fx-watermark-red", f.statut === "ANNULEE");

        /* En-tête société */
        $("#fx-logo-mark").text(U.initials(S.nom));
        $("#fx-soc-nom, #fx-soc-nom2").text(S.nom);
        $("#fx-soc-slogan").text(S.slogan || "");
        $("#fx-soc-coord").html(
            U.esc(S.adresse) + "<br>Tél. " + U.esc(S.tel) + " · " + U.esc(S.email) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu));

        /* Bloc titre */
        $("#fx-numero").text(f.numero);
        $("#fx-dateEmission").text(U.toFr(f.dateEmission));
        $("#fx-dateEcheance").text(U.toFr(f.dateEcheance));
        $("#fx-periode").text("du " + U.toFr(f.periodeDu) + " au " + U.toFr(f.periodeAu));
        $("#fx-codeClient").text(c.code || c.numero || "—");

        /* Client */
        var k = c.contacts && c.contacts[0];
        $("#fx-client-nom").text(c.raisonSociale);
        $("#fx-client-adresse").html(U.esc(c.adresse || "") + (c.localisation ? "<br>" + U.esc(c.localisation) : "") +
            (c.ville && (c.adresse || "").indexOf(c.ville) < 0 ? "<br>" + U.esc(c.ville) : ""));
        $("#fx-client-ids").html([c.niu ? "NIU : " + U.esc(c.niu) : "", c.rccm ? "RCCM : " + U.esc(c.rccm) : ""].filter(Boolean).join("<br>"));
        $("#fx-client-contact").html(k && k.nom ? "À l'attention de " + U.esc(k.nom) + (k.titre ? ", " + U.esc(k.titre) : "") +
            (k.tel1 ? "<br>Tél. " + U.esc(k.tel1) : "") + (F.emailClient(c) ? " · " + U.esc(F.emailClient(c)) : "") : "");

        /* Objet */
        $("#fx-objet").html("Prestations de messagerie et de transport de colis : <b>" + pluriel(exps.length, "expédition") +
            " livrée" + (exps.length > 1 ? "s" : "") + "</b> du " + U.toFrLong(f.periodeDu) + " au " + U.toFrLong(f.periodeAu) + ".");
        $("#fx-notes").text(f.notes || "").toggle(!!f.notes);

        /* Lignes (triées par date puis N° RT) */
        exps.sort(function (a, b) { return a.dateExp === b.dateExp ? (a.nRt > b.nRt ? 1 : -1) : (a.dateExp > b.dateExp ? 1 : -1); });
        var tot = 0, colis = 0, poids = 0;
        $("#fx-lignes").html($.map(exps, function (e) {
            tot += U.round(e.montant); colis += Number(e.nbColis) || 0; poids += Number(e.poids) || 0;
            return "<tr>" +
                "<td class='fx-nowrap'>" + U.toFr(e.dateExp) + "</td>" +
                "<td class='fx-nowrap fx-mono'>" + U.esc(e.nRt) + "</td>" +
                "<td class='fx-mono'>" + (e.nRtMan ? U.esc(e.nRtMan) : "—") + "</td>" +
                "<td class='fx-nowrap'>" + U.esc(e.villeDep) + " → " + U.esc(e.villeDest) + "<div class='fx-sub'>" + U.esc(e.bureauDep) + " → " + U.esc(e.bureauDest) + "</div></td>" +
                "<td>" + U.esc(e.destinataire) + "</td>" +
                "<td>" + U.esc(e.contenu) + "</td>" +
                "<td class='num'>" + U.fmt(e.nbColis) + "</td>" +
                "<td class='num'>" + U.fmt(e.poids, e.poids % 1 ? 1 : 0) + "</td>" +
                "<td class='num fx-nowrap'>" + U.fmt(e.montant) + "</td></tr>";
        }).join("") || "<tr><td colspan='9' class='fx-vide'>Aucune expédition</td></tr>");
        $("#fx-nb").text(pluriel(exps.length, "expédition"));
        $("#fx-tot-colis").text(U.fmt(colis));
        $("#fx-tot-poids").text(U.fmt(poids, poids % 1 ? 1 : 0));
        $("#fx-soustotal").text(U.fmt(tot));

        /* Totaux (valeurs enregistrées sur la facture, calculées à la création) */
        $("#fx-ht").text(U.money(f.montantHT));
        $("#fx-row-remise").toggle(!!f.remise);
        $("#fx-remisePct").text(f.remisePct ? "(" + U.fmt(f.remisePct, f.remisePct % 1 ? 2 : 0) + " %)" : "");
        $("#fx-remise").text("- " + U.money(f.remise || 0));
        $("#fx-net").text(U.money(F.netHT(f)));
        $("#fx-taux").text(U.fmt(f.tauxTva == null ? CX.CONFIG.TVA : f.tauxTva, 2) + " %");
        $("#fx-tva").text(U.money(f.tva));
        $("#fx-ttc").text(U.money(f.montantTTC));
        var paye = F.paye(f);
        $("#fx-row-paye, #fx-row-reste").toggleClass("cx-hidden", !paye || f.statut === "ANNULEE");
        $("#fx-paye").text("- " + U.money(paye));
        $("#fx-reste").text(U.money(F.reste(f)));

        $("#fx-lettres").text(capitale(U.enLettres(f.montantTTC)) + " (" + U.fmt(f.montantTTC) + ") francs CFA TTC.");

        /* Paiements reçus */
        var p = f.paiements || [];
        $("#fx-paiements").html(p.length ? "<div class='fx-box-title'>Paiements reçus</div><table class='fx-paie'><thead><tr><th>Date</th><th>Mode</th><th>Référence</th>" +
            "<th class='num'>Montant</th></tr></thead><tbody>" + $.map(p, function (x) {
                return "<tr><td>" + U.toFr(x.date) + "</td><td>" + U.esc(x.mode) + "</td><td>" + U.esc(x.reference || "—") + "</td><td class='num fx-nowrap'>" + U.money(x.montant) + "</td></tr>";
            }).join("") + "</tbody></table>" +
            (f.statut === "PAYEE" ? "<div class='fx-acquittee'><i class='fa fa-check-circle'></i> Facture acquittée le " + U.toFr(p[p.length - 1].date) + "</div>"
                : "<div class='fx-small'>Reste à payer : <b>" + U.money(F.reste(f)) + "</b></div>") : "");

        /* Conditions + banque */
        var delai = U.daysBetween(f.dateEmission, f.dateEcheance);
        $("#fx-conditions").html("Paiement à <b>" + delai + " jours</b> date de facture, soit au plus tard le <b>" + U.toFrLong(f.dateEcheance) + "</b>, " +
            "par virement bancaire ou par chèque à l'ordre de " + U.esc(S.nom) + ". Merci de rappeler le n° de facture <b>" + U.esc(f.numero) +
            "</b> dans votre règlement. Toute réclamation doit nous parvenir dans les 8 jours suivant la réception de la facture.");
        $("#fx-banque").html(U.esc(S.banque));

        /* Signature */
        $("#fx-fait").html("Fait à " + U.esc(capitale((CX.CONFIG.USER.ville || "Douala").toLowerCase())) + ", le " + U.toFrLong(f.dateEmission));
        $("#fx-signataire").text("Le service facturation");

        /* Pied de page : mentions légales */
        $("#fx-pied").html("<b>" + U.esc(S.nom) + "</b> · " + U.esc(S.adresse) + " · Tél. " + U.esc(S.tel) + " · " + U.esc(S.email) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu) + " · Banque : " + U.esc(S.banque) +
            "<br>TVA au taux de " + U.fmt(CX.CONFIG.TVA, 2) + " % (TVA 17,5 % + centimes additionnels communaux 10 %). " +
            "Facture " + U.esc(f.numero) + " - " + U.esc(statut.label.toLowerCase()) + ".");

        /* Historique */
        var h = f.historique || [];
        $("#fx-historique").html(h.length ? $.map(h, function (x) {
            return "<li><div class='cx-tl-date'>" + U.toFr(x.date) + " · " + U.esc(x.user || "") + "</div><div class='cx-tl-text'>" + U.esc(x.action) + "</div></li>";
        }).join("") : "<li><div class='cx-tl-text cx-muted'>Aucun évènement</div></li>");

        $("#fx-doc, #fx-histo-card").removeClass("cx-hidden");
    }
    function note(type, icon, html) { return "<div class='cx-note cx-note-" + type + "'><i class='fa " + icon + "'></i><div>" + html + "</div></div>"; }

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */
    $("#btn-imprimer").on("click", function () { window.print(); });
    $("#btn-pdf").on("click", function () {
        // TODO API (option) : GET /commercial/factures/{id}.pdf  (PDF généré côté serveur, ex. KnpSnappyBundle)
        U.toast("Dans la fenêtre d'impression, choisissez la destination « Enregistrer au format PDF ».", "info");
        setTimeout(function () { window.print(); }, 400);
    });
    $("#btn-envoyer").on("click", function () {
        if (facture) F.marquerEnvoyee(facture, client).done(charger);
    });
    $("#btn-paiement").on("click", function () {
        if (facture) F.ouvrirPaiement(facture, charger);
    });
    $("#btn-emettre").on("click", function () {
        if (!facture || facture.statut !== "BROUILLON") return;
        var f = facture, delai = client.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS;
        var dateEm = f.dateEmission > today ? f.dateEmission : today;
        U.confirm({
            title: "Émettre la facture " + f.numero,
            message: "<p>Date d'émission : <b>" + U.toFrLong(dateEm) + "</b> - échéance : <b>" + U.toFrLong(U.addDays(dateEm, delai)) + "</b>.</p>" +
                "<p class='cx-muted'>Une fois émise, la facture n'est plus modifiable : elle ne peut qu'être annulée.</p>",
            okText: "Émettre"
        }).done(function () {
            var maj = $.extend(true, {}, f, { statut: "EMISE", dateEmission: dateEm, dateEcheance: U.addDays(dateEm, delai) });
            // TODO API : POST /commercial/factures/{id}/emettre
            CX.api.save("factures", maj).then(function () { return CX.api.log("factures", f.id, "Facture émise"); })
                .done(function () { U.toast("Facture " + U.esc(f.numero) + " émise.", "success"); charger(); });
        });
    });

    charger().done(function () {
        if (U.queryParam("print") === "1") setTimeout(function () { window.print(); }, 500);
    });
});

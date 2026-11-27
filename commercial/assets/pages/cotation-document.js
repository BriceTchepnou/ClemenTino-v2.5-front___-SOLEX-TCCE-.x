/* =====================================================================
   Commercial · Devis imprimable (cotation-document.html?id=…)
   ---------------------------------------------------------------------
   ?id=12        cotation à afficher
   ?print=1      ouvre directement la boîte d'impression
   Le PDF est produit par le navigateur (Imprimer > Enregistrer au format PDF).
   >>> INTÉGRATION SYMFONY <<<
   Ce gabarit peut être repris tel quel en Twig pour une génération PDF
   côté serveur (wkhtmltopdf / KnpSnappyBundle) : seule la feuille .cd-sheet
   et cotation-document.css sont nécessaires.
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, COT = CX.cot, S = CX.CONFIG.SOCIETE;
    var id = U.queryParam("id");

    if (!id) { erreur("Aucune cotation indiquée dans l'adresse (paramètre ?id=)."); return; }

    // TODO API : GET /commercial/cotations/{id}   (ou GET /commercial/cotations/{id}/pdf pour le PDF serveur)
    CX.api.get("cotations", id).done(function (c) {
        var cl = COT.client(c.clientId);
        rendre(c, cl);
        $("#btnImprimer, #btnPdf").on("click", function () { window.print(); });
        if (U.queryParam("print") === "1") setTimeout(function () { window.print(); }, 500);
    }).fail(function (e) { erreur(e); });

    function erreur(msg) {
        $("#doc").html("<div class='cx-empty'><i class='fa fa-exclamation-triangle'></i><b>Devis introuvable</b>" + U.esc(msg) +
            "<div style='margin-top:12px'><a class='cx-btn cx-btn-ghost' href='cotations-liste.html'>Retour à la liste</a></div></div>");
        $("#btnImprimer, #btnPdf").prop("disabled", true);
    }

    /* ------------------------------------------------------------------
       Rendu complet de la feuille
       ------------------------------------------------------------------ */
    function rendre(c, cl) {
        var d = c.details || {}, t = U.taxes(c.montantHT), type = REF.TYPE_COTATION[c.type] || { label: c.type };
        var st = REF.STATUT_COTATION[c.statut] || { label: c.statut };
        var ct = cl && cl.contacts && cl.contacts[0] ? cl.contacts[0] : {};

        /* barre d'outils */
        $("#dNumero").text(c.numero);
        $("#dCrumb").text(c.numero);
        $("#dStatut").html(REF.badge(REF.STATUT_COTATION, c.statut));
        document.title = "Devis " + c.numero + (cl ? " - " + cl.raisonSociale : "");
        if (c.statut === "ENREGISTREE") $("#btnModifier").removeClass("cx-hidden").attr("href", "cotation-form.html?id=" + c.id);

        var h = [];

        /* filigrane selon le statut */
        var fil = { ENREGISTREE: ["PROJET", "grey"], SOUMISE: ["PROJET", "grey"], ANNULEE: ["ANNULÉE", ""], REJETEE: ["REJETÉE", ""] }[c.statut];
        if (fil) h.push("<div class='cd-filigrane " + fil[1] + "'>" + fil[0] + "</div>");

        /* --- en-tête société --- */
        h.push("<div class='cd-head'><div class='cd-logo'><div class='cd-logo-mark'>" + U.esc(U.initials(S.nom)) + "</div>" +
            "<div><div class='cd-soc-nom'>" + U.esc(S.nom) + "</div><div class='cd-soc-slogan'>" + U.esc(S.slogan) + "</div></div></div>" +
            "<div class='cd-soc-coord'>" + U.esc(S.adresse) + "<br>Tél. " + U.esc(S.tel) + " · " + U.esc(S.email) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu) + "</div></div>");

        /* --- titre + références --- */
        h.push("<div class='cd-titre-row'><h2 class='cd-titre'>DEVIS / COTATION<small>N° " + U.esc(c.numero) + " · " + U.esc(type.label) + "</small></h2>" +
            "<table class='cd-refs'>" +
            "<tr><td>Date d'émission</td><td>" + U.toFr(c.dateSoumission || c.dateCreation) + "</td></tr>" +
            "<tr><td>Valable jusqu'au</td><td>" + U.toFr(c.dateValidite) + "</td></tr>" +
            "<tr><td>Établi par</td><td>" + U.esc(c.creePar || "") + "</td></tr>" +
            (cl && cl.code ? "<tr><td>Code client</td><td>" + U.esc(cl.code) + "</td></tr>" : "") +
            "</table></div>");

        /* --- client + objet --- */
        h.push("<div class='cd-blocs'>" +
            "<div class='cd-bloc'><h4>Client</h4>" + (cl
                ? "<div class='cd-nom'>" + U.esc(cl.raisonSociale) + "</div>" +
                  "<div>" + U.esc(cl.adresse || "") + (cl.localisation ? " · " + U.esc(cl.localisation) : "") + "</div>" +
                  (ct.nom ? "<div>À l'attention de : " + U.esc(ct.nom) + (ct.titre ? " (" + U.esc(ct.titre) + ")" : "") + "</div>" : "") +
                  "<div>" + U.esc(ct.tel1 || cl.telStandard || "") + (CX.cot.emailClient(cl) ? " · " + U.esc(CX.cot.emailClient(cl)) : "") + "</div>" +
                  (cl.niu ? "<div>NIU : " + U.esc(cl.niu) + "</div>" : "")
                : "<div class='cd-nom'>Client inconnu</div>") + "</div>" +
            "<div class='cd-bloc'><h4>Objet</h4><div class='cd-nom'>" + U.esc(c.nom) + "</div>" +
            (c.description && c.description !== c.nom ? "<div>" + U.esc(c.description) + "</div>" : "") +
            objetDetail(c, d) + "</div></div>");

        /* --- détail selon le type --- */
        if (c.type === "EXPEDITION") h.push(detailExpedition(c, d, t));
        else if (c.type === "FRET") h.push(detailFret(c, d, t));
        else h.push(detailTarifaire(c, d));

        /* --- conditions --- */
        h.push(conditions(c, d, cl));

        /* --- signatures --- */
        h.push("<div class='cd-signatures'>" +
            "<div class='cd-sign'><h4>Pour " + U.esc(S.nom) + "</h4><small>Établi par : " + U.esc(c.creePar || "") + "</small>" +
            (c.validePar ? "<small>Validé par : " + U.esc(c.validePar) + (c.dateValidation ? " le " + U.toFr(c.dateValidation) : "") + "</small>" : "") +
            "<small style='margin-top:6px'>Cachet et signature</small></div>" +
            "<div class='cd-sign cd-accord'><h4>Bon pour accord du client</h4>" +
            "<small>Mention manuscrite « Bon pour accord », date, cachet et signature</small>" +
            "<div class='cd-ligne'>Nom et qualité du signataire :</div>" +
            "<div class='cd-ligne'>Date : ……… / ……… / …………</div>" +
            "<div class='cd-ligne' style='border:0'>Cachet et signature :</div></div></div>");

        /* --- pied de page --- */
        h.push("<div class='cd-spacer'></div><div class='cd-pied'>" + U.esc(S.nom) + " · " + U.esc(S.adresse) + " · Tél. " + U.esc(S.tel) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu) + " · " + U.esc(S.banque) +
            "<br>Devis " + U.esc(c.numero) + " · document généré le " + U.toFr(U.now()) + "</div>");

        $("#doc").html(h.join(""));
    }

    /* Résumé de l'objet (trajet / véhicule / grille) dans le bloc « Objet » */
    function objetDetail(c, d) {
        if (c.type === "EXPEDITION") {
            var dest = d.villeDestLibre ? d.villeDestLibre.toUpperCase() + " (" + d.paysDest + ")" : COT.villeLabel(d.villeDest);
            var tt = COT.TYPES_TRAJET[d.typeTrajet || COT.deduireTrajet(d.villeDep, d.villeDest)];
            return "<div class='cd-route' style='margin-top:4px'>" + U.esc(COT.villeLabel(d.villeDep)) + (d.bureauDep ? " <small>(" + U.esc(d.bureauDep) + ")</small>" : "") +
                " <i class='fa fa-long-arrow-right'></i> " + U.esc(dest) + (d.bureauDest ? " <small>(" + U.esc(d.bureauDest) + ")</small>" : "") + "</div>" +
                "<div>Expédition " + U.esc(tt ? tt.label.toLowerCase() : "") + " · " +
                (d.livraison === "DOMICILE" ? "livraison à domicile" + (d.quartier ? " (" + U.esc(d.quartier) + ")" : "") : "retrait au bureau") + "</div>";
        }
        if (c.type === "FRET") {
            var fin = d.dateFin || (d.dateDebut && d.nbJours ? U.addDays(d.dateDebut, d.nbJours - 1) : "");
            return "<div>Véhicule : <b>" + U.esc(d.vehicule || "") + "</b> · " + (d.nbJours || 0) + " jour(s)</div>" +
                (d.dateDebut ? "<div>Du " + U.toFr(d.dateDebut) + (fin && fin !== d.dateDebut ? " au " + U.toFr(fin) : "") + "</div>" : "") +
                "<div>" + (d.mode === "ZONE" ? "Zone : " + U.esc(COT.villeLabel(d.villeDep)) + (d.zone ? " - " + U.esc(d.zone) : "")
                    : "Trajet : " + U.esc(COT.villeLabel(d.villeDep)) + " → " + U.esc(COT.villeLabel(d.villeDest))) + "</div>";
        }
        return "<div>Grille applicable à compter du <b>" + U.toFr(d.dateEffet) + "</b></div>" +
            (d.remiseGlobale ? "<div>Remise globale consentie : " + U.fmt(d.remiseGlobale, d.remiseGlobale % 1 ? 1 : 0) + " %</div>" : "");
    }

    /* ---------------- EXPÉDITION ---------------- */
    function detailExpedition(c, d, t) {
        var h = [], i = 0;
        var e = d.expediteur || {}, r = d.destinataire || {};
        h.push("<div class='cd-blocs'>" + partie("Expéditeur", e) + partie("Destinataire", r) + "</div>");

        h.push("<div class='cd-section'>Colis</div><table class='cd-table'><thead><tr><th>#</th><th>Nature / contenu</th><th class='num'>Nb</th>" +
            "<th class='num'>Poids réel</th><th class='num'>Dimensions (cm)</th><th class='num'>Poids vol.</th><th class='num'>Poids taxable</th><th class='num'>Valeur déclarée</th></tr></thead><tbody>");
        var totN = 0, totTax = 0;
        $.each(d.colis || [], function (_, k) {
            i++;
            var n = Math.max(1, parseInt(k.nombre, 10) || 1), vol = CX.tarif.poidsVolumetrique(k.L, k.l, k.H), tax = Math.max(k.poids || 0, vol) * n;
            totN += n; totTax += tax;
            h.push("<tr><td>" + i + "</td><td><b>" + U.esc(k.nature) + "</b>" + (k.description ? "<br>" + U.esc(k.description) : "") + "</td>" +
                "<td class='num'>" + n + "</td><td class='num'>" + U.fmt(k.poids, 1) + " kg</td>" +
                "<td class='num'>" + (k.L && k.l && k.H ? U.fmt(k.L) + " × " + U.fmt(k.l) + " × " + U.fmt(k.H) : "—") + "</td>" +
                "<td class='num'>" + U.fmt(vol, 1) + " kg</td><td class='num'><b>" + U.fmt(Math.round(tax * 10) / 10, 1) + " kg</b></td>" +
                "<td class='num'>" + (k.valeur ? U.money(k.valeur) : "—") + "</td></tr>");
        });
        h.push("</tbody><tfoot><tr><td colspan='2'>Total</td><td class='num'>" + totN + "</td><td colspan='3'></td><td class='num'>" +
            U.fmt(Math.round(totTax * 10) / 10, 1) + " kg</td><td></td></tr></tfoot></table>");

        /* prestations */
        var tt = { URBAINE: "urbain", NATIONALE: "national", REGIONALE: "régional", INTERNATIONALE: "international" }[d.typeTrajet || COT.deduireTrajet(d.villeDep, d.villeDest)];
        var lignes = [
            ["Transport " + (tt || "") + " · " + U.fmt(Math.round(totTax * 10) / 10, 1) + " kg taxables", d.transport],
            ["Emballage", d.emballage],
            ["Livraison à domicile" + (d.zone ? " · " + zoneNom(d.zone) : ""), d.livraison === "DOMICILE" ? d.livraisonMt : 0],
            ["Autres frais", d.autres]
        ];
        h.push(prestations(lignes, d.remise || 0, d.remisePct, t));
        return h.join("");
    }
    function partie(titre, p) {
        return "<div class='cd-bloc'><h4>" + titre + "</h4><div class='cd-nom'>" + U.esc(p.nom || "—") + "</div>" +
            (p.tel ? "<div>Tél. +237 " + U.esc(String(p.tel).replace(/^\+?237\s*/, "")) + "</div>" : "") +
            (p.adresse ? "<div>" + U.esc(p.adresse) + "</div>" : "") + (p.email ? "<div>" + U.esc(p.email) + "</div>" : "") + "</div>";
    }
    function zoneNom(code) { var z = $.grep(REF.ZONES_LIVRAISON, function (x) { return x.code === code; })[0]; return z ? z.nom : code; }

    /* ---------------- FRET ---------------- */
    function detailFret(c, d, t) {
        var j = d.nbJours || 0, k = d.calc, lignes;
        if (k) {
            lignes = [
                ["Location " + (d.vehicule || "véhicule") + " · " + j + " j × " + U.money(d.prixJour), k.location],
                [d.chauffeur ? "Chauffeur · " + j + " j × " + U.money(d.chauffeurJour) : "", k.chauffeur],
                [d.carburant ? "Forfait carburant · " + j + " j × " + U.money(d.carburantJour) : "", k.carburant],
                [d.manutention ? "Manutention · " + d.manutention + " pers. × " + j + " j × " + U.money(d.manutJour) : "", k.manutention],
                [k.frais ? "Frais annexes" + (d.fraisLibelle ? " · " + d.fraisLibelle : "") : "", k.frais]
            ];
        } else {
            /* cotation saisie avant le détail par ligne (données historiques) */
            var inclus = [];
            if (d.chauffeur) inclus.push("chauffeur");
            if (d.carburant) inclus.push("carburant");
            if (d.manutention) inclus.push(d.manutention + " manutentionnaire(s)");
            lignes = [["Mise à disposition " + (d.vehicule || "") + " · " + j + " jour(s)" + (inclus.length ? " - " + inclus.join(", ") + " inclus" : ""), c.montantHT]];
        }
        lignes = $.grep(lignes, function (l) { return l[0] && l[1]; });
        return "<div class='cd-section'>Prestations</div>" + prestations(lignes, k ? k.remise : 0, d.remisePct, t, true);
    }

    /* Tableau des prestations + totaux + montant en lettres */
    function prestations(lignes, remise, remisePct, t, sansTitre) {
        var brut = 0, h = [];
        lignes = $.grep(lignes, function (l) { return U.num(l[1]) > 0; });
        h.push((sansTitre ? "" : "<div class='cd-section'>Prestations</div>") +
            "<table class='cd-table'><thead><tr><th>Désignation</th><th class='num' style='width:38mm'>Montant HT</th></tr></thead><tbody>");
        $.each(lignes, function (_, l) { brut += U.num(l[1]); h.push("<tr><td>" + U.esc(l[0]) + "</td><td class='num'>" + U.money(l[1]) + "</td></tr>"); });
        if (!lignes.length) h.push("<tr><td colspan='2' style='color:#6b7280'>Aucune prestation chiffrée</td></tr>");
        h.push("</tbody></table>");

        h.push("<div class='cd-bas'><div class='cd-lettres'>Arrêté le présent devis à la somme de :<br><b>" +
            U.esc(U.enLettres(t.ttc)) + " francs CFA</b> toutes taxes comprises.</div><table class='cd-totaux'>" +
            (remise ? "<tr><td>Total brut HT</td><td>" + U.money(brut) + "</td></tr><tr><td>Remise client (" + U.fmt(remisePct || 0) + " %)</td><td>− " + U.money(remise) + "</td></tr>" : "") +
            "<tr><td>Total HT</td><td>" + U.money(t.ht) + "</td></tr>" +
            "<tr><td>TVA " + U.fmt(t.taux, 2) + " %</td><td>" + U.money(t.tva) + "</td></tr>" +
            "<tr class='cd-ttc'><td>Total TTC</td><td>" + U.money(t.ttc) + "</td></tr></table></div>");
        return h.join("");
    }

    /* ---------------- TARIFAIRE ---------------- */
    function detailTarifaire(c, d) {
        var h = [], rg = U.num(d.remiseGlobale), stats = COT.calcTarifaire(d);
        h.push("<div class='cd-section'>Grille tarifaire (prix HT par envoi)</div><table class='cd-table'><thead><tr><th>#</th><th>Départ</th><th>Destination</th><th>Tranche de poids</th>" +
            (rg ? "<th class='num'>Prix public HT</th><th class='num'>Remise</th>" : "") + "<th class='num'>Prix HT</th><th class='num'>Prix TTC</th></tr></thead><tbody>");
        $.each(d.lignes || [], function (i, l) {
            var net = COT.prixNet(l.prix, rg);
            h.push("<tr><td>" + (i + 1) + "</td><td>" + U.esc(COT.villeLabel(l.villeDep)) + "</td><td>" + U.esc(COT.villeLabel(l.villeDest)) + "</td><td>" + U.esc(l.tranche) + "</td>" +
                (rg ? "<td class='num'>" + U.money(l.prix) + "</td><td class='num'>" + U.fmt(rg, rg % 1 ? 1 : 0) + " %</td>" : "") +
                "<td class='num'><b>" + U.money(net) + "</b></td><td class='num'>" + U.money(U.taxes(net).ttc) + "</td></tr>");
        });
        if (!(d.lignes || []).length) h.push("<tr><td colspan='8' style='color:#6b7280'>Aucune ligne de tarif</td></tr>");
        h.push("</tbody></table>");
        h.push("<div class='cd-bas'><div class='cd-lettres'>" + stats.nb + " ligne(s) de tarif sur " + stats.trajets + " trajet(s)" +
            (stats.min != null ? " · prix de " + U.money(stats.min) + " à " + U.money(stats.max) + " HT" : "") +
            ".<br>TVA de " + U.fmt(CX.CONFIG.TVA, 2) + " % en sus, facturée sur chaque expédition.</div></div>");
        return h.join("");
    }

    /* ---------------- Conditions ---------------- */
    function conditions(c, d, cl) {
        var li = [];
        var jours = U.daysBetween(c.dateSoumission || c.dateCreation, c.dateValidite);
        li.push("Offre valable jusqu'au <b>" + U.toFr(c.dateValidite) + "</b>" + (jours > 0 ? " (" + jours + " jours)" : "") + ". Passé ce délai, les prix pourront être révisés.");
        if (cl && cl.enCompte) li.push("Paiement : sur facture, à <b>" + (cl.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS) + " jours</b> date de facture, par virement ou chèque à l'ordre de " + U.esc(S.nom) + ".");
        else li.push("Paiement : <b>comptant</b> au dépôt (espèces, Orange Money, MTN MoMo) ou par virement préalable.");
        if (c.type === "EXPEDITION") {
            li.push("Tarif établi sur le poids taxable déclaré (le plus élevé du poids réel et du poids volumétrique L × l × H / 5 000). Tout écart constaté au dépôt donnera lieu à un réajustement.");
            li.push("Les marchandises sont transportées aux risques de l'expéditeur au-delà de la valeur déclarée. Les produits dangereux ou illicites sont refusés.");
        } else if (c.type === "FRET") {
            li.push("Mise à disposition de 8 h à 18 h ; toute heure ou journée supplémentaire sera facturée au prorata. Le chargement reste sous la responsabilité du client.");
            li.push("Péages, frais de stationnement et autorisations spéciales non mentionnés ci-dessus restent à la charge du client.");
        } else {
            li.push("Grille applicable à compter du " + U.toFr(d.dateEffet) + " aux expéditions du compte client ; elle remplace toute grille antérieure.");
            li.push("Les tranches s'appliquent au poids taxable de chaque envoi. Livraison à domicile et emballage facturés en sus selon le barème en vigueur.");
        }
        li.push("Coordonnées bancaires : " + U.esc(S.banque) + ".");
        return "<div class='cd-conditions'><div class='cd-section' style='margin-top:0'>Conditions</div><ul><li>" + li.join("</li><li>") + "</li></ul></div>";
    }
});

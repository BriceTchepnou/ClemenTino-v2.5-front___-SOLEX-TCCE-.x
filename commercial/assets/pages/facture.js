/* =====================================================================
   Commercial · Facture imprimable A4 (facture.html?id=ID)
   ---------------------------------------------------------------------
   Affiche la facture (en-tête société, client, détail des expéditions,
   totaux, montant en lettres, paiements, conditions, cachet) et propose :
   Imprimer, Télécharger en PDF (CX.pdf), Exporter en Excel (CSV),
   Envoyer (mailto), Enregistrer un paiement, Émettre (si brouillon).

   Panneau « Options de la facture » (non imprimé) : PU moyen, sous-totaux
   par ville de départ / de destination, période automatique, TVA, acompte
   IS, remise, acompte, frais additionnels, bon de commande, délai. Toute
   modification met à jour l'APERÇU du document ; « Recalculer les montants »
   enregistre (CX.fac.recalculer). Sans options enregistrées, la facture est
   affichée telle qu'elle a été créée (compatibilité des anciennes factures).

   Paramètres d'URL : id (obligatoire), print=1 (lance l'impression).
   Dépend de assets/pages/facturation.js (CX.fac) et exports.js.
   ===================================================================== */
$(function () {
    var U = CX.util, F = CX.fac, S = CX.CONFIG.SOCIETE, today = U.today();
    var id = U.queryParam("id");
    var facture = null, client = null, exps = [];
    var apercu = null;            // options en cours d'édition (null = document enregistré)

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function capitale(s) { return s.charAt(0).toUpperCase() + s.substr(1); }
    function pct(v) { return U.fmt(v, v % 1 ? 2 : 0) + " %"; }
    function erreur(txt) {
        $("#fx-doc, #fx-histo-card, #fo-panel").addClass("cx-hidden");
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
                CX.api.list("expeditions", function (e) { return $.inArray(e.id, $.map(f.expeditionIds || [], Number)) >= 0; })
            );
        }).done(function (c, list) {
            client = c; exps = list; apercu = null;
            remplirPanneau(F.optionsFacture(facture, client));
            rendre();
        }).fail(function (e) { if (e) erreur(String(e)); });
    }

    /* ------------------------------------------------------------------
       Totaux affichés : calcul de l'aperçu, ou valeurs enregistrées
       ------------------------------------------------------------------ */
    function totauxEnregistres(f, calc) {
        var fr = f.frais || {};
        return {
            total: U.round(f.montantHT), remisePct: Number(f.remisePct) || 0, remise: U.round(f.remise || 0),
            assurance: U.round(fr.assurance || 0), manutention: U.round(fr.manutention || 0), emballage: U.round(fr.emballage || 0),
            netHT: F.netHT(f), tauxTva: f.tauxTva == null ? CX.CONFIG.TVA : Number(f.tauxTva), tva: U.round(f.tva), ttc: U.round(f.montantTTC),
            tauxIs: Number(f.tauxIs) || 0, is: U.round(f.montantIS || 0), acompte: U.round(f.acompte || 0), solde: F.aPayer(f),
            periode: { du: f.periodeDu, au: f.periodeAu }, options: calc.options
        };
    }

    /* ------------------------------------------------------------------
       Rendu du document
       ------------------------------------------------------------------ */
    function rendre() {
        var f = facture, c = client;
        var calc = F.calculer(f, c, exps, apercu || undefined);
        var t = apercu ? calc : totauxEnregistres(f, calc), o = calc.options;
        var statut = CX.REF.STATUT_FACTURE[f.statut] || { label: f.statut };
        var echeance = apercu && f.dateEmission ? U.addDays(f.dateEmission, parseInt(o.delaiPaiement, 10) || 0) : f.dateEcheance;
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
        if (!apercu && f.statut !== "ANNULEE" && calc.total !== U.round(f.montantHT)) alertes.push(note("warn", "fa-refresh",
            "Le montant des expéditions (" + U.money(calc.total) + " HT) diffère du montant enregistré (" + U.money(f.montantHT) +
            " HT) : une expédition a été régularisée. Utilisez « Recalculer les montants »."));
        if (apercu) alertes.push(note("info", "fa-eye", "<b>Aperçu</b> - les options modifiées ne sont pas encore enregistrées. Cliquez sur « Recalculer les montants » pour les appliquer à la facture."));
        $("#fx-alertes").html(alertes.join(""));

        /* Filigrane */
        var fili = f.statut === "BROUILLON" ? "BROUILLON" : f.statut === "ANNULEE" ? "ANNULÉE" : "";
        $("#fx-filigrane").text(fili).toggleClass("cx-hidden", !fili).toggleClass("fx-watermark-red", f.statut === "ANNULEE");

        /* En-tête société : logo image si configuré (CX.CONFIG.SOCIETE.logo), sinon initiales */
        if (S.logo) $("#fx-logo-mark").addClass("fx-logo-img").html("<img src='" + U.esc(S.logo) + "' alt='" + U.esc(S.nom) + "'>");
        else $("#fx-logo-mark").text(U.initials(S.nom));
        $("#fx-soc-nom, #fx-soc-nom2").text(S.nom);
        $("#fx-soc-slogan").text(S.slogan || "");
        $("#fx-soc-coord").html(
            U.esc(S.adresse) + "<br>Tél. " + U.esc(S.tel) + " · " + U.esc(S.email) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu));

        /* Bloc titre */
        $("#fx-numero").text(f.numero);
        $("#fx-dateEmission").text(U.toFr(f.dateEmission));
        $("#fx-dateEcheance").text(U.toFr(echeance));
        $("#fx-periode").text("du " + U.toFr(t.periode.du) + " au " + U.toFr(t.periode.au));
        $("#fx-codeClient").text(c.code || c.numero || "—");
        $("#fx-compte").text(CX.REF.compteClient(c));
        var bc = apercu ? o.bonCommande : (f.bonCommande || o.bonCommande);
        $("#fx-row-bc").toggleClass("cx-hidden", !bc);
        $("#fx-bonCommande").text(bc || "");

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
            " livrée" + (exps.length > 1 ? "s" : "") + "</b> du " + U.toFrLong(t.periode.du) + " au " + U.toFrLong(t.periode.au) + ".");
        $("#fx-notes").text(f.notes || "").toggle(!!f.notes);

        rendreLignes(calc, o);
        rendreTotaux(f, t);

        $("#fx-lettres").text(capitale(U.enLettres(t.ttc)) + " (" + U.fmt(t.ttc) + ") francs CFA TTC" +
            (t.solde !== t.ttc ? ", soit un solde à payer de " + U.enLettres(t.solde) + " (" + U.fmt(t.solde) + ") francs CFA." : "."));

        /* Paiements reçus */
        var p = f.paiements || [];
        $("#fx-paiements").html(p.length ? "<div class='fx-box-title'>Paiements reçus</div><table class='fx-paie'><thead><tr><th>Date</th><th>Mode</th><th>Référence</th>" +
            "<th class='num'>Montant</th></tr></thead><tbody>" + $.map(p, function (x) {
                return "<tr><td>" + U.toFr(x.date) + "</td><td>" + U.esc(x.mode) + "</td><td>" + U.esc(x.reference || "—") + "</td><td class='num fx-nowrap'>" + U.money(x.montant) + "</td></tr>";
            }).join("") + "</tbody></table>" +
            (f.statut === "PAYEE" ? "<div class='fx-acquittee'><i class='fa fa-check-circle'></i> Facture acquittée le " + U.toFr(p[p.length - 1].date) + "</div>"
                : "<div class='fx-small'>Reste à payer : <b>" + U.money(F.reste(f)) + "</b></div>") : "");

        /* Conditions + banque */
        var delai = U.daysBetween(f.dateEmission, echeance);
        $("#fx-conditions").html("Paiement à <b>" + delai + " jours</b> date de facture, soit au plus tard le <b>" + U.toFrLong(echeance) + "</b>, " +
            "par virement bancaire ou par chèque à l'ordre de " + U.esc(S.nom) + ". Merci de rappeler le n° de facture <b>" + U.esc(f.numero) +
            "</b>" + (bc ? " et le bon de commande n° <b>" + U.esc(bc) + "</b>" : "") + " dans votre règlement." +
            (t.is ? " L'acompte IS de " + pct(t.tauxIs) + " est retenu à la source par le client : merci de nous transmettre l'attestation de retenue." : "") +
            " Toute réclamation doit nous parvenir dans les 8 jours suivant la réception de la facture.");
        $("#fx-banque").html(U.esc(S.banque));

        /* Signature */
        $("#fx-fait").html("Fait à " + U.esc(capitale((CX.CONFIG.USER.ville || "Douala").toLowerCase())) + ", le " + U.toFrLong(f.dateEmission));
        $("#fx-signataire").text("Le service facturation");

        /* Pied de page : mentions légales */
        $("#fx-pied").html("<b>" + U.esc(S.nom) + "</b> · " + U.esc(S.adresse) + " · Tél. " + U.esc(S.tel) + " · " + U.esc(S.email) +
            "<br>RCCM " + U.esc(S.rccm) + " · NIU " + U.esc(S.niu) + " · Banque : " + U.esc(S.banque) +
            "<br>" + (t.tauxTva ? "TVA au taux de " + U.fmt(t.tauxTva, 2) + " % (TVA 17,5 % + centimes additionnels communaux 10 %). " : "Facture établie sans TVA. ") +
            "Facture " + U.esc(f.numero) + " - " + U.esc(statut.label.toLowerCase()) + ".");

        /* Historique */
        var h = f.historique || [];
        $("#fx-historique").html(h.length ? $.map(h, function (x) {
            return "<li><div class='cx-tl-date'>" + U.toFr(x.date) + " · " + U.esc(x.user || "") + "</div><div class='cx-tl-text'>" + U.esc(x.action) + "</div></li>";
        }).join("") : "<li><div class='cx-tl-text cx-muted'>Aucun évènement</div></li>");

        majPanneau(f, o);
        $("#fx-doc, #fx-histo-card").removeClass("cx-hidden");
    }
    function note(type, icon, html) { return "<div class='cx-note cx-note-" + type + "'><i class='fa " + icon + "'></i><div>" + html + "</div></div>"; }

    /* Colonnes du tableau selon l'option « PU moyen » */
    function colonnes(o) {
        var pu = !!o.afficherPuMoyen;
        return {
            pu: pu,
            /* colonnes avant « Colis » (pour les colspan) ; en mode PU moyen, le n° de LT manuel
               passe sous le n° RT et la colonne Contenu est masquée pour tenir sur la largeur A4 */
            avant: pu ? 4 : 6,
            thead: "<tr><th>Date</th><th>N° RT</th>" + (pu ? "" : "<th>N° LT manuel</th>") + "<th>Trajet</th><th>Destinataire</th>" + (pu ? "" : "<th>Contenu</th>") +
                "<th class='num'>Colis</th><th class='num'>Poids (kg)</th>" + (pu ? "<th class='num'>Poids V.</th><th class='num'>P.U. moyen</th>" : "") +
                "<th class='num'>Montant HT</th></tr>"
        };
    }
    function kg(v) { return v == null ? "—" : U.fmt(v, v % 1 ? 1 : 0); }

    function rendreLignes(calc, o) {
        var col = colonnes(o);
        $("#fx-thead").html(col.thead);
        function ligne(e) {
            var pv = F.poidsVol(e), pu = F.puMoyen(e);
            return "<tr>" +
                "<td class='fx-nowrap'>" + U.toFr(e.dateExp) + "</td>" +
                (col.pu ? "<td class='fx-nowrap fx-mono'>" + U.esc(e.nRt) + (e.nRtMan ? "<div class='fx-sub'>LT " + U.esc(e.nRtMan) + "</div>" : "") + "</td>"
                    : "<td class='fx-nowrap fx-mono'>" + U.esc(e.nRt) + "</td><td class='fx-mono'>" + (e.nRtMan ? U.esc(e.nRtMan) : "—") + "</td>") +
                "<td class='fx-nowrap'>" + U.esc(e.villeDep) + " → " + U.esc(e.villeDest) + "<div class='fx-sub'>" + U.esc(e.bureauDep) + " → " + U.esc(e.bureauDest) + "</div></td>" +
                "<td>" + U.esc(e.destinataire) + "</td>" +
                (col.pu ? "" : "<td>" + U.esc(e.contenu) + "</td>") +
                "<td class='num'>" + U.fmt(e.nbColis) + "</td>" +
                "<td class='num'>" + kg(Number(e.poids) || 0) + "</td>" +
                (col.pu ? "<td class='num'>" + kg(pv) + "</td><td class='num fx-nowrap'>" + (pu == null ? "—" : U.fmt(pu)) + "</td>" : "") +
                "<td class='num fx-nowrap'>" + U.fmt(e.montant) + "</td></tr>";
        }
        var html;
        if (!calc.lignes.length) html = "<tr><td colspan='" + (col.avant + (col.pu ? 5 : 3)) + "' class='fx-vide'>Aucune expédition</td></tr>";
        else if (calc.groupes.length) {
            var lib = o.sousTotal === "DEPART" ? "Départ" : "Destination";
            html = $.map(calc.groupes, function (g) {
                return "<tr class='fx-groupe'><td colspan='" + (col.avant + (col.pu ? 5 : 3)) + "'>" + lib + " : <b>" + U.esc(g.cle) + "</b></td></tr>" +
                    $.map(g.lignes, ligne).join("") +
                    "<tr class='fx-groupe-total'><td colspan='" + col.avant + "'>Sous-total " + U.esc(g.cle) + " · " + pluriel(g.lignes.length, "expédition") + "</td>" +
                    "<td class='num'>" + U.fmt(g.colis) + "</td><td class='num'>" + kg(g.poids) + "</td>" + (col.pu ? "<td></td><td></td>" : "") +
                    "<td class='num fx-nowrap'>" + U.fmt(g.total) + "</td></tr>";
            }).join("");
        } else html = $.map(calc.lignes, ligne).join("");
        $("#fx-lignes").html(html);

        var puGlobal = Math.max(calc.poids, calc.poidsVol) > 0 ? U.round(calc.total / Math.max(calc.poids, calc.poidsVol)) : null;
        $("#fx-total-lignes").html("<tr><td colspan='" + col.avant + "'>Montant total · " + pluriel(calc.nb, "expédition") + "</td>" +
            "<td class='num'>" + U.fmt(calc.colis) + "</td><td class='num'>" + kg(calc.poids) + "</td>" +
            (col.pu ? "<td class='num'>" + (calc.poidsVol ? kg(calc.poidsVol) : "—") + "</td><td class='num'>" + (puGlobal == null ? "—" : U.fmt(puGlobal)) + "</td>" : "") +
            "<td class='num fx-nowrap'>" + U.fmt(calc.total) + "</td></tr>");
    }

    function rendreTotaux(f, t) {
        var rows = [];
        function row(lib, val, cls) { rows.push("<tr" + (cls ? " class='" + cls + "'" : "") + "><th>" + lib + "</th><td>" + val + "</td></tr>"); }
        row("Montant total", U.money(t.total));
        if (t.remise) row("Remise (" + pct(t.remisePct) + ")", "- " + U.money(t.remise));
        if (t.assurance) row("Assurance", U.money(t.assurance));
        if (t.manutention) row("Manutention", U.money(t.manutention));
        if (t.emballage) row("Emballage", U.money(t.emballage));
        row("Montant HT", U.money(t.netHT));
        row(t.tauxTva ? "TVA (" + U.fmt(t.tauxTva, 2) + " %)" : "TVA (non applicable)", U.money(t.tva));
        row("Montant TTC", U.money(t.ttc), "fx-ttc");
        if (t.is) row("Acompte IS (" + pct(t.tauxIs) + ")", "- " + U.money(t.is), "fx-row-retenue");
        if (t.acompte) row("Acompte", "- " + U.money(t.acompte), "fx-row-retenue");
        if (t.is || t.acompte) row("Solde à payer", U.money(t.solde), "fx-row-solde");
        var paye = F.paye(f);
        if (paye && f.statut !== "ANNULEE") {
            row("Déjà réglé", "- " + U.money(paye), "fx-row-paye");
            row("Reste à payer", U.money(Math.max(0, t.solde - paye)), "fx-row-reste");
        }
        $("#fx-totaux").html(rows.join(""));
    }

    /* ------------------------------------------------------------------
       Panneau « Options de la facture »
       ------------------------------------------------------------------ */
    function remplirPanneau(o) {
        var $p = $("#fo-panel");
        $p.find("[data-opt]").each(function () {
            var k = $(this).data("opt"), v = o[k];
            if (this.type === "checkbox") this.checked = !!v;
            else $(this).val($(this).is("[data-num]") ? U.fmt(v || 0, (v || 0) % 1 ? 2 : 0) : (v || ""));
        });
        $("#fo-st-depart").prop("checked", o.sousTotal === "DEPART");
        $("#fo-st-destination").prop("checked", o.sousTotal === "DESTINATION");
        etatChamps();
    }
    function lirePanneau() {
        var o = {};
        $("#fo-panel [data-opt]").each(function () {
            var k = $(this).data("opt");
            if (this.type === "checkbox") o[k] = this.checked;
            else o[k] = $(this).is("[data-num]") ? U.num($(this).val()) : $.trim($(this).val());
        });
        o.sousTotal = $("#fo-st-depart").is(":checked") ? "DEPART" : $("#fo-st-destination").is(":checked") ? "DESTINATION" : "AUCUN";
        o.delaiPaiement = Math.max(0, parseInt(o.delaiPaiement, 10) || 0);
        return o;
    }
    function etatChamps() {
        $("#fo-tauxTva").prop("disabled", !$("#fo-avecTva").is(":checked"));
        $("#fo-tauxIs").prop("disabled", !$("#fo-abonnementIs").is(":checked"));
    }
    function memesOptions(a, b) {
        var diff = false;
        $.each(a, function (k, v) { if (String(v) !== String(b[k] == null ? "" : b[k])) diff = true; });
        return !diff;
    }
    function majPanneau(f, o) {
        var modifiable = f.statut !== "ANNULEE";
        $("#fo-panel").toggleClass("cx-hidden", !modifiable);
        $("#fo-modifie").toggleClass("cx-hidden", !apercu);
        $("#fo-echeance").text(f.dateEmission ? "Échéance : " + U.toFrLong(U.addDays(f.dateEmission, parseInt(o.delaiPaiement, 10) || 0)) : "");
        var ecarts = F.ecartConditions(f, client);
        $("#fo-ecart").html(!apercu && ecarts.length ? note("info", "fa-user-o", "Conditions du client " + U.esc(client.raisonSociale) + " : <b>" + U.esc(ecarts.join(", ")) +
            "</b>. Elles diffèrent de celles de la facture : « Appliquer les conditions du client » puis « Recalculer les montants ».") : "");
        /* Montants verrouillés sur une facture soldée (l'affichage reste modifiable) */
        var solde = f.statut === "PAYEE";
        $("#fo-panel [data-num], #fo-avecTva, #fo-abonnementIs").not("#fo-delaiPaiement").prop("disabled", solde);
        if (!solde) etatChamps();
        $("#fo-client").prop("disabled", solde);
    }

    $("#fo-panel").on("change input", "input", U.debounce(function () {
        if (!facture) return;
        var o = lirePanneau();
        apercu = memesOptions(o, F.optionsFacture(facture, client)) ? null : o;
        etatChamps();
        rendre();
    }, 150));
    /* Sous-totaux : départ OU destination */
    $("#fo-panel").on("change", "[data-st]", function () {
        if (this.checked) $("#fo-panel [data-st]").not(this).prop("checked", false);
    });
    $("#fo-panel").on("blur", "[data-num]", function () { var v = U.num($(this).val()); $(this).val(U.fmt(v, v % 1 ? 2 : 0)); });
    $("#fo-toggle").on("click", function () {
        $("#fo-body").toggleClass("cx-hidden");
        $(this).find(".fa").toggleClass("fa-chevron-up fa-chevron-down");
    });
    $("#fo-client").on("click", function () {
        remplirPanneau(F.optionsClient(facture, client));
        $("#fo-remisePct").trigger("change");
        U.toast("Conditions de facturation du client appliquées à l'aperçu.", "info");
    });
    $("#fo-annuler").on("click", function () {
        apercu = null;
        remplirPanneau(F.optionsFacture(facture, client));
        rendre();
    });
    $("#fo-recalculer").on("click", function () {
        if (!facture) return;
        F.recalculer(facture, lirePanneau()).done(charger);
    });

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */
    $("#btn-imprimer").on("click", function () { window.print(); });
    $("#btn-pdf").on("click", function () {
        // TODO API (option) : GET /commercial/factures/{id}.pdf  (PDF généré côté serveur, ex. KnpSnappyBundle)
        /* PDF A4 généré directement (indépendant des réglages de la boîte d'impression) */
        CX.pdf.telecharger(".fx-sheet", { nom: document.title, bouton: this });
    });
    /* Export Excel (CSV ; séparateur « ; », BOM UTF-8) : détail + totaux de l'aperçu affiché */
    $("#btn-excel").on("click", function () {
        if (!facture) return;
        // TODO API (option) : GET /commercial/factures/{id}.xlsx  (PhpSpreadsheet)
        var calc = F.calculer(facture, client, exps, apercu || undefined), t = apercu ? calc : totauxEnregistres(facture, calc);
        var l = [["Facture", facture.numero], ["Client", client.raisonSociale], ["N° de compte", CX.REF.compteClient(client)],
            ["Date de facture", U.toFr(facture.dateEmission)], ["Période", U.toFr(t.periode.du) + " au " + U.toFr(t.periode.au)], [],
            ["Départ", "Destination", "Date", "N° LT", "N° LT manuel", "Destinataire", "Quantité", "Poids (kg)", "Poids V. (kg)", "P.U. moyen", "Montant HT"]];
        $.each(calc.lignes, function (_, e) {
            var pv = F.poidsVol(e), pu = F.puMoyen(e);
            l.push([e.villeDep, e.villeDest, U.toFr(e.dateExp), e.nRt, e.nRtMan || "", e.destinataire, e.nbColis, String(e.poids).replace(".", ","),
                pv == null ? "" : String(pv).replace(".", ","), pu == null ? "" : pu, U.round(e.montant)]);
        });
        l.push([]);
        l.push(["Montant total", "", "", "", "", "", "", "", "", "", t.total]);
        if (t.remise) l.push(["Remise " + pct(t.remisePct), "", "", "", "", "", "", "", "", "", -t.remise]);
        if (t.frais || t.assurance + t.manutention + t.emballage) l.push(["Frais (assurance, manutention, emballage)", "", "", "", "", "", "", "", "", "", t.assurance + t.manutention + t.emballage]);
        l.push(["Montant HT", "", "", "", "", "", "", "", "", "", t.netHT]);
        l.push(["TVA " + U.fmt(t.tauxTva, 2) + " %", "", "", "", "", "", "", "", "", "", t.tva]);
        l.push(["Montant TTC", "", "", "", "", "", "", "", "", "", t.ttc]);
        if (t.is) l.push(["Acompte IS " + pct(t.tauxIs), "", "", "", "", "", "", "", "", "", -t.is]);
        if (t.acompte) l.push(["Acompte", "", "", "", "", "", "", "", "", "", -t.acompte]);
        l.push(["Solde à payer", "", "", "", "", "", "", "", "", "", t.solde]);
        CX.exporter.telecharger("Facture " + facture.numero + ".csv", CX.exporter.csv(l, ";"), { bom: true });
        U.toast("Export Excel de la facture " + U.esc(facture.numero) + " téléchargé.", "success");
    });
    $("#btn-envoyer").on("click", function () {
        if (facture) F.marquerEnvoyee(facture, client).done(charger);
    });
    $("#btn-paiement").on("click", function () {
        if (facture) F.ouvrirPaiement(facture, charger);
    });
    $("#btn-emettre").on("click", function () {
        if (!facture || facture.statut !== "BROUILLON") return;
        var f = facture, delai = F.optionsFacture(f, client).delaiPaiement || client.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS;
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

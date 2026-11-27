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
     CX.fac.calculer(f, client, exps[, opts])  calcul centralisé (remise, frais,
                                    TVA, acompte IS, acompte, solde, sous-totaux)
     CX.fac.appliquer(f, calcul)    reporte un calcul sur une copie de la facture
     CX.fac.optionsFacture / optionsClient / ecartConditions   options de facturation
     CX.fac.recalculer(f[, opts])   « Recalculer les montants » (confirmation + enregistrement)
     CX.fac.marquerReglee(f)        « Facture réglée » (paiement du solde en un clic)
     CX.fac.aPayer(f)               solde attendu (TTC - IS - acompte, ou TTC)
   Également chargé par journal-vente.html et commissions.html.
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
    /* Montant attendu du client : solde à payer (TTC - acompte IS - acompte) s'il a
       été calculé, sinon le TTC (factures antérieures aux options de facturation). */
    function aPayer(f) { return f.soldeAPayer != null ? U.round(f.soldeAPayer) : U.round(f.montantTTC); }
    function reste(f) {
        if (f.statut === "ANNULEE") return 0;
        return Math.max(0, aPayer(f) - paye(f));
    }
    /* Net HT = total des lignes - remise + frais additionnels (assurance, manutention, emballage) */
    function netHT(f) { return U.round(f.montantHT) - U.round(f.remise || 0) + U.round(f.fraisTotal || 0); }

    /* =================================================================
       Options de facturation + calcul centralisé
       -----------------------------------------------------------------
       f.options (facultatif) : { remisePct, avecTva, tauxTva, abonnementIs,
         tauxIs, acompte, assurance, manutention, emballage, afficherPuMoyen,
         sousTotal (AUCUN|DEPART|DESTINATION), periodeAuto, bonCommande,
         delaiPaiement }. Absentes : on reproduit la facture telle qu'elle
         a été créée (remise et taux de TVA enregistrés, pas d'IS, pas de frais).
       >>> INTÉGRATION SYMFONY <<< : ce calcul doit être refait à l'identique
       côté serveur (service FacturationCalculator) - le navigateur n'affiche
       qu'un aperçu.
       ================================================================= */
    function optionsFacture(f, c) {
        var taux = f.tauxTva == null ? CX.CONFIG.TVA : Number(f.tauxTva);
        var delai = f.dateEmission && f.dateEcheance ? U.daysBetween(f.dateEmission, f.dateEcheance) : null;
        var base = {
            remisePct: Number(f.remisePct) || 0,
            avecTva: taux > 0,
            tauxTva: taux > 0 ? taux : CX.CONFIG.TVA,
            abonnementIs: false,
            tauxIs: CX.REF.TAUX_IS,
            acompte: 0, assurance: 0, manutention: 0, emballage: 0,
            afficherPuMoyen: false, sousTotal: "AUCUN", periodeAuto: false, bonCommande: "",
            delaiPaiement: delai != null && delai >= 0 ? delai : (c && c.delaiPaiement) || CX.CONFIG.DELAI_PAIEMENT_JOURS
        };
        return $.extend(base, f.options || {});
    }
    /* Options proposées à partir des conditions de facturation du client */
    function optionsClient(f, c) {
        var k = CX.REF.conditionsFacturation(c);
        return $.extend(optionsFacture(f, c), {
            remisePct: k.remisePct, avecTva: k.avecTva, tauxTva: k.tauxTva, abonnementIs: k.abonnementIs, tauxIs: k.tauxIs,
            assurance: k.assurance, manutention: k.manutention, emballage: k.emballage,
            afficherPuMoyen: k.afficherPuMoyen, sousTotal: k.sousTotal, delaiPaiement: k.delaiPaiement
        });
    }
    /* Les options d'une facture diffèrent-elles des conditions du client ? (montants seulement) */
    function ecartConditions(f, c) {
        var a = optionsFacture(f, c), b = optionsClient(f, c), ecarts = [];
        function lib(o) {
            return {
                remisePct: "remise " + U.fmt(o.remisePct, o.remisePct % 1 ? 2 : 0) + " %",
                avecTva: o.avecTva ? "avec TVA" : "sans TVA",
                abonnementIs: o.abonnementIs ? "acompte IS " + U.fmt(o.tauxIs, 1) + " %" : "sans acompte IS",
                frais: "frais " + U.money(U.round(o.assurance) + U.round(o.manutention) + U.round(o.emballage))
            };
        }
        var la = lib(a), lb = lib(b);
        if (a.remisePct !== b.remisePct) ecarts.push(lb.remisePct);
        if (a.avecTva !== b.avecTva || (a.avecTva && Number(a.tauxTva) !== Number(b.tauxTva))) ecarts.push(lb.avecTva);
        if (a.abonnementIs !== b.abonnementIs || (a.abonnementIs && Number(a.tauxIs) !== Number(b.tauxIs))) ecarts.push(lb.abonnementIs);
        if (la.frais !== lb.frais) ecarts.push(lb.frais);
        return ecarts;
    }

    /* Poids volumétrique d'une expédition (champ poidsVol, ou dimensions L × l × H) */
    function poidsVol(e) {
        if (e.poidsVol != null && e.poidsVol !== "") return Number(e.poidsVol) || 0;
        if (e.L && e.l && e.H) return CX.tarif.poidsVolumetrique(e.L, e.l, e.H);
        return null;
    }
    /* Prix unitaire moyen : montant HT / poids taxable (F par kg) */
    function puMoyen(e) {
        var p = Math.max(Number(e.poids) || 0, poidsVol(e) || 0);
        return p > 0 ? U.round((Number(e.montant) || 0) / p) : null;
    }

    /* Calcul complet d'une facture.
       facture : la facture ; client : son client ; exps : ses expéditions ;
       opts (facultatif) : options à appliquer (aperçu), sinon celles de la facture. */
    function calculer(facture, client, exps, opts) {
        var o = $.extend(optionsFacture(facture, client), opts || {});
        var lignes = (exps || []).slice().sort(function (a, b) {
            return a.dateExp === b.dateExp ? (a.nRt > b.nRt ? 1 : -1) : (a.dateExp > b.dateExp ? 1 : -1);
        });
        var r = { options: o, lignes: lignes, nb: lignes.length, total: 0, colis: 0, poids: 0, poidsVol: 0, groupes: [] };
        $.each(lignes, function (_, e) {
            r.total += U.round(e.montant); r.colis += Number(e.nbColis) || 0; r.poids += Number(e.poids) || 0; r.poidsVol += poidsVol(e) || 0;
        });
        r.remisePct = Number(o.remisePct) || 0;
        r.remise = U.round(r.total * r.remisePct / 100);
        r.assurance = U.round(o.assurance); r.manutention = U.round(o.manutention); r.emballage = U.round(o.emballage);
        r.frais = r.assurance + r.manutention + r.emballage;
        r.netHT = r.total - r.remise + r.frais;
        r.tauxTva = o.avecTva ? Number(o.tauxTva) || 0 : 0;
        r.tva = U.round(r.netHT * r.tauxTva / 100);
        r.ttc = r.netHT + r.tva;
        r.tauxIs = o.abonnementIs ? Number(o.tauxIs) || 0 : 0;
        r.is = U.round(r.netHT * r.tauxIs / 100);       // acompte IS : assis sur le montant HT
        r.acompte = U.round(o.acompte);
        r.solde = r.ttc - r.is - r.acompte;

        /* Période : saisie, ou automatique (1re et dernière date d'expédition) */
        r.periode = { du: facture.periodeDu, au: facture.periodeAu };
        if (o.periodeAuto && lignes.length) r.periode = { du: lignes[0].dateExp, au: lignes[lignes.length - 1].dateExp };

        /* Sous-totaux par ville de départ ou de destination */
        if (o.sousTotal === "DEPART" || o.sousTotal === "DESTINATION") {
            var champ = o.sousTotal === "DEPART" ? "villeDep" : "villeDest", idx = {};
            $.each(lignes, function (_, e) {
                var k = e[champ] || "—";
                if (!idx[k]) { idx[k] = { cle: k, lignes: [], total: 0, colis: 0, poids: 0 }; r.groupes.push(idx[k]); }
                var g = idx[k];
                g.lignes.push(e); g.total += U.round(e.montant); g.colis += Number(e.nbColis) || 0; g.poids += Number(e.poids) || 0;
            });
            r.groupes.sort(function (a, b) { return a.cle > b.cle ? 1 : -1; });
        }
        return r;
    }

    /* Reporte un calcul sur la facture (copie) : montants + options + période + échéance */
    function appliquer(f, calc) {
        var o = calc.options, maj = $.extend(true, {}, f);
        $.extend(maj, {
            options: $.extend({}, o),
            montantHT: calc.total, remisePct: calc.remisePct, remise: calc.remise,
            frais: { assurance: calc.assurance, manutention: calc.manutention, emballage: calc.emballage }, fraisTotal: calc.frais,
            tauxTva: calc.tauxTva, tva: calc.tva, montantTTC: calc.ttc,
            tauxIs: calc.tauxIs, montantIS: calc.is, acompte: calc.acompte, soldeAPayer: calc.solde,
            periodeDu: calc.periode.du, periodeAu: calc.periode.au,
            bonCommande: o.bonCommande || ""
        });
        if (maj.dateEmission) maj.dateEcheance = U.addDays(maj.dateEmission, parseInt(o.delaiPaiement, 10) || 0);
        return maj;
    }

    /* « Recalculer les montants » : recharge le client et les expéditions, recalcule
       avec les options de la facture (opts pour en imposer d'autres), affiche
       l'écart puis enregistre. Retourne une promesse (facture mise à jour). */
    function recalculer(f, opts) {
        var dfd = $.Deferred();
        if (f.statut === "ANNULEE") { U.toast("Une facture annulée ne peut pas être recalculée.", "warning"); return dfd.reject().promise(); }
        // TODO API : POST /commercial/factures/{id}/recalculer  { options }  (calcul serveur, renvoie la facture)
        $.when(
            CX.api.get("clients", f.clientId),
            CX.api.list("expeditions", function (e) { return $.inArray(e.id, $.map(f.expeditionIds || [], Number)) >= 0; })
        ).done(function (c, exps) {
            var calc = calculer(f, c, exps, opts), maj = appliquer(f, calc), p = paye(f);
            var lignes = [
                ["Net HT", netHT(f), netHT(maj)], ["TVA", U.round(f.tva), maj.tva], ["Total TTC", U.round(f.montantTTC), maj.montantTTC],
                ["Acompte IS", U.round(f.montantIS || 0), maj.montantIS], ["Solde à payer", aPayer(f), aPayer(maj)]
            ];
            var change = $.grep(lignes, function (l) { return l[1] !== l[2]; }).length > 0;
            if (p > aPayer(maj)) {
                U.toast("Recalcul impossible : les paiements déjà reçus (" + U.money(p) + ") dépassent le nouveau solde (" + U.money(aPayer(maj)) + ").", "error");
                dfd.reject(); return;
            }
            U.confirm({
                title: "Recalculer la facture " + f.numero,
                message: "<p>Montants recalculés à partir des <b>" + exps.length + " expédition(s)</b> rattachées et des options de la facture.</p>" +
                    "<table class='cx-table' style='font-size:12.5px'><thead><tr><th></th><th class='num'>Actuel</th><th class='num'>Recalculé</th></tr></thead><tbody>" +
                    $.map(lignes, function (l) {
                        return "<tr><td>" + l[0] + "</td><td class='num cx-nowrap'>" + U.money(l[1]) + "</td><td class='num cx-nowrap" + (l[1] !== l[2] ? " cx-strong" : "") + "'>" + U.money(l[2]) + "</td></tr>";
                    }).join("") + "</tbody></table>" +
                    (change ? "" : "<div class='cx-note cx-note-ok'><i class='fa fa-check'></i><div>Aucun écart : les montants sont déjà à jour.</div></div>") +
                    (p ? "<div class='cx-note cx-note-warn'><i class='fa fa-info-circle'></i><div>Déjà encaissé : <b>" + U.money(p) + "</b>. Le statut sera ajusté.</div></div>" : ""),
                okText: "Recalculer et enregistrer"
            }).done(function () {
                if (p && (maj.statut === "PAYEE" || maj.statut === "PARTIELLE")) maj.statut = reste(maj) === 0 ? "PAYEE" : "PARTIELLE";
                CX.api.save("factures", maj).then(function () {
                    return CX.api.log("factures", f.id, "Montants recalculés" + (change ? " : solde " + U.money(aPayer(f)) + " → " + U.money(aPayer(maj)) : " (sans changement)"));
                }).done(function (r) { U.toast("Facture " + U.esc(f.numero) + " recalculée.", "success"); dfd.resolve(r); })
                    .fail(function (e) { U.toast(e || "Erreur lors de l'enregistrement", "error"); dfd.reject(e); });
            }).fail(function () { dfd.reject(); });
        }).fail(function (e) { U.toast(e || "Facture ou client introuvable", "error"); dfd.reject(e); });
        return dfd.promise();
    }

    /* « Facture réglée » : enregistre en un clic le paiement du solde restant */
    function marquerReglee(f) {
        var dfd = $.Deferred(), r = reste(f);
        if (!peutPayer(f)) { U.toast("La facture " + U.esc(f.numero) + " n'a pas de solde à régler.", "info"); return dfd.reject().promise(); }
        var modes = $.map(CX.REF.MODES_PAIEMENT, function (m) { return "<option>" + U.esc(m) + "</option>"; }).join("");
        U.confirm({
            title: "Facture réglée - " + f.numero,
            message: "<p>Le règlement du solde de <b>" + U.money(r) + "</b> (" + U.esc(CX.api.clientNom(f.clientId)) + ") sera enregistré à la date du jour ; la facture passera au statut <b>Payée</b>.</p>" +
                "<div class='row'><div class='col-sm-6 cx-field'><label class='cx-label' for='rg-mode'>Mode de paiement</label><select class='form-control' id='rg-mode'>" + modes + "</select></div>" +
                "<div class='col-sm-6 cx-field'><label class='cx-label' for='rg-ref'>Référence <span class='cx-opt'>(facultatif)</span></label><input type='text' class='form-control' id='rg-ref'></div></div>",
            okText: "Marquer réglée", okClass: "cx-btn-success"
        }).done(function () {
            /* lecture après fermeture : les valeurs ont été mémorisées à la saisie */
            var mode = memo.mode || CX.REF.MODES_PAIEMENT[0], ref = memo.ref || "";
            var maj = $.extend(true, {}, f);
            maj.paiements = maj.paiements || [];
            maj.paiements.push({ date: U.today(), montant: r, mode: mode, reference: ref });
            maj.statut = "PAYEE";
            // TODO API : POST /commercial/factures/{id}/regler  { mode, reference }  (paiement du solde)
            CX.api.save("factures", maj).then(function () {
                return CX.api.log("factures", f.id, "Facture réglée : paiement du solde de " + U.money(r) + " (" + mode + ")");
            }).done(function (res) { U.toast("Facture " + U.esc(f.numero) + " réglée.", "success"); dfd.resolve(res); })
                .fail(function (e) { U.toast(e || "Erreur lors de l'enregistrement", "error"); dfd.reject(e); });
        }).fail(function () { dfd.reject(); }).always(function () { $(document).off(".cxregl"); });
        var memo = {};
        $(document).off(".cxregl")
            .on("change.cxregl", "#rg-mode", function () { memo.mode = $(this).val(); })
            .on("input.cxregl", "#rg-ref", function () { memo.ref = $.trim($(this).val()); });
        return dfd.promise();
    }

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
        mailtoEnvoi: mailtoEnvoi, marquerEnvoyee: marquerEnvoyee, ouvrirPaiement: ouvrirPaiement,
        /* options de facturation et calcul centralisé */
        aPayer: aPayer, optionsFacture: optionsFacture, optionsClient: optionsClient, ecartConditions: ecartConditions,
        poidsVol: poidsVol, puMoyen: puMoyen, calculer: calculer, appliquer: appliquer,
        recalculer: recalculer, marquerReglee: marquerReglee
    };
})();

/* =====================================================================
   Commercial · Apporteurs d'affaires - fonctions partagées (CX.app)
   ---------------------------------------------------------------------
   Utilisé par apporteurs-liste.html, apporteur-form.html et
   commissions.html (chargé après facturation.js).

   Modèle « apporteurs » :
     { id, code (CRS + n° + code ville, ex. CRS513DLA), matricule,
       type (COMMERCIAL | AGENT | PARTENAIRE | PARRAIN), nom, prenoms,
       sexe (M | F), dateNaissance, tel1, tel2, email, adresse, ville,
       agenceId, tauxCommission (%), baseCommission (FACTURE | ENCAISSE),
       statut (ACTIF | SUSPENDU), notes, historique[] }
   Un client est rattaché par client.apporteurId.

   Modèle « commissions » (créé au paiement) :
     { id, numero (COM-AAAA-NNNN), apporteurId, du, au, base, taux,
       montantBase, montant, details[{ clientId, factureIds[], base, commission }],
       statut (A_PAYER | PAYEE), datePaiement, modePaiement, reference, historique[] }

   >>> INTÉGRATION SYMFONY <<<
   Le calcul (calculer) est à refaire côté serveur (service
   CommissionCalculator) ; l'écran n'en affiche qu'une simulation.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.app = (function () {
    var U = CX.util, REF = CX.REF;

    function nom(a) { return a ? $.trim((a.prenoms || "") + " " + (a.nom || "")) : ""; }
    function typeHtml(a) { return REF.badge(REF.TYPES_APPORTEUR, a.type); }
    function statutHtml(a) { return REF.badge(REF.STATUT_APPORTEUR, a.statut); }
    function taux(a) { var t = Number(a.tauxCommission) || 0; return U.fmt(t, t % 1 ? 1 : 0) + " %"; }
    function baseLib(a) { return (REF.BASES_COMMISSION[a.baseCommission] || REF.BASES_COMMISSION.FACTURE).label; }

    /* Code suivant : CRS + (plus grand n° existant + 1) + code de la ville d'affectation */
    function prochainCode(apporteurs, ville) {
        var max = 500;
        $.each(apporteurs || [], function (_, a) {
            var m = /^CRS(\d+)/.exec(a.code || "");
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return "CRS" + (max + 1) + REF.villeCode(ville);
    }

    function clientsDe(apporteurId, clients) {
        return $.grep(clients || [], function (c) { return c.apporteurId != null && String(c.apporteurId) === String(apporteurId); });
    }

    /* Base de commission d'un apporteur sur une période [du, au]
       - FACTURE  : net HT des factures émises (ni brouillon, ni annulée) dans la période
       - ENCAISSE : part HT des paiements reçus dans la période (paiement × net HT / solde à payer) */
    function calculer(a, clients, factures, du, au) {
        var mes = clientsDe(a.id, clients), base = a.baseCommission === "ENCAISSE" ? "ENCAISSE" : "FACTURE";
        var t = Number(a.tauxCommission) || 0, details = [], total = 0;
        $.each(mes, function (_, c) {
            var d = { clientId: c.id, client: c.raisonSociale, factureIds: [], base: 0 };
            $.each(factures || [], function (_, f) {
                if (String(f.clientId) !== String(c.id) || f.statut === "BROUILLON" || f.statut === "ANNULEE") return;
                if (base === "FACTURE") {
                    if ((du && f.dateEmission < du) || (au && f.dateEmission > au)) return;
                    d.base += CX.fac.netHT(f); d.factureIds.push(f.id);
                } else {
                    var due = CX.fac.aPayer(f), part = 0;
                    $.each(f.paiements || [], function (_, p) {
                        if ((du && p.date < du) || (au && p.date > au)) return;
                        part += due ? (Number(p.montant) || 0) * CX.fac.netHT(f) / due : 0;
                    });
                    if (part) { d.base += U.round(part); d.factureIds.push(f.id); }
                }
            });
            d.commission = U.round(d.base * t / 100);
            total += d.base;
            details.push(d);
        });
        details.sort(function (x, y) { return y.base - x.base; });
        return { apporteurId: a.id, base: base, taux: t, montantBase: U.round(total), montant: U.round(total * t / 100), details: details, nbClients: mes.length };
    }

    /* Chiffre d'affaires HT facturé des clients apportés sur l'année en cours */
    function caAnnee(a, clients, factures) {
        var y = U.today().substr(0, 4);
        return calculer($.extend({}, a, { baseCommission: "FACTURE" }), clients, factures, y + "-01-01", y + "-12-31").montantBase;
    }

    return {
        nom: nom, typeHtml: typeHtml, statutHtml: statutHtml, taux: taux, baseLib: baseLib,
        prochainCode: prochainCode, clientsDe: clientsDe, calculer: calculer, caAnnee: caAnnee
    };
})();

/* =====================================================================
   ClemenTino 2.0 - Module GUICHET - fonctions communes (CX.guichet)
   ---------------------------------------------------------------------
   À charger après cx-core.js, cx-data.js (et cx-tarifs.js, carnets-common.js
   quand la page en a besoin). Utilisé par expedition-form, expeditions-liste
   et recu.

     CX.guichet.STATUTS            libellés / couleurs des statuts d'expédition
     CX.guichet.SERVICES           types d'expédition (Urbaine, Nationale…)
     CX.guichet.villeAff / villeNom / titre   libellés
     CX.guichet.tel / telAff       normalisation des numéros (+237)
     CX.guichet.normaliser(e)      expédition complète (y compris celles du
                                   seed, sans le détail de saisie)
     CX.guichet.prochainNumero()   n° RT-AAMM-NNNNN (attribué par le serveur)
     CX.guichet.whatsapp(e, qui)   lien https://wa.me/237…?text=…
     CX.guichet.carnets.*          contrôle et libération des feuilles de carnet

   Modèle d'une expédition saisie au guichet (collection "expeditions") :
   voir commercial/README.md, section « Guichet ».
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.guichet = (function () {
    var U = CX.util;

    var STATUTS = {
        EN_TRANSIT: { label: "En transit", color: "blue" },
        LIVREE: { label: "Livrée", color: "green" },
        ANNULEE: { label: "Annulée", color: "red" }
    };
    var SERVICES = {
        URBAINE: { label: "Urbaine", hint: "Dans la même ville", full: "LIVRAISON URBAINE", trajet: "URBAIN", icon: "fa-bicycle" },
        NATIONALE: { label: "Nationale", hint: "Entre deux villes", full: "NATIONALE", trajet: "NATIONAL", icon: "fa-truck" },
        REGIONALE: { label: "Régionale", hint: "Pays voisins", full: "RÉGIONALE", trajet: "REGIONAL", icon: "fa-globe" },
        INTERNATIONALE: { label: "Internationale", hint: "Autres pays", full: "INTERNATIONALE", trajet: "INTERNATIONAL", icon: "fa-plane" }
    };
    var MODE_COMPTE = "En compte";
    var MOTIFS_ANNULATION = ["Erreur de saisie", "Client a renoncé à l'envoi", "Doublon", "Colis refusé (contenu non autorisé)", "Autre"];

    /* ------------------------------------------------------------------
       Libellés
       ------------------------------------------------------------------ */
    var ACCENTS = { YAOUNDE: "YAOUNDÉ", NGAOUNDERE: "NGAOUNDÉRÉ", BUEA: "BUÉA" };
    function villeAff(v) { v = String(v || "").toUpperCase(); return ACCENTS[v] || v; }
    function titre(s) {
        s = String(s || "").toLowerCase();
        return s.replace(/(^|[\s\-'])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    function villeNom(v) { return titre(villeAff(v)); }

    /* Téléphone : chiffres seuls sans indicatif (9 chiffres au Cameroun) */
    function tel(v) {
        var d = String(v || "").replace(/\D/g, "");
        if (d.length === 12 && d.substr(0, 3) === "237") d = d.substr(3);
        if (d.length === 14 && d.substr(0, 5) === "00237") d = d.substr(5);
        return d;
    }
    function telFmt(v) {
        var d = tel(v);
        if (d.length !== 9) return String(v || "");
        return d.substr(0, 3) + " " + d.substr(3, 2) + " " + d.substr(5, 2) + " " + d.substr(7, 2);
    }
    function telAff(v) { var d = tel(v); return d ? (d.length === 9 ? "+237 " + telFmt(d) : String(v)) : "—"; }
    function kg(n) { n = Math.round((Number(n) || 0) * 10) / 10; return U.fmt(n, n % 1 ? 1 : 0) + " kg"; }

    function statutBadge(code) { return CX.REF.badge(STATUTS, code); }
    function deduireService(e) {
        if (e.service && SERVICES[e.service]) return e.service;
        if (e.paysDest) return CX.tarifs && CX.tarifs.zoneDuPays(e.paysDest) === "CEMAC" ? "REGIONALE" : "INTERNATIONALE";
        return e.villeDep && e.villeDep === e.villeDest ? "URBAINE" : "NATIONALE";
    }

    /* ------------------------------------------------------------------
       Expédition normalisée : les expéditions du jeu de démo (clients en
       compte, saisies avant le guichet) n'ont pas le détail de saisie ;
       on reconstitue des valeurs d'affichage cohérentes.
       ------------------------------------------------------------------ */
    function normaliser(e0) {
        var e = $.extend(true, {}, e0);
        var client = e.clientId ? $.grep(CX.api.clientsSync(), function (c) { return c.id == e.clientId; })[0] : null;
        e.typeClient = e.typeClient || (e.clientId ? "COMPTE" : "PARTICULIER");
        e.service = deduireService(e);
        e.livraison = $.extend({ mode: "BUREAU", zone: "", quartier: "", repere: "", telAppel: "" }, e.livraison || {});
        e.expediteurInfo = $.extend({ nom: e.expediteur || (client ? client.raisonSociale : ""), tel: "", whatsapp: "", adresse: "", email: "" }, e.expediteurInfo || {});
        if (!e.expediteurInfo.tel && client) e.expediteurInfo.tel = tel((client.contacts && client.contacts[0] && client.contacts[0].tel1) || client.telStandard);
        e.destinataireInfo = $.extend({ nom: e.destinataire || "", tel: tel(e.telDestinataire), whatsapp: "", adresse: "", email: "" }, e.destinataireInfo || {});
        if (!e.colis || !e.colis.length) {
            e.colis = [{ nature: "Colis", poids: e.poids || 0, L: "", l: "", H: "", nombre: e.nbColis || 1, valeur: 0, description: e.contenu || "", poidsTaxable: e.poids || 0 }];
            e.colis[0].poidsTaxable = Math.round((Number(e.poids) || 0) / Math.max(1, e.nbColis || 1) * 10) / 10;
        }
        e.montants = $.extend({ transport: U.round(e.montant), emballage: 0, livraison: 0, autres: 0, total: U.round(e.montant) }, e.montants || {});
        e.paiement = $.extend(e.clientId ? { mode: MODE_COMPTE, recu: 0, rendu: 0, statut: "EN_COMPTE" } : { mode: "Espèces", recu: e.montant, rendu: 0, statut: "PAYE" }, e.paiement || {});
        e.guichetier = e.guichetier || e.creePar || "";
        e.heure = e.heure || "";
        e.client = client || null;
        return e;
    }
    function estModifiable(e) { return e.statut === "EN_TRANSIT" && !e.factureId; }
    function motifNonModifiable(e) {
        if (e.statut === "ANNULEE") return "Expédition annulée";
        if (e.factureId) return "Déjà facturée";
        if (e.statut === "LIVREE") return "Déjà livrée";
        return "";
    }

    /* ------------------------------------------------------------------
       Numérotation RT-AAMM-NNNNN (séquence continue, comme le jeu de démo)
       TODO API : attribué par le serveur à l'enregistrement (POST /guichet/expeditions)
       ------------------------------------------------------------------ */
    function prochainNumero(dateIso) {
        var max = 1200;
        $.each(CX.api.listSync("expeditions"), function (_, x) {
            var m = /-(\d{5})$/.exec(x.nRt || "");
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        var d = dateIso || U.today();
        return "RT-" + d.substr(2, 2) + d.substr(5, 2) + "-" + ("00000" + (max + 1)).slice(-5);
    }

    /* ------------------------------------------------------------------
       WhatsApp : lien wa.me pré-rempli (envoi manuel depuis le poste).
       TODO API : POST /guichet/expeditions/{id}/whatsapp  { destinataires: ["EXPEDITEUR","DESTINATAIRE"] }
                  (envoi automatique du reçu PDF par l'API WhatsApp Business côté serveur)
       qui = "EXPEDITEUR" | "DESTINATAIRE"
       ------------------------------------------------------------------ */
    function numeroWhatsapp(e, qui) {
        var p = qui === "DESTINATAIRE" ? e.destinataireInfo : e.expediteurInfo;
        return tel(p.whatsapp || p.tel);
    }
    function messageWhatsapp(e, qui) {
        var dst = e.service === "REGIONALE" || e.service === "INTERNATIONALE"
            ? (e.villeEtranger || "") + (e.paysDest ? " (" + e.paysDest + ")" : "")
            : villeNom(e.villeDest) + (e.livraison.mode === "DOMICILE" ? " · livraison " + (e.livraison.quartier || "à domicile") : " · retrait bureau " + titre(e.bureauDest));
        var nb = 0; $.each(e.colis, function (_, c) { nb += Math.max(1, parseInt(c.nombre, 10) || 1); });
        var lignes = [
            (CX.CONFIG.SOCIETE.nom || "ClemenTino") + " - Reçu de transport N° " + e.nRt,
            "Date : " + U.toFr(e.dateExp) + (e.heure ? " à " + e.heure : ""),
            "Trajet : " + villeNom(e.villeDep) + " (bureau " + titre(e.bureauDep) + ") → " + dst,
            "Expéditeur : " + e.expediteurInfo.nom + " · " + telAff(e.expediteurInfo.tel),
            "Destinataire : " + e.destinataireInfo.nom + " · " + telAff(e.destinataireInfo.tel),
            "Colis : " + nb + " colis · " + kg(e.poids) + " taxable" + (e.poids > 1 ? "s" : ""),
            "Montant : " + U.money(e.montants.total) + (e.paiement.mode ? " (" + e.paiement.mode + ")" : "")
        ];
        if (e.nRtMan) lignes.push("LT manuelle n° " + e.nRtMan);
        lignes.push(qui === "DESTINATAIRE" ? "Présentez ce numéro et une pièce d'identité au retrait." : "Conservez ce message : il sert au suivi de votre envoi.");
        return lignes.join("\n");
    }
    function whatsapp(e, qui) {
        var n = numeroWhatsapp(e, qui);
        if (n.length !== 9) return null;
        return "https://wa.me/237" + n + "?text=" + encodeURIComponent(messageWhatsapp(e, qui));
    }

    /* ------------------------------------------------------------------
       Feuilles des carnets de LT (maquettes-carnets/assets/carnets-common.js)
       Un carnet = plage de n° de feuilles remise à un client en compte ;
       statut d'une feuille : PERDUE / ANNULEE (anomalie), UTILISEE (n° ≤
       dernier utilisé), DISPONIBLE. Chaque expédition enregistrée avec un
       nRtMan fait avancer le « dernier n° utilisé » (CT.store.syncExpeditions).
       TODO API : contrôles refaits côté serveur (GET /carnets/recherche-feuille?numero=&client=)
       ------------------------------------------------------------------ */
    var carnets = {
        dispo: function () { return !!(window.CT && CT.store && CT.metier); },
        num: function (v) { var d = String(v == null ? "" : v).replace(/\D/g, ""); return d ? parseInt(d, 10) : null; },
        duClient: function (clientId) {
            if (!carnets.dispo() || !clientId) return [];
            return $.grep(CT.store.tous(), function (c) { return c.clientId == clientId && !c.cloture; })
                .sort(function (a, b) { return a.debut - b.debut; });
        },
        /* Expéditions actives (non annulées) utilisant la feuille n */
        utilisations: function (n, saufId) {
            return $.grep(CX.api.listSync("expeditions"), function (e) {
                return e.statut !== "ANNULEE" && carnets.num(e.nRtMan) === n && String(e.id) !== String(saufId || "");
            });
        },
        /* Feuille libérée par l'annulation d'une expédition (réutilisable au guichet) */
        liberee: function (n) {
            return $.grep(CX.api.listSync("expeditions"), function (e) { return e.statut === "ANNULEE" && carnets.num(e.nRtManLibere) === n; }).length > 0;
        },
        /* Prochaine feuille attendue pour le client : { carnet, numero, libelle } ou null */
        prochaine: function (clientId) {
            var res = null;
            $.each(carnets.duClient(clientId), function (_, c) {
                var n = CT.metier.prochainNumero(c);
                while (n != null && carnets.utilisations(n).length) n = n + 1 <= c.fin ? CT.metier.prochainNumero($.extend({}, c, { dernierUtilise: n })) : null;
                if (n != null) { res = { carnet: c, numero: n, libelle: (c.prefixe || "") + n }; return false; }
            });
            return res;
        },
        /* Contrôle d'une feuille saisie pour un client.
           ancien = n° déjà porté par l'expédition en cours de correction.
           Retour : { ok, erreur, avertissement, carnet, numero } */
        verifier: function (clientId, saisie, expId, ancien) {
            var r = { ok: false, erreur: "", avertissement: "", carnet: null, numero: carnets.num(saisie) };
            if (!carnets.dispo()) { r.ok = true; r.avertissement = "Contrôle des carnets indisponible sur ce poste."; return r; }
            var n = r.numero;
            if (n == null) { r.erreur = "N° de feuille invalide."; return r; }
            var tous = $.grep(CT.store.tous(), function (c) { return n >= c.debut && n <= c.fin; });
            if (!tous.length) { r.erreur = "La feuille " + n + " n'appartient à aucun carnet enregistré."; return r; }
            var c = $.grep(tous, function (x) { return x.clientId == clientId; })[0];
            if (!c) {
                var autre = tous[0];
                r.erreur = autre.clientId ? "La feuille " + n + " appartient au carnet " + autre.numero + " remis à " + CT.util.clientNom(autre.clientId) + "."
                    : "La feuille " + n + " appartient au carnet " + autre.numero + ", encore en stock (non remis à ce client).";
                return r;
            }
            r.carnet = c;
            if (c.cloture) { r.erreur = "Le carnet " + c.numero + " est clôturé."; return r; }
            var deja = carnets.utilisations(n, expId);
            if (deja.length) { r.erreur = "Feuille déjà utilisée par l'expédition " + deja[0].nRt + " du " + U.toFr(deja[0].dateExp) + "."; return r; }
            var st = CT.metier.statutFeuille(c, n);
            if (st === "PERDUE" || st === "ANNULEE") {
                var an = $.grep(c.anomalies, function (a) { return a.numero === n; })[0];
                r.erreur = "Feuille déclarée " + (st === "PERDUE" ? "perdue" : "annulée") + (an ? " le " + U.toFr(an.date) + " (" + an.motif + ")" : "") + ".";
                return r;
            }
            var mienne = carnets.num(ancien) === n;
            if (st === "UTILISEE" && !mienne && !carnets.liberee(n)) {
                r.erreur = "Feuille marquée « utilisée » dans le carnet " + c.numero + " (dernier n° utilisé : " + c.dernierUtilise + ").";
                return r;
            }
            var attendu = CT.metier.prochainNumero(c);
            if (st === "DISPONIBLE" && attendu != null && n > attendu) {
                r.avertissement = "Prochaine feuille attendue : " + attendu + ". Les feuilles " + attendu + (n - 1 > attendu ? " à " + (n - 1) : "") +
                    " seront considérées comme utilisées dans le carnet (saut de numérotation).";
            }
            r.ok = true;
            return r;
        },
        /* Libère une feuille (annulation ou correction d'une expédition).
           Le carnet ne connaît que le « dernier n° utilisé » : si la feuille est la
           dernière, on recule d'un cran ; sinon elle reste réutilisable au guichet
           (repérée par nRtManLibere de l'expédition annulée). */
        liberer: function (saisie) {
            var n = carnets.num(saisie);
            if (!carnets.dispo() || n == null) return $.Deferred().resolve(null).promise();
            var c = $.grep(CT.store.tous(), function (x) { return n >= x.debut && n <= x.fin; })[0];
            if (!c || c.dernierUtilise !== n) return $.Deferred().resolve(c || null).promise();
            // TODO API : PUT /carnets/{id}/dernier-utilise { numero } (fait par le serveur à l'annulation)
            return CT.store.majDernierUtilise(c.id, n - 1 >= c.debut ? n - 1 : null);
        },
        /* Force la synchronisation carnets <- expéditions (fait côté serveur en production) */
        synchroniser: function () { if (carnets.dispo()) CT.store.tous(); }
    };

    /* ------------------------------------------------------------------
       Annulation (motif, statut ANNULEE, libération de la feuille)
       TODO API : POST /guichet/expeditions/{id}/annuler  { motif }
       ------------------------------------------------------------------ */
    function annuler(e, motif) {
        var feuille = e.nRtMan || null;
        var patch = {
            statut: "ANNULEE", nRtMan: null, nRtManLibere: feuille,
            annulation: { date: U.now(), user: CX.CONFIG.USER.nom, motif: motif }
        };
        return CX.api.patchMany("expeditions", [e.id], patch)
            .then(function () { return CX.api.log("expeditions", e.id, "Expédition annulée : " + motif + (feuille ? " (feuille " + feuille + " libérée)" : "")); })
            .then(function () { return carnets.liberer(feuille); })
            .then(function () { return CX.api.get("expeditions", e.id); });
    }
    function modaleAnnulation(e) {
        var dfd = $.Deferred();
        $("#gx-annuler").remove();
        var $m = $("<div class='modal fade' id='gx-annuler' tabindex='-1' role='dialog'><div class='modal-dialog' style='max-width:480px'><div class='modal-content'>" +
            "<div class='modal-header'><button type='button' class='close' data-dismiss='modal' aria-label='Fermer'>&times;</button>" +
            "<h4 class='modal-title'><i class='fa fa-ban'></i>Annuler l'expédition " + U.esc(e.nRt) + "</h4></div>" +
            "<div class='modal-body'>" +
            "<p class='cx-muted' style='margin-top:0'>L'expédition passe au statut <b>Annulée</b> : elle reste dans l'historique mais n'est plus ni livrée ni facturée." +
            (e.nRtMan ? " La feuille de carnet <b>" + U.esc(e.nRtMan) + "</b> est libérée." : "") + "</p>" +
            "<div class='cx-field'><label class='cx-label req' for='gx-an-motif'>Motif</label><select class='form-control' id='gx-an-motif'>" +
            $.map(MOTIFS_ANNULATION, function (m) { return "<option>" + U.esc(m) + "</option>"; }).join("") + "</select></div>" +
            "<div class='cx-field' style='margin-bottom:0'><label class='cx-label' for='gx-an-precision'>Précision <span class='cx-opt'>(obligatoire pour « Autre »)</span></label>" +
            "<textarea class='form-control' id='gx-an-precision' maxlength='250'></textarea></div>" +
            (e.paiement && e.paiement.statut === "PAYE" && e.montants.total > 0 ? "<div class='cx-note cx-note-warn'><i class='fa fa-money'></i><div>Montant encaissé : <b>" + U.money(e.montants.total) + "</b> (" + U.esc(e.paiement.mode) + "). Pensez au remboursement en caisse.</div></div>" : "") +
            "</div><div class='modal-footer'><button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Retour</button>" +
            "<button type='button' class='cx-btn cx-btn-danger' id='gx-an-ok'><i class='fa fa-ban'></i> Annuler l'expédition</button></div></div></div></div>").appendTo("body");
        var fait = false;
        $m.on("click", "#gx-an-ok", function () {
            var motif = $("#gx-an-motif").val(), pr = $.trim($("#gx-an-precision").val());
            if (motif === "Autre" && !pr) { $("#gx-an-precision").closest(".cx-field").addClass("has-error"); $("#gx-an-precision").focus(); return; }
            var txt = motif + (pr ? " - " + pr : "");
            U.busy($(this), true);
            annuler(e, txt).done(function (maj) { fait = maj; $m.modal("hide"); })
                .fail(function () { U.toast("L'annulation a échoué.", "error"); U.busy($("#gx-an-ok"), false); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* Liens vers les pages du module Commercial (pages hors commercial/) */
    function lienCommercial(page) { return (window.CX_BASE || "") + page; }

    return {
        STATUTS: STATUTS, SERVICES: SERVICES, MODE_COMPTE: MODE_COMPTE, MOTIFS_ANNULATION: MOTIFS_ANNULATION,
        villeAff: villeAff, villeNom: villeNom, titre: titre, tel: tel, telFmt: telFmt, telAff: telAff, kg: kg,
        statutBadge: statutBadge, deduireService: deduireService, normaliser: normaliser,
        estModifiable: estModifiable, motifNonModifiable: motifNonModifiable,
        prochainNumero: prochainNumero, whatsapp: whatsapp, messageWhatsapp: messageWhatsapp, numeroWhatsapp: numeroWhatsapp,
        carnets: carnets, annuler: annuler, modaleAnnulation: modaleAnnulation, lienCommercial: lienCommercial
    };
})();

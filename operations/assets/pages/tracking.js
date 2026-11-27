/* =====================================================================
   Tracking · Suivi d'un colis (operations/tracking.html[?lt=][&vue=client])
   ---------------------------------------------------------------------
   Recherche par n° de LT, n° de LT manuelle ou téléphone du destinataire
   (plusieurs résultats -> liste), en-tête de statut, frise des étapes
   (franchies / à venir), journal détaillé, délai estimé (SLA), lien de
   partage (?lt=) et « Vue client » sans données sensibles.

   >>> INTÉGRATION SYMFONY <<<
   La vue client correspond à une page publique (hors authentification) :
   GET /suivi/{numero} -> mêmes gabarits, données filtrées côté serveur
   (jamais de montants, d'agents, de pièces d'identité ni de téléphones).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet;
    var courant = null, vueClient = U.queryParam("vue") === "client";

    /* Masquage des données personnelles en vue client */
    function nomMasque(n) {
        var p = String(n || "").split(/\s+/).filter(Boolean);
        if (!p.length) return "—";
        return $.map(p, function (x, i) { return i === 0 ? x.charAt(0) + x.substr(1).toLowerCase() : x.charAt(0).toUpperCase() + "."; }).join(" ");
    }
    function telMasque(t) { var d = G.tel(t); return d.length === 9 ? "+237 " + d.substr(0, 3) + " •• •• " + d.substr(7, 2) : "—"; }

    function rechercher(q) {
        q = $.trim(q || "");
        if (!q) return;
        // TODO API : GET /exploitation/tracking?q={numero|telephone}  (public : GET /suivi/{numero})
        CX.api.list("expeditions").done(function (rows) {
            var trouve = O.chercherLt(q, rows), liste = trouve ? [trouve] : [];
            if (!trouve) {
                var t = G.tel(q);
                if (t.length >= 8) liste = $.grep(rows, function (e) { var n = O.norm(e); return G.tel(n.destinataireInfo.tel) === t || G.tel(n.telDestinataire) === t || G.tel(n.expediteurInfo.tel) === t; });
            }
            liste.sort(function (a, b) { return a.dateExp < b.dateExp ? 1 : -1; });
            if (!liste.length) {
                courant = null;
                $("#suivi").empty();
                $("#resultats").html("<div class='cx-card'><div class='cx-empty'><i class='fa fa-search'></i><b>Aucun colis trouvé pour « " + U.esc(q) + " »</b>Vérifiez le numéro inscrit sur votre reçu.</div></div>");
                return;
            }
            if (liste.length === 1) { $("#resultats").empty(); afficher(liste[0]); return; }
            courant = null; $("#suivi").empty();
            $("#resultats").html("<div class='cx-card'><div class='cx-card-head'><span class='cx-step'><i class='fa fa-list'></i></span><div><h3 class='cx-card-title'>" + liste.length + " colis pour ce numéro</h3>" +
                "<p class='cx-card-sub'>Choisissez le colis à suivre</p></div></div><div class='cx-card-body'><div class='cx-table-wrap'><table class='cx-table'><thead><tr><th>N° LT</th><th>Date</th><th>Trajet</th><th>Statut</th><th></th></tr></thead><tbody>" +
                $.map(liste.slice(0, 30), function (e0) {
                    var e = O.norm(e0);
                    return "<tr><td class='cx-mono cx-strong'>" + U.esc(e.nRt) + "</td><td>" + U.toFr(e.dateExp) + "</td><td>" + U.esc(G.villeNom(e.villeDep)) + " → " + U.esc(O.destinationLib(e)) + "</td>" +
                        "<td>" + O.etapeBadge(e.etape) + "</td><td><button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-lt='" + U.esc(e.nRt) + "'>Suivre <i class='fa fa-angle-right'></i></button></td></tr>";
                }).join("") + "</tbody></table></div></div></div>");
        });
    }

    function statutEntete(e) {
        var et = O.ETAPES[e.etape], couleurs = { green: "var(--cx-green)", orange: "var(--cx-orange)", red: "var(--cx-red)", blue: "var(--cx-navy-2)", purple: "var(--cx-purple)", grey: "#6b7280" };
        var phrase = {
            ENREGISTREE: "Votre colis a été déposé à l'agence de départ.", GROUPEE: "Votre colis est prêt à partir.", EN_TRANSIT: "Votre colis est en route.",
            ARRIVEE: "Votre colis est arrivé à l'agence de destination.", EN_INSTANCE: "Votre colis vous attend à l'agence.",
            EN_LIVRAISON: "Votre colis est en cours de livraison.", ECHEC: "La livraison n'a pas pu être effectuée : une nouvelle tentative est prévue.",
            LIVREE: "Votre colis a été remis.", ANNULEE: "Cette expédition a été annulée."
        }[e.etape];
        return "<div class='ox-track-status' style='color:" + couleurs[et.color] + "'><i class='fa " + et.icon + "'></i> " + U.esc(et.label) + "</div><p style='margin:4px 0 0'>" + U.esc(phrase) + "</p>";
    }
    function afficher(e0) {
        var e = O.norm(e0); courant = e0;
        var s = e.sla, lv = e.livraison, pub = vueClient;
        var dernier = (e.suivi || [])[e.suivi.length - 1];
        var eta = e.etape === "LIVREE" ? "<small>Livré le</small><b>" + U.toFrLong(e.dateLivraison) + "</b>" + (s.horsDelai ? "<div class='cx-cell-sub'>hors délai cible (" + O.pl(s.cible, "jour") + ")</div>" : "<div class='cx-cell-sub' style='color:var(--cx-green)'><i class='fa fa-check'></i> dans les délais</div>")
            : e.etape === "ANNULEE" ? "<small>Expédition</small><b>Annulée</b>"
            : "<small>Livraison estimée</small><b>" + (s.retard ? "Dès que possible" : U.toFrLong(s.echeance)) + "</b>" + (s.retard ? "<div class='cx-cell-sub' style='color:var(--cx-red)'><i class='fa fa-clock-o'></i> retard de " + O.pl(s.joursRetard, "jour") + "</div>" : "<div class='cx-cell-sub'>délai cible " + O.pl(s.cible, "jour") + "</div>");
        var lien = window.location.href.split("?")[0] + "?lt=" + encodeURIComponent(e.nRt) + "&vue=client";
        var agRetrait = O.agence(e.agDestId);
        var dest = pub ? nomMasque(e.destinataireInfo.nom) : U.esc(e.destinataireInfo.nom);
        var expd = pub ? nomMasque(e.expediteurInfo.nom) : U.esc(e.expediteurInfo.nom);
        var html =
            "<div class='cx-card'><div class='cx-card-body'><div class='ox-track-head'><div>" +
            "<div class='cx-crumb'>Lettre de transport</div><div class='ox-fiche-num'>" + U.esc(e.nRt) + (e.nRtMan && !pub ? " <span class='cx-tag cx-mono'>Man. " + U.esc(e.nRtMan) + "</span>" : "") + "</div>" +
            "<div class='ox-fiche-route'>" + U.esc(O.origineLib(e)) + " <i class='fa fa-long-arrow-right'></i> " + U.esc(O.destinationLib(e)) + " <small>" + (lv.mode === "DOMICILE" ? "livraison à domicile" : "retrait en agence") + "</small></div>" +
            "<div style='margin-top:10px'>" + statutEntete(e) + "</div>" +
            (dernier ? "<div class='cx-cell-sub' style='margin-top:4px'>Dernière mise à jour : " + U.esc(U.toFr(dernier.date)) + " · " + U.esc(G.villeNom(dernier.lieu)) + "</div>" : "") +
            "</div><div class='ox-track-eta'>" + eta + "</div></div>" + O.frise(e) + "</div></div>" +
            "<div class='ox-dash'><div class='cx-card'><div class='cx-card-head'><span class='cx-step'><i class='fa fa-road'></i></span><div><h3 class='cx-card-title'>Journal du suivi</h3>" +
            "<p class='cx-card-sub'>" + O.pl(e.suivi.length, "évènement") + "</p></div></div><div class='cx-card-body'>" + O.timeline(e, pub) + "</div></div>" +
            "<aside><div class='cx-card'><div class='cx-card-head'><span class='cx-step'><i class='fa fa-cube'></i></span><div><h3 class='cx-card-title'>Envoi</h3></div></div><div class='cx-card-body'><dl class='cx-dl ox-dl'>" +
            "<dt>Déposé le</dt><dd>" + U.toFrLong(e.dateExp) + "</dd><dt>Expéditeur</dt><dd>" + expd + "</dd><dt>Destinataire</dt><dd>" + dest + "<div class='cx-cell-sub'>" + (pub ? telMasque(e.destinataireInfo.tel) : U.esc(G.telAff(e.destinataireInfo.tel))) + "</div></dd>" +
            "<dt>Colis</dt><dd>" + O.pl(e.nbColis || 1, "colis", "colis") + " · " + U.esc(G.kg(e.poids)) + "</dd>" +
            "<dt>Remise</dt><dd>" + (lv.mode === "DOMICILE" ? "À domicile" + (lv.quartier ? " · " + U.esc(lv.quartier) : "") : "En agence" + (agRetrait ? " · " + U.esc(O.agenceLib(agRetrait.id)) : "")) + "</dd>" +
            (e.etape === "EN_INSTANCE" ? "<dt>Retrait</dt><dd>Munissez-vous de ce numéro et d'une pièce d'identité.</dd>" : "") +
            (e.etape === "LIVREE" && e.remise ? "<dt>Remis à</dt><dd>" + (pub ? nomMasque(e.remise.nom) : U.esc(e.remise.nom)) + "</dd>" : "") +
            "</dl>" +
            (pub ? "" : "<hr class='cx-sep'><dl class='cx-dl ox-dl ox-interne'><dt>Client</dt><dd>" + (e.client ? U.esc(e.client.raisonSociale) : "Particulier") + "</dd><dt>Montant</dt><dd>" + U.money(e.montants.total) + "</dd>" +
                "<dt>Bordereau</dt><dd>" + (e.bordereauId ? "<a href='bordereau.html?id=" + e.bordereauId + "'>" + U.esc(e.bordereau) + "</a>" : "—") + "</dd>" +
                "<dt>Position</dt><dd>" + (e.positionId ? U.esc(O.agenceLib(e.positionId)) : e.etape === "EN_TRANSIT" ? "Dans le véhicule" : "—") + "</dd></dl>" +
                "<div class='ox-flex ox-interne' style='margin-top:10px'><a class='cx-btn cx-btn-ghost cx-btn-sm' href='lettres-voiture.html?id=" + e.id + "'><i class='fa fa-file-text-o'></i> Fiche de la LT</a>" +
                "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='../guichet/recu.html?id=" + e.id + "' target='_blank'><i class='fa fa-print'></i> Reçu</a></div>") +
            "</div></div>" +
            "<div class='cx-card'><div class='cx-card-head'><span class='cx-step'><i class='fa fa-share-alt'></i></span><div><h3 class='cx-card-title'>Partager le suivi</h3><p class='cx-card-sub'>Lien public (vue client)</p></div></div>" +
            "<div class='cx-card-body'><div class='ox-flex'><input type='text' class='form-control ox-grow' id='lien' readonly value='" + U.esc(lien) + "' aria-label='Lien de suivi'>" +
            "<button type='button' class='cx-btn cx-btn-ghost' id='btn-copier'><i class='fa fa-clipboard'></i> Copier</button></div>" +
            "<a class='cx-btn cx-btn-success cx-btn-sm ox-mt' target='_blank' href='https://wa.me/?text=" + encodeURIComponent("Suivez votre colis " + e.nRt + " : " + lien) + "'><i class='fa fa-whatsapp'></i> Envoyer par WhatsApp</a>" +
            "</div></div></aside></div>";
        $("#suivi").html(html);
        $("#track-q").val(e.nRt);
        if (window.history.replaceState) window.history.replaceState(null, "", "?lt=" + encodeURIComponent(e.nRt) + (vueClient ? "&vue=client" : ""));
        document.title = "Suivi " + e.nRt + " - ClemenTino";
    }
    function majVue() {
        $("body").toggleClass("ox-vue-client", vueClient);
        $(".ox-track-mode [data-vue]").removeClass("active").filter("[data-vue='" + (vueClient ? "client" : "interne") + "']").addClass("active");
        if (courant) CX.api.get("expeditions", courant.id).done(afficher);
    }

    $("#form-track").on("submit", function (ev) { ev.preventDefault(); rechercher($("#track-q").val()); });
    $("#resultats").on("click", "[data-lt]", function () { rechercher($(this).data("lt")); });
    $(".ox-track-mode").on("click", "[data-vue]", function () { vueClient = $(this).data("vue") === "client"; majVue(); });
    $("#suivi").on("click", "#btn-copier", function () {
        var $i = $("#lien"); $i[0].select();
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText($i.val());
            else document.execCommand("copy");
            U.toast("Lien copié.", "info");
        } catch (err) { U.toast("Copiez le lien manuellement (Ctrl+C).", "warning"); }
    });

    majVue();
    if (U.queryParam("lt")) { $("#track-q").val(U.queryParam("lt")); rechercher(U.queryParam("lt")); }
    else $("#track-q").focus();
});

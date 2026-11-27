/* =====================================================================
   Opérations · Manifeste d'un bordereau (operations/bordereau.html?id=)
   ---------------------------------------------------------------------
   Feuille A4 imprimable : en-tête société, n° + QR code, trajet,
   véhicule, chauffeur, scellé, liste des colis (case de pointage),
   totaux, écarts constatés à l'arrivée, signatures chauffeur / chef
   d'agence départ / chef d'agence arrivée. PDF direct via CX.pdf.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, S = CX.CONFIG.SOCIETE;
    var id = U.queryParam("id"), b = null;

    function logoSrc() {
        var l = S.logo || "";
        return !l ? "" : /^(https?:|data:|\/)/.test(l) ? l : (window.CX_BASE || "") + l;
    }
    function qrSvg(txt) {
        if (!CX.recu || !CX.recu.qr) return "";
        try { var q = CX.recu.qr(txt); return "<svg viewBox='" + q.view + "' shape-rendering='crispEdges' aria-label='QR code'><rect width='100%' height='100%' fill='#fff'/><path d='" + q.path + "' fill='#0f172a'/></svg>"; }
        catch (err) { return ""; }
    }
    function info(lbl, v) { return "<div><small>" + lbl + "</small><b>" + (v || "—") + "</b></div>"; }

    function rendre(exps) {
        var map = {}; $.each(exps, function (_, e) { map[e.id] = O.norm(e); });
        var lignes = $.map(b.expeditionIds, function (x) { return map[x] || null; });
        var nb = 0, poids = 0, valeur = 0;
        $.each(lignes, function (_, e) { nb += e.nbColis || 1; poids += Number(e.poids) || 0; $.each(e.colis, function (_, c) { valeur += Number(c.valeur) || 0; }); });
        var recus = {}; $.each(b.recus || [], function (_, x) { recus[x] = true; });
        var cloture = b.statut === "CLOTURE";
        var html = "<div class='ox-sheet' id='sheet'>" +
            (b.annule ? "<div class='ox-sh-wm' style='color:rgba(220,38,38,.12)'>ANNULÉ</div>" : b.statut === "PREPARE" ? "<div class='ox-sh-wm'>EN PRÉPARATION</div>" : "") +
            "<div class='ox-sh-head'><div class='ox-sh-logo'>" + (logoSrc() ? "<img src='" + U.esc(logoSrc()) + "' alt=''>" : "") +
            "<div class='ox-sh-soc'><b>" + U.esc(S.nom) + "</b><span>" + U.esc(S.slogan || "") + "</span><br><span>" + U.esc(S.adresse || "") + " · " + U.esc(S.tel || "") + "</span></div></div>" +
            "<div class='ox-flex' style='align-items:flex-start;gap:12px'><div class='ox-sh-titre'><h1>BORDEREAU D'EXPÉDITION</h1><div class='cx-muted' style='font-size:10px'>Manifeste de voyage inter-agences</div>" +
            "<div class='ox-sh-num'>" + U.esc(b.numero) + "</div><div style='font-size:10px'>Statut : <b>" + U.esc(O.STATUT_BORDEREAU[b.statut].label) + "</b></div></div>" +
            "<div class='ox-sh-qr'>" + qrSvg(b.numero) + "</div></div></div>" +
            "<div class='ox-sh-infos'>" +
            info("Agence de départ", U.esc(O.agenceLib(b.agenceDepId))) + info("Agence d'arrivée", U.esc(O.agenceLib(b.agenceDestId))) +
            info("Date", U.esc(U.toFr(b.date)) + (b.heure ? " · " + U.esc(b.heure) : "")) + info("Départ effectif", b.dateDepart ? U.esc(U.toFr(b.dateDepart)) : "") +
            info("N° BE manuel", "<span class='cx-mono'>" + U.esc(b.numeroManuel || "—") + "</span>") + info("Moyen de transport", U.esc((O.MOYENS_TRANSPORT[b.moyen || "ROUTE"] || "").toUpperCase() + " " + (b.numeroTransport || (b.vehicule || {}).immatriculation || ""))) +
            info("Transporteur", U.esc(b.transporteur || "—")) + info("Départ / arrivée prévus", U.esc(U.toFr(b.departPrevu || b.date)) + (b.arriveePrevue ? "<br>" + U.esc(U.toFr(b.arriveePrevue)) : "")) + info("Personne à contacter", U.esc(b.contact || "—")) + info("Chauffeur", U.esc(((b.chauffeur || {}).nom || "") + ((b.chauffeur || {}).tel ? " · " + b.chauffeur.tel : ""))) +
            info("Plan de voyage", U.esc(b.planVoyage || "")) + info("N° de scellé", "<span class='cx-mono'>" + U.esc(b.scelle || "") + "</span>") + info("Arrivée", b.dateArrivee ? U.esc(U.toFr(b.dateArrivee)) : "") +
            "</div>" +
            "<table class='ox-sh-table'><thead><tr><th>#</th><th>N° reçu transport / réf.</th><th>Expéditeur</th><th>Destinataire</th><th>Destination finale</th><th>Contenu</th><th class='num'>Colis</th><th class='num'>Poids</th><th>Remise</th><th>Pointage</th></tr></thead><tbody>" +
            $.map(lignes, function (e, i) {
                var pt = recus[e.id] ? "✔ reçu" : cloture ? "✘ manquant" : "<span class='ox-sh-box'></span>";
                return "<tr><td>" + (i + 1) + "</td><td class='cx-mono'><b>" + U.esc(e.nRt) + "</b>" + (e.rtMan ? "<br><small>Man. " + U.esc(e.rtMan) + "</small>" : "") + "<br><small>" + U.esc(e.refLot) + (e.refs.length > 1 ? " (" + e.refs.length + " lots)" : "") + "</small></td>" +
                    "<td>" + U.esc(e.expediteurInfo.nom) + "</td><td>" + U.esc(e.destinataireInfo.nom) + "<br><small>" + U.esc(G.telAff(e.destinataireInfo.tel)) + "</small></td>" +
                    "<td>" + U.esc(O.destinationLib(e)) + (String(e.agDestId) !== String(b.agenceDestId) ? " <b>(transit)</b>" : "") + "</td><td>" + U.esc(e.contenu || "") + "</td>" +
                    "<td class='num'>" + (e.nbColis || 1) + "</td><td class='num'>" + U.esc(G.kg(e.poids)) + "</td>" +
                    "<td>" + (e.livraison.mode === "DOMICILE" ? "Domicile" : "Agence") + "</td><td>" + pt + "</td></tr>";
            }).join("") +
            (!lignes.length ? "<tr><td colspan='10' style='text-align:center;padding:20px'>Bordereau vide</td></tr>" : "") +
            "</tbody><tfoot><tr><td colspan='6'>Total : " + O.pl(lignes.length, "expédition") + (valeur ? " · valeur déclarée " + U.money(valeur) : "") + "</td>" +
            "<td class='num'>" + nb + "</td><td class='num'>" + U.esc(G.kg(poids)) + "</td><td colspan='2'></td></tr></tfoot></table>" +
            ((b.ecarts || []).length ? "<div class='ox-sh-ecarts'><b>Écarts constatés à l'arrivée :</b><ul style='margin:4px 0 0;padding-left:16px'>" + $.map(b.ecarts, function (x) {
                return "<li>" + U.esc(x.type === "MANQUANT" ? "Manquant" : x.type === "EN_TROP" ? "En trop" : x.type) + " · <b class='cx-mono'>" + U.esc(x.nRt) + "</b>" + (x.note ? " · " + U.esc(x.note) : "") + " (" + U.esc(U.toFr(x.date)) + ", " + U.esc(x.user) + ")</li>";
            }).join("") + "</ul></div>" : "") +
            (b.observations ? "<p style='margin:8px 0 0'><b>Observations :</b> " + U.esc(b.observations) + "</p>" : "") +
            "<div class='ox-sh-sign'>" +
            "<div><b>Chef d'agence de départ</b>" + U.esc(O.agenceLib(b.agenceDepId)) + "<span>Nom, date et signature</span></div>" +
            "<div><b>Chauffeur</b>" + U.esc((b.chauffeur || {}).nom || "") + "<span>Reconnaît avoir pris en charge " + O.pl(nb, "colis", "colis") + " · signature</span></div>" +
            "<div><b>Chef d'agence d'arrivée</b>" + U.esc(O.agenceLib(b.agenceDestId)) + "<span>Reçu le … à … · signature et cachet</span></div></div>" +
            "<div class='ox-sh-foot'>" + U.esc(S.nom) + " · RCCM " + U.esc(S.rccm || "") + " · NIU " + U.esc(S.niu || "") + " · Édité le " + U.esc(U.toFr(U.now())) + " par " + U.esc(CX.CONFIG.USER.nom) + "</div>" +
            "</div>";
        $("#manifeste").html(html);
        $("#l-numero").text(b.numero);
        $("#l-statut").html(O.badge(O.STATUT_BORDEREAU, b.statut));
        $("#btn-partir").toggleClass("cx-hidden", !(b.statut === "PREPARE" && O.estMoi(b.agenceDepId)));
        $("#btn-recevoir").toggleClass("cx-hidden", !((b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId))).attr("href", "degroupage.html?bordereau=" + b.id);
        $("#historique").html($.map(b.historique || [], function (h) {
            return "<li><div class='cx-tl-date'>" + U.esc(U.toFr(h.date)) + " · " + U.esc(h.user) + "</div><div class='cx-tl-text'>" + U.esc(h.action) + "</div></li>";
        }).join(""));
        document.title = "Bordereau " + b.numero + " - ClemenTino";
    }
    function charger() {
        // TODO API : GET /exploitation/bordereaux/{id}  (avec le détail des expéditions)
        CX.api.get("bordereaux", id).done(function (bb) {
            b = bb;
            CX.api.list("expeditions", function (e) { return $.inArray(e.id, b.expeditionIds) >= 0; }).done(rendre);
        }).fail(function () {
            $("#manifeste").html("<div class='cx-card'><div class='cx-empty'><i class='fa fa-truck'></i><b>Bordereau introuvable</b><a href='bordereaux.html'>Retour à la liste</a></div></div>");
            $("#actions button").prop("disabled", true);
        });
    }
    $("#btn-print").on("click", function () { window.print(); });
    $("#btn-pdf").on("click", function () {
        // TODO API (option) : GET /exploitation/bordereaux/{id}/manifeste.pdf  (KnpSnappyBundle)
        if (b) CX.pdf.telecharger("#sheet", { nom: "Bordereau " + b.numero, bouton: this });
    });
    $("#btn-partir").on("click", function () {
        O.modaleDepart(b).done(function () { U.toast("Bordereau parti : colis en transit.", "success"); charger(); });
    });
    charger();
    if (U.queryParam("print") === "1") setTimeout(function () { window.print(); }, 600);
});

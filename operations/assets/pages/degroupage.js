/* =====================================================================
   Opérations · Réception des colis (operations/degroupage.html)
   Paramètres : ?bordereau=ID (ouvre le pointage), #agence | #transit | #livraison
   ---------------------------------------------------------------------
   1. Bordereaux attendus à l'agence -> pointage expédition par
      expédition (douchette ou case) -> validation : reçues ARRIVEE,
      manquantes et en trop consignées en écarts (bordereau CLOTURE).
   2. À la réception, trois sorties (onglets) :
      - « À mettre en agence » (le client vient retirer) ;
      - « À mettre en transit » (la destination finale est une autre agence) ;
      - « À mettre en livraison » (livraison urbaine demandée au départ :
        remise directe au coursier, ou bascule en agence).
   Actions : Réorienter les RT, Mettre en agence, Livré en agence, Mettre
   en transit, Remettre au coursier.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, A = O.agenceCourante(), today = U.today();
    var tous = [], bords = [], f = null, onglet = "attendus", pt = null;

    O.selecteurAgence("#ox-agence-slot");
    $("#f-du").val(U.addDays(today, -30)); $("#f-au").val(today);

    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function filtreExp(e) { return L.passe(e, L.lireFiltres(), "dep"); }

    /* =================================================================
       Bordereaux attendus
       ================================================================= */
    function rendreAttendus() {
        var v = $("#f-ville").val(), bu = $("#f-bureau").val();
        var rows = $.grep(f.bordereauxAttendus, function (b) { return (!v || b.villeDep === v) && (!bu || String(b.agenceDepId) === bu); });
        rows.sort(function (a, b) { return (a.dateDepart || a.date) < (b.dateDepart || b.date) ? -1 : 1; });
        $("#attendus").html(rows.length ? $.map(rows, function (b) {
            var pts = (b.recus || []).length;
            return "<div class='ox-bcard" + (pt && pt.b.id === b.id ? " actif" : "") + "' data-b='" + b.id + "'><div class='ox-bcard-top'><span class='ox-bcard-num'>" + U.esc(b.numero) + "</span>" + O.badge(O.STATUT_BORDEREAU, b.statut) + "</div>" +
                "<div class='ox-bcard-route'><i class='fa fa-arrow-down cx-muted'></i> de " + U.esc(O.agenceLib(b.agenceDepId)) + "</div>" +
                "<div class='ox-bcard-meta'><span><i class='fa fa-cube'></i> " + O.pl(b.expeditionIds.length, "colis", "colis") + (pts ? " · " + pts + " pointé" + (pts > 1 ? "s" : "") : "") + "</span>" +
                "<span><i class='fa fa-truck'></i> " + U.esc((b.vehicule || {}).immatriculation || "—") + "</span><span><i class='fa fa-clock-o'></i> parti " + U.esc(U.toFr(b.dateDepart || b.date)) + "</span>" +
                "<span><i class='fa fa-lock'></i> scellé " + U.esc(b.scelle || "—") + "</span></div>" +
                "<div class='ox-bcard-actions'><button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-pointer><i class='fa fa-check-square-o'></i> Réceptionner</button>" +
                "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='bordereau.html?id=" + b.id + "'><i class='fa fa-file-text-o'></i> Manifeste</a></div></div>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-truck'></i><b>Aucun bordereau attendu</b>Les bordereaux partis vers " + U.esc(O.agenceLib(A.id)) + " apparaîtront ici.</div>");
    }

    /* =================================================================
       Pointage
       ================================================================= */
    function ouvrirPointage(b) {
        pt = { b: b, recus: {}, trop: [] };
        $.each(b.recus || [], function (_, id) { pt.recus[id] = true; });
        $("#pointage").removeClass("cx-hidden");
        $("#pt-numero").text(b.numero);
        $("#pt-statut").html(O.badge(O.STATUT_BORDEREAU, b.statut));
        $("#pt-info").text("De " + O.agenceLib(b.agenceDepId) + " · " + ((b.vehicule || {}).type || "") + " " + ((b.vehicule || {}).immatriculation || "") + " · chauffeur " + ((b.chauffeur || {}).nom || "—") + " · scellé " + (b.scelle || "—"));
        $("#pt-obs").val(b.observations || "");
        rendrePointage();
        rendreAttendus();
        $("#pointage")[0].scrollIntoView({ block: "start" });
        $("#pt-scan").focus();
    }
    function lignePointage(e, trop) {
        var recu = trop || pt.recus[e.id], dest = O.estMoi(e.agDestId);
        var orient = !dest ? "<span class='cx-badge cx-badge-purple cx-no-dot'>À mettre en transit</span>" : e.livraison.mode === "DOMICILE" ? "<span class='cx-badge cx-badge-orange cx-no-dot'>À mettre en livraison</span>" : "<span class='cx-badge cx-badge-blue cx-no-dot'>Mettre en agence</span>";
        return "<tr data-id='" + e.id + "' class='" + (trop ? "ox-trop" : recu ? "ox-recu" : "") + "'>" +
            "<td class='cx-col-check'>" + (trop ? "<button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-retirer-trop title='Retirer'><i class='fa fa-times'></i></button>" : "<input type='checkbox' class='ox-check-big' data-recu" + (recu ? " checked" : "") + " aria-label='Reçu'>") + "</td>" +
            "<td><a href='#' class='cx-mono cx-strong' data-fiche>" + U.esc(e.nRt) + "</a>" + (trop ? "<div><span class='cx-badge cx-badge-orange cx-no-dot'>En trop</span></div>" : "") + "</td>" +
            "<td>" + U.esc(e.expediteurInfo.nom) + "</td><td>" + U.esc(e.destinataireInfo.nom) + "<div class='cx-cell-sub'>" + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div></td>" +
            "<td>" + U.esc(O.destinationLib(e)) + "</td><td>" + U.esc(e.contenu || "") + "</td><td class='num'>" + (e.nbColis || 1) + "</td>" +
            "<td>" + orient + "</td><td>" + (recu ? "<span class='cx-badge cx-badge-green'>Reçu</span>" : "<span class='cx-badge cx-badge-grey'>Attendu</span>") + "</td></tr>";
    }
    function rendrePointage() {
        if (!pt) return;
        var lignes = $.map(pt.b.expeditionIds, function (id) { return parId(id) || null; });
        var n = $.grep(lignes, function (e) { return pt.recus[e.id]; }).length;
        $("#pt-table tbody").html($.map(lignes, function (e) { return lignePointage(e, false); }).join("") +
            $.map(pt.trop, function (id) { var e = parId(id); return e ? lignePointage(e, true) : null; }).join(""));
        $("#pt-bar").css("width", (lignes.length ? Math.round(n * 100 / lignes.length) : 0) + "%");
        $("#pt-compte").html("<b>" + n + "</b> / " + lignes.length + " reçus" + (lignes.length - n ? " · " + (lignes.length - n) + " manquant" + (lignes.length - n > 1 ? "s" : "") : "") +
            (pt.trop.length ? " · <b style='color:var(--cx-orange)'>" + pt.trop.length + " en trop</b>" : ""));
    }
    function scanPointage(code) {
        var $r = $("#pt-scan-res");
        function res(ok, msg) { $r.removeClass("ok ko").addClass(ok ? "ok" : "ko").html("<i class='fa " + (ok ? "fa-check" : "fa-times") + "'></i> " + msg); O.bip(ok); }
        var brut = O.chercherLt(code), e = brut ? parId(brut.id) : null;
        if (!e) return res(false, "LT « " + U.esc(code) + " » introuvable.");
        if ($.inArray(e.id, pt.b.expeditionIds) >= 0) {
            var deja = pt.recus[e.id];
            pt.recus[e.id] = true; rendrePointage();
            O.flash($("#pt-table tr[data-id='" + e.id + "']"));
            return res(true, U.esc(e.nRt) + (deja ? " déjà pointée" : " reçue") + " · " + U.esc(O.destinationLib(e)));
        }
        if ($.inArray(e.id, pt.trop) >= 0) return res(false, U.esc(e.nRt) + " déjà notée en trop.");
        if (e.etape === "EN_TRANSIT" || e.etape === "GROUPEE") {
            pt.trop.push(e.id); rendrePointage();
            return res(false, U.esc(e.nRt) + " n'est pas sur ce bordereau" + (e.bordereau ? " (prévue sur " + U.esc(e.bordereau) + ")" : "") + " : notée EN TROP.");
        }
        return res(false, U.esc(e.nRt) + " ne peut pas être réceptionnée (" + U.esc(O.ETAPES[e.etape].label) + ").");
    }
    function enregistrerPointage(cloturer) {
        var b = pt.b, ids = b.expeditionIds;
        var recus = $.grep(ids, function (id) { return pt.recus[id]; }), manquants = $.grep(ids, function (id) { return !pt.recus[id]; });
        var aRecevoir = $.grep(recus.concat(pt.trop), function (id) { var e = parId(id); return e && (e.etape === "EN_TRANSIT" || e.etape === "GROUPEE"); });
        if (!cloturer) {
            // TODO API : PUT /exploitation/bordereaux/{id}/pointage  { recus[], observations }
            return CX.api.get("bordereaux", b.id).then(function (bb) {
                bb.recus = recus; bb.statut = "ARRIVE"; bb.dateArrivee = bb.dateArrivee || U.now(); bb.observations = $.trim($("#pt-obs").val());
                O.logBordereau(bb, "Pointage enregistré : " + recus.length + " / " + ids.length);
                return CX.api.save("bordereaux", bb);
            });
        }
        var orienter = $("#pt-orienter").is(":checked");
        // TODO API : POST /exploitation/bordereaux/{id}/reception  { recus[], enTrop[], observations, orienter }
        //            (le serveur passe les colis ARRIVEE, oriente, enregistre les écarts et clôture le bordereau)
        return O.avancerLot(aRecevoir, "ARRIVEE", function (e) {
            var trop = $.inArray(e.id, pt.trop) >= 0;
            return { note: "Réception bordereau " + b.numero + (trop ? " (colis en trop, attendu sur " + (e.bordereau || "—") + ")" : ""), position: A.id, forcer: e.etape === "GROUPEE" };
        }).then(function (ok) {
            if (!orienter) return ok;
            var instance = $.grep(ok, function (e) { return O.estMoi(O.agDest(e)) && (e.livraison || {}).mode !== "DOMICILE"; });
            return O.avancerLot($.map(instance, function (e) { return e.id; }), "EN_INSTANCE", { note: "Mis en agence, avis au destinataire à envoyer", position: A.id }).then(function () { return ok; });
        }).then(function (ok) {
            /* colis manquants : trace dans le suivi (restent « en transit ») */
            var d = $.Deferred(), i = 0;
            (function suivant() {
                if (i >= manquants.length) { d.resolve(ok); return; }
                var id = manquants[i++];
                O.majExp(id, function (x) {
                    x.manquant = { date: U.now(), bordereauId: b.id, agenceId: A.id };
                    x.suivi = x.suivi || [];
                    x.suivi.push({ date: U.now(), etape: x.etape, lieu: A.ville, agence: A.nom, user: CX.CONFIG.USER.nom, note: "Manquant au dégroupage du bordereau " + b.numero });
                    O.journal(x, "Colis manquant au dégroupage du bordereau " + b.numero);
                    return true;
                }).always(suivant);
            })();
            return d.promise();
        }).then(function (ok) {
            return CX.api.get("bordereaux", b.id).then(function (bb) {
                var ecarts = bb.ecarts || [];
                $.each(manquants, function (_, id) { var e = parId(id); ecarts.push({ type: "MANQUANT", expeditionId: id, nRt: e ? e.nRt : "", note: "Non reçu au dégroupage", date: U.now(), user: CX.CONFIG.USER.nom }); });
                $.each(pt.trop, function (_, id) { var e = parId(id); ecarts.push({ type: "EN_TROP", expeditionId: id, nRt: e ? e.nRt : "", note: "Reçu hors bordereau" + (e && e.bordereau ? " (prévu sur " + e.bordereau + ")" : ""), date: U.now(), user: CX.CONFIG.USER.nom }); });
                bb.ecarts = ecarts; bb.recus = recus.concat(pt.trop); bb.statut = "CLOTURE";
                bb.dateArrivee = bb.dateArrivee || U.now(); bb.dateCloture = U.now(); bb.observations = $.trim($("#pt-obs").val());
                O.logBordereau(bb, "Réception validée : " + ok.length + " reçus, " + manquants.length + " manquant(s), " + pt.trop.length + " en trop");
                return CX.api.save("bordereaux", bb).then(function (s) { return { bordereau: s, ok: ok, manquants: manquants.length, trop: pt.trop.length }; });
            });
        });
    }

    /* =================================================================
       Listes : à mettre en agence / en transit / en livraison
       ================================================================= */
    var AIDES = {
        agence: "Expéditions arrivées pour un retrait au comptoir : « Mettre en agence » les rend disponibles au retrait (Livraison de colis) ; « Livré en agence » enregistre directement la remise.",
        transit: "Expéditions présentes dans l'agence dont la destination finale est une autre agence : « Mettre en transit » les place dans un bordereau d'expédition vers cette direction. Réorientez-les si la destination est erronée.",
        livraison: "Livraisons urbaines demandées au départ : « Remettre au coursier » crée la fiche de livraison ; « Mettre en agence » bascule l'expédition en retrait au comptoir."
    };
    function menuLigne(e) {
        return L.menu([["fiche", "fa-file-text-o", "Détail de l'expédition"], ["notes", "fa-sticky-note-o", "Notes"], ["livraison", "fa-map-marker", "Modifier la livraison"],
            ["recu", "fa-print", "Imprimer le reçu transport"]]);
    }
    var COLS = ["rt", "rtMan", "ref", "bord", "bordMan", "bureauDep", "bureauDest", "client", "contenu", "expediteur", "dateExp", "statut", "actions"];
    var dt = new CX.DataTable("#dt-liste", {
        pageSize: 25, sortKey: "dateExp", sortDir: -1, selectable: true,
        emptyText: "Aucune expédition", emptyIcon: "fa-inbox",
        rowClass: function (e) { return (e.suspendu ? "ox-suspendu " : "") + (e.sla.retard ? "ox-retard" : ""); },
        columns: L.colonnes(COLS, bords, menuLigne),
        onSelect: function (rows) {
            $("#selbar").toggleClass("cx-hidden", !rows.length);
            $("#sel-n").text(O.pl(rows.length, "RT sélectionnée", "RT sélectionnées"));
            $("#selbar [data-act=livre]").prop("disabled", rows.length !== 1);
        }
    });
    O.menusFixes("#dt-liste");
    function listeOnglet() {
        var l = onglet === "agence" ? f.aMettreEnAgence : onglet === "transit" ? f.transitIci : onglet === "livraison" ? f.aMettreEnLivraison : [];
        return $.grep(l, filtreExp);
    }
    function rendre() {
        $("#n-attendus").text(f.bordereauxAttendus.length);
        $("#n-agence").text(f.aMettreEnAgence.length);
        $("#n-transit").text(f.transitIci.length);
        $("#n-livraison").text(f.aMettreEnLivraison.length);
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $("#vue-attendus").toggleClass("cx-hidden", onglet !== "attendus");
        $("#vue-liste").toggleClass("cx-hidden", onglet === "attendus");
        if (onglet === "attendus") { rendreAttendus(); rendrePointage(); return; }
        $("#liste-aide").html("<i class='fa fa-info-circle'></i><div>" + AIDES[onglet] + "</div>");
        dt.clearSelection();
        dt.setRows(listeOnglet());
    }
    function charger() {
        return O.charger().done(function (exps, b) {
            tous = exps; bords = b; f = O.files(exps, bords);
            dt.o.columns = L.colonnes(COLS, bords, menuLigne);
            L.remplirFiltres(tous);
            if (pt) {
                var nb = $.grep(bords, function (x) { return x.id === pt.b.id; })[0];
                if (nb && (nb.statut === "PARTI" || nb.statut === "ARRIVE")) pt.b = nb; else { pt = null; $("#pointage").addClass("cx-hidden"); }
            }
            rendre();
        });
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); if (window.history.replaceState) window.history.replaceState(null, "", onglet === "attendus" ? window.location.pathname : "#" + onglet); rendre(); });
    $("#f-ville, #f-bureau, #f-du, #f-au, #f-par").on("change", function () { setTimeout(rendre, 0); });
    $("#attendus").on("click", "[data-pointer]", function () {
        var id = $(this).closest("[data-b]").data("b"), b = $.grep(bords, function (x) { return x.id === id; })[0];
        if (b) ouvrirPointage(b);
    });
    $("#btn-pt-fermer").on("click", function () { pt = null; $("#pointage").addClass("cx-hidden"); rendreAttendus(); });
    $("#pt-table").on("change", "[data-recu]", function () {
        var id = $(this).closest("tr").data("id");
        if (this.checked) pt.recus[id] = true; else delete pt.recus[id];
        rendrePointage();
    });
    $("#pt-table").on("click", "[data-retirer-trop]", function () {
        var id = $(this).closest("tr").data("id");
        pt.trop = $.grep(pt.trop, function (x) { return String(x) !== String(id); });
        rendrePointage();
    });
    $("#pt-table").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    $("#btn-pt-tout").on("click", function () { $.each(pt.b.expeditionIds, function (_, id) { pt.recus[id] = true; }); rendrePointage(); });
    $("#btn-pt-rien").on("click", function () { pt.recus = {}; rendrePointage(); });
    O.scanner("#pt-scan", function (code) { if (pt) scanPointage(code); });
    $("#btn-pt-save").on("click", function () {
        var $b = $(this); U.busy($b, true);
        enregistrerPointage(false).done(function () { U.toast("Pointage enregistré (bordereau « pointage en cours »).", "info"); charger(); }).always(function () { U.busy($b, false); });
    });
    $("#btn-pt-valider").on("click", function () {
        var n = $.grep(pt.b.expeditionIds, function (id) { return pt.recus[id]; }).length, manq = pt.b.expeditionIds.length - n;
        if (!n && !pt.trop.length) { U.toast("Aucune expédition pointée.", "warning"); return; }
        U.confirm({
            title: "Valider la réception", okText: "Valider", okClass: "cx-btn-success",
            message: "<p><b>" + O.pl(n, "expédition reçue", "expéditions reçues") + "</b> sur " + pt.b.expeditionIds.length + " pour le bordereau <b>" + U.esc(pt.b.numero) + "</b>.</p>" +
                (manq ? "<div class='cx-note cx-note-err'><i class='fa fa-warning'></i><div>" + O.pl(manq, "expédition manquante sera consignée", "expéditions manquantes seront consignées") + " en écart sur le bordereau.</div></div>" : "") +
                (pt.trop.length ? "<div class='cx-note cx-note-warn'><i class='fa fa-plus-circle'></i><div>" + O.pl(pt.trop.length, "expédition en trop", "expéditions en trop") + " (réceptionnée" + (pt.trop.length > 1 ? "s" : "") + " et consignée" + (pt.trop.length > 1 ? "s" : "") + ").</div></div>" : "") +
                "<p class='cx-muted' style='margin:0'>Le bordereau sera clôturé.</p>"
        }).done(function () {
            var $b = $("#btn-pt-valider"); U.busy($b, true);
            enregistrerPointage(true).done(function (r) {
                U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> réceptionné : " + O.pl(r.ok.length, "expédition arrivée", "expéditions arrivées") +
                    (r.manquants ? ", " + r.manquants + " manquante(s)" : "") + (r.trop ? ", " + r.trop + " en trop" : "") + ".", r.manquants ? "warning" : "success");
                pt = null; $("#pointage").addClass("cx-hidden");
                charger();
            }).fail(function (m) { U.toast(U.esc(m || "Réception impossible."), "error"); }).always(function () { U.busy($b, false); });
        });
    });

    /* Actions des listes (barre de sélection) */
    $("#dt-liste").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    $("#dt-liste").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var e = parId($(this).closest("tr").data("id")), act = $(this).data("act");
        if (!e) return;
        if (act === "fiche") O.fiche(e.id, { onChange: charger });
        if (act === "notes") O.modaleNote(e).done(function () { U.toast("Note ajoutée.", "success"); charger(); });
        if (act === "livraison") O.modaleLivraison(e).done(function () { U.toast("Livraison modifiée.", "success"); charger(); });
        if (act === "recu") L.imprimerRecu(e);
    });
    $("#selbar").on("click", "[data-act]", function () {
        var act = $(this).data("act"), s = dt.getSelected();
        if (!s.length) return;
        if (act === "reorienter") O.modaleReorienter(s).done(function (r) { U.toast(O.pl(r.ok.length, "RT réorientée", "RT réorientées") + ".", "success"); charger(); });
        if (act === "livre") O.modaleRemise(s[0]).done(function (e) { U.toast("RT <b>" + U.esc(e.nRt) + "</b> livrée en agence.", "success"); charger(); });
        if (act === "transit") O.modaleTransit(s).done(function (r) { U.toast(O.pl(r.ok.length, "expédition mise en transit", "expéditions mises en transit") + " (bordereau <b>" + U.esc(r.bordereau.numero) + "</b>).", "success"); if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning"); charger(); });
        if (act === "coursier") O.modaleCoursier(s).done(function (r) { U.toast("Fiche de livraison <b>" + U.esc(r.tournee.numero) + "</b> : " + O.pl(r.ok.length, "expédition remise", "expéditions remises") + " à " + U.esc(r.tournee.livreurNom) + ".", "success"); if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning"); charger(); });
        if (act === "mettre") {
            var ids = $.map($.grep(s, function (e) { return (e.etape === "ARRIVEE" || e.etape === "ECHEC") && O.estMoi(e.agDestId); }), function (e) { return e.id; });
            if (!ids.length) { U.toast("Seules les expéditions arrivées à destination de l'agence peuvent être mises en agence.", "warning"); return; }
            O.mettreEnAgence(ids).done(function (ok, ko) {
                U.toast(O.pl(ok.length, "expédition mise en agence", "expéditions mises en agence") + ". Pensez à l'avis d'arrivée (Livraison de colis).", "success");
                if (ko.length) U.toast(U.esc(ko.join(" · ")), "warning");
                charger();
            });
        }
    });

    /* Recherche par N° RT ou n° de bordereau (BE ou manuel) */
    function rechercher() {
        var q = $.trim($("#q-lt").val()).toUpperCase();
        if (!q) return;
        var b = $.grep(bords, function (x) { return x.numero.toUpperCase() === q || String(x.numeroManuel || "").toUpperCase() === q; })[0];
        if (b) {
            if ((b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId)) { onglet = "attendus"; rendre(); ouvrirPointage(b); }
            else window.location.href = "bordereau.html?id=" + b.id;
            return;
        }
        var e = O.chercherLt(q);
        if (e) { O.fiche(e.id, { onChange: charger }); return; }
        U.toast("Aucune RT ni aucun bordereau « " + U.esc(q) + " ».", "warning");
    }
    $("#btn-q-lt").on("click", rechercher);
    $("#q-lt").on("keydown", function (ev) { if (ev.which === 13) { ev.preventDefault(); rechercher(); } });

    /* Démarrage */
    var h = (window.location.hash || "").replace("#", "");
    if (h === "agence" || h === "transit" || h === "livraison") onglet = h;
    charger().done(function () {
        var bid = U.queryParam("bordereau");
        if (bid) {
            var b = $.grep(f.bordereauxAttendus, function (x) { return String(x.id) === String(bid); })[0];
            if (b) ouvrirPointage(b);
            else U.toast("Ce bordereau n'est pas attendu à " + U.esc(O.agenceLib(A.id)) + " (changez d'agence ou vérifiez son statut).", "warning");
        }
    });
});

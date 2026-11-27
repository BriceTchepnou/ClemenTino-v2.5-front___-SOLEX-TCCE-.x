/* =====================================================================
   Opérations · Tableau de bord (operations/index.html)
   ---------------------------------------------------------------------
   Agence de l'utilisateur (sélecteur d'agence) : colis par étape, retards
   (SLA), bordereaux du jour, flux du jour, raccourcis, taux de livraison
   dans les délais.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante(), today = U.today();

    O.selecteurAgence("#ox-agence-slot");
    $("#l-agence").text(O.agenceLib(A.id));

    var dtRetards = new CX.DataTable("#dt-retards", {
        pageSize: 10, pageSizes: [10, 25, 50], sortKey: "retard", sortDir: -1,
        emptyText: "Aucun colis en retard", emptyIcon: "fa-smile-o",
        columns: [
            { key: "nRt", title: "N° RT", render: function (e) { return "<a href='#' class='cx-mono cx-strong' data-fiche='" + e.id + "'>" + U.esc(e.nRt) + "</a>"; } },
            { key: "trajet", title: "Trajet", sortValue: function (e) { return e.villeDep + e.villeDest; }, render: function (e) {
                return "<span class='cx-nowrap'>" + U.esc(G.villeNom(e.villeDep)) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(O.destinationLib(e)) + "</span>";
            } },
            { key: "dateExp", title: "Exp.", render: function (e) { return "<span class='cx-nowrap'>" + U.toFr(e.dateExp) + "</span>"; } },
            { key: "etape", title: "Étape", render: function (e) { return O.etapeBadge(e.etape); } },
            { key: "retard", title: "Retard", className: "num", sortValue: function (e) { return e.sla.joursRetard; }, render: function (e) {
                return "<span class='cx-badge cx-badge-red cx-no-dot'>+" + e.sla.joursRetard + " j</span><div class='cx-cell-sub'>cible " + e.sla.cible + " j</div>";
            } }
        ]
    });
    $("#dt-retards").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).data("fiche"), { onChange: charger }); });

    function pipe(href, icon, n, label, alerte) {
        return "<a class='ox-pipe" + (alerte && n ? " alerte" : "") + "' href='" + href + "'><i class='fa " + icon + "'></i><b>" + n + "</b><span>" + label + "</span></a>";
    }
    function carteBordereau(b, sens) {
        return "<div class='ox-bcard'><div class='ox-bcard-top'><a class='ox-bcard-num' href='bordereau.html?id=" + b.id + "'>" + U.esc(b.numero) + "</a>" + O.badge(O.STATUT_BORDEREAU, b.statut) + "</div>" +
            "<div class='ox-bcard-route'>" + (sens === "dep" ? "<i class='fa fa-arrow-up cx-muted'></i> vers " + U.esc(O.agenceLib(b.agenceDestId)) : "<i class='fa fa-arrow-down cx-muted'></i> de " + U.esc(O.agenceLib(b.agenceDepId))) + "</div>" +
            "<div class='ox-bcard-meta'><span><i class='fa fa-cube'></i> " + O.pl(b.expeditionIds.length, "colis", "colis") + "</span><span><i class='fa fa-truck'></i> " + U.esc(b.vehicule.immatriculation || "—") + "</span>" +
            "<span><i class='fa fa-calendar'></i> " + U.toFr(b.date) + "</span></div>" +
            "<div class='ox-bcard-actions'>" + (sens === "dep" ? "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='groupage.html'>Envoi : faire partir</a>" : "<a class='cx-btn cx-btn-primary cx-btn-xs' href='degroupage.html?bordereau=" + b.id + "'><i class='fa fa-check-square-o'></i> Réceptionner</a>") + "</div></div>";
    }

    function charger() {
        O.charger().done(function (exps, bords) {
            var f = O.files(exps, bords);
            var nAttendus = 0; $.each(f.bordereauxAttendus, function (_, b) { nAttendus += b.expeditionIds.length; });
            $("#pipeline").html([
                pipe("groupage.html", "fa-cubes", f.aGrouper.length + f.locaux.length, "À envoyer"),
                pipe("degroupage.html", "fa-truck", f.enTransitVersNous.length, "En transit vers nous"),
                pipe("degroupage.html", "fa-sign-in", nAttendus, "À réceptionner (" + O.pl(f.bordereauxAttendus.length, "bordereau", "bordereaux") + ")"),
                pipe("degroupage.html#agence", "fa-inbox", f.aMettreEnAgence.length, "À mettre en agence"),
                pipe("degroupage.html#transit", "fa-random", f.transitIci.length, "À mettre en transit"),
                pipe("instance.html", "fa-building-o", f.enInstance.length, "En agence"),
                pipe("instance.html?anciennete=3", "fa-hourglass-half", f.instanceAncien.length, "En agence > " + O.INSTANCE_ALERTE_J + " j", true),
                pipe("instance.html#coursier", "fa-map-marker", f.aLivrer.length, "À mettre en livraison"),
                pipe("instance.html#livreur", "fa-motorcycle", f.enLivraison.length, "Chez le livreur"),
                pipe("livraisons.html", "fa-exclamation-triangle", f.echecs.length, "Échecs", true),
                pipe("international.html#groupage", "fa-globe", f.international.length + f.importsAttendus.length, "International")
            ].join(""));

            /* Retards : colis au départ ou à destination de l'agence */
            var retards = $.grep(exps, function (e) { return e.sla.retard && (O.estMoi(e.agDepId) || O.estMoi(e.agDestId) || O.estMoi(e.positionId)); });
            dtRetards.setRows(retards);
            $("#n-retards").text("· " + retards.length);

            /* KPI du jour */
            var departs = $.grep(bords, function (b) { return O.estMoi(b.agenceDepId) && (b.statut === "PREPARE" || (b.dateDepart && b.dateDepart.substr(0, 10) === today)); });
            var arrivees = $.grep(bords, function (b) { return O.estMoi(b.agenceDestId) && (b.statut === "PARTI" || b.statut === "ARRIVE" || (b.dateArrivee && b.dateArrivee.substr(0, 10) === today)); });
            var incidents = 0; $.each(exps, function (_, e) { $.each(e.incidents || [], function (_, i) { if (i.statut === "OUVERT" && O.estMoi(i.agenceId)) incidents++; }); });
            var sansAvis = $.grep(f.enInstance, function (e) { return !(e.avis && e.avis.length); }).length;
            $("#kpis").html([
                O.kpi("Saisies du jour (départ)", $.grep(exps, function (e) { return e.dateExp === today && O.estMoi(e.agDepId) && e.etape !== "ANNULEE"; }).length, "colis enregistrés au guichet de l'agence", "fa-pencil-square-o", "", "../guichet/expeditions-liste.html?periode=jour"),
                O.kpi("En retard", retards.length, "délai cible dépassé", "fa-clock-o", retards.length ? "red" : "green", "lettres-voiture.html?retard=1"),
                O.kpi("Sans avis d'arrivée", sansAvis, "colis en instance non notifiés", "fa-bell-o", sansAvis ? "orange" : "green", "instance.html?avis=0"),
                O.kpi("Incidents ouverts", incidents, "avaries, pertes déclarées par l'agence", "fa-warning", incidents ? "red" : "", "lettres-voiture.html?incident=1")
            ].join(""));

            $("#bordereaux").html(departs.length + arrivees.length ? $.map(departs, function (b) { return carteBordereau(b, "dep"); }).join("") + $.map(arrivees, function (b) { return carteBordereau(b, "arr"); }).join("")
                : "<div class='cx-empty'><i class='fa fa-truck'></i><b>Aucun bordereau aujourd'hui</b>Constituez un bordereau depuis l'écran Groupage.</div>");

            /* Flux du jour : évènements du suivi enregistrés par l'agence aujourd'hui */
            var flux = { ENREGISTREE: 0, GROUPEE: 0, EN_TRANSIT: 0, ARRIVEE: 0, LIVREE: 0, ECHEC: 0 };
            $.each(exps, function (_, e) {
                $.each(e.suivi, function (_, s) {
                    if (s.date.substr(0, 10) === today && s.lieu === A.ville && s.agence === A.nom && flux.hasOwnProperty(s.etape)) flux[s.etape]++;
                });
            });
            $("#flux-sub").text(U.toFrLong(today) + " · " + O.agenceLib(A.id));
            $("#flux").html($.map([["ENREGISTREE", "Enregistrés"], ["GROUPEE", "Groupés"], ["EN_TRANSIT", "Partis"], ["ARRIVEE", "Arrivés"], ["LIVREE", "Remis / livrés"], ["ECHEC", "Échecs"]], function (x) {
                return "<div><b>" + flux[x[0]] + "</b><span>" + x[1] + "</span></div>";
            }).join(""));

            /* SLA : livrés par l'agence (destination) sur 30 jours */
            var depuis = U.addDays(today, -30), parType = {};
            $.each(exps, function (_, e) {
                if (e.etape !== "LIVREE" || !e.dateLivraison || e.dateLivraison < depuis || !O.estMoi(e.agDestId)) return;
                var t = parType[e.sla.type] = parType[e.sla.type] || { n: 0, ok: 0 };
                t.n++; if (!e.sla.horsDelai) t.ok++;
            });
            var LIB = { URBAIN: "Urbain", NATIONAL: "National", AUTRE: "Régional / international" };
            $("#sla").html($.map(["URBAIN", "NATIONAL", "AUTRE"], function (k) {
                var t = parType[k] || { n: 0, ok: 0 }, pct = t.n ? Math.round(t.ok * 100 / t.n) : null;
                return "<div style='margin-bottom:12px'><div class='ox-flex'><b>" + LIB[k] + "</b><span class='cx-muted'>cible " + O.pl(O.SLA[k], "jour") + "</span>" +
                    "<span class='ox-grow'></span><b>" + (pct == null ? "—" : pct + " %") + "</b></div>" +
                    "<div class='cx-bar " + (pct == null ? "" : pct >= 90 ? "green" : pct >= 75 ? "orange" : "red") + "'><i style='width:" + (pct || 0) + "%'></i></div>" +
                    "<small class='cx-muted'>" + O.pl(t.n, "colis livré", "colis livrés") + "</small></div>";
            }).join(""));
        });
    }

    $("#btn-refresh").on("click", function () { charger(); U.toast("Tableau de bord actualisé.", "info"); });
    $("#btn-reset-demo").on("click", function (ev) {
        ev.preventDefault();
        U.confirm({ title: "Réinitialiser les données", message: "Toutes les données de démonstration du navigateur (clients, expéditions, bordereaux, tournées…) sont régénérées.", okText: "Réinitialiser", okClass: "cx-btn-danger" })
            .done(function () { CX.api.reset(); window.location.reload(); });
    });
    charger();
});

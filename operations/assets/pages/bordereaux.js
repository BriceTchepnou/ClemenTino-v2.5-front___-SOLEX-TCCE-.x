/* =====================================================================
   Opérations · Liste des bordereaux (operations/bordereaux.html)
   ---------------------------------------------------------------------
   Départs / arrivées de l'agence (ou tout le réseau), filtres période,
   onglets par statut, actions selon le statut (manifeste, faire partir,
   réceptionner).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, today = U.today();
    var bords = [], exps = {}, onglet = "";

    O.selecteurAgence("#ox-agence-slot");
    $("#f-du").val(U.addDays(today, -14)); $("#f-au").val(today);
    if (U.queryParam("sens")) $("#f-sens").val(U.queryParam("sens"));

    function poids(b) { var p = 0; $.each(b.expeditionIds, function (_, id) { p += Number((exps[id] || {}).poids) || 0; }); return p; }
    function actions(b) {
        var h = "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='bordereau.html?id=" + b.id + "'><i class='fa fa-file-text-o'></i> Manifeste</a> ";
        if (b.statut === "PREPARE" && O.estMoi(b.agenceDepId)) h += "<button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-partir><i class='fa fa-road'></i> Faire partir</button>";
        if ((b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId)) h += "<a class='cx-btn cx-btn-primary cx-btn-xs' href='degroupage.html?bordereau=" + b.id + "'><i class='fa fa-check-square-o'></i> Réceptionner</a>";
        return "<span class='cx-nowrap'>" + h + "</span>";
    }
    var dt = new CX.DataTable("#dt-bordereaux", {
        pageSize: 25, sortKey: "numero", sortDir: -1, searchInput: "#q",
        emptyText: "Aucun bordereau", emptyIcon: "fa-truck",
        columns: [
            { key: "numero", title: "N° bordereau", render: function (b) { return "<a class='cx-mono cx-strong' href='bordereau.html?id=" + b.id + "'>" + U.esc(b.numero) + "</a>"; },
                searchValue: function (b) { return b.numero + " " + (b.scelle || ""); } },
            { key: "date", title: "Date", render: function (b) { return "<span class='cx-nowrap'>" + U.toFr(b.date) + "</span><div class='cx-cell-sub'>" + (b.dateDepart ? "parti " + U.esc(U.toFr(b.dateDepart)) : "départ prévu " + U.esc(b.heure || "")) + "</div>"; } },
            { key: "trajet", title: "Trajet", sortValue: function (b) { return O.agenceLib(b.agenceDepId) + O.agenceLib(b.agenceDestId); }, render: function (b) {
                return "<span class='cx-nowrap'>" + U.esc(O.agenceLib(b.agenceDepId)) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(O.agenceLib(b.agenceDestId)) + "</span>";
            }, searchValue: function (b) { return b.villeDep + " " + b.agenceDep + " " + b.villeDest + " " + b.agenceDest; } },
            { key: "vehicule", title: "Véhicule / chauffeur", sortValue: function (b) { return (b.vehicule || {}).immatriculation; }, render: function (b) {
                return U.esc((b.vehicule || {}).immatriculation || "—") + "<div class='cx-cell-sub'>" + U.esc((b.chauffeur || {}).nom || "") + "</div>";
            }, searchValue: function (b) { return ((b.vehicule || {}).immatriculation || "") + " " + ((b.chauffeur || {}).nom || ""); } },
            { key: "nb", title: "Colis", className: "num", sortValue: function (b) { return b.expeditionIds.length; }, render: function (b) {
                return b.expeditionIds.length + "<div class='cx-cell-sub cx-nowrap'>" + U.esc(G.kg(poids(b))) + "</div>";
            } },
            { key: "statut", title: "Statut", render: function (b) {
                return O.badge(O.STATUT_BORDEREAU, b.statut) + ((b.ecarts || []).length ? "<div class='cx-cell-sub' style='color:var(--cx-red)'><i class='fa fa-warning'></i> " + O.pl(b.ecarts.length, "écart") + "</div>" : "");
            } },
            { key: "act", title: "", sortable: false, render: actions, searchValue: function () { return ""; } }
        ]
    });

    function filtrer() {
        var sens = $("#f-sens").val(), du = $("#f-du").val(), au = $("#f-au").val();
        var base = $.grep(bords, function (b) {
            if (sens === "DEP" && !O.estMoi(b.agenceDepId)) return false;
            if (sens === "ARR" && !O.estMoi(b.agenceDestId)) return false;
            if (!sens && !O.estMoi(b.agenceDepId) && !O.estMoi(b.agenceDestId)) return false;
            if (du && b.date < du && b.statut === "CLOTURE") return false;   // les bordereaux non clôturés restent visibles
            if (au && b.date > au) return false;
            return true;
        });
        $("#n-tout").text(base.length);
        $.each(O.STATUT_BORDEREAU, function (k) { $("#n-" + k).text($.grep(base, function (b) { return b.statut === k; }).length); });
        dt.setRows(onglet ? $.grep(base, function (b) { return b.statut === onglet; }) : base);
        $("#l-count").text(O.pl(dt.getFiltered().length, "bordereau", "bordereaux"));
        var prep = $.grep(bords, function (b) { return b.statut === "PREPARE" && O.estMoi(b.agenceDepId); }).length;
        var att = $.grep(bords, function (b) { return (b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId); });
        var ec = $.grep(base, function (b) { return (b.ecarts || []).length; }).length;
        $("#kpis").html([
            O.kpi("En préparation", prep, "au départ de l'agence", "fa-cubes", "purple", "groupage.html"),
            O.kpi("Attendus", att.length, "bordereaux en route vers l'agence", "fa-truck", "blue", "degroupage.html"),
            O.kpi("Avec écarts", ec, "colis manquants ou en trop sur la période", "fa-warning", ec ? "red" : "green")
        ].join(""));
    }
    function charger() {
        // TODO API : GET /exploitation/bordereaux?agence={id}&sens=&du=&au=&statut=
        $.when(CX.api.list("bordereaux"), CX.api.list("expeditions")).done(function (b, e) {
            bords = b; exps = {};
            $.each(e, function (_, x) { exps[x.id] = x; });
            filtrer();
        });
    }
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab") || ""; $("#onglets a").removeClass("active"); $(this).addClass("active"); filtrer(); });
    $("#f-sens, #f-du, #f-au").on("change", filtrer);
    $("#dt-bordereaux").on("click", "[data-partir]", function () {
        var id = $(this).closest("tr").data("id"), b = $.grep(bords, function (x) { return String(x.id) === String(id); })[0];
        O.modaleDepart(b).done(function (r) { U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> parti.", "success"); charger(); });
    });
    charger();
});

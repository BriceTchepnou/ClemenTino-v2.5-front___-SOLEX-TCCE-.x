/* =====================================================================
   Opérations · International (operations/international.html[#groupage|#degroupage])
   ---------------------------------------------------------------------
   - Expéditions internationales (défaut) : export et import de l'agence,
     suivi par AWB / partenaire / statut, confirmation de livraison.
   - Groupage international : expéditions régionales / internationales
     enregistrées dans l'agence, à transmettre au partenaire (DHL, TNT,
     Aramex…) avec n° AWB, date de remise, bordereau partenaire.
   - Dégroupage international : colis reçus de l'étranger (import) ->
     réception puis mise en agence ou en livraison (coursier).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, A = O.agenceCourante(), today = U.today();
    var tous = [], f = null, onglet = "expeditions";
    var TITRES = { expeditions: "Expéditions internationales", groupage: "Groupage international", degroupage: "Dégroupage international" };
    var AIDES = {
        expeditions: "Envois vers l'étranger et colis reçus de l'étranger concernant l'agence. Suivi par n° AWB du partenaire.",
        groupage: "Expéditions régionales et internationales enregistrées dans l'agence : sélectionnez-les puis « Transmettre au partenaire » (n° AWB, date de remise, bordereau partenaire).",
        degroupage: "Colis reçus de l'étranger pour l'agence : « Réceptionner » à l'arrivée du partenaire, puis « Mettre en agence » (retrait) ou « Mettre en livraison » (coursier)."
    };

    O.selecteurAgence("#ox-agence-slot");
    $("#f-partenaire").html("<option value=''>Tous</option>" + $.map(O.PARTENAIRES, function (p) { return "<option>" + U.esc(p) + "</option>"; }).join(""));
    $("#f-du").val(U.addDays(today, -60)); $("#f-au").val(today);

    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    var colSens = { key: "sens", title: "Sens", sortValue: function (e) { return O.importe(e) ? 1 : 0; }, render: function (e) {
        return O.importe(e) ? "<span class='cx-badge cx-badge-purple cx-no-dot'><i class='fa fa-arrow-down'></i> Import</span>" : "<span class='cx-badge cx-badge-blue cx-no-dot'><i class='fa fa-arrow-up'></i> Export</span>";
    }, searchValue: function (e) { return (e.paysDest || "") + " " + (e.paysDep || "") + " " + (e.villeEtranger || "") + " " + (e.villeOrigine || ""); } };
    var dt = new CX.DataTable("#dt-inter", {
        pageSize: 25, sortKey: "dateExp", sortDir: -1, selectable: true, searchInput: "#q",
        emptyText: "Aucune expédition internationale", emptyIcon: "fa-globe",
        columns: [colSens].concat(L.colonnes(["rt", "ref", "bureauDep", "bureauDest", "contenu", "parties", "awb", "dateExp", "statut"], [])),
        onSelect: function (rows) {
            $("#selbar").toggleClass("cx-hidden", !rows.length);
            $("#sel-n").text(O.pl(rows.length, "expédition sélectionnée", "expéditions sélectionnées"));
            $("#selbar [data-tabs]").each(function () { $(this).toggleClass("cx-hidden", $(this).data("tabs") !== onglet); });
        }
    });

    function listes() {
        var exp = $.grep(tous, function (e) {
            var inter = O.international(e) || O.importe(e);
            return inter && (O.estMoi(e.agDepId) || O.estMoi(e.agDestId) || O.estMoi(e.positionId));
        });
        var deg = $.grep(tous, function (e) { return O.importe(e) && O.estMoi(e.agDestId) && (e.etape === "EN_TRANSIT" || (e.etape === "ARRIVEE" && O.estMoi(e.positionId)) || e.etape === "ECHEC"); });
        return { expeditions: exp, groupage: f.international, degroupage: deg };
    }
    function appliquer() {
        var l = listes(), pa = $("#f-partenaire").val(), du = $("#f-du").val(), au = $("#f-au").val();
        function ok(e) {
            if (pa && (!e.partenaire || e.partenaire.nom !== pa)) return false;
            if (du && e.dateExp < du) return false;
            if (au && e.dateExp > au) return false;
            return true;
        }
        $.each(l, function (k, v) { $("#n-" + k).text($.grep(v, ok).length); });
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $("#l-titre").text(TITRES[onglet]);
        $("#aide").html("<i class='fa fa-info-circle'></i><div>" + AIDES[onglet] + "</div>");
        dt.clearSelection();
        dt.setRows($.grep(l[onglet], ok));
        var x = l.expeditions;
        $("#kpis").html([
            O.kpi("À transmettre", f.international.length, "au partenaire (groupage)", "fa-arrow-up", "orange"),
            O.kpi("Chez le partenaire", $.grep(x, function (e) { return e.etape === "EN_TRANSIT" && e.partenaire && !O.importe(e); }).length, "export en cours", "fa-plane", "blue"),
            O.kpi("Imports attendus", $.grep(l.degroupage, function (e) { return e.etape === "EN_TRANSIT"; }).length, "à réceptionner", "fa-arrow-down", "purple"),
            O.kpi("Livrées", $.grep(x, function (e) { return e.etape === "LIVREE"; }).length, "sur la période", "fa-check-circle", "green")
        ].join(""));
    }
    function charger() {
        // TODO API : GET /exploitation/international?agence={id}&partenaire=&du=&au=
        return O.charger().done(function (exps, bords) { tous = exps; f = O.files(exps, bords); appliquer(); });
    }

    $("#selbar").on("click", "[data-act]", function () {
        var act = $(this).data("act"), s = dt.getSelected();
        if (!s.length) return;
        if (act === "partenaire") O.modalePartenaire(s).done(function (ok) { U.toast(O.pl(ok.length, "expédition transmise", "expéditions transmises") + " au partenaire.", "success"); charger(); });
        if (act === "recevoir") {
            var ids = $.map($.grep(s, function (e) { return e.etape === "EN_TRANSIT"; }), function (e) { return e.id; });
            if (!ids.length) { U.toast("Sélectionnez des imports encore chez le partenaire.", "warning"); return; }
            // TODO API : POST /exploitation/international/reception  { ids[] }
            O.avancerLot(ids, "ARRIVEE", function (x) { return { note: "Reçu de " + (x.partenaire ? x.partenaire.nom + " (AWB " + x.partenaire.awb + ")" : "l'étranger"), position: A.id }; })
                .done(function (ok) { U.toast(O.pl(ok.length, "import réceptionné", "imports réceptionnés") + " : mettez-les en agence ou en livraison.", "success"); charger(); });
        }
        if (act === "agence") {
            var ia = $.map($.grep(s, function (e) { return e.etape === "ARRIVEE" || e.etape === "ECHEC"; }), function (e) { return e.id; });
            if (!ia.length) { U.toast("Réceptionnez d'abord les imports.", "warning"); return; }
            O.mettreEnAgence(ia).done(function (ok) { U.toast(O.pl(ok.length, "import mis en agence", "imports mis en agence") + ".", "success"); charger(); });
        }
        if (act === "coursier") O.modaleCoursier(s).done(function (r) { U.toast("Fiche de livraison <b>" + U.esc(r.tournee.numero) + "</b> créée.", "success"); charger(); });
        if (act === "livree") {
            var l = $.grep(s, function (e) { return e.etape === "EN_TRANSIT" && e.partenaire && !O.importe(e); });
            if (!l.length) { U.toast("Sélectionnez des exports remis à un partenaire.", "warning"); return; }
            U.confirm({ title: "Livraison confirmée par le partenaire", message: O.pl(l.length, "expédition sera passée", "expéditions seront passées") + " « Livrée » (preuve du partenaire reçue).", okText: "Confirmer", okClass: "cx-btn-success" }).done(function () {
                // TODO API : POST /exploitation/expeditions/livraison-partenaire  { ids[] }  (ou webhook de suivi du partenaire)
                O.avancerLot($.map(l, function (e) { return e.id; }), "LIVREE", function (x) { return { note: "Livraison confirmée par " + x.partenaire.nom + " (AWB " + x.partenaire.awb + ")", preuve: true }; })
                    .done(function (ok) { U.toast(O.pl(ok.length, "expédition livrée", "expéditions livrées") + ".", "success"); charger(); });
            });
        }
    });
    $("#dt-inter").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    function lireHash() { var h = (window.location.hash || "").replace("#", ""); onglet = TITRES[h] ? h : "expeditions"; }
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); if (window.history.replaceState) window.history.replaceState(null, "", onglet === "expeditions" ? window.location.pathname : "#" + onglet); appliquer(); });
    $(window).on("hashchange", function () { lireHash(); appliquer(); });
    $("#f-partenaire, #f-du, #f-au").on("change", appliquer);
    lireHash();
    charger();
});

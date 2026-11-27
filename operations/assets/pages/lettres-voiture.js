/* =====================================================================
   Opérations · Gestion des lettres de voiture (operations/lettres-voiture.html)
   Paramètres : ?q=  ?etape=  ?retard=1  ?incident=1  ?id= (ouvre la fiche)
   ---------------------------------------------------------------------
   Toutes les LT : recherche multicritère (n° LT, n° manuel, téléphone,
   nom, bordereau), filtres étape / agence / période / retard / incident,
   fiche détaillée en modale (CX.ops.fiche : réorienter, corriger le
   destinataire, note, incident, reçu), réorientation en lot, export CSV.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, today = U.today();
    var tous = [];

    O.selecteurAgence("#ox-agence-slot");
    $("#f-etape").html("<option value=''>Toutes</option><option value='ACTIVES'>En cours (non livrées)</option>" + $.map(O.ETAPES, function (v, k) { return "<option value='" + k + "'>" + U.esc(v.label) + "</option>"; }).join(""));
    function defauts() {
        $("#f-du").val(U.addDays(today, -30)); $("#f-au").val(today);
        $("#f-etape").val(U.queryParam("etape") || ""); $("#f-agence").val("MOI");
        $("#f-retard").prop("checked", U.queryParam("retard") === "1");
        $("#f-incident").prop("checked", U.queryParam("incident") === "1");
    }
    defauts();
    if (U.queryParam("retard") === "1" || U.queryParam("incident") === "1") $("#f-du").val("");

    function texte(e) {
        return [e.nRt, e.nRtMan, e.nRtManLibere, e.bordereau, e.expediteurInfo.nom, e.expediteurInfo.tel, G.telFmt(e.expediteurInfo.tel), e.destinataireInfo.nom,
            e.destinataireInfo.tel, G.telFmt(e.destinataireInfo.tel), e.telDestinataire, e.client ? e.client.raisonSociale + " " + e.client.code : "", e.contenu,
            e.partenaire ? e.partenaire.awb : ""].join(" ");
    }
    var dt = new CX.DataTable("#dt-lt", {
        pageSize: 25, sortKey: "dateExp", sortDir: -1, selectable: true, searchInput: "#q",
        emptyText: "Aucune lettre de transport", emptyIcon: "fa-file-o",
        rowClass: function (e) { return e.sla.retard ? "ox-retard" : e.etape === "ANNULEE" ? "cx-row-muted" : ""; },
        columns: [
            { key: "nRt", title: "N° LT", render: function (e) {
                return "<a href='#' class='cx-mono cx-strong' data-fiche>" + U.esc(e.nRt) + "</a>" + (e.nRtMan ? "<div><span class='cx-tag cx-mono'>Man. " + U.esc(e.nRtMan) + "</span></div>" : "") +
                    (e.bordereau ? "<div class='cx-cell-sub'>" + U.esc(e.bordereau) + "</div>" : "");
            }, searchValue: texte },
            { key: "dep", title: "Départ", sortValue: function (e) { return e.villeDep + e.bureauDep; }, render: function (e) { return U.esc(G.villeNom(e.villeDep)) + "<div class='cx-cell-sub'>" + U.esc(G.titre(e.bureauDep)) + "</div>"; }, searchValue: function () { return ""; } },
            { key: "dest", title: "Destination", sortValue: function (e) { return O.destinationLib(e); }, render: function (e) {
                return U.esc(O.destinationLib(e)) + "<div class='cx-cell-sub'>" + (e.livraison.mode === "DOMICILE" ? "domicile" : "retrait") + ((e.reorientations || []).length ? " · <i class='fa fa-random' title='Réorientée'></i>" : "") + "</div>";
            }, searchValue: function () { return ""; } },
            { key: "client", title: "Client", sortValue: function (e) { return e.client ? e.client.raisonSociale : "~"; }, render: function (e) { return e.client ? U.esc(e.client.raisonSociale) : "<span class='cx-muted'>Particulier</span>"; }, searchValue: function () { return ""; } },
            { key: "contenu", title: "Contenu", render: function (e) { return U.esc(e.contenu || "") + "<div class='cx-cell-sub'>" + (e.nbColis || 1) + " colis · " + U.esc(G.kg(e.poids)) + "</div>"; }, searchValue: function () { return ""; } },
            { key: "parties", title: "Expéditeur / Destinataire", sortValue: function (e) { return e.expediteurInfo.nom; }, render: function (e) {
                return U.esc(e.expediteurInfo.nom) + "<div class='cx-cell-sub'><i class='fa fa-long-arrow-right'></i> " + U.esc(e.destinataireInfo.nom) + " · " + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div>";
            }, searchValue: function () { return ""; } },
            { key: "dateExp", title: "Date exp.", render: function (e) { return "<span class='cx-nowrap'>" + U.toFr(e.dateExp) + "</span><div class='cx-cell-sub'>" + U.esc(e.heure || "") + "</div>"; }, searchValue: function () { return ""; } },
            { key: "etape", title: "Statut", sortValue: function (e) { return (O.ETAPES[e.etape] || {}).ordre; }, render: function (e) {
                var p = e.positionId ? "<div class='cx-cell-sub'>" + U.esc(O.agenceLib(e.positionId)) + "</div>" : "";
                return O.etapeBadge(e.etape) + " " + O.slaBadge(e) + ((e.incidents || []).length ? " <i class='fa fa-warning' style='color:var(--cx-red)' title='Incident déclaré'></i>" : "") + p;
            }, searchValue: function () { return ""; } }
        ],
        onSelect: function (rows) { $("#selbar").toggleClass("cx-hidden", !rows.length); $("#sel-n").text(O.pl(rows.length, "LT sélectionnée", "LT sélectionnées")); },
        onRender: function (rows) { $("#l-count").text(O.pl(rows.length, "LT")); }
    });

    function appliquer() {
        var et = $("#f-etape").val(), ag = $("#f-agence").val(), du = $("#f-du").val(), au = $("#f-au").val();
        var ret = $("#f-retard").is(":checked"), inc = $("#f-incident").is(":checked");
        dt.setRows($.grep(tous, function (e) {
            if (et === "ACTIVES" && (e.etape === "LIVREE" || e.etape === "ANNULEE")) return false;
            if (et && et !== "ACTIVES" && e.etape !== et) return false;
            if (ag === "MOI" && !O.estMoi(e.agDepId) && !O.estMoi(e.agDestId) && !O.estMoi(e.positionId)) return false;
            if (ag === "DEP" && !O.estMoi(e.agDepId)) return false;
            if (ag === "ARR" && !O.estMoi(e.agDestId)) return false;
            if (ag === "ICI" && !O.estMoi(e.positionId)) return false;
            if (du && e.dateExp < du) return false;
            if (au && e.dateExp > au) return false;
            if (ret && !e.sla.retard) return false;
            if (inc && !(e.incidents || []).length) return false;
            return true;
        }));
    }
    function charger() {
        // TODO API : GET /exploitation/expeditions?q=&etape=&agence=&sens=&du=&au=&retard=&incident=  (pagination serveur)
        return CX.api.list("expeditions").done(function (rows) {
            tous = $.map(rows, function (e) { return O.norm(e); });
            appliquer();
        });
    }

    $("#dt-lt").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    $("#dt-lt").on("dblclick", "tbody tr[data-id]", function () { O.fiche($(this).data("id"), { onChange: charger }); });
    $("#f-etape, #f-agence, #f-du, #f-au, #f-retard, #f-incident").on("change", appliquer);
    $("#btn-reset").on("click", function () { $("#q").val(""); dt.setSearch(""); $("#f-retard, #f-incident").prop("checked", false); defauts(); $("#f-etape").val(""); appliquer(); });
    $("#btn-reo").on("click", function () {
        O.modaleReorienter(dt.getSelected()).done(function (r) { U.toast(O.pl(r.ok.length, "LT réorientée", "LT réorientées") + ".", "success"); dt.clearSelection(); charger(); });
    });
    $("#btn-sel-vider").on("click", function () { dt.clearSelection(); });
    $("#btn-export").on("click", function () {
        var rows = dt.getFiltered();
        if (!rows.length) { U.toast("Aucune ligne à exporter.", "warning"); return; }
        function cell(v) { var s = v == null ? "" : String(v); return /[";\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }
        var l = [["N° LT", "N° manuel", "Bordereau", "Date", "Départ", "Bureau départ", "Destination", "Bureau destination", "Remise", "Client", "Expéditeur", "Destinataire", "Tél. destinataire", "Contenu", "Colis", "Poids", "Étape", "Position", "Échéance SLA", "Retard (j)"].join(";")];
        $.each(rows, function (_, e) {
            l.push($.map([e.nRt, e.nRtMan, e.bordereau, U.toFr(e.dateExp), e.villeDep, e.bureauDep, e.villeDest, e.bureauDest, e.livraison.mode, e.client ? e.client.raisonSociale : "Particulier",
                e.expediteurInfo.nom, e.destinataireInfo.nom, G.telFmt(e.destinataireInfo.tel), e.contenu, e.nbColis, String(e.poids || 0).replace(".", ","), O.ETAPES[e.etape].label,
                e.positionId ? O.agenceLib(e.positionId) : "", U.toFr(e.sla.echeance), e.sla.joursRetard], function (v) { return [cell(v)]; }).join(";"));
        });
        var nom = "lettres-de-voiture-" + today.replace(/-/g, "") + ".csv";
        // TODO API (option) : GET /exploitation/expeditions/export.csv?filtres…
        var blob = new Blob(["﻿" + l.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = nom; document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        U.toast(O.pl(rows.length, "LT exportée", "LT exportées") + " (" + nom + ").", "info");
    });

    if (U.queryParam("q")) $("#q").val(U.queryParam("q"));
    charger().done(function () {
        if (U.queryParam("q")) { dt.setSearch(U.queryParam("q")); $("#f-du").val(""); appliquer(); }
        if (U.queryParam("id")) O.fiche(U.queryParam("id"), { onChange: charger });
    });
});

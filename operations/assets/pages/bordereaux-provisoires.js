/* =====================================================================
   Opérations · Bordereaux provisoires (operations/bordereaux-provisoires.html)
   ---------------------------------------------------------------------
   Génère automatiquement, pour la journée, un bordereau PROVISOIRE par
   direction (agence de destination) à partir des expéditions en attente
   d'envoi de l'agence. Aperçu et ajustement (décocher une expédition,
   moyen / n° de transport, départ prévu), puis validation : bordereau
   définitif (PREPARE, N° BE) et expéditions GROUPEES.
   Les provisoires ne sont pas enregistrés (calcul à l'affichage).
   TODO API : GET /exploitation/bordereaux/provisoires?agence={id}&jusqu={date}
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante(), today = U.today();
    var props = [], exclus = {};

    O.selecteurAgence("#ox-agence-slot");
    $("#f-jusqu").val(today);
    $("#f-moyen").html($.map(O.MOYENS_TRANSPORT, function (l, k) { return "<option value='" + k + "'>" + l + "</option>"; }).join(""));
    $("#l-sous-titre").text(O.agenceLib(A.id) + " · " + U.toFrLong(today));

    function generer() {
        return O.charger().done(function (exps, bords) {
            var f = O.files(exps, bords), j = $("#f-jusqu").val() || today, parDest = {}, cles = [];
            $.each(f.aGrouper, function (_, e) {
                if (e.suspendu || e.dateExp > j || !e.agDestId) return;
                if (!parDest[e.agDestId]) { parDest[e.agDestId] = []; cles.push(e.agDestId); }
                parDest[e.agDestId].push(e);
            });
            cles.sort(function (a, b) { return parDest[b].length - parDest[a].length; });
            props = $.map(cles, function (k) { return { dest: k, exps: parDest[k] }; });
            rendre();
        });
    }
    function rendre() {
        var moyen = $("#f-moyen").val();
        $("#provisoires").html(props.length ? $.map(props, function (p, i) {
            var n = 0, poids = 0;
            $.each(p.exps, function (_, e) { if (!exclus[e.id]) { n += e.nbColis || 1; poids += Number(e.poids) || 0; } });
            var garde = $.grep(p.exps, function (e) { return !exclus[e.id]; }).length;
            return "<section class='ox-groupe' data-p='" + i + "'><div class='ox-groupe-head'><span class='cx-badge cx-badge-purple cx-no-dot'>PROVISOIRE</span>" +
                "<h4><i class='fa fa-map-marker'></i> Direction " + U.esc(O.agenceLib(p.dest)) + "</h4><small>" + O.pl(garde, "expédition") + " · " + n + " colis · " + U.esc(G.kg(poids)) + "</small>" +
                "<div class='ox-groupe-tools'><select class='form-control input-sm' data-moyen style='width:auto'>" + $.map(O.MOYENS_TRANSPORT, function (l, k) { return "<option value='" + k + "'" + (k === moyen ? " selected" : "") + ">" + l + "</option>"; }).join("") + "</select>" +
                "<input type='text' class='form-control input-sm cx-mono' data-ntr placeholder='N° transport' style='width:120px'>" +
                "<input type='time' class='form-control input-sm' data-heure value='18:00' style='width:96px'>" +
                "<button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-valider" + (garde ? "" : " disabled") + "><i class='fa fa-check'></i> Valider</button></div></div>" +
                "<div class='cx-table-wrap'><table class='cx-table'><thead><tr><th class='cx-col-check'></th><th>N° reçu transport</th><th>N° réf.</th><th>Contenu</th><th>Expéditeur / Destinataire</th><th>Date exp.</th><th>Remise</th></tr></thead><tbody>" +
                $.map(p.exps, function (e) {
                    return "<tr data-id='" + e.id + "' class='" + (exclus[e.id] ? "cx-row-muted" : "") + "'><td class='cx-col-check'><input type='checkbox' data-garder" + (exclus[e.id] ? "" : " checked") + " aria-label='Garder'></td>" +
                        "<td class='cx-mono cx-strong'>" + U.esc(e.nRt) + (O.enTransitIci(e) ? " <span class='cx-badge cx-badge-purple cx-no-dot'>Transit</span>" : "") + "</td><td class='ox-ref'>" + U.esc(e.refLot) + "</td><td class='cx-nowrap'>" + U.esc(O.contenuCourt(e)) + "</td>" +
                        "<td>" + U.esc(e.expediteurInfo.nom) + "<div class='cx-cell-sub'><i class='fa fa-long-arrow-right'></i> " + U.esc(e.destinataireInfo.nom) + "</div></td><td class='cx-nowrap'>" + U.toFr(e.dateExp) + "</td>" +
                        "<td>" + (e.livraison.mode === "DOMICILE" ? "Livraison" : "Agence") + "</td></tr>";
                }).join("") + "</tbody></table></div></section>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-magic'></i><b>Aucune expédition en attente d'envoi</b>Les expéditions enregistrées au guichet de l'agence apparaîtront ici, regroupées par direction.</div>");
        $("#btn-valider-tous").prop("disabled", !props.length);
    }
    /* Validation d'un provisoire -> bordereau d'expédition définitif */
    function valider(i) {
        var p = props[i], $s = $("#provisoires [data-p=" + i + "]");
        var ids = $.map($.grep(p.exps, function (e) { return !exclus[e.id]; }), function (e) { return e.id; });
        if (!ids.length) return $.Deferred().resolve(null).promise();
        var ntr = $.trim($s.find("[data-ntr]").val()), h = $s.find("[data-heure]").val() || "18:00", moyen = $s.find("[data-moyen]").val();
        var b = O.nouveauBordereau({ agenceDestId: Number(p.dest), heure: h, moyen: moyen, numeroTransport: ntr, departPrevu: today + " " + h,
            vehicule: { type: "Camionnette (3,5 t)", immatriculation: moyen === "ROUTE" ? ntr : "" }, observations: "Issu du bordereau provisoire du " + U.toFr(today) });
        // TODO API : POST /exploitation/bordereaux/provisoires/valider  { agenceDestId, expeditionIds[], moyen, numeroTransport, departPrevu }
        return CX.api.save("bordereaux", b).then(function (bb) { return O.grouper(bb, ids); });
    }
    function apresValidation(res) {
        res = $.grep(res, function (r) { return r; });
        if (!res.length) return;
        U.toast(O.pl(res.length, "bordereau définitif créé", "bordereaux définitifs créés") + " : " + $.map(res, function (r) {
            return "<a href='bordereau.html?id=" + r.bordereau.id + "'>" + U.esc(r.bordereau.numero) + "</a> (" + r.ok.length + ")";
        }).join(", ") + ".", "success");
        exclus = {};
        generer();
    }

    $("#provisoires").on("change", "[data-garder]", function () {
        var id = $(this).closest("tr").data("id");
        if (this.checked) delete exclus[id]; else exclus[id] = true;
        rendre();
    });
    $("#provisoires").on("click", "[data-valider]", function () {
        var i = $(this).closest("[data-p]").data("p"), $b = $(this); U.busy($b, true);
        valider(i).done(function (r) { apresValidation([r]); });
    });
    $("#btn-valider-tous").on("click", function () {
        var n = props.length;
        U.confirm({ title: "Valider tous les bordereaux", message: O.pl(n, "bordereau provisoire sera transformé", "bordereaux provisoires seront transformés") + " en bordereau(x) d'expédition définitif(s).", okText: "Valider", okClass: "cx-btn-success" })
            .done(function () {
                var res = [], i = 0;
                (function suivant() {
                    if (i >= n) { apresValidation(res); return; }
                    valider(i++).done(function (r) { res.push(r); }).always(suivant);
                })();
            });
    });
    $("#btn-generer").on("click", function () { exclus = {}; generer(); U.toast("Bordereaux provisoires régénérés.", "info"); });
    $("#f-jusqu").on("change", generer);
    $("#f-moyen").on("change", rendre);
    $("#btn-print").on("click", function () { window.print(); });
    generer();
});

/* =====================================================================
   ClemenTino - Page "Liste des carnets de lettre de transport"
   Dépend de : jQuery, Bootstrap 3, (Select2), carnets-common.js
   ===================================================================== */
$(function () {

    var state = {
        rows: [],          // carnets renvoyés par le serveur (après filtres)
        sortKey: "numero",
        sortDir: 1,
        page: 1,
        pageSize: 25,
        search: ""
    };

    /* ------------------------------------------------------------------
       Initialisation des listes déroulantes et des dates
       ------------------------------------------------------------------ */
    $.each(CT.CLIENTS, function (_, c) { $("#f-client").append($("<option>").val(c.id).text(c.nom)); });
    $.each(CT.AGENCES, function (_, a) { $("#f-agence").append($("<option>").val(a.id).text(a.nom)); });
    $.each(CT.MOTIFS_ANOMALIE, function (_, m) { $("#mp-motif").append($("<option>").text(m)); });
    if ($.fn.select2) $("#f-client").select2({ width: "240px" });

    $("#f-du").val(CT.util.today().substr(0, 4) + "-01-01");
    $("#f-au").val(CT.util.today());

    CT.formCarnet.init();

    /* ------------------------------------------------------------------
       Chargement des données
       ------------------------------------------------------------------ */
    function charger() {
        var filtres = {
            du: $("#f-du").val(),
            au: $("#f-au").val(),
            clientId: $("#f-client").val(),
            agenceId: $("#f-agence").val(),
            statut: $("#f-statut").val()
        };
        // TODO API : $.getJSON("/carnets", filtres)
        CT.store.lister(filtres).done(function (list) {
            state.rows = $.map(list, function (c) {
                var st = CT.metier.stats(c);
                return {
                    carnet: c,
                    stats: st,
                    statut: CT.metier.statutCarnet(c),
                    client: CT.util.clientNom(c.clientId),
                    agence: CT.util.agenceNom(c.agenceId)
                };
            });
            state.page = 1;
            renderKpis();
            render();
        });
    }

    function renderKpis() {
        var t = { feuilles: 0, utilisees: 0, dispo: 0, perdues: 0, alerte: 0 };
        $.each(state.rows, function (_, r) {
            t.feuilles += r.stats.total;
            t.utilisees += r.stats.utilisees;
            t.dispo += r.stats.disponibles;
            t.perdues += r.stats.perdues + r.stats.annulees;
            /* Alerte : carnet affecté avec moins de 10 % de feuilles restantes */
            if (r.statut === "AFFECTE" && r.stats.disponibles / r.stats.total < 0.10) t.alerte++;
        });
        $("#kpi-carnets").text(CT.util.fmt(state.rows.length));
        $("#kpi-feuilles").text(CT.util.fmt(t.feuilles));
        $("#kpi-utilisees").text(CT.util.fmt(t.utilisees));
        $("#kpi-dispo").text(CT.util.fmt(t.dispo));
        $("#kpi-perdues").text(CT.util.fmt(t.perdues));
        $("#kpi-alerte").text(CT.util.fmt(t.alerte));
    }

    /* ------------------------------------------------------------------
       Tri / recherche / pagination côté client
       (À l'intégration : peut être remplacé par DataTables si déjà présent)
       ------------------------------------------------------------------ */
    function sortValue(r, key) {
        switch (key) {
            case "pct": return r.stats.pctUtilise;
            case "perdues": return r.stats.perdues + r.stats.annulees;
            case "client": return r.client;
            case "agence": return r.agence;
            case "statut": return r.statut;
            case "dernierUtilise": return r.carnet.dernierUtilise == null ? -1 : r.carnet.dernierUtilise;
            default: return r.carnet[key];
        }
    }

    function filtered() {
        var q = $.trim(state.search).toUpperCase();
        var rows = state.rows;
        if (q) {
            var asNum = /^\d+$/.test(q) ? parseInt(q, 10) : null;
            rows = $.grep(rows, function (r) {
                var c = r.carnet;
                if (asNum !== null && asNum >= c.debut && asNum <= c.fin) return true; // n° de feuille
                return (c.numero + " " + r.client + " " + r.agence + " " + c.debut + " " + c.fin + " " + (c.prefixe || ""))
                    .toUpperCase().indexOf(q) >= 0;
            });
        }
        rows = rows.slice().sort(function (a, b) {
            var va = sortValue(a, state.sortKey), vb = sortValue(b, state.sortKey);
            if (va == null) va = ""; if (vb == null) vb = "";
            return (va > vb ? 1 : va < vb ? -1 : 0) * state.sortDir;
        });
        return rows;
    }

    function render() {
        var rows = filtered(), $tb = $("#tableCarnets tbody").empty();
        var total = rows.length, pages = Math.max(1, Math.ceil(total / state.pageSize));
        if (state.page > pages) state.page = pages;
        var from = (state.page - 1) * state.pageSize, slice = rows.slice(from, from + state.pageSize);

        /* En-têtes de tri */
        $("#tableCarnets th[data-sort]").each(function () {
            var k = $(this).data("sort");
            $(this).find(".ct-sort").html(k === state.sortKey ? (state.sortDir > 0 ? "&#9650;" : "&#9660;") : "&#9670;");
        });

        if (!slice.length) {
            $tb.append('<tr class="ct-empty"><td colspan="10">Aucun carnet enregistré</td></tr>');
        }

        $.each(slice, function (_, r) {
            var c = r.carnet, s = r.stats, pre = CT.util.esc(c.prefixe || "");
            var barClass = s.pctUtilise >= 90 ? "progress-bar-warning" : "progress-bar-success";
            var tr =
                "<tr data-id='" + c.id + "'>" +
                "<td><a href='carnet-detail.html?id=" + c.id + "'><b>" + CT.util.esc(c.numero) + "</b></a></td>" +
                "<td class='ct-num'>" + pre + c.debut + "</td>" +
                "<td class='ct-num'>" + pre + c.fin + "</td>" +
                "<td class='ct-num'>" + (c.dernierUtilise != null ? pre + c.dernierUtilise : "<span class='text-muted'>—</span>") + "</td>" +
                "<td>" +
                "  <div class='progress ct-progress' title='" + s.utilisees + " utilisées / " + s.total + "'>" +
                "    <div class='progress-bar " + barClass + "' style='width:" + s.pctUtilise + "%'>" + (s.pctUtilise >= 15 ? s.pctUtilise + "%" : "") + "</div>" +
                "    <div class='progress-bar progress-bar-danger' style='width:" + s.pctPerdu + "%'></div>" +
                "  </div>" +
                "  <div class='ct-progress-legend'>" + s.utilisees + " / " + s.total + " · reste " + s.disponibles + "</div>" +
                "</td>" +
                "<td class='text-center'>" + ((s.perdues + s.annulees) ? "<span class='label label-danger'>" + (s.perdues + s.annulees) + "</span>" : "0") + "</td>" +
                "<td>" + (r.client ? CT.util.esc(r.client) : "<i class='text-muted'>Non affecté</i>") + "</td>" +
                "<td>" + CT.util.esc(r.agence) + "</td>" +
                "<td><span class='ct-badge ct-badge-" + r.statut + "'>" + CT.STATUTS_CARNET[r.statut] + "</span></td>" +
                "<td class='text-right ct-actions' style='white-space:nowrap'>" +
                "  <a class='btn btn-default' href='carnet-detail.html?id=" + c.id + "' title='Voir les feuilles'><span class='glyphicon glyphicon-th'></span></a> " +
                "  <button class='btn btn-default act-edit' title='Modifier'><span class='glyphicon glyphicon-pencil'></span></button> " +
                "  <button class='btn btn-default act-lost' title='Déclarer des feuilles perdues' " + (c.cloture ? "disabled" : "") + "><span class='glyphicon glyphicon-warning-sign text-danger'></span></button> " +
                "  <div class='btn-group'>" +
                "    <button class='btn btn-default dropdown-toggle' data-toggle='dropdown'><span class='caret'></span></button>" +
                "    <ul class='dropdown-menu dropdown-menu-right'>" +
                "      <li><a href='#' class='act-close'>" + (c.cloture ? "Réouvrir le carnet" : "Clôturer le carnet") + "</a></li>" +
                "      <li class='divider'></li>" +
                "      <li><a href='#' class='act-delete text-danger'>Supprimer</a></li>" +
                "    </ul>" +
                "  </div>" +
                "</td></tr>";
            $tb.append(tr);
        });

        /* Info + pagination */
        $("#pagerInfo").text(total
            ? "Affichage de " + (from + 1) + " à " + Math.min(from + state.pageSize, total) + " sur " + total + " carnet(s)"
            : "Aucun carnet à afficher");
        var $p = $("#pager").empty();
        $p.append("<li class='" + (state.page === 1 ? "disabled" : "") + "'><a href='#' data-page='" + (state.page - 1) + "'>Précédent</a></li>");
        for (var i = 1; i <= pages; i++) {
            $p.append("<li class='" + (i === state.page ? "active" : "") + "'><a href='#' data-page='" + i + "'>" + i + "</a></li>");
        }
        $p.append("<li class='" + (state.page === pages ? "disabled" : "") + "'><a href='#' data-page='" + (state.page + 1) + "'>Suivant</a></li>");
    }

    function rowCarnet(el) {
        var id = $(el).closest("tr").data("id");
        return $.grep(state.rows, function (r) { return r.carnet.id == id; })[0].carnet;
    }

    function confirmer(message, onOk) {
        $("#confirm-msg").html(message);
        $("#confirm-ok").off("click").on("click", function () { $("#modalConfirm").modal("hide"); onOk(); });
        $("#modalConfirm").modal("show");
    }

    /* ------------------------------------------------------------------
       Évènements
       ------------------------------------------------------------------ */
    $("#formFiltres").on("submit", charger);
    $("#btnRefresh").on("click", charger);
    $("#quickSearch").on("input", function () { state.search = $(this).val(); state.page = 1; render(); });
    $("#pageSize").on("change", function () { state.pageSize = parseInt($(this).val(), 10); state.page = 1; render(); });
    $("#pager").on("click", "a", function (e) {
        e.preventDefault();
        if ($(this).parent().hasClass("disabled")) return;
        state.page = parseInt($(this).data("page"), 10);
        render();
    });
    $("#tableCarnets thead").on("click", "th[data-sort]", function () {
        var k = $(this).data("sort");
        state.sortDir = state.sortKey === k ? -state.sortDir : 1;
        state.sortKey = k;
        render();
    });

    $("#btnNouveauCarnet").on("click", function () { CT.formCarnet.open(null, charger); });

    $("#tableCarnets").on("click", ".act-edit", function () {
        CT.formCarnet.open(rowCarnet(this), charger);
    });

    $("#tableCarnets").on("click", ".act-close", function (e) {
        e.preventDefault();
        var c = rowCarnet(this);
        confirmer(c.cloture
            ? "Réouvrir le carnet <b>" + CT.util.esc(c.numero) + "</b> ?"
            : "Clôturer le carnet <b>" + CT.util.esc(c.numero) + "</b> ?<br><small class='text-muted'>Les feuilles restantes ne pourront plus être utilisées.</small>",
            function () {
                CT.store.cloturer(c.id, !c.cloture).done(function () {
                    CT.util.toast("Carnet " + (c.cloture ? "réouvert" : "clôturé") + ".");
                    charger();
                });
            });
    });

    $("#tableCarnets").on("click", ".act-delete", function (e) {
        e.preventDefault();
        var c = rowCarnet(this);
        if (c.dernierUtilise != null) {
            CT.util.toast("Impossible de supprimer un carnet dont des feuilles ont déjà été utilisées. Clôturez-le plutôt.", "danger");
            return;
        }
        confirmer("Supprimer définitivement le carnet <b>" + CT.util.esc(c.numero) + "</b> ?", function () {
            CT.store.supprimer(c.id).done(function () { CT.util.toast("Carnet supprimé.", "warning"); charger(); });
        });
    });

    /* ----- Déclaration de feuilles perdues depuis la liste ----- */
    var lostCarnet = null;
    $("#tableCarnets").on("click", ".act-lost", function () {
        lostCarnet = rowCarnet(this);
        var pre = lostCarnet.prefixe || "";
        $("#mp-carnet").text(lostCarnet.numero);
        $("#mp-plage").text("Plage : " + pre + lostCarnet.debut + " → " + pre + lostCarnet.fin +
            (lostCarnet.clientId ? "  ·  Client : " + CT.util.clientNom(lostCarnet.clientId) : ""));
        $("#mp-numeros").val("");
        $("#mp-preview").text("");
        $("#mp-error").hide();
        $("input[name=mp-type][value=PERDUE]").prop("checked", true);
        $("#modalPerdus").modal("show");
    });
    $("#mp-numeros").on("input", function () {
        var p = CT.util.parseNumeros($(this).val());
        $("#mp-preview").text(p.numeros.length ? p.numeros.length + " feuille(s) : " + CT.util.compactNumeros(p.numeros) : "")
            .toggleClass("text-danger", p.erreurs.length > 0);
        if (p.erreurs.length) $("#mp-preview").text(p.erreurs.join(" ; "));
    });
    $("#mp-save").on("click", function () {
        var p = CT.util.parseNumeros($("#mp-numeros").val());
        if (p.erreurs.length || !p.numeros.length) {
            $("#mp-error").text(p.erreurs.length ? p.erreurs.join(" ; ") : "Saisissez au moins un numéro.").show();
            return;
        }
        var type = $("input[name=mp-type]:checked").val();
        // TODO API : $.post("/carnets/" + id + "/anomalies", {...})
        CT.store.declarerAnomalies(lostCarnet.id, p.numeros, type, $("#mp-motif").val())
            .done(function () {
                $("#modalPerdus").modal("hide");
                CT.util.toast(p.numeros.length + " feuille(s) déclarée(s) " + (type === "PERDUE" ? "perdue(s)" : "annulée(s)") + ".");
                charger();
            })
            .fail(function (msg) { $("#mp-error").text(msg).show(); });
    });

    /* ----- Retrouver une feuille ----- */
    $("#btnRechercheFeuille").on("click", function () {
        $("#rf-numero").val(""); $("#rf-result").empty();
        $("#modalRecherche").modal("show");
        setTimeout(function () { $("#rf-numero").focus(); }, 400);
    });
    function rechercherFeuille() {
        var n = parseInt($("#rf-numero").val(), 10);
        if (isNaN(n)) return;
        // TODO API : $.getJSON("/carnets/recherche-feuille", { numero: n })
        CT.store.rechercherFeuille(n).done(function (res) {
            var $r = $("#rf-result").empty();
            if (!res.length) {
                $r.html("<div class='alert alert-warning' style='border-radius:0'>Aucun carnet ne contient le numéro <b>" + n + "</b>.</div>");
                return;
            }
            $.each(res, function (_, c) {
                var st = CT.metier.statutFeuille(c, n);
                var an = $.grep(c.anomalies, function (a) { return a.numero === n; })[0];
                $r.append(
                    "<table class='table table-condensed ct-info-table'>" +
                    "<tr><td>Feuille</td><td><b class='ct-num'>" + CT.util.esc((c.prefixe || "") + n) + "</b> " +
                    "<span class='ct-sheet ct-st-" + st + "' style='display:inline-block;padding:1px 8px;cursor:default'>" + CT.STATUTS_FEUILLE[st] + "</span></td></tr>" +
                    (an ? "<tr><td>Motif</td><td>" + CT.util.esc(an.motif) + " (" + CT.util.toFr(an.date) + ", " + CT.util.esc(an.user) + ")</td></tr>" : "") +
                    "<tr><td>Carnet</td><td><a href='carnet-detail.html?id=" + c.id + "&focus=" + n + "'>" + CT.util.esc(c.numero) + "</a> (" + c.debut + " - " + c.fin + ")</td></tr>" +
                    "<tr><td>Client</td><td>" + (CT.util.esc(CT.util.clientNom(c.clientId)) || "<i>Non affecté</i>") + "</td></tr>" +
                    "<tr><td>Agence</td><td>" + CT.util.esc(CT.util.agenceNom(c.agenceId)) + "</td></tr>" +
                    "</table>");
            });
        });
    }
    $("#rf-go").on("click", rechercherFeuille);
    $("#rf-numero").on("keydown", function (e) { if (e.which === 13) rechercherFeuille(); });

    $("#btnResetDemo").on("click", function (e) {
        e.preventDefault();
        CT.store.reinitialiser().done(charger);
    });

    charger();
});

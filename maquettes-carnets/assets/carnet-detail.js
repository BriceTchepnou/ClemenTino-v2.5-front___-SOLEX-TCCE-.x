/* =====================================================================
   ClemenTino - Page "Détail d'un carnet" (carnet-detail.html?id=X)
   Dépend de : jQuery, Bootstrap 3, (Select2), carnets-common.js
   ===================================================================== */
$(function () {

    var PAGE_SIZE = 100;          // feuilles affichées par page de la grille
    var carnetId = parseInt(CT.util.queryParam("id") || "1", 10);
    var focusNum = parseInt(CT.util.queryParam("focus"), 10);
    var carnet = null;
    var grid = { page: 1, filtre: "", selection: [], lastClicked: null };

    $.each(CT.MOTIFS_ANOMALIE, function (_, m) { $("#mp-motif").append($("<option>").text(m)); });
    CT.formCarnet.init();

    /* ------------------------------------------------------------------
       Chargement
       ------------------------------------------------------------------ */
    function charger() {
        // TODO API : $.getJSON("/carnets/" + carnetId)
        CT.store.obtenir(carnetId).done(function (c) {
            carnet = c;
            renderEntete();
            renderGrille();
            renderAnomalies();
            renderHistorique();
        }).fail(function () {
            $(".ct-page").html("<div class='alert alert-danger'>Carnet introuvable. <a href='carnets-liste.html'>Retour à la liste</a></div>");
        });
    }

    function pre(n) { return (carnet.prefixe || "") + n; }

    function renderEntete() {
        var c = carnet, s = CT.metier.stats(c), statut = CT.metier.statutCarnet(c), prochain = CT.metier.prochainNumero(c);
        document.title = "Carnet " + c.numero + " - ClemenTino";
        $("#d-numero").text(c.numero);
        $("#d-statut").attr("class", "ct-badge ct-badge-" + statut).text(CT.STATUTS_CARNET[statut]);
        $("#i-numero").text(c.numero);
        $("#i-plage").text(pre(c.debut) + "  →  " + pre(c.fin));
        $("#i-client").html(c.clientId ? CT.util.esc(CT.util.clientNom(c.clientId)) : "<i class='text-muted'>Non affecté (en stock)</i>");
        $("#i-agence").text(CT.util.agenceNom(c.agenceId));
        $("#i-creation").text(CT.util.toFr(c.dateCreation));
        $("#i-affectation").text(CT.util.toFr(c.dateAffectation) || "—");
        $("#i-dernier").text(c.dernierUtilise != null ? pre(c.dernierUtilise) : "— (carnet neuf)");
        $("#i-prochain").html(prochain ? "<b>" + CT.util.esc(pre(prochain)) + "</b>" : "<span class='text-danger'>Aucune (carnet épuisé)</span>");
        $("#i-observation").text(c.observation || "—");

        $("#k-total").text(CT.util.fmt(s.total));
        $("#k-utilisees").text(CT.util.fmt(s.utilisees));
        $("#k-dispo").text(CT.util.fmt(s.disponibles));
        $("#k-perdues").text(CT.util.fmt(s.perdues + s.annulees));
        $("#k-bar-used").css("width", s.pctUtilise + "%").text(s.pctUtilise >= 8 ? s.pctUtilise + "% utilisé" : "");
        $("#k-bar-lost").css("width", s.pctPerdu + "%");

        $("#btnCloture").html(c.cloture
            ? "<span class='glyphicon glyphicon-folder-open'></span> Réouvrir le carnet"
            : "<span class='glyphicon glyphicon-lock'></span> Clôturer le carnet");
        $("#btnDernier, #btnPerdus").prop("disabled", c.cloture);

        var alerte = "";
        if (c.cloture) alerte = "Ce carnet est <b>clôturé</b> : aucune feuille ne peut plus être utilisée.";
        else if (statut === "EPUISE") alerte = "Ce carnet est <b>épuisé</b>. Pensez à remettre un nouveau carnet au client.";
        else if (c.clientId && s.disponibles / s.total < 0.10) alerte = "Il reste seulement <b>" + s.disponibles + " feuille(s)</b> dans ce carnet. Prévoir un nouveau carnet pour le client.";
        $("#d-alerte").html(alerte).toggle(!!alerte);
    }

    /* ------------------------------------------------------------------
       Grille des feuilles
       ------------------------------------------------------------------ */
    function numerosFiltres() {
        var out = [];
        for (var n = carnet.debut; n <= carnet.fin; n++) {
            if (!grid.filtre || CT.metier.statutFeuille(carnet, n) === grid.filtre) out.push(n);
        }
        return out;
    }

    function renderGrille() {
        var nums = numerosFiltres(), pages = Math.max(1, Math.ceil(nums.length / PAGE_SIZE));
        if (grid.page > pages) grid.page = pages;
        var from = (grid.page - 1) * PAGE_SIZE, slice = nums.slice(from, from + PAGE_SIZE);
        var prochain = CT.metier.prochainNumero(carnet);
        var anomaliesByNum = {};
        $.each(carnet.anomalies, function (_, a) { anomaliesByNum[a.numero] = a; });

        var html = [];
        $.each(slice, function (_, n) {
            var st = CT.metier.statutFeuille(carnet, n);
            var cls = (n === prochain && !carnet.cloture) ? "PROCHAINE" : st;
            var a = anomaliesByNum[n];
            var title = CT.STATUTS_FEUILLE[st] + (a ? " - " + a.motif + " (" + CT.util.toFr(a.date) + ")" : "") + (n === prochain ? " - prochaine feuille attendue" : "");
            html.push("<div class='ct-sheet ct-st-" + cls + ($.inArray(n, grid.selection) >= 0 ? " selected" : "") +
                "' data-num='" + n + "' title='" + CT.util.esc(title) + "'>" +
                CT.util.esc(pre(n)) + "<small>" + (cls === "PROCHAINE" ? "Prochaine" : CT.STATUTS_FEUILLE[st]) + "</small></div>");
        });
        $("#g-sheets").html(html.length ? html.join("") : "<p class='text-muted'>Aucune feuille pour ce filtre.</p>");

        $("#g-info").text(nums.length ? "Feuilles " + (from + 1) + " à " + Math.min(from + PAGE_SIZE, nums.length) + " sur " + nums.length : "");
        var $p = $("#g-pager").empty();
        if (pages > 1) {
            $p.append("<li class='" + (grid.page === 1 ? "disabled" : "") + "'><a href='#' data-page='" + (grid.page - 1) + "'>&laquo;</a></li>");
            for (var i = 1; i <= pages; i++) {
                /* libellé = premier n° de la page, plus parlant qu'un numéro de page */
                $p.append("<li class='" + (i === grid.page ? "active" : "") + "'><a href='#' data-page='" + i + "' title='" + nums[(i - 1) * PAGE_SIZE] + " …'>" + i + "</a></li>");
            }
            $p.append("<li class='" + (grid.page === pages ? "disabled" : "") + "'><a href='#' data-page='" + (grid.page + 1) + "'>&raquo;</a></li>");
        }
        renderSelection();
    }

    function renderSelection() {
        var sel = grid.selection;
        $("#g-selbar").toggle(sel.length > 0 && !carnet.cloture);
        $("#g-selcount").text(sel.length);
        $("#g-sellist").text(CT.util.compactNumeros(sel));
        $("#g-sel-dernier").prop("disabled", sel.length !== 1);
        $("#g-sheets .ct-sheet").each(function () {
            $(this).toggleClass("selected", $.inArray($(this).data("num"), sel) >= 0);
        });
    }

    function allerA(n) {
        if (isNaN(n) || n < carnet.debut || n > carnet.fin) {
            CT.util.toast("Le n° " + n + " n'appartient pas à ce carnet.", "warning");
            return;
        }
        grid.filtre = ""; $("#g-filtre").val("");
        grid.page = Math.floor((n - carnet.debut) / PAGE_SIZE) + 1;
        grid.selection = [n];
        renderGrille();
        var $el = $("#g-sheets .ct-sheet[data-num='" + n + "']");
        if ($el.length) $("html, body").animate({ scrollTop: $el.offset().top - 200 }, 200);
    }

    /* ------------------------------------------------------------------
       Onglet anomalies & historique
       ------------------------------------------------------------------ */
    function renderAnomalies() {
        var $b = $("#a-body").empty();
        $("#tab-count-anomalies").text(carnet.anomalies.length);
        if (!carnet.anomalies.length) {
            $b.append("<tr class='ct-empty'><td colspan='6'>Aucune feuille perdue ou annulée</td></tr>");
            return;
        }
        $.each(carnet.anomalies, function (_, a) {
            $b.append("<tr data-num='" + a.numero + "'>" +
                "<td class='ct-num'><a href='#' class='a-goto'>" + CT.util.esc(pre(a.numero)) + "</a></td>" +
                "<td><span class='ct-sheet ct-st-" + a.type + "' style='display:inline-block;padding:1px 8px;cursor:default'>" + CT.STATUTS_FEUILLE[a.type] + "</span></td>" +
                "<td>" + CT.util.esc(a.motif) + "</td>" +
                "<td>" + CT.util.toFr(a.date) + "</td>" +
                "<td>" + CT.util.esc(a.user) + "</td>" +
                "<td class='text-right ct-actions'><button class='btn btn-default a-restore' " + (carnet.cloture ? "disabled" : "") + " title='Rétablir la feuille'><span class='glyphicon glyphicon-repeat'></span> Rétablir</button></td>" +
                "</tr>");
        });
    }

    function renderHistorique() {
        var $l = $("#h-list").empty();
        $.each(carnet.historique || [], function (_, h) {
            $l.append("<li><div class='ct-tl-date'>" + CT.util.toFr(h.date) + " · " + CT.util.esc(h.user) + "</div>" + CT.util.esc(h.action) + "</li>");
        });
        if (!$l.children().length) $l.append("<li class='text-muted'>Aucun évènement</li>");
    }

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */
    function confirmer(message, onOk) {
        $("#confirm-msg").html(message);
        $("#confirm-ok").off("click").on("click", function () { $("#modalConfirm").modal("hide"); onOk(); });
        $("#modalConfirm").modal("show");
    }

    function declarer(numeros, type, motif) {
        // TODO API : $.post("/carnets/" + carnetId + "/anomalies", { numeros, type, motif })
        return CT.store.declarerAnomalies(carnetId, numeros, type, motif).done(function () {
            CT.util.toast(numeros.length + " feuille(s) " + (type === "PERDUE" ? "déclarée(s) perdue(s)" : "annulée(s)") + ".");
            grid.selection = [];
            charger();
        });
    }

    $("#btnEdit").on("click", function () { CT.formCarnet.open(carnet, charger); });

    $("#btnCloture").on("click", function () {
        confirmer(carnet.cloture ? "Réouvrir ce carnet ?" :
            "Clôturer ce carnet ?<br><small class='text-muted'>Les " + CT.metier.stats(carnet).disponibles + " feuille(s) restante(s) ne pourront plus être utilisées.</small>",
            function () {
                CT.store.cloturer(carnetId, !carnet.cloture).done(function () { CT.util.toast("Carnet mis à jour."); charger(); });
            });
    });

    /* ----- Dernier n° utilisé ----- */
    function refreshDernierHelp() {
        var v = parseInt($("#md-numero").val(), 10);
        if (isNaN(v)) { $("#md-help").text("Vide = aucune feuille utilisée."); return; }
        var avant = carnet.dernierUtilise == null ? carnet.debut - 1 : carnet.dernierUtilise;
        var diff = v - avant;
        $("#md-help").text(diff > 0 ? diff + " feuille(s) supplémentaire(s) passeront au statut « Utilisée »."
            : diff < 0 ? (-diff) + " feuille(s) repasseront au statut « Disponible »." : "Aucun changement.");
    }
    $("#btnDernier").on("click", function () {
        var prochain = CT.metier.prochainNumero(carnet);
        $("#md-actuel").text(carnet.dernierUtilise != null ? pre(carnet.dernierUtilise) : "aucun");
        $("#md-prochain").text(prochain ? pre(prochain) : "—");
        $("#md-numero").val(prochain || carnet.fin).attr({ min: carnet.debut, max: carnet.fin });
        $("#md-error").hide();
        refreshDernierHelp();
        $("#modalDernier").modal("show");
    });
    $("#md-numero").on("input", refreshDernierHelp);
    $("#md-minus").on("click", function () { $("#md-numero").val((parseInt($("#md-numero").val(), 10) || carnet.debut) - 1); refreshDernierHelp(); });
    $("#md-plus").on("click", function () { $("#md-numero").val((parseInt($("#md-numero").val(), 10) || carnet.debut - 1) + 1); refreshDernierHelp(); });
    $("#md-save").on("click", function () {
        var v = $.trim($("#md-numero").val());
        var n = v === "" ? null : parseInt(v, 10);
        // TODO API : $.ajax({ url: "/carnets/" + carnetId + "/dernier-utilise", type: "PUT", data: { numero: n } })
        CT.store.majDernierUtilise(carnetId, n)
            .done(function () { $("#modalDernier").modal("hide"); CT.util.toast("Dernier n° utilisé mis à jour."); charger(); })
            .fail(function (m) { $("#md-error").text(m).show(); });
    });

    /* ----- Déclaration perdues / annulées ----- */
    function ouvrirPerdus(numeros, type) {
        $("#mp-numeros").val(CT.util.compactNumeros(numeros || [])).trigger("input");
        $("input[name=mp-type][value=" + (type || "PERDUE") + "]").prop("checked", true);
        $("#mp-error").hide();
        $("#modalPerdus").modal("show");
    }
    $("#btnPerdus").on("click", function () { ouvrirPerdus([]); });
    $("#mp-numeros").on("input", function () {
        var p = CT.util.parseNumeros($(this).val());
        $("#mp-preview").toggleClass("text-danger", p.erreurs.length > 0)
            .text(p.erreurs.length ? p.erreurs.join(" ; ") : (p.numeros.length ? p.numeros.length + " feuille(s) : " + CT.util.compactNumeros(p.numeros) : ""));
    });
    $("#mp-save").on("click", function () {
        var p = CT.util.parseNumeros($("#mp-numeros").val());
        if (p.erreurs.length || !p.numeros.length) {
            $("#mp-error").text(p.erreurs.length ? p.erreurs.join(" ; ") : "Saisissez au moins un numéro.").show();
            return;
        }
        declarer(p.numeros, $("input[name=mp-type]:checked").val(), $("#mp-motif").val())
            .done(function () { $("#modalPerdus").modal("hide"); })
            .fail(function (m) { $("#mp-error").text(m).show(); });
    });

    /* ----- Grille : filtres, pagination, sélection ----- */
    $("#g-filtre").on("change", function () { grid.filtre = $(this).val(); grid.page = 1; renderGrille(); });
    $("#g-goto").on("keydown", function (e) { if (e.which === 13) allerA(parseInt($(this).val(), 10)); });
    $("#g-pager").on("click", "a", function (e) {
        e.preventDefault();
        if ($(this).parent().hasClass("disabled")) return;
        grid.page = parseInt($(this).data("page"), 10);
        renderGrille();
    });

    $("#g-sheets").on("click", ".ct-sheet", function (e) {
        if (carnet.cloture) return;
        var n = $(this).data("num");
        if (e.shiftKey && grid.lastClicked != null) {
            var a = Math.min(grid.lastClicked, n), b = Math.max(grid.lastClicked, n);
            $("#g-sheets .ct-sheet").each(function () {
                var x = $(this).data("num");
                if (x >= a && x <= b && $.inArray(x, grid.selection) < 0) grid.selection.push(x);
            });
        } else {
            var i = $.inArray(n, grid.selection);
            if (i >= 0) grid.selection.splice(i, 1); else grid.selection.push(n);
        }
        grid.selection.sort(function (x, y) { return x - y; });
        grid.lastClicked = n;
        renderSelection();
    });

    $("#g-sel-clear").on("click", function () { grid.selection = []; renderSelection(); });
    $("#g-sel-perdue").on("click", function () { ouvrirPerdus(grid.selection, "PERDUE"); });
    $("#g-sel-annulee").on("click", function () { ouvrirPerdus(grid.selection, "ANNULEE"); });
    $("#g-sel-retablir").on("click", function () {
        var nums = $.grep(grid.selection, function (n) { var s = CT.metier.statutFeuille(carnet, n); return s === "PERDUE" || s === "ANNULEE"; });
        if (!nums.length) { CT.util.toast("Aucune feuille perdue/annulée dans la sélection.", "info"); return; }
        confirmer("Rétablir " + nums.length + " feuille(s) : <b>" + CT.util.compactNumeros(nums) + "</b> ?", function () {
            CT.store.retablirFeuilles(carnetId, nums).done(function () { grid.selection = []; CT.util.toast("Feuille(s) rétablie(s)."); charger(); });
        });
    });
    $("#g-sel-dernier").on("click", function () {
        var n = grid.selection[0];
        confirmer("Définir <b>" + CT.util.esc(pre(n)) + "</b> comme dernier numéro utilisé ?", function () {
            CT.store.majDernierUtilise(carnetId, n).done(function () { grid.selection = []; CT.util.toast("Dernier n° utilisé mis à jour."); charger(); });
        });
    });

    /* ----- Onglet anomalies ----- */
    $("#a-body").on("click", ".a-goto", function (e) {
        e.preventDefault();
        $("a[href='#tab-feuilles']").tab("show");
        allerA($(this).closest("tr").data("num"));
    });
    $("#a-body").on("click", ".a-restore", function () {
        var n = $(this).closest("tr").data("num");
        confirmer("Rétablir la feuille <b>" + CT.util.esc(pre(n)) + "</b> ?", function () {
            CT.store.retablirFeuilles(carnetId, [n]).done(function () { CT.util.toast("Feuille rétablie."); charger(); });
        });
    });

    charger();
    if (!isNaN(focusNum)) setTimeout(function () { allerA(focusNum); }, 50);
});

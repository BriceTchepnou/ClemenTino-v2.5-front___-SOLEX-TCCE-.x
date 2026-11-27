/* =====================================================================
   Opérations · Expéditions pré-enregistrées (operations/preenregistrees.html)
   ---------------------------------------------------------------------
   Expéditions saisies par le client avant son passage en agence
   (formulaire web, WhatsApp, client en compte) : collection
   « preenregistrements » (CX.guichet.preenreg). Filtres Du / Au, Ville,
   Agence ; onglets par statut ; actions : voir, valider au guichet
   (../guichet/expedition-form.html?prereg=CODE : saisie pré-remplie,
   le pré-enregistrement passe « Validé » à l'enregistrement), annuler.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, P = G.preenreg, today = U.today();
    var tous = [], onglet = "EN_ATTENTE";

    O.selecteurAgence("#ox-agence-slot");
    $("#f-du").val(U.addDays(today, -15)); $("#f-au").val(today);
    L.remplirFiltres([], { par: null });
    $("#f-ville").val(O.agenceCourante().ville).trigger("change");

    function statut(p) { return P.statut(p); }
    function menuLigne(p) {
        var st = statut(p);
        return L.menu([["voir", "fa-eye", "Voir le pré-enregistrement"], ["valider", "fa-check", "Valider au guichet", st === "EN_ATTENTE"],
            ["exp", "fa-file-text-o", "Voir l'expédition " + U.esc(p.nRt || ""), !!p.expeditionId], "-", ["annuler", "fa-ban", "Annuler", st === "EN_ATTENTE" || st === "EXPIRE", "text-danger"]]);
    }
    function nbColis(p) { var n = 0, kg = 0; $.each(p.colis || [], function (_, c) { n += Number(c.nombre) || 1; kg += (Number(c.poids) || 0) * (Number(c.nombre) || 1); }); return { n: n, kg: kg }; }
    var dt = new CX.DataTable("#dt-pre", {
        pageSize: 25, sortKey: "dateExp", sortDir: -1, searchInput: "#q",
        emptyText: "Aucune expédition pré-enregistrée", emptyIcon: "fa-mobile",
        rowClass: function (p) { return statut(p) === "EXPIRE" || statut(p) === "ANNULE" ? "cx-row-muted" : ""; },
        columns: [
            { key: "code", title: "Code", render: function (p) { return "<a href='#' class='cx-mono cx-strong' data-act='voir'>" + U.esc(p.code) + "</a>"; },
                searchValue: function (p) { return [p.code, p.exp.nom, p.exp.tel, p.dst.nom, p.dst.tel, G.telFmt(p.dst.tel), p.nRt].join(" "); } },
            { key: "dateExp", title: "Date exp.", render: function (p) { return "<span class='cx-nowrap'>" + U.toFr(p.dateExp) + "</span>"; }, searchValue: function () { return ""; } },
            { key: "agence", title: "Ville · agence", sortValue: function (p) { return O.agenceLib(p.agenceId); }, render: function (p) { return U.esc(O.agenceLib(p.agenceId)); }, searchValue: function () { return ""; } },
            { key: "dest", title: "Destination", sortValue: function (p) { return p.villeDest; }, render: function (p) {
                return U.esc(G.villeNom(p.villeDest)) + (p.bureauDest ? " · " + U.esc(G.titre(p.bureauDest)) : "") + "<div class='cx-cell-sub'>" + (p.livraison === "DOMICILE" ? "livraison · " + U.esc(p.quartier || "") : "retrait en agence") + "</div>";
            }, searchValue: function () { return ""; } },
            { key: "exp", title: "Expéditeur", sortValue: function (p) { return p.exp.nom; }, render: function (p) { return U.esc(p.exp.nom) + "<div class='cx-cell-sub'>" + U.esc(G.telAff(p.exp.tel)) + "</div>"; }, searchValue: function () { return ""; } },
            { key: "dst", title: "Destinataire", sortValue: function (p) { return p.dst.nom; }, render: function (p) { return U.esc(p.dst.nom); }, searchValue: function () { return ""; } },
            { key: "tel", title: "Tél. dest.", render: function (p) { return "<span class='cx-nowrap'>" + U.esc(G.telAff(p.dst.tel)) + "</span>"; }, searchValue: function () { return ""; } },
            { key: "colis", title: "Colis", className: "num", sortValue: function (p) { return nbColis(p).n; }, render: function (p) { var c = nbColis(p); return c.n + "<div class='cx-cell-sub cx-nowrap'>" + U.esc(G.kg(c.kg)) + "</div>"; }, searchValue: function () { return ""; } },
            { key: "source", title: "Source", render: function (p) { return O.badge(P.SOURCES, p.source); }, searchValue: function (p) { return (P.SOURCES[p.source] || {}).label; } },
            { key: "statut", title: "Statut", sortValue: statut, render: function (p) { return O.badge(P.STATUTS, statut(p)) + (p.nRt ? "<div class='cx-cell-sub cx-mono'>" + U.esc(p.nRt) + "</div>" : ""); }, searchValue: function () { return ""; } },
            { key: "valider", title: "", sortable: false, render: function (p) { return statut(p) === "EN_ATTENTE" ? "<a class='cx-btn cx-btn-primary cx-btn-xs cx-nowrap' href='../guichet/expedition-form.html?prereg=" + encodeURIComponent(p.code) + "'><i class='fa fa-check'></i> Valider au guichet</a>" : ""; }, searchValue: function () { return ""; } },
            { key: "act", title: "", sortable: false, width: "48px", render: menuLigne, searchValue: function () { return ""; } }
        ],
        onRender: function (rows) { $("#l-count").text(O.pl(rows.length, "pré-enregistrement")); }
    });
    O.menusFixes("#dt-pre");

    function appliquer() {
        var du = $("#f-du").val(), au = $("#f-au").val(), v = $("#f-ville").val(), ag = $("#f-bureau").val();
        var base = $.grep(tous, function (p) {
            if (du && p.dateExp < du) return false;
            if (au && p.dateExp > au) return false;
            if (v && p.ville !== v) return false;
            if (ag && String(p.agenceId) !== ag) return false;
            return true;
        });
        $("#n-tout").text(base.length);
        $.each(P.STATUTS, function (k) { $("#n-" + k).text($.grep(base, function (p) { return statut(p) === k; }).length); });
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        dt.setRows(onglet ? $.grep(base, function (p) { return statut(p) === onglet; }) : base);
        var att = $.grep(tous, function (p) { return statut(p) === "EN_ATTENTE"; });
        $("#kpis").html([
            O.kpi("En attente", att.length, "à valider au guichet", "fa-hourglass-half", "orange"),
            O.kpi("Du jour", $.grep(att, function (p) { return p.dateExp === today; }).length, "pré-enregistrées aujourd'hui", "fa-calendar", "blue"),
            O.kpi("Validées", $.grep(tous, function (p) { return p.statut === "VALIDE"; }).length, "devenues expéditions", "fa-check-circle", "green"),
            O.kpi("Expirées", $.grep(tous, function (p) { return statut(p) === "EXPIRE"; }).length, "plus de " + P.VALIDITE_J + " jours sans passage", "fa-clock-o", "")
        ].join(""));
    }
    function charger() {
        P.assurer();
        // TODO API : GET /guichet/pre-enregistrements?du=&au=&ville=&agence=
        return CX.api.list("preenregistrements").done(function (rows) { tous = rows; appliquer(); });
    }
    function voir(p) {
        var c = nbColis(p);
        var corps = "<div class='ox-grid-2'><dl class='cx-dl ox-dl'><dt>Code</dt><dd class='cx-mono cx-strong'>" + U.esc(p.code) + "</dd><dt>Statut</dt><dd>" + O.badge(P.STATUTS, statut(p)) + "</dd>" +
            "<dt>Source</dt><dd>" + O.badge(P.SOURCES, p.source) + "</dd><dt>Date exp.</dt><dd>" + U.toFr(p.dateExp) + "</dd><dt>Agence</dt><dd>" + U.esc(O.agenceLib(p.agenceId)) + "</dd>" +
            "<dt>Destination</dt><dd>" + U.esc(G.villeNom(p.villeDest)) + (p.bureauDest ? " · " + U.esc(G.titre(p.bureauDest)) : "") + "</dd>" +
            "<dt>Remise</dt><dd>" + (p.livraison === "DOMICILE" ? "Livraison · " + U.esc(p.quartier || "") + (p.repere ? " (" + U.esc(p.repere) + ")" : "") : "Retrait en agence") + "</dd></dl>" +
            "<dl class='cx-dl ox-dl'><dt>Expéditeur</dt><dd>" + U.esc(p.exp.nom) + "<div class='cx-cell-sub'>" + U.esc(G.telAff(p.exp.tel)) + "</div></dd><dt>Destinataire</dt><dd>" + U.esc(p.dst.nom) + "<div class='cx-cell-sub'>" + U.esc(G.telAff(p.dst.tel)) + "</div></dd>" +
            "<dt>Colis</dt><dd>" + c.n + " · " + U.esc(G.kg(c.kg)) + "</dd>" + (p.nRt ? "<dt>Expédition</dt><dd class='cx-mono'>" + U.esc(p.nRt) + " · " + U.esc(U.toFr(p.dateValidation)) + " · " + U.esc(p.validePar || "") + "</dd>" : "") +
            (p.annulation ? "<dt>Annulation</dt><dd>" + U.esc(p.annulation.motif) + " · " + U.esc(U.toFr(p.annulation.date)) + "</dd>" : "") + "</dl></div>" +
            "<table class='cx-table ox-mini'><thead><tr><th>Nature</th><th>Description</th><th class='num'>Nb</th><th class='num'>Poids</th><th class='num'>Dim. (cm)</th><th class='num'>Valeur</th></tr></thead><tbody>" +
            $.map(p.colis || [], function (x) { return "<tr><td>" + U.esc(x.nature) + "</td><td>" + U.esc(x.description || "") + "</td><td class='num'>" + (x.nombre || 1) + "</td><td class='num'>" + U.esc(G.kg(x.poids)) + "</td><td class='num'>" + (x.L ? U.esc(x.L + "×" + x.l + "×" + x.H) : "—") + "</td><td class='num'>" + (x.valeur ? U.money(x.valeur) : "—") + "</td></tr>"; }).join("") + "</tbody></table>";
        var $m = O.modale("ox-pre", "Pré-enregistrement " + U.esc(p.code), "fa-mobile", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Fermer</button>" + (statut(p) === "EN_ATTENTE" ? "<a class='cx-btn cx-btn-primary' href='../guichet/expedition-form.html?prereg=" + encodeURIComponent(p.code) + "'><i class='fa fa-check'></i> Valider au guichet</a>" : ""), "modal-lg");
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }
    function annuler(p) {
        var $m = O.modale("ox-pre-annuler", "Annuler " + U.esc(p.code), "fa-ban", O.champ("pa-motif", "Motif", "<input type='text' class='form-control' id='pa-motif' maxlength='160' placeholder='Client injoignable, doublon…'>", true),
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Retour</button><button type='button' class='cx-btn cx-btn-danger' id='pa-ok'><i class='fa fa-ban'></i> Annuler le pré-enregistrement</button>");
        $m.on("click", "#pa-ok", function () {
            var m = $.trim($("#pa-motif").val());
            if (m.length < 3) return O.erreurChamp($m, "#pa-motif", "Indiquez le motif.");
            // TODO API : POST /guichet/pre-enregistrements/{code}/annuler  { motif }
            CX.api.save("preenregistrements", $.extend({}, p, { statut: "ANNULE", annulation: { date: U.now(), user: CX.CONFIG.USER.nom, motif: m } })).done(function () {
                $m.modal("hide"); U.toast("Pré-enregistrement <b>" + U.esc(p.code) + "</b> annulé.", "info"); charger();
            });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    $("#dt-pre").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var id = $(this).closest("tr").data("id"), p = $.grep(tous, function (x) { return String(x.id) === String(id); })[0], act = $(this).data("act");
        if (!p) return;
        if (act === "voir") voir(p);
        if (act === "valider") window.location.href = "../guichet/expedition-form.html?prereg=" + encodeURIComponent(p.code);
        if (act === "exp") O.fiche(p.expeditionId);
        if (act === "annuler") annuler(p);
    });
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab") || ""; appliquer(); });
    $("#f-du, #f-au, #f-ville, #f-bureau").on("change", function () { setTimeout(appliquer, 0); });
    charger();
});

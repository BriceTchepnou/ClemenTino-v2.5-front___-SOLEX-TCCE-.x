/* =====================================================================
   Opérations · Bordereaux d'expédition (operations/bordereaux.html)
   Onglets : Bordereaux envoyés (défaut) | #entrants ; #ajouter ouvre la saisie
   ---------------------------------------------------------------------
   Liste des manifestes de voyage de l'agence (N° BE, N° BE manuel, heure
   de départ, expéditions / colis, agences, départ prévu, moyen de
   transport, saisie, Départ OUI/NON, Annulé OUI/NON, actions).
   « Ajouter bordereau » : « Générer les bordereaux d'expédition de la
   journée » (plusieurs lignes : plan de voyage, moyen de transport, n° de
   transport, transporteur, destination, n° manuel, départ et arrivée
   prévus, personne à contacter), pré-remplis ou non avec les expéditions
   enregistrées de chaque destination.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, A = O.agenceCourante(), today = U.today();
    var bords = [], exps = {}, tous = [], onglet = "envoyes";

    O.selecteurAgence("#ox-agence-slot");
    $("#f-du").val(U.addDays(today, -14)); $("#f-au").val(today);
    L.remplirFiltres([], { par: null });

    function stats(b) {
        var p = 0, n = 0, ids = b.annule ? (b.expeditionIdsAnnules || []) : b.expeditionIds;
        $.each(ids, function (_, id) { var e = exps[id]; if (e) { p += Number(e.poids) || 0; n += e.nbColis || 1; } });
        return { exp: ids.length, colis: n, poids: p };
    }
    function oui(v) { return v ? "<span class='ox-oui'>OUI</span>" : "<span class='ox-non'>NON</span>"; }
    function menuLigne(b) {
        return L.menu([
            ["manifeste", "fa-file-text-o", "Manifeste / imprimer"],
            ["partir", "fa-road", "Faire partir", b.statut === "PREPARE" && !b.annule && O.estMoi(b.agenceDepId) && b.expeditionIds.length > 0],
            ["envoi", "fa-cubes", "Ajouter des expéditions", b.statut === "PREPARE" && !b.annule && O.estMoi(b.agenceDepId)],
            ["recevoir", "fa-check-square-o", "Réceptionner", (b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId)],
            "-",
            ["annuler", "fa-ban", "Annuler le bordereau", b.statut === "PREPARE" && !b.annule && O.estMoi(b.agenceDepId), "text-danger"]
        ]);
    }
    var dt = new CX.DataTable("#dt-bordereaux", {
        pageSize: 25, sortKey: "numero", sortDir: -1, searchInput: "#q",
        emptyText: "Aucun bordereau", emptyIcon: "fa-truck",
        rowClass: function (b) { return b.annule ? "cx-row-muted" : ""; },
        columns: [
            { key: "numero", title: "N° BE", render: function (b) { return "<a class='cx-mono cx-strong' href='bordereau.html?id=" + b.id + "'>" + U.esc(b.numero) + "</a>" + ((b.ecarts || []).length ? "<div class='cx-cell-sub' style='color:var(--cx-red)'><i class='fa fa-warning'></i> " + O.pl(b.ecarts.length, "écart") + "</div>" : ""); },
                searchValue: function (b) { return [b.numero, b.numeroManuel, b.numeroTransport, (b.vehicule || {}).immatriculation, (b.chauffeur || {}).nom, b.transporteur, b.scelle].join(" "); } },
            { key: "numeroManuel", title: "N° BE manuel", render: function (b) { return b.numeroManuel ? "<span class='cx-mono'>" + U.esc(b.numeroManuel) + "</span>" : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            { key: "depart", title: "Départ de (heure)", sortValue: function (b) { return b.dateDepart || ""; }, render: function (b) { return b.dateDepart ? "<span class='cx-nowrap'>" + U.esc(U.toFr(b.dateDepart)) + "</span>" : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            { key: "nb", title: "Expéditions / colis", className: "num", sortValue: function (b) { return stats(b).exp; }, render: function (b) { var s = stats(b); return s.exp + " / " + s.colis + "<div class='cx-cell-sub cx-nowrap'>" + U.esc(G.kg(s.poids)) + "</div>"; }, searchValue: function () { return ""; } },
            { key: "agDep", title: "Agence départ", sortValue: function (b) { return O.agenceLib(b.agenceDepId); }, render: function (b) { return U.esc(O.agenceLib(b.agenceDepId)); }, searchValue: function (b) { return b.villeDep + " " + b.agenceDep; } },
            { key: "agDest", title: "Agence dest.", sortValue: function (b) { return O.agenceLib(b.agenceDestId); }, render: function (b) { return U.esc(O.agenceLib(b.agenceDestId)); }, searchValue: function (b) { return b.villeDest + " " + b.agenceDest; } },
            { key: "departPrevu", title: "Départ prévu le", sortValue: function (b) { return b.departPrevu || b.date; }, render: function (b) { return "<span class='cx-nowrap'>" + U.esc(U.toFr(b.departPrevu || b.date)) + "</span>" + (b.arriveePrevue ? "<div class='cx-cell-sub'>arrivée " + U.esc(U.toFr(b.arriveePrevue)) + "</div>" : ""); }, searchValue: function () { return ""; } },
            { key: "moyen", title: "Moyen de transport", sortValue: function (b) { return b.moyen || "ROUTE"; }, render: function (b) {
                return "<b>" + U.esc((O.MOYENS_TRANSPORT[b.moyen || "ROUTE"] || "").toUpperCase()) + "</b>" + (b.numeroTransport || (b.vehicule || {}).immatriculation ? " <span class='cx-mono'>" + U.esc(b.numeroTransport || b.vehicule.immatriculation) + "</span>" : "") +
                    "<div class='cx-cell-sub'>" + U.esc([(b.chauffeur || {}).nom, b.transporteur].filter(Boolean).join(" · ") || "—") + "</div>";
            }, searchValue: function () { return ""; } },
            { key: "dateCreation", title: "Saisie le", render: function (b) { return "<span class='cx-nowrap'>" + U.esc(U.toFr(b.dateCreation || b.date)) + "</span><div class='cx-cell-sub'>" + U.esc(b.creePar || "") + "</div>"; }, searchValue: function () { return ""; } },
            { key: "parti", title: "Départ", className: "center", sortValue: function (b) { return b.statut !== "PREPARE" ? 1 : 0; }, render: function (b) { return oui(b.statut !== "PREPARE"); }, searchValue: function () { return ""; } },
            { key: "annule", title: "Annulé", className: "center", sortValue: function (b) { return b.annule ? 1 : 0; }, render: function (b) { return oui(!!b.annule); }, searchValue: function () { return ""; } },
            { key: "statut", title: "Statut", render: function (b) { return b.annule ? "<span class='cx-badge cx-badge-grey'>Annulé</span>" : O.badge(O.STATUT_BORDEREAU, b.statut); }, searchValue: function () { return ""; } },
            { key: "act", title: "", sortable: false, width: "48px", render: menuLigne, searchValue: function () { return ""; } }
        ],
        onRender: function (rows) { $("#l-count").text(O.pl(rows.length, "bordereau", "bordereaux")); }
    });
    O.menusFixes("#dt-bordereaux");

    function filtrer() {
        var v = $("#f-ville").val(), bu = $("#f-bureau").val(), du = $("#f-du").val(), au = $("#f-au").val();
        function ok(b, sens) {
            var ville = sens === "envoyes" ? b.villeDest : b.villeDep, ag = sens === "envoyes" ? b.agenceDestId : b.agenceDepId;
            if (v && ville !== v) return false;
            if (bu && String(ag) !== bu) return false;
            var d = b.date;
            if (du && d < du && b.statut === "CLOTURE") return false;
            if (au && d > au) return false;
            return true;
        }
        var env = $.grep(bords, function (b) { return O.estMoi(b.agenceDepId) && ok(b, "envoyes"); });
        var ent = $.grep(bords, function (b) { return O.estMoi(b.agenceDestId) && !b.annule && ok(b, "entrants"); });
        $("#n-envoyes").text(env.length); $("#n-entrants").text(ent.length);
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        dt.setRows(onglet === "envoyes" ? env : ent);
        var prep = $.grep(bords, function (b) { return b.statut === "PREPARE" && !b.annule && O.estMoi(b.agenceDepId); });
        var att = $.grep(bords, function (b) { return (b.statut === "PARTI" || b.statut === "ARRIVE") && O.estMoi(b.agenceDestId); });
        var ec = $.grep(bords, function (b) { return (b.ecarts || []).length && (O.estMoi(b.agenceDepId) || O.estMoi(b.agenceDestId)); }).length;
        $("#kpis").html([
            O.kpi("En préparation", prep.length, "à charger et faire partir", "fa-cubes", "purple", "groupage.html"),
            O.kpi("Partis aujourd'hui", $.grep(bords, function (b) { return O.estMoi(b.agenceDepId) && String(b.dateDepart || "").substr(0, 10) === today; }).length, "manifestes de voyage", "fa-road", "blue"),
            O.kpi("Entrants attendus", att.length, "à réceptionner", "fa-truck", "orange", "degroupage.html"),
            O.kpi("Avec écarts", ec, "manquants ou en trop", "fa-warning", ec ? "red" : "green")
        ].join(""));
    }
    function charger() {
        // TODO API : GET /exploitation/bordereaux?agence={id}&sens=envoyes|entrants&ville=&bureau=&du=&au=
        return $.when(CX.api.list("bordereaux"), CX.api.list("expeditions")).done(function (b, e) {
            bords = b; exps = {}; tous = e;
            $.each(e, function (_, x) { exps[x.id] = x; });
            filtrer();
        });
    }

    /* =================================================================
       « Générer les bordereaux d'expédition de la journée »
       ================================================================= */
    function ligneBE(i) {
        var moyens = $.map(O.MOYENS_TRANSPORT, function (l, k) { return "<option value='" + k + "'>" + l + "</option>"; }).join("");
        return "<tr data-l='" + i + "'>" +
            "<td><input type='text' class='form-control' data-f='plan' placeholder='" + U.esc(G.villeNom(A.ville)) + " → …'></td>" +
            "<td><select class='form-control' data-f='moyen'>" + moyens + "</select></td>" +
            "<td><input type='text' class='form-control cx-mono' data-f='ntr' placeholder='LT 452 AB / vol'></td>" +
            "<td><input type='text' class='form-control' data-f='transporteur'></td>" +
            "<td><select class='form-control' data-f='dest'><option value=''>Choisir…</option>" + $.map(CX.REF.AGENCES, function (a) { return a.id === A.id ? null : "<option value='" + a.id + "'>" + U.esc(O.agenceLib(a.id)) + "</option>"; }).join("") + "</select></td>" +
            "<td><input type='text' class='form-control cx-mono' data-f='man'></td>" +
            "<td><div class='ox-dt'><input type='date' class='form-control' data-f='depD' value='" + today + "'><input type='time' class='form-control' data-f='depH' value='18:00'></div></td>" +
            "<td><div class='ox-dt'><input type='date' class='form-control' data-f='arrD' value='" + U.addDays(today, 1) + "'><input type='time' class='form-control' data-f='arrH' value='12:00'></div></td>" +
            "<td><input type='text' class='form-control' data-f='contact' placeholder='Nom, téléphone'></td>" +
            "<td><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-suppr title='Supprimer la ligne' aria-label='Supprimer la ligne'><i class='fa fa-minus'></i></button></td></tr>";
    }
    function modaleJournee() {
        var corps = "<p class='cx-muted' style='margin-top:0'>Un bordereau (manifeste de voyage) par ligne, au départ de <b>" + U.esc(O.agenceLib(A.id)) + "</b>. Le N° BE est attribué à l'enregistrement.</p>" +
            "<div class='cx-table-wrap'><table class='cx-table ox-lignes-be' id='be-lignes'><thead><tr><th>Plan de voyage</th><th>Moyen de transport</th><th>N° transport</th><th>Transporteur</th><th>Destination</th><th>N° bord. manuel</th><th>Départ prévu</th><th>Arrivée prévue</th><th>Personne à contacter</th><th></th></tr></thead><tbody>" +
            ligneBE(0) + "</tbody></table></div>" +
            "<div class='ox-flex ox-mt'><button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' id='be-plus'><i class='fa fa-plus'></i> Ajouter un bordereau</button><span class='ox-grow'></span>" +
            "<label class='cx-help' style='margin:0'><input type='checkbox' id='be-remplir' checked> Pré-remplir avec les expéditions enregistrées de chaque destination</label></div>";
        var $m = O.modale("ox-journee", "Générer les bordereaux d'expédition de la journée", "fa-truck", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='be-ok'><i class='fa fa-check'></i> Soumettre</button>", "modal-lg ox-fiche-dialog");
        var n = 1;
        $m.on("click", "#be-plus", function () { $("#be-lignes tbody").append(ligneBE(n++)); });
        $m.on("click", "[data-suppr]", function () { if ($("#be-lignes tbody tr").length > 1) $(this).closest("tr").remove(); });
        $m.on("change", "[data-f=dest]", function () {
            var $p = $(this).closest("tr").find("[data-f=plan]"), a = O.agence($(this).val());
            if (a && !$p.val()) $p.val(G.villeNom(A.ville) + " → " + G.villeNom(a.ville));
        });
        var fait = null;
        $m.on("click", "#be-ok", function () {
            var lignes = [], err = false;
            $("#be-lignes tbody tr").each(function () {
                var $t = $(this), g = function (k) { return $.trim($t.find("[data-f=" + k + "]").val() || ""); };
                $t.removeClass("ox-retard");
                if (!g("dest")) { err = true; $t.addClass("ox-retard"); return; }
                lignes.push({ dest: Number(g("dest")), plan: g("plan"), moyen: g("moyen"), ntr: g("ntr"), transporteur: g("transporteur"), man: g("man"),
                    dep: (g("depD") || today) + " " + (g("depH") || "18:00"), arr: (g("arrD") || U.addDays(today, 1)) + " " + (g("arrH") || "12:00"), contact: g("contact") });
            });
            if (err) { U.toast("Choisissez la destination de chaque ligne.", "warning"); return; }
            var remplir = $("#be-remplir").is(":checked"), crees = [], i = 0, $b = $(this);
            U.busy($b, true);
            /* expéditions à envoyer de l'agence, par agence de destination */
            var files = O.files($.map(tous, function (e) { return O.norm(e); }), bords), parDest = {};
            $.each(files.aGrouper, function (_, e) { if (!e.suspendu) (parDest[e.agDestId] = parDest[e.agDestId] || []).push(e.id); });
            // TODO API : POST /exploitation/bordereaux/journee  { lignes: [{ planVoyage, moyen, numeroTransport, transporteur, agenceDestId, numeroManuel, departPrevu, arriveePrevue, contact }], preRemplir }
            (function suivant() {
                if (i >= lignes.length) { fait = crees; $m.modal("hide"); return; }
                var l = lignes[i++];
                var b = O.nouveauBordereau({ agenceDestId: l.dest, date: l.dep.substr(0, 10), heure: l.dep.substr(11, 5), planVoyage: l.plan || undefined, moyen: l.moyen || "ROUTE",
                    numeroTransport: l.ntr, transporteur: l.transporteur, numeroManuel: l.man, departPrevu: l.dep, arriveePrevue: l.arr, contact: l.contact,
                    vehicule: { type: l.moyen === "COURSIER" ? "Moto" : "Camionnette (3,5 t)", immatriculation: l.moyen === "ROUTE" || l.moyen === "COURSIER" ? l.ntr : "" } });
                if (!b.planVoyage) delete b.planVoyage;
                CX.api.save("bordereaux", b).then(function (bb) {
                    var ids = remplir ? (parDest[l.dest] || []) : [];
                    parDest[l.dest] = [];
                    if (!ids.length) return { bordereau: bb, ok: [] };
                    return O.grouper(bb, ids);
                }).done(function (r) { crees.push(r); }).always(suivant);
            })();
        });
        $m.on("hidden.bs.modal", function () {
            $m.remove();
            if (fait && fait.length) {
                var n2 = 0; $.each(fait, function (_, r) { n2 += r.ok.length; });
                U.toast(O.pl(fait.length, "bordereau généré", "bordereaux générés") + " (" + $.map(fait, function (r) { return U.esc(r.bordereau.numero); }).join(", ") + ")" + (n2 ? " · " + O.pl(n2, "expédition groupée", "expéditions groupées") : "") + ".", "success");
                charger();
            }
        });
        $m.modal("show");
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); filtrer(); });
    $("#f-ville, #f-bureau, #f-du, #f-au").on("change", function () { setTimeout(filtrer, 0); });
    $("#btn-ajouter").on("click", modaleJournee);
    $("#dt-bordereaux").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var id = $(this).closest("tr").data("id"), b = $.grep(bords, function (x) { return String(x.id) === String(id); })[0], act = $(this).data("act");
        if (!b) return;
        if (act === "manifeste") window.location.href = "bordereau.html?id=" + b.id;
        if (act === "envoi") window.location.href = "groupage.html";
        if (act === "recevoir") window.location.href = "degroupage.html?bordereau=" + b.id;
        if (act === "partir") O.modaleDepart(b).done(function (r) { U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> parti.", "success"); charger(); });
        if (act === "annuler") U.confirm({ title: "Annuler le bordereau", message: "Le bordereau <b>" + U.esc(b.numero) + "</b> est annulé (il reste tracé) ; ses expéditions redeviennent à envoyer.", okText: "Annuler le bordereau", okClass: "cx-btn-danger", cancelText: "Retour" })
            .done(function () { O.annulerBordereau(b).done(function () { U.toast("Bordereau annulé.", "info"); charger(); }); });
    });

    var h = (window.location.hash || "").replace("#", "");
    if (h === "entrants") onglet = "entrants";
    charger().done(function () { if (h === "ajouter") modaleJournee(); });
});

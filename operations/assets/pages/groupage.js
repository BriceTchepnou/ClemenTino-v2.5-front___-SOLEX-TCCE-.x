/* =====================================================================
   Opérations · Envoi des colis (operations/groupage.html)
   ---------------------------------------------------------------------
   Une fois l'expédition vendue au guichet, l'agence de départ GROUPE les
   expéditions et génère le manifeste de voyage (bordereau d'expédition).
   - Filtres : bureau de provenance (= agence courante), bureau de
     destination, saisie du / au, saisie par, directions, nature du colis,
     recherche N° RT ; saisie rapide à la douchette.
   - « Bordereau d'expédition » : nouveau bordereau avec la sélection
     (étape GROUPEE) ou ajout à un bordereau en préparation ; « Faire
     partir » -> EN_TRANSIT.
   - Onglet « Livraisons urbaines (même agence) » : mise en agence ou en
     livraison directe, sans transport.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, A = O.agenceCourante();
    var tous = [], bords = [], f = null, onglet = "grouper";

    O.selecteurAgence("#ox-agence-slot");
    $("#f-prov").html(O.optionsAgences(A.id)).on("change", function () { O.changerAgence($(this).val()); window.location.reload(); });
    $("#f-dir").html("<option value=''>Toutes les directions</option>" + $.map(CX.REF.VILLES, function (v) { return "<option value='" + v.nom + "'>Direction " + U.esc(G.villeNom(v.nom)) + "</option>"; }).join("") + "<option value='ETRANGER'>Étranger</option>");
    $("#f-nature").html("<option value=''>Toutes</option>" + $.map(CX.REF.NATURES_COLIS, function (n) { return "<option>" + U.esc(n) + "</option>"; }).join(""));

    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function liste() { return onglet === "grouper" ? f.aGrouper : f.locaux; }

    var dt = new CX.DataTable("#dt-envoi", {
        pageSize: 25, sortKey: "dateExp", sortDir: -1, selectable: true, searchInput: "#q",
        emptyText: "Aucune expédition à envoyer", emptyIcon: "fa-cubes",
        rowClass: function (e) { return (e.suspendu ? "ox-suspendu " : "") + (e.sla.retard ? "ox-retard" : ""); },
        columns: L.colonnes(["rt", "rtMan", "ref", "bord", "bordMan", "bureauDep", "bureauDest", "client", "contenu", "parties", "dateExp", "statut"], bords),
        onSelect: majSelection,
        onRender: function (rows) { $("#l-count").text(O.pl(rows.length, "expédition")); }
    });

    function majSelection() {
        var s = dt.getSelected(), poids = 0, nb = 0, dest = {};
        $.each(s, function (_, e) { poids += Number(e.poids) || 0; nb += e.nbColis || 1; dest[e.agDestId] = (dest[e.agDestId] || 0) + 1; });
        $("#sel-sub").text(s.length ? O.pl(s.length, "expédition sélectionnée", "expéditions sélectionnées") : "Aucune expédition sélectionnée");
        $("#sel-resume").html(s.length ? "<dl class='cx-dl ox-dl'><dt>Colis</dt><dd>" + nb + "</dd><dt>Poids</dt><dd>" + U.esc(G.kg(poids)) + "</dd><dt>Destinations</dt><dd>" +
            $.map(dest, function (n, k) { return U.esc(O.agenceLib(k)) + " (" + n + ")"; }).join("<br>") + "</dd></dl>" : "<p class='cx-muted'>Cochez des expéditions ou scannez leur N° RT.</p>");
        $("#btn-be").prop("disabled", false).html(s.length ? "<i class='fa fa-file-text-o'></i> Bordereau d'expédition (" + s.length + ")" : "<i class='fa fa-file-text-o'></i> Bordereau d'expédition (vide)");
        $("#btn-orienter").prop("disabled", !s.length);
        $("#btn-ajouter").prop("disabled", !s.length || !$("#sel-bordereau").val());
        $("#sel-grouper").toggleClass("cx-hidden", onglet !== "grouper");
        $("#sel-locaux").toggleClass("cx-hidden", onglet !== "locaux");
    }

    function appliquer() {
        var fd = $("#f-dest").val(), du = $("#f-du").val(), au = $("#f-au").val(), par = $("#f-par").val(), dir = $("#f-dir").val(), nat = $("#f-nature").val();
        dt.setRows($.grep(liste(), function (e) {
            if (fd && String(e.agDestId) !== fd) return false;
            if (du && e.dateExp < du) return false;
            if (au && e.dateExp > au) return false;
            if (par && e.guichetier !== par) return false;
            if (dir === "ETRANGER" && !O.international(e)) return false;
            if (dir && dir !== "ETRANGER" && e.villeDest !== dir) return false;
            if (nat && !$.grep(e.colis, function (c) { return c.nature === nat; }).length) return false;
            return true;
        }));
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        majSelection();
    }

    /* Bordereaux en préparation de l'agence */
    function rendrePrepa() {
        var prepa = $.grep(bords, function (b) { return b.statut === "PREPARE" && !b.annule && O.estMoi(b.agenceDepId); });
        $("#sel-bordereau").html("<option value=''>Choisir…</option>" + $.map(prepa, function (b) {
            return "<option value='" + b.id + "'>" + U.esc(b.numero + " → " + O.agenceLib(b.agenceDestId)) + "</option>";
        }).join(""));
        $("#bloc-ajouter").toggleClass("cx-hidden", !prepa.length);
        $("#prepa").html(prepa.length ? $.map(prepa, function (b) {
            var lignes = $.map(b.expeditionIds, function (id) {
                var e = parId(id);
                return e ? "<li class='ox-flex'><span class='cx-mono'>" + U.esc(e.nRt) + "</span><span class='cx-muted ox-grow'>" + U.esc(O.contenuCourt(e)) + "</span>" +
                    "<button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-retirer='" + e.id + "' title='Retirer du bordereau'><i class='fa fa-times'></i></button></li>" : "";
            }).join("");
            return "<div class='ox-bcard' data-b='" + b.id + "' style='margin-bottom:10px'><div class='ox-bcard-top'><a class='ox-bcard-num' href='bordereau.html?id=" + b.id + "'>" + U.esc(b.numero) + "</a>" + O.badge(O.STATUT_BORDEREAU, b.statut) + "</div>" +
                "<div class='ox-bcard-route'><i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(O.agenceLib(b.agenceDestId)) + "</div>" +
                "<div class='ox-bcard-meta'><span><i class='fa fa-cube'></i> " + O.pl(b.expeditionIds.length, "expédition") + "</span><span><i class='fa fa-road'></i> " + U.esc(O.MOYENS_TRANSPORT[b.moyen || "ROUTE"]) + " " + U.esc(b.numeroTransport || (b.vehicule || {}).immatriculation || "") + "</span>" +
                "<span><i class='fa fa-clock-o'></i> " + U.esc(U.toFr(b.departPrevu || b.date)) + "</span></div>" +
                "<details><summary class='cx-muted' style='cursor:pointer;font-size:12px'>Contenu du bordereau</summary><ul class='list-unstyled' style='margin:6px 0 0;font-size:12px'>" + lignes + "</ul></details>" +
                "<div class='ox-bcard-actions'><a class='cx-btn cx-btn-ghost cx-btn-xs' href='bordereau.html?id=" + b.id + "'><i class='fa fa-print'></i> Manifeste</a>" +
                "<button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-partir><i class='fa fa-road'></i> Faire partir</button>" +
                "<button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-annuler-b><i class='fa fa-trash-o'></i> Annuler</button></div></div>";
        }).join("") : "<p class='cx-muted' style='margin:0'>Aucun bordereau en préparation. <a href='bordereaux.html#ajouter'>Générer les bordereaux de la journée</a></p>");
    }

    function charger() {
        return O.charger().done(function (exps, b) {
            tous = exps; bords = b; f = O.files(exps, bords);
            dt.o.columns = L.colonnes(["rt", "rtMan", "ref", "bord", "bordMan", "bureauDep", "bureauDest", "client", "contenu", "parties", "dateExp", "statut"], bords);
            $("#n-grouper").text(f.aGrouper.length); $("#n-locaux").text(f.locaux.length);
            var dests = {}; $.each(f.aGrouper.concat(f.locaux), function (_, e) { if (e.agDestId) dests[e.agDestId] = true; });
            var cur = $("#f-dest").val();
            $("#f-dest").html("<option value=''>Tous</option>" + $.map(dests, function (_, k) { return "<option value='" + k + "'>" + U.esc(O.agenceLib(k)) + "</option>"; }).join("")).val(cur && dests[cur] ? cur : "");
            L.remplirFiltres(tous, { ville: null, bureau: null, par: "#f-par" });
            rendrePrepa();
            appliquer();
        });
    }

    /* Saisie rapide à la douchette */
    O.scanner("#scan", function (code) {
        var brut = O.chercherLt(code), e = brut ? parId(brut.id) : null, $r = $("#scan-res");
        function res(ok, msg) { $r.removeClass("ok ko").addClass(ok ? "ok" : "ko").html("<i class='fa " + (ok ? "fa-check" : "fa-times") + "'></i> " + msg); O.bip(ok); }
        if (!e) return res(false, "N° RT « " + U.esc(code) + " » introuvable.");
        var dans = function (l) { return $.grep(l, function (x) { return x.id === e.id; }).length > 0; };
        var ong = dans(f.aGrouper) ? "grouper" : dans(f.locaux) ? "locaux" : null;
        if (!ong) {
            if (e.etape === "GROUPEE") return res(false, U.esc(e.nRt) + " est déjà dans le bordereau " + U.esc(e.bordereau || "") + ".");
            if (!O.estMoi(e.positionId)) return res(false, U.esc(e.nRt) + " n'est pas dans l'agence (" + U.esc(O.ETAPES[e.etape].label) + (e.positionId ? ", " + U.esc(O.agenceLib(e.positionId)) : "") + ").");
            return res(false, U.esc(e.nRt) + " ne peut pas être envoyée (" + U.esc(O.ETAPES[e.etape].label) + ").");
        }
        if (e.suspendu) return res(false, U.esc(e.nRt) + " est suspendue (" + U.esc(e.suspendu.motif) + ").");
        if (ong !== onglet) onglet = ong;
        $("#f-dest, #f-par, #f-dir, #f-nature, #f-du, #f-au").val(""); $("#q").val(""); dt.search = "";
        appliquer();
        var deja = !!dt.selected[e.id];
        dt.selected[e.id] = true; dt.refresh(); majSelection();
        var $tr = $("#dt-envoi tr[data-id='" + e.id + "']");
        if ($tr.length) { O.flash($tr); $tr[0].scrollIntoView({ block: "center" }); }
        res(true, U.esc(e.nRt) + (deja ? " déjà sélectionnée" : " ajoutée") + " · " + U.esc(O.agenceLib(e.agDestId)) + " · " + dt.getSelected().length + " en sélection");
    });

    /* Bordereau d'expédition (nouveau) */
    $("#btn-be").on("click", function () {
        var s = $.grep(dt.getSelected(), function (e) { return !e.suspendu; });
        if (s.length < dt.getSelected().length) U.toast("Les expéditions suspendues sont exclues.", "warning");
        L.modaleBordereau(s).done(function (r) {
            dt.clearSelection();
            U.toast("Bordereau d'expédition <b>" + U.esc(r.bordereau.numero) + "</b> généré" + (r.ok.length ? " : " + O.pl(r.ok.length, "expédition groupée", "expéditions groupées") : "") + ". <a href='bordereau.html?id=" + r.bordereau.id + "'>Voir le manifeste</a>", "success");
            if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning");
            charger();
        });
    });
    $("#sel-bordereau").on("change", majSelection);
    $("#btn-ajouter").on("click", function () {
        var b = $.grep(bords, function (x) { return String(x.id) === $("#sel-bordereau").val(); })[0], s = dt.getSelected();
        if (!b || !s.length) return;
        var $b = $(this); U.busy($b, true);
        O.grouper(b, $.map(s, function (e) { return e.id; })).done(function (r) {
            dt.clearSelection();
            U.toast(O.pl(r.ok.length, "expédition ajoutée", "expéditions ajoutées") + " au bordereau <b>" + U.esc(b.numero) + "</b>.", "success");
            if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning");
            charger();
        }).always(function () { U.busy($b, false); });
    });
    $("#btn-orienter").on("click", function () {
        var s = dt.getSelected();
        if (!s.length) return;
        var $b = $(this); U.busy($b, true);
        /* expédition locale : arrivée immédiate puis en agence (retrait) ou à mettre en livraison (domicile) */
        // TODO API : POST /exploitation/expeditions/reception-locale  { ids[] }
        O.avancerLot($.map(s, function (e) { return e.id; }), "ARRIVEE", { note: "Expédition locale : pas de transport", position: A.id }).then(function (ok) {
            var bureau = $.map($.grep(ok, function (e) { return (e.livraison || {}).mode !== "DOMICILE"; }), function (e) { return e.id; });
            return O.mettreEnAgence(bureau).then(function () { return ok; });
        }).done(function (ok) {
            dt.clearSelection();
            U.toast(O.pl(ok.length, "expédition orientée", "expéditions orientées") + " (en agence ou à mettre en livraison).", "success");
            charger();
        }).always(function () { U.busy($b, false); });
    });
    $("#btn-vider").on("click", function () { dt.clearSelection(); });

    $("#dt-envoi").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    function bordDe(el) { var id = $(el).closest("[data-b]").data("b"); return $.grep(bords, function (x) { return String(x.id) === String(id); })[0]; }
    $("#prepa").on("click", "[data-partir]", function () {
        O.modaleDepart(bordDe(this)).done(function (r) { U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> parti : " + O.pl(r.ok.length, "expédition en transit", "expéditions en transit") + ".", "success"); charger(); });
    });
    $("#prepa").on("click", "[data-retirer]", function () {
        O.retirerDuBordereau(bordDe(this), $(this).data("retirer")).done(function () { U.toast("Expédition retirée du bordereau.", "info"); charger(); });
    });
    $("#prepa").on("click", "[data-annuler-b]", function () {
        var b = bordDe(this);
        U.confirm({ title: "Annuler le bordereau", message: "Le bordereau <b>" + U.esc(b.numero) + "</b> est supprimé et ses " + O.pl(b.expeditionIds.length, "expédition redevient à envoyer", "expéditions redeviennent à envoyer") + ".", okText: "Annuler le bordereau", okClass: "cx-btn-danger", cancelText: "Retour" })
            .done(function () { O.annulerBordereau(b).done(function () { U.toast("Bordereau annulé.", "info"); charger(); }); });
    });
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); dt.clearSelection(); appliquer(); });
    $("#f-dest, #f-du, #f-au, #f-par, #f-dir, #f-nature").on("change", appliquer);

    charger();
    $("#scan").focus();
});

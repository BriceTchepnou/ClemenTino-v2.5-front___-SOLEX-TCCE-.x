/* =====================================================================
   Opérations · Groupage - départs (operations/groupage.html)
   ---------------------------------------------------------------------
   Colis ENREGISTRÉS dans l'agence (et colis en transit à réexpédier),
   regroupés par agence de destination ; sélection (cases ou douchette)
   -> création d'un bordereau (BRD-AAMMJJ-NNN, étape GROUPEE) ou ajout à
   un bordereau en préparation ; « Faire partir » -> EN_TRANSIT.
   Onglet « Locaux » : colis destinés à l'agence elle-même (urbain).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante();
    var tous = [], bords = [], f = null, onglet = "grouper", sel = {};

    O.selecteurAgence("#ox-agence-slot");

    function liste() { return onglet === "grouper" ? f.aGrouper : f.locaux; }
    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function selection() { return $.grep(liste(), function (e) { return sel[e.id]; }); }

    /* ------------------------------------------------------------------
       Rendu des groupes par destination
       ------------------------------------------------------------------ */
    function ligne(e) {
        var transit = O.enTransitIci(e);
        return "<tr data-id='" + e.id + "' class='" + (sel[e.id] ? "selected " : "") + (e.sla.retard ? "ox-retard" : "") + "'>" +
            "<td class='cx-col-check'><input type='checkbox' data-check" + (sel[e.id] ? " checked" : "") + " aria-label='Sélectionner " + U.esc(e.nRt) + "'></td>" +
            "<td><a href='#' class='cx-mono cx-strong' data-fiche>" + U.esc(e.nRt) + "</a>" + (e.nRtMan ? "<div class='cx-cell-sub'>Man. " + U.esc(e.nRtMan) + "</div>" : "") +
            (transit ? "<div><span class='cx-badge cx-badge-purple cx-no-dot'>Transit</span></div>" : "") + "</td>" +
            "<td class='cx-nowrap'>" + U.toFr(e.dateExp) + "<div class='cx-cell-sub'>" + (e.heure || "") + "</div></td>" +
            "<td>" + U.esc(e.expediteurInfo.nom) + (e.typeClient === "COMPTE" ? " <span class='cx-tag cx-tag-dark'>NATEX</span>" : "") + "</td>" +
            "<td>" + U.esc(e.destinataireInfo.nom) + "<div class='cx-cell-sub'>" + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div></td>" +
            "<td>" + U.esc(e.contenu || "") + "</td>" +
            "<td class='num cx-nowrap'>" + (e.nbColis || 1) + " · " + U.esc(G.kg(e.poids)) + "</td>" +
            "<td>" + (e.livraison.mode === "DOMICILE" ? "<i class='fa fa-home'></i> " + U.esc(e.livraison.quartier || "Domicile") : "<i class='fa fa-building-o'></i> Agence") + "</td>" +
            "<td>" + O.slaBadge(e) + "</td></tr>";
    }
    function rendre() {
        var q = U.normalize($.trim($("#q").val())), fd = $("#f-dest").val(), fm = $("#f-mode").val();
        var rows = $.grep(liste(), function (e) {
            if (fd && String(e.agDestId) !== fd) return false;
            if (fm && e.livraison.mode !== fm) return false;
            if (q && U.normalize([e.nRt, e.nRtMan, e.expediteurInfo.nom, e.destinataireInfo.nom, e.destinataireInfo.tel, e.contenu, e.villeDest].join(" ")).indexOf(q) < 0) return false;
            return true;
        });
        var grp = {}, cles = [];
        $.each(rows, function (_, e) {
            var k = String(e.agDestId || "0");
            if (!grp[k]) { grp[k] = []; cles.push(k); }
            grp[k].push(e);
        });
        cles.sort(function (a, b) { return grp[b].length - grp[a].length; });
        if (!cles.length) {
            $("#groupes").html("<div class='cx-empty'><i class='fa fa-cubes'></i><b>" + (onglet === "grouper" ? "Aucun colis à grouper" : "Aucun colis local") + "</b>" +
                (q || fd || fm ? "Modifiez les filtres." : "Les colis enregistrés au guichet de l'agence apparaissent ici.") + "</div>");
        } else {
            $("#groupes").html($.map(cles, function (k) {
                var g = grp[k], poids = 0, nb = 0, nsel = 0;
                $.each(g, function (_, e) { poids += Number(e.poids) || 0; nb += e.nbColis || 1; if (sel[e.id]) nsel++; });
                return "<section class='ox-groupe' data-groupe='" + k + "'><div class='ox-groupe-head'>" +
                    "<input type='checkbox' data-check-groupe" + (nsel === g.length ? " checked" : "") + " aria-label='Sélectionner tout le groupe'>" +
                    "<h4><i class='fa fa-map-marker'></i> " + U.esc(k === "0" ? "Destination inconnue" : O.agenceLib(k)) + "</h4>" +
                    "<small>" + O.pl(g.length, "LT") + " · " + O.pl(nb, "colis") + " · " + U.esc(G.kg(poids)) + "</small>" +
                    "<div class='ox-groupe-tools'>" + (nsel ? "<span class='cx-badge cx-badge-blue cx-no-dot'>" + nsel + " sélectionnée" + (nsel > 1 ? "s" : "") + "</span>" : "") +
                    (onglet === "grouper" && k !== "0" ? "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-bordereau-groupe><i class='fa fa-plus'></i> Bordereau pour ce groupe</button>" : "") + "</div></div>" +
                    "<div class='cx-table-wrap'><table class='cx-table'><thead><tr><th class='cx-col-check'></th><th>N° LT</th><th>Date exp.</th><th>Expéditeur</th><th>Destinataire</th><th>Contenu</th><th class='num'>Colis</th><th>Remise</th><th>SLA</th></tr></thead><tbody>" +
                    $.map(g, ligne).join("") + "</tbody></table></div></section>";
            }).join(""));
        }
        majSelection();
    }
    function majSelection() {
        var s = selection(), poids = 0, nb = 0, dest = {};
        $.each(s, function (_, e) { poids += Number(e.poids) || 0; nb += e.nbColis || 1; dest[e.agDestId] = (dest[e.agDestId] || 0) + 1; });
        $("#sel-sub").text(s.length ? O.pl(s.length, "LT sélectionnée", "LT sélectionnées") : "Aucun colis sélectionné");
        $("#sel-resume").html(s.length ? "<dl class='cx-dl ox-dl'><dt>Colis</dt><dd>" + nb + "</dd><dt>Poids</dt><dd>" + U.esc(G.kg(poids)) + "</dd><dt>Destinations</dt><dd>" +
            $.map(dest, function (n, k) { return U.esc(O.agenceLib(k)) + " (" + n + ")"; }).join("<br>") + "</dd></dl>" : "<p class='cx-muted'>Cochez des colis ou scannez leur n° de LT.</p>");
        $("#btn-creer, #btn-orienter").prop("disabled", !s.length);
        $("#btn-ajouter").prop("disabled", !s.length || !$("#sel-bordereau").val());
        $("#sel-grouper").toggleClass("cx-hidden", onglet !== "grouper");
        $("#sel-locaux").toggleClass("cx-hidden", onglet !== "locaux");
    }

    /* Bordereaux en préparation de l'agence */
    function rendrePrepa() {
        var prepa = $.grep(bords, function (b) { return b.statut === "PREPARE" && O.estMoi(b.agenceDepId); });
        $("#sel-bordereau").html("<option value=''>Choisir…</option>" + $.map(prepa, function (b) {
            return "<option value='" + b.id + "'>" + U.esc(b.numero + " → " + O.agenceLib(b.agenceDestId)) + "</option>";
        }).join(""));
        $("#bloc-ajouter").toggleClass("cx-hidden", !prepa.length);
        $("#prepa").html(prepa.length ? $.map(prepa, function (b) {
            var lignes = $.map(b.expeditionIds, function (id) {
                var e = parId(id);
                return e ? "<li class='ox-flex'><span class='cx-mono'>" + U.esc(e.nRt) + "</span><span class='cx-muted ox-grow'>" + U.esc(e.destinataireInfo.nom) + "</span>" +
                    "<button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-retirer='" + e.id + "' title='Retirer du bordereau'><i class='fa fa-times'></i></button></li>" : "";
            }).join("");
            return "<div class='ox-bcard' data-b='" + b.id + "' style='margin-bottom:10px'><div class='ox-bcard-top'><a class='ox-bcard-num' href='bordereau.html?id=" + b.id + "'>" + U.esc(b.numero) + "</a>" + O.badge(O.STATUT_BORDEREAU, b.statut) + "</div>" +
                "<div class='ox-bcard-route'><i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(O.agenceLib(b.agenceDestId)) + "</div>" +
                "<div class='ox-bcard-meta'><span><i class='fa fa-cube'></i> " + O.pl(b.expeditionIds.length, "colis") + "</span><span><i class='fa fa-truck'></i> " + U.esc((b.vehicule || {}).immatriculation || "—") + "</span><span><i class='fa fa-user'></i> " + U.esc((b.chauffeur || {}).nom || "—") + "</span></div>" +
                "<details><summary class='cx-muted' style='cursor:pointer;font-size:12px'>Contenu du bordereau</summary><ul class='list-unstyled' style='margin:6px 0 0;font-size:12px'>" + lignes + "</ul></details>" +
                "<div class='ox-bcard-actions'><a class='cx-btn cx-btn-ghost cx-btn-xs' href='bordereau.html?id=" + b.id + "'><i class='fa fa-print'></i> Manifeste</a>" +
                "<button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-partir><i class='fa fa-road'></i> Faire partir</button>" +
                "<button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-annuler-b><i class='fa fa-trash-o'></i> Annuler</button></div></div>";
        }).join("") : "<p class='cx-muted' style='margin:0'>Aucun bordereau en préparation.</p>");
    }

    function charger() {
        return O.charger().done(function (exps, b) {
            tous = exps; bords = b; f = O.files(exps, bords);
            /* purge de la sélection des colis qui ne sont plus groupables */
            var ids = {}; $.each(f.aGrouper.concat(f.locaux), function (_, e) { ids[e.id] = true; });
            $.each($.extend({}, sel), function (id) { if (!ids[id]) delete sel[id]; });
            $("#n-grouper").text(f.aGrouper.length); $("#n-locaux").text(f.locaux.length);
            var dests = {}; $.each(liste(), function (_, e) { if (e.agDestId) dests[e.agDestId] = true; });
            var cur = $("#f-dest").val();
            $("#f-dest").html("<option value=''>Toutes</option>" + $.map(dests, function (_, k) { return "<option value='" + k + "'>" + U.esc(O.agenceLib(k)) + "</option>"; }).join("")).val(cur && dests[cur] ? cur : "");
            rendrePrepa();
            rendre();
        });
    }

    /* ------------------------------------------------------------------
       Sélection : cases, groupe, douchette
       ------------------------------------------------------------------ */
    $("#groupes").on("change", "input[data-check]", function () {
        var id = $(this).closest("tr").data("id");
        if (this.checked) sel[id] = true; else delete sel[id];
        rendre();
    });
    $("#groupes").on("change", "input[data-check-groupe]", function () {
        var on = this.checked;
        $(this).closest(".ox-groupe").find("tbody tr").each(function () { var id = $(this).data("id"); if (on) sel[id] = true; else delete sel[id]; });
        rendre();
    });
    $("#groupes").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    $("#groupes").on("click", "[data-bordereau-groupe]", function () {
        var $g = $(this).closest(".ox-groupe");
        sel = {};
        $g.find("tbody tr").each(function () { sel[$(this).data("id")] = true; });
        rendre();
        modaleCreation($g.data("groupe"));
    });
    O.scanner("#scan", function (code) {
        var brut = O.chercherLt(code), e = brut ? parId(brut.id) : null, $r = $("#scan-res");
        function res(ok, msg) { $r.removeClass("ok ko").addClass(ok ? "ok" : "ko").html("<i class='fa " + (ok ? "fa-check" : "fa-times") + "'></i> " + msg); O.bip(ok); }
        if (!e) return res(false, "LT « " + U.esc(code) + " » introuvable.");
        var dans = function (l) { return $.grep(l, function (x) { return x.id === e.id; }).length > 0; };
        var ong = dans(f.aGrouper) ? "grouper" : dans(f.locaux) ? "locaux" : null;
        if (!ong) {
            if (e.etape === "GROUPEE") return res(false, U.esc(e.nRt) + " est déjà dans le bordereau " + U.esc(e.bordereau || "") + ".");
            if (!O.estMoi(e.positionId)) return res(false, U.esc(e.nRt) + " n'est pas dans l'agence (" + U.esc(O.ETAPES[e.etape].label) + (e.positionId ? ", " + U.esc(O.agenceLib(e.positionId)) : "") + ").");
            return res(false, U.esc(e.nRt) + " n'est pas groupable (" + U.esc(O.ETAPES[e.etape].label) + ").");
        }
        if (ong !== onglet) { onglet = ong; $("#onglets a").removeClass("active").filter("[data-tab='" + ong + "']").addClass("active"); }
        $("#f-dest").val(""); $("#f-mode").val(""); $("#q").val("");
        var deja = !!sel[e.id];
        sel[e.id] = true;
        rendre();
        var $tr = $("#groupes tr[data-id='" + e.id + "']");
        if ($tr.length) { O.flash($tr); $tr[0].scrollIntoView({ block: "center" }); }
        res(true, U.esc(e.nRt) + (deja ? " déjà sélectionnée" : " ajoutée") + " · " + U.esc(O.agenceLib(e.agDestId)) + " · " + selection().length + " en sélection");
    });

    /* ------------------------------------------------------------------
       Création d'un bordereau
       ------------------------------------------------------------------ */
    function modaleCreation(destDefaut) {
        var s = selection();
        if (!s.length) return;
        var compte = {}, best = null;
        $.each(s, function (_, e) { compte[e.agDestId] = (compte[e.agDestId] || 0) + 1; if (!best || compte[e.agDestId] > compte[best]) best = e.agDestId; });
        var dest = destDefaut || best, v = O.VEHICULES[0], c = O.CHAUFFEURS[0];
        var corps = "<p class='cx-muted' style='margin-top:0'>" + O.pl(s.length, "LT") + " au départ de <b>" + U.esc(O.agenceLib(A.id)) + "</b>.</p>" +
            "<div class='ox-grid-2'>" +
            O.champ("cb-dest", "Agence de destination du bordereau", "<select class='form-control' id='cb-dest'>" + O.optionsAgences(dest) + "</select>", true) +
            O.champ("cb-date", "Départ prévu le", "<div class='ox-flex'><input type='date' class='form-control ox-grow' id='cb-date' value='" + U.today() + "'><input type='time' class='form-control' id='cb-heure' style='width:110px' value='18:00'></div>", true) +
            O.champ("cb-type", "Véhicule", "<select class='form-control' id='cb-type'>" + O.options(CX.REF.TYPES_VEHICULE, v.type) + "</select>") +
            O.champ("cb-immat", "Immatriculation", "<input type='text' class='form-control cx-mono' id='cb-immat' maxlength='15' placeholder='" + U.esc(v.immatriculation) + "'>") +
            O.champ("cb-chauffeur", "Chauffeur", "<input type='text' class='form-control' id='cb-chauffeur' maxlength='60' list='cb-chauffeurs' placeholder='" + U.esc(c.nom) + "'><datalist id='cb-chauffeurs'>" +
                $.map(O.CHAUFFEURS, function (x) { return "<option value='" + U.esc(x.nom) + "'>"; }).join("") + "</datalist>") +
            O.champ("cb-scelle", "N° de scellé", "<input type='text' class='form-control cx-mono' id='cb-scelle' maxlength='20'>", false, "Peut être renseigné au départ.") +
            "</div>" + O.champ("cb-obs", "Observations", "<input type='text' class='form-control' id='cb-obs' maxlength='200'>") +
            "<div id='cb-alerte'></div>";
        var $m = O.modale("ox-creer", "Nouveau bordereau de départ", "fa-truck", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='cb-ok'><i class='fa fa-check'></i> Créer le bordereau</button>");
        function alerte() {
            var d = $("#cb-dest").val(), autres = $.grep(s, function (e) { return String(e.agDestId) !== String(d); });
            $("#cb-alerte").html(String(d) === String(A.id) ? "<div class='cx-note cx-note-err'><i class='fa fa-times-circle'></i><div>La destination ne peut pas être l'agence de départ.</div></div>" :
                autres.length ? "<div class='cx-note cx-note-warn'><i class='fa fa-random'></i><div>" + O.pl(autres.length, "LT a", "LT ont") + " une autre destination finale : " +
                    "elles transiteront par " + U.esc(O.agenceLib(d)) + " et y seront réexpédiées.</div></div>" : "");
        }
        $m.on("change", "#cb-dest", alerte);
        $m.on("shown.bs.modal", alerte);
        $m.on("click", "#cb-ok", function () {
            O.effacerErreurs($m);
            var d = O.agence($("#cb-dest").val());
            if (!d || d.id === A.id) return O.erreurChamp($m, "#cb-dest", "Choisissez une autre agence.");
            var date = $("#cb-date").val() || U.today();
            var $b = $(this); U.busy($b, true);
            var ch = $.trim($("#cb-chauffeur").val()), connu = $.grep(O.CHAUFFEURS, function (x) { return x.nom === ch; })[0];
            var b = {
                numero: O.numeroBordereau(date), date: date, heure: $("#cb-heure").val() || "",
                agenceDepId: A.id, villeDep: A.ville, agenceDep: A.nom, agenceDestId: d.id, villeDest: d.ville, agenceDest: d.nom,
                vehicule: { type: $("#cb-type").val(), immatriculation: $.trim($("#cb-immat").val()) }, chauffeur: { nom: ch, tel: connu ? connu.tel : "" },
                scelle: $.trim($("#cb-scelle").val()), expeditionIds: [], statut: "PREPARE", dateDepart: null, dateArrivee: null, dateCloture: null,
                recus: [], ecarts: [], observations: $.trim($("#cb-obs").val()),
                historique: [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Bordereau créé" }]
            };
            // TODO API : POST /exploitation/bordereaux  { agenceDestId, date, heure, vehicule, chauffeur, scelle, observations, expeditionIds[] }  (n° attribué par le serveur)
            CX.api.save("bordereaux", b).then(function (bb) { return O.grouper(bb, $.map(s, function (e) { return e.id; })); }).done(function (r) {
                sel = {};
                $m.modal("hide");
                U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> créé : " + O.pl(r.ok.length, "colis groupé", "colis groupés") + "." +
                    " <a href='bordereau.html?id=" + r.bordereau.id + "'>Voir le manifeste</a>", "success");
                if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning");
                charger();
            }).fail(function (m) { U.busy($b, false); U.toast(U.esc(m || "Création impossible."), "error"); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    $("#btn-creer").on("click", function () { modaleCreation(null); });
    $("#sel-bordereau").on("change", majSelection);
    $("#btn-ajouter").on("click", function () {
        var b = $.grep(bords, function (x) { return String(x.id) === $("#sel-bordereau").val(); })[0], s = selection();
        if (!b || !s.length) return;
        var $b = $(this); U.busy($b, true);
        O.grouper(b, $.map(s, function (e) { return e.id; })).done(function (r) {
            sel = {};
            U.toast(O.pl(r.ok.length, "colis ajouté", "colis ajoutés") + " au bordereau <b>" + U.esc(b.numero) + "</b>.", "success");
            charger();
        }).always(function () { U.busy($b, false); });
    });
    $("#btn-orienter").on("click", function () {
        var s = selection();
        if (!s.length) return;
        var $b = $(this); U.busy($b, true);
        /* colis local : arrivée immédiate dans l'agence, puis mise en instance (retrait) ou file « à livrer » (domicile) */
        // TODO API : POST /exploitation/expeditions/mise-en-agence  { ids[] }
        O.avancerLot($.map(s, function (e) { return e.id; }), "ARRIVEE", { note: "Colis local : pas de transport", position: A.id }).then(function (ok) {
            var bureau = $.map($.grep(ok, function (e) { return (e.livraison || {}).mode !== "DOMICILE"; }), function (e) { return e.id; });
            return O.avancerLot(bureau, "EN_INSTANCE", { note: "Mis en agence, en attente de retrait", position: A.id }).then(function () { return ok; });
        }).done(function (ok) {
            sel = {};
            U.toast(O.pl(ok.length, "colis orienté", "colis orientés") + " (en agence ou à livrer).", "success");
            charger();
        }).always(function () { U.busy($b, false); });
    });
    $("#btn-vider").on("click", function () { sel = {}; rendre(); });

    /* Bordereaux en préparation : départ, retrait, annulation */
    $("#prepa").on("click", "[data-partir]", function () {
        var b = $.grep(bords, function (x) { return String(x.id) === String($(this).closest("[data-b]").data("b")); }.bind(this))[0];
        if (!b) return;
        O.modaleDepart(b).done(function (r) {
            U.toast("Bordereau <b>" + U.esc(r.bordereau.numero) + "</b> parti : " + O.pl(r.ok.length, "colis en transit", "colis en transit") + ".", "success");
            charger();
        });
    });
    $("#prepa").on("click", "[data-retirer]", function () {
        var id = $(this).data("retirer"), b = $.grep(bords, function (x) { return String(x.id) === String($(this).closest("[data-b]").data("b")); }.bind(this))[0];
        O.retirerDuBordereau(b, id).done(function () { U.toast("Colis retiré du bordereau.", "info"); charger(); });
    });
    $("#prepa").on("click", "[data-annuler-b]", function () {
        var b = $.grep(bords, function (x) { return String(x.id) === String($(this).closest("[data-b]").data("b")); }.bind(this))[0];
        U.confirm({ title: "Annuler le bordereau", message: "Le bordereau <b>" + U.esc(b.numero) + "</b> est supprimé et ses " + O.pl(b.expeditionIds.length, "colis redevient groupable", "colis redeviennent groupables") + ".", okText: "Annuler le bordereau", okClass: "cx-btn-danger", cancelText: "Retour" })
            .done(function () { O.annulerBordereau(b).done(function () { U.toast("Bordereau annulé.", "info"); charger(); }); });
    });

    $("#onglets").on("click", "a", function () {
        onglet = $(this).data("tab");
        $("#onglets a").removeClass("active"); $(this).addClass("active");
        charger();
    });
    $("#f-dest, #f-mode").on("change", rendre);
    $("#q").on("input", U.debounce(rendre, 150));

    charger();
    $("#scan").focus();
});

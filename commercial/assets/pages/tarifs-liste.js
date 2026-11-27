/* =====================================================================
   Commercial · Tarifaires (tarifs-liste.html[#grilles|#groupes|#contrats])
   ---------------------------------------------------------------------
   Indicateurs + 3 onglets :
     - Grilles tarifaires : modifier, dupliquer, simuler, activer / archiver,
       affecter (modale), supprimer (si non utilisée)
     - Groupes de clients : création / modification en modale (Select2
       multiple des clients + grille du groupe), suppression
     - Contrats clients : statut calculé à la date du jour, échéances,
       résiliation, suppression
   ===================================================================== */
$(function () {
    var U = CX.util, T = CX.tarifs, today = U.today(), dans30 = U.addDays(today, 30);
    var data = { grilles: [], groupes: [], contrats: [], clients: [] };
    var dtG, dtGr, dtC;

    function nomClient(id) { var c = $.grep(data.clients, function (x) { return x.id == id; })[0]; return c ? c.raisonSociale : "Client #" + id; }
    function grille(id) { return $.grep(data.grilles, function (g) { return String(g.id) === String(id); })[0] || null; }
    function groupe(id) { return $.grep(data.groupes, function (g) { return String(g.id) === String(id); })[0] || null; }
    /* grilles affectées à un groupe */
    function grillesDuGroupe(gid) {
        return $.grep(data.grilles, function (g) { return $.inArray(Number(gid), (g.affectation || {}).groupeIds || []) >= 0; });
    }
    function contratsDeGrille(id) { return $.grep(data.contrats, function (c) { return String(c.tarifaireId) === String(id); }); }

    /* =================================================================
       Chargement
       ================================================================= */
    function charger() {
        // TODO API : GET /commercial/tarifs | /commercial/groupes-clients | /commercial/contrats | /commercial/clients?champs=id,code,raisonSociale
        return $.when(CX.api.list("tarifaires"), CX.api.list("groupesClients"), CX.api.list("contrats"), CX.api.list("clients"))
            .done(function (g, gr, c, cl) {
                data.grilles = g; data.groupes = gr; data.contrats = c; data.clients = cl;
                rendre();
            });
    }
    function rendre() {
        rendreKpis();
        filtrerGrilles();
        dtGr.setRows(data.groupes);
        filtrerContrats();
        $("#n-grilles").text(data.grilles.length);
        $("#n-groupes").text(data.groupes.length);
        $("#n-contrats").text(data.contrats.length);
    }

    /* =================================================================
       Indicateurs
       ================================================================= */
    function rendreKpis() {
        var actives = $.grep(data.grilles, function (g) { return T.estValide(g, today); });
        var brouillons = $.grep(data.grilles, function (g) { return g.statut === "BROUILLON"; });
        var ctrActifs = $.grep(data.contrats, function (c) { return T.statutContrat(c, today) === "ACTIF"; });
        var echeance = $.grep(ctrActifs, function (c) { return c.au && c.au <= dans30; });
        /* clients couverts par un tarif spécifique (contrat, grille propre, groupe) */
        var couverts = $.grep(data.clients, function (c) { var r = T.resoudre(c.id, today); return r.origine && r.origine !== "STANDARD"; });
        var std = T.grilleStandard(today);
        $("#kpis").html([
            kpi("Grilles en vigueur", actives.length, brouillons.length + " brouillon" + (brouillons.length > 1 ? "s" : "") + " · " +
                (data.grilles.length - actives.length - brouillons.length) + " archivée(s) / hors période", "fa-table", "", "grilles"),
            kpi("Grille standard", std ? "<span style='font-size:15px'>" + U.esc(std.code) + "</span>" : "—", std ? U.esc(std.nom) : "<span style='color:var(--cx-red)'>aucune grille standard active</span>", "fa-globe", std ? "green" : "red", "grilles"),
            kpi("Clients à tarif spécifique", couverts.length, "sur " + data.clients.length + " comptes (contrat, grille, groupe)", "fa-user", "purple", "groupes"),
            kpi("Contrats en vigueur", ctrActifs.length, data.contrats.length + " contrat(s) au total", "fa-file-text-o", "", "contrats"),
            kpi("Échéance sous 30 jours", echeance.length, echeance.length ? "à renouveler avant le " + U.toFr(dans30) : "aucun renouvellement proche", "fa-hourglass-half", echeance.length ? "orange" : "", "contrats-echeance")
        ].join(""));
    }
    function kpi(label, value, foot, icon, color, cible) {
        return "<div class='cx-kpi clickable " + color + "' data-goto='" + cible + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    $("#kpis").on("click", ".cx-kpi", function () {
        var g = $(this).data("goto");
        if (g === "contrats-echeance") { $("#f-ctr-echeance").prop("checked", true); filtrerContrats(); g = "contrats"; }
        ouvrirOnglet(g);
    });

    /* =================================================================
       Menus d'actions (positionnés en « fixed » : la zone du tableau défile)
       ================================================================= */
    function menu(items) {
        return "<div class='dropdown cx-actions'><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-toggle='dropdown' aria-haspopup='true' title='Actions'><i class='fa fa-ellipsis-v'></i></button>" +
            "<ul class='dropdown-menu dropdown-menu-right' style='min-width:230px;z-index:1050'>" + $.map(items, function (it) {
                if (it === "-") return "<li class='divider'></li>";
                if (!it) return null;
                return "<li class='" + (it.disabled ? "disabled" : "") + "'><a href='" + (it.href || "#") + "'" + (it.act ? " data-act='" + it.act + "'" : "") +
                    (it.danger ? " class='text-danger'" : "") + (it.title ? " title='" + U.esc(it.title) + "'" : "") + "><i class='fa " + it.icon + "'></i> " + it.label + "</a></li>";
            }).join("") + "</ul></div>";
    }
    function placerMenu(dd) {
        var $m = $(dd).find(".dropdown-menu"), r = $(dd).find("[data-toggle='dropdown']")[0].getBoundingClientRect();
        var h = $m.outerHeight(), w = $m.outerWidth(), top = r.bottom + 4;
        if (top + h > window.innerHeight - 40 && r.top - h - 4 > 0) top = r.top - h - 4;
        $m.css({ position: "fixed", top: top, left: Math.max(8, r.right - w), right: "auto", bottom: "auto" });
    }
    $(".cx-card").on("shown.bs.dropdown", ".cx-actions", function () { placerMenu(this); })
        .on("hidden.bs.dropdown", ".cx-actions", function () { $(this).find(".dropdown-menu").css({ position: "", top: "", left: "", right: "", bottom: "" }); });
    $(window).on("scroll resize", function () { $(".cx-actions.open").each(function () { placerMenu(this); }); });

    /* =================================================================
       Onglet Grilles
       ================================================================= */
    $("#f-type").html("<option value=''>Tous</option>" + $.map(T.TYPES_GRILLE, function (t, k) { return "<option value='" + k + "'>" + t.label + "</option>"; }).join(""));
    $("#f-statut").html("<option value=''>Tous</option>" + $.map(T.STATUTS_GRILLE, function (t, k) { return "<option value='" + k + "'>" + t.label + "</option>"; }).join(""));

    function affectationTxt(g) {
        if (g.type === "STANDARD") return "<span class='tf-aff'>Tous les clients <b>sans tarif spécifique</b></span>";
        var a = g.affectation || {}, parts = [];
        var cl = $.map(a.clientIds || [], nomClient), gr = $.map(a.groupeIds || [], function (id) { var x = groupe(id); return x ? x.nom : null; });
        var ctr = contratsDeGrille(g.id);
        if (cl.length) parts.push("<i class='fa fa-user'></i> <b>" + U.esc(cl.slice(0, 2).join(", ")) + "</b>" + (cl.length > 2 ? " +" + (cl.length - 2) : ""));
        if (gr.length) parts.push("<i class='fa fa-users'></i> <b>" + U.esc(gr.join(", ")) + "</b>");
        if (ctr.length) parts.push("<i class='fa fa-file-text-o'></i> " + ctr.length + " contrat" + (ctr.length > 1 ? "s" : ""));
        return parts.length ? "<span class='tf-aff'>" + parts.join("<br>") + "</span>" : "<span class='cx-badge cx-badge-orange'>Non affectée</span>";
    }
    dtG = new CX.DataTable("#dt-grilles", {
        pageSize: 25, sortKey: "code", sortDir: 1, searchInput: "#q-grilles",
        emptyText: "Aucune grille tarifaire", emptyIcon: "fa-table",
        columns: [
            {
                key: "code", title: "Grille",
                searchValue: function (g) { return g.code + " " + g.nom + " " + (g.description || ""); },
                render: function (g) {
                    var base = g.baseId ? grille(g.baseId) : null;
                    return "<a class='cx-cell-main' href='tarif-form.html?id=" + g.id + "'>" + U.esc(g.nom) + "</a>" +
                        "<div class='cx-cell-sub'><span class='cx-mono'>" + U.esc(g.code) + "</span>" +
                        (base ? " · base " + U.esc(base.code) + (g.remiseBasePct ? (g.remiseBasePct > 0 ? " −" : " +") + U.fmt(Math.abs(g.remiseBasePct), g.remiseBasePct % 1 ? 1 : 0) + " %" : "") : "") + "</div>";
                }
            },
            {
                key: "type", title: "Type", searchValue: function (g) { return T.TYPES_GRILLE[g.type].label; },
                render: function (g) { var t = T.TYPES_GRILLE[g.type]; return "<span class='cx-badge cx-badge-" + t.color + " cx-no-dot'><i class='fa " + t.icon + "'></i> " + t.label + "</span>"; }
            },
            {
                key: "regles", title: "Règles", sortValue: function (g) { return (g.regles || []).length; },
                searchValue: function (g) { return $.map(g.regles || [], function (r) { return r.libelle + " " + T.MODELES[r.modele].label; }).join(" "); },
                render: function (g) {
                    var vus = {}, tags = [];
                    $.each(g.regles || [], function (_, r) { if (!vus[r.modele]) { vus[r.modele] = 1; tags.push("<span class='cx-tag' data-toggle='tooltip' title='" + U.esc(T.MODELES[r.modele].label) + "'><i class='fa " + T.MODELES[r.modele].icon + "'></i></span>"); } });
                    return "<b>" + (g.regles || []).length + "</b> <div class='tf-modeles' style='display:inline-flex'>" + tags.join("") + "</div>";
                }
            },
            { key: "du", title: "Validité", render: function (g) { return T.libValidite(g).replace(/^./, function (c) { return c.toUpperCase(); }) + (g.statut === "ACTIVE" && !T.estValide(g, today) ? "<div class='cx-cell-sub' style='color:var(--cx-orange)'>hors période aujourd'hui</div>" : ""); } },
            {
                key: "affectation", title: "Affectation", sortable: false,
                searchValue: function (g) { var a = g.affectation || {}; return $.map(a.clientIds || [], nomClient).join(" ") + " " + $.map(a.groupeIds || [], function (id) { var x = groupe(id); return x ? x.nom : ""; }).join(" "); },
                render: affectationTxt
            },
            { key: "statut", title: "Statut", searchValue: function (g) { return T.STATUTS_GRILLE[g.statut].label; }, render: function (g) { return T.badge(T.STATUTS_GRILLE, g.statut); } },
            {
                key: "actions", title: "", sortable: false, className: "cx-right",
                render: function (g) {
                    var utilisee = T.estUtilisee(g.id);
                    return menu([
                        { href: "tarif-form.html?id=" + g.id, icon: "fa-pencil", label: "Modifier" },
                        { href: "tarif-form.html?id=" + g.id + "#simulateur", icon: "fa-calculator", label: "Simuler un envoi" },
                        { act: "dupliquer", icon: "fa-clone", label: "Dupliquer" },
                        g.type !== "STANDARD" ? { act: "affecter", icon: "fa-share-alt", label: "Affecter à des clients / groupes" } : null,
                        "-",
                        g.statut !== "ACTIVE" ? { act: "activer", icon: "fa-check-circle", label: "Activer" } : { act: "archiver", icon: "fa-archive", label: "Archiver" },
                        { act: "supprimer", icon: "fa-trash-o", label: "Supprimer", danger: !utilisee, disabled: utilisee, title: utilisee ? "Grille utilisée (contrat, affectation ou grille de base)" : "" }
                    ]);
                }
            }
        ],
        rowClass: function (g) { return g.statut === "ARCHIVEE" ? "cx-row-muted" : ""; }
    });
    function filtrerGrilles() {
        var t = $("#f-type").val(), s = $("#f-statut").val();
        dtG.setRows($.grep(data.grilles, function (g) { return (!t || g.type === t) && (!s || g.statut === s); }));
    }
    $("#f-type, #f-statut").on("change", filtrerGrilles);

    $("#dt-grilles").on("click", "[data-act]", function (e) {
        e.preventDefault();
        if ($(this).parent().hasClass("disabled")) { U.toast(U.esc($(this).attr("title") || "Action indisponible."), "warning"); return; }
        var g = grille($(this).closest("tr").data("id")), act = $(this).data("act");
        if (!g) return;
        if (act === "dupliquer") dupliquer(g);
        if (act === "affecter") ouvrirAffectation(g);
        if (act === "activer" || act === "archiver") changerStatut(g, act === "activer" ? "ACTIVE" : "ARCHIVEE");
        if (act === "supprimer") supprimerGrille(g);
    });

    function dupliquer(g) {
        var copie = T.clone(g);
        delete copie.id; delete copie.code; delete copie.numero;
        $.extend(copie, {
            nom: "Copie de " + g.nom, statut: "BROUILLON", affectation: { clientIds: [], groupeIds: [] },
            dateCreation: null, historique: [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Grille dupliquée depuis " + g.code }]
        });
        // TODO API : POST /commercial/tarifs/{id}/dupliquer
        CX.api.save("tarifaires", copie).done(function (s) {
            T.flash("Grille <b>" + U.esc(g.code) + "</b> dupliquée en <b>" + U.esc(s.code) + "</b> (brouillon, non affectée).");
            location.href = "tarif-form.html?id=" + s.id;
        });
    }
    function changerStatut(g, statut) {
        var msg, concurrentes = [];
        if (statut === "ACTIVE") {
            var errs = $.map(g.regles || [], function (r, i) { var e = T.verifierRegle(r); return e.length ? "Règle " + (i + 1) + " : " + e.join(", ") : null; });
            if ((!g.regles || !g.regles.length) && !g.baseId) errs.push("aucune règle ni grille de base");
            if (errs.length) { U.toast("Grille incomplète : " + U.esc(errs.join(" ; ")) + ". <a href='tarif-form.html?id=" + g.id + "' style='color:#93c5fd'>Compléter</a>", "error"); return; }
            if (g.type === "STANDARD") concurrentes = $.grep(data.grilles, function (x) {
                return x.type === "STANDARD" && x.statut === "ACTIVE" && x.id !== g.id && (!x.au || !g.du || x.au >= g.du) && (!g.au || !x.du || g.au >= x.du);
            });
            msg = "<p>La grille <b>" + U.esc(g.nom) + "</b> sera appliquée " + T.libValidite(g) + ".</p>" +
                (concurrentes.length ? "<p class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><span>La grille standard <b>" + U.esc(concurrentes[0].nom) + "</b> sera archivée.</span></p>" : "");
        } else {
            var u = T.utilisation(g.id), actifs = $.grep(u.contrats, function (c) { return T.statutContrat(c, today) === "ACTIF"; });
            msg = "<p>La grille <b>" + U.esc(g.nom) + "</b> ne sera plus appliquée.</p>" +
                (actifs.length ? "<p class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><span>" + actifs.length + " contrat(s) en vigueur l'utilisent : leurs clients basculeront sur leur groupe ou la grille standard.</span></p>" : "") +
                (g.type === "STANDARD" ? "<p class='cx-note cx-note-err'><i class='fa fa-ban'></i><span>Sans grille standard active, les clients sans tarif spécifique n'auront plus de tarif automatique.</span></p>" : "");
        }
        U.confirm({ title: statut === "ACTIVE" ? "Activer la grille" : "Archiver la grille", message: msg, okText: statut === "ACTIVE" ? "Activer" : "Archiver", okClass: statut === "ACTIVE" ? "cx-btn-success" : "cx-btn-danger" })
            .done(function () {
                // TODO API : POST /commercial/tarifs/{id}/activer | /archiver
                CX.api.patchMany("tarifaires", $.map(concurrentes, function (x) { return x.id; }), { statut: "ARCHIVEE" })
                    .then(function () { return CX.api.patchMany("tarifaires", [g.id], { statut: statut }); })
                    .then(function () { return CX.api.log("tarifaires", g.id, statut === "ACTIVE" ? "Grille activée" : "Grille archivée"); })
                    .done(function () { U.toast("Grille <b>" + U.esc(g.code) + "</b> " + (statut === "ACTIVE" ? "activée." : "archivée."), statut === "ACTIVE" ? "success" : "warning"); charger(); });
            });
    }
    function supprimerGrille(g) {
        U.confirm({ title: "Supprimer la grille", message: "La grille <b>" + U.esc(g.code + " · " + g.nom) + "</b> sera définitivement supprimée.", okText: "Supprimer", okClass: "cx-btn-danger" })
            .done(function () {
                // TODO API : DELETE /commercial/tarifs/{id}  (refusé côté serveur si la grille est utilisée)
                CX.api.remove("tarifaires", g.id).done(function () { U.toast("Grille supprimée.", "warning"); charger(); });
            });
    }

    /* ----- Affectation (modale) ----- */
    var affGrille = null;
    function optionsClients() { return $.map(data.clients, function (c) { return "<option value='" + c.id + "'>" + U.esc(c.raisonSociale) + " (" + U.esc(c.code) + ")</option>"; }).join(""); }
    function optionsGroupes() { return $.map(data.groupes, function (g) { return "<option value='" + g.id + "'>" + U.esc(g.nom) + "</option>"; }).join(""); }
    function ouvrirAffectation(g) {
        affGrille = g;
        var a = g.affectation || {};
        $("#ma-grille").html("Grille <b>" + U.esc(g.code + " · " + g.nom) + "</b> (" + T.TYPES_GRILLE[g.type].label.toLowerCase() + ")");
        $("#ma-clients").html(optionsClients()).val($.map(a.clientIds || [], String));
        $("#ma-groupes").html(optionsGroupes()).val($.map(a.groupeIds || [], String));
        $("#m-affecter").modal("show");
    }
    $("#m-affecter").on("shown.bs.modal", function () {
        $("#ma-clients").select2({ width: "100%", dropdownParent: $("#m-affecter"), placeholder: "Aucun client", closeOnSelect: false });
        $("#ma-groupes").select2({ width: "100%", dropdownParent: $("#m-affecter"), placeholder: "Aucun groupe", closeOnSelect: false });
    });
    $("#ma-save").on("click", function () {
        if (!affGrille) return;
        var aff = { clientIds: $.map($("#ma-clients").val() || [], Number), groupeIds: $.map($("#ma-groupes").val() || [], Number) };
        // TODO API : PUT /commercial/tarifs/{id}/affectation  { clientIds, groupeIds }
        CX.api.patchMany("tarifaires", [affGrille.id], { affectation: aff })
            .then(function () { return CX.api.log("tarifaires", affGrille.id, "Affectation : " + aff.clientIds.length + " client(s), " + aff.groupeIds.length + " groupe(s)"); })
            .done(function () { $("#m-affecter").modal("hide"); U.toast("Affectation enregistrée."); charger(); });
    });

    /* =================================================================
       Onglet Groupes de clients
       ================================================================= */
    dtGr = new CX.DataTable("#dt-groupes", {
        pageSize: 25, sortKey: "nom", sortDir: 1, searchInput: "#q-groupes",
        emptyText: "Aucun groupe de clients", emptyIcon: "fa-users",
        columns: [
            { key: "nom", title: "Groupe", render: function (g) { return "<span class='cx-cell-main'>" + U.esc(g.nom) + "</span><div class='cx-cell-sub'><span class='cx-mono'>" + U.esc(g.code || "") + "</span>" + (g.description ? " · " + U.esc(g.description) : "") + "</div>"; } },
            {
                key: "clients", title: "Clients", sortValue: function (g) { return (g.clientIds || []).length; },
                searchValue: function (g) { return $.map(g.clientIds || [], nomClient).join(" "); },
                render: function (g) {
                    var n = (g.clientIds || []).length;
                    return "<b>" + n + "</b> client" + (n > 1 ? "s" : "") + "<div class='tf-chips' style='margin-top:4px'>" + $.map((g.clientIds || []).slice(0, 4), function (id) {
                        return "<a class='cx-tag' href='client-fiche.html?id=" + id + "#tarif'>" + U.esc(nomClient(id)) + "</a>";
                    }).join("") + (n > 4 ? "<span class='cx-tag'>+" + (n - 4) + "</span>" : "") + "</div>";
                }
            },
            {
                key: "grille", title: "Grille du groupe", sortable: false,
                searchValue: function (g) { return $.map(grillesDuGroupe(g.id), function (x) { return x.nom; }).join(" "); },
                render: function (g) {
                    var gs = grillesDuGroupe(g.id);
                    return gs.length ? $.map(gs, function (x) {
                        return "<a href='tarif-form.html?id=" + x.id + "'>" + U.esc(x.nom) + "</a> " + T.badge(T.STATUTS_GRILLE, x.statut);
                    }).join("<br>") : "<span class='cx-badge cx-badge-grey'>Aucune · grille standard</span>";
                }
            },
            {
                key: "actions", title: "", sortable: false, className: "cx-right",
                render: function () {
                    return menu([{ act: "modifier", icon: "fa-pencil", label: "Modifier" }, "-", { act: "supprimer", icon: "fa-trash-o", label: "Supprimer", danger: true }]);
                }
            }
        ]
    });
    var grEdit = null;
    function ouvrirGroupe(g) {
        grEdit = g || null;
        $("#mg-titre").text(g ? "Modifier le groupe « " + g.nom + " »" : "Nouveau groupe de clients");
        $("#mg-nom").val(g ? g.nom : ""); $("#mg-description").val(g ? g.description || "" : "");
        $("#mg-clients").html(optionsClients()).val(g ? $.map(g.clientIds || [], String) : []);
        var gs = g ? grillesDuGroupe(g.id) : [];
        $("#mg-grille").html("<option value=''>Aucune (les clients gardent la grille standard)</option>" + $.map($.grep(data.grilles, function (x) { return x.type !== "STANDARD" && x.statut !== "ARCHIVEE"; }), function (x) {
            return "<option value='" + x.id + "'>" + U.esc(x.code + " · " + x.nom) + (x.statut === "BROUILLON" ? " (brouillon)" : "") + "</option>";
        }).join("")).val(gs.length ? String(gs[0].id) : "");
        U.showErrors($("#mg-form"), []);
        majInfoGroupe();
        $("#m-groupe").modal("show");
    }
    function majInfoGroupe() {
        var ids = $("#mg-clients").val() || [], avecContrat = $.grep(ids, function (id) { return T.contratEnVigueur(id, today, data.contrats); });
        $("#mg-info").html(ids.length + " client(s) sélectionné(s)" + (avecContrat.length ? " · <b>" + avecContrat.length + "</b> ont un contrat en vigueur (prioritaire sur la grille du groupe)" : ""));
    }
    $("#m-groupe").on("shown.bs.modal", function () {
        $("#mg-clients").select2({ width: "100%", dropdownParent: $("#m-groupe"), placeholder: "Rechercher des clients…", closeOnSelect: false });
        $("#mg-nom").focus();
    });
    $("#mg-clients").on("change", majInfoGroupe);
    $("#btn-groupe, #btn-groupe-2").on("click", function () { ouvrirGroupe(null); });
    $("#mg-save").on("click", function () {
        var nom = $.trim($("#mg-nom").val());
        var doublon = $.grep(data.groupes, function (x) { return U.normalize(x.nom) === U.normalize(nom) && (!grEdit || x.id !== grEdit.id); })[0];
        var errs = [];
        if (!nom) errs.push({ field: "nom", message: "Le nom du groupe est obligatoire." });
        else if (doublon) errs.push({ field: "nom", message: "Un groupe porte déjà ce nom." });
        U.showErrors($("#mg-form"), errs);
        if (errs.length) return;
        var obj = $.extend({}, grEdit || {}, { nom: nom, description: $.trim($("#mg-description").val()), clientIds: $.map($("#mg-clients").val() || [], Number) });
        var grilleId = $("#mg-grille").val();
        // TODO API : POST /commercial/groupes-clients | PUT /commercial/groupes-clients/{id}
        CX.api.save("groupesClients", obj).then(function (saved) {
            /* grille du groupe : on l'ajoute à l'affectation de la grille choisie, on la retire des autres */
            var patchs = [];
            $.each(data.grilles, function (_, x) {
                var a = $.extend({ clientIds: [], groupeIds: [] }, x.affectation), a2 = $.grep(a.groupeIds, function (id) { return id !== saved.id; });
                if (String(x.id) === String(grilleId)) a2.push(saved.id);
                if (a2.slice().sort().join(",") !== a.groupeIds.slice().sort().join(",")) {
                    // TODO API : PUT /commercial/tarifs/{id}/affectation
                    patchs.push(CX.api.patchMany("tarifaires", [x.id], { affectation: { clientIds: a.clientIds, groupeIds: a2 } }));
                }
            });
            return $.when.apply($, patchs).then(function () { return saved; });
        }).done(function (saved) {
            $("#m-groupe").modal("hide");
            U.toast("Groupe <b>" + U.esc(saved.nom) + "</b> " + (grEdit ? "modifié." : "créé (" + U.esc(saved.code) + ")."));
            charger();
        });
    });
    $("#dt-groupes").on("click", "[data-act]", function (e) {
        e.preventDefault();
        var g = groupe($(this).closest("tr").data("id")), act = $(this).data("act");
        if (!g) return;
        if (act === "modifier") ouvrirGroupe(g);
        if (act === "supprimer") {
            var gs = grillesDuGroupe(g.id);
            U.confirm({
                title: "Supprimer le groupe", okText: "Supprimer", okClass: "cx-btn-danger",
                message: "<p>Le groupe <b>" + U.esc(g.nom) + "</b> (" + (g.clientIds || []).length + " clients) sera supprimé.</p>" +
                    (gs.length ? "<p class='cx-muted'>Il sera retiré de l'affectation de : " + $.map(gs, function (x) { return "<b>" + U.esc(x.nom) + "</b>"; }).join(", ") + ". Ses clients reviendront à leur grille propre ou à la grille standard.</p>" : "")
            }).done(function () {
                var patchs = $.map(gs, function (x) {
                    var a = $.extend({ clientIds: [], groupeIds: [] }, x.affectation);
                    return CX.api.patchMany("tarifaires", [x.id], { affectation: { clientIds: a.clientIds, groupeIds: $.grep(a.groupeIds, function (id) { return id !== g.id; }) } });
                });
                // TODO API : DELETE /commercial/groupes-clients/{id}  (le serveur retire aussi le groupe des affectations)
                $.when.apply($, patchs).then(function () { return CX.api.remove("groupesClients", g.id); })
                    .done(function () { U.toast("Groupe supprimé.", "warning"); charger(); });
            });
        }
    });

    /* =================================================================
       Onglet Contrats
       ================================================================= */
    $("#f-ctr-statut").html("<option value=''>Tous les statuts</option>" + $.map(T.STATUTS_CONTRAT, function (s, k) { return "<option value='" + k + "'>" + s.label + "</option>"; }).join(""));
    dtC = new CX.DataTable("#dt-contrats", {
        pageSize: 25, sortKey: "au", sortDir: -1, searchInput: "#q-contrats",
        emptyText: "Aucun contrat", emptyIcon: "fa-file-text-o",
        columns: [
            { key: "numero", title: "Contrat", render: function (c) { return "<a class='cx-mono cx-strong' href='contrat-form.html?id=" + c.id + "'>" + U.esc(c.numero) + "</a><div class='cx-cell-sub'>" + U.esc(c.objet || "") + "</div>"; } },
            { key: "clientId", title: "Client", sortValue: function (c) { return nomClient(c.clientId); }, searchValue: function (c) { return nomClient(c.clientId); }, render: function (c) { return "<a href='client-fiche.html?id=" + c.clientId + "#tarif'>" + U.esc(nomClient(c.clientId)) + "</a>"; } },
            {
                key: "au", title: "Période",
                render: function (c) {
                    var st = T.statutContrat(c, today), reste = c.au ? U.daysBetween(today, c.au) : null;
                    return U.toFr(c.du) + " → " + (c.au ? U.toFr(c.au) : "…") +
                        (st === "ACTIF" && reste != null ? "<div class='cx-cell-sub'" + (reste <= 30 ? " style='color:var(--cx-orange);font-weight:600'" : "") + ">expire dans " + reste + " j</div>" : "") +
                        (st === "RESILIE" && c.dateResiliation ? "<div class='cx-cell-sub'>résilié le " + U.toFr(c.dateResiliation) + "</div>" : "");
                }
            },
            {
                key: "tarifaireId", title: "Grille attachée", searchValue: function (c) { var g = grille(c.tarifaireId); return g ? g.nom : ""; },
                render: function (c) { var g = grille(c.tarifaireId); return g ? "<a href='tarif-form.html?id=" + g.id + "'>" + U.esc(g.nom) + "</a><div class='cx-cell-sub'>" + T.STATUTS_GRILLE[g.statut].label + "</div>" : "<span class='cx-badge cx-badge-orange'>Aucune</span>"; }
            },
            {
                key: "fichier", title: "Document", sortable: false,
                render: function (c) {
                    // TODO API : GET /commercial/contrats/{id}/document (téléchargement du PDF)
                    return c.fichier ? "<a href='#' data-act='pdf'><i class='fa fa-file-pdf-o' style='color:#d14343'></i> " + U.esc(c.fichier) + "</a>" : "<span class='cx-muted'>—</span>";
                }
            },
            { key: "statut", title: "Statut", sortValue: function (c) { return T.statutContrat(c, today); }, searchValue: function (c) { return T.STATUTS_CONTRAT[T.statutContrat(c, today)].label; }, render: function (c) { return T.badge(T.STATUTS_CONTRAT, T.statutContrat(c, today)); } },
            {
                key: "actions", title: "", sortable: false, className: "cx-right",
                render: function (c) {
                    var st = T.statutContrat(c, today);
                    return menu([
                        { href: "contrat-form.html?id=" + c.id, icon: "fa-pencil", label: "Modifier" },
                        { href: "client-fiche.html?id=" + c.clientId + "#tarif", icon: "fa-id-card-o", label: "Fiche client" },
                        { href: "contrat-form.html?client=" + c.clientId + "&renouveler=" + c.id, icon: "fa-refresh", label: "Renouveler" },
                        "-",
                        st !== "RESILIE" && st !== "EXPIRE" ? { act: "resilier", icon: "fa-ban", label: "Résilier", danger: true } : null,
                        { act: "supprimer", icon: "fa-trash-o", label: "Supprimer", danger: true }
                    ]);
                }
            }
        ],
        rowClass: function (c) { var st = T.statutContrat(c, today); return st === "RESILIE" || st === "EXPIRE" ? "cx-row-muted" : ""; }
    });
    function filtrerContrats() {
        var s = $("#f-ctr-statut").val(), ech = $("#f-ctr-echeance").is(":checked");
        dtC.setRows($.grep(data.contrats, function (c) {
            var st = T.statutContrat(c, today);
            return (!s || st === s) && (!ech || (st === "ACTIF" && c.au && c.au <= dans30));
        }));
    }
    $("#f-ctr-statut, #f-ctr-echeance").on("change", filtrerContrats);
    $("#dt-contrats").on("click", "[data-act]", function (e) {
        e.preventDefault();
        var c = $.grep(data.contrats, function (x) { return String(x.id) === String($(e.target).closest("tr").data("id")); })[0], act = $(this).data("act");
        if (!c) return;
        if (act === "pdf") { U.toast("Téléchargement de « " + U.esc(c.fichier) + " » (disponible après intégration).", "info"); return; }
        if (act === "resilier") {
            var motif = "", date = today;
            $(document).off(".cxres").on("input.cxres", "#res-motif", function () { motif = $(this).val(); }).on("change.cxres", "#res-date", function () { date = $(this).val(); });
            U.confirm({
                title: "Résilier le contrat", okText: "Résilier", okClass: "cx-btn-danger",
                message: "<p>Le contrat <b>" + U.esc(c.numero) + "</b> de <b>" + U.esc(nomClient(c.clientId)) + "</b> sera résilié : le client basculera sur son groupe ou la grille standard.</p>" +
                    "<div class='row'><div class='col-sm-5'><label class='cx-label' for='res-date'>Date d'effet</label><input type='date' class='form-control' id='res-date' value='" + today + "'></div>" +
                    "<div class='col-sm-7'><label class='cx-label' for='res-motif'>Motif</label><input type='text' class='form-control' id='res-motif' maxlength='160'></div></div>"
            }).done(function () {
                $(document).off(".cxres");
                // TODO API : POST /commercial/contrats/{id}/resilier  { date, motif }
                CX.api.patchMany("contrats", [c.id], { statut: "RESILIE", dateResiliation: date, motifResiliation: $.trim(motif) })
                    .then(function () { return CX.api.log("contrats", c.id, "Contrat résilié au " + U.toFr(date) + ($.trim(motif) ? " - " + $.trim(motif) : "")); })
                    .done(function () { U.toast("Contrat " + U.esc(c.numero) + " résilié.", "warning"); charger(); });
            }).fail(function () { $(document).off(".cxres"); });
        }
        if (act === "supprimer") {
            U.confirm({ title: "Supprimer le contrat", okText: "Supprimer", okClass: "cx-btn-danger", message: "Le contrat <b>" + U.esc(c.numero) + "</b> et son document seront supprimés. Préférez la résiliation pour garder l'historique." })
                .done(function () {
                    // TODO API : DELETE /commercial/contrats/{id}
                    CX.api.remove("contrats", c.id).done(function () { U.toast("Contrat supprimé.", "warning"); charger(); });
                });
        }
    });

    /* =================================================================
       Onglets
       ================================================================= */
    function ouvrirOnglet(tab) {
        if (!$("#tabs a[data-tab='" + tab + "']").length) tab = "grilles";
        $("#tabs a").removeClass("active").filter("[data-tab='" + tab + "']").addClass("active");
        $(".tf-pane").addClass("cx-hidden").filter("[data-pane='" + tab + "']").removeClass("cx-hidden");
        if (window.history && history.replaceState) history.replaceState(null, "", "#" + tab);
    }
    $("#tabs").on("click", "a", function (e) { e.preventDefault(); ouvrirOnglet($(this).data("tab")); });
    /* liens du menu vers #groupes / #contrats alors que la page est déjà ouverte */
    $(window).on("hashchange", function () { ouvrirOnglet(location.hash.substr(1)); });

    ouvrirOnglet((location.hash || "#grilles").substr(1));
    charger();
    T.showFlash();
});

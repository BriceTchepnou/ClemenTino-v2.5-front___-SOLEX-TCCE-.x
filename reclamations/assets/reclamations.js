/* =====================================================================
   Contrôle · Réclamations (reclamations/index.html)
   Onglets : Toutes | En attente | En traitement | Traitée | Abandonnée | En retard
   Paramètres : #nouvelle (ouvre la création), ?rt=RT-… ou ?facture=FAC-…
                (création pré-remplie), ?id=<ID> (ouvre une réclamation)
   ---------------------------------------------------------------------
   Cycle : EN_ATTENTE -> EN_TRAITEMENT (prise en charge / affectation)
           -> TRAITEE (solution, geste commercial, satisfaction)
           ou ABANDONNEE (motif) ; « Rouvrir » repasse en traitement.
   Échéance calculée selon la priorité (CX.rec.PRIORITES).
   ===================================================================== */
$(function () {
    var U = CX.util, R = CX.rec, G = CX.guichet, USER = CX.CONFIG.USER, today = U.today();
    var tous = [], onglet = "";

    function agLib(id) { var a = CX.REF.agence(id); return a ? (G ? G.villeNom(a.ville) + " · " + G.titre(a.nom) : a.ville + " · " + a.nom) : "—"; }
    var ETAPES_LIB = { ENREGISTREE: "enregistrée", GROUPEE: "groupée", EN_TRANSIT: "en transit", ARRIVEE: "arrivée", EN_INSTANCE: "en agence", EN_LIVRAISON: "en livraison", ECHEC: "échec de livraison", LIVREE: "livrée", ANNULEE: "annulée" };
    function parId(id) { return $.grep(tous, function (r) { return String(r.id) === String(id); })[0]; }
    function moi() { return USER.nom; }
    function modale(id, titre, sousTitre, corps, pied, taille) {
        $("#" + id).remove();
        return $("<div class='modal fade rc-modal' id='" + id + "' tabindex='-1' role='dialog' aria-labelledby='" + id + "-t'><div class='modal-dialog " + (taille || "modal-lg") + "' role='document'><div class='modal-content'>" +
            "<div class='modal-header'><button type='button' class='close' data-dismiss='modal' aria-label='Fermer'>&times;</button><h4 class='modal-title' id='" + id + "-t'>" + titre + (sousTitre ? "<small>" + sousTitre + "</small>" : "") + "</h4></div>" +
            "<div class='modal-body'>" + corps + "</div><div class='modal-footer'>" + pied + "</div></div></div></div>").appendTo("body");
    }
    function champ(id, label, input, req, aide) {
        return "<div class='cx-field'><label class='cx-label" + (req ? " req" : "") + "' for='" + id + "'>" + label + "</label>" + input + (aide ? "<span class='cx-help'>" + aide + "</span>" : "") + "</div>";
    }
    function erreur($m, sel, msg) {
        var $f = $m.find(sel).closest(".cx-field");
        $f.addClass("has-error").find(".cx-error-text").remove();
        $f.append("<span class='cx-help cx-error-text'>" + U.esc(msg) + "</span>");
        if ($m.find(sel).is(":visible")) $m.find(sel).focus();
    }
    function optionsAgences(sel) {
        return $.map(CX.REF.AGENCES, function (a) { return "<option value='" + a.id + "'" + (String(a.id) === String(sel) ? " selected" : "") + ">" + U.esc(agLib(a.id)) + "</option>"; }).join("");
    }
    function optionsAgents(sel, vide) {
        return "<option value=''>" + (vide || "Laisser non assignée") + "</option>" + $.map(R.AGENTS, function (a) { return "<option" + (a === sel ? " selected" : "") + ">" + U.esc(a) + "</option>"; }).join("");
    }
    function taille(o) { return o > 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " Ko"; }

    /* ---------------- Filtres ---------------- */
    $("#f-du").val(U.addDays(today, -30)); $("#f-au").val(today);
    $("#f-type").html("<option value=''>Tous</option>" + $.map(R.TYPES, function (t, k) { return "<option value='" + k + "'>" + t.label + "</option>"; }).join(""));
    $("#f-prio").html("<option value=''>Toutes</option>" + $.map(R.PRIORITES, function (p, k) { return "<option value='" + k + "'>" + p.label + "</option>"; }).join(""));
    $("#f-agence").html("<option value=''>Toutes</option>" + optionsAgences(""));
    $("#f-assigne").html("<option value=''>Tout le monde</option><option value='__MOI'>Mes réclamations</option><option value='__AUCUN'>Non assignées</option>" +
        $.map(R.AGENTS, function (a) { return "<option>" + U.esc(a) + "</option>"; }).join(""));
    function filtrees() {
        var du = $("#f-du").val(), au = $("#f-au").val(), ty = $("#f-type").val(), pr = $("#f-prio").val(), ag = $("#f-agence").val(), as = $("#f-assigne").val();
        return $.grep(tous, function (r) {
            var j = r.date.substr(0, 10);
            if (du && j < du && !R.ouverte(r)) return false;      // les réclamations ouvertes restent visibles quelle que soit la période
            if (au && j > au) return false;
            if (ty && r.type !== ty) return false;
            if (pr && r.priorite !== pr) return false;
            if (ag && String(r.agenceId) !== ag) return false;
            if (as === "__MOI" && r.assigneA !== moi() && r.assigneA.indexOf(moi()) !== 0) return false;
            if (as === "__AUCUN" && r.assigneA) return false;
            if (as && as.indexOf("__") !== 0 && r.assigneA !== as) return false;
            return true;
        });
    }

    /* ---------------- Tableau ---------------- */
    var dt = new CX.DataTable("#dt-rec", {
        pageSize: 25, sortKey: "date", sortDir: -1, searchInput: "#q", emptyText: "Aucune réclamation sur cette sélection. Élargissez la période ou créez une réclamation.", emptyIcon: "fa-life-ring",
        rowClass: function (r) { return r.statut === "ABANDONNEE" ? "cx-row-muted" : ""; },
        columns: [
            { key: "numero", title: "Réclamation", sortValue: function (r) { return r.date; }, render: function (r) {
                return "<a href='#' class='cx-mono cx-strong' data-ouvrir>" + U.esc(r.numero) + "</a><div class='cx-cell-sub'>" + U.esc(U.toFr(r.date)) + "</div>";
            }, searchValue: function (r) { return [r.numero, r.reference, r.clientNom, r.contact, r.objet, r.description, r.assigneA].join(" "); } },
            { key: "reference", title: "Origine", render: function (r) {
                return "<span class='cx-muted'><i class='fa " + R.ORIGINES[r.origine].icon + "'></i></span> " + (r.reference ? "<span class='rc-ref'>" + U.esc(r.reference) + "</span>" : "<span class='cx-muted'>Sans justificatif</span>");
            } },
            { key: "clientNom", title: "Client", render: function (r) { return U.esc(r.clientNom || "—") + "<div class='cx-cell-sub'>" + U.esc(r.contact || "") + "</div>"; } },
            { key: "type", title: "Type", render: function (r) { return R.badge(R.TYPES, r.type); } },
            { key: "objet", title: "Objet", render: function (r) { return "<div class='cx-cell-main'>" + U.esc(r.objet) + "</div><div class='cx-cell-sub' style='max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + U.esc(r.description) + "</div>"; } },
            { key: "priorite", title: "Priorité", sortValue: function (r) { return { URGENTE: 0, PRIORITAIRE: 1, NORMALE: 2 }[r.priorite]; }, render: function (r) { return R.badge(R.PRIORITES, r.priorite); } },
            { key: "agenceId", title: "Agence", sortValue: function (r) { return agLib(r.agenceId); }, render: function (r) { return U.esc(agLib(r.agenceId)); } },
            { key: "assigneA", title: "Assignée à", render: function (r) { return r.assigneA ? U.esc(r.assigneA) : "<span class='cx-muted'>Non assignée</span>"; } },
            { key: "echeance", title: "Échéance", render: function (r) {
                if (!R.ouverte(r)) return "<span class='cx-muted'>—</span>";
                return "<span class='" + (R.enRetard(r) ? "rc-retard" : "") + "'>" + U.esc(U.toFr(r.echeance)) + "</span>" + (R.enRetard(r) ? "<div class='cx-cell-sub rc-retard'><i class='fa fa-clock-o'></i> en retard</div>" : "");
            } },
            { key: "statut", title: "Statut", render: function (r) { return R.badge(R.STATUTS, r.statut); } },
            { key: "act", title: "", sortable: false, render: function () { return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-ouvrir><i class='fa fa-folder-open-o'></i> Ouvrir</button>"; } }
        ],
        onRender: function (rows) { $("#sous-titre").text("plaintes, incidents, accidents et réclamations clients · période du " + U.toFr($("#f-du").val()) + " au " + U.toFr($("#f-au").val()) + " · " + rows.length + " affichée" + (rows.length > 1 ? "s" : "")); }
    });
    function carte(r) {
        return "<div class='cx-vc-top'><span class='cx-vc-num'>" + U.esc(r.numero) + "</span>" + R.badge(R.PRIORITES, r.priorite) + "</div>" +
            "<div class='cx-vc-l'><b>" + U.esc(r.objet) + "</b></div>" +
            "<div class='cx-vc-s'>" + R.badge(R.TYPES, r.type) + " " + U.esc(r.clientNom || "") + "</div>" +
            "<div class='cx-vc-pied'><span><i class='fa fa-user-o cx-muted'></i> " + U.esc(r.assigneA || "Non assignée") + "</span>" +
            "<span class='" + (R.enRetard(r) ? "rc-retard" : "cx-muted") + "'>" + (R.ouverte(r) ? (R.enRetard(r) ? "en retard" : "→ " + U.esc(U.toFr(r.echeance).substr(0, 5))) : U.esc(U.toFr(r.date).substr(0, 10))) + "</span></div>";
    }
    CX.vues.brancher(dt, {
        slot: "#vue-slot", cle: "reclamations", vues: ["table", "cartes", "kanban"],
        cartes: { carte: carte, vide: "Aucune réclamation", icone: "fa-life-ring" },
        kanban: { colonnes: $.map(R.STATUTS, function (s, k) { return { code: k, label: s.label, color: s.color }; }), valeur: function (r) { return r.statut; }, carte: carte,
            entete: function (c, l) { var n = $.grep(l, R.enRetard).length; return n ? "<span class='rc-retard'>" + n + " en retard</span>" : O_pl(l.length); } },
        onOuvrir: function (r) { detail(r.id); }
    });
    function O_pl(n) { return n + " réclamation" + (n > 1 ? "s" : ""); }

    function rendre() {
        var base = filtrees();
        $("#n-tout").text(base.length);
        $.each(R.STATUTS, function (k) { $("#n-" + k).text($.grep(base, function (r) { return r.statut === k; }).length); });
        $("#n-RETARD").text($.grep(base, R.enRetard).length);
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        dt.setRows(onglet === "RETARD" ? $.grep(base, R.enRetard) : onglet ? $.grep(base, function (r) { return r.statut === onglet; }) : base);
    }
    function kpis() {
        var ouvertes = $.grep(tous, R.ouverte), urg = $.grep(ouvertes, function (r) { return r.priorite === "URGENTE"; }), retard = $.grep(tous, R.enRetard);
        var depuis = U.addDays(today, -30), traitees = $.grep(tous, function (r) { return r.statut === "TRAITEE" && r.resolution && r.resolution.date.substr(0, 10) >= depuis; });
        var del = 0; $.each(traitees, function (_, r) { del += R.delaiHeures(r) || 0; });
        var closes = $.grep(tous, function (r) { return !R.ouverte(r); }), taux = closes.length ? Math.round($.grep(closes, function (r) { return r.statut === "TRAITEE"; }).length / closes.length * 100) : 0;
        var nonAss = $.grep(ouvertes, function (r) { return !r.assigneA; }).length;
        function k(label, val, foot, icon, color, tab) {
            return "<div class='cx-kpi clickable " + color + "' data-kpi='" + tab + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div><div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + val + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
        }
        $("#kpis").html([
            k("Réclamations ouvertes", ouvertes.length, nonAss + " non assignée" + (nonAss > 1 ? "s" : ""), "fa-inbox", "", "EN_ATTENTE"),
            k("Urgentes", urg.length, "à traiter dans la journée", "fa-bolt", urg.length ? "red" : "green", "URGENTE"),
            k("En retard", retard.length, "échéance dépassée", "fa-clock-o", retard.length ? "orange" : "green", "RETARD"),
            k("Traitées (30 j)", traitees.length, traitees.length ? "délai moyen " + (del / traitees.length < 24 ? Math.round(del / traitees.length) + " h" : (del / traitees.length / 24).toFixed(1).replace(".", ",") + " j") : "—", "fa-check-circle", "green", "TRAITEE"),
            k("Taux de résolution", taux + " <small>%</small>", closes.length + " réclamation" + (closes.length > 1 ? "s" : "") + " clôturée" + (closes.length > 1 ? "s" : ""), "fa-line-chart", "purple", "")
        ].join(""));
    }
    function charger() {
        // TODO API : GET /qualite/reclamations?du=&au=&type=&priorite=&agence=&assigne=
        return CX.api.list("reclamations").done(function (rows) { tous = rows; kpis(); rendre(); });
    }

    /* =================================================================
       Nouvelle réclamation (maquette « Nouvelle réclamation »)
       ================================================================= */
    function nouvelle(pre) {
        pre = pre || {};
        var fichiers = [], lien = { expeditionId: null, factureId: null, clientId: null };
        var corps =
            "<div class='rc-etape'>1 · Origine</div>" +
            "<div class='rc-origines' role='radiogroup' aria-label='Origine'>" + $.map(R.ORIGINES, function (o, k) {
                return "<label class='rc-origine'><input type='radio' name='nr-origine' value='" + k + "'" + ((pre.origine || "RECU") === k ? " checked" : "") + "><span><b><i class='fa " + o.icon + "'></i> " + o.label + "</b><small>" + o.aide + "</small></span></label>";
            }).join("") + "</div>" +
            "<div id='nr-bloc-ref'><div class='rc-recherche'><input type='text' class='form-control' id='nr-ref' placeholder='' value='" + U.esc(pre.reference || "") + "' autocomplete='off'>" +
            "<button type='button' class='cx-btn cx-btn-primary' id='nr-chercher'><i class='fa fa-search'></i> Rechercher</button></div><div class='rc-trouve' id='nr-trouve'></div></div>" +
            "<div class='ox-grid-2 rc-grid2'>" +
            champ("nr-client", "Nom du client", "<input type='text' class='form-control' id='nr-client' maxlength='80' placeholder='Nom et prénom ou raison sociale'>", true) +
            champ("nr-contact", "Contact (téléphone / e-mail)", "<input type='text' class='form-control' id='nr-contact' maxlength='80' placeholder='6XX XX XX XX'>", true) +
            "</div>" +
            "<div class='rc-etape'>2 · Qualification</div>" +
            "<div class='ox-grid-2 rc-grid2'><div class='cx-field'><label class='cx-label req'>Type</label><div class='rc-pills c2'>" + $.map(R.TYPES, function (t, k) {
                return "<label class='rc-pill rc-" + t.color + "'><input type='radio' name='nr-type' value='" + k + "'" + (k === "RECLAMATION" ? " checked" : "") + "><span>" + t.label + "</span></label>";
            }).join("") + "</div><span class='rc-aide' id='nr-type-aide'></span></div>" +
            "<div class='cx-field'><label class='cx-label req'>Priorité</label><div class='rc-pills c3'>" + $.map(R.PRIORITES, function (p, k) {
                return "<label class='rc-pill rc-" + p.color + "'><input type='radio' name='nr-prio' value='" + k + "'" + (k === "NORMALE" ? " checked" : "") + "><span>" + p.label + "</span></label>";
            }).join("") + "</div><span class='rc-aide' id='nr-prio-aide'></span></div></div>" +
            champ("nr-objet", "Objet", "<input type='text' class='form-control' id='nr-objet' maxlength='120' placeholder=\"Ex : colis endommagé à l'arrivée à Douala\">", true) +
            champ("nr-desc", "Description des faits", "<textarea class='form-control' id='nr-desc' rows='4' maxlength='2000' placeholder='Quoi, où, quand, qui était présent, ce que le client demande…'></textarea><span class='rc-compteur' id='nr-compteur'>0 caractère (10 min.)</span>", true) +
            "<div class='rc-etape'>3 · Prise en charge</div>" +
            "<div class='ox-grid-2 rc-grid2'>" +
            champ("nr-agence", "Agence concernée", "<select class='form-control' id='nr-agence'>" + optionsAgences(USER.agenceId || 1) + "</select>") +
            champ("nr-assigne", "Assigner à", "<select class='form-control' id='nr-assigne'>" + optionsAgents("") + "</select>") +
            "</div>" +
            "<div class='cx-field'><label class='cx-label'>Pièces jointes</label><div class='rc-drop' id='nr-drop' tabindex='0' role='button' aria-label='Ajouter des pièces jointes'><i class='fa fa-paperclip'></i>Glissez des fichiers ici ou <a href='#'>parcourir</a><small>Photos, PDF, audio… 10 Mo max par fichier</small></div>" +
            "<input type='file' id='nr-fichiers' multiple class='cx-hidden' accept='image/*,application/pdf,audio/*'><ul class='rc-fichiers' id='nr-liste'></ul></div>";
        var $m = modale("rc-nouvelle", "Nouvelle réclamation", "Partez d'un reçu de transport ou d'une facture pour rattacher le dossier à l'expédition concernée, puis décrivez les faits.", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='nr-ok'><i class='fa fa-check'></i> Enregistrer la réclamation</button>");

        function origine() { return $m.find("input[name=nr-origine]:checked").val(); }
        function majOrigine() {
            var o = origine();
            $("#nr-bloc-ref").toggleClass("cx-hidden", o === "SANS");
            $("#nr-ref").attr("placeholder", o === "FACTURE" ? "N° de facture (ex : FAC-2026-0003)" : "N° de reçu de transport (ex : RT-2611-02005) ou N° de LT manuel");
            $("#nr-trouve").empty(); lien = { expeditionId: null, factureId: null, clientId: null };
        }
        function majAides() {
            $("#nr-type-aide").text(R.TYPES[$m.find("input[name=nr-type]:checked").val()].aide);
            $("#nr-prio-aide").text(R.PRIORITES[$m.find("input[name=nr-prio]:checked").val()].aide);
        }
        function compteur() { var n = $.trim($("#nr-desc").val()).length; $("#nr-compteur").text(n + " caractère" + (n > 1 ? "s" : "") + " (10 min.)").toggleClass("ok", n >= 10); }
        /* Recherche du justificatif : expédition (N° RT ou LT manuel) ou facture */
        function chercher() {
            var v = $.trim($("#nr-ref").val()).toUpperCase(), o = origine();
            $m.find(".cx-field.has-error").removeClass("has-error").find(".cx-error-text").remove();
            if (!v) { $("#nr-trouve").html("<span class='cx-muted'>Saisissez un numéro.</span>"); return; }
            if (o === "FACTURE") {
                // TODO API : GET /commercial/factures?numero=
                var f = $.grep(CX.api.listSync("factures"), function (x) { return String(x.numero).toUpperCase() === v; })[0];
                if (!f) { $("#nr-trouve").html("<span class='rc-retard'><i class='fa fa-times-circle'></i> Aucune facture « " + U.esc(v) + " ».</span>"); return; }
                var c = $.grep(CX.api.listSync("clients"), function (x) { return x.id === f.clientId; })[0] || {};
                lien = { expeditionId: null, factureId: f.id, clientId: f.clientId };
                $("#nr-client").val(c.raisonSociale || ""); $("#nr-contact").val(((c.contacts || [])[0] || {}).tel1 || c.telStandard || "");
                $("#nr-trouve").html("<span style='color:var(--cx-green)'><i class='fa fa-check-circle'></i> Facture <b>" + U.esc(f.numero) + "</b> du " + U.toFr(f.dateEmission) + " · " + U.esc(c.raisonSociale || "") + " · " + U.money(f.montantTTC) + " TTC</span>");
                return;
            }
            // TODO API : GET /guichet/expeditions?numero=  (N° RT ou N° de LT manuel)
            var e = $.grep(CX.api.listSync("expeditions"), function (x) { return String(x.nRt || "").toUpperCase() === v || String(x.nRtMan || "") === v; })[0];
            if (!e) { $("#nr-trouve").html("<span class='rc-retard'><i class='fa fa-times-circle'></i> Aucun reçu « " + U.esc(v) + " ».</span>"); return; }
            var dst = e.destinataireInfo || {}, ag = CX.REF.agencesDe(e.villeDest)[0];
            lien = { expeditionId: e.id, factureId: e.factureId || null, clientId: e.clientId || null };
            $("#nr-client").val(dst.nom || e.destinataire || ""); $("#nr-contact").val(G ? G.telAff(dst.tel || e.telDestinataire || "") : (dst.tel || ""));
            if (ag) $("#nr-agence").val(String((CX.REF.agencesDe(e.villeDest).filter(function (a) { return a.nom === e.bureauDest; })[0] || ag).id));
            $("#nr-trouve").html("<span style='color:var(--cx-green)'><i class='fa fa-check-circle'></i> Reçu <b>" + U.esc(e.nRt) + "</b> du " + U.toFr(e.dateExp) + " · " + U.esc((G ? G.villeNom(e.villeDep) : e.villeDep) + " → " + (G ? G.villeNom(e.villeDest) : e.villeDest)) +
                " · " + U.esc((e.expediteurInfo || {}).nom || e.expediteur || "") + " → " + U.esc(dst.nom || e.destinataire || "") + "</span> <a href='../guichet/recu.html?id=" + e.id + "' target='_blank' rel='noopener'>voir le reçu</a>");
        }
        function ajouterFichiers(list) {
            $.each(list || [], function (_, f) {
                if (f.size > 10 * 1048576) { U.toast(U.esc(f.name) + " dépasse 10 Mo.", "warning"); return; }
                fichiers.push({ nom: f.name, taille: f.size, type: f.type || "" });
            });
            $("#nr-liste").html($.map(fichiers, function (f, i) { return "<li><i class='fa " + (/^image/.test(f.type) ? "fa-file-image-o" : /pdf/.test(f.type) ? "fa-file-pdf-o" : "fa-file-o") + "'></i> " + U.esc(f.nom) + " <small class='cx-muted'>" + taille(f.taille) + "</small><button type='button' data-suppr='" + i + "' aria-label='Retirer'>&times;</button></li>"; }).join(""));
        }
        $m.on("change", "input[name=nr-origine]", majOrigine);
        $m.on("change", "input[name=nr-type], input[name=nr-prio]", majAides);
        $m.on("input", "#nr-desc", compteur);
        $m.on("click", "#nr-chercher", chercher);
        $m.on("keydown", "#nr-ref", function (e) { if (e.which === 13) { e.preventDefault(); chercher(); } });
        $m.on("click keydown", "#nr-drop", function (e) { if (e.type === "keydown" && e.which !== 13 && e.which !== 32) return; e.preventDefault(); $("#nr-fichiers").click(); });
        $m.on("change", "#nr-fichiers", function () { ajouterFichiers(this.files); this.value = ""; });
        $m.on("dragover dragenter", "#nr-drop", function (e) { e.preventDefault(); $(this).addClass("survol"); });
        $m.on("dragleave drop", "#nr-drop", function (e) { e.preventDefault(); $(this).removeClass("survol"); if (e.type === "drop") ajouterFichiers(e.originalEvent.dataTransfer.files); });
        $m.on("click", "[data-suppr]", function () { fichiers.splice(Number($(this).data("suppr")), 1); ajouterFichiers([]); });
        majOrigine(); majAides(); compteur();
        if (pre.reference) chercher();

        var fait = null;
        $m.on("click", "#nr-ok", function () {
            $m.find(".cx-field.has-error").removeClass("has-error").find(".cx-error-text").remove();
            var o = origine();
            if (o !== "SANS" && !lien.expeditionId && !lien.factureId) return erreur($m, "#nr-ref", "Recherchez et sélectionnez le justificatif, ou choisissez « Sans justificatif ».");
            var client = $.trim($("#nr-client").val()), contact = $.trim($("#nr-contact").val()), objet = $.trim($("#nr-objet").val()), desc = $.trim($("#nr-desc").val());
            if (client.length < 2) return erreur($m, "#nr-client", "Nom du client obligatoire.");
            if (contact.length < 6) return erreur($m, "#nr-contact", "Téléphone ou e-mail du client obligatoire.");
            if (objet.length < 4) return erreur($m, "#nr-objet", "Objet obligatoire.");
            if (desc.length < 10) return erreur($m, "#nr-desc", "Décrivez les faits (10 caractères minimum).");
            var date = U.now(), prio = $m.find("input[name=nr-prio]:checked").val(), assigne = $("#nr-assigne").val();
            var r = {
                numero: R.numero(date), date: date, origine: o, reference: o === "SANS" ? "" : $.trim($("#nr-ref").val()).toUpperCase(),
                expeditionId: lien.expeditionId, factureId: lien.factureId, clientId: lien.clientId, clientNom: client, contact: contact,
                type: $m.find("input[name=nr-type]:checked").val(), priorite: prio, echeance: R.echeance(date, prio), objet: objet, description: desc,
                agenceId: Number($("#nr-agence").val()), assigneA: assigne, statut: "EN_ATTENTE", pieces: fichiers, creePar: moi(),
                fil: [{ date: date, user: moi(), genre: "CREATION", texte: "Réclamation enregistrée" + (o !== "SANS" ? " (" + (o === "RECU" ? "reçu " : "facture ") + $.trim($("#nr-ref").val()).toUpperCase() + ")" : " (sans justificatif)") }]
            };
            if (assigne) r.fil.push({ date: date, user: moi(), genre: "AFFECTATION", texte: "Assignée à " + assigne });
            // TODO API : POST /qualite/reclamations (multipart : pièces jointes)
            U.busy($(this), true);
            CX.api.save("reclamations", r).done(function (x) { fait = x; $m.modal("hide"); });
        });
        $m.on("shown.bs.modal", function () { $(pre.reference ? "#nr-objet" : "#nr-ref").focus(); });
        $m.on("hidden.bs.modal", function () {
            $m.remove();
            if (window.location.hash === "#nouvelle" && window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
            if (fait) { U.toast("Réclamation <b>" + U.esc(fait.numero) + "</b> enregistrée" + (fait.assigneA ? " et assignée à " + U.esc(fait.assigneA) : "") + ".", "success"); charger().done(function () { detail(fait.id); }); }
        });
        $m.modal("show");
    }

    /* =================================================================
       Détail et traitement
       ================================================================= */
    function maj(id, fn, toast) {
        // TODO API : routes dédiées (affecter, commentaires, resoudre, abandonner, rouvrir)
        return CX.api.get("reclamations", id).then(function (r) { fn(r); return CX.api.save("reclamations", r); }).done(function (r) {
            if (toast) U.toast(toast, "success");
            charger().done(function () { detail(r.id); });
        });
    }
    function log(r, genre, texte) { r.fil = r.fil || []; r.fil.push({ date: U.now(), user: moi(), genre: genre, texte: texte }); }

    function detail(id) {
        var r = parId(id);
        if (!r) return;
        var ouverte = R.ouverte(r), e = r.expeditionId ? $.grep(CX.api.listSync("expeditions"), function (x) { return x.id === r.expeditionId; })[0] : null;
        function info(l, v, html) { return "<div><small>" + l + "</small><b>" + (html ? v : U.esc(v || "—")) + "</b></div>"; }
        var corps = "<div class='rc-detail'><div>" +
            "<div class='rc-badges'>" + R.badge(R.STATUTS, r.statut) + R.badge(R.TYPES, r.type) + R.badge(R.PRIORITES, r.priorite) + (R.enRetard(r) ? "<span class='cx-badge cx-badge-red cx-no-dot'><i class='fa fa-clock-o'></i> En retard</span>" : "") + "</div>" +
            "<div class='rc-infos'>" +
            info("Client", r.clientNom) + info("Contact", r.contact) +
            info("Origine", r.reference ? "<i class='fa " + R.ORIGINES[r.origine].icon + "'></i> " + (r.origine === "RECU" && e ? "<a href='../guichet/recu.html?id=" + e.id + "' target='_blank' rel='noopener'>" + U.esc(r.reference) + "</a>" : r.origine === "FACTURE" && r.factureId ? "<a href='../commercial/facture.html?id=" + r.factureId + "' target='_blank' rel='noopener'>" + U.esc(r.reference) + "</a>" : U.esc(r.reference)) : "Sans justificatif", true) +
            info("Agence concernée", agLib(r.agenceId)) +
            info("Enregistrée le", U.toFr(r.date) + " par " + (r.creePar || "")) + info("Échéance", ouverte ? U.toFr(r.echeance) : "—") +
            (e ? info("Expédition", (G ? G.villeNom(e.villeDep) + " → " + G.villeNom(e.villeDest) : "") + " · " + (ETAPES_LIB[e.etape || e.statut] || "")) + info("Suivi du colis", "<a href='../operations/tracking.html?lt=" + encodeURIComponent(e.nRt) + "' target='_blank' rel='noopener'><i class='fa fa-map-marker'></i> voir le tracking</a>", true) : "") +
            "</div>" +
            "<h5 class='ox-h5' style='font-size:13px;font-weight:700;margin:4px 0 6px'>" + U.esc(r.objet) + "</h5><div class='rc-desc'>" + U.esc(r.description) + "</div>" +
            ((r.pieces || []).length ? "<div style='margin-top:10px'><small class='cx-muted'>Pièces jointes</small><ul class='rc-fichiers'>" + $.map(r.pieces, function (p) { return "<li><i class='fa " + (/^image/.test(p.type) ? "fa-file-image-o" : /pdf/.test(p.type) ? "fa-file-pdf-o" : "fa-file-o") + "'></i> " + U.esc(p.nom) + " <small class='cx-muted'>" + taille(p.taille || 0) + "</small></li>"; }).join("") + "</ul></div>" : "") +
            (r.resolution ? "<div class='rc-resolution'><b><i class='fa fa-check-circle'></i> Traitée le " + U.esc(U.toFr(r.resolution.date)) + " par " + U.esc(r.resolution.user) + "</b><div style='margin-top:6px;white-space:pre-wrap'>" + U.esc(r.resolution.solution) + "</div>" +
                (r.resolution.geste && r.resolution.geste.type && r.resolution.geste.type !== "Aucun" ? "<div class='cx-cell-sub' style='margin-top:6px'>Geste commercial : <b>" + U.esc(r.resolution.geste.type) + "</b>" + (r.resolution.geste.montant ? " · " + U.money(r.resolution.geste.montant) : "") + "</div>" : "") +
                (r.resolution.satisfaction ? "<div class='cx-cell-sub'>Satisfaction client : " + new Array(r.resolution.satisfaction + 1).join("★") + new Array(6 - r.resolution.satisfaction).join("☆") + "</div>" : "") + "</div>" : "") +
            (r.abandon ? "<div class='rc-abandon'><b><i class='fa fa-ban'></i> Abandonnée le " + U.esc(U.toFr(r.abandon.date)) + " par " + U.esc(r.abandon.user) + "</b><div style='margin-top:6px'>" + U.esc(r.abandon.motif) + "</div></div>" : "") +
            "</div><div>" +
            "<div class='rc-bloc'><h5><i class='fa fa-user-o'></i> Prise en charge</h5>" +
            (ouverte ? "<div class='ox-flex' style='display:flex;gap:8px'><select class='form-control input-sm' id='dt-assigne' style='flex:1'>" + optionsAgents(r.assigneA, "Non assignée") + "</select>" +
                "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' id='dt-affecter'><i class='fa fa-share'></i> Affecter</button></div>" +
                (r.assigneA !== moi() ? "<button type='button' class='cx-btn cx-btn-soft cx-btn-sm' id='dt-moi' style='margin-top:8px'><i class='fa fa-hand-paper-o'></i> Je m'en occupe</button>" : "")
                : "<b>" + U.esc(r.assigneA || "Non assignée") + "</b>") + "</div>" +
            "<div class='rc-bloc'><h5><i class='fa fa-comments-o'></i> Fil de traitement</h5><ul class='rc-fil'>" + $.map((r.fil || []).slice().reverse(), function (f) {
                return "<li class='g-" + f.genre + "'>" + (f.genre === "COMMENTAIRE" ? "<b>" + U.esc(f.user) + "</b><div class='rc-com'>" + U.esc(f.texte) + "</div>" : U.esc(f.texte)) +
                    "<small>" + U.esc(U.toFr(f.date)) + (f.genre !== "COMMENTAIRE" ? " · " + U.esc(f.user) : "") + "</small></li>";
            }).join("") + "</ul>" +
            "<div style='margin-top:10px'><textarea class='form-control' id='dt-com' rows='2' maxlength='1000' placeholder='Ajouter un commentaire, un échange avec le client, une action menée…'></textarea>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' id='dt-commenter' style='margin-top:6px'><i class='fa fa-paper-plane-o'></i> Ajouter au fil</button></div></div>" +
            "</div></div>";
        var pied = "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Fermer</button>" +
            (r.statut === "EN_ATTENTE" ? "<button type='button' class='cx-btn cx-btn-ghost' id='dt-traiter'><i class='fa fa-play'></i> Prendre en charge</button>" : "") +
            (ouverte ? "<button type='button' class='cx-btn cx-btn-ghost text-danger' id='dt-abandonner'><i class='fa fa-ban'></i> Abandonner</button>" +
                "<button type='button' class='cx-btn cx-btn-success' id='dt-resoudre'><i class='fa fa-check'></i> Marquer comme traitée</button>"
                : "<button type='button' class='cx-btn cx-btn-ghost' id='dt-rouvrir'><i class='fa fa-undo'></i> Rouvrir</button>");
        var $m = modale("rc-detail", "Réclamation " + U.esc(r.numero), U.esc(r.objet), corps, pied, "modal-lg");

        $m.on("click", "#dt-affecter", function () {
            var a = $("#dt-assigne").val();
            if (a === r.assigneA) return;
            maj(r.id, function (x) { x.assigneA = a; log(x, "AFFECTATION", a ? "Assignée à " + a : "Affectation retirée"); }, a ? "Réclamation assignée à " + U.esc(a) + "." : "Affectation retirée.");
            $m.modal("hide");
        });
        $m.on("click", "#dt-moi", function () {
            maj(r.id, function (x) { x.assigneA = moi(); log(x, "AFFECTATION", "Prise en main par " + moi()); if (x.statut === "EN_ATTENTE") { x.statut = "EN_TRAITEMENT"; log(x, "STATUT", "Prise en charge"); } }, "Vous traitez la réclamation " + U.esc(r.numero) + ".");
            $m.modal("hide");
        });
        $m.on("click", "#dt-traiter", function () {
            maj(r.id, function (x) { x.statut = "EN_TRAITEMENT"; if (!x.assigneA) { x.assigneA = moi(); log(x, "AFFECTATION", "Assignée à " + moi()); } log(x, "STATUT", "Prise en charge"); }, "Réclamation en traitement.");
            $m.modal("hide");
        });
        $m.on("click", "#dt-commenter", function () {
            var t = $.trim($("#dt-com").val());
            if (t.length < 2) { $("#dt-com").focus(); return; }
            maj(r.id, function (x) { log(x, "COMMENTAIRE", t); });
            $m.modal("hide");
        });
        $m.on("click", "#dt-rouvrir", function () {
            maj(r.id, function (x) { x.statut = "EN_TRAITEMENT"; x.echeance = R.echeance(U.now(), x.priorite); delete x.resolution; delete x.abandon; log(x, "STATUT", "Réclamation rouverte"); }, "Réclamation rouverte.");
            $m.modal("hide");
        });
        $m.on("click", "#dt-abandonner", function () { $m.modal("hide"); setTimeout(function () { abandonner(r); }, 350); });
        $m.on("click", "#dt-resoudre", function () { $m.modal("hide"); setTimeout(function () { resoudre(r); }, 350); });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    function resoudre(r) {
        var note = 0;
        var corps = champ("rs-solution", "Solution apportée", "<textarea class='form-control' id='rs-solution' rows='4' maxlength='2000' placeholder='Ce qui a été fait, ce qui a été dit au client, les mesures prises…'></textarea>", true) +
            "<div class='ox-grid-2 rc-grid2'>" +
            champ("rs-geste", "Geste commercial", "<select class='form-control' id='rs-geste'>" + $.map(R.GESTES, function (g) { return "<option>" + g + "</option>"; }).join("") + "</select>") +
            champ("rs-montant", "Montant <span class='cx-opt'>(FCFA, si remboursement / avoir)</span>", "<input type='number' class='form-control' id='rs-montant' min='0' step='500' value='0'>") +
            "</div>" +
            "<div class='cx-field'><label class='cx-label'>Satisfaction du client <span class='cx-opt'>(facultatif)</span></label><div class='rc-etoiles' id='rs-etoiles'>" +
            [1, 2, 3, 4, 5].map(function (n) { return "<button type='button' data-n='" + n + "' aria-label='" + n + " sur 5'>★</button>"; }).join("") + "</div></div>" +
            "<label class='cx-help' style='display:block'><input type='checkbox' id='rs-avise' checked> Client informé de la solution</label>";
        var $m = modale("rc-resoudre", "Marquer comme traitée", U.esc(r.numero + " · " + r.objet), corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-success' id='rs-ok'><i class='fa fa-check'></i> Clôturer la réclamation</button>", "");
        $m.on("click", "#rs-etoiles button", function () { note = Number($(this).data("n")); $("#rs-etoiles button").each(function () { $(this).toggleClass("on", Number($(this).data("n")) <= note); }); });
        $m.on("click", "#rs-ok", function () {
            var s = $.trim($("#rs-solution").val());
            if (s.length < 10) return erreur($m, "#rs-solution", "Décrivez la solution (10 caractères minimum).");
            var geste = { type: $("#rs-geste").val(), montant: Number($("#rs-montant").val()) || 0 }, avise = $("#rs-avise").is(":checked");
            maj(r.id, function (x) {
                x.statut = "TRAITEE";
                x.resolution = { date: U.now(), user: moi(), solution: s, geste: geste, satisfaction: note || null, clientInforme: avise };
                log(x, "STATUT", "Réclamation traitée" + (geste.type !== "Aucun" ? " · geste : " + geste.type : "") + (avise ? " · client informé" : ""));
            }, "Réclamation " + U.esc(r.numero) + " traitée.");
            $m.modal("hide");
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }
    function abandonner(r) {
        var $m = modale("rc-abandon", "Abandonner la réclamation", U.esc(r.numero + " · " + r.objet),
            champ("ab-motif", "Motif de l'abandon", "<select class='form-control' id='ab-motif'><option>Client injoignable après relances</option><option>Réclamation non fondée</option><option>Doublon d'une autre réclamation</option><option>Retirée par le client</option><option>Autre</option></select>", true) +
            champ("ab-detail", "Précisions", "<input type='text' class='form-control' id='ab-detail' maxlength='200'>"),
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-danger' id='ab-ok'><i class='fa fa-ban'></i> Abandonner</button>", "");
        $m.on("click", "#ab-ok", function () {
            var motif = $("#ab-motif").val() + ($.trim($("#ab-detail").val()) ? " : " + $.trim($("#ab-detail").val()) : "");
            maj(r.id, function (x) { x.statut = "ABANDONNEE"; x.abandon = { date: U.now(), user: moi(), motif: motif }; log(x, "STATUT", "Réclamation abandonnée : " + motif); }, "Réclamation " + U.esc(r.numero) + " abandonnée.");
            $m.modal("hide");
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    /* ---------------- Évènements ---------------- */
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); rendre(); });
    $("#f-du, #f-au, #f-type, #f-prio, #f-agence, #f-assigne").on("change", rendre);
    $("#kpis").on("click", "[data-kpi]", function () {
        var k = $(this).data("kpi");
        $("#f-prio").val(k === "URGENTE" ? "URGENTE" : "");
        onglet = k === "URGENTE" ? "" : k;
        rendre();
    });
    $("#dt-rec").on("click", "[data-ouvrir]", function (e) { e.preventDefault(); detail($(this).closest("tr").data("id")); });
    $("#btn-nouvelle").on("click", function () { nouvelle(); });
    $("#btn-refresh").on("click", function () { charger(); });
    $(window).on("hashchange", function () { if (window.location.hash === "#nouvelle") nouvelle(); });

    charger().done(function () {
        var rt = U.queryParam("rt"), fac = U.queryParam("facture"), id = U.queryParam("id");
        if (rt) nouvelle({ origine: "RECU", reference: rt });
        else if (fac) nouvelle({ origine: "FACTURE", reference: fac });
        else if (window.location.hash === "#nouvelle") nouvelle();
        else if (id) detail(id);
    });
});

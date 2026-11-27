/* =====================================================================
   Opérations · Tournées de livraison (operations/tournees.html)
   Onglets : Planning de la semaine (défaut) | Tournées du jour | Liste
   ---------------------------------------------------------------------
   Planification des tournées de livraison urbaine (collection
   « plannings ») : pour chaque jour, les disponibilités des coursiers
   par zone (Z1, Z2, Z3), plage horaire, quartiers et capacité.
   Le matin, chaque livreur voit ses tournées déjà programmées.
   Les colis sont affectés à une tournée en générant la fiche de
   livraison (collection « tournees ») depuis Livraison de colis ›
   À remettre au coursier : fiche intégrée à une tournée planifiée, ou
   fiche express (spontanée).
   Paramètres : ?date=AAAA-MM-JJ (semaine affichée), #p<ID> (ouvre une tournée)
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante(), today = U.today();
    var plannings = [], fiches = [], fichesMap = {}, livreurs = [], exps = {}, f = null;
    var onglet = (function () { var v = null; try { v = window.localStorage.getItem("cx_vue_tournees"); } catch (e) { v = null; } return $.inArray(v, ["planning", "jour", "kanban", "calendrier", "gantt", "liste"]) >= 0 ? v : "planning"; })(), lundi = lundiDe(paramDate() || today), jourSel = today;
    var JOURS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
    var ZONE_COULEUR = { Z1: "blue", Z2: "purple", Z3: "orange" };
    var QZ = (CX.demoExploitation && CX.demoExploitation.QUARTIERS_ZONE) || {};

    O.selecteurAgence("#ox-agence-slot");

    function paramDate() { var m = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(window.location.search); return m ? m[1] : null; }
    function lundiDe(iso) { var dow = (new Date(iso + "T12:00:00").getDay() + 6) % 7; return U.addDays(iso, -dow); }
    function joursSemaine() { var r = []; for (var i = 0; i < 7; i++) r.push(U.addDays(lundi, i)); return r; }
    function jourLib(iso, long) {
        var d = new Date(iso + "T12:00:00"), j = JOURS[(d.getDay() + 6) % 7];
        return long ? U.toFrLong(iso) : j + " " + iso.substr(8, 2) + "/" + iso.substr(5, 2);
    }
    function statut(p) { return O.statutPlanning(p, fichesMap); }
    function fichesDe(p) { return $.map(p.ficheIds || [], function (id) { return fichesMap[id] || null; }); }
    function charge(p) { var n = 0; $.each(fichesDe(p), function (_, fi) { n += (fi.expeditionIds || []).length; }); return n; }
    function livres(p) {
        var n = 0;
        $.each(fichesDe(p), function (_, fi) { $.each(fi.expeditionIds || [], function (_, id) { var e = exps[id]; if (e && e.etape === "LIVREE") n++; }); });
        return n;
    }
    function zoneBadge(z) { return "<span class='cx-badge cx-badge-" + (ZONE_COULEUR[z] || "grey") + " cx-no-dot'>" + U.esc(O.zoneLib(z, true)) + "</span>"; }
    function parId(id) { return $.grep(plannings, function (p) { return String(p.id) === String(id); })[0]; }
    function livreursVille() { return $.grep(livreurs, function (l) { return l.ville === A.ville; }); }
    function modifiable(p) { var s = statut(p); return (s === "PLANIFIEE" || s === "EN_COURS") && p.date >= today; }

    /* ---------------- Filtres ---------------- */
    function initFiltres() {
        $("#f-zone").html("<option value=''>Toutes</option>" + $.map(CX.REF.ZONES_LIVRAISON, function (z) { return "<option value='" + z.code + "'>" + U.esc(z.nom) + "</option>"; }).join(""));
        $("#f-statut").html("<option value=''>Tous</option>" + $.map(O.STATUT_PLANNING, function (s, k) { return "<option value='" + k + "'>" + s.label + "</option>"; }).join(""));
        $("#f-livreur").html("<option value=''>Tous</option>" + $.map(livreursVille(), function (l) { return "<option value='" + l.id + "'>" + U.esc(l.nom) + "</option>"; }).join(""));
    }
    function filtre(p) {
        var z = $("#f-zone").val(), l = $("#f-livreur").val(), s = $("#f-statut").val(), q = $.trim($("#q").val()).toLowerCase();
        if (z && p.zone !== z) return false;
        if (l && String(p.livreurId) !== l) return false;
        if (s && statut(p) !== s) return false;
        if (q && (p.numero + " " + (p.quartiers || []).join(" ") + " " + (p.livreurNom || "") + " " + (p.observations || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
    }
    function semaine() { var fin = U.addDays(lundi, 6); return $.grep(plannings, function (p) { return p.date >= lundi && p.date <= fin; }); }

    /* ---------------- Vue planning (livreurs x jours) ---------------- */
    function puce(p) {
        var s = statut(p), c = charge(p), cap = p.capacite || 0, pct = cap ? Math.min(100, Math.round(c / cap * 100)) : 0;
        return "<button type='button' class='ox-tour ox-tour-" + (ZONE_COULEUR[p.zone] || "grey") + " ox-tour-" + s.toLowerCase() + "' data-p='" + p.id + "' title='" + U.esc(p.numero + " · " + O.STATUT_PLANNING[s].label) + "'>" +
            "<span class='ox-tour-h'>" + U.esc(p.heureDebut + "–" + p.heureFin) + "</span>" +
            "<span class='ox-tour-z'>" + U.esc(O.zoneLib(p.zone, true)) + " · " + U.esc((p.quartiers || []).slice(0, 2).join(", ")) + "</span>" +
            "<span class='ox-tour-f'><span class='ox-tour-bar'><i style='width:" + pct + "%'></i></span><small>" + c + "/" + (cap || "∞") + "</small>" +
            (s === "EN_COURS" ? "<i class='fa fa-motorcycle' title='En cours'></i>" : s === "TERMINEE" ? "<i class='fa fa-check' title='Réalisée'></i>" : s === "ANNULEE" ? "<i class='fa fa-ban' title='Annulée'></i>" : "") + "</span></button>";
    }
    function rendrePlanning() {
        var jours = joursSemaine(), rows = $.grep(semaine(), filtre), parCase = {}, lignes = [];
        $.each(rows, function (_, p) { var k = (p.livreurId || 0) + "|" + p.date; (parCase[k] = parCase[k] || []).push(p); });
        var lf = $("#f-livreur").val();
        $.each(livreursVille(), function (_, l) {
            if (lf && String(l.id) !== lf) return;
            var aDes = $.grep(rows, function (p) { return p.livreurId === l.id; }).length;
            if (l.statut !== "ACTIF" && !aDes) return;
            lignes.push(l);
        });
        if ($.grep(rows, function (p) { return !p.livreurId; }).length) lignes.push({ id: 0, nom: "Livreur à désigner", vehicule: "", statut: "ACTIF" });
        var html = "<thead><tr><th class='ox-pl-liv'>Livreur</th>" + $.map(jours, function (d) {
            return "<th class='" + (d === today ? "ox-pl-today" : "") + (new Date(d + "T12:00:00").getDay() === 0 ? " ox-pl-off" : "") + "'>" + jourLib(d) + (d === today ? " <span class='cx-badge cx-badge-blue cx-no-dot'>Aujourd'hui</span>" : "") + "</th>";
        }).join("") + "</tr></thead><tbody>";
        html += lignes.length ? $.map(lignes, function (l) {
            var nbSem = 0;
            var cells = $.map(jours, function (d) {
                var ps = (parCase[l.id + "|" + d] || []).sort(function (a, b) { return a.heureDebut > b.heureDebut ? 1 : -1; });
                nbSem += ps.length;
                var ajout = d >= today && l.statut === "ACTIF" ? "<button type='button' class='ox-pl-add' data-add='" + d + "' data-liv='" + l.id + "' title='Planifier une tournée le " + U.toFr(d) + "'><i class='fa fa-plus'></i></button>" : "";
                return "<td class='" + (d === today ? "ox-pl-today" : "") + (d < today ? " ox-pl-past" : "") + (new Date(d + "T12:00:00").getDay() === 0 ? " ox-pl-off" : "") + "'>" + $.map(ps, puce).join("") + ajout + "</td>";
            }).join("");
            return "<tr><th class='ox-pl-liv'><b>" + U.esc(l.nom) + "</b><small>" + U.esc(l.vehicule || "") + (l.statut === "CONGE" ? " · <span style='color:var(--cx-orange)'>en congé</span>" : "") + " · " + O.pl(nbSem, "tournée") + "</small></th>" + cells + "</tr>";
        }).join("") : "<tr><td colspan='8'><div class='cx-empty'><i class='fa fa-calendar'></i><b>Aucun livreur à " + U.esc(G.villeNom(A.ville)) + "</b>Ajoutez des livreurs depuis <a href='livraisons.html#livreurs'>Fiches de livraison › Livreurs</a>.</div></td></tr>";
        $("#planning").html(html + "</tbody>");
        $("#legende").html($.map(CX.REF.ZONES_LIVRAISON, function (z) { return "<span><i class='ox-dot ox-dot-" + (ZONE_COULEUR[z.code] || "grey") + "'></i>" + U.esc(z.nom) + "</span>"; }).join("") +
            "<span class='cx-muted'><i class='fa fa-motorcycle'></i> en cours · <i class='fa fa-check'></i> réalisée · barre = colis affectés / capacité</span>");
    }

    /* ---------------- Tournées du jour (cartes) ---------------- */
    function rendreJour() {
        $("#f-jour").val(jourSel);
        $("#jour-lib").text(jourLib(jourSel, true));
        var rows = $.grep(plannings, function (p) { return p.date === jourSel && filtre(p); }).sort(function (a, b) { return a.heureDebut > b.heureDebut ? 1 : -1; });
        $("#cartes-jour").html(rows.length ? $.map(rows, function (p) {
            var s = statut(p), c = charge(p), lv = livres(p), fs = fichesDe(p);
            return "<div class='ox-bcard ox-bcard-tour ox-tour-bord-" + (ZONE_COULEUR[p.zone] || "grey") + "' data-p='" + p.id + "'>" +
                "<div class='ox-bcard-top'><span class='ox-bcard-num'>" + U.esc(p.numero) + "</span>" + O.badge(O.STATUT_PLANNING, s) + "</div>" +
                "<div class='ox-bcard-route'><i class='fa fa-clock-o cx-muted'></i> " + U.esc(p.heureDebut + " – " + p.heureFin) + " " + zoneBadge(p.zone) + "</div>" +
                "<div class='ox-bcard-meta'><span><i class='fa fa-motorcycle'></i> " + U.esc(p.livreurNom || "Livreur à désigner") + (p.vehicule ? " · " + U.esc(p.vehicule) : "") + "</span>" +
                "<span><i class='fa fa-map-marker'></i> " + U.esc((p.quartiers || []).join(", ") || "—") + "</span></div>" +
                "<div class='ox-tour-cap'><span class='ox-tour-bar'><i style='width:" + (p.capacite ? Math.min(100, Math.round(c / p.capacite * 100)) : 0) + "%'></i></span><small>" + c + " / " + (p.capacite || "∞") + " colis" + (lv ? " · " + lv + " livré" + (lv > 1 ? "s" : "") : "") + "</small></div>" +
                (fs.length ? "<div class='ox-bcard-meta'>" + $.map(fs, function (fi) { return "<span><i class='fa fa-file-text-o'></i> " + U.esc(fi.numero) + " " + O.badge(O.STATUT_TOURNEE, fi.statut) + "</span>"; }).join("") + "</div>" : "") +
                (p.observations ? "<div class='cx-cell-sub'><i class='fa fa-comment-o'></i> " + U.esc(p.observations) + "</div>" : "") +
                "<div class='ox-bcard-actions'><button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-voir><i class='fa fa-eye'></i> Détail</button>" +
                (p.date === today && (s === "PLANIFIEE" || s === "EN_COURS") ? "<a class='cx-btn cx-btn-primary cx-btn-xs' href='instance.html?tournee=" + p.id + "#coursier'><i class='fa fa-cubes'></i> Affecter des colis</a>" : "") + "</div></div>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-calendar-o'></i><b>Aucune tournée le " + U.esc(U.toFr(jourSel)) + "</b>" +
            (jourSel >= today ? "<a href='#' data-add='" + jourSel + "'>Planifier une tournée</a>" : "") + "</div>");
    }

    /* ---------------- Kanban / Calendrier / Gantt (CX.vues) ---------------- */
    var moisCal = (paramDate() || today).substr(0, 7);
    function carteMini(p) {
        var c = charge(p);
        return "<div class='cx-vc-top'><span class='cx-vc-num'>" + U.esc(p.numero) + "</span>" + zoneBadge(p.zone) + "</div>" +
            "<div class='cx-vc-l'><i class='fa fa-calendar cx-muted'></i> " + U.esc(jourLib(p.date)) + " · " + U.esc(p.heureDebut + "–" + p.heureFin) + "</div>" +
            "<div class='cx-vc-l'><i class='fa fa-motorcycle cx-muted'></i> " + U.esc(p.livreurNom || "Livreur à désigner") + "</div>" +
            "<div class='cx-vc-s'>" + U.esc((p.quartiers || []).join(", ")) + "</div>" +
            "<div class='ox-tour-cap' style='margin-top:6px'><span class='ox-tour-bar'><i style='width:" + (p.capacite ? Math.min(100, Math.round(c / p.capacite * 100)) : 0) + "%'></i></span><small>" + c + "/" + (p.capacite || "∞") + "</small></div>";
    }
    function rendreKanban() {
        var rows = $.grep(semaine(), filtre).sort(function (a, b) { return (a.date + a.heureDebut) > (b.date + b.heureDebut) ? 1 : -1; });
        $("#kanban-lib").text("Semaine du " + U.toFr(lundi) + " au " + U.toFr(U.addDays(lundi, 6)) + " · tournées classées par statut");
        CX.vues.kanban("#kanban", rows, {
            colonnes: $.map(["PLANIFIEE", "EN_COURS", "TERMINEE", "NON_REALISEE", "ANNULEE"], function (k) { return { code: k, label: O.STATUT_PLANNING[k].label, color: O.STATUT_PLANNING[k].color }; }),
            valeur: statut, carte: carteMini,
            entete: function (col, l) { var n = 0; $.each(l, function (_, p) { n += charge(p); }); return n + " colis"; }
        });
    }
    function rendreCalendrier() {
        CX.vues.calendrier("#calendrier", $.grep(plannings, filtre).sort(function (a, b) { return a.heureDebut > b.heureDebut ? 1 : -1; }), {
            mois: moisCal, date: function (p) { return p.date; }, max: 4,
            puce: function (p) {
                var s = statut(p);
                return "<span class='cx-cal-pt " + (ZONE_COULEUR[p.zone] || "") + "'></span><b>" + U.esc(p.heureDebut) + "</b> " + U.esc(O.zoneLib(p.zone, true).replace("Zone ", "Z")) + " · " +
                    U.esc((p.livreurNom || "à désigner").split(" ")[0]) + (s === "ANNULEE" ? " <i class='fa fa-ban'></i>" : s === "TERMINEE" ? " <i class='fa fa-check'></i>" : s === "EN_COURS" ? " <i class='fa fa-motorcycle'></i>" : "");
            },
            onMois: function (m) { moisCal = m; rendreCalendrier(); }
        });
    }
    function rendreGantt() {
        $("#gt-jour").val(jourSel);
        $("#gt-lib").text(jourLib(jourSel, true));
        var rows = $.grep(plannings, function (p) { return p.date === jourSel && filtre(p); });
        CX.vues.gantt("#gantt", rows, {
            du: jourSel, au: jourSel, heureMin: "07:00", heureMax: "20:00", titreLignes: "Livreur",
            lignes: $.map($.grep(livreursVille(), function (l) { return l.statut === "ACTIF"; }), function (l) { return l.nom; }),
            ligne: function (p) { return p.livreurNom || "Livreur à désigner"; },
            debut: function (p) { return p.date + " " + p.heureDebut; }, fin: function (p) { return p.date + " " + p.heureFin; },
            libelle: function (p) { return p.heureDebut + "–" + p.heureFin + " · " + O.zoneLib(p.zone, true) + " · " + charge(p) + "/" + (p.capacite || "∞") + " colis"; },
            titre: function (p) { return p.numero + " · " + O.STATUT_PLANNING[statut(p)].label + " · " + (p.quartiers || []).join(", "); },
            couleur: function (p) { var s = statut(p); return s === "ANNULEE" || s === "NON_REALISEE" ? "grey" : ZONE_COULEUR[p.zone] || "blue"; },
            vide: "Aucune tournée le " + U.toFr(jourSel)
        });
    }

    /* ---------------- Liste ---------------- */
    var dt = new CX.DataTable("#dt-liste", {
        pageSize: 15, sortKey: "date", sortDir: -1, emptyText: "Aucune tournée", emptyIcon: "fa-calendar",
        columns: [
            { key: "numero", title: "N° tournée", render: function (p) { return "<a href='#' class='cx-mono cx-strong' data-voir>" + U.esc(p.numero) + "</a>"; } },
            { key: "date", title: "Date", sortValue: function (p) { return p.date + p.heureDebut; }, render: function (p) { return jourLib(p.date) + "<div class='cx-cell-sub'>" + U.esc(p.heureDebut + " – " + p.heureFin) + "</div>"; } },
            { key: "zone", title: "Zone", render: function (p) { return zoneBadge(p.zone) + "<div class='cx-cell-sub'>" + U.esc((p.quartiers || []).join(", ")) + "</div>"; } },
            { key: "livreurNom", title: "Livreur", render: function (p) { return U.esc(p.livreurNom || "À désigner") + "<div class='cx-cell-sub'>" + U.esc(p.vehicule || "") + "</div>"; } },
            { key: "fiches", title: "Fiches", sortValue: function (p) { return (p.ficheIds || []).length; }, render: function (p) { var fs = fichesDe(p); return fs.length ? $.map(fs, function (fi) { return "<span class='cx-mono'>" + U.esc(fi.numero) + "</span>"; }).join("<br>") : "<span class='cx-muted'>—</span>"; } },
            { key: "charge", title: "Colis", className: "num", sortValue: charge, render: function (p) { return charge(p) + " / " + (p.capacite || "∞"); } },
            { key: "statut", title: "Statut", sortValue: statut, render: function (p) { return O.badge(O.STATUT_PLANNING, statut(p)); } },
            { key: "act", title: "", sortable: false, render: function () { return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-voir><i class='fa fa-eye'></i> Détail</button>"; } }
        ]
    });

    /* ---------------- Détail d'une tournée ---------------- */
    function detail(p) {
        var s = statut(p), fs = fichesDe(p), c = charge(p);
        var corps = "<div class='ox-grid-3'>" +
            info("Date", U.toFrLong(p.date)) + info("Plage horaire", p.heureDebut + " – " + p.heureFin) + info("Statut", O.badge(O.STATUT_PLANNING, s), true) +
            info("Zone", zoneBadge(p.zone), true) + info("Quartiers", (p.quartiers || []).join(", ") || "—") + info("Agence", O.agenceLib(p.agenceId)) +
            info("Livreur", p.livreurNom || "À désigner") + info("Véhicule", p.vehicule || "—") + info("Capacité", c + " / " + (p.capacite || "∞") + " colis") +
            "</div>" + (p.observations ? "<div class='cx-note cx-note-info'><i class='fa fa-comment-o'></i><div>" + U.esc(p.observations) + "</div></div>" : "") +
            "<h5 class='ox-h5'><i class='fa fa-file-text-o'></i> Fiches de livraison rattachées</h5>" +
            (fs.length ? "<div class='cx-table-wrap'><table class='cx-table ox-mini'><thead><tr><th>N° fiche</th><th>Départ</th><th>Livreur</th><th>Colis</th><th>Livrés</th><th>Statut</th></tr></thead><tbody>" +
                $.map(fs, function (fi) {
                    var lv = $.grep(fi.expeditionIds || [], function (id) { return exps[id] && exps[id].etape === "LIVREE"; }).length;
                    return "<tr><td class='cx-mono cx-strong'><a href='livraisons.html" + (fi.statut === "CLOTUREE" ? "#cloturees" : "") + "'>" + U.esc(fi.numero) + "</a></td><td>" + U.esc(fi.heure || "") + "</td><td>" + U.esc(fi.livreurNom) + "</td>" +
                        "<td>" + (fi.expeditionIds || []).length + "</td><td>" + lv + "</td><td>" + O.badge(O.STATUT_TOURNEE, fi.statut) + "</td></tr>";
                }).join("") + "</tbody></table></div>"
                : "<p class='cx-muted'>Aucune fiche pour l'instant." + (p.date === today && modifiable(p) ? " Affectez des colis à cette tournée depuis « À remettre au coursier »." : "") + "</p>") +
            "<h5 class='ox-h5'><i class='fa fa-history'></i> Historique</h5><ul class='ox-histo'>" + $.map(p.historique || [], function (h) {
                return "<li><span class='cx-muted'>" + U.esc(U.toFr(h.date)) + "</span> " + U.esc(h.action) + " <small class='cx-muted'>· " + U.esc(h.user) + "</small></li>";
            }).join("") + "</ul>";
        var pied = "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Fermer</button>" +
            (s === "PLANIFIEE" ? "<button type='button' class='cx-btn cx-btn-ghost text-danger' id='dp-annuler'><i class='fa fa-ban'></i> Annuler la tournée</button>" : "") +
            "<button type='button' class='cx-btn cx-btn-ghost' id='dp-dupliquer'><i class='fa fa-clone'></i> Dupliquer</button>" +
            (modifiable(p) ? "<button type='button' class='cx-btn cx-btn-ghost' id='dp-modifier'><i class='fa fa-pencil'></i> Modifier</button>" : "") +
            (p.date === today && modifiable(p) ? "<a class='cx-btn cx-btn-primary' href='instance.html?tournee=" + p.id + "#coursier'><i class='fa fa-cubes'></i> Affecter des colis</a>" : "");
        var $m = O.modale("ox-tournee", "Tournée " + U.esc(p.numero), "fa-calendar-check-o", corps, pied, "modal-lg");
        $m.on("click", "#dp-modifier", function () { $m.modal("hide"); setTimeout(function () { formulaire(p); }, 350); });
        $m.on("click", "#dp-dupliquer", function () { $m.modal("hide"); setTimeout(function () { formulaire($.extend({}, p, { id: null, numero: null, numeroSource: p.numero, date: p.date >= today ? U.addDays(p.date, 1) : today, ficheIds: [], statut: "PLANIFIEE", historique: [] }), true); }, 350); });
        $m.on("click", "#dp-annuler", function () {
            $m.modal("hide");
            U.confirm({ title: "Annuler la tournée " + p.numero, message: "La tournée du " + U.toFr(p.date) + " (" + U.esc(p.heureDebut + "–" + p.heureFin) + ", " + U.esc(O.zoneLib(p.zone)) + ") ne sera plus proposée lors de la création des fiches de livraison.", okText: "Annuler la tournée", okClass: "cx-btn-danger", cancelText: "Conserver" })
                .done(function () {
                    // TODO API : POST /exploitation/tournees-planifiees/{id}/annuler
                    CX.api.get("plannings", p.id).then(function (pp) {
                        pp.statut = "ANNULEE";
                        pp.historique = pp.historique || [];
                        pp.historique.unshift({ date: U.now(), user: CX.CONFIG.USER.nom, action: "Tournée annulée" });
                        return CX.api.save("plannings", pp);
                    }).done(function () { U.toast("Tournée " + U.esc(p.numero) + " annulée.", "success"); charger(); });
                });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (window.location.hash && window.history.replaceState) window.history.replaceState(null, "", window.location.pathname + window.location.search); });
        $m.modal("show");
    }
    function info(l, v, html) { return "<div class='ox-info'><small>" + l + "</small><b>" + (html ? v : U.esc(v)) + "</b></div>"; }

    /* ---------------- Création / modification ---------------- */
    function formulaire(p0, copie) {
        var nouveau = !p0 || !p0.id;
        var p = $.extend({ date: today >= lundi ? today : lundi, heureDebut: "08:00", heureFin: "12:00", zone: "Z1", quartiers: [], livreurId: null, capacite: 12, observations: "" }, p0 || {});
        var actifs = $.grep(livreursVille(), function (l) { return l.statut === "ACTIF" || l.id === p.livreurId; });
        var jours = joursSemaine();
        var corps = "<div class='ox-grid-3'>" +
            O.champ("tp-date", "Date", "<input type='date' class='form-control' id='tp-date' min='" + today + "' value='" + p.date + "'>", true) +
            O.champ("tp-debut", "Départ", "<input type='time' class='form-control' id='tp-debut' value='" + p.heureDebut + "'>", true) +
            O.champ("tp-fin", "Retour prévu", "<input type='time' class='form-control' id='tp-fin' value='" + p.heureFin + "'>", true) +
            O.champ("tp-zone", "Zone", "<select class='form-control' id='tp-zone'>" + $.map(CX.REF.ZONES_LIVRAISON, function (z) { return "<option value='" + z.code + "'" + (z.code === p.zone ? " selected" : "") + ">" + U.esc(z.nom) + "</option>"; }).join("") + "</select>", true) +
            O.champ("tp-livreur", "Livreur affecté", "<select class='form-control' id='tp-livreur'><option value=''>À désigner plus tard</option>" + $.map(actifs, function (l) {
                return "<option value='" + l.id + "'" + (l.id === p.livreurId ? " selected" : "") + ">" + U.esc(l.nom + " · " + l.vehicule) + "</option>";
            }).join("") + "</select>") +
            O.champ("tp-cap", "Capacité (colis)", "<input type='number' class='form-control' id='tp-cap' min='1' max='200' value='" + (p.capacite || "") + "'>", false, "Nombre maximum de colis de la tournée") +
            "</div>" +
            O.champ("tp-quartiers", "Quartiers desservis", "<select class='form-control' id='tp-quartiers' multiple></select>", false, "Choisissez dans la liste ou saisissez un quartier") +
            O.champ("tp-obs", "Observations <span class='cx-opt'>(consignes au livreur)</span>", "<input type='text' class='form-control' id='tp-obs' maxlength='200' value='" + U.esc(p.observations || "") + "'>") +
            (nouveau ? "<div class='cx-field'><label class='cx-label'>Répéter la même tournée cette semaine <span class='cx-opt'>(facultatif)</span></label><div class='ox-flex'>" +
                $.map(jours, function (d) {
                    var dis = d < today;
                    return "<label class='cx-pill'><input type='checkbox' data-rep value='" + d + "'" + (dis ? " disabled" : "") + "><span>" + jourLib(d) + "</span></label>";
                }).join("") + "</div></div>" : "");
        var $m = O.modale("ox-tp-form", nouveau ? (copie ? "Dupliquer la tournée" : "Planifier une tournée") : "Modifier la tournée " + U.esc(p.numero), "fa-calendar-plus-o", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='tp-ok'><i class='fa fa-check'></i> Enregistrer</button>", "modal-lg");
        function quartiersOptions() {
            var z = $("#tp-zone").val(), base = ((QZ[A.ville] || {})[z] || []).slice(), sel = $("#tp-quartiers").val() || p.quartiers || [];
            $.each(sel, function (_, q) { if ($.inArray(q, base) < 0) base.push(q); });
            $("#tp-quartiers").html($.map(base, function (q) { return "<option" + ($.inArray(q, sel) >= 0 ? " selected" : "") + ">" + U.esc(q) + "</option>"; }).join("")).trigger("change");
        }
        $m.on("shown.bs.modal", function () {
            if ($.fn.select2) $("#tp-quartiers").select2({ width: "100%", tags: true, placeholder: "Quartiers de la zone", dropdownParent: $m });
            quartiersOptions();
        });
        $m.on("change", "#tp-zone", function () { p.quartiers = []; $("#tp-quartiers").val([]); quartiersOptions(); });
        $m.on("click", "#tp-ok", function () {
            O.effacerErreurs($m);
            var date = $("#tp-date").val(), deb = $("#tp-debut").val(), fin = $("#tp-fin").val(), lid = $("#tp-livreur").val(), cap = parseInt($("#tp-cap").val(), 10) || null;
            if (!date || date < today) return O.erreurChamp($m, "#tp-date", "Date passée : choisissez aujourd'hui ou un jour à venir.");
            if (!deb) return O.erreurChamp($m, "#tp-debut", "Heure de départ obligatoire.");
            if (!fin || fin <= deb) return O.erreurChamp($m, "#tp-fin", "Le retour doit être après le départ.");
            var dates = [date];
            $m.find("[data-rep]:checked").each(function () { if ($.inArray(this.value, dates) < 0) dates.push(this.value); });
            var l = $.grep(livreurs, function (x) { return String(x.id) === String(lid); })[0] || null;
            /* chevauchement d'horaires pour le même livreur */
            if (l) {
                var conflits = $.grep(plannings, function (x) {
                    return x.livreurId === l.id && x.id !== p.id && x.statut !== "ANNULEE" && $.inArray(x.date, dates) >= 0 && x.heureDebut < fin && deb < x.heureFin;
                });
                if (conflits.length) return O.erreurChamp($m, "#tp-livreur", l.nom + " a déjà une tournée sur ce créneau : " + $.map(conflits, function (x) { return x.numero + " (" + U.toFr(x.date) + " " + x.heureDebut + "–" + x.heureFin + ")"; }).join(", ") + ".");
            }
            var base = {
                heureDebut: deb, heureFin: fin, zone: $("#tp-zone").val(), quartiers: $("#tp-quartiers").val() || [], livreurId: l ? l.id : null, livreurNom: l ? l.nom : "",
                vehicule: l ? l.vehicule : "", capacite: cap, observations: $.trim($("#tp-obs").val()), agenceId: A.id, ville: A.ville, agence: A.nom
            };
            var $b = $(this); U.busy($b, true);
            var i = 0, crees = [];
            (function suivant() {
                if (i >= dates.length) {
                    $m.modal("hide");
                    U.toast(nouveau ? O.pl(crees.length, "tournée planifiée", "tournées planifiées") + " : " + $.map(crees, function (x) { return "<b>" + U.esc(x.numero) + "</b>"; }).join(", ") + "." : "Tournée <b>" + U.esc(p.numero) + "</b> modifiée.", "success");
                    lundi = lundiDe(date); jourSel = date;
                    charger();
                    return;
                }
                var d = dates[i++], o;
                if (nouveau) {
                    o = $.extend({}, base, { numero: O.numeroPlanning(d), date: d, statut: "PLANIFIEE", ficheIds: [], historique: [{ date: U.now(), user: CX.CONFIG.USER.nom, action: copie ? "Tournée planifiée (copie de " + (p0.numeroSource || "une tournée") + ")" : "Tournée planifiée" }] });
                } else {
                    o = $.extend({}, p, base, { date: d });
                    o.historique = [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Tournée modifiée" + (l && l.id !== p.livreurId ? " (livreur : " + l.nom + ")" : "") }].concat(p.historique || []);
                }
                // TODO API : POST /exploitation/tournees-planifiees  ou  PUT /exploitation/tournees-planifiees/{id}
                CX.api.save("plannings", o).done(function (x) { crees.push(x); }).always(suivant);
            })();
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    /* Copie de la semaine précédente sur les jours (à venir) sans tournée */
    function copierSemaine() {
        var prec = U.addDays(lundi, -7), finPrec = U.addDays(lundi, -1);
        var sources = $.grep(plannings, function (p) { return p.date >= prec && p.date <= finPrec && p.statut !== "ANNULEE"; });
        var occupes = {}; $.each(semaine(), function (_, p) { if (p.statut !== "ANNULEE") occupes[p.date] = true; });
        var acreer = $.grep(sources, function (p) { var d = U.addDays(p.date, 7); return d >= today && !occupes[d]; });
        if (!acreer.length) { U.toast("Rien à copier : les jours à venir de la semaine ont déjà des tournées (ou la semaine précédente n'en a pas).", "info"); return; }
        U.confirm({ title: "Copier la semaine précédente", message: O.pl(acreer.length, "tournée de la semaine du " + U.toFr(prec) + " sera reprise", "tournées de la semaine du " + U.toFr(prec) + " seront reprises") + " sur les jours sans tournée (mêmes horaires, zones, livreurs et capacités).", okText: "Copier" })
            .done(function () {
                var i = 0;
                (function suivant() {
                    if (i >= acreer.length) { U.toast(O.pl(acreer.length, "tournée copiée", "tournées copiées") + ".", "success"); charger(); return; }
                    var s = acreer[i++], d = U.addDays(s.date, 7);
                    // TODO API : POST /exploitation/tournees-planifiees/copier-semaine  { agenceId, semaineSource }
                    CX.api.save("plannings", $.extend({}, s, { id: null, numero: O.numeroPlanning(d), date: d, statut: "PLANIFIEE", ficheIds: [],
                        historique: [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Tournée planifiée (copie de " + s.numero + ")" }] })).always(suivant);
                })();
            });
    }

    /* ---------------- Chargement / rendu ---------------- */
    function rendre() {
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $.each(["planning", "jour", "kanban", "calendrier", "gantt", "liste"], function (_, k) { $("#vue-" + k).toggleClass("cx-hidden", k !== onglet); });
        var fin = U.addDays(lundi, 6);
        $("#sem-lib").text("du " + U.toFr(lundi) + " au " + U.toFr(fin));
        $("#n-semaine").text(semaine().length);
        $("#n-jour").text($.grep(plannings, function (p) { return p.date === jourSel; }).length);
        var liste = $.grep(plannings, filtre);
        $("#n-liste").text(liste.length);
        if (onglet === "planning") rendrePlanning();
        if (onglet === "jour") rendreJour();
        if (onglet === "kanban") rendreKanban();
        if (onglet === "calendrier") rendreCalendrier();
        if (onglet === "gantt") rendreGantt();
        if (onglet === "liste") dt.setRows(liste);
        try { window.localStorage.setItem("cx_vue_tournees", onglet); } catch (e) { /* */ }
    }
    function charger() {
        // TODO API : GET /exploitation/tournees-planifiees?agence={id}&du=&au=  (+ fiches de livraison et livreurs)
        return $.when(O.charger(), CX.api.list("plannings"), CX.api.list("tournees"), CX.api.list("livreurs")).done(function (r1, pl, tr, lv) {
            exps = {}; $.each(r1[0], function (_, e) { exps[e.id] = e; });
            f = O.files(r1[0], r1[1]);
            plannings = $.grep(pl, function (p) { return O.estMoi(p.agenceId); });
            fiches = tr; fichesMap = {}; $.each(tr, function (_, x) { fichesMap[x.id] = x; });
            livreurs = lv;
            if (!$("#f-zone option").length) initFiltres();
            var duJour = $.grep(plannings, function (p) { return p.date === today && p.statut !== "ANNULEE"; });
            var enCours = $.grep(duJour, function (p) { return statut(p) === "EN_COURS"; }).length;
            var mobilises = {}; $.each(duJour, function (_, p) { if (p.livreurId) mobilises[p.livreurId] = true; });
            var nMob = $.map(mobilises, function () { return 1; }).length, actifs = $.grep(livreursVille(), function (l) { return l.statut === "ACTIF"; }).length;
            var cap = 0, aff = 0; $.each(duJour, function (_, p) { cap += p.capacite || 0; aff += charge(p); });
            var semaineSuiv = $.grep(plannings, function (p) { return p.date > today && p.date <= U.addDays(today, 7) && p.statut !== "ANNULEE"; }).length;
            $("#kpis").html([
                O.kpi("Tournées aujourd'hui", duJour.length, O.pl(enCours, "en cours", "en cours") + " · " + O.pl(duJour.length - enCours, "à venir", "à venir"), "fa-calendar-check-o", "blue"),
                O.kpi("Livreurs mobilisés", nMob + " <small>/ " + actifs + "</small>", "livreurs actifs à " + G.villeNom(A.ville), "fa-users", "purple"),
                O.kpi("Colis affectés", aff + " <small>/ " + cap + "</small>", "capacité planifiée du jour", "fa-cubes", "green"),
                O.kpi("À remettre au coursier", f.aMettreEnLivraison.length, "colis en attente d'une fiche", "fa-map-marker", "orange", "instance.html#coursier"),
                O.kpi("7 prochains jours", semaineSuiv, "tournées déjà programmées", "fa-calendar", "")
            ].join(""));
            rendre();
            var h = /^#p(\d+)$/.exec(window.location.hash || "");
            if (h && parId(h[1])) detail(parId(h[1]));
        });
    }

    /* ---------------- Évènements ---------------- */
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); rendre(); });
    $("#sem-prec").on("click", function () { lundi = U.addDays(lundi, -7); rendre(); });
    $("#sem-suiv").on("click", function () { lundi = U.addDays(lundi, 7); rendre(); });
    $("#sem-auj").on("click", function () { lundi = lundiDe(today); jourSel = today; rendre(); });
    $("#f-zone, #f-livreur, #f-statut").on("change", rendre);
    $("#q").on("input", rendre);
    $("#f-jour").on("change", function () { jourSel = this.value || today; lundi = lundiDe(jourSel); rendre(); });
    $("#planning").on("click", "[data-p]", function () { detail(parId($(this).data("p"))); });
    $("#planning, #cartes-jour").on("click", "[data-add]", function (ev) {
        ev.preventDefault();
        var liv = $(this).data("liv");
        formulaire({ date: String($(this).data("add")), livreurId: liv ? Number(liv) : null });
    });
    $("#kanban, #calendrier, #gantt").on("click", "[data-id]", function () { detail(parId($(this).data("id"))); });
    $("#kanban, #calendrier, #gantt").on("keydown", "[data-id]", function (e) { if (e.which === 13) detail(parId($(this).data("id"))); });
    $("#gt-jour").on("change", function () { jourSel = this.value || today; lundi = lundiDe(jourSel); rendre(); });
    $("#gt-prec, #gt-suiv").on("click", function () { jourSel = U.addDays(jourSel, this.id === "gt-prec" ? -1 : 1); lundi = lundiDe(jourSel); rendre(); });
    $("#cartes-jour").on("click", "[data-voir]", function () { detail(parId($(this).closest("[data-p]").data("p"))); });
    $("#dt-liste").on("click", "[data-voir]", function (ev) { ev.preventDefault(); detail(parId($(this).closest("tr").data("id"))); });
    $("#btn-nouvelle").on("click", function () { formulaire(null); });
    $("#btn-copier").on("click", copierSemaine);

    charger();
});

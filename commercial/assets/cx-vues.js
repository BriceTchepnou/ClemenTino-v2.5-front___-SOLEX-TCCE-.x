/* =====================================================================
   ClemenTino 2.0 - Vues multiples d'une liste (CX.vues)
   ---------------------------------------------------------------------
   À charger APRÈS cx-core.js. ES5 + jQuery, aucun build.
   Afficher les mêmes lignes sous plusieurs formes : tableau (CX.DataTable
   existant), cartes, Kanban, calendrier (mois), Gantt (frise).

   Rendus indépendants (utilisables seuls) :
     CX.vues.cartes($el, rows, { carte(r) -> html })
     CX.vues.kanban($el, rows, { colonnes: [{ code, label, color }], valeur(r) -> code,
                                 carte(r) -> html, entete(col, rows) -> html (optionnel) })
     CX.vues.calendrier($el, rows, { mois "AAAA-MM", date(r) -> "AAAA-MM-JJ", puce(r) -> html,
                                     max (puces par jour, 3), onMois(nouveauMois) })
     CX.vues.gantt($el, rows, { ligne(r) -> libellé de ligne, debut(r) / fin(r) -> "AAAA-MM-JJ HH:MM",
                                libelle(r), couleur(r) (blue|green|orange|purple|red|grey),
                                du, au ("AAAA-MM-JJ" ; un seul jour = axe en heures) })
   Chaque élément porte data-id (= r.id) : la page branche ses clics.

   Sélecteur de vue (boutons) + mémorisation du choix :
     var sw = new CX.vues.Selecteur("#slot", { cle: "vue-bordereaux", vues: ["table", "kanban", "calendrier"],
                                                defaut: "table", onChange: function (vue) { ... } });
     sw.vue()   vue courante
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.vues = (function () {
    var U = CX.util;
    var LIB = {
        table: { label: "Tableau", icon: "fa-table" },
        grille: { label: "Grille", icon: "fa-th" },
        cartes: { label: "Cartes", icon: "fa-th-large" },
        kanban: { label: "Kanban", icon: "fa-columns" },
        calendrier: { label: "Calendrier", icon: "fa-calendar" },
        gantt: { label: "Gantt", icon: "fa-align-left" }
    };
    var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    var JOURS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

    /* ---------------- Sélecteur de vue ---------------- */
    function Selecteur(cible, o) {
        var self = this;
        this.o = $.extend({ vues: ["table", "cartes"], defaut: null, cle: null, onChange: null, libelles: {} }, o);
        var memo = null;
        try { memo = this.o.cle ? window.localStorage.getItem("cx_vue_" + this.o.cle) : null; } catch (e) { memo = null; }
        this.courante = $.inArray(memo, this.o.vues) >= 0 ? memo : (this.o.defaut || this.o.vues[0]);
        this.$el = $(cible).addClass("cx-vue-switch").attr("role", "group").attr("aria-label", "Mode d'affichage");
        this.$el.html($.map(this.o.vues, function (v) {
            var l = $.extend({}, LIB[v] || { label: v, icon: "fa-eye" }, self.o.libelles[v] || {});
            return "<button type='button' data-vue='" + v + "' title='Vue " + U.esc(l.label.toLowerCase()) + "'><i class='fa " + l.icon + "'></i><span>" + U.esc(l.label) + "</span></button>";
        }).join(""));
        this.$el.on("click", "[data-vue]", function () { self.choisir($(this).data("vue")); });
        this.marquer();
    }
    Selecteur.prototype.marquer = function () {
        this.$el.find("[data-vue]").removeClass("active").attr("aria-pressed", "false").filter("[data-vue='" + this.courante + "']").addClass("active").attr("aria-pressed", "true");
    };
    Selecteur.prototype.choisir = function (v) {
        this.courante = v;
        try { if (this.o.cle) window.localStorage.setItem("cx_vue_" + this.o.cle, v); } catch (e) { /* */ }
        this.marquer();
        if (this.o.onChange) this.o.onChange(v);
    };
    Selecteur.prototype.vue = function () { return this.courante; };

    function vide(icone, texte) { return "<div class='cx-empty'><i class='fa " + (icone || "fa-inbox") + "'></i><b>" + U.esc(texte || "Aucun élément") + "</b></div>"; }

    /* ---------------- Cartes ---------------- */
    function cartes($el, rows, o) {
        $($el).html(rows.length ? "<div class='cx-vue-cartes'>" + $.map(rows, function (r) {
            return "<div class='cx-vue-carte' data-id='" + r.id + "' tabindex='0'>" + o.carte(r) + "</div>";
        }).join("") + "</div>" : vide(o.icone, o.vide));
    }

    /* ---------------- Kanban ---------------- */
    function kanban($el, rows, o) {
        var par = {};
        $.each(o.colonnes, function (_, c) { par[c.code] = []; });
        $.each(rows, function (_, r) { var v = o.valeur(r); if (par[v]) par[v].push(r); });
        $($el).html("<div class='cx-kanban'>" + $.map(o.colonnes, function (c) {
            var l = par[c.code];
            return "<section class='cx-kb-col cx-kb-" + (c.color || "grey") + "'><header><span class='cx-kb-dot'></span><b>" + U.esc(c.label) + "</b><span class='cx-count'>" + l.length + "</span>" +
                (o.entete ? "<small>" + o.entete(c, l) + "</small>" : "") + "</header>" +
                "<div class='cx-kb-list'>" + (l.length ? $.map(l, function (r) {
                    return "<div class='cx-kb-card' data-id='" + r.id + "' tabindex='0'>" + o.carte(r) + "</div>";
                }).join("") : "<div class='cx-kb-vide'>—</div>") + "</div></section>";
        }).join("") + "</div>");
    }

    /* ---------------- Calendrier (mois) ---------------- */
    function calendrier($el, rows, o) {
        var mois = o.mois || U.today().substr(0, 7), premier = mois + "-01", today = U.today(), max = o.max || 3;
        var dow = (new Date(premier + "T12:00:00").getDay() + 6) % 7, debut = U.addDays(premier, -dow);
        var par = {};
        $.each(rows, function (_, r) { var d = (o.date(r) || "").substr(0, 10); if (d) (par[d] = par[d] || []).push(r); });
        var m = parseInt(mois.substr(5, 2), 10) - 1, cells = "";
        for (var i = 0; i < 42; i++) {
            var d = U.addDays(debut, i), l = par[d] || [], hors = d.substr(0, 7) !== mois;
            if (i === 35 && hors) break;   // 5 semaines suffisent
            cells += "<div class='cx-cal-day" + (hors ? " hors" : "") + (d === today ? " today" : "") + "'><span class='cx-cal-num'>" + parseInt(d.substr(8, 2), 10) + "</span>" +
                $.map(l.slice(0, max), function (r) { return "<div class='cx-cal-item' data-id='" + r.id + "' tabindex='0'>" + o.puce(r) + "</div>"; }).join("") +
                (l.length > max ? "<a href='#' class='cx-cal-plus' data-jour='" + d + "'>+ " + (l.length - max) + " autre" + (l.length - max > 1 ? "s" : "") + "</a>" : "") + "</div>";
        }
        var $c = $($el);
        $c.html("<div class='cx-cal'><div class='cx-cal-nav'><button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-cal='-1' aria-label='Mois précédent'><i class='fa fa-chevron-left'></i></button>" +
            "<b>" + MOIS[m] + " " + mois.substr(0, 4) + "</b><button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-cal='1' aria-label='Mois suivant'><i class='fa fa-chevron-right'></i></button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-cal='0'>Ce mois-ci</button></div>" +
            "<div class='cx-cal-grid'>" + $.map(JOURS, function (j) { return "<div class='cx-cal-head'>" + j + "</div>"; }).join("") + cells + "</div></div>");
        $c.off("click.cxcal").on("click.cxcal", "[data-cal]", function () {
            var k = Number($(this).data("cal")), nm;
            if (!k) nm = today.substr(0, 7);
            else { var dt = new Date(mois + "-15T12:00:00"); dt.setMonth(dt.getMonth() + k); nm = U.isoDate(dt).substr(0, 7); }
            if (o.onMois) o.onMois(nm);
        });
        $c.off("click.cxcalplus").on("click.cxcalplus", ".cx-cal-plus", function (e) {
            e.preventDefault();
            var d = $(this).data("jour");
            $(this).closest(".cx-cal-day").find(".cx-cal-item").remove().end().append($.map(par[d], function (r) { return "<div class='cx-cal-item' data-id='" + r.id + "' tabindex='0'>" + o.puce(r) + "</div>"; }).join(""));
            $(this).remove();
        });
    }

    /* ---------------- Gantt (frise) ---------------- */
    function minutes(dt) {   // "AAAA-MM-JJ HH:MM" -> minutes depuis 2000-01-01
        var d = U.daysBetween("2000-01-01", dt.substr(0, 10)), h = dt.length > 10 ? dt.substr(11, 5).split(":") : ["0", "0"];
        return d * 1440 + parseInt(h[0], 10) * 60 + parseInt(h[1] || "0", 10);
    }
    function gantt($el, rows, o) {
        var du = o.du, au = o.au || o.du, unJour = du === au;
        var t0 = minutes(du + (unJour ? " " + (o.heureMin || "07:00") : " 00:00")), t1 = minutes(au + (unJour ? " " + (o.heureMax || "20:00") : " 23:59")) + (unJour ? 0 : 1);
        var span = Math.max(1, t1 - t0), lignes = {}, ordre = [];
        $.each(rows, function (_, r) {
            var a = o.debut(r), b = o.fin(r) || a;
            if (!a) return;
            var ma = minutes(a), mb = Math.max(ma + (unJour ? 15 : 60), minutes(b.length > 10 ? b : b + " 23:59"));
            if (mb < t0 || ma > t1) return;
            var k = o.ligne(r);
            if (!lignes[k]) { lignes[k] = []; ordre.push(k); }
            lignes[k].push({ r: r, a: Math.max(ma, t0), b: Math.min(mb, t1), coupeA: ma < t0, coupeB: mb > t1 });
        });
        if (o.lignes) $.each(o.lignes, function (_, k) { if (!lignes[k]) { lignes[k] = []; ordre.push(k); } });
        if (o.trierLignes !== false) ordre.sort();
        /* graduations : heures (un jour) ou jours */
        var ticks = [];
        if (unJour) { for (var h = parseInt((o.heureMin || "07:00"), 10); h <= parseInt((o.heureMax || "20:00"), 10); h++) ticks.push({ pos: (h * 60 - minutes("2000-01-01 " + (o.heureMin || "07:00"))) / span, lib: U.pad(h) + "h" }); }
        else { var nj = U.daysBetween(du, au) + 1; for (var j = 0; j < nj; j++) { var dj = U.addDays(du, j); ticks.push({ pos: j / nj, larg: 1 / nj, lib: JOURS[(new Date(dj + "T12:00:00").getDay() + 6) % 7] + " " + dj.substr(8, 2) + "/" + dj.substr(5, 2), today: dj === U.today(), off: new Date(dj + "T12:00:00").getDay() === 0 }); } }
        var nowPos = (minutes(U.now()) - t0) / span;
        var axe = "<div class='cx-gt-axe'>" + $.map(ticks, function (t) {
            return "<span class='" + (t.today ? "today" : "") + "' style='left:" + (t.pos * 100) + "%" + (t.larg ? ";width:" + (t.larg * 100) + "%" : "") + "'>" + U.esc(t.lib) + "</span>";
        }).join("") + "</div>";
        var fond = "<div class='cx-gt-fond'>" + $.map(ticks, function (t) {
            return "<i class='" + (t.off ? "off " : "") + (t.today ? "today" : "") + "' style='left:" + (t.pos * 100) + "%" + (t.larg ? ";width:" + (t.larg * 100) + "%" : "") + "'></i>";
        }).join("") + (nowPos > 0 && nowPos < 1 ? "<b class='cx-gt-now' style='left:" + (nowPos * 100) + "%' title='Maintenant'></b>" : "") + "</div>";
        $($el).html(ordre.length ? "<div class='cx-gantt" + (unJour ? " heures" : "") + "'><div class='cx-gt-row cx-gt-head'><div class='cx-gt-lab'>" + U.esc(o.titreLignes || "") + "</div><div class='cx-gt-track'>" + axe + "</div></div>" +
            $.map(ordre, function (k) {
                return "<div class='cx-gt-row'><div class='cx-gt-lab' title='" + U.esc(k) + "'>" + U.esc(k) + "</div><div class='cx-gt-track'>" + fond +
                    $.map(lignes[k], function (x) {
                        return "<div class='cx-gt-bar cx-gt-" + (o.couleur ? o.couleur(x.r) : "blue") + (x.coupeA ? " coupe-a" : "") + (x.coupeB ? " coupe-b" : "") + "' data-id='" + x.r.id + "' tabindex='0' " +
                            "style='left:" + ((x.a - t0) / span * 100) + "%;width:" + Math.max(unJour ? 0.8 : 6, (x.b - x.a) / span * 100) + "%' title='" + U.esc(o.titre ? o.titre(x.r) : o.libelle(x.r)) + "'>" + U.esc(o.libelle(x.r)) + "</div>";
                    }).join("") + "</div></div>";
            }).join("") + "</div>" : vide(o.icone || "fa-align-left", o.vide || "Rien sur la période"));
    }

    /* ---------------- Branchement sur un CX.DataTable existant ----------------
       CX.vues.brancher(dt, {
           slot: "#vue-slot",            // où placer les boutons de vue
           cle: "bordereaux",            // mémorisation du choix
           vues: ["table", "kanban", "calendrier", "gantt"],
           kanban: { colonnes, valeur, carte }, cartes: { carte },
           calendrier: { date, puce },   gantt: function (rows) { return { du, au, ligne, debut, fin, libelle, couleur }; },
           onOuvrir: function (row) { ... }   // clic / Entrée sur un élément
       });
       Les autres vues affichent les lignes FILTRÉES et TRIÉES du tableau (recherche comprise). */
    function brancher(dt, o) {
        var $table = dt.$c, mois = U.today().substr(0, 7);
        if (!$table.length && o.table) $table = $(o.table);
        var $body = $("<div class='cx-vue-body cx-hidden'></div>").insertAfter($table);
        var sw = new Selecteur(o.slot, { cle: o.cle, vues: o.vues, defaut: "table", libelles: o.libelles || {}, onChange: maj });
        function maj() {
            var v = sw.vue(), rows = dt.getFiltered();
            $table.toggleClass("cx-hidden", v !== "table");
            $body.toggleClass("cx-hidden", v === "table");
            if (o.onVue) o.onVue(v);
            if (v === "table") return;
            if (v === "kanban") kanban($body, rows, o.kanban);
            else if (v === "cartes") cartes($body, rows, o.cartes);
            else if (v === "calendrier") calendrier($body, rows, $.extend({}, o.calendrier, { mois: mois, onMois: function (m) { mois = m; maj(); } }));
            else if (v === "gantt") gantt($body, rows, o.gantt(rows));
        }
        var orig = dt.render;
        dt.render = function () { var r = orig.apply(dt, arguments); maj(); return r; };
        function ouvrir(el) {
            var id = $(el).data("id"), row = $.grep(dt.rows || [], function (r) { return String(dt.o.rowId(r)) === String(id); })[0];
            if (row && o.onOuvrir) o.onOuvrir(row);
        }
        $body.on("click", "[data-id]", function (e) { if ($(e.target).closest("a, button").length) return; ouvrir(this); });
        $body.on("keydown", "[data-id]", function (e) { if (e.which === 13) ouvrir(this); });
        maj();
        return { selecteur: sw, maj: maj, $body: $body };
    }

    return { Selecteur: Selecteur, cartes: cartes, kanban: kanban, calendrier: calendrier, gantt: gantt, brancher: brancher, LIB: LIB };
})();

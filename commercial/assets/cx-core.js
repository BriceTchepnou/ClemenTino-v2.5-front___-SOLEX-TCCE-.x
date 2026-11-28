/* =====================================================================
   ClemenTino 2.0 - Module COMMERCIAL - noyau JS commun
   ---------------------------------------------------------------------
   jQuery 1.12+ / Bootstrap 3. Aucun build, aucun framework.
   Expose l'espace de noms global CX :
     CX.CONFIG      paramètres (TVA, devise, utilisateur courant…)
     CX.util        fonctions utilitaires (formats, dates, toasts, confirm…)
     CX.DataTable   petit composant tableau (tri, recherche, pagination, sélection)
   Les données (référentiels + store simulé) sont dans cx-data.js.
   Le menu / en-tête est injecté par cx-shell.js.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

/* =====================================================================
   MULTI-ENTREPRISE : l'application épouse la charte (couleurs), le logo
   et les coordonnées de l'entreprise choisie dans le pied de page.
   Tous les documents (factures, cotations, reçus, bordereaux, fiches,
   états, PDF) lisent CX.CONFIG.SOCIETE.
   >>> INTÉGRATION SYMFONY <<< : la société vient du tenant connecté
   (paramètres société en base) ; le sélecteur est réservé à la démo.
   Logo : chemin relatif au dossier commercial/ (préfixé par CX_BASE
   ailleurs, voir CX.societe.logoUrl()).
   ===================================================================== */
CX.SOCIETES = {
    SOLEX: {
        code: "SOLEX", nom: "SOLEX EXPRESS", nomCourt: "Solex", alias: "Solex Messagerie Express",
        slogan: "Messagerie express · Le TGV de l'expédition",
        logo: "assets/img/societes/solex-banniere.png", icone: "assets/img/societes/solex-logo.png",
        adresse: "Akwa - Douala, Cameroun",
        tel: "+237 677 087 901 / +237 677 087 903",
        email: "info@solextgv.com", site: "www.solextgv.com",
        rccm: "RC/DLA/2015/B/0000",           // TODO : RCCM réel
        niu: "M000000000000X",                // TODO : NIU réel
        banque: "Afriland First Bank - CM10005 00001 00000000000 00",
        theme: { navy: "#13306b", navyTop: "#163877", navy2: "#1d4fa3", navy3: "#2a63c4", soft: "#e8f0fd", accent: "#ffd400", footerText: "#c9d6f0" }
    },
    TL: {
        code: "TL", nom: "TOURISTIQUE LOGISTIQUE", nomCourt: "Touristique", alias: "TL · TCCE · Touristique",
        slogan: "Nous le faisons express",
        logo: "assets/img/societes/touristique-logo.png", icone: "assets/img/societes/touristique-logo.png",
        adresse: "Immeuble Jaco - BP 4473 Yaoundé, Cameroun",
        tel: "+237 222 211 098",
        email: "contact@tcce-sa.com", site: "www.tcce-sa.com",
        rccm: "RC/YAO/0000/B/0000",           // TODO : RCCM réel
        niu: "M000000000000Y",                // TODO : NIU réel
        banque: "Banque - RIB à renseigner",
        theme: { navy: "#1d4f17", navyTop: "#24611c", navy2: "#3b8f27", navy3: "#56ad3c", soft: "#e8f4e2", accent: "#111111", footerText: "#d3e8cb" }
    }
};
/* Entreprise personnalisée (« Autre entreprise… ») : enregistrée dans le navigateur */
CX.SOCIETE_PERSO_CLE = "cx_societe_perso";
CX.SOCIETE_CLE = "cx_societe";

CX.CONFIG = {
    SOCIETE: null,            // renseigné par CX.societe.init() ci-dessous
    TVA: 19.25,               // % TVA Cameroun (TVA 17,5 % + CAC 10 %)
    DEVISE: "FCFA",
    DELAI_PAIEMENT_JOURS: 30, // échéance par défaut des factures
    VALIDITE_COTATION_JOURS: 30,
    USER: { id: 1, nom: "Support KuTiWa", ville: "DOUALA", agence: "AKWA" }
};

/* =====================================================================
   Utilitaires
   ===================================================================== */
CX.util = {
    pad: function (n) { return (n < 10 ? "0" : "") + n; },

    /* Dates au format ISO "YYYY-MM-DD" côté données, "JJ/MM/AAAA" à l'écran */
    today: function () { return CX.util.isoDate(new Date()); },
    isoDate: function (d) { return d.getFullYear() + "-" + CX.util.pad(d.getMonth() + 1) + "-" + CX.util.pad(d.getDate()); },
    now: function () { var d = new Date(); return CX.util.today() + " " + CX.util.pad(d.getHours()) + ":" + CX.util.pad(d.getMinutes()); },
    addDays: function (iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return CX.util.isoDate(d); },
    daysBetween: function (a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); },
    firstOfMonth: function (iso) { return (iso || CX.util.today()).substr(0, 8) + "01"; },
    lastOfMonth: function (iso) {
        var d = new Date((iso || CX.util.today()).substr(0, 8) + "01T12:00:00");
        d.setMonth(d.getMonth() + 1); d.setDate(0); return CX.util.isoDate(d);
    },
    toFr: function (iso) {
        if (!iso) return "";
        var p = iso.substr(0, 10).split("-");
        return p[2] + "/" + p[1] + "/" + p[0] + (iso.length > 10 ? " " + iso.substr(11, 5) : "");
    },
    toFrLong: function (iso) {
        if (!iso) return "";
        var mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
        var p = iso.substr(0, 10).split("-");
        return parseInt(p[2], 10) + " " + mois[parseInt(p[1], 10) - 1] + " " + p[0];
    },

    /* Nombres / montants */
    fmt: function (n, dec) {
        if (n == null || n === "" || isNaN(n)) return "";
        var s = Number(n).toFixed(dec || 0).split(".");
        s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, " "); // espace fine insécable
        return s.join(",");
    },
    money: function (n) { return n == null || isNaN(n) ? "—" : CX.util.fmt(Math.round(n)) + " " + CX.CONFIG.DEVISE; },
    round: function (n) { return Math.round(Number(n) || 0); },
    num: function (v) { var n = parseFloat(String(v == null ? "" : v).replace(/\s| /g, "").replace(",", ".")); return isNaN(n) ? 0 : n; },

    /* Calcul HT -> TVA -> TTC (montants arrondis au franc) */
    taxes: function (ht, tauxTva) {
        var taux = tauxTva == null ? CX.CONFIG.TVA : tauxTva;
        ht = CX.util.round(ht);
        var tva = CX.util.round(ht * taux / 100);
        return { ht: ht, tva: tva, ttc: ht + tva, taux: taux };
    },

    esc: function (s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },
    initials: function (s) {
        var w = String(s || "?").replace(/[^A-Za-zÀ-ÿ0-9 ]/g, " ").split(/\s+/).filter(Boolean);
        return ((w[0] || "?").charAt(0) + (w[1] ? w[1].charAt(0) : "")).toUpperCase();
    },
    queryParam: function (name) {
        var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    },
    debounce: function (fn, ms) {
        var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 200); };
    },
    normalize: function (s) {
        return String(s || "").toLowerCase().normalize ? String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : String(s || "").toLowerCase();
    },

    /* Montant en toutes lettres (français) - utilisé sur les factures */
    enLettres: function (n) {
        n = Math.floor(Math.abs(Number(n) || 0));
        if (n === 0) return "zéro";
        var u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
            "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
        var d = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
        function sous100(x) {
            if (x < 20) return u[x];
            var di = Math.floor(x / 10), un = x % 10;
            if (di === 7 || di === 9) return d[di] + (un === 1 && di === 7 ? "-et-" : "-") + u[10 + un];
            if (un === 0) return d[di] + (di === 8 ? "s" : "");
            if (un === 1 && di !== 8) return d[di] + "-et-un";
            return d[di] + "-" + u[un];
        }
        function sous1000(x, finale) {
            var c = Math.floor(x / 100), r = x % 100, s = "";
            if (c > 1) s = u[c] + "-cent" + (r === 0 && finale ? "s" : "");
            else if (c === 1) s = "cent";
            if (r) s += (s ? "-" : "") + sous100(r);
            return s;
        }
        var parts = [], unites = [[1e9, "milliard"], [1e6, "million"], [1e3, "mille"]];
        for (var i = 0; i < unites.length; i++) {
            var q = Math.floor(n / unites[i][0]);
            if (q) {
                if (unites[i][1] === "mille") parts.push(q === 1 ? "mille" : sous1000(q, false) + "-mille");
                else parts.push(sous1000(q, false) + "-" + unites[i][1] + (q > 1 ? "s" : ""));
                n = n % unites[i][0];
            }
        }
        if (n) parts.push(sous1000(n, true));
        return parts.join("-");
    },

    /* Toast de notification. type : success | error | warning | info */
    toast: function (msg, type) {
        type = type || "success";
        var icons = { success: "fa-check-circle", error: "fa-times-circle", warning: "fa-exclamation-triangle", info: "fa-info-circle" };
        if (!$("#cx-toasts").length) $("body").append('<div id="cx-toasts"></div>');
        var $t = $('<div class="cx-toast ' + type + '"><i class="fa ' + icons[type] + '"></i><div>' + msg + "</div></div>").hide();
        $("#cx-toasts").append($t);
        $t.fadeIn(120);
        setTimeout(function () { $t.fadeOut(250, function () { $t.remove(); }); }, type === "error" ? 6000 : 3500);
    },

    /* Boîte de confirmation (remplace window.confirm). Retourne une promesse.
       opts : { title, message (HTML), okText, okClass, cancelText } */
    confirm: function (opts) {
        opts = $.extend({ title: "Confirmation", okText: "Confirmer", okClass: "cx-btn-primary", cancelText: "Annuler" }, opts);
        var dfd = $.Deferred();
        $("#cx-confirm").remove();
        var $m = $(
            '<div class="modal fade" id="cx-confirm" tabindex="-1" role="dialog"><div class="modal-dialog" style="max-width:440px"><div class="modal-content">' +
            '<div class="modal-header"><button type="button" class="close" data-dismiss="modal">&times;</button>' +
            '<h4 class="modal-title"><i class="fa fa-question-circle"></i>' + CX.util.esc(opts.title) + "</h4></div>" +
            '<div class="modal-body">' + (opts.message || "") + "</div>" +
            '<div class="modal-footer"><button type="button" class="cx-btn cx-btn-ghost" data-dismiss="modal">' + opts.cancelText + "</button>" +
            '<button type="button" class="cx-btn ' + opts.okClass + '" data-ok>' + opts.okText + "</button></div>" +
            "</div></div></div>").appendTo("body");
        var ok = false;
        $m.on("click", "[data-ok]", function () { ok = true; $m.modal("hide"); });
        $m.on("hidden.bs.modal", function () { $m.remove(); ok ? dfd.resolve() : dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    },

    /* Bouton en état "chargement" pendant un appel serveur */
    busy: function ($btn, on) {
        $btn = $($btn);
        if (on) { $btn.data("html", $btn.html()).prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> ' + $btn.text()); }
        else { $btn.prop("disabled", false).html($btn.data("html")); }
    },

    /* Lit les champs [name] d'un conteneur vers un objet (gère checkbox, radio, select multiple) */
    readForm: function ($root) {
        var o = {};
        $($root).find("[name]").each(function () {
            var $f = $(this), n = $f.attr("name"), t = ($f.attr("type") || "").toLowerCase();
            if (t === "radio") { if ($f.is(":checked")) o[n] = $f.val(); else if (!(n in o)) o[n] = null; }
            else if (t === "checkbox") o[n] = $f.is(":checked");
            else if (t === "file") o[n] = this.files && this.files[0] ? this.files[0].name : (o[n] || null);
            else o[n] = $f.val();
        });
        return o;
    },
    /* Remplit les champs [name] d'un conteneur depuis un objet */
    fillForm: function ($root, data) {
        $($root).find("[name]").each(function () {
            var $f = $(this), n = $f.attr("name"), t = ($f.attr("type") || "").toLowerCase();
            if (!(n in data)) return;
            if (t === "radio") $f.prop("checked", String($f.val()) === String(data[n]));
            else if (t === "checkbox") $f.prop("checked", !!data[n]);
            else if (t !== "file") $f.val(data[n] == null ? "" : data[n]);
        });
        $($root).find("select").trigger("change.select2");
    },

    /* Marque les erreurs de validation : errs = [{ field:"raisonSociale", message:"..." }] */
    showErrors: function ($root, errs) {
        $root = $($root);
        $root.find(".cx-field.has-error").removeClass("has-error").find(".cx-error-text").remove();
        $.each(errs || [], function (_, e) {
            var $f = $root.find("[name='" + e.field + "']").first().closest(".cx-field");
            $f.addClass("has-error").append('<span class="cx-help cx-error-text">' + CX.util.esc(e.message) + "</span>");
        });
        if (errs && errs.length) {
            var $first = $root.find(".has-error").first();
            if ($first.length) $("html, body").animate({ scrollTop: $first.offset().top - 120 }, 200);
        }
    }
};

/* =====================================================================
   CX.societe - entreprise courante (multi-entreprise de démonstration)
     CX.societe.liste()        entreprises disponibles (+ personnalisée)
     CX.societe.code()         code de l'entreprise courante
     CX.societe.choisir(code)  change d'entreprise (rechargement de la page)
     CX.societe.logoUrl()      URL du logo utilisable depuis n'importe quel dossier
     CX.societe.enregistrerPerso(o)  enregistre l'entreprise personnalisée
   TODO API : GET /parametres/societe (tenant de l'utilisateur connecté)
   ===================================================================== */
CX.societe = (function () {
    function lire(cle) { try { return window.localStorage.getItem(cle); } catch (e) { return null; } }
    function perso() {
        var o = null;
        try { o = JSON.parse(lire(CX.SOCIETE_PERSO_CLE) || "null"); } catch (e) { o = null; }
        if (!o || !o.nom) return null;
        var c = o.couleur || "#334155", a = o.accent || "#f59e0b";
        return $.extend({ code: "PERSO", nomCourt: o.nom, alias: "Entreprise personnalisée", slogan: "", logo: "", adresse: "", tel: "", email: "", site: "", rccm: "", niu: "", banque: "" }, o, {
            code: "PERSO",
            theme: { navy: ombre(c, -0.35), navyTop: ombre(c, -0.25), navy2: c, navy3: ombre(c, 0.15), soft: ombre(c, 0.88), accent: a, footerText: ombre(c, 0.75) }
        });
    }
    /* éclaircit (k > 0) ou assombrit (k < 0) une couleur #rrggbb */
    function ombre(hex, k) {
        var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
        if (!m) return hex;
        var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        function f(x) { return Math.round(k < 0 ? x * (1 + k) : x + (255 - x) * k); }
        return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
    }
    function liste() {
        var l = $.map(CX.SOCIETES, function (s) { return s; }), p = perso();
        if (p) l.push(p);
        return l;
    }
    function trouver(code) { return $.grep(liste(), function (s) { return s.code === code; })[0] || null; }
    function appliquerTheme(s) {
        var t = s.theme || {};
        var css = ":root{--cx-navy:" + t.navy + ";--cx-navy-top:" + t.navyTop + ";--cx-navy-2:" + t.navy2 + ";--cx-navy-3:" + t.navy3 +
            ";--cx-blue-soft:" + t.soft + ";--cx-accent:" + t.accent + ";--cx-footer-text:" + t.footerText + ";}";
        var el = document.getElementById("cx-theme");
        if (!el) { el = document.createElement("style"); el.id = "cx-theme"; document.getElementsByTagName("head")[0].appendChild(el); }
        el.innerHTML = css;
        document.documentElement.setAttribute("data-societe", s.code);
    }
    var courante = null;
    function init() {
        courante = trouver(lire(CX.SOCIETE_CLE)) || CX.SOCIETES.SOLEX;
        CX.CONFIG.SOCIETE = $.extend(true, {}, courante);
        appliquerTheme(courante);
    }
    return {
        liste: liste, trouver: trouver, ombre: ombre, init: init,
        code: function () { return courante ? courante.code : "SOLEX"; },
        choisir: function (code) {
            try { window.localStorage.setItem(CX.SOCIETE_CLE, code); } catch (e) { /* navigation privée */ }
            window.location.reload();
        },
        logoUrl: function (s) {
            var l = (s || CX.CONFIG.SOCIETE).logo || "";
            if (!l || /^(https?:|data:|\/)/.test(l)) return l;
            return (window.CX_BASE || "") + l;
        },
        perso: perso,
        enregistrerPerso: function (o) {
            try { window.localStorage.setItem(CX.SOCIETE_PERSO_CLE, JSON.stringify(o)); return true; }
            catch (e) { return false; }   // quota dépassé (logo trop lourd)
        }
    };
})();
CX.societe.init();

/* =====================================================================
   CX.DataTable - tableau léger : tri, recherche, pagination, sélection.
   ---------------------------------------------------------------------
   var dt = new CX.DataTable("#monConteneur", {
       columns: [
         { key:"numero", title:"N°", sortable:true, render: function(row){ return ... }, className:"num", width:"120px",
           sortValue: function(row){ return ... }, searchValue: function(row){ return ... } },
         ...
       ],
       rows: [...],                 // données
       pageSize: 25,                // 10 | 25 | 50 | 100
       sortKey: "numero", sortDir: -1,
       selectable: true,            // cases à cocher
       rowId: function(row){ return row.id; },
       searchInput: "#recherche",   // champ de recherche rapide (optionnel)
       emptyText: "Aucune facture", emptyIcon: "fa-file-text-o",
       rowClass: function(row){ return ""; },
       footer: function(rows){ return "<tr>...</tr>"; },  // tfoot optionnel (reçoit les lignes filtrées)
       onSelect: function(selectedRows){ },
       onRender: function(){ }
   });
   dt.setRows(rows); dt.getSelected(); dt.clearSelection(); dt.refresh();
   Le conteneur reçoit le tableau + le pied (pagination). Délégation d'évènements
   possible sur le conteneur pour les boutons d'action (data-id sur <tr>).
   ===================================================================== */
CX.DataTable = function (container, opts) {
    this.$c = $(container);
    this.o = $.extend({
        columns: [], rows: [], pageSize: 25, sortKey: null, sortDir: 1, selectable: false,
        rowId: function (r) { return r.id; }, emptyText: "Aucune donnée à afficher", emptyIcon: "fa-inbox",
        rowClass: null, footer: null, onSelect: null, onRender: null, searchInput: null, pageSizes: [10, 25, 50, 100]
    }, opts);
    this.page = 1;
    this.search = "";
    this.selected = {};
    this._build();
    this.setRows(this.o.rows);
};
CX.DataTable.prototype = {
    _build: function () {
        var self = this, o = this.o;
        var head = "<tr>" + (o.selectable ? "<th class='cx-col-check'><input type='checkbox' data-check-all></th>" : "") +
            $.map(o.columns, function (c) {
                return "<th data-key='" + c.key + "' class='" + (c.sortable !== false ? "sortable " : "") + (c.className || "") + "'" +
                    (c.width ? " style='width:" + c.width + "'" : "") + ">" + (c.title || "") +
                    (c.sortable !== false ? "<i class='fa fa-sort cx-sort'></i>" : "") + "</th>";
            }).join("") + "</tr>";
        this.$c.addClass("cx-dt").html(
            "<div class='cx-table-wrap'><table class='cx-table'><thead>" + head + "</thead><tbody></tbody><tfoot></tfoot></table></div>" +
            "<div class='cx-table-foot'>" +
            "  <div class='cx-pagesize'>Afficher <select>" + $.map(o.pageSizes, function (n) {
                return "<option" + (n === o.pageSize ? " selected" : "") + ">" + n + "</option>";
            }).join("") + "</select> <span class='cx-dt-info'></span></div>" +
            "  <div class='cx-pager'></div>" +
            "</div>");

        this.$c.on("click", "th.sortable", function () {
            var k = $(this).data("key");
            if (self.o.sortKey === k) self.o.sortDir = -self.o.sortDir; else { self.o.sortKey = k; self.o.sortDir = 1; }
            self.render();
        });
        this.$c.on("change", ".cx-pagesize select", function () { self.o.pageSize = parseInt($(this).val(), 10); self.page = 1; self.render(); });
        this.$c.on("click", ".cx-pager button", function () { self.page = parseInt($(this).data("page"), 10); self.render(); });
        this.$c.on("change", "tbody input[data-check]", function () {
            var id = $(this).closest("tr").data("id");
            if (this.checked) self.selected[id] = true; else delete self.selected[id];
            $(this).closest("tr").toggleClass("selected", this.checked);
            self._syncCheckAll(); self._fireSelect();
        });
        this.$c.on("change", "thead input[data-check-all]", function () {
            var on = this.checked;
            $.each(self._filtered(), function (_, r) { var id = self.o.rowId(r); if (on) self.selected[id] = true; else delete self.selected[id]; });
            self.render(); self._fireSelect();
        });
        if (o.searchInput) {
            $(o.searchInput).on("input", CX.util.debounce(function () { self.search = $(this).val(); self.page = 1; self.render(); }, 150));
        }
    },
    setRows: function (rows) {
        var self = this;
        this.rows = rows || [];
        /* purge la sélection des lignes disparues */
        var ids = {}; $.each(this.rows, function (_, r) { ids[self.o.rowId(r)] = 1; });
        $.each($.extend({}, this.selected), function (id) { if (!ids[id]) delete self.selected[id]; });
        this.render();
    },
    setSearch: function (q) { this.search = q || ""; this.page = 1; this.render(); },
    refresh: function () { this.render(); },
    /* Lignes après recherche + tri (toutes pages) - utile pour les exports */
    getFiltered: function () { return this._filtered(); },
    getSelected: function () { var self = this; return $.grep(this.rows, function (r) { return self.selected[self.o.rowId(r)]; }); },
    clearSelection: function () { this.selected = {}; this.render(); this._fireSelect(); },
    selectAll: function () { var self = this; $.each(this._filtered(), function (_, r) { self.selected[self.o.rowId(r)] = true; }); this.render(); this._fireSelect(); },
    _fireSelect: function () { if (this.o.onSelect) this.o.onSelect(this.getSelected()); },
    _syncCheckAll: function () {
        var self = this, f = this._filtered();
        var all = f.length > 0 && $.grep(f, function (r) { return self.selected[self.o.rowId(r)]; }).length === f.length;
        this.$c.find("thead input[data-check-all]").prop("checked", all);
    },
    _col: function (k) { return $.grep(this.o.columns, function (c) { return c.key === k; })[0]; },
    _filtered: function () {
        var self = this, q = CX.util.normalize($.trim(this.search));
        var rows = this.rows;
        if (q) {
            rows = $.grep(rows, function (r) {
                var txt = $.map(self.o.columns, function (c) {
                    if (c.searchValue) return c.searchValue(r);
                    var v = r[c.key]; return v == null ? "" : String(v);
                }).join(" ");
                return CX.util.normalize(txt).indexOf(q) >= 0;
            });
        }
        if (this.o.sortKey) {
            var c = this._col(this.o.sortKey), dir = this.o.sortDir;
            var val = c && c.sortValue ? c.sortValue : function (r) { return r[self.o.sortKey]; };
            rows = rows.slice().sort(function (a, b) {
                var va = val(a), vb = val(b);
                if (va == null) va = ""; if (vb == null) vb = "";
                if (typeof va === "string") va = CX.util.normalize(va);
                if (typeof vb === "string") vb = CX.util.normalize(vb);
                return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
            });
        }
        return rows;
    },
    render: function () {
        var self = this, o = this.o, rows = this._filtered();
        var total = rows.length, pages = Math.max(1, Math.ceil(total / o.pageSize));
        if (this.page > pages) this.page = pages;
        var from = (this.page - 1) * o.pageSize, slice = rows.slice(from, from + o.pageSize);
        var ncol = o.columns.length + (o.selectable ? 1 : 0);

        this.$c.find("th").removeClass("sorted").find(".cx-sort").attr("class", "fa fa-sort cx-sort");
        if (o.sortKey) {
            this.$c.find("th[data-key='" + o.sortKey + "']").addClass("sorted")
                .find(".cx-sort").attr("class", "fa cx-sort " + (o.sortDir > 0 ? "fa-sort-asc" : "fa-sort-desc"));
        }

        var html = [];
        if (!slice.length) {
            html.push("<tr><td colspan='" + ncol + "'><div class='cx-empty'><i class='fa " + o.emptyIcon + "'></i><b>" +
                CX.util.esc(o.emptyText) + "</b>" + (this.search ? "Aucun résultat pour « " + CX.util.esc(this.search) + " »" : "") + "</div></td></tr>");
        }
        $.each(slice, function (_, r) {
            var id = o.rowId(r), sel = !!self.selected[id];
            html.push("<tr data-id='" + CX.util.esc(id) + "' class='" + (sel ? "selected " : "") + (o.rowClass ? o.rowClass(r) : "") + "'>" +
                (o.selectable ? "<td class='cx-col-check'><input type='checkbox' data-check" + (sel ? " checked" : "") + "></td>" : "") +
                $.map(o.columns, function (c) {
                    var v = c.render ? c.render(r) : CX.util.esc(r[c.key]);
                    return "<td class='" + (c.className || "") + "'>" + (v == null ? "" : v) + "</td>";
                }).join("") + "</tr>");
        });
        this.$c.find("tbody").html(html.join(""));
        this.$c.find("tfoot").html(o.footer && rows.length ? o.footer(rows) : "");

        this.$c.find(".cx-dt-info").text(total ? "· " + (from + 1) + "–" + Math.min(from + o.pageSize, total) + " sur " + total : "");
        var p = [];
        if (pages > 1) {
            p.push("<button data-page='" + (this.page - 1) + "'" + (this.page === 1 ? " disabled" : "") + "><i class='fa fa-angle-left'></i></button>");
            var start = Math.max(1, this.page - 2), end = Math.min(pages, start + 4);
            start = Math.max(1, end - 4);
            if (start > 1) p.push("<button data-page='1'>1</button>" + (start > 2 ? "<button disabled>…</button>" : ""));
            for (var i = start; i <= end; i++) p.push("<button data-page='" + i + "' class='" + (i === this.page ? "active" : "") + "'>" + i + "</button>");
            if (end < pages) p.push((end < pages - 1 ? "<button disabled>…</button>" : "") + "<button data-page='" + pages + "'>" + pages + "</button>");
            p.push("<button data-page='" + (this.page + 1) + "'" + (this.page === pages ? " disabled" : "") + "><i class='fa fa-angle-right'></i></button>");
        }
        this.$c.find(".cx-pager").html(p.join(""));
        this._syncCheckAll();
        if (o.onRender) o.onRender(rows);
    }
};

/* Activation des tooltips Bootstrap sur toutes les pages */
$(function () { if ($.fn.tooltip) $("body").tooltip({ selector: "[data-toggle=tooltip]", container: "body" }); });

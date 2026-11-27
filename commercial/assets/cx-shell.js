/* =====================================================================
   ClemenTino 2.0 - Module COMMERCIAL - en-tête, méga-menu, sous-navigation
   ---------------------------------------------------------------------
   Dans les maquettes, l'en-tête est injecté dans <div id="cx-header">,
   la sous-navigation dans <div id="cx-subnav"> et le pied de page dans
   <div id="cx-footer">. La page indique où elle se trouve via
   <body data-page="clients-liste">.

   >>> INTÉGRATION SYMFONY <<<
   Le menu de l'application existe déjà dans le layout Twig. Il suffit de
   reprendre le BLOC "Commercial" (méga-menu) généré par megaMenuHtml()
   dans le template du menu, en remplaçant les href par des path('...').
   La sous-navigation (subnavHtml) peut être mise dans un bloc Twig
   {% block subnav %} du layout commercial.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

/* Arborescence du module Commercial (source unique pour menu + sous-nav) */
CX.MENU_COMMERCIAL = [
    {
        id: "clients", titre: "Comptes clients", icon: "fa-building-o", home: "clients-liste.html",
        items: [
            { page: "client-form", href: "client-form.html", label: "Nouveau compte client", desc: "Créer un client en compte ou au comptant" },
            { page: "clients-liste", href: "clients-liste.html", label: "Liste des comptes", desc: "Rechercher, consulter, suspendre" }
        ]
    },
    {
        id: "cotations", titre: "Cotations", icon: "fa-calculator", home: "cotations-liste.html",
        items: [
            { page: "cotation-form", href: "cotations-liste.html#nouvelle", label: "Émettre une cotation / devis", desc: "Expédition, mise à disposition, tarifaire" },
            { page: "cotations-liste", href: "cotations-liste.html", label: "Suivi des cotations", desc: "Soumission, validation, conversion" }
        ]
    },
    {
        id: "facturation", titre: "Facturation", icon: "fa-file-text-o", home: "factures-suivi.html",
        items: [
            { page: "facture-emettre", href: "facture-emettre.html", label: "Émettre une facture", desc: "Facturer les expéditions des clients en compte" },
            { page: "factures-suivi", href: "factures-suivi.html", label: "Suivi des factures", desc: "Encaissements, relances, échéances" }
        ]
    },
    {
        id: "carnets", titre: "Carnets de LT", icon: "fa-book", home: "../maquettes-carnets/carnets-liste.html",
        items: [
            { page: "carnets-liste", href: "../maquettes-carnets/carnets-liste.html", label: "Carnets de lettres de transport", desc: "Affectation, feuilles utilisées et perdues" }
        ]
    }
];

/* Pages « filles » rattachées à une rubrique pour le surlignage */
CX.PAGE_GROUP = {
    "dashboard": "dashboard",
    "clients-liste": "clients", "client-form": "clients", "client-fiche": "clients",
    "cotations-liste": "cotations", "cotation-form": "cotations", "cotation-document": "cotations",
    "facture-emettre": "facturation", "factures-suivi": "facturation", "facture": "facturation",
    "carnets-liste": "carnets"
};

CX.shell = {
    megaMenuHtml: function (current) {
        var cols = $.map(CX.MENU_COMMERCIAL, function (g) {
            return "<div class='cx-mega-col'><h6><i class='fa " + g.icon + "'></i>" + g.titre + "</h6>" +
                $.map(g.items, function (it) {
                    return "<a class='cx-mega-link" + (it.page === current ? " current" : "") + "' href='" + it.href + "'>" +
                        it.label + "<small>" + it.desc + "</small></a>";
                }).join("") + "</div>";
        }).join("");
        return "<div class='cx-mega'><div class='cx-mega-grid'>" + cols + "</div>" +
            "<div class='cx-mega-foot'><a class='cx-btn cx-btn-soft cx-btn-sm' href='index.html'><i class='fa fa-tachometer'></i> Tableau de bord commercial</a>" +
            "<span style='margin-left:auto'>Raccourcis :</span>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='client-form.html'><i class='fa fa-plus'></i> Client</a>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='cotations-liste.html#nouvelle'><i class='fa fa-plus'></i> Cotation</a>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='facture-emettre.html'><i class='fa fa-plus'></i> Facture</a></div></div>";
    },

    headerHtml: function (current) {
        var u = CX.CONFIG.USER;
        var autres = ["Guichet", "Comptes", "Commercial", "Exploitation", "Suivi", "États", "Comptabilité", "Contrôle", "Clients web", "Services généraux", "Édition"];
        var nav = $.map(autres, function (m) {
            if (m === "Commercial") {
                return "<li class='active cx-has-mega'><a href='index.html'>Commercial <i class='fa fa-angle-down'></i></a>" + CX.shell.megaMenuHtml(current) + "</li>";
            }
            return "<li><a href='#' onclick='return false'>" + m + "</a></li>";
        }).join("");
        return "<header class='cx-header'><div class='cx-header-inner'>" +
            "<a class='cx-brand' href='index.html'>ClemenTino<small>2.0</small></a>" +
            "<ul class='cx-nav'>" + nav + "</ul>" +
            "<div class='cx-header-right'><span class='cx-loc-chip'><i class='fa fa-map-marker'></i> " +
            CX.util.esc(u.ville.charAt(0) + u.ville.substr(1).toLowerCase()) + " · bureau " + CX.util.esc(u.agence.charAt(0) + u.agence.substr(1).toLowerCase()) + "</span>" +
            "<span class='cx-user'><i class='fa fa-user-circle-o'></i> " + CX.util.esc(u.nom) + "</span></div>" +
            "</div></header>";
    },

    subnavHtml: function (current) {
        var group = CX.PAGE_GROUP[current] || "";
        var links = [{ id: "dashboard", titre: "Tableau de bord", icon: "fa-tachometer", home: "index.html" }].concat(CX.MENU_COMMERCIAL);
        return "<nav class='cx-subnav'>" + $.map(links, function (g) {
            return "<a href='" + g.home + "' class='" + (g.id === group ? "active" : "") + "'><i class='fa " + g.icon + "'></i>" + g.titre + "</a>";
        }).join("") + "</nav>";
    },

    footerHtml: function () {
        var u = CX.CONFIG.USER;
        return "<div class='cx-footer'>Copyright © ClemenTino 2.0 · KuTiWa · Vous êtes affecté à la ville de <b>" +
            CX.util.esc(u.ville) + "</b>, au bureau de <b>" + CX.util.esc(u.agence) + "</b>.</div>";
    },

    init: function () {
        var current = $("body").data("page") || "";
        if ($("#cx-header").length) $("#cx-header").replaceWith(CX.shell.headerHtml(current));
        if ($("#cx-subnav").length) $("#cx-subnav").replaceWith(CX.shell.subnavHtml(current));
        if ($("#cx-footer").length) $("#cx-footer").replaceWith(CX.shell.footerHtml());

        /* Page hors du dossier commercial/ (ex : carnets) : window.CX_BASE = "../commercial/"
           préfixe les liens du menu pour qu'ils restent valides. */
        if (window.CX_BASE) {
            $(".cx-header a[href], .cx-subnav a[href]").each(function () {
                var h = $(this).attr("href");
                if (h && h.charAt(0) !== "#" && !/^(https?:|mailto:|tel:|\/)/.test(h)) $(this).attr("href", window.CX_BASE + h);
            });
        }

        /* Ouverture du méga-menu : survol (souris) + clic (tactile / clavier) */
        var timer;
        $(document).on("mouseenter", ".cx-has-mega", function () { clearTimeout(timer); $(this).addClass("open"); });
        $(document).on("mouseleave", ".cx-has-mega", function () { var $li = $(this); timer = setTimeout(function () { $li.removeClass("open"); }, 180); });
        $(document).on("click", ".cx-has-mega > a", function (e) {
            if (!$(this).parent().hasClass("open")) { e.preventDefault(); $(this).parent().addClass("open"); }
        });
        $(document).on("click", function (e) { if (!$(e.target).closest(".cx-has-mega").length) $(".cx-has-mega").removeClass("open"); });
        $(document).on("keydown", function (e) { if (e.which === 27) $(".cx-has-mega").removeClass("open"); });
    }
};

$(function () { CX.shell.init(); });

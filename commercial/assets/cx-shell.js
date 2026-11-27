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
            { page: "clients-liste", href: "clients-liste.html", label: "Liste des comptes", desc: "Rechercher, consulter, suspendre" },
            { page: "client-import", href: "client-import.html", label: "Importer des clients", desc: "Chargement en masse depuis Excel" }
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
        id: "tarifs", titre: "Tarifaires", icon: "fa-table", home: "tarifs-liste.html",
        items: [
            { page: "tarifs-liste", href: "tarifs-liste.html", label: "Grilles tarifaires", desc: "Tarifs standard, clients et groupes" },
            { page: "tarif-form", href: "tarif-form.html", label: "Nouvelle grille", desc: "Trajets, poids, natures, modèles de calcul" },
            { page: "tarifs-groupes", href: "tarifs-liste.html#groupes", label: "Groupes de clients", desc: "Un tarif commun à plusieurs clients" },
            { page: "contrat-form", href: "tarifs-liste.html#contrats", label: "Contrats clients", desc: "Contrat signé, période, grille attachée" }
        ]
    },
    {
        id: "facturation", titre: "Facturation", icon: "fa-file-text-o", home: "factures-suivi.html",
        items: [
            { page: "facture-emettre", href: "facture-emettre.html", label: "Émettre une facture", desc: "Facturer les expéditions des clients en compte" },
            { page: "factures-suivi", href: "factures-suivi.html", label: "Suivi des factures", desc: "Encaissements, relances, échéances" },
            { page: "journal-vente", href: "journal-vente.html", label: "Journal de vente", desc: "Factures de la période, export PDF / Excel / Sage" }
        ]
    },
    {
        id: "apporteurs", titre: "Apporteurs d'affaires", icon: "fa-handshake-o", home: "apporteurs-liste.html",
        items: [
            { page: "apporteurs-liste", href: "apporteurs-liste.html", label: "Apporteurs d'affaires", desc: "Commerciaux et partenaires, clients apportés" },
            { page: "apporteur-form", href: "apporteur-form.html", label: "Nouvel apporteur", desc: "Identité, affectation, taux de commission" },
            { page: "commissions", href: "commissions.html", label: "Commissions", desc: "Calcul et paiement des commissions" }
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
/* Module GUICHET (dossier ../guichet/) : liens relatifs au dossier commercial/,
   comme le reste du menu (préfixés par CX_BASE sur les pages hors commercial/). */
CX.MENU_GUICHET = [
    {
        id: "g-saisie", titre: "Expéditions", icon: "fa-cube", home: "../guichet/expedition-form.html",
        items: [
            { page: "g-expedition-form", href: "../guichet/expedition-form.html", label: "Nouvelle expédition", desc: "Saisie au comptoir, reçu WhatsApp" },
            { page: "g-expeditions-liste", href: "../guichet/expeditions-liste.html", label: "Historique des saisies", desc: "Toutes les expéditions saisies, réimpression, annulation" }
        ]
    }
];

/* Module OPÉRATIONS (dossier ../operations/) */
CX.MENU_OPERATIONS = [
    {
        id: "o-flux", titre: "Lots et colis", icon: "fa-exchange", home: "../operations/index.html",
        items: [
            { page: "o-dashboard", href: "../operations/index.html", label: "Tableau de bord", desc: "Colis à traiter par étape, retards" },
            { page: "o-groupage", href: "../operations/groupage.html", label: "Envoi des lots et colis", desc: "Grouper les expéditions, manifeste de voyage" },
            { page: "o-degroupage", href: "../operations/degroupage.html", label: "Réception des lots et colis", desc: "Mettre en agence, en transit ou en livraison" },
            { page: "o-instance", href: "../operations/instance.html", label: "Livraison des lots et colis", desc: "En agence, chez le coursier, livrées" },
            { page: "o-livraisons", href: "../operations/livraisons.html", label: "Fiches de livraison", desc: "Coursiers, tournées, retours de tournée" }
        ]
    },
    {
        id: "o-lt", titre: "Expéditions & bordereaux", icon: "fa-file-o", home: "../operations/bordereaux.html",
        items: [
            { page: "o-preenregistrees", href: "../operations/preenregistrees.html", label: "Expéditions pré-enregistrées", desc: "Saisies par le client (web, WhatsApp), à valider au guichet" },
            { page: "o-bordereaux", href: "../operations/bordereaux.html", label: "Bordereaux d'expédition", desc: "Envoyés et entrants, bordereaux de la journée" },
            { page: "o-provisoires", href: "../operations/bordereaux-provisoires.html", label: "Bordereaux provisoires", desc: "Générer les bordereaux provisoires du jour" },
            { page: "o-lettres", href: "../operations/lettres-voiture.html", label: "Gestion des lettres de voiture", desc: "Rechercher, réorienter, corriger" },
            { page: "o-tracking", href: "../operations/tracking.html", label: "Tracking", desc: "Suivre un colis étape par étape" }
        ]
    },
    {
        id: "o-inter", titre: "International", icon: "fa-globe", home: "../operations/international.html",
        items: [
            { page: "o-inter-groupage", href: "../operations/international.html#groupage", label: "Groupage international", desc: "Préparer les envois vers le partenaire" },
            { page: "o-inter-degroupage", href: "../operations/international.html#degroupage", label: "Dégroupage international", desc: "Colis reçus de l'étranger" },
            { page: "o-international", href: "../operations/international.html", label: "Expéditions internationales", desc: "Suivi AWB, partenaire, statut" }
        ]
    }
];

/* Module ÉTATS (dossier ../etats/) */
CX.MENU_ETATS = [
    {
        id: "e-activite", titre: "Activité", icon: "fa-bar-chart", home: "../etats/index.html",
        items: [
            { page: "e-index", href: "../etats/index.html", label: "Tous les états", desc: "Catalogue des états et statistiques" },
            { page: "e-ca", href: "../etats/chiffre-affaires.html", label: "Chiffre d'affaires", desc: "Par agence, client, produit, apporteur" },
            { page: "e-journal", href: "../etats/journal-expeditions.html", label: "Journal des expéditions", desc: "Toutes les expéditions de la période" },
            { page: "e-production", href: "../etats/production.html", label: "Production", desc: "Saisies par agence et par guichetier" },
            { page: "e-volumique", href: "../etats/volumique.html", label: "Volumique", desc: "Colis, poids, trajets" }
        ]
    },
    {
        id: "e-qualite", titre: "Qualité & finances", icon: "fa-line-chart", home: "../etats/livraisons.html",
        items: [
            { page: "e-livraisons", href: "../etats/livraisons.html", label: "Livraisons & performance", desc: "Délais, taux de livraison, retards" },
            { page: "e-tresorerie", href: "../etats/tresorerie.html", label: "Excédent de trésorerie", desc: "Encaissements comptant et versements" },
            { page: "e-statistiques", href: "../etats/statistiques.html", label: "Statistiques", desc: "Tendances et comparaisons" }
        ]
    }
];

/* Registre des modules de l'en-tête : <body data-module="..."> désigne le module actif
   (commercial par défaut). Les liens sont relatifs au dossier commercial/. */
CX.MODULES = [
    { id: "guichet", label: "Guichet", home: "../guichet/expedition-form.html", menu: "MENU_GUICHET", petit: true },
    { id: "comptes", label: "Comptes" },
    { id: "commercial", label: "Commercial", home: "index.html", menu: "MENU_COMMERCIAL" },
    { id: "operations", label: "Opérations", home: "../operations/index.html", menu: "MENU_OPERATIONS" },
    { id: "tracking", label: "Tracking", home: "../operations/tracking.html" },
    { id: "etats", label: "États", home: "../etats/index.html", menu: "MENU_ETATS" },
    { id: "comptabilite", label: "Comptabilité" },
    { id: "controle", label: "Contrôle" },
    { id: "clientsweb", label: "Clients web" },
    { id: "sg", label: "Services généraux" }
];

CX.PAGE_GROUP = {
    "o-dashboard": "o-dashboard", "o-groupage": "o-groupage", "o-degroupage": "o-degroupage", "o-instance": "o-instance",
    "o-livraisons": "o-livraisons", "o-lettres": "o-lettres", "o-preenregistrees": "o-preenregistrees", "o-provisoires": "o-bordereaux", "o-international": "o-international", "o-inter-groupage": "o-international", "o-inter-degroupage": "o-international", "o-bordereaux": "o-bordereaux", "o-bordereau": "o-bordereaux", "o-tracking": "o-tracking",
    "e-index": "e-index", "e-ca": "e-ca", "e-journal": "e-journal", "e-production": "e-production", "e-volumique": "e-volumique",
    "e-livraisons": "e-livraisons", "e-tresorerie": "e-tresorerie", "e-statistiques": "e-statistiques",
    "journal-vente": "facturation", "apporteurs-liste": "apporteurs", "apporteur-form": "apporteurs", "commissions": "apporteurs",
    "g-expedition-form": "g-saisie", "g-expeditions-liste": "g-historique", "g-recu": "g-historique",
    "dashboard": "dashboard",
    "clients-liste": "clients", "client-form": "clients", "client-fiche": "clients", "client-import": "clients",
    "cotations-liste": "cotations", "cotation-form": "cotations", "cotation-document": "cotations",
    "tarifs-liste": "tarifs", "tarif-form": "tarifs", "contrat-form": "tarifs",
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
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='tarif-form.html'><i class='fa fa-plus'></i> Grille</a>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='facture-emettre.html'><i class='fa fa-plus'></i> Facture</a></div></div>";
    },

    /* Menu déroulant générique d'un module (Commercial garde son méga-menu complet) */
    moduleMenuHtml: function (menu, current, petit) {
        return "<div class='cx-mega" + (petit ? " cx-mega-sm" : "") + "'><div class='cx-mega-grid' style='grid-template-columns:repeat(" + (petit ? 1 : menu.length) + ",1fr)'>" +
            $.map(menu, function (g) {
                return "<div class='cx-mega-col'><h6><i class='fa " + g.icon + "'></i>" + g.titre + "</h6>" + $.map(g.items, function (it) {
                    return "<a class='cx-mega-link" + (it.page === current ? " current" : "") + "' href='" + it.href + "'>" + it.label + "<small>" + it.desc + "</small></a>";
                }).join("") + "</div>";
            }).join("") + "</div></div>";
    },

    /* « YAOUNDE » -> « Yaoundé » pour l'affichage */
    nomVille: function (v) {
        var acc = { YAOUNDE: "Yaoundé", NGAOUNDERE: "Ngaoundéré", EBOLOWA: "Ebolowa" };
        v = String(v || "");
        return acc[v] || (v.charAt(0) + v.substr(1).toLowerCase());
    },

    moduleActif: function () { return $("body").data("module") || "commercial"; },

    headerHtml: function (current) {
        var u = CX.CONFIG.USER, actif = CX.shell.moduleActif();
        var nav = $.map(CX.MODULES, function (m) {
            var cls = m.id === actif ? "active " : "";
            if (m.id === "commercial") {
                return "<li class='" + cls + "cx-has-mega'><a href='index.html'>Commercial <i class='fa fa-angle-down'></i></a>" + CX.shell.megaMenuHtml(current) + "</li>";
            }
            if (m.menu) {
                return "<li class='" + cls + "cx-has-mega'><a href='" + m.home + "'>" + m.label + " <i class='fa fa-angle-down'></i></a>" +
                    CX.shell.moduleMenuHtml(CX[m.menu], current, m.petit) + "</li>";
            }
            if (m.home) return "<li class='" + cls + "'><a href='" + m.home + "'>" + m.label + "</a></li>";
            return "<li><a href='#' onclick='return false' title='Module hors maquette'>" + m.label + "</a></li>";
        }).join("");
        return "<header class='cx-header'><div class='cx-header-inner'>" +
            "<a class='cx-brand' href='index.html'>ClemenTino<small>2.0</small></a>" +
            "<ul class='cx-nav'>" + nav + "</ul>" +
            "<div class='cx-header-right'><span class='cx-loc-chip'><i class='fa fa-map-marker'></i> " +
            CX.util.esc(CX.shell.nomVille(u.ville)) + " · bureau " + CX.util.esc(u.agence.charAt(0) + u.agence.substr(1).toLowerCase()) + "</span>" +
            "<span class='cx-user'><i class='fa fa-user-circle-o'></i> " + CX.util.esc(u.nom) + "</span></div>" +
            "</div></header>";
    },

    subnavHtml: function (current) {
        var group = CX.PAGE_GROUP[current] || "", actif = CX.shell.moduleActif();
        function lien(id, titre, icon, href) {
            return "<a href='" + href + "' class='" + (id === group ? "active" : "") + "'><i class='fa " + icon + "'></i>" + titre + "</a>";
        }
        if (actif === "guichet") {
            return "<nav class='cx-subnav'>" + lien("g-saisie", "Nouvelle expédition", "fa-plus-circle", "../guichet/expedition-form.html") +
                lien("g-historique", "Historique des saisies", "fa-history", "../guichet/expeditions-liste.html") + "</nav>";
        }
        if (actif === "operations" || actif === "tracking" || actif === "etats") {
            var menu = actif === "etats" ? CX.MENU_ETATS : CX.MENU_OPERATIONS;
            return "<nav class='cx-subnav'>" + $.map(menu, function (g) {
                return $.map($.grep(g.items, function (it) { return it.href.indexOf("#") < 0; }), function (it) { return lien(it.page, it.label.replace(/ \((départs|arrivées)\)/, ""), g.icon, it.href); }).join("");
            }).join("") + "</nav>";
        }
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

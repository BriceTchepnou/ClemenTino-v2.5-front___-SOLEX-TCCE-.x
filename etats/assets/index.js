/* =====================================================================
   États · Catalogue (index.html)
   ---------------------------------------------------------------------
   Cartes des états (icône, description, dernier chiffre clé calculé sur
   les données), recherche plein texte, favoris mémorisés dans le
   navigateur (localStorage « cx_etats_favoris »).

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/catalogue/chiffres-cles  (un chiffre par état, mis en cache quelques minutes)
   TODO API : GET|PUT /utilisateur/preferences/etats-favoris  (favoris par utilisateur plutôt que par poste)
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats;
    var CLE_FAV = "cx_etats_favoris";
    E.assurerVersementsDemo();
    var D = E.donnees();

    /* ---------- Chiffres clés (mois en cours, comparé au mois précédent) ---------- */
    var t = U.today(), mois = E.periodeDe("mois"), moisP = E.periodeComparee("mois", mois, "PREC"), jour = E.periodeDe("jour");
    var tous = { st: "ACTIF", app: [] };
    var rM = E.filtrer(D.exps, tous, mois), rP = E.filtrer(D.exps, tous, moisP), rJ = E.filtrer(D.exps, tous, jour);
    var aM = E.agreger(rM, "typeClient").total, aP = E.agreger(rP, "typeClient").total;
    var livr = { liv: 0, ok: 0 };
    $.each(rM, function (_, e) { if (e.statut === "LIVREE" && e._delai != null) { livr.liv++; if (e._delai <= (E.CONFIG.DELAIS_CIBLE[e._service] || 5)) livr.ok++; } });
    var C = E.caisse(D, null), exc = 0, alertes = 0;
    $.each(C, function (id, a) { exc += a.solde; if (a.solde > E.plafondDe(id)) alertes++; });
    var fac = 0; $.each(D.lignesFac, function (_, l) { if (l._actif && l._jour >= mois.du && l._jour <= mois.au) fac += l._ht; });
    var libMois = E.moisLib(t.substr(0, 7), true);

    var ETATS = [
        { page: "e-ca", href: "chiffre-affaires.html", icon: "fa-line-chart", couleur: "", groupe: "Activité", titre: "Chiffre d'affaires",
          desc: "CA par agence, ville, client, produit, apporteur ou mois, à partir des expéditions ou des factures émises, avec comparaison.",
          mots: "ca ventes recettes factures apporteur agence produit client mois tva ttc",
          chiffre: U.money(aM.ht) + " HT", sous: libMois + " " + E.ecartHtml(aM.ht, aP.ht) },
        { page: "e-journal", href: "journal-expeditions.html", icon: "fa-list-alt", couleur: "", groupe: "Activité", titre: "Journal des expéditions",
          desc: "Toutes les expéditions de la période, colonnes au choix, totaux, export CSV et PDF.",
          mots: "journal liste lt lettres transport expeditions colonnes export",
          chiffre: U.fmt(aM.nb) + " expéditions", sous: libMois + " · " + U.fmt(rJ.length) + " aujourd'hui" },
        { page: "e-production", href: "production.html", icon: "fa-pencil-square-o", couleur: "vert", groupe: "Activité", titre: "Production",
          desc: "Saisies par agence et par guichetier : nombre, CA, panier moyen, heures de pointe.",
          mots: "production saisies guichet guichetier agence panier heures pointe chaleur",
          chiffre: U.fmt(rJ.length) + " saisie(s)", sous: "aujourd'hui · " + U.fmt(aM.nb ? aM.ht / aM.nb : 0) + " F de panier moyen ce mois" },
        { page: "e-volumique", href: "volumique.html", icon: "fa-archive", couleur: "vert", groupe: "Activité", titre: "Volumique",
          desc: "Colis et poids par trajet (matrice origine × destination), par nature, distribution des poids.",
          mots: "volume colis poids kg trajets matrice origine destination nature",
          chiffre: U.fmt(aM.colis) + " colis", sous: E.kg(aM.poids) + " · " + libMois },
        { page: "e-livraisons", href: "livraisons.html", icon: "fa-truck", couleur: "orange", groupe: "Qualité & finances", titre: "Livraisons & performance",
          desc: "Délais moyen et médian par trajet, taux livré dans le délai, retards, échecs, par agence et par livreur.",
          mots: "livraison performance delai retard echec livreur qualite",
          chiffre: livr.liv ? E.pct(livr.ok / livr.liv * 100) : "—", sous: "livrées dans le délai · " + libMois },
        { page: "e-tresorerie", href: "tresorerie.html", icon: "fa-bank", couleur: "orange", groupe: "Qualité & finances", titre: "Excédent de trésorerie",
          desc: "Encaissements comptant par mode et par agence, versements banque / siège, solde de caisse et alertes de plafond.",
          mots: "tresorerie caisse especes orange money momo versement banque excedent plafond",
          chiffre: U.money(exc), sous: alertes ? "<span class='ex-ecart ex-down'>" + alertes + " agence(s) au-delà du plafond</span>" : "en caisse, toutes agences" },
        { page: "e-statistiques", href: "statistiques.html", icon: "fa-pie-chart", couleur: "", groupe: "Qualité & finances", titre: "Statistiques",
          desc: "Tableau de bord : KPI et tendances, CA mensuel sur 12 mois, répartitions, top clients / agences / trajets, croissance.",
          mots: "statistiques tableau bord kpi tendance croissance top",
          chiffre: E.ecartHtml(aM.ht, aP.ht), sous: "CA HT vs mois précédent (même nombre de jours)" },
        { page: "c-journal-vente", href: "../commercial/journal-vente.html", icon: "fa-book", couleur: "gris", groupe: "Commercial", titre: "Journal de vente",
          desc: "Factures émises de la période, export comptable (module Commercial).",
          mots: "journal vente factures comptabilite sage export", chiffre: U.money(fac) + " HT", sous: "facturé en " + libMois },
        { page: "c-commissions", href: "../commercial/commissions.html", icon: "fa-handshake-o", couleur: "gris", groupe: "Commercial", titre: "Commissions des apporteurs",
          desc: "Calcul et paiement des commissions des apporteurs d'affaires (module Commercial).",
          mots: "apporteur commission affaires", chiffre: U.fmt(D.apporteurs.length) + " apporteur(s)", sous: "référencés" },
        { page: "x-postal", href: "", icon: "fa-envelope-o", couleur: "gris", groupe: "À venir", titre: "Ventes service postal", avenir: true,
          desc: "Ventes de timbres et produits postaux par bureau (écran existant, à reprendre).", mots: "postal timbres ventes", chiffre: "À venir", sous: "" },
        { page: "x-logistique", href: "", icon: "fa-cubes", couleur: "gris", groupe: "À venir", titre: "Logistique", avenir: true,
          desc: "Remplissage des véhicules, bordereaux et tournées (dépend du module Opérations).", mots: "logistique vehicules bordereaux tournees", chiffre: "À venir", sous: "" }
    ];

    function favoris() { try { return JSON.parse(localStorage.getItem(CLE_FAV) || "[]") || []; } catch (e) { return []; } }
    function setFavoris(f) { try { localStorage.setItem(CLE_FAV, JSON.stringify(f)); } catch (e) { U.toast("Favoris non enregistrés (stockage du navigateur indisponible).", "warning"); } }

    function carte(x, fav) {
        return "<article class='ex-cat-card " + x.couleur + (x.avenir ? " ex-avenir" : "") + "' data-page='" + x.page + "'>" +
            "<button type='button' class='ex-fav" + (fav ? " on" : "") + "' data-fav='" + x.page + "' aria-pressed='" + fav + "' title='" + (fav ? "Retirer des favoris" : "Ajouter aux favoris") + "'><i class='fa " + (fav ? "fa-star" : "fa-star-o") + "' aria-hidden='true'></i><span class='sr-only'>Favori</span></button>" +
            "<div class='ex-cat-ico'><i class='fa " + x.icon + "' aria-hidden='true'></i></div>" +
            "<h3>" + (x.href ? "<a href='" + x.href + "'>" + U.esc(x.titre) + "</a>" : U.esc(x.titre)) + "</h3>" +
            "<p>" + U.esc(x.desc) + "</p>" +
            "<div class='ex-cat-chiffre'><b>" + x.chiffre + "</b><small>" + x.sous + "</small></div></article>";
    }
    function rendre() {
        var q = U.normalize($.trim($("#cat-q").val())), fav = favoris(), h = [];
        var vis = $.grep(ETATS, function (x) { return !q || U.normalize(x.titre + " " + x.desc + " " + x.mots + " " + x.groupe).indexOf(q) >= 0; });
        var favs = $.grep(vis, function (x) { return $.inArray(x.page, fav) >= 0; });
        if (favs.length) h.push("<h2 class='ex-cat-section'><i class='fa fa-star' style='color:#f0a500'></i> Mes favoris</h2><div class='ex-cat'>" + $.map(favs, function (x) { return carte(x, true); }).join("") + "</div>");
        var groupes = [];
        $.each(vis, function (_, x) { if ($.inArray(x.groupe, groupes) < 0) groupes.push(x.groupe); });
        $.each(groupes, function (_, g) {
            h.push("<h2 class='ex-cat-section'>" + U.esc(g) + "</h2><div class='ex-cat'>" + $.map($.grep(vis, function (x) { return x.groupe === g; }), function (x) { return carte(x, $.inArray(x.page, fav) >= 0); }).join("") + "</div>");
        });
        if (!vis.length) h.push("<div class='cx-card'><div class='cx-empty'><i class='fa fa-search'></i><b>Aucun état ne correspond à « " + U.esc($("#cat-q").val()) + " »</b>Essayez « caisse », « colis », « délai »…</div></div>");
        $("#cat").html(h.join(""));
        $("#cat-count").text(vis.length + " état(s)");
    }
    $("#cat-q").on("input", U.debounce(rendre, 120));
    $("#cat").on("click", "[data-fav]", function (e) {
        e.preventDefault(); e.stopPropagation();
        var p = $(this).data("fav"), f = favoris(), i = $.inArray(p, f);
        if (i >= 0) f.splice(i, 1); else f.push(p);
        setFavoris(f);
        rendre();
        U.toast(i >= 0 ? "Retiré des favoris." : "Ajouté aux favoris.", "info");
    });
    $("#cat-maj").text("Chiffres clés calculés le " + U.toFr(U.now()) + " sur " + U.fmt(D.exps.length) + " expéditions (" + D.ms + " ms)");
    rendre();
});

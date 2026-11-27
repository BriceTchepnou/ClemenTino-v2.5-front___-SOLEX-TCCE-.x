/* =====================================================================
   États · Journal des expéditions (journal-expeditions.html)
   ---------------------------------------------------------------------
   Toutes les expéditions de la période (filtres communs + statut + mode de
   paiement), colonnes choisies par l'utilisateur (mémorisées dans le
   navigateur), totaux en pied de tableau, exports CSV / PDF des lignes
   filtrées (recherche comprise) et des colonnes affichées.

   >>> INTÉGRATION SYMFONY <<<
   TODO API : GET /etats/journal-expeditions?du=&au=&geo=&typeClient=&service=&nature=&apporteurs[]=&statut=&etat=&mode=&q=&page=&tri=&colonnes[]=
     SELECT e.*, a.ville, a.nom agence, c.raison_sociale FROM expedition e
       JOIN agence a ON a.id = e.agence_dep_id LEFT JOIN client c ON c.id = e.client_id
      WHERE e.date_exp BETWEEN :du AND :au [filtres] ORDER BY e.date_exp, e.heure LIMIT :n OFFSET :o
   + une requête de totaux (COUNT, SUM colis / poids / HT / TVA / TTC / encaissé) sur le même WHERE.
   Export volumineux : GET /etats/journal-expeditions.csv|.pdf (généré côté serveur).
   ===================================================================== */

$(function () {
    var U = CX.util, E = CX.etats;
    var D = E.donnees();
    var CLE_COLS = "cx_etats_journal_colonnes";

    function badgeStatut(e) {
        return CX.guichet ? CX.guichet.statutBadge(e.statut) : U.esc(e.statut);
    }
    var ETAPES = { ENREGISTREE: "Enregistrée", GROUPEE: "Groupée", EN_TRANSIT: "En transit", ARRIVEE: "Arrivée", EN_INSTANCE: "En instance", EN_LIVRAISON: "En livraison", LIVREE: "Livrée", ECHEC: "Échec", ANNULEE: "Annulée" };

    /* Catalogue des colonnes : key, title, render, csv (valeur brute), somme (total en pied) */
    var COLS = [
        { key: "numero", title: "N° LT", defaut: true, render: function (e) { return "<span class='cx-cell-main cx-mono'>" + U.esc(e.nRt || e.numero) + "</span>" + (e.nRtMan ? "<div class='cx-cell-sub'>Feuille " + U.esc(e.nRtMan) + "</div>" : ""); }, csv: function (e) { return e.nRt || e.numero; }, sortValue: function (e) { return e.nRt || ""; } },
        { key: "date", title: "Date", defaut: true, render: function (e) { return U.toFr(e.dateExp) + (e.heure ? "<div class='cx-cell-sub'>" + U.esc(e.heure) + "</div>" : ""); }, csv: function (e) { return U.toFr(e.dateExp); }, sortValue: function (e) { return e.dateExp + " " + (e.heure || ""); } },
        { key: "heure", title: "Heure", csv: function (e) { return e.heure || ""; } },
        { key: "agence", title: "Agence de départ", defaut: true, csv: function (e) { return e._agLib; } },
        { key: "trajet", title: "Trajet", defaut: true, render: function (e) { return U.esc(E.villeNom(e.villeDep)) + " → " + U.esc(E.villeNom(e.villeDest)) + "<div class='cx-cell-sub'>" + U.esc(E.titre(e.bureauDest || "")) + "</div>"; }, csv: function (e) { return E.villeNom(e.villeDep) + " -> " + E.villeNom(e.villeDest); } },
        { key: "service", title: "Service", defaut: true, csv: function (e) { return (E.SERVICES[e._service] || { label: e._service }).label; } },
        { key: "typeClient", title: "Type client", csv: function (e) { return e._typeClient === "COMPTE" ? "En compte" : "Particulier"; } },
        { key: "client", title: "Client / expéditeur", defaut: true, render: function (e) { return "<span class='cx-cell-main'>" + U.esc(e._typeClient === "COMPTE" ? e._client : e.expediteur) + "</span><div class='cx-cell-sub'>" + (e._typeClient === "COMPTE" ? "En compte" : "Particulier") + "</div>"; }, csv: function (e) { return e._typeClient === "COMPTE" ? e._client : e.expediteur; } },
        { key: "destinataire", title: "Destinataire", csv: function (e) { return e.destinataire || ""; } },
        { key: "apporteur", title: "Apporteur", csv: function (e) { return e._appId ? E.nomApporteur(e._appId) : ""; } },
        { key: "nature", title: "Nature", csv: function (e) { return e._nature; } },
        { key: "colis", title: "Colis", defaut: true, num: true, somme: "_colis", csv: function (e) { return e._colis; } },
        { key: "poids", title: "Poids (kg)", defaut: true, num: true, somme: "_poids", fmt: "kg", csv: function (e) { return e._poids; } },
        { key: "ht", title: "Montant HT", defaut: true, num: true, somme: "_ht", fmt: "money", csv: function (e) { return e._ht; } },
        { key: "tva", title: "TVA", num: true, somme: "_tva", fmt: "money", csv: function (e) { return e._tva; } },
        { key: "ttc", title: "Montant TTC", defaut: true, num: true, somme: "_ttc", fmt: "money", csv: function (e) { return e._ttc; } },
        { key: "enc", title: "Encaissé", num: true, somme: "_enc", fmt: "money", csv: function (e) { return e._enc; } },
        { key: "mode", title: "Paiement", defaut: true, render: function (e) { return U.esc(e._mode || "—") + "<div class='cx-cell-sub'>" + (e.paiement && e.paiement.statut === "PAYE" ? "Payé" : "En compte") + "</div>"; }, csv: function (e) { return e._mode || ""; } },
        { key: "statut", title: "Statut", defaut: true, render: badgeStatut, csv: function (e) { return (CX.guichet ? CX.guichet.STATUTS[e.statut] || {} : {}).label || e.statut; }, sortValue: function (e) { return e.statut; } },
        { key: "etape", title: "Étape", csv: function (e) { return ETAPES[e.etape] || e.etape || ""; } },
        { key: "guichetier", title: "Guichetier", csv: function (e) { return e._guichetier; } },
        { key: "livraison", title: "Livrée le", csv: function (e) { return e.dateLivraison ? U.toFr(e.dateLivraison) : ""; }, sortValue: function (e) { return e.dateLivraison || ""; } },
        { key: "delai", title: "Délai (j)", num: true, csv: function (e) { return e._delai == null ? "" : e._delai; }, sortValue: function (e) { return e._delai == null ? -1 : e._delai; } },
        { key: "facture", title: "Facture", csv: function (e) { var f = e.factureId ? $.grep(D.factures, function (x) { return x.id == e.factureId; })[0] : null; return f ? f.numero : ""; } }
    ];
    var COL = {}; $.each(COLS, function (_, c) { COL[c.key] = c; });

    function colsChoisies() {
        var v = null;
        try { v = JSON.parse(localStorage.getItem(CLE_COLS) || "null"); } catch (e) { v = null; }
        if (!$.isArray(v) || !v.length) v = $.map($.grep(COLS, function (c) { return c.defaut; }), function (c) { return c.key; });
        return $.grep(v, function (k) { return !!COL[k]; });
    }
    var choisies = colsChoisies();

    /* Filtres propres au journal (dans la barre commune) */
    var extra = "<div class='cx-field'><label class='cx-label' for='jr-statut'>Statut</label><select class='form-control' id='jr-statut'>" +
        "<option value=''>Tous</option><option value='EN_TRANSIT'>En transit</option><option value='LIVREE'>Livrée</option><option value='ANNULEE'>Annulée</option></select></div>" +
        "<div class='cx-field'><label class='cx-label' for='jr-mode'>Paiement</label><select class='form-control' id='jr-mode'><option value=''>Tous</option>" +
        $.map(["Espèces", "Orange Money", "MTN MoMo", "En compte"], function (m) { return "<option>" + m + "</option>"; }).join("") + "</select></div>";
    var F = new E.Filtres("#ex-filtres", { extraHtml: extra, comparaison: false, onChange: rendre });
    $("#jr-statut").val(E.url.get("etat", "")).on("change", function () { E.url.ecrire({ etat: $(this).val() }); if ($(this).val() === "ANNULEE" && F.get().st !== "TOUT") F.set({ st: "TOUT" }); else rendre(); });
    $("#jr-mode").val(E.url.get("mode", "")).on("change", function () { E.url.ecrire({ mode: $(this).val() }); rendre(); });

    var rows = [], dt = null, q = "";

    function colonnesDt() {
        return $.map(choisies, function (k) {
            var c = COL[k];
            return {
                key: c.key, title: c.title, className: c.num ? "num" : "",
                render: c.render || function (e) { var v = c.csv(e); return c.fmt ? E.fmtVal(v, c.fmt) : U.esc(v); },
                sortValue: c.sortValue || function (e) { return c.csv(e); },
                searchValue: function (e) { return String(c.csv(e)); }
            };
        });
    }
    function pied(rs) {
        return "<tr>" + $.map(choisies, function (k, i) {
            var c = COL[k];
            if (c.somme) { var s = 0; $.each(rs, function (_, e) { s += e[c.somme] || 0; }); return "<td class='num'>" + E.fmtVal(s, c.fmt || "int") + "</td>"; }
            return "<td>" + (i === 0 ? "Total · " + U.fmt(rs.length) + " exp." : "") + "</td>";
        }).join("") + "</tr>";
    }
    function construireTable() {
        $("#jr-table").empty().append("<div id='jr-dt'></div>");
        dt = new CX.DataTable("#jr-dt", {
            columns: colonnesDt(), rows: rows, pageSize: 25, sortKey: "date", sortDir: 1,
            rowId: function (e) { return e.id; }, emptyText: "Aucune expédition sur la période", emptyIcon: "fa-cube",
            rowClass: function (e) { return e.statut === "ANNULEE" ? "cx-row-muted" : ""; },
            footer: pied, onRender: function (rs) { kpis(rs); }
        });
        if (q) dt.setSearch(q);
        $("#jr-cols-n").text(choisies.length);
    }
    function kpis(rs) {
        var m = E.mVide(), liv = 0, ann = 0;
        $.each(rs, function (_, e) { E.mAjouter(m, { _nb: 1, _colis: e._colis, _poids: e._poids, _ht: e._ht, _tva: e._tva, _ttc: e._ttc, _enc: e._enc }); if (e.statut === "LIVREE") liv++; if (e.statut === "ANNULEE") ann++; });
        $("#jr-count").text(U.fmt(rs.length) + " expédition(s)");
        $("#jr-kpis").html([
            E.kpi({ label: "Expéditions", valeur: U.fmt(m.nb), icon: "fa-cube", foot: U.fmt(liv) + " livrée(s)" + (ann ? " · " + ann + " annulée(s)" : "") }),
            E.kpi({ label: "Colis · poids", valeur: U.fmt(m.colis) + " <small>colis</small>", icon: "fa-archive", couleur: "purple", foot: E.kg(m.poids) + " taxables" }),
            E.kpi({ label: "Montant HT", valeur: U.fmt(m.ht) + " <small>FCFA</small>", icon: "fa-line-chart", foot: "TTC " + U.fmt(m.ttc) }),
            E.kpi({ label: "Encaissé (comptant)", valeur: U.fmt(m.enc) + " <small>FCFA</small>", icon: "fa-money", couleur: "green", foot: "Reste en compte : " + U.fmt(m.ttc - m.enc) })
        ].join(""));
    }

    function rendre(f) {
        f = f || F.get();
        var st = $("#jr-statut").val(), mode = $("#jr-mode").val();
        rows = $.grep(E.filtrer(D.exps, f, f.per), function (e) {
            if (st && e.statut !== st) return false;
            if (mode && e._mode !== mode) return false;
            return true;
        });
        if (!dt) construireTable(); else dt.setRows(rows);
    }

    /* Choix des colonnes */
    function rendreMenuCols() {
        $("#jr-cols-pop").html($.map(COLS, function (c) {
            return "<label><input type='checkbox' value='" + c.key + "'" + ($.inArray(c.key, choisies) >= 0 ? " checked" : "") + "> " + U.esc(c.title) + "</label>";
        }).join("") + "<div class='ex-cols-actions'><button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-cols='defaut'>Colonnes par défaut</button><button type='button' class='cx-btn cx-btn-link cx-btn-xs' data-cols='tout'>Tout afficher</button></div>");
    }
    function enregistrerCols() {
        try { localStorage.setItem(CLE_COLS, JSON.stringify(choisies)); } catch (e) { /* stockage indisponible */ }
        construireTable();
    }
    $("#jr-cols-btn").on("click", function (e) {
        e.stopPropagation();
        rendreMenuCols();
        $("#jr-cols").toggleClass("open");
        $(this).attr("aria-expanded", $("#jr-cols").hasClass("open"));
    });
    $("#jr-cols-pop").on("click", function (e) { e.stopPropagation(); });
    $("#jr-cols-pop").on("change", "input", function () {
        var k = $(this).val();
        if (this.checked) { choisies = $.grep(COLS, function (c) { return c.key === k || $.inArray(c.key, choisies) >= 0; }); choisies = $.map(choisies, function (c) { return c.key; }); }
        else if (choisies.length > 1) choisies = $.grep(choisies, function (x) { return x !== k; });
        else { this.checked = true; return; }
        enregistrerCols();
    });
    $("#jr-cols-pop").on("click", "[data-cols]", function () {
        choisies = $(this).data("cols") === "tout" ? $.map(COLS, function (c) { return c.key; }) : $.map($.grep(COLS, function (c) { return c.defaut; }), function (c) { return c.key; });
        rendreMenuCols(); enregistrerCols();
    });
    $(document).on("click", function () { $("#jr-cols").removeClass("open"); $("#jr-cols-btn").attr("aria-expanded", false); });

    $("#jr-q").on("input", U.debounce(function () { q = $(this).val(); if (dt) dt.setSearch(q); }, 150));

    /* Exports (lignes filtrées + recherche, colonnes affichées) */
    function resume() {
        var r = F.resume();
        if ($("#jr-statut").val()) r.push("Statut : " + $("#jr-statut option:selected").text());
        if ($("#jr-mode").val()) r.push("Paiement : " + $("#jr-mode").val());
        if (q) r.push("Recherche : « " + q + " »");
        return r;
    }
    function tableExport() {
        var rs = dt.getFiltered();
        var def = {
            cols: $.map(choisies, function (k) {
                var c = COL[k];
                return { t: c.title, v: function (e) { return e._tot ? (c.somme ? e[c.somme] : "") : c.csv(e); }, f: c.fmt || (c.num ? "int" : "txt"), num: !!c.num };
            }),
            lignes: rs, total: null
        };
        var t = { _tot: true }; $.each(COLS, function (_, c) { if (c.somme) { t[c.somme] = 0; $.each(rs, function (_, e) { t[c.somme] += e[c.somme] || 0; }); } });
        def.total = t;
        return def;
    }
    $("#btn-csv").on("click", function () {
        var f = F.get();
        E.csv("journal-expeditions-" + f.per.du + "-" + f.per.au, E.tableauCsv(tableExport()), { titre: "Journal des expéditions", filtres: resume() });
    });
    function feuille() {
        var f = F.get(), def = tableExport();
        return { titre: "Journal des expéditions", sousTitre: E.libPeriode(f.per).replace(/^./, function (x) { return x.toUpperCase(); }) + " · " + U.fmt(def.lignes.length) + " expédition(s)",
            filtres: resume(), blocs: [$("#jr-kpis").clone().wrap("<div>").parent().html(), E.tableau(def)], orientation: choisies.length > 7 ? "landscape" : "portrait" };
    }
    $("#btn-pdf").on("click", function () {
        var o = feuille(), f = F.get();
        o.nom = "Journal des expeditions " + f.per.du + " au " + f.per.au; o.bouton = this;
        if (dt.getFiltered().length > 600) U.toast("Plus de 600 lignes : le PDF peut prendre quelques secondes.", "info");
        E.pdf(o);
    });
    $("#btn-imprimer").on("click", function () { E.imprimer(feuille()); });

    rendre();
    window.CX_ETAT = { lignes: function () { return dt.getFiltered(); }, filtres: F };
});

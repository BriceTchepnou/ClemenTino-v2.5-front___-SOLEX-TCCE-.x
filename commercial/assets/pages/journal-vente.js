/* =====================================================================
   Commercial · Journal de vente (journal-vente.html)
   ---------------------------------------------------------------------
   Liste des factures émises sur une période, avec le n° de compte client
   (411xxxxx), les montants HT / TVA / TTC / acompte IS et leurs totaux.
   Filtres : période (raccourcis), clients (Select2 multiple), statut, agence
   de rattachement du client.
   Exports :
     - PDF  : document A4 paysage généré directement (html2pdf, chargé par CX.pdf)
     - Excel: CSV « ; » avec BOM UTF-8
     - Sage : fichier d'écritures comptables (journal VT) paramétrable,
              avec aperçu des écritures et contrôle débit = crédit.
   Une facture = 3 lignes : débit 411 client (TTC), crédit 706 (HT),
   crédit 4457 (TVA) ; avec acompte IS ventilé : débit compte IS (IS) et
   débit client (TTC - IS).
   Dépend de facturation.js (CX.fac), exports.js (CX.exporter), cx-pdf.js.
   ===================================================================== */
$(function () {
    var U = CX.util, F = CX.fac, REF = CX.REF, today = U.today();

    var clients = {};        // id -> client
    var factures = [];       // factures chargées
    var lignes = [];         // lignes du journal (après filtres)

    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
    function client(id) { return clients[id] || { id: id, raisonSociale: "Client #" + id }; }

    /* ------------------------------------------------------------------
       Période : raccourcis
       ------------------------------------------------------------------ */
    function periode(code) {
        var d = today, m = parseInt(d.substr(5, 2), 10), y = d.substr(0, 4);
        if (code === "MOIS") return { du: U.firstOfMonth(d), au: U.lastOfMonth(d) };
        if (code === "MOIS_PREC") { var p = U.addDays(U.firstOfMonth(d), -1); return { du: U.firstOfMonth(p), au: U.lastOfMonth(p) }; }
        if (code === "TRIMESTRE") {
            var m1 = Math.floor((m - 1) / 3) * 3 + 1;
            var deb = y + "-" + U.pad(m1) + "-01";
            return { du: deb, au: U.lastOfMonth(y + "-" + U.pad(m1 + 2) + "-01") };
        }
        if (code === "ANNEE") return { du: y + "-01-01", au: y + "-12-31" };
        /* 12 derniers mois : du 1er du mois, il y a 11 mois, à la fin du mois en cours */
        var x = U.firstOfMonth(d);
        for (var i = 0; i < 11; i++) x = U.firstOfMonth(U.addDays(x, -1));
        return { du: x, au: U.lastOfMonth(d) };
    }
    function appliquerRaccourci() {
        var code = $("#f-raccourci").val();
        if (code === "PERSO") return;
        var p = periode(code);
        $("#f-du").val(p.du); $("#f-au").val(p.au);
    }

    /* ------------------------------------------------------------------
       Filtres -> lignes du journal
       ------------------------------------------------------------------ */
    function filtrer() {
        var du = $("#f-du").val(), au = $("#f-au").val(), ids = $("#f-clients").val() || [];
        var statut = $("#f-statut").val(), agence = $("#f-agence").val();
        var rows = $.grep(factures, function (f) {
            if (f.statut === "BROUILLON") return false;                 // un brouillon n'est pas une vente
            if (du && f.dateEmission < du) return false;
            if (au && f.dateEmission > au) return false;
            if (ids.length && $.inArray(String(f.clientId), ids) < 0) return false;
            if (agence && String(client(f.clientId).agenceId) !== String(agence)) return false;
            if (statut === "ACTIVES") return f.statut !== "ANNULEE";
            if (statut === "IMPAYEES") return f.statut !== "ANNULEE" && F.reste(f) > 0;
            if (statut === "TOUTES") return true;
            return f.statut === statut;
        });
        rows.sort(function (a, b) { return a.dateEmission === b.dateEmission ? (a.numero > b.numero ? 1 : -1) : (a.dateEmission > b.dateEmission ? 1 : -1); });
        lignes = $.map(rows, function (f, i) {
            var c = client(f.clientId), annulee = f.statut === "ANNULEE";
            return {
                id: f.id, rang: i + 1, facture: f, clientId: f.clientId, client: c.raisonSociale, compte: REF.compteClient(c),
                date: f.dateEmission, numero: f.numero, annulee: annulee,
                ht: F.netHT(f), tva: U.round(f.tva), ttc: U.round(f.montantTTC), is: U.round(f.montantIS || 0), solde: F.aPayer(f), statut: f.statut
            };
        });
        return lignes;
    }
    function totaux(rows) {
        var t = { nb: 0, ht: 0, tva: 0, ttc: 0, is: 0, solde: 0, nbIs: 0, clients: {} };
        $.each(rows, function (_, r) {
            if (r.annulee) return;    // les annulées sont listées (si demandé) mais ne comptent pas
            t.nb++; t.ht += r.ht; t.tva += r.tva; t.ttc += r.ttc; t.is += r.is; t.solde += r.solde;
            if (r.is) t.nbIs++;
            t.clients[r.clientId] = 1;
        });
        t.nbClients = $.map(t.clients, function () { return 1; }).length;
        return t;
    }

    /* ------------------------------------------------------------------
       Indicateurs
       ------------------------------------------------------------------ */
    function kpi(label, value, foot, icon, color) {
        return "<div class='cx-kpi " + (color || "") + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }
    function majKpis(t) {
        $("#kpis").html([
            kpi("Factures", U.fmt(t.nb), pluriel(t.nbClients, "client") + " facturé" + (t.nbClients > 1 ? "s" : ""), "fa-file-text-o", ""),
            kpi("Montant HT", U.fmt(t.ht) + " <small>FCFA</small>", "Chiffre d'affaires net de remise", "fa-line-chart", "green"),
            kpi("TVA collectée", U.fmt(t.tva) + " <small>FCFA</small>", "À déclarer", "fa-percent", "purple"),
            kpi("Montant TTC", U.fmt(t.ttc) + " <small>FCFA</small>", "Total facturé", "fa-money", ""),
            kpi("Acompte IS", U.fmt(t.is) + " <small>FCFA</small>", t.nbIs ? pluriel(t.nbIs, "facture") + " avec retenue à la source" : "Aucune retenue sur la période", "fa-university", "orange")
        ].join(""));
        var du = $("#f-du").val(), au = $("#f-au").val();
        $("#h-periode").text(du || au ? "· du " + (du ? U.toFr(du) : "…") + " au " + (au ? U.toFr(au) : "…") : "· toutes périodes");
    }

    /* ------------------------------------------------------------------
       Tableau
       ------------------------------------------------------------------ */
    function m(v) { return "<span class='cx-nowrap'>" + U.fmt(v) + "</span>"; }
    var dt = new CX.DataTable("#dt", {
        columns: [
            { key: "rang", title: "#", className: "num jv-rang" },
            { key: "compte", title: "N° de compte", render: function (r) { return "<span class='cx-mono'>" + U.esc(r.compte) + "</span>"; } },
            { key: "client", title: "Client", render: function (r) {
                return "<a class='cx-cell-main' href='client-fiche.html?id=" + r.clientId + "#factures'>" + U.esc(r.client) + "</a>";
            } },
            { key: "date", title: "Date de facture", render: function (r) { return "<span class='cx-nowrap'>" + U.toFr(r.date) + "</span>"; },
                searchValue: function (r) { return U.toFr(r.date); } },
            { key: "numero", title: "N° de facture", render: function (r) {
                return "<a class='cx-mono cx-strong cx-nowrap' href='facture.html?id=" + r.id + "'>" + U.esc(r.numero) + "</a>" +
                    (r.annulee ? " <span class='cx-badge cx-badge-red'>Annulée</span>" : "");
            } },
            { key: "ht", title: "Montant HT", className: "num", render: function (r) { return m(r.ht); }, searchValue: function (r) { return String(r.ht); } },
            { key: "tva", title: "TVA", className: "num", render: function (r) { return m(r.tva); }, searchValue: function () { return ""; } },
            { key: "ttc", title: "Montant TTC", className: "num", render: function (r) { return "<b>" + m(r.ttc) + "</b>"; }, searchValue: function (r) { return String(r.ttc); } },
            { key: "is", title: "Acompte IS", className: "num", render: function (r) { return r.is ? m(r.is) : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            { key: "statut", title: "Statut", render: function (r) { return F.statutHtml(r.facture); },
                searchValue: function (r) { return (REF.STATUT_FACTURE[r.statut] || {}).label || ""; } },
            { key: "actions", title: "", sortable: false, className: "cx-right", searchValue: function () { return ""; }, render: function (r) {
                return "<a class='cx-btn cx-btn-ghost cx-btn-xs' href='facture.html?id=" + r.id + "' data-toggle='tooltip' title='Afficher la facture'><i class='fa fa-eye'></i></a>";
            } }
        ],
        rows: [], pageSize: 25, sortKey: "rang", sortDir: 1, searchInput: "#q",
        emptyText: "Aucune facture sur la période", emptyIcon: "fa-book",
        rowClass: function (r) { return r.annulee ? "cx-row-muted" : ""; },
        footer: function (rows) {
            var t = totaux(rows);
            return "<tr><td colspan='5'>Total · " + pluriel(t.nb, "facture") + (rows.length > t.nb ? " <span class='cx-muted' style='font-weight:500'>(hors annulées)</span>" : "") + "</td>" +
                "<td class='num'>" + m(t.ht) + "</td><td class='num'>" + m(t.tva) + "</td><td class='num'>" + m(t.ttc) + "</td><td class='num'>" + m(t.is) + "</td><td colspan='2'></td></tr>";
        }
    });

    function rendre() {
        var rows = filtrer();
        majKpis(totaux(rows));
        dt.setRows(rows);
    }
    /* Lignes exportées : celles du tableau (recherche rapide comprise), dans l'ordre du journal */
    function lignesExport() {
        return dt.getFiltered().slice().sort(function (a, b) { return a.rang - b.rang; });
    }
    function libellePeriode() {
        var du = $("#f-du").val(), au = $("#f-au").val();
        return "du " + (du ? U.toFr(du) : "…") + " au " + (au ? U.toFr(au) : "…");
    }
    function suffixeFichier() { return ($("#f-du").val() || "debut") + "_" + ($("#f-au").val() || "fin"); }
    function filtresTexte() {
        var t = [libellePeriode()], ids = $("#f-clients").val() || [];
        if (ids.length) t.push(ids.length === 1 ? client(ids[0]).raisonSociale : pluriel(ids.length, "client"));
        if ($("#f-agence").val()) { var a = REF.agence($("#f-agence").val()); if (a) t.push("agence " + a.nom + " (" + a.ville + ")"); }
        t.push($("#f-statut option:selected").text().toLowerCase());
        return t.join(" · ");
    }

    /* ------------------------------------------------------------------
       Export Excel (CSV)
       ------------------------------------------------------------------ */
    $("#btn-excel").on("click", function () {
        var rows = lignesExport();
        if (!rows.length) { U.toast("Aucune facture à exporter.", "warning"); return; }
        // TODO API (option) : GET /commercial/journal-vente.xlsx?du=&au=&clients[]=&statut=&agence=  (PhpSpreadsheet)
        var l = [["Journal de vente " + libellePeriode()], [],
            ["#", "N° de compte", "Client", "Date de facture", "N° de facture", "Montant HT", "TVA", "Montant TTC", "Acompte IS", "Solde à payer", "Statut"]];
        $.each(rows, function (_, r) {
            l.push([r.rang, r.compte, r.client, U.toFr(r.date), r.numero, r.ht, r.tva, r.ttc, r.is, r.solde, (REF.STATUT_FACTURE[r.statut] || {}).label || r.statut]);
        });
        var t = totaux(rows);
        l.push(["", "", "Total (" + pluriel(t.nb, "facture") + ")", "", "", t.ht, t.tva, t.ttc, t.is, t.solde, ""]);
        CX.exporter.telecharger("Journal de vente " + suffixeFichier() + ".csv", CX.exporter.csv(l, ";"), { bom: true });
        U.toast("Journal exporté : " + pluriel(rows.length, "facture") + ".", "success");
    });

    /* ------------------------------------------------------------------
       Document imprimable / PDF (A4 paysage)
       ------------------------------------------------------------------ */
    function feuilleHtml() {
        var S = CX.CONFIG.SOCIETE, rows = lignesExport(), t = totaux(rows);
        var corps = $.map(rows, function (r) {
            return "<tr" + (r.annulee ? " class='jv-annulee'" : "") + "><td class='num'>" + r.rang + "</td><td class='jv-mono'>" + U.esc(r.compte) + "</td><td>" + U.esc(r.client) + "</td>" +
                "<td>" + U.toFr(r.date) + "</td><td class='jv-mono'>" + U.esc(r.numero) + (r.annulee ? " (annulée)" : "") + "</td>" +
                "<td class='num'>" + U.fmt(r.ht) + "</td><td class='num'>" + U.fmt(r.tva) + "</td><td class='num'><b>" + U.fmt(r.ttc) + "</b></td>" +
                "<td class='num'>" + (r.is ? U.fmt(r.is) : "—") + "</td></tr>";
        }).join("");
        return "<div class='jv-sheet'>" +
            "<div class='jv-sheet-head'><div><div class='jv-soc'>" + U.esc(S.nom) + "</div><div class='jv-small'>" + U.esc(S.adresse) + " · NIU " + U.esc(S.niu) + "</div></div>" +
            "<div class='jv-sheet-titre'><h1>JOURNAL DE VENTE</h1><div>" + U.esc(libellePeriode()) + "</div></div></div>" +
            "<div class='jv-small jv-filtres-txt'>Filtres : " + U.esc(filtresTexte()) + "</div>" +
            "<table class='jv-table'><thead><tr><th class='num'>#</th><th>N° de compte</th><th>Client</th><th>Date de facture</th><th>N° de facture</th>" +
            "<th class='num'>Montant HT</th><th class='num'>TVA</th><th class='num'>Montant TTC</th><th class='num'>Acompte IS</th></tr></thead>" +
            "<tbody>" + (corps || "<tr><td colspan='9' class='jv-vide'>Aucune facture</td></tr>") + "</tbody>" +
            "<tfoot><tr><td colspan='5'>Total · " + pluriel(t.nb, "facture") + " · " + pluriel(t.nbClients, "client") + "</td><td class='num'>" + U.fmt(t.ht) + "</td>" +
            "<td class='num'>" + U.fmt(t.tva) + "</td><td class='num'>" + U.fmt(t.ttc) + "</td><td class='num'>" + U.fmt(t.is) + "</td></tr></tfoot></table>" +
            "<div class='jv-sheet-pied'>Montants en francs CFA. Édité le " + U.toFr(U.now()) + " par " + U.esc(CX.CONFIG.USER.nom) + " - ClemenTino 2.0</div></div>";
    }
    $("#btn-imprimer").on("click", function () {
        $("#jv-print").html(feuilleHtml());
        window.print();
    });
    $("#btn-pdf").on("click", function () {
        var $btn = $(this), rows = lignesExport();
        if (!rows.length) { U.toast("Aucune facture à exporter.", "warning"); return; }
        var nom = CX.pdf.nomFichier("Journal de vente " + suffixeFichier());
        // TODO API (option) : GET /commercial/journal-vente.pdf?...  (KnpSnappyBundle, orientation paysage)
        U.busy($btn, true);
        CX.pdf._lib().then(function () {
            /* Feuille rendue hors écran à la largeur d'une page A4 paysage (1123 px = 297 mm) */
            var $stage = $("<div class='cx-pdf-stage'></div>").css({ position: "fixed", left: "-14000px", top: 0, width: "1123px", background: "#fff", zIndex: -1 }).appendTo("body");
            var $sheet = $(feuilleHtml()).addClass("jv-pdf").appendTo($stage);
            var p = $.Deferred();
            window.html2pdf().set({
                margin: [8, 0, 10, 0], filename: nom, image: { type: "jpeg", quality: 0.96 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 1123, scrollX: 0, scrollY: 0, logging: false },
                jsPDF: { unit: "mm", format: "a4", orientation: "landscape", compress: true },
                pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".jv-sheet-head"] }
            }).from($sheet[0]).save().then(function () { p.resolve(); }, function (e) { p.reject(e); });
            return p.promise().always(function () { $stage.remove(); });
        }).done(function () {
            U.toast("PDF téléchargé : <b>" + U.esc(nom) + "</b>");
        }).fail(function () {
            U.toast("Le PDF n'a pas pu être généré (bibliothèque indisponible hors ligne ?). Utilisez « Imprimer » puis « Enregistrer au format PDF ».", "error");
        }).always(function () { U.busy($btn, false); });
    });

    /* ==================================================================
       Export Sage
       ================================================================== */
    var SAGE_CLE = "cx_sage_params";
    var SAGE_DEFAUT = {
        journal: "VT", compteVente: "70600000", compteTva: "44570000", compteIs: "44910000",
        modeTiers: "INDIVIDUEL", compteCollectif: "41100000", separateur: ";", formatDate: "JJMMAA",
        decimales: "0", encodage: "ANSI", ventilerIs: true, entete: false
    };
    function paramsSage() {
        // TODO API : GET /commercial/parametres/sage  (paramètres partagés par toute la comptabilité)
        var p = null;
        try { p = JSON.parse(localStorage.getItem(SAGE_CLE)); } catch (e) { p = null; }
        return $.extend({}, SAGE_DEFAUT, p || {});
    }
    function enregistrerParams(p) {
        // TODO API : PUT /commercial/parametres/sage
        try { localStorage.setItem(SAGE_CLE, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ }
    }
    function lireParams() {
        var p = {};
        $("#sg-params [data-p]").each(function () {
            p[$(this).data("p")] = this.type === "checkbox" ? this.checked : $.trim($(this).val());
        });
        return p;
    }
    function remplirParams(p) {
        $("#sg-params [data-p]").each(function () {
            var k = $(this).data("p");
            if (this.type === "checkbox") this.checked = !!p[k]; else $(this).val(p[k]);
        });
        $("#sg-compteCollectif").prop("disabled", p.modeTiers !== "COLLECTIF");
    }

    function dateSage(iso, fmt) {
        var j = iso.substr(8, 2), mo = iso.substr(5, 2), a = iso.substr(0, 4);
        if (fmt === "JJ/MM/AAAA") return j + "/" + mo + "/" + a;
        if (fmt === "AAAAMMJJ") return a + mo + j;
        return j + mo + a.substr(2, 2);
    }
    function montantSage(v, p) {
        if (!v) return "";
        return p.decimales === "2" ? Number(v).toFixed(2).replace(".", ",") : String(U.round(v));
    }
    /* Libellé Sage : 35 caractères maximum, sans le séparateur */
    function libelleSage(txt, p) {
        var sep = p.separateur === "TAB" ? "\t" : p.separateur;
        return String(txt).split(sep).join(" ").replace(/[\r\n"]/g, " ").substr(0, 35);
    }

    /* Écritures : une pièce par facture (annulées exclues) */
    function ecritures(rows, p) {
        var pieces = [];
        $.each(rows, function (_, r) {
            if (r.annulee) return;
            var f = r.facture, compteClient = r.compte, lib = "Fact " + r.numero + " " + r.client;
            var gen = p.modeTiers === "COLLECTIF" ? p.compteCollectif : compteClient, tiers = p.modeTiers === "COLLECTIF" ? compteClient : "";
            var ventile = p.ventilerIs && r.is > 0;
            var l = [];
            function e(compte, t, debit, credit) {
                l.push({ journal: p.journal, date: r.date, piece: r.numero, compte: compte, tiers: t, libelle: libelleSage(lib, p),
                    debit: U.round(debit), credit: U.round(credit), echeance: f.dateEcheance || r.date });
            }
            e(gen, tiers, ventile ? r.ttc - r.is : r.ttc, 0);                     // 411 client
            if (ventile) e(p.compteIs, "", r.is, 0);                              // acompte IS retenu à la source
            e(p.compteVente, "", 0, r.ht);                                        // 706 ventes (net HT)
            if (r.tva) e(p.compteTva, "", 0, r.tva);                              // 4457 TVA collectée
            var d = 0, c = 0; $.each(l, function (_, x) { d += x.debit; c += x.credit; });
            pieces.push({ numero: r.numero, client: r.client, lignes: l, debit: d, credit: c, equilibre: d === c });
        });
        return pieces;
    }
    function controle(pieces) {
        var t = { debit: 0, credit: 0, lignes: 0, ko: [] };
        $.each(pieces, function (_, pc) {
            t.debit += pc.debit; t.credit += pc.credit; t.lignes += pc.lignes.length;
            if (!pc.equilibre) t.ko.push(pc);
        });
        t.ok = !t.ko.length && t.debit === t.credit;
        return t;
    }
    function fichierSage(pieces, p) {
        var sep = p.separateur === "TAB" ? "\t" : p.separateur, out = [];
        if (p.entete) out.push(["Journal", "Date", "Piece", "Compte", "Tiers", "Libelle", "Debit", "Credit", "Echeance"].join(sep));
        $.each(pieces, function (_, pc) {
            $.each(pc.lignes, function (_, x) {
                out.push([x.journal, dateSage(x.date, p.formatDate), x.piece, x.compte, x.tiers, x.libelle,
                    montantSage(x.debit, p), montantSage(x.credit, p), dateSage(x.echeance, p.formatDate)].join(sep));
            });
        });
        return out.join("\r\n") + (out.length ? "\r\n" : "");
    }
    function nomFichierSage(p) { return "Sage_" + (p.journal || "VT") + "_" + suffixeFichier() + ".txt"; }

    function rendreSage() {
        var p = lireParams(), rows = lignesExport();
        $("#sg-compteCollectif").prop("disabled", p.modeTiers !== "COLLECTIF");
        var pieces = ecritures(rows, p), ctl = controle(pieces), exclues = $.grep(rows, function (r) { return r.annulee; }).length;
        $("#sg-resume").html("<i class='fa fa-info-circle'></i><div><b>" + pluriel(pieces.length, "facture") + "</b> " + U.esc(libellePeriode()) + " → <b>" +
            pluriel(ctl.lignes, "écriture") + "</b> dans le journal <b class='cx-mono'>" + U.esc(p.journal) + "</b>" +
            (exclues ? " · " + pluriel(exclues, "facture annulée") + " exclue" + (exclues > 1 ? "s" : "") : "") + ".</div>");
        $("#sg-params-resume").text("· " + p.journal + " · 706 " + p.compteVente + " · TVA " + p.compteTva + (p.ventilerIs ? " · IS " + p.compteIs : "") +
            " · " + (p.separateur === "TAB" ? "tabulation" : "« " + p.separateur + " »") + " · " + p.encodage);
        var html = [];
        $.each(pieces, function (_, pc) {
            $.each(pc.lignes, function (i, x) {
                html.push("<tr class='" + (i === 0 ? "jv-piece " : "") + (pc.equilibre ? "" : "jv-ko") + "'><td class='cx-mono'>" + U.esc(x.journal) + "</td><td class='cx-nowrap'>" + U.toFr(x.date) + "</td>" +
                    "<td class='cx-mono cx-nowrap'>" + U.esc(x.piece) + "</td><td class='cx-mono'>" + U.esc(x.compte) + "</td><td class='cx-mono'>" + U.esc(x.tiers) + "</td>" +
                    "<td>" + U.esc(x.libelle) + "</td><td class='num cx-nowrap'>" + (x.debit ? U.fmt(x.debit) : "") + "</td><td class='num cx-nowrap'>" + (x.credit ? U.fmt(x.credit) : "") + "</td></tr>");
            });
        });
        $("#sg-lignes").html(html.join("") || "<tr><td colspan='8'><div class='cx-empty'><i class='fa fa-book'></i><b>Aucune écriture</b>Aucune facture à exporter sur la période.</div></td></tr>");
        $("#sg-totaux").html("<tr><td colspan='6'>Totaux · " + pluriel(ctl.lignes, "ligne") + "</td><td class='num cx-nowrap'>" + U.fmt(ctl.debit) + "</td><td class='num cx-nowrap'>" + U.fmt(ctl.credit) + "</td></tr>");
        $("#sg-controle").html(!pieces.length ? "" : ctl.ok
            ? "<div class='cx-note cx-note-ok' id='sg-equilibre'><i class='fa fa-check-circle'></i><div><b>Journal équilibré</b> : total débit = total crédit = " + U.money(ctl.debit) +
                " ; chaque pièce est équilibrée.</div></div>"
            : "<div class='cx-note cx-note-err' id='sg-desequilibre'><i class='fa fa-times-circle'></i><div><b>Journal déséquilibré</b> : débit " + U.money(ctl.debit) + " / crédit " + U.money(ctl.credit) +
                ". Pièces en écart : " + $.map(ctl.ko, function (pc) { return U.esc(pc.numero) + " (" + U.money(pc.debit - pc.credit) + ")"; }).join(", ") +
                ". Recalculez ces factures avant l'export.</div></div>");
        var txt = fichierSage(pieces, p);
        $("#sg-fichier").text(txt.split("\r\n").slice(0, 12).join("\n") + (ctl.lignes > 12 ? "\n… (" + (ctl.lignes - 12) + " ligne(s) de plus)" : ""));
        $("#sg-fichier-nom").text("(" + nomFichierSage(p) + ")");
        $("#sg-telecharger").prop("disabled", !pieces.length || !ctl.ok).data("export", { txt: txt, p: p, nb: pieces.length, total: ctl.debit });
        return ctl;
    }

    $("#btn-sage").on("click", function () {
        if (!lignesExport().length) { U.toast("Aucune facture à exporter sur la période.", "warning"); return; }
        remplirParams(paramsSage());
        rendreSage();
        $("#m-sage").modal("show");
    });
    $("#sg-toggle").on("click", function () {
        $("#sg-params").toggleClass("cx-hidden");
        $(this).find(".jv-chev").toggleClass("fa-chevron-down fa-chevron-up");
    });
    $("#sg-params").on("change input", "[data-p]", U.debounce(function () { enregistrerParams(lireParams()); rendreSage(); }, 150));
    $("#sg-defaut").on("click", function () { remplirParams(SAGE_DEFAUT); enregistrerParams($.extend({}, SAGE_DEFAUT)); rendreSage(); });
    $("#sg-telecharger").on("click", function () {
        var x = $(this).data("export");
        if (!x || !x.nb) return;
        // TODO API : POST /commercial/journal-vente/export-sage  { du, au, clients[], statut, agence }  (trace de l'export + verrouillage des factures exportées)
        CX.exporter.telecharger(nomFichierSage(x.p), x.txt, { mime: "text/plain", ansi: x.p.encodage === "ANSI" });
        U.toast("Fichier Sage téléchargé : " + pluriel(x.nb, "facture") + ", " + U.money(x.total) + " au débit et au crédit.", "success");
    });

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */
    function recharger() {
        // TODO API : GET /commercial/journal-vente?du=&au=&clients[]=&statut=&agence=  (factures + n° de compte client)
        return CX.api.list("factures").done(function (list) { factures = list; rendre(); });
    }
    function reinit() {
        $("#f-raccourci").val("12MOIS"); appliquerRaccourci();
        $("#f-clients").val(null).trigger("change.select2");
        $("#f-statut").val("ACTIVES"); $("#f-agence").val("");
        $("#q").val(""); dt.setSearch("");
        rendre();
    }

    // TODO API : GET /commercial/clients?enCompte=1 (ou injection Twig)
    CX.api.list("clients").done(function (list) {
        list.sort(function (a, b) { return a.raisonSociale > b.raisonSociale ? 1 : -1; });
        $.each(list, function (_, c) { clients[c.id] = c; });
        $("#f-clients").html($.map(list, function (c) {
            return "<option value='" + c.id + "'>" + U.esc(c.raisonSociale + " · " + REF.compteClient(c)) + "</option>";
        }).join("")).select2({
            width: "100%", placeholder: "Tous les clients", closeOnSelect: false,
            language: { noResults: function () { return "Aucun client trouvé"; } }
        });
        $("#f-agence").append($.map(REF.AGENCES, function (a) {
            return "<option value='" + a.id + "'>" + U.esc(a.nom + " · " + a.ville) + "</option>";
        }).join(""));
        appliquerRaccourci();

        $("#f-raccourci").on("change", function () { appliquerRaccourci(); rendre(); });
        $("#f-du, #f-au").on("change", function () { $("#f-raccourci").val("PERSO"); rendre(); });
        $("#f-clients, #f-statut, #f-agence").on("change", rendre);
        $("#btn-afficher").on("click", function () { recharger(); });
        $("#btn-reinit").on("click", reinit);
        recharger();
    });
});

/* =====================================================================
   Commercial · Émission d'une facture (facture-emettre.html)
   ---------------------------------------------------------------------
   Reprend l'écran « ÉMISSION D'UNE FACTURE NATEX » :
     1. critères (client en compte, période, villes / bureaux) ;
     2. onglets « À facturer » / « À régulariser » ;
     3. sélection des expéditions -> récapitulatif collant (HT, remise,
        TVA, TTC, montant en lettres) -> aperçu -> création de la facture.
   Règle de gestion : 1 facture = 1 client.
   Une expédition est FACTURABLE si : statut LIVREE, montant > 0,
   preuve de livraison revenue au siège, et pas encore facturée.
   Paramètre d'URL : ?client=ID présélectionne le client.
   ===================================================================== */
$(function () {
    var U = CX.util, today = U.today();

    var clients = {};          // id -> client (clients en compte uniquement)
    var lignesFacturer = [];   // expéditions affichées dans l'onglet « À facturer »
    var lignesRegulariser = [];
    var ongletCourant = "facturer";
    var remiseClientId = null; // client dont le % de remise est actuellement appliqué
    var calculCourant = null;  // dernier calcul du récapitulatif (réutilisé par l'aperçu)

    /* ------------------------------------------------------------------
       Règles de gestion
       ------------------------------------------------------------------ */
    function estFacturable(e) {
        return e.statut === "LIVREE" && (Number(e.montant) || 0) > 0 && !!e.preuveLivraison && !e.factureId;
    }
    /* Motifs de blocage d'une expédition (onglet « À régulariser ») */
    function motifs(e) {
        var m = [];
        if (!(Number(e.montant) > 0)) m.push("<span class='cx-badge cx-badge-orange'>Montant à saisir</span>");
        if (e.statut !== "LIVREE") m.push("<span class='cx-badge cx-badge-blue'>En transit</span>");
        else if (!e.preuveLivraison) m.push("<span class='cx-badge cx-badge-red'>Preuve de livraison manquante</span>");
        return m.join(" ");
    }

    /* Calcul des montants d'une sélection (arrondis au franc) */
    function calculer(rows, remisePct) {
        var ht = 0;
        $.each(rows, function (_, e) { ht += U.round(e.montant); });
        var remise = U.round(ht * remisePct / 100);
        var t = U.taxes(ht - remise);
        return { ht: ht, remisePct: remisePct, remise: remise, net: t.ht, taux: t.taux, tva: t.tva, ttc: t.ttc, nb: rows.length };
    }
    function enLettres(n) {
        var s = U.enLettres(n);
        return s.charAt(0).toUpperCase() + s.substr(1) + " francs CFA";
    }
    function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }

    /* ------------------------------------------------------------------
       Filtres
       ------------------------------------------------------------------ */
    function periodeRaccourci(code) {
        if (code === "prec") {
            var finPrec = U.addDays(U.firstOfMonth(today), -1);
            return { du: U.firstOfMonth(finPrec), au: U.lastOfMonth(finPrec) };
        }
        if (code === "courant") return { du: U.firstOfMonth(today), au: today };
        return null;
    }
    function appliquerRaccourci() {
        var p = periodeRaccourci($("input[name=periode]:checked").val());
        if (p) { $("#f-du").val(p.du); $("#f-au").val(p.au); }
    }
    function remplirBureaux($ville, $bureau) {
        var v = $ville.val();
        var opts = "<option value=''>Tous</option>" + $.map(v ? CX.REF.agencesDe(v) : [], function (a) {
            return "<option value='" + U.esc(a.nom) + "'>" + U.esc(a.nom) + "</option>";
        }).join("");
        $bureau.html(opts).prop("disabled", !v);
    }
    function lireFiltres() {
        return {
            client: $("#f-client").val() || "",
            du: $("#f-du").val() || "", au: $("#f-au").val() || "",
            villeDep: $("#f-villeDep").val() || "", bureauDep: $("#f-bureauDep").val() || "",
            villeDest: $("#f-villeDest").val() || "", bureauDest: $("#f-bureauDest").val() || ""
        };
    }

    /* Chargement des expéditions selon les critères */
    function charger() {
        var f = lireFiltres();
        if (f.du && f.au && f.du > f.au) { U.toast("La date de début est postérieure à la date de fin.", "warning"); return; }
        U.busy("#btn-afficher", true);
        // TODO API : GET /commercial/facturation/expeditions?client=&du=&au=&villeDep=&bureauDep=&villeDest=&bureauDest=
        //            (renvoie les expéditions NON facturées des clients en compte ; le tri facturer / régulariser peut rester côté JS)
        CX.api.list("expeditions", function (e) {
            if (!clients[e.clientId] || e.factureId) return false;
            if (f.client && String(e.clientId) !== String(f.client)) return false;
            if (f.du && e.dateExp < f.du) return false;
            if (f.au && e.dateExp > f.au) return false;
            if (f.villeDep && e.villeDep !== f.villeDep) return false;
            if (f.bureauDep && e.bureauDep !== f.bureauDep) return false;
            if (f.villeDest && e.villeDest !== f.villeDest) return false;
            if (f.bureauDest && e.bureauDest !== f.bureauDest) return false;
            return true;
        }).done(function (rows) {
            lignesFacturer = $.grep(rows, estFacturable);
            lignesRegulariser = $.grep(rows, function (e) { return !estFacturable(e); });
            dtFacturer.setRows(lignesFacturer);
            dtRegulariser.setRows(lignesRegulariser);
            $("#cnt-facturer").text(lignesFacturer.length);
            $("#cnt-regulariser").text(lignesRegulariser.length);
            $("#l-sous-titre").text(
                (f.client ? clients[f.client].raisonSociale : "Tous les clients en compte") +
                (f.du || f.au ? " · du " + (U.toFr(f.du) || "…") + " au " + (U.toFr(f.au) || "…") : " · toutes dates"));
            majResume();
        }).always(function () { U.busy("#btn-afficher", false); });
    }

    /* ------------------------------------------------------------------
       Tableaux
       ------------------------------------------------------------------ */
    function colonnesCommunes() {
        return [
            { key: "dateExp", title: "Date", width: "92px", render: function (e) { return "<span class='cx-nowrap'>" + U.toFr(e.dateExp) + "</span>"; },
                searchValue: function (e) { return U.toFr(e.dateExp); } },
            { key: "nRt", title: "N° RT", render: function (e) { return "<span class='cx-mono cx-strong cx-nowrap'>" + U.esc(e.nRt) + "</span>"; } },
            { key: "nRtMan", title: "<span data-toggle='tooltip' title='N° de la feuille du carnet de lettres de transport'>N° RT MAN</span>",
                render: function (e) {
                    return e.nRtMan ? "<span class='cx-tag cx-mono'>" + U.esc(e.nRtMan) + "</span>" : "<span class='cx-muted'>—</span>";
                } },
            /* Client (= donneur d'ordre facturé) ; l'expéditeur n'est affiché que s'il diffère du client */
            { key: "clientId", title: "Client / expéditeur", sortValue: function (e) { return clients[e.clientId].raisonSociale; },
                searchValue: function (e) { return clients[e.clientId].raisonSociale + " " + e.expediteur; },
                render: function (e) {
                    var rs = clients[e.clientId].raisonSociale;
                    return "<span class='fe-client' title='" + U.esc(rs) + "'>" + U.esc(rs) + "</span>" +
                        (e.expediteur && e.expediteur !== rs ? "<div class='cx-cell-sub fe-client'>Exp. : " + U.esc(e.expediteur) + "</div>" : "");
                } },
            { key: "destinataire", title: "Destinataire", render: function (e) { return "<span class='cx-cell-main'>" + U.esc(e.destinataire) + "</span>"; } },
            { key: "trajet", title: "Départ → arrivée", sortValue: function (e) { return e.villeDep + e.villeDest; },
                searchValue: function (e) { return [e.villeDep, e.bureauDep, e.villeDest, e.bureauDest].join(" "); },
                render: function (e) {
                    return "<div class='cx-nowrap'>" + U.esc(e.villeDep) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(e.villeDest) + "</div>" +
                        "<div class='cx-cell-sub cx-nowrap'>" + U.esc(e.bureauDep) + " → " + U.esc(e.bureauDest) + "</div>";
                } },
            { key: "contenu", title: "Contenu · colis / poids",
                render: function (e) {
                    return "<div>" + U.esc(e.contenu) + "</div><div class='cx-cell-sub cx-nowrap'>" + e.nbColis + " colis · " +
                        U.fmt(e.poids, e.poids % 1 ? 1 : 0) + " kg</div>";
                } }
        ];
    }

    /* Onglet « À facturer » : sélectionnable, total en pied */
    var dtFacturer = new CX.DataTable("#dt-facturer", {
        columns: colonnesCommunes().concat([
            { key: "montant", title: "Montant HT", className: "num", render: function (e) { return "<span class='cx-strong cx-nowrap'>" + U.money(e.montant) + "</span>"; } }
        ]),
        selectable: true, pageSize: 50, sortKey: "dateExp", sortDir: 1, searchInput: "#q",
        emptyText: "Aucune expédition à facturer", emptyIcon: "fa-check-circle",
        footer: function (rows) {
            var t = 0; $.each(rows, function (_, e) { t += U.round(e.montant); });
            return "<tr><td></td><td colspan='7'>Total · " + pluriel(rows.length, "expédition") + "</td>" +
                "<td class='num cx-nowrap'>" + U.money(t) + "</td></tr>";
        },
        onSelect: function () { majResume(); }
    });

    /* Onglet « À régulariser » : motifs + actions en ligne */
    var dtRegulariser = new CX.DataTable("#dt-regulariser", {
        columns: colonnesCommunes().concat([
            { key: "motif", title: "À régulariser", sortable: false, render: motifs,
                searchValue: function (e) { return $("<div>").html(motifs(e)).text(); } },
            { key: "montant", title: "Montant HT", className: "num", render: function (e) {
                if (Number(e.montant) > 0) return "<span class='cx-strong cx-nowrap'>" + U.money(e.montant) + "</span>";
                var indicatif = CX.tarif.transport(e.villeDep, e.villeDest, e.poids);
                return "<div class='fe-saisie'><input type='text' class='form-control input-sm' data-montant inputmode='numeric' placeholder='≈ " +
                    U.fmt(indicatif) + "' title='Tarif indicatif : " + U.money(indicatif) + "'>" +
                    "<button type='button' class='cx-btn cx-btn-soft cx-btn-xs' data-act='montant' title='Enregistrer le montant'><i class='fa fa-check'></i></button></div>";
            } },
            { key: "actions", title: "", sortable: false, className: "cx-right", render: function (e) {
                if (e.preuveLivraison && e.statut === "LIVREE") return "<span class='cx-muted cx-nowrap'><i class='fa fa-check'></i> Preuve reçue</span>";
                return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs cx-nowrap' data-act='preuve'>" +
                    "<i class='fa fa-check-square-o'></i> Preuve reçue</button>";
            } }
        ]),
        pageSize: 50, sortKey: "dateExp", sortDir: 1, searchInput: "#q",
        emptyText: "Aucune expédition à régulariser", emptyIcon: "fa-thumbs-o-up",
        footer: function (rows) {
            var t = 0, n = 0; $.each(rows, function (_, e) { t += U.round(e.montant); if (!(e.montant > 0)) n++; });
            return "<tr><td colspan='8'>Total · " + pluriel(rows.length, "expédition") + (n ? " dont " + n + " sans montant" : "") + "</td>" +
                "<td class='num cx-nowrap'>" + U.money(t) + "</td><td></td></tr>";
        }
    });

    function ligneRegul(id) { return $.grep(lignesRegulariser, function (e) { return String(e.id) === String(id); })[0]; }

    /* Après une régularisation : message selon que la ligne devient facturable ou non */
    function apresRegul(id) {
        CX.api.get("expeditions", id).done(function (e) {
            if (estFacturable(e)) U.toast("Expédition " + U.esc(e.nRt) + " régularisée : elle passe dans « À facturer ».", "success");
            else U.toast("Expédition " + U.esc(e.nRt) + " mise à jour. Reste à régulariser : " + $("<div>").html(motifs(e)).text().toLowerCase() + ".", "info");
            charger();
        });
    }

    /* Saisie du montant d'une expédition à 0 */
    $("#dt-regulariser").on("click", "[data-act=montant]", function () {
        var $tr = $(this).closest("tr"), id = $tr.data("id");
        var m = U.round(U.num($tr.find("[data-montant]").val()));
        if (m <= 0) { U.toast("Saisissez un montant HT supérieur à 0.", "warning"); $tr.find("[data-montant]").focus(); return; }
        // TODO API : PATCH /commercial/expeditions/{id}/montant  { montant }
        CX.api.patchMany("expeditions", [Number(id)], { montant: m }).done(function () { apresRegul(id); });
    });
    $("#dt-regulariser").on("keydown", "[data-montant]", function (ev) {
        if (ev.which === 13) { ev.preventDefault(); $(this).closest("tr").find("[data-act=montant]").click(); }
    });

    /* Réception de la preuve de livraison (feuille signée revenue au siège) */
    var preuveId = null;
    $("#dt-regulariser").on("click", "[data-act=preuve]", function () {
        var e = ligneRegul($(this).closest("tr").data("id"));
        if (!e) return;
        preuveId = e.id;
        $("#p-feuille").text(e.nRtMan ? "n° " + e.nRtMan : "(sans n° de feuille)");
        $("#p-rt").text(e.nRt);
        $("#p-dest").text(e.destinataire);
        $("#p-dateLiv").val(e.dateLivraison || today).attr("min", e.dateExp).attr("max", today);
        $("#p-transit").toggleClass("cx-hidden", e.statut === "LIVREE");
        $("#m-preuve").modal("show");
    });
    $("#p-ok").on("click", function () {
        var d = $("#p-dateLiv").val();
        if (!d) { U.toast("Indiquez la date de livraison.", "warning"); return; }
        if (d > today) { U.toast("La date de livraison ne peut pas être dans le futur.", "warning"); return; }
        var id = preuveId;
        // TODO API : POST /commercial/expeditions/{id}/preuve-livraison  { dateLivraison }
        CX.api.patchMany("expeditions", [Number(id)], { preuveLivraison: true, statut: "LIVREE", dateLivraison: d }).done(function () {
            $("#m-preuve").modal("hide");
            apresRegul(id);
        });
    });

    /* Onglets */
    $("#tabs").on("click", "a", function () {
        ongletCourant = $(this).data("tab");
        $("#tabs a").removeClass("active");
        $(this).addClass("active");
        $("#pane-facturer").toggleClass("cx-hidden", ongletCourant !== "facturer");
        $("#pane-regulariser").toggleClass("cx-hidden", ongletCourant !== "regulariser");
        $("#tb-facturer").toggleClass("cx-hidden", ongletCourant !== "facturer");
    });
    $("#btn-tout").on("click", function () { dtFacturer.selectAll(); });
    $("#btn-aucun").on("click", function () { dtFacturer.clearSelection(); });

    /* ------------------------------------------------------------------
       Récapitulatif (colonne de droite)
       ------------------------------------------------------------------ */
    function clientsDe(rows) {
        var ids = [];
        $.each(rows, function (_, e) { if ($.inArray(e.clientId, ids) < 0) ids.push(e.clientId); });
        return ids;
    }
    function periodeDe(rows) {
        var du = $("#f-du").val(), au = $("#f-au").val();
        if (!du || !au) {
            var min = null, max = null;
            $.each(rows, function (_, e) { if (!min || e.dateExp < min) min = e.dateExp; if (!max || e.dateExp > max) max = e.dateExp; });
            du = du || min; au = au || max;
        }
        return { du: du, au: au };
    }
    function lireRemise() {
        var p = U.num($("#s-remisePct").val());
        return Math.min(100, Math.max(0, p));
    }

    function majResume() {
        var sel = dtFacturer.getSelected();
        var ids = clientsDe(sel);
        var multi = ids.length > 1;
        var cid = ids.length === 1 ? ids[0] : (ids.length === 0 && $("#f-client").val() ? Number($("#f-client").val()) : null);
        var c = cid ? clients[cid] : null;

        /* Remise par défaut = remise contractuelle du client (modifiable) */
        if (c && remiseClientId !== c.id) {
            remiseClientId = c.id;
            $("#s-remisePct").val(U.fmt(c.remisePct || 0, (c.remisePct || 0) % 1 ? 2 : 0));
        }
        $("#s-remise-info").text(c ? "(contrat : " + U.fmt(c.remisePct || 0) + " %)" : "");

        if (multi) {
            $("#s-client").text(pluriel(ids.length, "client") + " sélectionnés");
            $("#s-client-sub").text("Une facture ne peut concerner qu'un seul client");
            $("#s-multi-liste").html($.map(ids, function (id) {
                var n = $.grep(sel, function (e) { return e.clientId === id; }).length;
                return "<div>• " + U.esc(clients[id].raisonSociale) + " <b>(" + n + ")</b></div>";
            }).join(""));
        } else if (c) {
            $("#s-client").text(c.raisonSociale);
            $("#s-client-sub").text((c.code || "") + (c.niu ? " · NIU " + c.niu : "") + " · paiement à " +
                (c.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS) + " jours");
        } else {
            $("#s-client").text("Aucun client");
            $("#s-client-sub").text("Cochez des expéditions dans la liste");
        }
        $("#s-multi").toggleClass("cx-hidden", !multi);

        var p = periodeDe(sel);
        $("#s-periode").html("<i class='fa fa-calendar'></i> " + (p.du && p.au ? U.toFr(p.du) + " → " + U.toFr(p.au) : "—"));
        $("#s-nb").text(pluriel(sel.length, "expédition"));

        var k = calculer(sel, lireRemise());
        calculCourant = k;
        $("#s-ht").text(U.money(k.ht));
        $("#s-remise").text(k.remise ? "- " + U.money(k.remise) : U.money(0));
        $("#s-net").text(U.money(k.net));
        $("#s-taux").text(U.fmt(k.taux, 2) + " %");
        $("#s-tva").text(U.money(k.tva));
        $("#s-ttc").html(U.fmt(k.ttc) + "<small>FCFA</small>");
        $("#s-lettres").text(sel.length ? "Soit : " + enLettres(k.ttc) : "");
        $("#btn-creer").prop("disabled", !sel.length || multi || k.ht <= 0);
    }
    $("#s-remisePct").on("input", U.debounce(majResume, 150));
    $("#s-remisePct").on("blur", function () { $(this).val(U.fmt(lireRemise(), lireRemise() % 1 ? 2 : 0)); });

    /* ------------------------------------------------------------------
       Création de la facture : aperçu puis enregistrement
       ------------------------------------------------------------------ */
    var brouillon = null; // { client, rows, periode, calcul }

    function majEcheance() {
        if (!brouillon) return;
        var em = $("#c-dateEmission").val() || today;
        var delai = brouillon.client.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS;
        $("#c-dateEcheance").val(U.addDays(em, delai));
        $("#c-delai").text("Paiement à " + delai + " jours (conditions du client), soit le " + U.toFrLong(U.addDays(em, delai)) + ".");
    }

    $("#btn-creer").on("click", function () {
        var sel = dtFacturer.getSelected(), ids = clientsDe(sel);
        if (!sel.length) { U.toast("Cochez au moins une expédition à facturer.", "warning"); return; }
        if (ids.length > 1) { U.toast("Une facture ne peut concerner qu'un seul client.", "error"); return; }
        var c = clients[ids[0]], k = calculer(sel, lireRemise()), p = periodeDe(sel);
        brouillon = { client: c, rows: sel, periode: p, calcul: k };

        $("#c-client").text(c.raisonSociale);
        $("#c-client-sub").text([c.adresse, c.niu ? "NIU " + c.niu : "", c.rccm ? "RCCM " + c.rccm : ""].filter(Boolean).join(" · "));
        $("#c-periode").text("Du " + U.toFrLong(p.du) + " au " + U.toFrLong(p.au));
        $("#c-nb").text(pluriel(sel.length, "expédition") + " livrée" + (sel.length > 1 ? "s" : ""));
        var feuilles = $.map(sel, function (e) { return e.nRtMan || null; }).sort();
        var sans = sel.length - feuilles.length;
        $("#c-feuilles").html(feuilles.length
            ? "<span class='cx-mono'>" + U.esc(feuilles.slice(0, 6).join(", ")) + (feuilles.length > 6 ? "…" : "") + "</span>" +
              " <span class='cx-muted'>(" + pluriel(feuilles.length, "feuille") + ")</span>"
            : "<span class='cx-muted'>—</span>");
        if (sans) $("#c-feuilles").append("<div class='cx-cell-sub'>" + pluriel(sans, "expédition") + " sans n° de feuille</div>");

        $("#c-ht").text(U.money(k.ht));
        $("#c-remisePct").text("(" + U.fmt(k.remisePct, k.remisePct % 1 ? 2 : 0) + " %)");
        $("#c-remise").text(k.remise ? "- " + U.money(k.remise) : U.money(0));
        $("#c-net").text(U.money(k.net));
        $("#c-taux").text(U.fmt(k.taux, 2) + " %");
        $("#c-tva").text(U.money(k.tva));
        $("#c-ttc").html(U.fmt(k.ttc) + "<small>FCFA</small>");
        $("#c-lettres").text(enLettres(k.ttc));

        $("#c-dateEmission").val(today);
        $("#c-notes").val("");
        $("input[name=c-mode][value=EMISE]").prop("checked", true);
        majEcheance();
        majBoutonValider();
        $("#m-creer").modal("show");
    });
    $("#c-dateEmission").on("change input", majEcheance);

    function majBoutonValider() {
        var emettre = $("input[name=c-mode]:checked").val() === "EMISE";
        $("#c-valider").html(emettre ? "<i class='fa fa-paper-plane-o'></i> Émettre la facture" : "<i class='fa fa-save'></i> Enregistrer le brouillon");
    }
    $("input[name=c-mode]").on("change", majBoutonValider);

    $("#c-valider").on("click", function () {
        if (!brouillon) return;
        var b = brouillon, $btn = $(this);
        var dateEm = $("#c-dateEmission").val();
        if (!dateEm) { U.toast("Indiquez la date d'émission.", "warning"); return; }
        var statut = $("input[name=c-mode]:checked").val();
        var ids = $.map(b.rows, function (e) { return Number(e.id); });
        U.busy($btn, true);

        /* Contrôle anti-doublon : les expéditions ne doivent pas avoir été facturées entre-temps
           (côté Symfony : contrôle en transaction, avec verrou sur les expéditions) */
        CX.api.list("expeditions", function (e) { return $.inArray(e.id, ids) >= 0 && !!e.factureId; }).done(function (deja) {
            if (deja.length) {
                U.toast(pluriel(deja.length, "expédition") + (deja.length > 1 ? " ont déjà été facturées" : " a déjà été facturée") + " entre-temps. La liste est rechargée.", "error");
                U.busy($btn, false);
                $("#m-creer").modal("hide");
                charger();
                return;
            }
            var facture = {
                clientId: b.client.id,
                dateEmission: dateEm,
                dateEcheance: $("#c-dateEcheance").val(),
                periodeDu: b.periode.du,
                periodeAu: b.periode.au,
                expeditionIds: ids,
                montantHT: b.calcul.ht,          // total HT brut (avant remise)
                remisePct: b.calcul.remisePct,
                remise: b.calcul.remise,
                tauxTva: b.calcul.taux,
                tva: b.calcul.tva,
                montantTTC: b.calcul.ttc,
                statut: statut,
                paiements: [],
                notes: $.trim($("#c-notes").val()),
                historique: []
            };
            var factureId;
            // TODO API : POST /commercial/factures  { clientId, dateEmission, periodeDu, periodeAu, expeditionIds[], remisePct, notes, statut }
            //            (le serveur recalcule les montants, attribue le numéro FAC-AAAA-NNNN et rattache les expéditions en une transaction)
            CX.api.save("factures", facture).then(function (f) {
                factureId = f.id;
                return CX.api.patchMany("expeditions", ids, { factureId: f.id });
            }).then(function () {
                return CX.api.log("factures", factureId, statut === "EMISE"
                    ? "Facture émise (" + pluriel(ids.length, "expédition") + ", " + U.money(b.calcul.ttc) + " TTC)"
                    : "Facture créée en brouillon (" + pluriel(ids.length, "expédition") + ")");
            }).done(function (f) {
                U.toast("Facture " + U.esc(f.numero) + (statut === "EMISE" ? " émise." : " enregistrée en brouillon."), "success");
                window.location.href = "facture.html?id=" + factureId;
            }).fail(function (err) {
                U.toast(err || "Erreur lors de la création de la facture", "error");
                U.busy($btn, false);
            });
        });
    });

    /* ------------------------------------------------------------------
       Export « Excel » (CSV ; séparateur « ; », BOM UTF-8 pour Excel)
       ------------------------------------------------------------------ */
    function csvCell(v) {
        var s = v == null ? "" : String(v);
        return /[";\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    }
    $("#btn-export").on("click", function () {
        var dt = ongletCourant === "facturer" ? dtFacturer : dtRegulariser;
        var rows = dt._filtered(); // lignes affichées (recherche rapide + tri appliqués)
        if (!rows.length) { U.toast("Aucune ligne à exporter.", "info"); return; }
        // TODO API (option) : GET /commercial/facturation/expeditions/export.xlsx?… (export Excel natif côté serveur)
        var entetes = ["Date", "N° RT", "N° RT MAN", "Client", "Expéditeur", "Destinataire", "Ville départ", "Bureau départ",
            "Ville arrivée", "Bureau arrivée", "Contenu", "Colis", "Poids (kg)", "Montant HT", "Statut", "Preuve de livraison", "À régulariser"];
        var lignes = [entetes.join(";")];
        $.each(rows, function (_, e) {
            lignes.push($.map([
                U.toFr(e.dateExp), e.nRt, e.nRtMan || "", clients[e.clientId].raisonSociale, e.expediteur, e.destinataire,
                e.villeDep, e.bureauDep, e.villeDest, e.bureauDest, e.contenu, e.nbColis, String(e.poids).replace(".", ","),
                U.round(e.montant), e.statut === "LIVREE" ? "Livrée" : "En transit", e.preuveLivraison ? "Oui" : "Non",
                $("<div>").html(motifs(e)).text()
            ], function (v) { return [csvCell(v)]; }).join(";"));
        });
        var blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var nom = "expeditions-" + (ongletCourant === "facturer" ? "a-facturer" : "a-regulariser") + "-" + today.replace(/-/g, "") + ".csv";
        if (window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, nom); return; }
        var url = URL.createObjectURL(blob);
        var a = $("<a>").attr({ href: url, download: nom }).appendTo("body");
        a[0].click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
        U.toast(pluriel(rows.length, "ligne") + " exportée" + (rows.length > 1 ? "s" : "") + " (" + nom + ").", "success");
    });

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */
    // TODO API : GET /commercial/clients?enCompte=1 (ou injection Twig des clients en compte)
    CX.api.list("clients", function (c) { return c.enCompte; }).done(function (list) {
        list.sort(function (a, b) { return a.raisonSociale > b.raisonSociale ? 1 : -1; });
        $.each(list, function (_, c) { clients[c.id] = c; });
        $("#f-client").append($.map(list, function (c) {
            return "<option value='" + c.id + "'>" + U.esc(c.raisonSociale) + (c.statut !== "ACTIF" ? " (" + U.esc(c.statut.toLowerCase()) + ")" : "") + "</option>";
        }).join(""));
        $("#f-client").select2({
            width: "100%", allowClear: true, placeholder: "Tous les clients en compte",
            language: { noResults: function () { return "Aucun client en compte trouvé"; } }
        });

        var villes = $.map(CX.REF.VILLES, function (v) { return "<option value='" + U.esc(v.nom) + "'>" + U.esc(v.nom) + "</option>"; }).join("");
        $("#f-villeDep, #f-villeDest").append(villes);

        var pre = U.queryParam("client");
        if (pre && clients[pre]) $("#f-client").val(pre).trigger("change.select2");
        else if (pre) U.toast("Le client demandé n'est pas un client en compte.", "warning");

        appliquerRaccourci();

        /* Évènements des filtres (rechargement automatique ; « Afficher » recharge aussi) */
        $("#f-client").on("change", function () { remiseClientId = null; charger(); });
        $("input[name=periode]").on("change", function () { appliquerRaccourci(); charger(); });
        $("#f-du, #f-au").on("change", function () { $("input[name=periode][value=perso]").prop("checked", true); charger(); });
        $("#f-villeDep").on("change", function () { remplirBureaux($(this), $("#f-bureauDep")); charger(); });
        $("#f-villeDest").on("change", function () { remplirBureaux($(this), $("#f-bureauDest")); charger(); });
        $("#f-bureauDep, #f-bureauDest").on("change", charger);
        $("#btn-afficher").on("click", charger);
        $("#btn-reinit").on("click", function () {
            $("#f-client").val("").trigger("change.select2");
            $("input[name=periode][value=prec]").prop("checked", true);
            appliquerRaccourci();
            $("#f-villeDep, #f-villeDest").val("");
            remplirBureaux($("#f-villeDep"), $("#f-bureauDep"));
            remplirBureaux($("#f-villeDest"), $("#f-bureauDest"));
            $("#q").val(""); dtFacturer.setSearch(""); dtRegulariser.setSearch("");
            remiseClientId = null;
            charger();
        });

        charger();
    });
});

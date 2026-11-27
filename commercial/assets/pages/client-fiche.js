/* =====================================================================
   Commercial · Fiche client 360° (client-fiche.html?id=12)
   ---------------------------------------------------------------------
   En-tête (identité + actions), indicateurs, puis onglets :
   Informations · Contacts · Expéditions · Factures · Tarif & contrat · Cotations · Historique
   L'onglet ouvert est mémorisé dans l'ancre (#expeditions, #factures…).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, today = U.today();
    var id = U.queryParam("id");

    var TYPE = {
        COMPTANT: { label: "Au comptant", color: "grey" },
        COMPTE: { label: "En compte", color: "blue" },
        FORFAIT: { label: "Forfait", color: "purple" }
    };
    var STATUT_EXP = {
        LIVREE: { label: "Livrée", color: "green" },
        EN_TRANSIT: { label: "En transit", color: "blue" }
    };
    var PERIODICITE = { MENSUELLE: "Mensuelle (fin de mois)", QUINZAINE: "Par quinzaine", HEBDOMADAIRE: "Hebdomadaire", TRIMESTRIELLE: "Trimestrielle" };
    var ROLES = [
        { code: "PRINCIPAL", label: "Contact principal", icon: "fa-star" },
        { code: "SECOND", label: "Second contact", icon: "fa-user" },
        { code: "DG", label: "Directeur général", icon: "fa-briefcase" }
    ];

    var state = { client: null, exps: [], factures: [], cotations: [] };
    var dtExp, dtFac, dtCot;

    function typeDe(c) { return c.forfait ? "FORFAIT" : (c.enCompte ? "COMPTE" : "COMPTANT"); }
    function contact(c, role) { return $.grep(c.contacts || [], function (x) { return x.role === role; })[0] || {}; }
    function telHref(t) { return "tel:" + String(t || "").replace(/[^\d+]/g, ""); }
    function paye(f) { var s = 0; $.each(f.paiements || [], function (_, p) { s += p.montant; }); return s; }
    /* reste dû : solde à payer (TTC - acompte IS - acompte) s'il est calculé, sinon TTC */
    function reste(f) { return f.statut === "ANNULEE" || f.statut === "BROUILLON" ? 0 : Math.max(0, (f.soldeAPayer != null ? f.soldeAPayer : f.montantTTC) - paye(f)); }
    function factureActive(f) { return f.statut !== "ANNULEE" && f.statut !== "BROUILLON"; }

    /* =================================================================
       Chargement
       ================================================================= */
    function charger() {
        // TODO API : GET /commercial/clients/{id}
        return CX.api.get("clients", id).done(function (c) {
            state.client = c;
            // TODO API : GET /commercial/clients/{id}/expeditions | /factures | /cotations
            //            (ou un seul GET /commercial/clients/{id}/synthese renvoyant le tout + les indicateurs)
            $.when(
                CX.api.list("expeditions", function (e) { return e.clientId == c.id; }),
                CX.api.list("factures", function (f) { return f.clientId == c.id; }),
                CX.api.list("cotations", function (x) { return x.clientId == c.id; })
            ).done(function (exps, factures, cotations) {
                state.exps = exps; state.factures = factures; state.cotations = cotations;
                $("#fiche").removeClass("cx-hidden");
                rendreTout();
            });
        }).fail(function () {
            $("#fiche").addClass("cx-hidden");
            $("#not-found").removeClass("cx-hidden");
        });
    }

    function rendreTout() {
        rendreEntete();
        rendreKpis();
        rendreInfos();
        rendreContacts();
        rendreTables();
        rendreHistorique();
        rendreTarif();
    }

    /* =================================================================
       En-tête + alertes
       ================================================================= */
    function rendreEntete() {
        var c = state.client, type = typeDe(c);
        document.title = "Commercial · " + c.raisonSociale + " - ClemenTino";
        $("#h-avatar").text(U.initials(c.raisonSociale));
        $("#h-nom").text(c.raisonSociale);
        $("#h-sigle").text(c.sigle || "");
        $("#h-crumb").text(c.code);
        var a = REF.agence(c.agenceId);
        $("#h-meta").html([
            "<span class='cx-mono cx-strong'>" + U.esc(c.code) + "</span>",
            REF.badge(TYPE, type),
            REF.badge(REF.STATUT_CLIENT, c.statut),
            c.tarifAuto ? "<span class='cx-badge cx-badge-green cx-no-dot'><i class='fa fa-bolt'></i> Tarif automatique</span>" : "",
            badgeTarif(c),
            c.secteur ? "<span>" + U.esc(c.secteur) + "</span>" : "",
            c.ville ? "<span class='cx-sep-dot'></span><span><i class='fa fa-map-marker'></i> " + U.esc(c.ville) + "</span>" : "",
            a ? "<span class='cx-sep-dot'></span><span>Agence " + U.esc(a.nom) + "</span>" : ""
        ].join(" "));

        $("#a-modifier").attr("href", "client-form.html?id=" + c.id);
        var cotHref = "cotation-form.html?type=EXPEDITION&client=" + c.id;
        var cotOk = c.statut !== "SUSPENDU";
        $("#a-cotation, #a-cotation-2").attr("href", cotOk ? cotHref : "#").toggleClass("disabled", !cotOk)
            .attr("title", cotOk ? "" : "Compte suspendu");
        var factHref = "facture-emettre.html?client=" + c.id;
        $("#a-facturer, #a-facturer-exp").attr("href", c.enCompte ? factHref : "#").toggleClass("disabled", !c.enCompte)
            .attr("title", c.enCompte ? "" : "Client au comptant : pas de facturation de fin de période");
        $("#a-facturer-exp").toggleClass("cx-hidden", !c.enCompte);

        var actif = c.statut === "ACTIF";
        $("#a-suspendre").toggleClass("cx-btn-danger", actif).toggleClass("cx-btn-success", !actif)
            .html(actif ? "<i class='fa fa-pause-circle'></i> Suspendre" : "<i class='fa fa-play-circle'></i> Réactiver");

        /* Alertes */
        var al = [];
        if (c.statut === "SUSPENDU") {
            var ev = $.grep(c.historique || [], function (h) { return /suspendu/i.test(h.action); })[0];
            var motif = ev ? $.trim(ev.action.replace(/^compte suspendu\s*-?\s*/i, "")) : "";
            al.push(note("warn", "fa-pause-circle", "<b>Compte suspendu</b>" + (ev ? " depuis le " + U.toFr(ev.date) + " par " + U.esc(ev.user || "") : "") +
                (motif ? " (" + U.esc(motif) + ")" : "") +
                ". Aucune nouvelle cotation ni expédition en compte n'est possible."));
        }
        if (c.statut === "INACTIF") al.push(note("info", "fa-moon-o", "<b>Compte inactif.</b> Réactivez-le pour reprendre les opérations."));
        if (c.enCompte && (!c.niu || !c.rccm)) {
            al.push(note("warn", "fa-exclamation-triangle", "Client en compte sans " + (!c.niu && !c.rccm ? "NIU ni RCCM" : (!c.niu ? "NIU" : "RCCM")) +
                " : les factures ne seront pas conformes. <a href='client-form.html?id=" + c.id + "'>Compléter la fiche</a>"));
        }
        var encours = 0; $.each(state.factures, function (_, f) { encours += reste(f); });
        if (c.enCompte && c.plafondCredit > 0 && encours > c.plafondCredit) {
            al.push(note("err", "fa-ban", "<b>Plafond de crédit dépassé</b> : encours de " + U.money(encours) + " pour un plafond de " + U.money(c.plafondCredit) + "."));
        }
        $("#h-alertes").html(al.join(""));
    }
    /* Badge « grille appliquée » dans l'en-tête (clic : onglet Tarif & contrat) */
    function badgeTarif(c) {
        if (!CX.tarifs) return "";
        var r = CX.tarifs.resoudre(c.id, today);
        if (!r.grille || r.origine === "STANDARD") return "";
        var o = CX.tarifs.ORIGINES[r.origine];
        return "<a href='#tarif' data-goto-tarif class='cx-badge cx-badge-" + o.color + " cx-no-dot' title='" + U.esc(r.libelle) + "'><i class='fa " + o.icon + "'></i> " + U.esc(r.grille.nom) + "</a>";
    }
    function note(type, icon, html) { return "<div class='cx-note cx-note-" + type + "'><i class='fa " + icon + "'></i><div>" + html + "</div></div>"; }

    /* =================================================================
       Indicateurs
       ================================================================= */
    function rendreKpis() {
        var c = state.client, annee = today.substr(0, 4), debutMois = U.firstOfMonth(today);
        var ca = 0, nbFac = 0, encours = 0, echu = 0;
        $.each(state.factures, function (_, f) {
            if (!factureActive(f)) return;
            if (f.dateEmission.substr(0, 4) === annee) { ca += f.montantTTC; nbFac++; }
            var r = reste(f);
            encours += r;
            if (r > 0 && f.dateEcheance < today) echu += r;
        });
        var duMois = $.grep(state.exps, function (e) { return e.dateExp >= debutMois; });
        var htMois = 0; $.each(duMois, function (_, e) { htMois += e.montant || 0; });
        var nonFact = $.grep(state.exps, function (e) { return !e.factureId; });
        var aRegul = $.grep(nonFact, function (e) { return !e.montant || (e.statut === "LIVREE" && !e.preuveLivraison); }).length;
        var htNonFact = 0; $.each(nonFact, function (_, e) { htNonFact += e.montant || 0; });

        var footEncours = echu ? "<span style='color:var(--cx-red)'>dont " + U.money(echu) + " échu</span>" : "TTC - paiements reçus";
        var barre = "";
        if (c.enCompte && c.plafondCredit > 0) {
            var pct = Math.round(encours / c.plafondCredit * 100);
            footEncours += "<br>" + pct + " % du plafond (" + U.money(c.plafondCredit) + ")";
            barre = "<div class='cx-bar " + (pct > 100 ? "red" : pct > 80 ? "orange" : "green") + "'><i style='width:" + Math.min(100, pct) + "%'></i></div>";
        }

        $("#kpis").html([
            kpi("CA facturé " + annee, U.fmt(ca) + " <small>FCFA</small>", nbFac + " facture" + (nbFac > 1 ? "s" : "") + " · TTC", "fa-line-chart", "green", "factures"),
            kpi("Encours", U.fmt(encours) + " <small>FCFA</small>", footEncours + barre, "fa-hourglass-half", echu ? "red" : "purple", "factures"),
            kpi("Expéditions du mois", duMois.length, U.money(htMois) + " HT depuis le " + U.toFr(debutMois), "fa-cube", "", "expeditions"),
            kpi("Expéditions non facturées", nonFact.length,
                c.enCompte ? U.money(htNonFact) + " HT" + (aRegul ? " · <span style='color:var(--cx-orange)'>" + aRegul + " à régulariser</span>" : "")
                    : "Client au comptant", "fa-cubes", nonFact.length && c.enCompte ? "orange" : "", "expeditions-nonfact")
        ].join(""));
    }
    function kpi(label, value, foot, icon, color, tab) {
        return "<div class='cx-kpi clickable " + color + "' data-goto='" + tab + "'>" +
            "<div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div>" +
            "<div class='cx-kpi-foot'>" + foot + "</div></div>";
    }

    /* =================================================================
       Onglet Informations
       ================================================================= */
    function dl(paires) {
        return $.map(paires, function (p) {
            var v = p[1];
            return "<dt>" + U.esc(p[0]) + "</dt>" + (v === "" || v == null ? "<dd class='cx-muted'>Non renseigné</dd>" : "<dd>" + v + "</dd>");
        }).join("");
    }
    function e(s) { return s ? U.esc(s) : ""; }
    function mail(s) { return s ? "<a href='mailto:" + U.esc(s) + "'>" + U.esc(s) + "</a>" : ""; }
    function tel(s) { return s ? "<a href='" + telHref(s) + "'>" + U.esc(s) + "</a>" : ""; }

    function rendreInfos() {
        var c = state.client, type = typeDe(c), a = REF.agence(c.agenceId);
        $("#dl-entreprise").html(dl([
            ["Raison sociale", "<b>" + e(c.raisonSociale) + "</b>"],
            ["Sigle", e(c.sigle)],
            ["Code client", "<span class='cx-mono'>" + e(c.code) + "</span>"],
            ["Secteur d'activité", e(c.secteur)],
            ["RCCM", c.rccm ? "<span class='cx-mono'>" + e(c.rccm) + "</span>" : ""],
            ["NIU", c.niu ? "<span class='cx-mono'>" + e(c.niu) + "</span>" : ""],
            ["Ville", e(c.ville)],
            ["Localisation", e(c.localisation)],
            ["Adresse postale", e(c.adresse)],
            ["Téléphone standard", tel(c.telStandard)],
            ["Email", mail(c.email)],
            ["Activités", c.activites ? U.esc(c.activites).replace(/\n/g, "<br>") : ""],
            ["Note interne", c.note ? U.esc(c.note).replace(/\n/g, "<br>") : ""]
        ]));

        var tarif = "Non";
        if (c.tarifAuto) {
            tarif = c.tarifToutesAgences ? "Oui - toutes les agences" : "Oui - " + ($.map(c.tarifAgences || [], function (aid) {
                var ag = REF.agence(aid); return ag ? U.esc(ag.nom + " (" + ag.ville + ")") : null;
            }).join(", ") || "aucune agence");
        }
        var paires = [["Type de compte", REF.badge(TYPE, type)]];
        if (c.enCompte) {
            paires.push(["Périodicité", e(PERIODICITE[c.periodicite] || c.periodicite)]);
            paires.push(["Délai de paiement", c.delaiPaiement + " jour" + (c.delaiPaiement > 1 ? "s" : "")]);
            paires.push(["Plafond de crédit", c.plafondCredit > 0 ? U.money(c.plafondCredit) : "Sans plafond"]);
            paires.push(["Remise accordée", U.fmt(c.remisePct || 0, (c.remisePct || 0) % 1 ? 1 : 0) + " %"]);
            paires.push(["Email de facturation", mail(c.emailFacturation)]);
            /* Conditions de facturation (CX.REF.conditionsFacturation : valeurs par défaut si absentes) */
            var k = REF.conditionsFacturation(c), frais = [];
            if (k.assurance) frais.push("assurance " + U.money(k.assurance));
            if (k.manutention) frais.push("manutention " + U.money(k.manutention));
            if (k.emballage) frais.push("emballage " + U.money(k.emballage));
            paires.push(["N° de compte", "<span class='cx-mono'>" + e(REF.compteClient(c)) + "</span>" + (c.compte ? "" : " <span class='cx-muted'>(attribué automatiquement)</span>")]);
            paires.push(["TVA", k.avecTva ? "Oui - " + U.fmt(k.tauxTva, 2) + " %" : "<span class='cx-badge cx-badge-orange'>Facturé sans TVA</span>"]);
            paires.push(["Acompte IS", k.abonnementIs ? "Oui - " + U.fmt(k.tauxIs, 1) + " % retenu à la source" : "Non"]);
            paires.push(["Frais par facture", frais.length ? e(frais.join(" · ")) : "Aucun"]);
            paires.push(["Présentation facture", (k.afficherPuMoyen ? "PU moyen affiché" : "Sans PU moyen") + " · sous-totaux : " + e((REF.SOUS_TOTAL[k.sousTotal] || "Aucun").toLowerCase())]);
        }
        if (c.forfait) paires.push(["Montant du forfait", U.money(c.montantForfait) + " HT / période"]);
        paires.push(["Tarification auto.", tarif]);
        paires.push(["Agence de rattachement", a ? e(a.nom + " · " + a.ville) : ""]);
        paires.push(["Commercial", e(c.commercial)]);
        // TODO API : l'apporteur est renvoyé avec le client (GET /commercial/clients/{id})
        var ap = c.apporteurId ? $.grep(CX.api.listSync("apporteurs"), function (x) { return String(x.id) === String(c.apporteurId); })[0] : null;
        paires.push(["Apporteur d'affaires", ap ? "<a href='apporteur-form.html?id=" + ap.id + "'>" + e(ap.prenoms + " " + ap.nom) + "</a> <span class='cx-mono cx-muted'>" + e(ap.code) + "</span> · " +
            U.fmt(ap.tauxCommission, ap.tauxCommission % 1 ? 1 : 0) + " % " + e(((REF.BASES_COMMISSION[ap.baseCommission] || {}).label || "").toLowerCase()) +
            (ap.statut !== "ACTIF" ? " " + REF.badge(REF.STATUT_APPORTEUR, ap.statut) : "") : ""]);
        // TODO API : GET /commercial/clients/{id}/fiche (téléchargement du PDF)
        paires.push(["Fiche client", c.ficheClient ? "<a href='#' data-fiche><i class='fa fa-file-pdf-o' style='color:#d14343'></i> " + e(c.ficheClient) + "</a>" : ""]);
        paires.push(["Créé le", U.toFr(c.dateCreation) + (c.creePar ? " par " + e(c.creePar) : "")]);
        $("#dl-compte").html(dl(paires));
    }

    /* =================================================================
       Onglet Contacts
       ================================================================= */
    function rendreContacts() {
        var c = state.client, n = 0;
        $("#contacts").html($.map(ROLES, function (r) {
            var ct = contact(c, r.code);
            if (!ct.nom) {
                return "<div class='cx-contact empty'><div class='cx-contact-role'><i class='fa " + r.icon + "'></i> " + r.label + "</div>" +
                    "<div class='cx-empty' style='padding:18px 0 6px'><b>Non renseigné</b><a href='client-form.html?id=" + c.id + "'>Compléter la fiche</a></div></div>";
            }
            n++;
            return "<div class='cx-contact'><div class='cx-contact-role'><i class='fa " + r.icon + "'></i> " + r.label + "</div>" +
                "<div class='cx-who'><span class='cx-avatar'>" + U.initials(ct.nom) + "</span><div><b>" + U.esc(ct.nom) + "</b>" +
                "<small>" + U.esc(ct.titre || (r.code === "DG" ? "Directeur général" : "")) + "</small></div></div><ul>" +
                (ct.tel1 ? "<li><i class='fa fa-phone'></i>" + tel(ct.tel1) + "</li>" : "") +
                (ct.tel2 ? "<li><i class='fa fa-mobile'></i>" + tel(ct.tel2) + "</li>" : "") +
                (ct.email ? "<li><i class='fa fa-envelope-o'></i>" + mail(ct.email) + "</li>" : "") +
                (!ct.tel1 && !ct.tel2 && !ct.email ? "<li class='cx-muted'>Aucune coordonnée</li>" : "") +
                "</ul></div>";
        }).join(""));
        $("#n-contacts").text(n);
    }

    /* =================================================================
       Onglets Expéditions / Factures / Cotations (CX.DataTable)
       ================================================================= */
    function creerTables() {
        dtExp = new CX.DataTable("#dt-exp", {
            pageSize: 10, sortKey: "dateExp", sortDir: -1, searchInput: "#q-exp",
            emptyText: "Aucune expédition", emptyIcon: "fa-cube",
            columns: [
                {
                    key: "nRt", title: "N° RT",
                    searchValue: function (x) { return x.nRt + " " + (x.nRtMan || ""); },
                    render: function (x) {
                        return "<span class='cx-mono cx-strong'>" + U.esc(x.nRt) + "</span>" +
                            (x.nRtMan ? "<div class='cx-cell-sub'>LT manuelle n° " + U.esc(x.nRtMan) + "</div>" : "");
                    }
                },
                { key: "dateExp", title: "Date", render: function (x) { return U.toFr(x.dateExp); } },
                {
                    key: "trajet", title: "Trajet",
                    sortValue: function (x) { return x.villeDest; },
                    searchValue: function (x) { return x.villeDep + " " + x.villeDest + " " + x.bureauDep + " " + x.bureauDest; },
                    render: function (x) {
                        return U.esc(x.villeDep) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(x.villeDest) +
                            "<div class='cx-cell-sub'>" + U.esc(x.bureauDep) + " → " + U.esc(x.bureauDest) + "</div>";
                    }
                },
                {
                    key: "destinataire", title: "Destinataire",
                    render: function (x) { return U.esc(x.destinataire) + "<div class='cx-cell-sub'>" + U.esc(x.telDestinataire || "") + "</div>"; }
                },
                {
                    key: "contenu", title: "Contenu",
                    render: function (x) {
                        return U.esc(x.contenu) + "<div class='cx-cell-sub'>" + x.nbColis + " colis · " + U.fmt(x.poids, x.poids % 1 ? 1 : 0) + " kg</div>";
                    }
                },
                {
                    key: "montant", title: "Montant HT", className: "num",
                    render: function (x) { return x.montant ? "<b>" + U.money(x.montant) + "</b>" : "<span class='cx-badge cx-badge-orange'>À régulariser</span>"; }
                },
                {
                    key: "statut", title: "Statut",
                    searchValue: function (x) { return (STATUT_EXP[x.statut] || {}).label || ""; },
                    render: function (x) {
                        return REF.badge(STATUT_EXP, x.statut) +
                            (x.statut === "LIVREE" && !x.preuveLivraison ? "<div class='cx-cell-sub' style='color:var(--cx-orange)'>Décharge non revenue</div>" : "");
                    }
                },
                {
                    key: "factureId", title: "Facture",
                    sortValue: function (x) { return x.factureId || 0; },
                    searchValue: function (x) { var f = factureDe(x.factureId); return f ? f.numero : "non facturée"; },
                    render: function (x) {
                        var f = factureDe(x.factureId);
                        return f ? "<a class='cx-mono' href='facture.html?id=" + f.id + "'>" + U.esc(f.numero) + "</a>" : "<span class='cx-badge cx-badge-grey'>Non facturée</span>";
                    }
                }
            ],
            footer: function (rows) {
                var ht = 0; $.each(rows, function (_, x) { ht += x.montant || 0; });
                return "<tr><td colspan='5'>" + rows.length + " expédition" + (rows.length > 1 ? "s" : "") + "</td><td class='num'>" + U.money(ht) + "</td><td colspan='2'></td></tr>";
            }
        });

        dtFac = new CX.DataTable("#dt-fac", {
            pageSize: 10, sortKey: "dateEmission", sortDir: -1,
            emptyText: "Aucune facture émise pour ce client", emptyIcon: "fa-file-text-o",
            columns: [
                { key: "numero", title: "N° facture", render: function (f) { return "<a class='cx-mono cx-strong' href='facture.html?id=" + f.id + "'>" + U.esc(f.numero) + "</a>"; } },
                { key: "dateEmission", title: "Émise le", render: function (f) { return U.toFr(f.dateEmission); } },
                {
                    key: "periode", title: "Période", sortValue: function (f) { return f.periodeDu; },
                    render: function (f) { return f.periodeDu ? "Du " + U.toFr(f.periodeDu) + "<div class='cx-cell-sub'>au " + U.toFr(f.periodeAu) + "</div>" : "—"; }
                },
                {
                    key: "dateEcheance", title: "Échéance",
                    render: function (f) {
                        var r = reste(f), retard = U.daysBetween(f.dateEcheance, today);
                        return U.toFr(f.dateEcheance) + (r > 0 && retard > 0 ? "<div class='cx-cell-sub' style='color:var(--cx-red)'>" + retard + " j de retard</div>" : "");
                    }
                },
                { key: "montantTTC", title: "Montant TTC", className: "num", render: function (f) { return U.money(f.montantTTC); } },
                { key: "paye", title: "Payé", className: "num", sortValue: paye, render: function (f) { return U.money(paye(f)); } },
                { key: "reste", title: "Reste à payer", className: "num", sortValue: reste, render: function (f) { var r = reste(f); return r ? "<b>" + U.money(r) + "</b>" : "<span class='cx-muted'>—</span>"; } },
                {
                    key: "statut", title: "Statut",
                    searchValue: function (f) { return (REF.STATUT_FACTURE[f.statut] || {}).label || ""; },
                    render: function (f) { return REF.badge(REF.STATUT_FACTURE, f.statut); }
                }
            ],
            footer: function (rows) {
                var ttc = 0, p = 0, r = 0;
                $.each(rows, function (_, f) { if (!factureActive(f)) return; ttc += f.montantTTC; p += paye(f); r += reste(f); });
                return "<tr><td colspan='4'>Total (hors brouillons et annulées)</td><td class='num'>" + U.money(ttc) + "</td><td class='num'>" + U.money(p) +
                    "</td><td class='num'>" + U.money(r) + "</td><td></td></tr>";
            }
        });

        dtCot = new CX.DataTable("#dt-cot", {
            pageSize: 10, sortKey: "dateCreation", sortDir: -1,
            emptyText: "Aucune cotation pour ce client", emptyIcon: "fa-calculator",
            columns: [
                { key: "numero", title: "N° cotation", render: function (x) { return "<a class='cx-mono cx-strong' href='cotation-document.html?id=" + x.id + "'>" + U.esc(x.numero) + "</a>"; } },
                {
                    key: "type", title: "Type",
                    searchValue: function (x) { return (REF.TYPE_COTATION[x.type] || {}).label || x.type; },
                    render: function (x) {
                        var t = REF.TYPE_COTATION[x.type] || { label: x.type, icon: "fa-file-o" };
                        return "<i class='fa " + t.icon + " cx-muted'></i> " + U.esc(t.label);
                    }
                },
                { key: "nom", title: "Objet", render: function (x) { return U.esc(x.nom); } },
                { key: "dateCreation", title: "Créée le", render: function (x) { return U.toFr(x.dateCreation) + "<div class='cx-cell-sub'>par " + U.esc(x.creePar || "") + "</div>"; } },
                { key: "dateValidite", title: "Valable jusqu'au", render: function (x) { return x.dateValidite ? U.toFr(x.dateValidite) : "—"; } },
                { key: "montantTTC", title: "Montant TTC", className: "num", render: function (x) { return x.montantTTC ? U.money(x.montantTTC) : "<span class='cx-muted'>Grille</span>"; } },
                {
                    key: "statut", title: "Statut",
                    searchValue: function (x) { return (REF.STATUT_COTATION[x.statut] || {}).label || ""; },
                    render: function (x) { return REF.badge(REF.STATUT_COTATION, x.statut); }
                }
            ]
        });
    }

    function factureDe(fid) { return fid ? $.grep(state.factures, function (f) { return f.id == fid; })[0] : null; }

    function filtrerExp() {
        var seules = $("#f-exp-nonfact").is(":checked");
        dtExp.setRows(seules ? $.grep(state.exps, function (x) { return !x.factureId; }) : state.exps);
    }

    function rendreTables() {
        if (!dtExp) creerTables();
        filtrerExp();
        dtFac.setRows(state.factures);
        dtCot.setRows(state.cotations);
        $("#n-expeditions").text(state.exps.length);
        $("#n-factures").text(state.factures.length);
        $("#n-cotations").text(state.cotations.length);
    }

    /* =================================================================
       Onglet Tarif & contrat (moteur CX.tarifs)
       ================================================================= */
    var dtCtr;
    function rendreTarif() {
        var c = state.client, T = CX.tarifs;
        if (!T) return;
        var res = T.resoudre(c.id, today), g = res.grille, o = T.ORIGINES[res.origine] || { label: "—", color: "grey", icon: "fa-question" };
        var contrats = $.grep(CX.api.listSync("contrats"), function (x) { return String(x.clientId) === String(c.id); });
        var ctr = T.contratEnVigueur(c.id, today, contrats);
        state.tarif = res;

        /* Grille appliquée aujourd'hui */
        var regles = g ? $.map((g.regles || []).slice(0, 6), function (r) {
            return "<li class='ok'><i class='fa " + T.MODELES[r.modele].icon + "'></i><b>" + U.esc(r.libelle || T.MODELES[r.modele].label) + "</b><small>" + U.esc(T.libPerimetre(r)) + " · " + U.esc(T.libModele(r)) + "</small></li>";
        }).join("") : "";
        var base = g && g.baseId ? T.grilleParId(g.baseId) : null;
        $("#tarif-grille").html("<div class='cx-block-title'>Grille appliquée aujourd'hui</div>" + (g ?
            "<div class='cx-tarif-chip" + (res.origine === "STANDARD" ? " std" : "") + "'><i class='fa " + o.icon + "'></i><div>" +
            "<a href='tarif-form.html?id=" + g.id + "'>" + U.esc(g.nom) + "</a> <span class='cx-mono' style='font-size:11px'>" + U.esc(g.code) + "</span>" +
            "<small>" + U.esc(o.label) + " · " + U.esc(res.libelle) + " · valable " + U.esc(T.libValidite(g)) + "</small></div></div>" +
            "<ul class='cx-checklist' style='margin-bottom:8px'>" + regles + ((g.regles || []).length > 6 ? "<li>… " + ((g.regles || []).length - 6) + " autre(s) règle(s)</li>" : "") +
            (base ? "<li><i class='fa fa-level-down'></i>Sinon : grille " + U.esc(base.code + " · " + base.nom) + (g.remiseBasePct ? " (" + (g.remiseBasePct > 0 ? "−" : "+") + U.fmt(Math.abs(g.remiseBasePct)) + " %)" : "") + "</li>" : "") + "</ul>" +
            $.map(res.alertes, function (a) { return note("warn", "fa-exclamation-triangle", U.esc(a)); }).join("") +
            "<div style='display:flex;gap:8px;flex-wrap:wrap'><button type='button' class='cx-btn cx-btn-primary cx-btn-sm' id='btn-simuler'><i class='fa fa-calculator'></i> Simuler un envoi</button>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='tarif-form.html?id=" + g.id + "'><i class='fa fa-table'></i> Voir la grille</a>" +
            (res.origine === "STANDARD" || res.origine === "GROUPE" ? "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='tarif-form.html?type=CLIENT&client=" + c.id + "'><i class='fa fa-plus'></i> Grille propre au client</a>" : "") + "</div>"
            : note("err", "fa-ban", "Aucune grille applicable : " + U.esc(res.alertes.join(" ")))));

        /* Contrat en vigueur */
        var reste = ctr && ctr.au ? U.daysBetween(today, ctr.au) : null, k = ctr ? ctr.conditions || {} : {};
        var retour = encodeURIComponent("client-fiche.html?id=" + c.id + "#tarif");
        $("#tarif-contrat").html("<div class='cx-block-title'>Contrat en vigueur</div>" + (ctr ?
            "<dl class='cx-dl'>" +
            "<dt>N° de contrat</dt><dd><a class='cx-mono' href='contrat-form.html?id=" + ctr.id + "&retour=" + retour + "'>" + U.esc(ctr.numero) + "</a> " + T.badge(T.STATUTS_CONTRAT, "ACTIF") + "</dd>" +
            "<dt>Objet</dt><dd>" + U.esc(ctr.objet || "") + "</dd>" +
            "<dt>Période</dt><dd>" + U.toFr(ctr.du) + " → " + U.toFr(ctr.au) + (reste != null ? " <span class='cx-badge cx-badge-" + (reste <= 30 ? "orange" : "grey") + " cx-no-dot'>expire dans " + reste + " j</span>" : "") + "</dd>" +
            "<dt>Signé le</dt><dd>" + (ctr.dateSignature ? U.toFr(ctr.dateSignature) : "—") + "</dd>" +
            "<dt>Conditions</dt><dd>" + (k.delaiPaiement || 0) + " j · remise " + U.fmt(k.remisePct || 0) + " % · plafond " + (k.plafondCredit ? U.money(k.plafondCredit) : "aucun") + "</dd>" +
            /* TODO API : GET /commercial/contrats/{id}/document */
            "<dt>Contrat signé</dt><dd>" + (ctr.fichier ? "<a href='#' data-contrat-pdf='" + U.esc(ctr.fichier) + "'><i class='fa fa-file-pdf-o' style='color:#d14343'></i> " + U.esc(ctr.fichier) + "</a>" : "<span style='color:var(--cx-orange)'>PDF non chargé</span>") + "</dd>" +
            "</dl><div style='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap'><a class='cx-btn cx-btn-ghost cx-btn-sm' href='contrat-form.html?id=" + ctr.id + "&retour=" + retour + "'><i class='fa fa-pencil'></i> Modifier</a>" +
            (reste != null && reste <= 60 ? "<a class='cx-btn cx-btn-soft cx-btn-sm' href='contrat-form.html?client=" + c.id + "&renouveler=" + ctr.id + "'><i class='fa fa-refresh'></i> Renouveler</a>" : "") +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' href='contrat-form.html?client=" + c.id + "'><i class='fa fa-plus'></i> Nouveau contrat</a></div>"
            : "<div class='cx-empty' style='padding:18px 0'><i class='fa fa-file-text-o'></i><b>Aucun contrat en vigueur</b>Le client est tarifé selon sa grille " +
              (res.origine === "GROUPE" ? "de groupe" : res.origine === "CLIENT" ? "propre" : "standard") + ".<br><br>" +
              "<a class='cx-btn cx-btn-primary cx-btn-sm' href='contrat-form.html?client=" + c.id + "'><i class='fa fa-plus'></i> Nouveau contrat</a></div>"));

        /* Groupes du client */
        var grs = T.groupesDuClient(c.id);
        $("#tarif-groupes").html("<span class='cx-muted' style='font-size:12.5px'>Groupes de clients : </span>" + (grs.length ? $.map(grs, function (x) {
            return "<a class='cx-tag' href='tarifs-liste.html#groupes'><i class='fa fa-users'></i> " + U.esc(x.nom) + "</a>";
        }).join(" ") : "<span class='cx-muted' style='font-size:12.5px'>aucun</span>") + " · <a href='client-form.html?id=" + c.id + "' style='font-size:12.5px'>modifier</a>");

        /* Historique des contrats */
        if (!dtCtr) {
            dtCtr = new CX.DataTable("#dt-ctr", {
                pageSize: 10, sortKey: "du", sortDir: -1, emptyText: "Aucun contrat pour ce client", emptyIcon: "fa-file-text-o",
                columns: [
                    { key: "numero", title: "N° contrat", render: function (x) { return "<a class='cx-mono cx-strong' href='contrat-form.html?id=" + x.id + "'>" + U.esc(x.numero) + "</a><div class='cx-cell-sub'>" + U.esc(x.objet || "") + "</div>"; } },
                    { key: "du", title: "Période", render: function (x) { return U.toFr(x.du) + " → " + U.toFr(x.au); } },
                    { key: "tarifaireId", title: "Grille", render: function (x) { var gg = CX.tarifs.grilleParId(x.tarifaireId); return gg ? "<a href='tarif-form.html?id=" + gg.id + "'>" + U.esc(gg.nom) + "</a>" : "—"; } },
                    { key: "fichier", title: "Document", sortable: false, render: function (x) { return x.fichier ? "<a href='#' data-contrat-pdf='" + U.esc(x.fichier) + "'><i class='fa fa-file-pdf-o' style='color:#d14343'></i> PDF</a>" : "<span class='cx-muted'>—</span>"; } },
                    { key: "statut", title: "Statut", sortValue: function (x) { return CX.tarifs.statutContrat(x, today); }, render: function (x) { return CX.tarifs.badge(CX.tarifs.STATUTS_CONTRAT, CX.tarifs.statutContrat(x, today)); } }
                ]
            });
        }
        dtCtr.setRows(contrats);
        $("#n-contrats").text(contrats.length);
        $("#a-contrat").attr("href", "contrat-form.html?client=" + c.id);
    }

    /* Simulation d'un envoi avec la grille du client (modale construite à la volée) */
    function simulerEnvoi() {
        var T = CX.tarifs, c = state.client, res = state.tarif;
        if (!res || !res.grille) return;
        $("#m-sim").remove();
        var villes = $.map(REF.VILLES, function (v) { return "<option value='" + v.nom + "'>" + U.esc(T.villeLabel(v.nom)) + "</option>"; }).join("");
        function col(n, id, label, ctrl) { return "<div class='col-sm-" + n + "'><div class='cx-field'><label class='cx-label' for='" + id + "'>" + label + "</label>" + ctrl + "</div></div>"; }
        var $m = $("<div class='modal fade' id='m-sim' tabindex='-1' role='dialog'><div class='modal-dialog' style='max-width:640px'><div class='modal-content'>" +
            "<div class='modal-header'><button type='button' class='close' data-dismiss='modal'>&times;</button><h4 class='modal-title'><i class='fa fa-calculator'></i>Simuler un envoi · " + U.esc(c.raisonSociale) + "</h4></div>" +
            "<div class='modal-body'><div class='cx-tarif-chip" + (res.origine === "STANDARD" ? " std" : "") + "'><i class='fa fa-table'></i><div><b>" + U.esc(res.grille.nom) + "</b><small>" + U.esc(res.libelle) + "</small></div></div>" +
            "<div class='row'>" +
            col(4, "sim-dep", "Départ", "<select class='form-control' id='sim-dep'>" + villes + "</select>") +
            col(4, "sim-dest", "Arrivée", "<select class='form-control' id='sim-dest'>" + villes + "</select>") +
            col(4, "sim-nature", "Nature", "<select class='form-control' id='sim-nature'>" + $.map(REF.NATURES_COLIS, function (n) { return "<option>" + U.esc(n) + "</option>"; }).join("") + "</select>") +
            col(3, "sim-poids", "Poids (kg)", "<input type='text' class='form-control' id='sim-poids' value='5' inputmode='decimal'>") +
            col(3, "sim-nombre", "Nombre", "<input type='text' class='form-control' id='sim-nombre' value='1' inputmode='numeric'>") +
            col(3, "sim-valeur", "Valeur déclarée", "<input type='text' class='form-control' id='sim-valeur' inputmode='numeric' placeholder='0'>") +
            col(3, "sim-zone", "Remise", "<select class='form-control' id='sim-zone'><option value=''>Retrait bureau</option>" +
                $.map(REF.ZONES_LIVRAISON, function (z) { return "<option value='" + z.code + "'>Domicile " + z.code + "</option>"; }).join("") + "</select>") +
            "</div><div id='sim-res'></div></div>" +
            "<div class='modal-footer'><a class='cx-btn cx-btn-ghost' href='cotation-form.html?type=EXPEDITION&client=" + c.id + "'><i class='fa fa-calculator'></i> Faire une cotation</a>" +
            "<button type='button' class='cx-btn cx-btn-primary' data-dismiss='modal'>Fermer</button></div></div></div></div>").appendTo("body");
        var dep = c.ville || CX.CONFIG.USER.ville;
        $m.find("#sim-dep").val(dep); $m.find("#sim-dest").val(dep === "YAOUNDE" ? "DOUALA" : "YAOUNDE");
        function calc() {
            var z = $m.find("#sim-zone").val();
            var r = T.calculer(res.grille, {
                villeDep: $m.find("#sim-dep").val(), villeDest: $m.find("#sim-dest").val(), nature: $m.find("#sim-nature").val(),
                poids: U.num($m.find("#sim-poids").val()), nombre: parseInt($m.find("#sim-nombre").val(), 10) || 1,
                valeurDeclaree: U.num($m.find("#sim-valeur").val()), livraison: z ? "DOMICILE" : "BUREAU", zone: z
            });
            $m.find("#sim-res").html("<div class='cx-sum-total' style='margin-top:0;border-top:0;padding-top:4px'><span>Montant " + (res.grille.tvaIncluse ? "TTC" : "HT") + "</span><b><span id='sim-total'>" + U.fmt(r.total) + "</span><small>FCFA</small></b></div>" +
                "<div class='cx-muted' style='font-size:12px;margin-bottom:8px'>soit " + U.money(r.ttc) + " TTC (TVA " + U.fmt(CX.CONFIG.TVA, 2) + " %)</div>" + T.detailHtml(r));
        }
        $m.on("input change", "input, select", U.debounce(calc, 80));
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
        calc();
    }
    $("#tarif-grille").on("click", "#btn-simuler", simulerEnvoi);
    $("#fiche").on("click", "[data-contrat-pdf]", function (ev) {
        ev.preventDefault();
        U.toast("Téléchargement de « " + U.esc($(this).data("contrat-pdf")) + " » (disponible après intégration).", "info");
    });

    /* =================================================================
       Onglet Historique
       ================================================================= */
    function rendreHistorique() {
        var h = (state.client.historique || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        $("#n-historique").text(h.length);
        $("#timeline").html(h.length ? $.map(h, function (x) {
            return "<li><div class='cx-tl-date'>" + U.toFr(x.date) + " · " + U.esc(x.user || "") + "</div><div class='cx-tl-text'>" + U.esc(x.action) + "</div></li>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-history'></i><b>Aucun évènement</b></div>");
    }

    /* =================================================================
       Onglets
       ================================================================= */
    function ouvrirOnglet(tab) {
        if (!$("#tabs a[data-tab='" + tab + "']").length) tab = "infos";
        $("#tabs a").removeClass("active").filter("[data-tab='" + tab + "']").addClass("active");
        $(".cx-tab-pane").addClass("cx-hidden").filter("[data-pane='" + tab + "']").removeClass("cx-hidden");
        if (window.history && history.replaceState) history.replaceState(null, "", "#" + tab);
    }

    /* =================================================================
       Suspension / réactivation
       ================================================================= */
    function suspendreOuReactiver() {
        var c = state.client, suspendre = c.statut === "ACTIF", motif = "";
        $(document).off("input.cxmotif").on("input.cxmotif", "#susp-motif", function () { motif = $(this).val(); });
        U.confirm({
            title: suspendre ? "Suspendre le compte" : "Réactiver le compte",
            message: suspendre
                ? "<p>Le compte <b>" + U.esc(c.raisonSociale) + "</b> sera suspendu : plus de nouvelles expéditions en compte ni de cotation tant qu'il n'est pas réactivé.</p>" +
                  "<label class='cx-label' for='susp-motif'>Motif <span class='cx-opt'>(conservé dans l'historique)</span></label>" +
                  "<textarea class='form-control' id='susp-motif' rows='2' placeholder='Ex. : factures impayées au-delà du délai'></textarea>"
                : "<p>Le compte <b>" + U.esc(c.raisonSociale) + "</b> redeviendra actif.</p>",
            okText: suspendre ? "Suspendre" : "Réactiver",
            okClass: suspendre ? "cx-btn-danger" : "cx-btn-success"
        }).done(function () {
            $(document).off("input.cxmotif");
            var action = suspendre ? "Compte suspendu" + ($.trim(motif) ? " - motif : " + $.trim(motif) : "") : "Compte réactivé";
            // TODO API : POST /commercial/clients/{id}/suspendre  { motif }  |  POST /commercial/clients/{id}/reactiver
            CX.api.patchMany("clients", [Number(c.id)], { statut: suspendre ? "SUSPENDU" : "ACTIF" })
                .then(function () { return CX.api.log("clients", c.id, action); })
                .done(function () {
                    U.toast(suspendre ? "Compte suspendu." : "Compte réactivé.", suspendre ? "warning" : "success");
                    charger();
                });
        }).fail(function () { $(document).off("input.cxmotif"); });
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#tabs").on("click", "a", function (ev) { ev.preventDefault(); ouvrirOnglet($(this).data("tab")); });
    $("#kpis").on("click", ".cx-kpi", function () {
        var g = $(this).data("goto");
        if (g === "expeditions-nonfact") { $("#f-exp-nonfact").prop("checked", true); filtrerExp(); g = "expeditions"; }
        else if (g === "expeditions") { $("#f-exp-nonfact").prop("checked", false); filtrerExp(); }
        ouvrirOnglet(g);
        $("html, body").animate({ scrollTop: $("#tabs").offset().top - 80 }, 200);
    });
    $("#f-exp-nonfact").on("change", filtrerExp);
    $("#h-meta").on("click", "[data-goto-tarif]", function (ev) { ev.preventDefault(); ouvrirOnglet("tarif"); });
    $("#a-suspendre").on("click", suspendreOuReactiver);
    $("#fiche").on("click", "a.disabled", function (ev) {
        ev.preventDefault();
        U.toast(U.esc($(this).attr("title") || "Action indisponible."), "warning");
    });
    $("#dl-compte").on("click", "[data-fiche]", function (ev) {
        ev.preventDefault();
        U.toast("Téléchargement de la fiche client (disponible après intégration).", "info");
    });

    /* =================================================================
       Démarrage
       ================================================================= */
    if (!id) { $("#not-found").removeClass("cx-hidden"); return; }
    ouvrirOnglet((location.hash || "#infos").substr(1));
    charger();

    /* Message laissé par le formulaire après enregistrement */
    try {
        var flash = sessionStorage.getItem("cx_flash");
        if (flash) { sessionStorage.removeItem("cx_flash"); U.toast(flash); }
    } catch (ex) { /* stockage indisponible */ }
});

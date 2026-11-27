/* =====================================================================
   Commercial · Tableau de bord (index.html)
   ===================================================================== */
$(function () {
    var U = CX.util, today = U.today();

    function resteAPayer(f) {
        var paye = 0; $.each(f.paiements || [], function (_, p) { paye += p.montant; });
        /* solde à payer (TTC − acompte IS − acompte) quand les options de facturation l'ont calculé */
        var du = f.soldeAPayer != null ? f.soldeAPayer : f.montantTTC;
        return Math.max(0, du - paye);
    }

    $.when(
        CX.api.list("clients"), CX.api.list("expeditions"), CX.api.list("factures"), CX.api.list("cotations"),
        // TODO API : GET /commercial/contrats?echeanceAvant={date}
        CX.api.list("contrats")
    ).done(function (clients, exps, factures, cotations, contrats) {
        var nomClient = {}; $.each(clients, function (_, c) { nomClient[c.id] = c.raisonSociale; });
        var enCompte = {}; $.each(clients, function (_, c) { if (c.enCompte) enCompte[c.id] = true; });

        /* ---------- Indicateurs ---------- */
        var debutMois = U.firstOfMonth(today);
        var caMois = 0, encours = 0, echu = 0, nbEchues = 0;
        $.each(factures, function (_, f) {
            if (f.statut === "ANNULEE" || f.statut === "BROUILLON") return;
            if (f.dateEmission >= debutMois) caMois += f.montantTTC;
            var r = resteAPayer(f);
            encours += r;
            if (r > 0 && f.dateEcheance < today) { echu += r; nbEchues++; }
        });
        var aFacturer = $.grep(exps, function (e) { return enCompte[e.clientId] && !e.factureId && e.statut === "LIVREE"; });
        var htAFacturer = 0; $.each(aFacturer, function (_, e) { htAFacturer += e.montant || 0; });
        var cotEnCours = $.grep(cotations, function (c) { return $.inArray(c.statut, ["ENREGISTREE", "SOUMISE", "VALIDEE", "EN_ATTENTE"]) >= 0; });
        /* contrats clients en vigueur arrivant à échéance dans les 30 jours (rubrique Tarifaires) */
        var dans30j = U.addDays(today, 30);
        var ctrEcheance = $.grep(contrats || [], function (c) { return c.statut !== "RESILIE" && c.du <= today && c.au && c.au >= today && c.au <= dans30j; });
        var nbEnCompte = $.grep(clients, function (c) { return c.enCompte && c.statut === "ACTIF"; }).length;

        $("#d-periode").text("· " + U.toFrLong(today));
        $("#kpis").html([
            kpi("Expéditions à facturer", aFacturer.length, U.money(htAFacturer) + " HT", "fa-cubes", "", "facture-emettre.html"),
            kpi("Facturé ce mois", U.fmt(caMois) + " <small>FCFA</small>", "TTC, depuis le " + U.toFr(debutMois), "fa-line-chart", "green", "factures-suivi.html"),
            kpi("Encours clients", U.fmt(encours) + " <small>FCFA</small>", "Reste à encaisser", "fa-hourglass-half", "purple", "factures-suivi.html"),
            kpi("Factures échues", nbEchues, U.money(echu) + " en retard", "fa-exclamation-triangle", "red", "factures-suivi.html"),
            kpi("Cotations en cours", cotEnCours.length, "À suivre jusqu'à l'acceptation", "fa-calculator", "orange", "cotations-liste.html"),
            kpi("Clients en compte actifs", nbEnCompte, clients.length + " comptes au total", "fa-building-o", "", "clients-liste.html"),
            kpi("Contrats à échéance (30 j)", ctrEcheance.length, ctrEcheance.length ? $.map(ctrEcheance.slice(0, 2), function (c) { return U.esc(nomClient[c.clientId] || ""); }).join(", ") + (ctrEcheance.length > 2 ? "…" : "") : "Aucun renouvellement proche", "fa-file-text-o", ctrEcheance.length ? "orange" : "", "tarifs-liste.html#contrats")
        ].join(""));

        /* ---------- Expéditions à facturer par client ---------- */
        var parClient = {};
        $.each(aFacturer, function (_, e) {
            var p = parClient[e.clientId] = parClient[e.clientId] || { n: 0, reg: 0, ht: 0 };
            p.n++; p.ht += e.montant || 0;
            if (!e.montant || !e.preuveLivraison) p.reg++;
        });
        var lignes = $.map(parClient, function (v, cid) { return $.extend({ cid: cid }, v); }).sort(function (a, b) { return b.ht - a.ht; });
        $("#t-afacturer").html(lignes.length ? $.map(lignes.slice(0, 6), function (l) {
            return "<tr><td><div class='cx-who'><span class='cx-avatar'>" + U.initials(nomClient[l.cid]) + "</span><span class='cx-cell-main'>" +
                U.esc(nomClient[l.cid]) + "</span></div></td>" +
                "<td class='num'>" + l.n + "</td>" +
                "<td class='num'>" + (l.reg ? "<span class='cx-badge cx-badge-orange'>" + l.reg + "</span>" : "<span class='cx-muted'>0</span>") + "</td>" +
                "<td class='num cx-strong'>" + U.money(l.ht) + "</td>" +
                "<td class='cx-right'><a class='cx-btn cx-btn-soft cx-btn-xs' href='facture-emettre.html?client=" + l.cid + "'>Facturer <i class='fa fa-angle-right'></i></a></td></tr>";
        }).join("") : "<tr><td colspan='5'><div class='cx-empty'><i class='fa fa-check-circle'></i><b>Tout est facturé</b></div></td></tr>");

        /* ---------- Factures échues ---------- */
        var dans7 = U.addDays(today, 7);
        var echues = $.grep(factures, function (f) {
            return f.statut !== "ANNULEE" && f.statut !== "BROUILLON" && resteAPayer(f) > 0 && f.dateEcheance <= dans7;
        }).sort(function (a, b) { return a.dateEcheance > b.dateEcheance ? 1 : -1; });
        $("#t-echues").html(echues.length ? $.map(echues, function (f) {
            var retard = U.daysBetween(f.dateEcheance, today);
            return "<tr><td><a class='cx-strong cx-mono' href='facture.html?id=" + f.id + "'>" + f.numero + "</a></td>" +
                "<td>" + U.esc(nomClient[f.clientId]) + "</td>" +
                "<td>" + U.toFr(f.dateEcheance) + "<div class='cx-cell-sub'>" +
                (retard > 0 ? "<span style='color:var(--cx-red)'>" + retard + " j de retard</span>" : "dans " + (-retard) + " j") + "</div></td>" +
                "<td class='num cx-strong'>" + U.money(resteAPayer(f)) + "</td>" +
                "<td class='cx-right'><a class='cx-btn cx-btn-ghost cx-btn-xs' href='factures-suivi.html?relance=" + f.id + "'><i class='fa fa-bell-o'></i> Relancer</a></td></tr>";
        }).join("") : "<tr><td colspan='5'><div class='cx-empty'><i class='fa fa-smile-o'></i><b>Aucune facture en retard</b></div></td></tr>");

        /* ---------- Cotations par étape ---------- */
        var etapes = ["ENREGISTREE", "SOUMISE", "VALIDEE", "EN_ATTENTE", "ACCEPTEE"];
        var max = 1, cnt = {};
        $.each(etapes, function (_, s) { cnt[s] = $.grep(cotations, function (c) { return c.statut === s; }).length; max = Math.max(max, cnt[s]); });
        $("#b-cotations").html($.map(etapes, function (s) {
            var st = CX.REF.STATUT_COTATION[s];
            return "<div style='margin-bottom:10px'><div style='display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px'>" +
                "<span>" + CX.REF.badge(CX.REF.STATUT_COTATION, s) + "</span><b>" + cnt[s] + "</b></div>" +
                "<div class='cx-bar " + (st.color === "green" ? "green" : st.color === "orange" ? "orange" : "") + "'><i style='width:" + Math.round(cnt[s] / max * 100) + "%'></i></div></div>";
        }).join(""));

        /* ---------- Top clients ---------- */
        var ca = {};
        $.each(factures, function (_, f) {
            if (f.statut === "ANNULEE" || f.dateEmission.substr(0, 4) !== today.substr(0, 4)) return;
            ca[f.clientId] = (ca[f.clientId] || 0) + f.montantTTC;
        });
        var top = $.map(ca, function (v, k) { return { cid: k, ca: v }; }).sort(function (a, b) { return b.ca - a.ca; }).slice(0, 5);
        var maxCa = top.length ? top[0].ca : 1;
        $("#b-top").html(top.length ? $.map(top, function (t) {
            return "<div style='margin-bottom:12px'><div style='display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px'>" +
                "<a href='client-fiche.html?id=" + t.cid + "' class='cx-strong'>" + U.esc(nomClient[t.cid]) + "</a><b>" + U.money(t.ca) + "</b></div>" +
                "<div class='cx-bar green'><i style='width:" + Math.round(t.ca / maxCa * 100) + "%'></i></div></div>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-bar-chart'></i><b>Pas encore de facture cette année</b></div>");
    });

    function kpi(label, value, foot, icon, color, href) {
        return "<div class='cx-kpi clickable " + color + "' onclick=\"location.href='" + href + "'\">" +
            "<div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + value + "</div>" +
            "<div class='cx-kpi-foot'>" + foot + "</div></div>";
    }

    $("#resetDemo").on("click", function (e) {
        e.preventDefault();
        CX.api.reset().done(function () { location.reload(); });
    });
});

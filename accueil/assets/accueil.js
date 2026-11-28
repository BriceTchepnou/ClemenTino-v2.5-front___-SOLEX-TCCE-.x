/* =====================================================================
   ClemenTino 2.0 - Accueil (accueil/index.html) : page d'arrivée après
   la connexion. Bandeau (salutation, recherche de colis, entreprise),
   accès rapides, indicateurs du mois, activité 14 jours, « À traiter »
   de l'agence, dernières expéditions.
   TODO API : GET /accueil/tableau-de-bord?agence={id}  (compteurs calculés
   côté serveur ; les liens restent ceux des modules).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, R = CX.rec, S = CX.CONFIG.SOCIETE, USER = CX.CONFIG.USER;
    var today = U.today(), debutMois = U.firstOfMonth(today);

    /* ---------------- Bandeau ---------------- */
    var session = null;
    try { session = JSON.parse(sessionStorage.getItem("cx_session") || "null"); } catch (e) { session = null; }
    var h = new Date().getHours(), salut = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
    var JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    $("#hero-date").text(JOURS[new Date(today + "T12:00:00").getDay()] + " " + U.toFrLong(today));
    $("#hero-titre").text(salut + ", " + USER.nom);
    $("#hero-sous").text("Agence " + G.villeNom(USER.ville) + " · " + G.titre(USER.agence) + (session && session.date ? " · connecté depuis " + session.date.substr(11, 5) : "") + ". Bonne journée !");
    var logo = CX.societe.logoUrl();
    $("#hero-soc").html((logo ? "<img src='" + U.esc(logo) + "' alt='" + U.esc(S.nom) + "'>" : "") + "<b>" + U.esc(S.nom) + "</b><small>" + U.esc(S.slogan || "") + "</small>");
    $("#hero-form").on("submit", function (e) {
        e.preventDefault();
        var q = $.trim($("#hero-q").val());
        window.location.href = "../operations/tracking.html" + (q ? "?lt=" + encodeURIComponent(q) : "");
    });

    /* ---------------- Accès rapide ---------------- */
    var TUILES = [
        { t: "Nouvelle expédition", d: "Enregistrer un envoi au guichet", m: "Guichet", i: "fa-cube", c: "bleu", h: "../guichet/expedition-form.html" },
        { t: "Nouvelle facture", d: "Facturer les expéditions livrées", m: "Commercial", i: "fa-file-text-o", c: "rose", h: "../commercial/facture-emettre.html" },
        { t: "Nouveau client", d: "Ouvrir un compte client", m: "Comptes", i: "fa-user-plus", c: "cyan", h: "../commercial/client-form.html" },
        { t: "Bordereau d'expédition", d: "Préparer et suivre les départs", m: "Exploitation", i: "fa-clipboard", c: "vert", h: "../operations/bordereaux.html" },
        { t: "Effectuer une dépense", d: "Caisse, versements, trésorerie", m: "Finance", i: "fa-money", c: "orange", h: "../etats/tresorerie.html" },
        { t: "Tournées de livraison", d: "Planning des coursiers du jour", m: "Exploitation", i: "fa-calendar-check-o", c: "ambre", h: "../operations/tournees.html" },
        { t: "Nouvelle réclamation", d: "Plainte, incident, accident", m: "Contrôle", i: "fa-life-ring", c: "violet", h: "../reclamations/index.html#nouvelle" },
        { t: "Suivre un colis", d: "Tracking étape par étape", m: "Suivi", i: "fa-map-marker", c: "ardoise", h: "../operations/tracking.html" }
    ];
    $("#tuiles").html($.map(TUILES, function (x) {
        return "<a class='ac-tuile ac-c-" + x.c + "' href='" + x.h + "' title='" + U.esc(x.m + " · " + x.d) + "'><i class='fa fa-arrow-right ac-tuile-fl'></i><span class='ac-tuile-ico'><i class='fa " + x.i + "'></i></span>" +
            "<span class='ac-tuile-txt'><b>" + U.esc(x.t) + "</b><span class='ac-tuile-d'>" + U.esc(x.d) + "</span></span><em>" + U.esc(x.m) + "</em></a>";
    }).join(""));

    /* ---------------- Données ---------------- */
    $.when(O.charger(), CX.api.list("factures"), CX.api.list("reclamations"), CX.api.list("preenregistrements"), CX.api.list("plannings")).done(function (r1, factures, recs, pres, plannings) {
        var exps = r1[0], bords = r1[1], f = O.files(exps, bords);
        function actif(e) { return e.etape !== "ANNULEE" && e.statut !== "ANNULEE"; }
        function montant(e) { return (e.montants && e.montants.total) || e.montant || 0; }

        /* Indicateurs du mois (toutes agences) */
        var jourMois = parseInt(today.substr(8, 2), 10), moisPrec = U.addDays(debutMois, -1), debutPrec = U.firstOfMonth(moisPrec);
        var finPrecComparable = U.addDays(debutPrec, Math.min(jourMois, parseInt(moisPrec.substr(8, 2), 10)) - 1);
        var duMois = $.grep(exps, function (e) { return actif(e) && e.dateExp >= debutMois && e.dateExp <= today; });
        var duPrec = $.grep(exps, function (e) { return actif(e) && e.dateExp >= debutPrec && e.dateExp <= finPrecComparable; });
        var attente = $.grep(exps, function (e) { return actif(e) && e.etape !== "LIVREE"; });
        var livrees = $.grep(exps, function (e) { return e.etape === "LIVREE" && (e.dateLivraison || "") >= debutMois; });
        var ca = 0; $.each(duMois, function (_, e) { ca += montant(e); });
        var evol = duPrec.length ? Math.round((duMois.length - duPrec.length) / duPrec.length * 100) : null;
        var recOuv = $.grep(recs, R.ouverte), recUrg = $.grep(recOuv, function (r) { return r.priorite === "URGENTE"; });
        var retardLiv = $.grep(attente, function (e) { return O.sla(e).retard; }).length;
        $("#kpis").html([
            O.kpi("Expéditions (ce mois)", U.fmt(duMois.length), evol == null ? "Total du mois en cours" : (evol >= 0 ? "<span style='color:var(--cx-green)'>▲ " + evol + " %</span>" : "<span style='color:var(--cx-red)'>▼ " + (-evol) + " %</span>") + " vs même période du mois dernier", "fa-cubes", "blue", "../guichet/expeditions-liste.html"),
            O.kpi("En attente de livraison", U.fmt(attente.length), retardLiv + " hors délai · toutes agences", "fa-hourglass-half", retardLiv ? "orange" : "", "../operations/index.html"),
            O.kpi("Livrées (ce mois)", U.fmt(livrees.length), "Expéditions complétées", "fa-check-circle", "green", "../etats/livraisons.html"),
            O.kpi("Chiffre d'affaires du mois", U.fmt(Math.round(ca)) + " <small>FCFA</small>", "expéditions enregistrées", "fa-line-chart", "purple", "../etats/chiffre-affaires.html"),
            O.kpi("Réclamations ouvertes", recOuv.length, recUrg.length ? "<span style='color:var(--cx-red)'>" + recUrg.length + " urgente" + (recUrg.length > 1 ? "s" : "") + "</span>" : "aucune urgente", "fa-life-ring", recUrg.length ? "red" : "", "../reclamations/index.html")
        ].join(""));

        /* Activité 14 jours (SVG) */
        var jours = [], maxV = 1;
        for (var i = 13; i >= 0; i--) {
            var d = U.addDays(today, -i);
            var nE = $.grep(exps, function (e) { return actif(e) && e.dateExp === d; }).length, nL = $.grep(exps, function (e) { return e.dateLivraison === d; }).length;
            jours.push({ d: d, e: nE, l: nL }); maxV = Math.max(maxV, nE, nL);
        }
        var W = 700, H = 220, bas = 190, haut = 16, larg = W / 14, bw = Math.min(16, larg / 3);
        var svg = "<svg class='ac-graph' viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none' role='img' aria-label='Expéditions et livraisons des 14 derniers jours'>";
        for (var g = 0; g <= 4; g++) { var y = bas - (bas - haut) * g / 4; svg += "<line x1='0' x2='" + W + "' y1='" + y + "' y2='" + y + "' stroke='#eef1f6'/>"; }
        $.each(jours, function (k, j) {
            var x = k * larg + larg / 2, he = (bas - haut) * j.e / maxV, hl = (bas - haut) * j.l / maxV, dim = new Date(j.d + "T12:00:00").getDay() === 0;
            svg += "<rect x='" + (x - bw - 1) + "' y='" + (bas - he) + "' width='" + bw + "' height='" + he + "' rx='3' fill='#3b82f6'><title>" + U.toFr(j.d) + " : " + j.e + " expédiée(s)</title></rect>";
            svg += "<rect x='" + (x + 1) + "' y='" + (bas - hl) + "' width='" + bw + "' height='" + hl + "' rx='3' fill='#16a34a'><title>" + U.toFr(j.d) + " : " + j.l + " livrée(s)</title></rect>";
            svg += "<text x='" + x + "' y='" + (H - 8) + "' text-anchor='middle'" + (j.d === today ? " style='font-weight:700;fill:var(--cx-ink)'" : dim ? " style='fill:#b6bcc8'" : "") + ">" + j.d.substr(8, 2) + "/" + j.d.substr(5, 2) + "</text>";
        });
        $("#graph").html(svg + "</svg>");

        /* À traiter (agence courante) */
        var A = O.agenceCourante();
        $("#todo-agence").text("· " + O.agenceLib(A.id));
        var facEchues = $.grep(factures, function (x) {
            if (x.statut === "ANNULEE" || x.statut === "BROUILLON" || x.statut === "PAYEE") return false;
            var paye = 0; $.each(x.paiements || [], function (_, p) { paye += p.montant; });
            return x.dateEcheance < today && (x.soldeAPayer != null ? x.soldeAPayer : x.montantTTC) - paye > 0;
        }).length;
        var plansJour = $.grep(plannings, function (p) { return O.estMoi(p.agenceId) && p.date === today && p.statut !== "ANNULEE"; }).length;
        var preAtt = $.grep(pres, function (p) { return G.preenreg && G.preenreg.statut(p) === "EN_ATTENTE" && O.estMoi(p.agenceId); }).length;
        var recRet = $.grep(recs, R.enRetard).length;
        var TODO = [
            { n: f.bordereauxAttendus.length, t: "Bordereaux attendus", s: "à réceptionner et pointer", i: "fa-truck", c: "bleu", h: "../operations/degroupage.html" },
            { n: f.aGrouper.length, t: "Expéditions à envoyer", s: "à grouper dans un bordereau", i: "fa-sign-out", c: "violet", h: "../operations/groupage.html" },
            { n: f.aMettreEnLivraison.length, t: "À remettre au coursier", s: plansJour + " tournée" + (plansJour > 1 ? "s" : "") + " planifiée" + (plansJour > 1 ? "s" : "") + " aujourd'hui", i: "fa-motorcycle", c: "ambre", h: "../operations/instance.html#coursier" },
            { n: f.instanceAncien.length, t: "En agence depuis plus de 3 jours", s: "relancer les destinataires", i: "fa-building-o", c: "orange", h: "../operations/instance.html?anciennete=3" },
            { n: preAtt, t: "Pré-enregistrements en attente", s: "à valider au guichet", i: "fa-globe", c: "cyan", h: "../operations/preenregistrees.html" },
            { n: facEchues, t: "Factures échues", s: "à relancer", i: "fa-exclamation-triangle", c: "rose", h: "../commercial/factures-suivi.html" },
            { n: recRet, t: "Réclamations en retard", s: recUrg.length + " urgente" + (recUrg.length > 1 ? "s" : "") + " ouverte" + (recUrg.length > 1 ? "s" : ""), i: "fa-life-ring", c: "violet", h: "../reclamations/index.html" }
        ];
        $("#todo").html($.map(TODO, function (x) {
            return "<li><a href='" + x.h + "' class='ac-c-" + x.c + "'><span class='ac-todo-ico'><i class='fa " + x.i + "'></i></span><span class='ac-todo-txt'>" + U.esc(x.t) + "<small>" + U.esc(x.s) + "</small></span>" +
                "<span class='ac-todo-n" + (x.n ? "" : " zero") + "'>" + x.n + "</span><i class='fa fa-angle-right cx-muted'></i></a></li>";
        }).join(""));

        /* Dernières expéditions */
        var der = exps.slice().sort(function (a, b) { return (b.dateExp + (b.heure || "")) > (a.dateExp + (a.heure || "")) ? 1 : -1; }).slice(0, 6);
        $("#dernieres").html($.map(der, function (e) {
            return "<tr><td><a class='cx-mono cx-strong' href='../guichet/recu.html?id=" + e.id + "'>" + U.esc(e.nRt) + "</a></td><td class='cx-nowrap'>" + U.esc(U.toFr(e.dateExp)) + " <span class='cx-muted'>" + U.esc(e.heure || "") + "</span></td>" +
                "<td>" + U.esc(O.origineLib(e)) + " <i class='fa fa-long-arrow-right cx-muted'></i> " + U.esc(O.destinationLib(e)) + "</td>" +
                "<td>" + U.esc(e.expediteurInfo.nom) + "<div class='cx-cell-sub'>→ " + U.esc(e.destinataireInfo.nom) + "</div></td>" +
                "<td class='num cx-strong'>" + U.money(montant(e)) + "</td><td>" + O.etapeBadge(e.etape) + "</td></tr>";
        }).join(""));
    });
});

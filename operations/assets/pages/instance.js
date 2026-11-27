/* =====================================================================
   Opérations · Livraison de colis (operations/instance.html)
   Onglets : #agence (défaut) | #coursier | #livreur | #livrees
   Paramètres : ?anciennete=3|7|15  ?avis=0
   ---------------------------------------------------------------------
   - Expéditions en agence (EN_INSTANCE) : ancienneté, avis WhatsApp / SMS,
     « Livré en agence » (Mise à jour des informations de livraison :
     livré par, date et heure, retiré par, pièce CNI / Passeport / Permis,
     n° de pièce, signature) -> LIVREE + preuve ; « Valider pour
     livraison » (bascule en livraison urbaine) ; envoi à un partenaire ;
     remise au coursier ; suspension ; réimpression du reçu.
   - À remettre au coursier : livraisons urbaines en attente (ou échecs).
   - Chez le livreur (EN_LIVRAISON) : rebascule rapide en agence.
   - Livrées : livré le, retiré par, correction des infos de livraison.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, L = CX.ol, A = O.agenceCourante();
    var tous = [], bords = [], f = null, onglet = "agence";

    O.selecteurAgence("#ox-agence-slot");
    if (U.queryParam("anciennete")) $("#f-age").val(U.queryParam("anciennete"));
    var filtreAvis = U.queryParam("avis");
    /* Arrivée depuis le planning (« Affecter des colis ») : la tournée sera proposée dans la fiche de livraison */
    (function () {
        var tid = U.queryParam("tournee"), p = tid ? $.grep(CX.api.listSync("plannings"), function (x) { return String(x.id) === String(tid); })[0] : null;
        if (!p) return;
        $(".ox-scan").after("<div class='cx-note cx-note-info'><i class='fa fa-calendar-check-o'></i><div>Affectation à la tournée <b class='cx-mono'>" + U.esc(p.numero) + "</b> · " +
            U.esc(p.heureDebut + "–" + p.heureFin) + " · " + U.esc(O.zoneLib(p.zone)) + " · " + U.esc(p.livreurNom || "livreur à désigner") +
            " : cochez les colis à confier puis cliquez « Remettre au coursier ». <a href='tournees.html?date=" + p.date + "#p" + p.id + "'>Retour au planning</a></div></div>");
    })();

    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function age(e) { return O.ageInstance(e); }

    /* Colonnes propres à l'onglet « en agence » */
    var colAge = { key: "age", title: "En agence depuis", className: "center", sortValue: age, render: function (e) {
        var a = age(e), s = O.dernierEvenement(e, "EN_INSTANCE");
        return "<span class='ox-age" + (a > 7 ? " err" : a > O.INSTANCE_ALERTE_J ? " warn" : "") + "'>" + (a ? a + " j" : "auj.") + "</span>" + (s ? "<div class='cx-cell-sub cx-nowrap'>" + U.esc(U.toFr(s.date)) + "</div>" : "");
    }, searchValue: function () { return ""; } };
    var colAvis = { key: "avis", title: "Avis", sortValue: function (e) { return (e.avis || []).length; }, render: function (e) {
        var av = e.avis || [];
        if (!av.length) return "<span class='cx-badge cx-badge-orange cx-no-dot'><i class='fa fa-bell-slash-o'></i> Aucun</span>";
        var d = av[av.length - 1];
        return "<span class='cx-badge cx-badge-green cx-no-dot'><i class='fa " + (d.canal === "WHATSAPP" ? "fa-whatsapp" : "fa-commenting-o") + "'></i> " + av.length + "</span><div class='cx-cell-sub'>" + U.esc(U.toFr(d.date)) + "</div>";
    }, searchValue: function () { return ""; } };

    function menuLigne(e) {
        var n = (e.avis || []).length;
        return L.menu([
            ["fiche", "fa-file-text-o", "Détail de l'expédition"], ["notes", "fa-sticky-note-o", "Notes"],
            ["livraison", "fa-map-marker", "Modifier la livraison", e.etape !== "LIVREE"],
            ["modifier", "fa-pencil-square-o", "Modifier (infos de livraison)", e.etape === "LIVREE"],
            ["wa", "fa-whatsapp", n ? "Relancer par WhatsApp" : "Avis WhatsApp", e.etape === "EN_INSTANCE"],
            ["sms", "fa-commenting-o", n ? "Relancer par SMS" : "Avis SMS", e.etape === "EN_INSTANCE"],
            ["rebascule", "fa-undo", "Rebasculer en agence", e.etape === "EN_LIVRAISON"],
            ["lever", "fa-play-circle", "Lever la suspension", !!e.suspendu],
            ["recu", "fa-print", "Imprimer le reçu transport"],
            "-",
            ["retour", "fa-undo", "Retour à l'expéditeur", e.etape === "EN_INSTANCE", "text-danger"]
        ]);
    }
    function table(sel, cols, vide, icone) {
        return new CX.DataTable(sel, {
            pageSize: 25, sortKey: "dateExp", sortDir: -1, selectable: true, searchInput: "#q",
            emptyText: vide, emptyIcon: icone,
            rowClass: function (e) { return (e.suspendu ? "ox-suspendu " : "") + (e.etape === "EN_INSTANCE" && age(e) >= O.INSTANCE_RETOUR_J ? "ox-retard" : ""); },
            columns: cols(), onSelect: majSelbar
        });
    }
    var T = {
        agence: { cols: function () { return L.colonnes(["rt", "rtMan", "ref", "bureauDep", "client", "contenu", "destinataire", "dateExp"], bords).concat([colAge, colAvis]).concat(L.colonnes(["notes", "statut", "actions"], bords, menuLigne)); } },
        coursier: { cols: function () { return L.colonnes(["rt", "ref", "bureauDep", "destinataire", "quartier", "contenu", "dateExp", "notes", "statut", "actions"], bords, menuLigne); } },
        livreur: { cols: function () { return L.colonnes(["rt", "ref", "destinataire", "quartier", "coursier", "contenu", "dateExp", "notes", "statut", "actions"], bords, menuLigne); } },
        livrees: { cols: function () { return L.colonnes(["rt", "rtMan", "ref", "destinataire", "contenu", "livreLe", "retirePar", "statut", "notes", "actions"], bords, menuLigne); } }
    };
    T.agence.dt = table("#dt-agence", T.agence.cols, "Aucune expédition en agence", "fa-building-o");
    T.coursier.dt = table("#dt-coursier", T.coursier.cols, "Aucune livraison urbaine en attente", "fa-map-marker");
    T.livreur.dt = table("#dt-livreur", T.livreur.cols, "Aucune expédition chez un livreur", "fa-motorcycle");
    T.livrees.dt = table("#dt-livrees", T.livrees.cols, "Aucune expédition livrée sur 30 jours", "fa-check-circle");
    $.each(T, function (k) { O.menusFixes("#dt-" + k); });
    function dtCourant() { return T[onglet].dt; }

    function majSelbar() {
        var s = dtCourant().getSelected();
        $("#selbar").toggleClass("cx-hidden", !s.length);
        $("#sel-n").text(O.pl(s.length, "RT sélectionnée", "RT sélectionnées"));
        $("#selbar [data-tabs]").each(function () { $(this).toggleClass("cx-hidden", $.inArray(onglet, String($(this).data("tabs")).split(" ")) < 0); });
        $("#selbar [data-act=livre]").prop("disabled", s.length !== 1);
    }
    function appliquer() {
        var flt = L.lireFiltres(), fa = $("#f-age").val();
        function ok(e) {
            if (!L.passe(e, flt, "dep")) return false;
            if (fa && onglet === "agence" && age(e) <= Number(fa) - (fa === "15" ? 1 : 0)) return false;
            if (filtreAvis === "0" && onglet === "agence" && (e.avis || []).length) return false;
            return true;
        }
        var sources = { agence: f.enInstance, coursier: f.aMettreEnLivraison, livreur: f.chezLivreur, livrees: f.livrees };
        $.each(T, function (k, t) {
            var rows = $.grep(sources[k], ok);
            $("#n-" + k).text(rows.length);
            t.dt.o.columns = t.cols();
            if (k === onglet) { t.dt.clearSelection(); t.dt.setRows(rows); } else t.dt.rows = rows;
        });
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $.each(T, function (k) { $("#dt-" + k).toggleClass("cx-hidden", k !== onglet); });
        majSelbar();
        rendreFlux(sources, ok);
    }

    /* Vue Kanban du flux : en agence -> à remettre au coursier -> chez le livreur -> livrées (7 derniers jours) */
    var vueSw = new CX.vues.Selecteur("#vue-slot", { cle: "livraison-colis", vues: ["table", "kanban"], libelles: { table: { label: "Par onglet", icon: "fa-folder-o" } }, onChange: function () { appliquer(); } });
    function rendreFlux(sources, ok) {
        var kb = vueSw.vue() === "kanban";
        $("#flux-kanban").toggleClass("cx-hidden", !kb);
        $("#onglets").toggleClass("cx-hidden", kb);
        if (kb) { $.each(T, function (k) { $("#dt-" + k).addClass("cx-hidden"); }); $("#selbar").addClass("cx-hidden"); }
        if (!kb) return;
        var depuis = U.addDays(U.today(), -7), rows = [];
        $.each(["agence", "coursier", "livreur", "livrees"], function (_, k) {
            $.each($.grep(sources[k], ok), function (_, e) { if (k !== "livrees" || (e.dateLivraison || "") >= depuis) rows.push($.extend({}, e, { _col: k })); });
        });
        CX.vues.kanban("#flux-kanban", rows, {
            colonnes: [{ code: "agence", label: "En agence", color: "blue" }, { code: "coursier", label: "À remettre au coursier", color: "orange" },
                { code: "livreur", label: "Chez le livreur", color: "purple" }, { code: "livrees", label: "Livrées (7 jours)", color: "green" }],
            valeur: function (e) { return e._col; },
            entete: function (c, l) { var n = 0; $.each(l, function (_, e) { n += e.nbColis || 1; }); return n + " colis"; },
            carte: function (e) {
                var a = age(e), sous = e._col === "agence" ? (a ? "en agence depuis " + a + " j" : "arrivée aujourd'hui") + ((e.avis || []).length ? " · avisé" : " · <span style='color:var(--cx-red)'>sans avis</span>")
                    : e._col === "coursier" ? U.esc((e.livraison.quartier || "—") + (e.livraison.zone ? " · " + O.zoneLib(e.livraison.zone, true) : "")) + (e.etape === "ECHEC" ? " · <span style='color:var(--cx-red)'>échec à relivrer</span>" : "")
                    : e._col === "livreur" ? "<i class='fa fa-motorcycle'></i> " + U.esc(e.coursier || "livreur") + " · " + U.esc(e.livraison.quartier || "")
                    : "livrée le " + U.esc(U.toFr(e.dateLivraison)) + (e.remise ? " · " + U.esc(e.remise.mode === "DOMICILE" ? "à domicile" : "en agence") : "");
                return "<div class='cx-vc-top'><span class='cx-vc-num'>" + U.esc(e.nRt) + "</span>" + O.slaBadge(e) + "</div>" +
                    "<div class='cx-vc-l'><b>" + U.esc(e.destinataireInfo.nom) + "</b></div><div class='cx-vc-s'>" + sous + "</div>" +
                    "<div class='cx-vc-s'>" + U.esc(O.contenuCourt(e)) + " · de " + U.esc(G.villeNom(e.villeDep)) + "</div>";
            }
        });
    }
    $("#flux-kanban").on("click", "[data-id]", function () { O.fiche($(this).data("id")); });
    function charger() {
        return O.charger().done(function (exps, b) {
            tous = exps; bords = b; f = O.files(exps, bords);
            L.remplirFiltres(tous);
            var sans = $.grep(f.enInstance, function (e) { return !(e.avis || []).length; }).length, a3 = $.grep(f.enInstance, function (e) { return age(e) > 3; }).length;
            var jour = $.grep(f.livrees, function (e) { return (e.dateLivraison || "") === U.today(); }).length;
            $("#kpis").html([
                O.kpi("En agence", f.enInstance.length, a3 + " depuis plus de 3 jours", "fa-building-o", "blue"),
                O.kpi("Sans avis", sans, "destinataires non prévenus", "fa-bell-slash-o", sans ? "red" : "green"),
                O.kpi("À remettre au coursier", f.aMettreEnLivraison.length, O.pl(f.echecs.length, "échec à relivrer", "échecs à relivrer"), "fa-map-marker", "orange"),
                O.kpi("Chez le livreur", f.chezLivreur.length, "en livraison urbaine", "fa-motorcycle", "purple"),
                O.kpi("Livrées aujourd'hui", jour, O.pl(f.livrees.length, "livrée", "livrées") + " sur 30 jours", "fa-check-circle", "green")
            ].join(""));
            appliquer();
        });
    }

    /* =================================================================
       Actions
       ================================================================= */
    function apres(msg) { if (msg) U.toast(msg, "success"); charger(); }
    function livrer(e) { O.modaleRemise(e).done(function (maj) { apres("RT <b>" + U.esc(maj.nRt) + "</b> livrée à " + U.esc(maj.remise.nom) + "." + (maj.clientId ? " L'expédition devient facturable." : "")); }); }
    function validerPourLivraison(s) {
        var cibles = $.grep(s, function (e) { return e.etape === "EN_INSTANCE" && !e.suspendu; });
        if (!cibles.length) { U.toast("Sélectionnez des expéditions en agence (non suspendues).", "warning"); return; }
        function basculer(ids) {
            // TODO API : POST /exploitation/expeditions/valider-livraison  { ids[] }
            return O.avancerLot(ids, "ARRIVEE", function (x) {
                return { note: "Validée pour livraison urbaine" + (x.livraison && x.livraison.quartier ? " · " + x.livraison.quartier : ""), position: A.id, patch: { livraison: $.extend({}, x.livraison || {}, { mode: "DOMICILE" }) } };
            });
        }
        if (cibles.length === 1) {
            O.modaleLivraison($.extend(true, {}, cibles[0], { livraison: $.extend({}, cibles[0].livraison, { mode: "DOMICILE" }) })).done(function () {
                basculer([cibles[0].id]).done(function () { onglet = "coursier"; apres("Expédition validée pour livraison : à remettre au coursier."); });
            });
            return;
        }
        var avecAdr = $.grep(cibles, function (e) { return e.livraison.quartier; });
        if (avecAdr.length < cibles.length) U.toast(O.pl(cibles.length - avecAdr.length, "expédition sans quartier ignorée", "expéditions sans quartier ignorées") + " (Modifier la livraison).", "warning");
        basculer($.map(avecAdr, function (e) { return e.id; })).done(function (ok) { apres(O.pl(ok.length, "expédition validée", "expéditions validées") + " pour livraison."); });
    }
    $("#selbar").on("click", "[data-act]", function () {
        var act = $(this).data("act"), s = dtCourant().getSelected(), i = 0;
        if (!s.length) return;
        if (act === "reorienter") O.modaleReorienter(s).done(function (r) { apres(O.pl(r.ok.length, "RT réorientée", "RT réorientées") + "."); });
        if (act === "valider") validerPourLivraison(s);
        if (act === "livre") livrer(s[0]);
        if (act === "partenaire") O.modalePartenaire(s).done(function (ok) { apres(O.pl(ok.length, "expédition remise", "expéditions remises") + " au partenaire."); });
        if (act === "coursier") O.modaleCoursier(s).done(function (r) {
            apres("Fiche de livraison <b>" + U.esc(r.tournee.numero) + "</b> : " + O.pl(r.ok.length, "expédition remise", "expéditions remises") + " à " + U.esc(r.tournee.livreurNom) + ".");
            if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning");
        });
        if (act === "rebascule") {
            var liv = $.grep(s, function (e) { return e.etape === "EN_LIVRAISON"; }), aut = $.grep(s, function (e) { return e.etape === "ARRIVEE" || e.etape === "ECHEC"; });
            $.when(O.rebasculerEnAgence($.map(liv, function (e) { return e.id; }), "Reprise au livreur"), O.mettreEnAgence($.map(aut, function (e) { return e.id; }), "Basculée en agence (retrait)"))
                .done(function () { apres(O.pl(liv.length + aut.length, "expédition rebasculée", "expéditions rebasculées") + " en agence."); });
        }
        if (act === "suspendre") O.modaleSuspendre(s).done(function (r) { apres(O.pl(r.length, "expédition suspendue", "expéditions suspendues") + "."); });
        if (act === "recu") L.imprimerRecu(s[0]);
        if (act === "avis") {
            // TODO API : POST /exploitation/expeditions/avis  { ids[], canal: "WHATSAPP" }
            (function suivant() {
                if (i >= s.length) { apres(O.pl(s.length, "avis préparé", "avis préparés") + "."); return; }
                var e = s[i++];
                O.avis(e, "WHATSAPP", (e.avis || []).length ? "RELANCE" : "AVIS").always(suivant);
            })();
        }
    });
    $.each(T, function (k) {
        $("#dt-" + k).on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
        $("#dt-" + k).on("click", "[data-act]", function (ev) {
            ev.preventDefault();
            var e = parId($(this).closest("tr").data("id")), act = $(this).data("act");
            if (!e) return;
            if (act === "fiche") O.fiche(e.id, { onChange: charger });
            if (act === "notes") O.modaleNote(e).done(function () { apres("Note ajoutée."); });
            if (act === "livraison") O.modaleLivraison(e).done(function () { apres("Livraison modifiée."); });
            if (act === "modifier") O.modaleRemise(e, { modifier: true }).done(function () { apres("Informations de livraison corrigées."); });
            if (act === "wa" || act === "sms") O.avis(e, act === "wa" ? "WHATSAPP" : "SMS", (e.avis || []).length ? "RELANCE" : "AVIS").done(function () { apres((act === "wa" ? "WhatsApp" : "SMS") + " préparé (envoi tracé)."); });
            if (act === "rebascule") O.rebasculerEnAgence([e.id], "Reprise au livreur").done(function () { apres("Expédition rebasculée en agence."); });
            if (act === "lever") O.leverSuspension(e.id).done(function () { apres("Suspension levée."); });
            if (act === "recu") L.imprimerRecu(e);
            if (act === "retour") {
                var ag = O.agDep(e);
                O.modaleReorienter([e], { agenceId: ag, motif: "Retour à l'expéditeur" }).done(function () { apres("Retour à l'expéditeur engagé : l'expédition est à mettre en transit vers " + U.esc(O.agenceLib(ag)) + "."); });
            }
        });
    });
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); if (window.history.replaceState) window.history.replaceState(null, "", onglet === "agence" ? window.location.pathname + window.location.search : "#" + onglet); appliquer(); });
    $("#f-ville, #f-bureau, #f-du, #f-au, #f-par, #f-age").on("change", function () { setTimeout(appliquer, 0); });
    $("#btn-refresh").on("click", function () { charger(); });

    /* Retrait au comptoir : N° RT (douchette) ou téléphone du destinataire */
    O.scanner("#scan", function (code) {
        var $r = $("#scan-res"), brut = O.chercherLt(code), e = brut ? parId(brut.id) : null;
        if (!e) {
            var t = G.tel(code);
            if (t.length === 9) {
                var l = $.grep(f.enInstance, function (x) { return G.tel(x.destinataireInfo.tel) === t; });
                if (l.length === 1) e = l[0];
                else if (l.length > 1) { onglet = "agence"; appliquer(); $("#q").val(G.telFmt(t)); T.agence.dt.setSearch(G.telFmt(t)); $r.removeClass("ko").addClass("ok").html("<i class='fa fa-filter'></i> " + l.length + " expéditions pour ce numéro"); return; }
            }
        }
        if (!e) { O.bip(false); $r.removeClass("ok").addClass("ko").html("<i class='fa fa-times'></i> « " + U.esc(code) + " » introuvable."); return; }
        if ($.inArray(e.etape, ["EN_INSTANCE", "ARRIVEE", "ECHEC"]) < 0 || !O.estMoi(e.positionId) || !O.estMoi(e.agDestId)) {
            O.bip(false);
            $r.removeClass("ok").addClass("ko").html("<i class='fa fa-times'></i> " + U.esc(e.nRt) + " : " + U.esc(O.ETAPES[e.etape].label) + (e.positionId && !O.estMoi(e.positionId) ? " (" + U.esc(O.agenceLib(e.positionId)) + ")" : "") + ".");
            return;
        }
        O.bip(true);
        $r.removeClass("ko").addClass("ok").html("<i class='fa fa-check'></i> " + U.esc(e.nRt) + " · " + U.esc(e.destinataireInfo.nom));
        livrer(e);
    });

    var h = (window.location.hash || "").replace("#", "");
    if (T[h]) onglet = h;
    charger();
});

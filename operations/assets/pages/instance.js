/* =====================================================================
   Opérations · Colis en agence - en instance (operations/instance.html)
   Paramètres : ?anciennete=3|7|15  ?avis=0|1
   ---------------------------------------------------------------------
   Colis EN_INSTANCE dans l'agence : ancienneté, avis envoyés (WhatsApp /
   SMS via wa.me / sms:), relance, remise au destinataire (pièce, nom,
   téléphone, signature, photo) -> LIVREE + preuve, retour à
   l'expéditeur au-delà de CX.ops.INSTANCE_RETOUR_J jours.
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante();
    var tous = [], f = null;

    O.selecteurAgence("#ox-agence-slot");
    if (U.queryParam("anciennete")) $("#f-age").val(U.queryParam("anciennete"));
    if (U.queryParam("avis")) $("#f-avis").val(U.queryParam("avis"));

    function age(e) { return O.ageInstance(e); }
    function ageHtml(e) {
        var a = age(e);
        return "<span class='ox-age" + (a > 7 ? " err" : a > O.INSTANCE_ALERTE_J ? " warn" : "") + "'>" + (a ? a + " j" : "auj.") + "</span>";
    }
    function avisHtml(e) {
        var av = e.avis || [];
        if (!av.length) return "<span class='cx-badge cx-badge-orange cx-no-dot'><i class='fa fa-bell-slash-o'></i> Aucun</span>";
        var d = av[av.length - 1];
        return "<span class='cx-badge cx-badge-green cx-no-dot'><i class='fa " + (d.canal === "WHATSAPP" ? "fa-whatsapp" : "fa-commenting-o") + "'></i> " + av.length + "</span>" +
            "<div class='cx-cell-sub'>" + (d.type === "RELANCE" ? "relance " : "") + U.esc(U.toFr(d.date)) + "</div>";
    }
    function actions(e) {
        var retour = age(e) >= O.INSTANCE_RETOUR_J;
        return "<div class='ox-flex' style='flex-wrap:nowrap'>" +
            "<button type='button' class='cx-btn cx-btn-success cx-btn-xs' data-act='remettre'><i class='fa fa-handshake-o'></i> Remettre</button>" +
            "<div class='dropdown cx-actions'><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-toggle='dropdown' aria-haspopup='true' aria-label='Actions' title='Actions'><i class='fa fa-ellipsis-v'></i></button>" +
            "<ul class='dropdown-menu dropdown-menu-right'>" +
            "<li><a href='#' data-act='wa'><i class='fa fa-whatsapp'></i> " + ((e.avis || []).length ? "Relancer par WhatsApp" : "Avis WhatsApp") + "</a></li>" +
            "<li><a href='#' data-act='sms'><i class='fa fa-commenting-o'></i> " + ((e.avis || []).length ? "Relancer par SMS" : "Avis SMS") + "</a></li>" +
            "<li><a href='#' data-act='fiche'><i class='fa fa-file-text-o'></i> Fiche de la LT</a></li>" +
            "<li><a href='#' data-act='reorienter'><i class='fa fa-random'></i> Réorienter</a></li>" +
            "<li class='divider'></li>" +
            "<li><a href='#' data-act='retour' class='text-danger'><i class='fa fa-undo'></i> Retour à l'expéditeur" + (retour ? "" : "<small>avant " + O.INSTANCE_RETOUR_J + " j : à justifier</small>") + "</a></li>" +
            "</ul></div></div>";
    }
    var dt = new CX.DataTable("#dt-instance", {
        pageSize: 25, sortKey: "age", sortDir: -1, searchInput: "#q", selectable: true,
        emptyText: "Aucun colis en instance", emptyIcon: "fa-building-o",
        rowClass: function (e) { return age(e) >= O.INSTANCE_RETOUR_J ? "ox-retard" : ""; },
        columns: [
            { key: "nRt", title: "N° LT", render: function (e) {
                return "<a href='#' class='cx-mono cx-strong' data-act='fiche'>" + U.esc(e.nRt) + "</a>" + (e.nRtMan ? "<div class='cx-cell-sub'>Man. " + U.esc(e.nRtMan) + "</div>" : "") +
                    (e.retour ? "<div><span class='cx-badge cx-badge-purple cx-no-dot'>Retour exp.</span></div>" : "");
            }, searchValue: function (e) { return e.nRt + " " + (e.nRtMan || ""); } },
            { key: "dest", title: "Destinataire", sortValue: function (e) { return e.destinataireInfo.nom; }, render: function (e) {
                return "<div class='cx-cell-main'>" + U.esc(e.retour ? e.expediteurInfo.nom : e.destinataireInfo.nom) + "</div><div class='cx-cell-sub cx-nowrap'>" + U.esc(G.telAff(e.retour ? e.expediteurInfo.tel : e.destinataireInfo.tel)) + "</div>";
            }, searchValue: function (e) { return e.destinataireInfo.nom + " " + e.destinataireInfo.tel + " " + G.telFmt(e.destinataireInfo.tel); } },
            { key: "exp", title: "Expéditeur", sortValue: function (e) { return e.expediteurInfo.nom; }, render: function (e) {
                return U.esc(e.expediteurInfo.nom) + "<div class='cx-cell-sub'>" + U.esc(G.villeNom(e.villeDep)) + " · " + U.esc(G.titre(e.bureauDep)) + "</div>";
            }, searchValue: function (e) { return e.expediteurInfo.nom + " " + e.villeDep; } },
            { key: "contenu", title: "Colis", render: function (e) { return U.esc(e.contenu || "") + "<div class='cx-cell-sub'>" + (e.nbColis || 1) + " colis · " + U.esc(G.kg(e.poids)) + "</div>"; } },
            { key: "arrivee", title: "Arrivé le", sortValue: function (e) { var s = O.dernierEvenement(e, "EN_INSTANCE"); return s ? s.date : ""; }, render: function (e) {
                var s = O.dernierEvenement(e, "EN_INSTANCE"); return "<span class='cx-nowrap'>" + (s ? U.esc(U.toFr(s.date)) : "—") + "</span>";
            } },
            { key: "age", title: "Ancienneté", className: "center", sortValue: age, render: ageHtml },
            { key: "avis", title: "Avis", sortValue: function (e) { return (e.avis || []).length; }, render: avisHtml, searchValue: function () { return ""; } },
            { key: "port", title: "Paiement", render: function (e) {
                return e.typeClient === "COMPTE" ? "<span class='cx-badge cx-badge-purple cx-no-dot'>En compte</span>" : e.paiement.statut === "PAYE" ? "<span class='cx-badge cx-badge-green cx-no-dot'>Payé</span>" : "<span class='cx-badge cx-badge-orange cx-no-dot'>Port dû</span>";
            } },
            { key: "act", title: "", sortable: false, render: actions, searchValue: function () { return ""; } }
        ],
        onSelect: function (rows) { $("#selbar").toggleClass("cx-hidden", !rows.length); $("#sel-n").text(O.pl(rows.length, "colis sélectionné", "colis sélectionnés")); }
    });
    O.menusFixes("#dt-instance");

    function appliquer() {
        var fa = $("#f-age").val(), fv = $("#f-avis").val(), fp = $("#f-prov").val();
        dt.setRows($.grep(f.enInstance, function (e) {
            var a = age(e);
            if (fa === "0" && a !== 0) return false;
            if (fa && fa !== "0" && a <= Number(fa) - (fa === "15" ? 1 : 0)) return false;
            if (fv === "0" && (e.avis || []).length) return false;
            if (fv === "1" && !(e.avis || []).length) return false;
            if (fp && e.villeDep !== fp) return false;
            return true;
        }));
    }
    function charger() {
        return O.charger().done(function (exps, bords) {
            tous = exps; f = O.files(exps, bords);
            var l = f.enInstance, sans = 0, a3 = 0, a7 = 0, ret = 0, prov = {};
            $.each(l, function (_, e) { var a = age(e); if (!(e.avis || []).length) sans++; if (a > 3) a3++; if (a > 7) a7++; if (a >= O.INSTANCE_RETOUR_J) ret++; prov[e.villeDep] = true; });
            var remisJour = $.grep(exps, function (e) { return e.etape === "LIVREE" && e.remise && e.remise.mode === "AGENCE" && O.estMoi(e.remise.agenceId) && String(e.remise.date).substr(0, 10) === U.today(); }).length;
            $("#kpis").html([
                O.kpi("En instance", l.length, "colis disponibles au retrait", "fa-building-o", "blue"),
                O.kpi("Plus de " + O.INSTANCE_ALERTE_J + " jours", a3, a7 + " depuis plus de 7 jours", "fa-hourglass-half", a3 ? "orange" : "green"),
                O.kpi("Sans avis", sans, "destinataires non prévenus", "fa-bell-slash-o", sans ? "red" : "green"),
                O.kpi("À retourner", ret, "en instance depuis " + O.INSTANCE_RETOUR_J + " j et plus", "fa-undo", ret ? "purple" : ""),
                O.kpi("Remis aujourd'hui", remisJour, "retraits au comptoir", "fa-handshake-o", "green")
            ].join(""));
            var cur = $("#f-prov").val();
            $("#f-prov").html("<option value=''>Toutes</option>" + $.map(prov, function (_, v) { return "<option value='" + v + "'>" + U.esc(G.villeNom(v)) + "</option>"; }).join("")).val(cur || "");
            appliquer();
        });
    }
    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function remettre(e) {
        O.modaleRemise(e).done(function (maj) {
            U.toast("Colis <b>" + U.esc(maj.nRt) + "</b> remis à " + U.esc(maj.remise.nom) + "." + (maj.clientId ? " L'expédition devient facturable." : ""), "success");
            charger();
        });
    }

    $("#dt-instance").on("click", "[data-act]", function (ev) {
        ev.preventDefault();
        var e = parId($(this).closest("tr").data("id")), act = $(this).data("act");
        if (!e) return;
        if (act === "remettre") remettre(e);
        if (act === "fiche") O.fiche(e.id, { onChange: charger });
        if (act === "wa" || act === "sms") O.avis(e, act === "wa" ? "WHATSAPP" : "SMS", (e.avis || []).length ? "RELANCE" : "AVIS").done(function () { U.toast((act === "wa" ? "WhatsApp" : "SMS") + " préparé pour " + U.esc(e.destinataireInfo.nom) + " (envoi tracé).", "info"); charger(); });
        if (act === "reorienter") O.modaleReorienter([e]).done(function () { U.toast("LT réorientée : le colis repart via le groupage.", "success"); charger(); });
        if (act === "retour") {
            var ag = O.agDep(e);
            O.modaleReorienter([e], { agenceId: ag, motif: "Retour à l'expéditeur" }).done(function () { U.toast("Retour à l'expéditeur engagé : le colis est à regrouper vers " + U.esc(O.agenceLib(ag)) + ".", "success"); charger(); });
        }
    });
    $("#btn-avis-lot").on("click", function () {
        var s = dt.getSelected(), i = 0;
        // TODO API : POST /exploitation/expeditions/avis  { ids[], canal: "WHATSAPP" }  (envoi groupé par l'API WhatsApp Business)
        (function suivant() {
            if (i >= s.length) { U.toast(O.pl(s.length, "avis préparé", "avis préparés") + ".", "info"); charger(); return; }
            var e = s[i++];
            O.avis(e, "WHATSAPP", (e.avis || []).length ? "RELANCE" : "AVIS").always(suivant);
        })();
    });
    $("#btn-reo-lot").on("click", function () { O.modaleReorienter(dt.getSelected()).done(function (r) { U.toast(O.pl(r.ok.length, "LT réorientée", "LT réorientées") + ".", "success"); charger(); }); });
    $("#f-age, #f-avis, #f-prov").on("change", appliquer);
    $("#btn-refresh").on("click", function () { charger(); });

    /* Retrait au comptoir : n° de LT (douchette) ou téléphone du destinataire */
    O.scanner("#scan", function (code) {
        var $r = $("#scan-res"), brut = O.chercherLt(code), e = brut ? parId(brut.id) : null;
        if (!e) {
            var t = G.tel(code);
            if (t.length === 9) {
                var l = $.grep(f.enInstance, function (x) { return G.tel(x.destinataireInfo.tel) === t; });
                if (l.length === 1) e = l[0];
                else if (l.length > 1) { $("#q").val(G.telFmt(t)); dt.setSearch(G.telFmt(t)); $r.removeClass("ko").addClass("ok").html("<i class='fa fa-filter'></i> " + l.length + " colis pour ce numéro"); return; }
            }
        }
        if (!e) { O.bip(false); $r.removeClass("ok").addClass("ko").html("<i class='fa fa-times'></i> « " + U.esc(code) + " » introuvable."); return; }
        if (e.etape !== "EN_INSTANCE" || !O.estMoi(e.positionId)) {
            O.bip(false);
            $r.removeClass("ok").addClass("ko").html("<i class='fa fa-times'></i> " + U.esc(e.nRt) + " : " + U.esc(O.ETAPES[e.etape].label) + (e.positionId && !O.estMoi(e.positionId) ? " (" + U.esc(O.agenceLib(e.positionId)) + ")" : "") + ".");
            return;
        }
        O.bip(true);
        $r.removeClass("ko").addClass("ok").html("<i class='fa fa-check'></i> " + U.esc(e.nRt) + " · " + U.esc(e.destinataireInfo.nom));
        remettre(e);
    });

    charger();
});

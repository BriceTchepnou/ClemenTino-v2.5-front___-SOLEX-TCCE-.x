/* =====================================================================
   ClemenTino 2.0 - Module OPÉRATIONS - listes communes (CX.ol)
   ---------------------------------------------------------------------
   À charger après ops-commun.js. Colonnes « métier » des écrans Envoi,
   Réception, Livraison, International (N° reçu transport, N° RT manuel,
   N° réf. du lot, N° bordereau, bureaux, client, contenu « (n) NATURE
   (poids) », expéditeur / destinataire, date exp., statut « étape / à
   AGENCE »), filtres Ville / Bureau / Du / Au / Saisie par, menu d'actions
   par ligne et modale « Bordereau d'expédition ».
   ===================================================================== */
var CX = window.CX || {};
window.CX = CX;

CX.ol = (function () {
    var U = CX.util, O = CX.ops, G = CX.guichet;

    /* Statut « Enregistré / à AKWA » */
    function statutLib(e) {
        var lieu = e.positionId ? G.titre(O.agence(e.positionId).nom).toUpperCase() : e.partenaire ? e.partenaire.nom : e.etape === "EN_TRANSIT" ? "en route" : "";
        var et = O.ETAPES[e.etape] || { label: e.etape };
        var txt = (e.etape === "EN_INSTANCE" ? "En agence" : et.label) + (lieu ? " / " + (e.positionId ? "à " : "") + lieu : "");
        return "<span class='cx-badge cx-badge-" + (et.color || "grey") + "'>" + U.esc(txt) + "</span>" +
            (e.suspendu ? "<div><span class='cx-badge cx-badge-red cx-no-dot' title='" + U.esc(e.suspendu.motif) + "'><i class='fa fa-pause-circle'></i> Suspendue</span></div>" : "") + " " + O.slaBadge(e);
    }
    function bordereauDe(e, bords) {
        if (!e.bordereauId) return null;
        return $.grep(bords || [], function (b) { return b.id === e.bordereauId; })[0] || null;
    }

    /* Colonnes disponibles (clé -> définition CX.DataTable) ; bords = bordereaux chargés */
    function colonnes(cles, bords, menu) {
        var D = {
            rt: { key: "nRt", title: "N° reçu transport", render: function (e) { return "<a href='#' class='cx-mono cx-strong' data-fiche>" + U.esc(e.nRt) + "</a>"; },
                searchValue: function (e) { return [e.nRt, e.rtMan, e.refLot, e.bordereau, e.bordereauManuel, e.expediteurInfo.nom, e.destinataireInfo.nom, e.destinataireInfo.tel, G.telFmt(e.destinataireInfo.tel), e.contenu, e.partenaire ? e.partenaire.awb : ""].join(" "); } },
            rtMan: { key: "rtMan", title: "N° RT man.", render: function (e) { return e.rtMan ? "<span class='cx-tag cx-mono'>" + U.esc(e.rtMan) + "</span>" : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            ref: { key: "refLot", title: "N° réf.", render: function (e) { return "<span class='ox-ref'>" + U.esc(e.refs[0]) + "</span>" + (e.refs.length > 1 ? "<div class='cx-cell-sub'>+" + (e.refs.length - 1) + " lot" + (e.refs.length > 2 ? "s" : "") + "</div>" : ""); }, searchValue: function () { return ""; } },
            bord: { key: "bordereau", title: "N° bord.", render: function (e) { return e.bordereauId ? "<a class='cx-mono' href='bordereau.html?id=" + e.bordereauId + "'>" + U.esc(e.bordereau) + "</a>" : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            bordMan: { key: "bordereauManuel", title: "N° bord. man.", render: function (e) { var b = bordereauDe(e, bords), m = e.bordereauManuel || (b ? b.numeroManuel : ""); return m ? "<span class='cx-mono'>" + U.esc(m) + "</span>" : "<span class='cx-muted'>—</span>"; }, searchValue: function () { return ""; } },
            bureauDep: { key: "bureauDep", title: "Bureau départ", sortValue: function (e) { return O.origineLib(e); }, render: function (e) { return U.esc(O.origineLib(e)); }, searchValue: function () { return ""; } },
            bureauDest: { key: "bureauDest", title: "Bureau dest.", sortValue: function (e) { return O.destinationLib(e); }, render: function (e) {
                return U.esc(O.destinationLib(e)) + "<div class='cx-cell-sub'>" + (e.livraison.mode === "DOMICILE" ? "<i class='fa fa-home'></i> livraison" : "retrait agence") + "</div>";
            }, searchValue: function () { return ""; } },
            client: { key: "client", title: "Client", sortValue: function (e) { return e.client ? e.client.raisonSociale : "~"; }, render: function (e) { return e.client ? U.esc(e.client.raisonSociale) : "<span class='cx-muted'>Particulier</span>"; }, searchValue: function (e) { return e.client ? e.client.raisonSociale : ""; } },
            contenu: { key: "contenu", title: "Contenu", sortValue: function (e) { return Number(e.poids) || 0; }, render: function (e) { return "<span class='cx-nowrap'>" + U.esc(O.contenuCourt(e)) + "</span><div class='cx-cell-sub'>" + U.esc(e.contenu || "") + "</div>"; }, searchValue: function () { return ""; } },
            parties: { key: "parties", title: "Expéditeur / Destinataire", sortValue: function (e) { return e.expediteurInfo.nom; }, render: function (e) {
                return U.esc(e.expediteurInfo.nom) + " <span class='cx-cell-sub cx-nowrap'>" + U.esc(G.telAff(e.expediteurInfo.tel)) + "</span>" +
                    "<div class='cx-cell-sub'><i class='fa fa-long-arrow-right'></i> " + U.esc(e.destinataireInfo.nom) + " · " + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div>";
            }, searchValue: function () { return ""; } },
            expediteur: { key: "exp", title: "Expéditeur", sortValue: function (e) { return e.expediteurInfo.nom; }, render: function (e) { return U.esc(e.expediteurInfo.nom); }, searchValue: function () { return ""; } },
            destinataire: { key: "dst", title: "Destinataire", sortValue: function (e) { return e.destinataireInfo.nom; }, render: function (e) { return U.esc(e.destinataireInfo.nom) + "<div class='cx-cell-sub cx-nowrap'>" + U.esc(G.telAff(e.destinataireInfo.tel)) + "</div>"; }, searchValue: function () { return ""; } },
            dateExp: { key: "dateExp", title: "Date exp.", sortValue: function (e) { return e.dateExp + (e.heure || ""); }, render: function (e) { return "<span class='cx-nowrap'>" + U.toFr(e.dateExp) + "</span><div class='cx-cell-sub'>" + U.esc(e.heure || "") + "</div>"; }, searchValue: function () { return ""; } },
            statut: { key: "etape", title: "Statut", sortValue: function (e) { return (O.ETAPES[e.etape] || {}).ordre; }, render: statutLib, searchValue: function () { return ""; } },
            notes: { key: "notes", title: "Notes", sortValue: function (e) { return (e.notes || []).length; }, render: function (e) {
                var n = e.notes || [];
                return n.length ? "<a href='#' data-act='notes' title='" + U.esc(n[n.length - 1].texte) + "'><i class='fa fa-sticky-note-o'></i> " + n.length + "</a>" : "<a href='#' data-act='notes' class='cx-muted' title='Ajouter une note'><i class='fa fa-plus'></i></a>";
            }, searchValue: function (e) { return $.map(e.notes || [], function (x) { return x.texte; }).join(" "); } },
            quartier: { key: "quartier", title: "Quartier dest. / Zone", sortValue: function (e) { return e.livraison.quartier || "~"; }, render: function (e) {
                return e.livraison.mode === "DOMICILE" ? U.esc(e.livraison.quartier || "—") + (e.livraison.zone ? "<div class='cx-cell-sub'>" + U.esc(e.livraison.zone) + "</div>" : "") : "<span class='cx-muted'>Retrait</span>";
            }, searchValue: function (e) { return e.livraison.quartier || ""; } },
            coursier: { key: "coursier", title: "Coursier", render: function (e) { return e.coursier ? U.esc(e.coursier) : "<span class='cx-muted'>—</span>"; }, searchValue: function (e) { return e.coursier || ""; } },
            livreLe: { key: "livreLe", title: "Livré le", sortValue: function (e) { return e.remise ? e.remise.date : e.dateLivraison; }, render: function (e) { return "<span class='cx-nowrap'>" + U.esc(U.toFr(e.remise ? e.remise.date : e.dateLivraison)) + "</span>"; }, searchValue: function () { return ""; } },
            retirePar: { key: "retirePar", title: "Retiré par", render: function (e) { return e.remise ? U.esc(e.remise.nom) + "<div class='cx-cell-sub'>" + U.esc(e.remise.piece || "") + " " + U.esc(e.remise.numeroPiece || "") + "</div>" : "<span class='cx-muted'>—</span>"; }, searchValue: function (e) { return e.remise ? e.remise.nom : ""; } },
            awb: { key: "awb", title: "Partenaire / AWB", sortValue: function (e) { return e.partenaire ? e.partenaire.awb : "~"; }, render: function (e) {
                return e.partenaire ? U.esc(e.partenaire.nom) + "<div class='cx-mono cx-cell-sub'>" + U.esc(e.partenaire.awb) + "</div>" : "<span class='cx-muted'>—</span>";
            }, searchValue: function (e) { return e.partenaire ? e.partenaire.nom + " " + e.partenaire.awb : ""; } },
            actions: { key: "act", title: "", sortable: false, width: "48px", render: function (e) { return menu ? menu(e) : ""; }, searchValue: function () { return ""; } }
        };
        return $.map(cles, function (k) { return D[k] || null; });
    }

    /* Menu d'actions par ligne : items = [[act, icone, libellé, actif(bool), classe]] */
    function menu(items) {
        return "<div class='dropdown cx-actions'><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-toggle='dropdown' aria-haspopup='true' aria-label='Actions' title='Actions'><i class='fa fa-ellipsis-v'></i></button>" +
            "<ul class='dropdown-menu dropdown-menu-right'>" + $.map(items, function (it) {
                if (it === "-") return "<li class='divider'></li>";
                if (it[3] === false) return null;
                return "<li><a href='#' data-act='" + it[0] + "'" + (it[4] ? " class='" + it[4] + "'" : "") + "><i class='fa " + it[1] + "'></i> " + it[2] + "</a></li>";
            }).join("") + "</ul></div>";
    }

    /* Filtres Ville / Bureau / Du / Au / Saisie par : remplissage et application */
    function remplirFiltres(exps, ids) {
        ids = $.extend({ ville: "#f-ville", bureau: "#f-bureau", par: "#f-par" }, ids || {});
        var curV = $(ids.ville).val(), curB = $(ids.bureau).val(), curP = $(ids.par).val();
        $(ids.ville).html("<option value=''>Toutes</option>" + $.map(CX.REF.VILLES, function (v) { return "<option value='" + v.nom + "'>" + U.esc(G.villeNom(v.nom)) + "</option>"; }).join("")).val(curV || "");
        function bureaux() {
            var v = $(ids.ville).val(), c = $(ids.bureau).val();
            $(ids.bureau).html("<option value=''>Tous</option>" + $.map(v ? CX.REF.agencesDe(v) : CX.REF.AGENCES, function (a) { return "<option value='" + a.id + "'>" + U.esc(v ? G.titre(a.nom) : O.agenceLib(a.id)) + "</option>"; }).join("")).val(c || "");
        }
        bureaux();
        if (curB) $(ids.bureau).val(curB);
        $(ids.ville).off("change.ol").on("change.ol", bureaux);
        var agents = {};
        $.each(exps, function (_, e) { if (e.guichetier) agents[e.guichetier] = true; });
        $(ids.par).html("<option value=''>Tous</option>" + $.map(Object.keys(agents).sort(), function (a) { return "<option>" + U.esc(a) + "</option>"; }).join("")).val(curP || "");
    }
    /* sens : "dep" (provenance) ou "dest" (destination) pour la ville / le bureau */
    function passe(e, f, sens) {
        var ville = sens === "dep" ? e.villeDep : e.villeDest, ag = sens === "dep" ? e.agDepId : e.agDestId;
        if (f.ville && ville !== f.ville) return false;
        if (f.bureau && String(ag) !== String(f.bureau)) return false;
        if (f.du && e.dateExp < f.du) return false;
        if (f.au && e.dateExp > f.au) return false;
        if (f.par && e.guichetier !== f.par) return false;
        return true;
    }
    function lireFiltres() {
        return { ville: $("#f-ville").val() || "", bureau: $("#f-bureau").val() || "", du: $("#f-du").val() || "", au: $("#f-au").val() || "", par: $("#f-par").val() || "" };
    }

    /* =================================================================
       Modale « Bordereau d'expédition » (manifeste de voyage) : création
       à partir d'une sélection (ou vide), destination proposée = la plus
       fréquente de la sélection.
       ================================================================= */
    function modaleBordereau(selection, destDefaut) {
        var dfd = $.Deferred(), A = O.agenceCourante(), s = selection || [];
        var compte = {}, best = destDefaut || null;
        $.each(s, function (_, e) { compte[e.agDestId] = (compte[e.agDestId] || 0) + 1; if (!destDefaut && (!best || compte[e.agDestId] > compte[best])) best = e.agDestId; });
        var v = O.VEHICULES[0];
        var corps = "<p class='cx-muted' style='margin-top:0'>" + (s.length ? O.pl(s.length, "expédition") + " au départ de <b>" + U.esc(O.agenceLib(A.id)) + "</b>." : "Bordereau vide, à compléter depuis l'écran Envoi.") + "</p>" +
            "<div class='ox-grid-3'>" +
            O.champ("cb-dest", "Destination", "<select class='form-control' id='cb-dest'>" + O.optionsAgences(best) + "</select>", true) +
            O.champ("cb-moyen", "Moyen de transport", "<select class='form-control' id='cb-moyen'>" + $.map(O.MOYENS_TRANSPORT, function (l, k) { return "<option value='" + k + "'>" + l + "</option>"; }).join("") + "</select>", true) +
            O.champ("cb-ntr", "N° transport (immatriculation / vol)", "<input type='text' class='form-control cx-mono' id='cb-ntr' maxlength='20' placeholder='" + U.esc(v.immatriculation) + "'>") +
            O.champ("cb-transporteur", "Transporteur", "<input type='text' class='form-control' id='cb-transporteur' maxlength='60' placeholder='Flotte interne, Touristique Express…'>") +
            O.champ("cb-chauffeur", "Chauffeur", "<input type='text' class='form-control' id='cb-chauffeur' maxlength='60' list='cb-chauffeurs'><datalist id='cb-chauffeurs'>" +
                $.map(O.CHAUFFEURS, function (x) { return "<option value='" + U.esc(x.nom) + "'>"; }).join("") + "</datalist>") +
            O.champ("cb-man", "N° bordereau manuel", "<input type='text' class='form-control cx-mono' id='cb-man' maxlength='20'>") +
            O.champ("cb-dep", "Départ prévu", "<div class='ox-flex'><input type='date' class='form-control ox-grow' id='cb-dep' value='" + U.today() + "'><input type='time' class='form-control' id='cb-dep-h' style='width:105px' value='18:00'></div>", true) +
            O.champ("cb-arr", "Arrivée prévue", "<div class='ox-flex'><input type='date' class='form-control ox-grow' id='cb-arr' value='" + U.addDays(U.today(), 1) + "'><input type='time' class='form-control' id='cb-arr-h' style='width:105px' value='12:00'></div>") +
            O.champ("cb-contact", "Personne à contacter", "<input type='text' class='form-control' id='cb-contact' maxlength='60' placeholder='Nom et téléphone'>") +
            "</div><div class='ox-grid-2'>" + O.champ("cb-scelle", "N° de scellé", "<input type='text' class='form-control cx-mono' id='cb-scelle' maxlength='20'>", false, "Peut être renseigné au départ.") +
            O.champ("cb-obs", "Observations", "<input type='text' class='form-control' id='cb-obs' maxlength='200'>") + "</div><div id='cb-alerte'></div>";
        var $m = O.modale("ox-creer", "Bordereau d'expédition", "fa-file-text-o", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='cb-ok'><i class='fa fa-check'></i> Générer le bordereau</button>", "modal-lg");
        function alerte() {
            var d = $("#cb-dest").val(), autres = $.grep(s, function (e) { return String(e.agDestId) !== String(d); });
            $("#cb-alerte").html(String(d) === String(A.id) ? "<div class='cx-note cx-note-err'><i class='fa fa-times-circle'></i><div>La destination ne peut pas être l'agence de départ.</div></div>" :
                autres.length ? "<div class='cx-note cx-note-warn'><i class='fa fa-random'></i><div>" + O.pl(autres.length, "expédition a", "expéditions ont") + " une autre destination finale : elles transiteront par " + U.esc(O.agenceLib(d)) + ".</div></div>" : "");
        }
        $m.on("change", "#cb-dest", alerte);
        $m.on("shown.bs.modal", alerte);
        var fait = null;
        $m.on("click", "#cb-ok", function () {
            O.effacerErreurs($m);
            var d = O.agence($("#cb-dest").val());
            if (!d || d.id === A.id) return O.erreurChamp($m, "#cb-dest", "Choisissez une autre agence.");
            var date = $("#cb-dep").val() || U.today(), $b = $(this);
            var ch = $.trim($("#cb-chauffeur").val()), connu = $.grep(O.CHAUFFEURS, function (x) { return x.nom === ch; })[0], ntr = $.trim($("#cb-ntr").val());
            var b = O.nouveauBordereau({
                agenceDestId: d.id, date: date, heure: $("#cb-dep-h").val() || "", numeroManuel: $.trim($("#cb-man").val()),
                moyen: $("#cb-moyen").val(), numeroTransport: ntr, transporteur: $.trim($("#cb-transporteur").val()), contact: $.trim($("#cb-contact").val()),
                departPrevu: date + " " + ($("#cb-dep-h").val() || "18:00"), arriveePrevue: ($("#cb-arr").val() || U.addDays(date, 1)) + " " + ($("#cb-arr-h").val() || "12:00"),
                vehicule: { type: "Camionnette (3,5 t)", immatriculation: ntr }, chauffeur: { nom: ch, tel: connu ? connu.tel : "" },
                scelle: $.trim($("#cb-scelle").val()), observations: $.trim($("#cb-obs").val())
            });
            U.busy($b, true);
            // TODO API : POST /exploitation/bordereaux  { agenceDestId, moyen, numeroTransport, transporteur, numeroManuel, departPrevu, arriveePrevue, contact, expeditionIds[] }
            CX.api.save("bordereaux", b).then(function (bb) {
                if (!s.length) return { bordereau: bb, ok: [], ko: [] };
                return O.grouper(bb, $.map(s, function (e) { return e.id; }));
            }).done(function (r) { fait = r; $m.modal("hide"); }).fail(function (m) { U.busy($b, false); U.toast(U.esc(m || "Création impossible."), "error"); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* Impression du reçu transport (réimpression guichet) */
    function imprimerRecu(e) {
        // TODO API : GET /guichet/expeditions/{id}/recu.pdf
        window.open("../guichet/recu.html?id=" + e.id + "&print=1", "_blank");
    }

    return { statutLib: statutLib, colonnes: colonnes, menu: menu, remplirFiltres: remplirFiltres, passe: passe, lireFiltres: lireFiltres,
        modaleBordereau: modaleBordereau, imprimerRecu: imprimerRecu };
})();

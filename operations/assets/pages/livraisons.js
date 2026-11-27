/* =====================================================================
   Opérations · Livraisons à domicile (operations/livraisons.html)
   Onglets : À livrer | Tournées en cours (#tournees) | Clôturées | Livreurs
   ---------------------------------------------------------------------
   Colis à livrer (arrivés, remise « domicile », ou échec avec nouvelle
   tentative) regroupés par zone / quartier -> constitution d'une tournée
   (collection « tournees ») pour un livreur : colis EN_LIVRAISON ;
   feuille de route imprimable / PDF ; clôture : livré (preuve) ou échec
   (motif) -> nouvelle tentative (reste à livrer) ou EN_INSTANCE.
   Gestion simple des livreurs (collection « livreurs »).
   ===================================================================== */
$(function () {
    var U = CX.util, O = CX.ops, G = CX.guichet, A = O.agenceCourante(), S = CX.CONFIG.SOCIETE;
    var tous = [], f = null, tournees = [], livreurs = [], sel = {}, onglet = "alivrer";
    var STATUT_LIVREUR = { ACTIF: { label: "Actif", color: "green" }, CONGE: { label: "En congé", color: "orange" }, INACTIF: { label: "Inactif", color: "grey" } };

    O.selecteurAgence("#ox-agence-slot");

    function parId(id) { return $.grep(tous, function (e) { return String(e.id) === String(id); })[0]; }
    function zoneLib(code) { var z = $.grep(CX.REF.ZONES_LIVRAISON, function (x) { return x.code === code; })[0]; return z ? z.nom : code ? code : "Zone non précisée"; }
    function tentatives(e) { return $.grep(e.suivi || [], function (s) { return s.etape === "ECHEC"; }).length; }
    function livreursAgence(tousStatuts) {
        return $.grep(livreurs, function (l) { return l.ville === A.ville && (tousStatuts || l.statut === "ACTIF"); });
    }

    /* =================================================================
       À livrer : par zone puis quartier
       ================================================================= */
    function rendreALivrer() {
        var q = U.normalize($.trim($("#q").val())), fz = $("#f-zone").val();
        var rows = $.grep(f.aLivrer, function (e) {
            if (fz && (e.livraison.zone || "") !== fz) return false;
            if (q && U.normalize([e.nRt, e.destinataireInfo.nom, e.destinataireInfo.tel, e.livraison.quartier, e.livraison.repere, e.contenu].join(" ")).indexOf(q) < 0) return false;
            return true;
        });
        var grp = {}, cles = [];
        $.each(rows, function (_, e) {
            var k = (e.livraison.zone || "") + "|" + (e.livraison.quartier || "Quartier non précisé");
            if (!grp[k]) { grp[k] = []; cles.push(k); }
            grp[k].push(e);
        });
        cles.sort();
        $("#zones").html(cles.length ? $.map(cles, function (k) {
            var g = grp[k], p = k.split("|"), nsel = $.grep(g, function (e) { return sel[e.id]; }).length;
            return "<section class='ox-groupe'><div class='ox-groupe-head'><input type='checkbox' data-check-groupe" + (nsel === g.length ? " checked" : "") + " aria-label='Tout sélectionner'>" +
                "<h4><i class='fa fa-map-marker'></i> " + U.esc(p[1]) + "</h4><small>" + U.esc(zoneLib(p[0])) + " · " + O.pl(g.length, "colis") + "</small></div>" +
                "<div class='cx-table-wrap'><table class='cx-table'><thead><tr><th class='cx-col-check'></th><th>N° LT</th><th>Destinataire</th><th>Adresse / repère</th><th>Colis</th><th>Arrivé</th><th>Statut</th></tr></thead><tbody>" +
                $.map(g, function (e) {
                    var arr = O.dernierEvenement(e, "ARRIVEE"), t = tentatives(e);
                    return "<tr data-id='" + e.id + "' class='" + (sel[e.id] ? "selected" : "") + "'><td class='cx-col-check'><input type='checkbox' data-check" + (sel[e.id] ? " checked" : "") + " aria-label='Sélectionner'></td>" +
                        "<td><a href='#' class='cx-mono cx-strong' data-fiche>" + U.esc(e.nRt) + "</a></td>" +
                        "<td>" + U.esc(e.destinataireInfo.nom) + "<div class='cx-cell-sub cx-nowrap'>" + U.esc(G.telAff(e.livraison.telAppel || e.destinataireInfo.tel)) + "</div></td>" +
                        "<td>" + U.esc(e.livraison.quartier || "") + (e.livraison.repere ? "<div class='cx-cell-sub'>" + U.esc(e.livraison.repere) + "</div>" : "") + "</td>" +
                        "<td>" + (e.nbColis || 1) + " · " + U.esc(G.kg(e.poids)) + "<div class='cx-cell-sub'>" + U.esc(e.contenu || "") + "</div></td>" +
                        "<td class='cx-nowrap'>" + (arr ? U.esc(U.toFr(arr.date)) : "—") + "</td>" +
                        "<td>" + (e.etape === "ECHEC" ? "<span class='cx-badge cx-badge-red cx-no-dot'>" + (t + 1) + "<sup>e</sup> tentative</span>" : O.etapeBadge(e.etape)) + " " + O.slaBadge(e) + "</td></tr>";
                }).join("") + "</tbody></table></div></section>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-map-marker'></i><b>Aucun colis à livrer</b>Les colis « livraison à domicile » réceptionnés au dégroupage apparaissent ici.</div>");
        majSelection();
    }
    function selection() { return $.grep(f.aLivrer, function (e) { return sel[e.id]; }); }
    function majSelection() {
        var s = selection();
        $("#t-sel").text(s.length ? O.pl(s.length, "colis sélectionné", "colis sélectionnés") : "Aucun colis sélectionné");
        $("#btn-tournee").prop("disabled", !s.length || !$("#t-livreur").val());
    }

    /* =================================================================
       Tournées
       ================================================================= */
    function compteTournee(t) {
        var r = { livre: 0, echec: 0, encours: 0 };
        $.each(t.expeditionIds, function (_, id) {
            var res = (t.resultats || {})[id], e = parId(id);
            if (res) { if (res.resultat === "LIVREE") r.livre++; else r.echec++; }
            else if (e && e.etape === "LIVREE") r.livre++;
            else r.encours++;
        });
        return r;
    }
    function rendreTournees() {
        var enCours = $.grep(tournees, function (t) { return t.statut === "EN_COURS"; });
        $("#tournees").html(enCours.length ? $.map(enCours, function (t) {
            var c = compteTournee(t), vieille = t.date < U.today();
            return "<div class='ox-bcard' data-t='" + t.id + "'><div class='ox-bcard-top'><span class='ox-bcard-num'>" + U.esc(t.numero) + "</span>" + O.badge(O.STATUT_TOURNEE, t.statut) + "</div>" +
                "<div class='ox-bcard-route'><i class='fa fa-motorcycle cx-muted'></i> " + U.esc(t.livreurNom) + "</div>" +
                "<div class='ox-bcard-meta'><span><i class='fa fa-calendar'></i> " + U.toFr(t.date) + " " + U.esc(t.heure || "") + "</span><span><i class='fa fa-cube'></i> " + O.pl(t.expeditionIds.length, "colis") + "</span>" +
                (c.livre ? "<span style='color:var(--cx-green)'><i class='fa fa-check'></i> " + c.livre + " livré" + (c.livre > 1 ? "s" : "") + "</span>" : "") + "</div>" +
                (vieille ? "<div class='cx-note cx-note-warn' style='margin:0'><i class='fa fa-clock-o'></i><div>Tournée du " + U.toFr(t.date) + " non clôturée.</div></div>" : "") +
                "<div class='ox-bcard-actions'><button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-feuille><i class='fa fa-print'></i> Feuille de route</button>" +
                "<button type='button' class='cx-btn cx-btn-primary cx-btn-xs' data-cloturer><i class='fa fa-flag-checkered'></i> Clôturer</button></div></div>";
        }).join("") : "<div class='cx-empty'><i class='fa fa-motorcycle'></i><b>Aucune tournée en cours</b>Constituez une tournée depuis l'onglet « À livrer ».</div>");
        dtClot.setRows($.grep(tournees, function (t) { return t.statut === "CLOTUREE"; }));
    }
    var dtClot = new CX.DataTable("#dt-cloturees", {
        pageSize: 10, sortKey: "numero", sortDir: -1, emptyText: "Aucune tournée clôturée", emptyIcon: "fa-flag-checkered",
        columns: [
            { key: "numero", title: "N° tournée", render: function (t) { return "<span class='cx-mono cx-strong'>" + U.esc(t.numero) + "</span>"; } },
            { key: "date", title: "Date", render: function (t) { return U.toFr(t.date); } },
            { key: "livreurNom", title: "Livreur" },
            { key: "nb", title: "Colis", className: "num", sortValue: function (t) { return t.expeditionIds.length; }, render: function (t) { return t.expeditionIds.length; } },
            { key: "res", title: "Résultat", sortable: false, render: function (t) { var c = compteTournee(t); return "<span class='cx-badge cx-badge-green cx-no-dot'>" + c.livre + " livré(s)</span> " + (c.echec ? "<span class='cx-badge cx-badge-red cx-no-dot'>" + c.echec + " échec(s)</span>" : ""); } },
            { key: "dateCloture", title: "Clôturée le", render: function (t) { return U.esc(U.toFr(t.dateCloture || "")); } },
            { key: "act", title: "", sortable: false, render: function () { return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-feuille><i class='fa fa-print'></i> Feuille</button>"; } }
        ]
    });

    /* Feuille de route (aperçu + impression + PDF) */
    function feuilleHtml(t) {
        var lignes = $.map(t.expeditionIds, function (id) { return parId(id) || null; });
        return "<div class='ox-sheet' id='feuille-sheet'><div class='ox-sh-head'><div class='ox-sh-soc'><b>" + U.esc(S.nom) + "</b><span>" + U.esc(O.agenceLib(t.agenceId)) + " · " + U.esc(S.tel || "") + "</span></div>" +
            "<div class='ox-sh-titre'><h1>FEUILLE DE ROUTE</h1><div class='ox-sh-num'>" + U.esc(t.numero) + "</div><div style='font-size:10px'>" + U.esc(U.toFrLong(t.date)) + " · départ " + U.esc(t.heure || "") + "</div></div></div>" +
            "<div class='ox-sh-infos'><div><small>Livreur</small><b>" + U.esc(t.livreurNom) + "</b></div><div><small>Véhicule</small><b>" + U.esc(t.vehicule || "—") + "</b></div>" +
            "<div><small>Colis</small><b>" + lignes.length + "</b></div><div><small>Statut</small><b>" + U.esc(O.STATUT_TOURNEE[t.statut].label) + "</b></div></div>" +
            "<table class='ox-sh-table'><thead><tr><th>#</th><th>N° LT</th><th>Destinataire / téléphone</th><th>Quartier · repère</th><th>Colis</th><th>À encaisser</th><th>Heure</th><th>Nom et signature du receveur</th></tr></thead><tbody>" +
            $.map(lignes, function (e, i) {
                var r = (t.resultats || {})[e.id];
                return "<tr><td>" + (i + 1) + "</td><td class='cx-mono'><b>" + U.esc(e.nRt) + "</b></td><td>" + U.esc(e.destinataireInfo.nom) + "<br>" + U.esc(G.telAff(e.livraison.telAppel || e.destinataireInfo.tel)) + "</td>" +
                    "<td>" + U.esc(e.livraison.quartier || "") + (e.livraison.repere ? "<br><small>" + U.esc(e.livraison.repere) + "</small>" : "") + "</td><td>" + (e.nbColis || 1) + " · " + U.esc(G.kg(e.poids)) + "</td>" +
                    "<td>" + (e.paiement.statut === "PAYE" || e.typeClient === "COMPTE" ? "—" : U.money(e.montants.total)) + "</td>" +
                    "<td>" + (r ? U.esc(r.heure || "") : "") + "</td><td style='min-width:150px;height:34px'>" + (r ? (r.resultat === "LIVREE" ? "Livré à " + U.esc(r.receveur) : "Échec : " + U.esc(r.motif)) : "") + "</td></tr>";
            }).join("") + "</tbody></table>" +
            "<div class='ox-sh-sign' style='grid-template-columns:1fr 1fr'><div><b>Livreur</b>" + U.esc(t.livreurNom) + "<span>Reconnaît avoir pris en charge " + O.pl(lignes.length, "colis") + "</span></div>" +
            "<div><b>Chef d'agence / dispatch</b>" + U.esc(O.agenceLib(t.agenceId)) + "<span>Retour de tournée contrôlé le … à …</span></div></div>" +
            "<div class='ox-sh-foot'>Édité le " + U.esc(U.toFr(U.now())) + " par " + U.esc(CX.CONFIG.USER.nom) + "</div></div>";
    }
    function feuille(t) {
        var $m = O.modale("ox-feuille", "Feuille de route " + U.esc(t.numero), "fa-print", "<div style='background:#eef1f6;padding:10px;border-radius:8px'>" + feuilleHtml(t) + "</div>",
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Fermer</button><button type='button' class='cx-btn cx-btn-ghost' id='fr-pdf'><i class='fa fa-file-pdf-o'></i> PDF</button>" +
            "<button type='button' class='cx-btn cx-btn-primary' id='fr-print'><i class='fa fa-print'></i> Imprimer</button>", "modal-lg ox-fiche-dialog");
        $m.on("click", "#fr-print", function () {
            $("#ox-print").html(feuilleHtml(t));
            $("body").addClass("ox-print-zone");
            window.print();
            setTimeout(function () { $("body").removeClass("ox-print-zone"); $("#ox-print").empty(); }, 500);
        });
        $m.on("click", "#fr-pdf", function () { CX.pdf.telecharger("#feuille-sheet", { nom: "Feuille de route " + t.numero, bouton: this }); });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    /* Clôture d'une tournée */
    function cloturer(t) {
        var lignes = $.grep($.map(t.expeditionIds, function (id) { return parId(id) || null; }), function (e) { return e.etape === "EN_LIVRAISON"; });
        var corps = "<p class='cx-muted' style='margin-top:0'>Tournée <b class='cx-mono'>" + U.esc(t.numero) + "</b> · " + U.esc(t.livreurNom) + " · indiquez le résultat de chaque colis.</p>" +
            "<div class='cx-table-wrap'><table class='cx-table' id='cl-table'><thead><tr><th>N° LT</th><th>Destinataire</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>" +
            $.map(lignes, function (e) {
                return "<tr data-id='" + e.id + "'><td class='cx-mono cx-strong'>" + U.esc(e.nRt) + "</td><td>" + U.esc(e.destinataireInfo.nom) + "<div class='cx-cell-sub'>" + U.esc(e.livraison.quartier || "") + "</div></td>" +
                    "<td class='cx-nowrap'><label class='cx-pill'><input type='radio' name='cl-r-" + e.id + "' value='LIVREE'><span><i class='fa fa-check'></i> Livré</span></label> " +
                    "<label class='cx-pill'><input type='radio' name='cl-r-" + e.id + "' value='ECHEC'><span><i class='fa fa-times'></i> Échec</span></label></td>" +
                    "<td><div class='cl-livre cx-hidden'><div class='ox-flex'><input type='text' class='form-control input-sm ox-grow' data-receveur placeholder='Nom du receveur' value='" + U.esc(e.destinataireInfo.nom) + "' maxlength='80'>" +
                    "<input type='time' class='form-control input-sm' data-heure value='" + U.now().substr(11, 5) + "' style='width:96px'></div>" +
                    "<label class='cx-help' style='display:block;margin-top:4px'><input type='checkbox' data-decharge checked> Décharge signée rapportée (preuve de livraison)</label></div>" +
                    "<div class='cl-echec cx-hidden'><div class='ox-flex'><select class='form-control input-sm ox-grow' data-motif>" + O.options(O.MOTIFS_ECHEC) + "</select>" +
                    "<select class='form-control input-sm' data-suite><option value='RETENTER'>Nouvelle tentative</option><option value='INSTANCE'>Mettre en instance (retrait)</option></select></div></div></td></tr>";
            }).join("") + "</tbody></table></div>" +
            (!lignes.length ? "<p class='cx-muted'>Tous les colis de la tournée ont déjà un résultat.</p>" : "");
        var $m = O.modale("ox-cloture", "Clôturer la tournée", "fa-flag-checkered", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-ghost' id='cl-tous'><i class='fa fa-check'></i> Tous livrés</button>" +
            "<button type='button' class='cx-btn cx-btn-primary' id='cl-ok'><i class='fa fa-flag-checkered'></i> Clôturer la tournée</button>", "modal-lg");
        $m.on("change", "input[type=radio]", function () {
            var $tr = $(this).closest("tr"), v = $(this).val();
            $tr.find(".cl-livre").toggleClass("cx-hidden", v !== "LIVREE");
            $tr.find(".cl-echec").toggleClass("cx-hidden", v !== "ECHEC");
            $tr.removeClass("ox-retard");
        });
        $m.on("click", "#cl-tous", function () { $m.find("input[value=LIVREE]").prop("checked", true).trigger("change"); });
        var fait = false;
        $m.on("click", "#cl-ok", function () {
            var res = [], manque = 0;
            $m.find("#cl-table tbody tr").each(function () {
                var $tr = $(this), v = $tr.find("input[type=radio]:checked").val();
                if (!v) { manque++; $tr.addClass("ox-retard"); return; }
                res.push({ id: $tr.data("id"), resultat: v, receveur: $.trim($tr.find("[data-receveur]").val()), heure: $tr.find("[data-heure]").val(),
                    decharge: $tr.find("[data-decharge]").is(":checked"), motif: $tr.find("[data-motif]").val(), suite: $tr.find("[data-suite]").val() });
            });
            if (manque) { U.toast(O.pl(manque, "colis sans résultat", "colis sans résultat") + ".", "warning"); return; }
            var vides = $.grep(res, function (r) { return r.resultat === "LIVREE" && r.receveur.length < 2; });
            if (vides.length) { U.toast("Indiquez le nom du receveur de chaque colis livré.", "warning"); return; }
            var $b = $(this); U.busy($b, true);
            var i = 0, resultats = $.extend({}, t.resultats || {});
            // TODO API : POST /exploitation/tournees/{id}/cloture  { resultats: [{ expeditionId, resultat, receveur, heure, decharge, motif, suite }] }
            (function suivant() {
                if (i >= res.length) {
                    CX.api.get("tournees", t.id).then(function (tt) {
                        tt.resultats = resultats; tt.statut = "CLOTUREE"; tt.dateCloture = U.now();
                        tt.historique = tt.historique || [];
                        tt.historique.unshift({ date: U.now(), user: CX.CONFIG.USER.nom, action: "Tournée clôturée" });
                        return CX.api.save("tournees", tt);
                    }).done(function () { fait = true; $m.modal("hide"); });
                    return;
                }
                var r = res[i++], e = parId(r.id), date = U.today() + " " + (r.heure || U.now().substr(11, 5));
                resultats[r.id] = { resultat: r.resultat, receveur: r.receveur, heure: r.heure, motif: r.resultat === "ECHEC" ? r.motif : "", suite: r.resultat === "ECHEC" ? r.suite : "", decharge: r.decharge };
                if (r.resultat === "LIVREE") {
                    O.avancer(r.id, "LIVREE", { note: "Livré par " + t.livreurNom + " à " + r.receveur + (r.decharge ? "" : " (décharge non rapportée)"), preuve: r.decharge, date: date,
                        patch: { remise: { date: date, user: t.livreurNom, agenceId: A.id, nom: r.receveur, mode: "DOMICILE", tourneeId: t.id, decharge: r.decharge } } }).always(suivant);
                } else {
                    O.avancer(r.id, "ECHEC", { note: r.motif + " (tournée " + t.numero + ", " + t.livreurNom + ")" + (r.suite === "RETENTER" ? " - nouvelle tentative" : ""), date: date, position: A.id }).then(function () {
                        if (r.suite === "INSTANCE") return O.avancer(r.id, "EN_INSTANCE", { note: "Mis en instance après échec de livraison : " + r.motif, position: A.id });
                        return true;
                    }).always(suivant);
                }
                if (!e) return;
            })();
        });
        $m.on("hidden.bs.modal", function () {
            $m.remove();
            if (fait) { U.toast("Tournée <b>" + U.esc(t.numero) + "</b> clôturée.", "success"); charger(); }
        });
        $m.modal("show");
    }

    /* =================================================================
       Livreurs
       ================================================================= */
    var dtLiv = new CX.DataTable("#dt-livreurs", {
        pageSize: 25, sortKey: "nom", emptyText: "Aucun livreur", emptyIcon: "fa-users",
        columns: [
            { key: "code", title: "Code", render: function (l) { return "<span class='cx-mono'>" + U.esc(l.code || l.numero) + "</span>"; } },
            { key: "nom", title: "Nom", render: function (l) { return "<b>" + U.esc(l.nom) + "</b>"; } },
            { key: "tel", title: "Téléphone", render: function (l) { return "<a href='tel:+237" + U.esc(G.tel(l.tel)) + "'>" + U.esc(l.tel) + "</a>"; } },
            { key: "ville", title: "Agence", sortValue: function (l) { return O.agenceLib(l.agenceId); }, render: function (l) { return U.esc(O.agenceLib(l.agenceId)); } },
            { key: "vehicule", title: "Véhicule" },
            { key: "enCours", title: "En tournée", className: "num", sortValue: function (l) { return $.grep(tous, function (e) { return e.etape === "EN_LIVRAISON" && String(e.livreurId) === String(l.id); }).length; },
                render: function (l) { return $.grep(tous, function (e) { return e.etape === "EN_LIVRAISON" && String(e.livreurId) === String(l.id); }).length; } },
            { key: "statut", title: "Statut", render: function (l) { return O.badge(STATUT_LIVREUR, l.statut); } },
            { key: "act", title: "", sortable: false, render: function () { return "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs' data-edit><i class='fa fa-pencil'></i> Modifier</button>"; } }
        ]
    });
    function modaleLivreur(l) {
        l = l || { nom: "", tel: "", ville: A.ville, agenceId: A.id, vehicule: "Moto", statut: "ACTIF" };
        var corps = "<div class='ox-grid-2'>" +
            O.champ("lv-nom", "Nom et prénom", "<input type='text' class='form-control' id='lv-nom' maxlength='60' value='" + U.esc(l.nom) + "'>", true) +
            O.champ("lv-tel", "Téléphone", "<input type='tel' class='form-control' id='lv-tel' maxlength='14' value='" + U.esc(l.tel) + "'>", true) +
            O.champ("lv-agence", "Agence de rattachement", "<select class='form-control' id='lv-agence'>" + O.optionsAgences(l.agenceId) + "</select>", true) +
            O.champ("lv-vehicule", "Véhicule", "<select class='form-control' id='lv-vehicule'>" + O.options(CX.REF.TYPES_VEHICULE, l.vehicule) + "</select>") +
            O.champ("lv-statut", "Statut", "<select class='form-control' id='lv-statut'>" + $.map(STATUT_LIVREUR, function (v, k) { return "<option value='" + k + "'" + (k === l.statut ? " selected" : "") + ">" + v.label + "</option>"; }).join("") + "</select>") +
            "</div>";
        var $m = O.modale("ox-livreur", l.id ? "Modifier le livreur" : "Nouveau livreur", "fa-motorcycle", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='lv-ok'><i class='fa fa-check'></i> Enregistrer</button>");
        $m.on("click", "#lv-ok", function () {
            O.effacerErreurs($m);
            var nom = $.trim($("#lv-nom").val()), tel = G.tel($("#lv-tel").val()), ag = O.agence($("#lv-agence").val());
            if (nom.length < 3) return O.erreurChamp($m, "#lv-nom", "Nom obligatoire.");
            if (tel.length !== 9) return O.erreurChamp($m, "#lv-tel", "Numéro à 9 chiffres.");
            var o = $.extend({}, l, { nom: nom, tel: G.telFmt(tel), ville: ag.ville, agenceId: ag.id, vehicule: $("#lv-vehicule").val(), statut: $("#lv-statut").val() });
            if (!o.id) {
                var n = $.grep(livreurs, function (x) { return x.ville === ag.ville; }).length + 1;
                o.code = o.numero = "LIV-" + CX.REF.villeCode(ag.ville) + "-" + ("0" + n).slice(-2);
            }
            // TODO API : POST /exploitation/livreurs  ou  PUT /exploitation/livreurs/{id}
            CX.api.save("livreurs", o).done(function () { $m.modal("hide"); U.toast("Livreur enregistré.", "success"); charger(); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); });
        $m.modal("show");
    }

    /* =================================================================
       Chargement / rendu
       ================================================================= */
    function rendre() {
        $("#onglets a").removeClass("active").filter("[data-tab='" + onglet + "']").addClass("active");
        $.each(["alivrer", "tournees", "cloturees", "livreurs"], function (_, k) { $("#vue-" + k).toggleClass("cx-hidden", k !== onglet); });
        if (onglet === "alivrer") rendreALivrer();
        if (onglet === "tournees" || onglet === "cloturees") rendreTournees();
        if (onglet === "livreurs") dtLiv.setRows($.grep(livreurs, function (l) { return l.ville === A.ville; }));
    }
    function charger() {
        // TODO API : GET /exploitation/tournees?agence={id}  et  GET /exploitation/livreurs?ville=
        return $.when(O.charger(), CX.api.list("tournees"), CX.api.list("livreurs")).done(function (r1, t, l) {
            tous = r1[0]; f = O.files(r1[0], r1[1]);
            tournees = $.grep(t, function (x) { return O.estMoi(x.agenceId); });
            livreurs = l;
            var ids = {}; $.each(f.aLivrer, function (_, e) { ids[e.id] = true; });
            $.each($.extend({}, sel), function (id) { if (!ids[id]) delete sel[id]; });
            var cur = $("#t-livreur").val();
            var la = livreursAgence(false);
            $("#t-livreur").html("<option value=''>Choisir un livreur…</option>" + $.map(la, function (x) {
                var n = $.grep(f.enLivraison, function (e) { return String(e.livreurId) === String(x.id); }).length;
                return "<option value='" + x.id + "'>" + U.esc(x.nom + " · " + x.vehicule + (n ? " (" + n + " en cours)" : "")) + "</option>";
            }).join("")).val(cur || "");
            var zones = {}; $.each(f.aLivrer, function (_, e) { zones[e.livraison.zone || ""] = true; });
            var cz = $("#f-zone").val();
            $("#f-zone").html("<option value=''>Toutes</option>" + $.map(zones, function (_, z) { return "<option value='" + U.esc(z) + "'>" + U.esc(zoneLib(z)) + "</option>"; }).join("")).val(cz || "");
            var enCours = $.grep(tournees, function (x) { return x.statut === "EN_COURS"; });
            $("#n-alivrer").text(f.aLivrer.length); $("#n-tournees").text(enCours.length);
            $("#n-cloturees").text(tournees.length - enCours.length); $("#n-livreurs").text(livreursAgence(true).length);
            var livresJour = $.grep(tous, function (e) { return e.etape === "LIVREE" && e.remise && e.remise.mode === "DOMICILE" && O.estMoi(e.remise.agenceId) && String(e.remise.date).substr(0, 10) === U.today(); }).length;
            $("#kpis").html([
                O.kpi("À livrer", f.aLivrer.length, O.pl(f.echecs.length, "nouvelle tentative", "nouvelles tentatives"), "fa-map-marker", "blue"),
                O.kpi("En livraison", f.enLivraison.length, O.pl(enCours.length, "tournée en cours", "tournées en cours"), "fa-motorcycle", "orange"),
                O.kpi("Livrés aujourd'hui", livresJour, "à domicile", "fa-check-circle", "green"),
                O.kpi("Livreurs actifs", la.length, "à " + G.villeNom(A.ville), "fa-users", "purple")
            ].join(""));
            rendre();
        });
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("#onglets").on("click", "a", function () { onglet = $(this).data("tab"); if (window.history.replaceState) window.history.replaceState(null, "", onglet === "alivrer" ? window.location.pathname : "#" + onglet); rendre(); });
    $("#zones").on("change", "input[data-check]", function () { var id = $(this).closest("tr").data("id"); if (this.checked) sel[id] = true; else delete sel[id]; rendreALivrer(); });
    $("#zones").on("change", "input[data-check-groupe]", function () {
        var on = this.checked;
        $(this).closest(".ox-groupe").find("tbody tr").each(function () { var id = $(this).data("id"); if (on) sel[id] = true; else delete sel[id]; });
        rendreALivrer();
    });
    $("#zones").on("click", "[data-fiche]", function (ev) { ev.preventDefault(); O.fiche($(this).closest("tr").data("id"), { onChange: charger }); });
    $("#f-zone").on("change", rendreALivrer);
    $("#q").on("input", U.debounce(rendreALivrer, 150));
    $("#t-livreur").on("change", majSelection);
    $("#btn-vider").on("click", function () { sel = {}; rendreALivrer(); });
    $("#btn-tournee").on("click", function () {
        var s = selection(), l = $.grep(livreurs, function (x) { return String(x.id) === $("#t-livreur").val(); })[0];
        if (!s.length || !l) return;
        var $b = $(this); U.busy($b, true);
        var t = {
            numero: O.numeroTournee(U.today()), date: U.today(), heure: $("#t-heure").val() || "", agenceId: A.id, ville: A.ville, agence: A.nom,
            livreurId: l.id, livreurNom: l.nom, vehicule: l.vehicule, expeditionIds: [], statut: "EN_COURS", resultats: {},
            historique: [{ date: U.now(), user: CX.CONFIG.USER.nom, action: "Tournée constituée" }]
        };
        // TODO API : POST /exploitation/tournees  { livreurId, heure, expeditionIds[] }
        CX.api.save("tournees", t).then(function (tt) {
            return O.avancerLot($.map(s, function (e) { return e.id; }), "EN_LIVRAISON", { note: "Tournée " + tt.numero + " · " + l.nom, position: A.id, patch: { tourneeId: tt.id, livreurId: l.id } })
                .then(function (ok, ko) {
                    tt.expeditionIds = $.map(ok, function (e) { return e.id; });
                    return CX.api.save("tournees", tt).then(function (t2) { return { t: t2, ko: ko }; });
                });
        }).done(function (r) {
            sel = {};
            U.toast("Tournée <b>" + U.esc(r.t.numero) + "</b> constituée : " + O.pl(r.t.expeditionIds.length, "colis confié", "colis confiés") + " à " + U.esc(l.nom) + ".", "success");
            if (r.ko.length) U.toast(U.esc(r.ko.join(" · ")), "warning");
            onglet = "tournees";
            charger().done(function () { feuille(r.t); });
        }).always(function () { U.busy($b, false); });
    });
    $("#tournees, #dt-cloturees").on("click", "[data-feuille]", function () {
        var id = $(this).closest("[data-t]").data("t") || $(this).closest("tr").data("id"), t = $.grep(tournees, function (x) { return String(x.id) === String(id); })[0];
        if (t) feuille(t);
    });
    $("#tournees").on("click", "[data-cloturer]", function () {
        var id = $(this).closest("[data-t]").data("t"), t = $.grep(tournees, function (x) { return String(x.id) === String(id); })[0];
        if (t) cloturer(t);
    });
    $("#btn-livreur").on("click", function () { modaleLivreur(null); });
    $("#dt-livreurs").on("click", "[data-edit]", function () {
        var id = $(this).closest("tr").data("id"), l = $.grep(livreurs, function (x) { return String(x.id) === String(id); })[0];
        modaleLivreur(l);
    });
    $("#btn-refresh").on("click", function () { charger(); });

    var h = (window.location.hash || "").replace("#", "");
    if (h === "tournees" || h === "cloturees" || h === "livreurs") onglet = h;
    charger();
});

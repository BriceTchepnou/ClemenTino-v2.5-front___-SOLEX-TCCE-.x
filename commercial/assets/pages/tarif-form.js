/* =====================================================================
   Commercial · Éditeur de grille tarifaire (tarif-form.html)
   ---------------------------------------------------------------------
   Paramètres d'URL :
     ?id=3                    modification d'une grille
     ?type=CLIENT&client=1    création pré-remplie (type + client affecté)
     #simulateur              ouvre directement le simulateur
   La grille est lue depuis le formulaire à chaque saisie (lireGrille())
   et passée au moteur CX.tarifs.calculer() pour le simulateur de droite :
   ce qui est simulé est exactement ce qui sera enregistré.
   Chaque règle est une carte (.tf-regle) ; ses champs portent data-r
   (périmètre), data-p (paramètre simple) ou sont dans une sous-table
   data-table (tranches / paliers / dégressif), lignes data-c.
   ===================================================================== */
$(function () {
    var U = CX.util, T = CX.tarifs, REF = CX.REF, today = U.today();
    var $form = $("#f-grille");
    var editId = U.queryParam("id");

    var state = {
        grille: null,      // grille chargée (modification)
        tente: false,      // tentative d'enregistrement -> on montre toutes les erreurs
        dirty: false,
        saving: false,
        uid: 0,
        errs: []
    };
    var clients = CX.api.clientsSync();
    var groupes = CX.api.listSync("groupesClients");

    /* =================================================================
       Listes
       ================================================================= */
    function optVilles(vide) {
        return (vide != null ? "<option value=''>" + vide + "</option>" : "") + $.map(REF.VILLES, function (v) {
            return "<option value='" + v.nom + "'>" + U.esc(T.villeLabel(v.nom)) + "</option>";
        }).join("");
    }
    function optZones() {
        return $.map(T.ZONES, function (z) { return "<option value='" + z.code + "'>" + U.esc(z.label) + "</option>"; }).join("");
    }
    $("#tva-taux").text(U.fmt(CX.CONFIG.TVA, 2) + " %");

    /* Grilles de base possibles (toutes sauf elle-même) */
    function remplirBases() {
        var cur = $("#baseId").val();
        var autres = $.grep(CX.api.listSync("tarifaires"), function (g) { return String(g.id) !== String(editId) && g.statut !== "ARCHIVEE"; });
        $("#baseId").html("<option value=''>Aucune (grille autonome)</option>" + $.map(autres, function (g) {
            return "<option value='" + g.id + "'>" + U.esc(g.code + " · " + g.nom) + (g.statut !== "ACTIVE" ? " (" + T.STATUTS_GRILLE[g.statut].label.toLowerCase() + ")" : "") + "</option>";
        }).join(""));
        if (cur) $("#baseId").val(cur);
    }
    remplirBases();

    $("#affClients").html($.map(clients, function (c) {
        return "<option value='" + c.id + "'>" + U.esc(c.raisonSociale) + " (" + U.esc(c.code) + ")</option>";
    }).join("")).select2({ width: "100%", placeholder: "Choisir un ou plusieurs clients", closeOnSelect: false });
    $("#affGroupes").html($.map(groupes, function (g) {
        return "<option value='" + g.id + "'>" + U.esc(g.nom) + " (" + (g.clientIds || []).length + " clients)</option>";
    }).join("")).select2({ width: "100%", placeholder: "Choisir un ou plusieurs groupes", closeOnSelect: false });

    /* Menu « Selon un modèle » */
    $("#menu-modeles").html($.map(T.MODELES, function (m, code) {
        return "<li><a href='#' data-add-modele='" + code + "'><i class='fa " + m.icon + "'></i> <b>" + U.esc(m.label) + "</b><br><small class='cx-muted' style='margin-left:22px'>" + U.esc(m.desc) + "</small></a></li>";
    }).join(""));

    /* =================================================================
       Suppléments
       ================================================================= */
    function natureLigneHtml(s) {
        s = $.extend({ nature: "", mode: "PCT", valeur: "" }, s);
        return "<tr><td><select class='form-control' data-sn='nature'><option value=''>—</option>" + $.map(REF.NATURES_COLIS, function (n) {
            return "<option" + (n === s.nature ? " selected" : "") + ">" + U.esc(n) + "</option>";
        }).join("") + "</select></td>" +
            "<td><select class='form-control' data-sn='mode'><option value='PCT'" + (s.mode === "PCT" ? " selected" : "") + ">% du transport</option>" +
            "<option value='FIXE'" + (s.mode === "FIXE" ? " selected" : "") + ">F par colis</option></select></td>" +
            "<td><input type='text' class='form-control tf-num' data-sn='valeur' inputmode='decimal' value='" + U.esc(s.valeur) + "'></td>" +
            "<td><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-del-nature title='Retirer'><i class='fa fa-trash-o'></i></button></td></tr>";
    }
    function remplirSupplements(s) {
        s = s || T.supplementsVides();
        $("#supp-natures").html($.map(s.natures || [], natureLigneHtml).join(""));
        $("#supp-livraison").html($.map(REF.ZONES_LIVRAISON, function (z) {
            var l = $.grep(s.livraison || [], function (x) { return x.zone === z.code; })[0];
            return "<tr><td>" + U.esc(z.nom) + "<div class='cx-cell-sub'>réseau : " + U.money(z.prix) + "</div></td>" +
                "<td><input type='text' class='form-control tf-num' data-zone='" + z.code + "' inputmode='numeric' placeholder='" + z.prix + "' value='" + (l && l.prix ? l.prix : "") + "'></td></tr>";
        }).join(""));
        var ex = s.express || {}, em = s.emballage || {};
        $("#expressActif").prop("checked", !!ex.actif); $("#expressMode").val(ex.mode || "PCT"); $("#expressValeur").val(ex.valeur || "");
        $("#emballageActif").prop("checked", !!em.actif); $("#emballageMode").val(em.mode || "PAR_COLIS"); $("#emballageValeur").val(em.valeur || "");
    }
    function lireSupplements() {
        return {
            natures: $("#supp-natures tr").map(function () {
                var $r = $(this);
                return { nature: $r.find("[data-sn='nature']").val(), mode: $r.find("[data-sn='mode']").val(), valeur: U.num($r.find("[data-sn='valeur']").val()) };
            }).get(),
            livraison: $("#supp-livraison [data-zone]").map(function () {
                var v = $.trim($(this).val());
                return v === "" ? null : { zone: $(this).data("zone"), prix: U.num(v) };
            }).get(),
            express: { actif: $("#expressActif").is(":checked"), mode: $("#expressMode").val(), valeur: U.num($("#expressValeur").val()) },
            emballage: { actif: $("#emballageActif").is(":checked"), mode: $("#emballageMode").val(), valeur: U.num($("#emballageValeur").val()) }
        };
    }
    $("#btn-add-nature").on("click", function () { $("#supp-natures").append(natureLigneHtml()); majTout(); });
    $("#supp-natures").on("click", "[data-del-nature]", function () { $(this).closest("tr").remove(); majTout(); });

    /* =================================================================
       Règles : rendu d'une carte
       ================================================================= */
    function pills(type, name, liste, choisis, uid) {
        return $.map(liste, function (it) {
            var v = it.v, lab = it.l;
            return "<label class='cx-pill'><input type='" + type + "' " + name + (type === "radio" ? "='" + uid + "'" : "") +
                " value='" + U.esc(v) + "'" + (type === "radio" ? (String(choisis) === String(v) ? " checked" : "") : ($.inArray(v, choisis || []) >= 0 ? " checked" : "")) +
                "><span>" + U.esc(lab) + "</span></label>";
        }).join("");
    }
    function regleHtml(r) {
        var uid = ++state.uid, p = r.perimetre || {};
        var trajets = [{ v: "", l: "Tous trajets" }].concat($.map(T.TRAJETS, function (t, k) { return { v: k, l: t.label }; }));
        var envois = $.map(T.TYPES_ENVOI, function (t, k) { return { v: k, l: t.label }; });
        var natures = $.map(REF.NATURES_COLIS, function (n) { return { v: n, l: n }; });
        var modeles = $.map(T.MODELES, function (m, k) {
            return "<label class='cx-seg-item'><input type='radio' name='mod-" + uid + "' value='" + k + "'" + (k === r.modele ? " checked" : "") + ">" +
                "<span><i class='fa " + m.icon + "'></i><b>" + U.esc(m.label) + "</b><small>" + U.esc(m.desc) + "</small></span></label>";
        }).join("");
        return "<div class='tf-regle' data-uid='" + uid + "' data-id='" + U.esc(r.id || "") + "'>" +
            "<div class='tf-regle-head'>" +
            "<span class='tf-regle-num'>Règle 1</span>" +
            "<div class='tf-libelle'><input type='text' class='form-control' data-r='libelle' maxlength='80' placeholder='Libellé (ex. : National · colis)' value='" + U.esc(r.libelle || "") + "' aria-label='Libellé de la règle'></div>" +
            "<div class='tf-regle-tools'>" +
            "<label class='cx-switch'><input type='checkbox' data-r='actif'" + (r.actif !== false ? " checked" : "") + "><span class='cx-switch-track'></span><span class='cx-switch-text'><b>Active</b></span></label>" +
            "<label class='cx-switch' data-toggle='tooltip' title='La règle s&#39;ajoute à la règle principale (ex. assurance)'><input type='checkbox' data-r='cumulable'" + (r.cumulable ? " checked" : "") + "><span class='cx-switch-track'></span><span class='cx-switch-text'><b>Cumulable</b></span></label>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-act='haut' title='Monter'><i class='fa fa-arrow-up'></i></button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-act='bas' title='Descendre'><i class='fa fa-arrow-down'></i></button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-act='dupliquer' title='Dupliquer'><i class='fa fa-clone'></i></button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-act='supprimer' title='Supprimer'><i class='fa fa-trash-o'></i></button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-act='replier' title='Replier / déplier'><i class='fa fa-chevron-up'></i></button>" +
            "</div>" +
            "<div class='tf-regle-resume'></div>" +
            "</div>" +
            "<div class='tf-regle-body'>" +
            "<div class='cx-block'><div class='cx-block-title'><i class='fa fa-crosshairs'></i> Périmètre</div>" +
            "<div class='cx-field'><label class='cx-label'>Trajet</label><div class='cx-pills'>" + pills("radio", "name", trajets, p.typeTrajet || "", "tt-" + uid) + "</div></div>" +
            "<div class='row' data-bloc='villes'>" +
            "<div class='col-sm-5'><div class='cx-field'><label class='cx-label'>Villes de départ <span class='cx-opt'>(vide = toutes)</span></label>" +
            "<select class='form-control tf-s2' data-r='villesDep' multiple>" + optVilles() + "</select></div></div>" +
            "<div class='col-sm-5'><div class='cx-field'><label class='cx-label'>Villes d'arrivée <span class='cx-opt'>(vide = toutes)</span></label>" +
            "<select class='form-control tf-s2' data-r='villesDest' multiple>" + optVilles() + "</select></div></div>" +
            "<div class='col-sm-2'><label class='cx-switch' style='margin-top:26px' data-toggle='tooltip' title='Même prix dans les deux sens'><input type='checkbox' data-r='bidirectionnel'" + (p.bidirectionnel !== false ? " checked" : "") + "><span class='cx-switch-track'></span><span class='cx-switch-text'><b>⇄</b></span></label></div>" +
            "</div>" +
            "<div class='cx-field cx-hidden' data-bloc='zones'><label class='cx-label'>Zones de destination <span class='cx-opt'>(vide = toutes)</span></label>" +
            "<select class='form-control tf-s2' data-r='zones' multiple>" + optZones() + "</select></div>" +
            "<div class='row'><div class='col-sm-6'><div class='cx-field'><label class='cx-label'>Types d'envoi <span class='cx-opt'>(aucun = tous)</span></label><div class='cx-pills'>" +
            pills("checkbox", "data-te", envois, p.typesEnvoi || []) + "</div></div></div>" +
            "<div class='col-sm-6'><div class='cx-field'><label class='cx-label'>Poids taxable <span class='cx-opt'>(facultatif : plus de … et jusqu'à …)</span></label>" +
            "<div class='tf-dims'><span>&gt;</span><input type='text' class='form-control tf-num' data-r='poidsMin' inputmode='decimal' value='" + U.esc(p.poidsMin || "") + "' aria-label='Poids minimum'>" +
            "<span>kg et ≤</span><input type='text' class='form-control tf-num' data-r='poidsMax' inputmode='decimal' value='" + U.esc(p.poidsMax || "") + "' aria-label='Poids maximum'><span>kg</span></div></div></div></div>" +
            "<div class='cx-field' style='margin-bottom:0'><label class='cx-label'>Natures <span class='cx-opt'>(aucune = toutes)</span></label><div class='cx-pills'>" +
            pills("checkbox", "data-nat", natures, p.natures || []) + "</div></div>" +
            "</div>" +
            "<p class='cx-section-label' style='margin-top:14px'>Modèle de tarification</p>" +
            "<div class='cx-seg tf-modeles-seg'>" + modeles + "</div>" +
            "<div class='tf-editeur'></div>" +
            "<div class='tf-phrase' data-phrase></div>" +
            "<div class='tf-apercu' data-apercu></div>" +
            "<div class='tf-regle-errs'></div>" +
            "</div></div>";
    }

    /* Éditeur propre au modèle */
    function champ(label, p, val, suffixe, col, help) {
        return "<div class='col-sm-" + (col || 3) + "'><div class='cx-field'><label class='cx-label'>" + label + "</label>" +
            "<div class='input-group'><input type='text' class='form-control tf-num' data-p='" + p + "' inputmode='decimal' value='" + U.esc(val == null ? "" : val) + "'>" +
            "<span class='input-group-addon'>" + suffixe + "</span></div>" + (help ? "<span class='cx-help'>" + help + "</span>" : "") + "</div></div>";
    }
    function selectPas(p, val, options) {
        return "<select class='form-control' data-p='" + p + "'>" + $.map(options, function (o) {
            return "<option value='" + o[0] + "'" + (String(o[0]) === String(val) ? " selected" : "") + ">" + o[1] + "</option>";
        }).join("") + "</select>";
    }
    var PAS = [[0.1, "0,1 kg"], [0.5, "0,5 kg"], [1, "1 kg"], [5, "5 kg"], [10, "10 kg"]];
    function sousTable(nom, colonnes, lignes) {
        return "<table class='tf-sous-table' data-table='" + nom + "'><thead><tr>" + $.map(colonnes, function (c) {
            return "<th" + (c.w ? " style='width:" + c.w + "'" : "") + ">" + c.t + "</th>";
        }).join("") + "<th style='width:40px'></th></tr></thead><tbody>" + $.map(lignes, function (l) { return ligneSousTable(colonnes, l); }).join("") +
            "</tbody></table><button type='button' class='cx-btn cx-btn-link cx-btn-sm' data-add-row='" + nom + "'><i class='fa fa-plus'></i> Ajouter une ligne</button>";
    }
    function ligneSousTable(colonnes, l) {
        l = l || {};
        return "<tr>" + $.map(colonnes, function (c) {
            if (c.calc) return "<td class='cx-muted' data-calc='" + c.calc + "'></td>";
            return "<td><div class='input-group'><input type='text' class='form-control tf-num' data-c='" + c.k + "' inputmode='decimal' value='" +
                U.esc(l[c.k] == null ? "" : l[c.k]) + "'" + (c.ph ? " placeholder='" + c.ph + "'" : "") + "><span class='input-group-addon'>" + c.u + "</span></div></td>";
        }).join("") + "<td><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-del-row title='Retirer'><i class='fa fa-times'></i></button></td></tr>";
    }
    var COLS = {
        tranches: [{ t: "De", calc: "de", w: "90px" }, { t: "Jusqu'à", k: "max", u: "kg" }, { t: "Prix forfaitaire", k: "prix", u: "F" }],
        paliers: [{ t: "De", calc: "de", w: "90px" }, { t: "Jusqu'à", k: "max", u: "kg", ph: "et au-delà" }, { t: "Prix au kg", k: "prixKg", u: "F/kg" }],
        degressif: [{ t: "À partir de", k: "des", u: "pièces" }, { t: "Prix unitaire", k: "prix", u: "F" }]
    };
    function editeurHtml(modele, pa, uid) {
        pa = pa || T.defaultParams(modele);
        switch (modele) {
            case "TRANCHES":
                return sousTable("tranches", COLS.tranches, pa.tranches || []) +
                    "<div class='row' style='margin-top:8px'>" + champ("Au-delà de la dernière tranche", "auDelaParKg", pa.auDelaParKg, "F", 5, "0 = prix de la dernière tranche") +
                    "<div class='col-sm-3'><div class='cx-field'><label class='cx-label'>par</label>" + selectPas("auDelaPas", pa.auDelaPas || 1, PAS) + "</div></div></div>";
            case "INCREMENTIEL":
                return "<div class='row'>" + champ("Prix de base", "prixBase", pa.prixBase, "F") + champ("jusqu'à", "poidsBase", pa.poidsBase, "kg") +
                    champ("puis + par pas", "increment", pa.increment, "F") +
                    "<div class='col-sm-3'><div class='cx-field'><label class='cx-label'>Pas de l'incrément</label>" + selectPas("pas", pa.pas || 1, PAS) + "</div></div></div>";
            case "PALIERS":
                return "<div class='cx-seg cx-seg-soft' style='margin-bottom:10px'>" +
                    "<label class='cx-seg-item'><input type='radio' name='pm-" + uid + "' data-p='mode' value='CUMULATIF'" + (pa.mode !== "ATTEINT" ? " checked" : "") + "><span><b>Cumulatif</b><small>Chaque palier facturé à son prix (comme des tranches d'impôt)</small></span></label>" +
                    "<label class='cx-seg-item'><input type='radio' name='pm-" + uid + "' data-p='mode' value='ATTEINT'" + (pa.mode === "ATTEINT" ? " checked" : "") + "><span><b>Au palier atteint</b><small>Tout le poids au prix du palier atteint</small></span></label></div>" +
                    sousTable("paliers", COLS.paliers, pa.paliers || []) +
                    "<div class='row' style='margin-top:8px'>" + champ("Prise en charge", "priseEnCharge", pa.priseEnCharge, "F", 4) + champ("Minimum", "minimum", pa.minimum, "F", 4) + "</div>";
            case "AU_KG":
                return "<div class='row'>" + champ("Prix au kg", "prixKg", pa.prixKg, "F/kg", 4) + champ("Minimum", "minimum", pa.minimum, "F", 4) +
                    "<div class='col-sm-4'><div class='cx-field'><label class='cx-label'>Poids arrondi au</label>" +
                    selectPas("pasKg", pa.pasKg == null ? 1 : pa.pasKg, [[0, "poids exact"]].concat(PAS)) + "</div></div></div>";
            case "PIECE":
                return "<div class='row'>" + champ("Prix à la pièce", "prix", pa.prix, "F", 4, "pli, enveloppe, document ou colis") + "</div>" +
                    "<div class='cx-label'>Dégressif selon la quantité <span class='cx-opt'>(facultatif)</span></div>" + sousTable("degressif", COLS.degressif, pa.degressif || []);
            case "AD_VALOREM":
                return "<div class='row'>" + champ("Taux", "taux", pa.taux, "% de la valeur", 5) + champ("Minimum", "minimum", pa.minimum, "F", 4) + "</div>" +
                    "<div class='cx-help'>Calculé sur la valeur déclarée. Cochez « Cumulable » pour l'ajouter au transport (assurance).</div>";
        }
        return "";
    }

    function ajouterRegle(r, $apres) {
        var $c = $(regleHtml(r));
        if ($apres && $apres.length) $c.insertAfter($apres); else $c.appendTo("#regles");
        var p = r.perimetre || {};
        $c.find("[data-r='villesDep']").val(p.villesDep || []);
        $c.find("[data-r='villesDest']").val(p.villesDest || []);
        $c.find("[data-r='zones']").val(p.zones || []);
        $c.find(".tf-s2").each(function () {
            $(this).select2({ width: "100%", placeholder: "Toutes", closeOnSelect: false });
        });
        $c.data("cache", {}).data("modele", r.modele);
        $c.find(".tf-editeur").html(editeurHtml(r.modele, r.params, $c.data("uid")));
        majRegle($c);
        numeroter();
        return $c;
    }
    function numeroter() {
        var $all = $("#regles .tf-regle");
        $all.each(function (i) { $(this).find(".tf-regle-num").text("Règle " + (i + 1)); });
        $("#regles-vide").toggleClass("cx-hidden", $all.length > 0);
    }

    /* Lecture d'une carte de règle */
    function lireParams($ed, modele) {
        var pa = {};
        $ed.find("[data-p]").each(function () {
            var $f = $(this), k = $f.data("p");
            if ($f.is(":radio")) { if ($f.is(":checked")) pa[k] = $f.val(); return; }
            pa[k] = U.num($f.val());
        });
        $ed.find("[data-table]").each(function () {
            var nom = $(this).data("table");
            pa[nom] = $(this).find("tbody tr").map(function () {
                var o = {};
                $(this).find("[data-c]").each(function () {
                    var v = $.trim($(this).val());
                    o[$(this).data("c")] = v === "" ? "" : U.num(v);
                });
                return o;
            }).get();
        });
        if (modele === "PALIERS" && !pa.mode) pa.mode = "CUMULATIF";
        return pa;
    }
    function lireRegle($c) {
        var uid = $c.data("uid"), modele = $c.find("input[name='mod-" + uid + "']:checked").val();
        function v(k) { return $.trim($c.find("[data-r='" + k + "']").val() || ""); }
        return {
            id: $c.data("id") || ("r" + uid + "-" + new Date().getTime().toString(36)),
            libelle: v("libelle"),
            actif: $c.find("[data-r='actif']").is(":checked"),
            cumulable: $c.find("[data-r='cumulable']").is(":checked"),
            perimetre: {
                typeTrajet: $c.find("input[name='tt-" + uid + "']:checked").val() || "",
                villesDep: $c.find("[data-r='villesDep']").val() || [],
                villesDest: $c.find("[data-r='villesDest']").val() || [],
                bidirectionnel: $c.find("[data-r='bidirectionnel']").is(":checked"),
                zones: $c.find("[data-r='zones']").val() || [],
                typesEnvoi: $c.find("[data-te]:checked").map(function () { return this.value; }).get(),
                natures: $c.find("[data-nat]:checked").map(function () { return this.value; }).get(),
                poidsMin: v("poidsMin") === "" ? "" : U.num(v("poidsMin")),
                poidsMax: v("poidsMax") === "" ? "" : U.num(v("poidsMax"))
            },
            modele: modele,
            params: lireParams($c.find(".tf-editeur"), modele)
        };
    }

    /* Mise à jour visuelle d'une carte : résumé, phrase, aperçu des prix */
    function majRegle($c) {
        var r = lireRegle($c), tt = r.perimetre.typeTrajet;
        var inter = tt === "REGIONAL" || tt === "INTERNATIONAL";
        $c.find("[data-bloc='villes']").toggleClass("cx-hidden", inter);
        $c.find("[data-bloc='zones']").toggleClass("cx-hidden", !inter);
        $c.toggleClass("inactive", !r.actif);
        $c.find(".tf-regle-resume").html("<b>" + U.esc(T.MODELES[r.modele].label) + "</b> · " + U.esc(T.libPerimetre(r)) + (r.cumulable ? " · <b>cumulable</b>" : ""));
        $c.find("[data-phrase]").html("<i class='fa fa-info-circle'></i> " + U.esc(T.libModele(r)));
        /* bornes « De » des sous-tables */
        $c.find("[data-table='tranches'] tbody tr, [data-table='paliers'] tbody tr").each(function (i, tr) {
            var prev = i ? U.num($(tr).prev().find("[data-c='max']").val()) : 0;
            $(tr).find("[data-calc='de']").text(U.fmt(prev, prev % 1 ? 1 : 0) + " kg");
        });
        /* aperçu : prix pour quelques poids */
        var poids = r.modele === "PIECE" ? [1, 5, 10, 20, 50, 100] : (r.modele === "AD_VALOREM" ? [50000, 100000, 250000, 1000000] : [0.5, 1, 2, 5, 10, 20, 30, 50]);
        var errs = T.verifierRegle(r);
        $c.find("[data-apercu]").html(errs.length ? "" : $.map(poids, function (p) {
            var px = r.modele === "PIECE" ? T.prixModele(r, 0, p, 0) : (r.modele === "AD_VALOREM" ? T.prixModele(r, 0, 1, p) : T.prixModele(r, p, 1, 0));
            var lib = r.modele === "PIECE" ? p + " pièce" + (p > 1 ? "s" : "") : (r.modele === "AD_VALOREM" ? U.fmt(p) + " F" : U.fmt(p, p % 1 ? 1 : 0) + " kg");
            return "<span>" + lib + "<b>" + U.money(px.total) + "</b></span>";
        }).join(""));
    }

    /* Évènements des règles */
    var $regles = $("#regles");
    $regles.on("change", "input[name^='mod-']", function () {
        var $c = $(this).closest(".tf-regle"), uid = $c.data("uid"), cache = $c.data("cache") || {};
        var ancien = $c.data("modele");
        if (ancien) cache[ancien] = lireParams($c.find(".tf-editeur"), ancien);
        var m = $(this).val();
        $c.data("modele", m);
        $c.find(".tf-editeur").html(editeurHtml(m, cache[m], uid));
        if (m === "AD_VALOREM") $c.find("[data-r='cumulable']").prop("checked", true);
        majRegle($c); majTout();
    });
    $regles.on("click", "[data-add-row]", function () {
        var nom = $(this).data("add-row"), $t = $(this).siblings("[data-table='" + nom + "']").find("tbody");
        var der = $t.find("tr:last [data-c='max']"), base = {};
        if (nom === "tranches" && der.length) base = { max: U.num(der.val()) * 2 || "" };
        $t.append(ligneSousTable(COLS[nom], base));
        $t.find("tr:last input:first").focus();
        majRegle($(this).closest(".tf-regle")); majTout();
    });
    $regles.on("click", "[data-del-row]", function () {
        var $c = $(this).closest(".tf-regle");
        $(this).closest("tr").remove(); majRegle($c); majTout();
    });
    $regles.on("click", "[data-act]", function () {
        var $c = $(this).closest(".tf-regle"), act = $(this).data("act");
        if (act === "haut") $c.insertBefore($c.prev(".tf-regle"));
        if (act === "bas") $c.insertAfter($c.next(".tf-regle"));
        if (act === "dupliquer") {
            var r = lireRegle($c); r.id = null; r.libelle = (r.libelle || "Règle") + " (copie)";
            ajouterRegle(r, $c);
        }
        if (act === "supprimer") {
            U.confirm({ title: "Supprimer la règle", message: "La règle <b>" + U.esc(lireRegle($c).libelle || "sans libellé") + "</b> sera retirée de la grille.", okText: "Supprimer", okClass: "cx-btn-danger" })
                .done(function () { $c.find(".tf-s2").select2("destroy"); $c.remove(); numeroter(); majTout(); });
            return;
        }
        if (act === "replier") {
            $c.toggleClass("collapsed");
            $(this).find(".fa").toggleClass("fa-chevron-up", !$c.hasClass("collapsed")).toggleClass("fa-chevron-down", $c.hasClass("collapsed"));
        }
        numeroter(); majTout();
    });
    $regles.on("input change", "input, select", U.debounce(function (e) {
        var $c = $(e.target).closest(".tf-regle");
        if ($c.length) majRegle($c);
    }, 80));
    $(document).on("click", "[data-add-modele]", function (e) {
        e.preventDefault();
        var r = T.nouvelleRegle($(this).data("add-modele"));
        var $c = ajouterRegle(r);
        $("html, body").animate({ scrollTop: $c.offset().top - 90 }, 200);
        $c.find("[data-r='libelle']").focus();
        majTout();
    });

    /* =================================================================
       Lecture complète de la grille
       ================================================================= */
    function lireGrille() {
        var g = state.grille ? T.clone(state.grille) : T.nouvelleGrille("CLIENT");
        $.extend(g, {
            nom: $.trim($("#nom").val()), description: $.trim($("#description").val()),
            type: $("input[name='type']:checked").val() || "CLIENT",
            du: $("#du").val(), au: $("#au").val(), devise: $("#devise").val(),
            baseId: $("#baseId").val() ? Number($("#baseId").val()) : null,
            remiseBasePct: U.num($("#remiseBasePct").val()),
            heriterSupplements: !!$("#baseId").val() && $("#heriterSupplements").is(":checked"),
            diviseurVol: U.num($("#diviseurVol").val()) || T.DIVISEUR_DEFAUT,
            minimum: U.num($("#minimum").val()),
            arrondi: U.num($("#arrondi").val()) || 1, arrondiMode: $("#arrondiMode").val(),
            tvaIncluse: $("#tvaIncluse").is(":checked"),
            regles: $("#regles .tf-regle").map(function () { return lireRegle($(this)); }).get(),
            supplements: lireSupplements(),
            affectation: {
                clientIds: $.map($("#affClients").val() || [], Number),
                groupeIds: $.map($("#affGroupes").val() || [], Number)
            }
        });
        if (g.type === "STANDARD") g.affectation = { clientIds: [], groupeIds: [] };
        return g;
    }

    /* =================================================================
       Contrôles
       ================================================================= */
    function controle(g, activation) {
        var errs = [];
        function err(msg, field, $card) { errs.push({ msg: msg, field: field, $card: $card }); }
        if (!g.nom) err("Nom de la grille", "nom");
        if (!g.du) err("Date de début de validité", "du");
        if (g.du && g.au && g.au < g.du) err("La date de fin précède la date de début", "au");
        if (g.remiseBasePct < -50 || g.remiseBasePct > 80) err("Remise sur la base entre −50 et 80 %", "remiseBasePct");
        if (!g.regles.length && !g.baseId) err("Au moins une règle, ou une grille de base");
        if (g.baseId) {
            var ch = T.chaineGrilles(g);
            if ($.grep(ch.slice(1), function (x) { return String(x.id) === String(editId); }).length) err("La grille de base dépend de cette grille (boucle)", "baseId");
        }
        $("#regles .tf-regle").each(function (i) {
            var $c = $(this), e = T.verifierRegle(g.regles[i]);
            $.each(e, function (_, m) { err("Règle " + (i + 1) + " : " + m, null, $c); });
        });
        var vus = {};
        $.each(g.supplements.natures, function (i, s) {
            if (!s.nature) err("Supplément " + (i + 1) + " : nature");
            else if (vus[s.nature]) err("Supplément « " + s.nature + " » en double");
            vus[s.nature] = 1;
        });
        if (activation && g.type !== "STANDARD" && !g.affectation.clientIds.length && !g.affectation.groupeIds.length && !contratsDeLaGrille().length) {
            err("Affectez la grille à un client ou à un groupe (ou attachez-la à un contrat) avant de l'activer", "affClients");
        }
        return errs;
    }
    function contratsDeLaGrille() {
        return editId ? $.grep(CX.api.listSync("contrats"), function (c) { return String(c.tarifaireId) === String(editId); }) : [];
    }
    function afficherErreurs(errs) {
        var champs = $.grep(errs, function (e) { return e.field; });
        U.showErrors($form, state.tente ? $.map(champs, function (e) { return { field: e.field, message: e.msg }; }) : []);
        $("#regles .tf-regle").removeClass("has-error").find(".tf-regle-errs").empty();
        if (state.tente) {
            $("#regles .tf-regle").each(function () {
                var $c = $(this), mine = $.grep(errs, function (e) { return e.$card && e.$card[0] === $c[0]; });
                if (mine.length) {
                    $c.addClass("has-error").find(".tf-regle-errs").html("<div class='cx-note cx-note-err' style='margin:0'><i class='fa fa-exclamation-circle'></i><div>" +
                        $.map(mine, function (e) { return U.esc(e.msg); }).join("<br>") + "</div></div>");
                }
            });
        }
        $("#r-nbManq").text(errs.length);
        $("#r-listeManq").html($.map(errs.slice(0, 6), function (e) { return "<li>" + U.esc(e.msg) + "</li>"; }).join("") + (errs.length > 6 ? "<li>… et " + (errs.length - 6) + " autre(s)</li>" : ""));
        $("#r-manquants").toggleClass("cx-hidden", !errs.length || !state.tente);
    }

    /* =================================================================
       Affichage dépendant (type, base, suppléments, affectation)
       ================================================================= */
    function majAffichage(g) {
        var std = g.type === "STANDARD";
        $("#aff-std").toggleClass("cx-hidden", !std);
        $("#aff-bloc").toggleClass("cx-hidden", std);
        var base = g.baseId ? T.grilleParId(g.baseId) : null;
        $("#remiseBasePct").prop("disabled", !base).closest(".cx-field").toggleClass("tf-off", !base);
        $("#lbl-heriter").toggleClass("tf-off", !base);
        var herite = !!base && g.heriterSupplements;
        $("#supp-herites").toggleClass("cx-hidden", !herite);
        $("#supp-base-nom").text(base ? "« " + base.nom + " »" : "");
        $("#supp-body").toggleClass("tf-off", herite);
        $("#validite-info").text(g.du ? "Valable " + T.libValidite(g) : "");
        $("#regles-resume").text(g.regles.length + " règle" + (g.regles.length > 1 ? "s" : "") +
            (base ? " · repli : " + base.code + (g.remiseBasePct ? (g.remiseBasePct > 0 ? " − " : " + ") + U.fmt(Math.abs(g.remiseBasePct), g.remiseBasePct % 1 ? 1 : 0) + " %" : "") : ""));

        /* clients déjà couverts par une autre grille propre / groupe déjà tarifé */
        var autres = $.grep(CX.api.listSync("tarifaires"), function (x) { return String(x.id) !== String(editId) && x.statut === "ACTIVE" && x.type !== "STANDARD"; });
        var conflits = [];
        $.each(g.affectation.clientIds, function (_, cid) {
            $.each(autres, function (_, x) { if ($.inArray(cid, (x.affectation || {}).clientIds || []) >= 0) conflits.push(CX.api.clientNom(cid) + " est déjà affecté à « " + x.nom + " »"); });
        });
        $.each(g.affectation.groupeIds, function (_, gid) {
            var gr = $.grep(groupes, function (x) { return x.id === gid; })[0];
            $.each(autres, function (_, x) { if ($.inArray(gid, (x.affectation || {}).groupeIds || []) >= 0) conflits.push("Le groupe « " + (gr ? gr.nom : gid) + " » est déjà affecté à « " + x.nom + " »"); });
        });
        $("#aff-conflits").html(conflits.length ? "<div class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><div>" +
            $.map(conflits, U.esc).join("<br>") + "<br><small>La grille la plus récente (date de début) est appliquée.</small></div></div>" : "");

        var ctrs = contratsDeLaGrille();
        $("#aff-contrats").html(ctrs.length ? "<hr class='cx-sep'><div class='cx-block-title'>Contrats utilisant cette grille</div>" + $.map(ctrs, function (c) {
            var st = T.statutContrat(c);
            return "<div class='cx-sum-line'><span><a href='contrat-form.html?id=" + c.id + "' class='cx-mono'>" + U.esc(c.numero) + "</a> · " + U.esc(CX.api.clientNom(c.clientId)) +
                " <small>(" + U.toFr(c.du) + " → " + U.toFr(c.au) + ")</small></span>" + T.badge(T.STATUTS_CONTRAT, st) + "</div>";
        }).join("") : "");

        $(".cx-step[data-step='identite']").toggleClass("done", !!(g.nom && g.du));
        $(".cx-step[data-step='base']").toggleClass("done", true);
        $(".cx-step[data-step='regles']").toggleClass("done", !!(g.regles.length || g.baseId) && !$.grep(g.regles, function (r) { return T.verifierRegle(r).length; }).length);
        $(".cx-step[data-step='supplements']").toggleClass("done", herite || g.supplements.natures.length > 0 || g.supplements.express.actif);
        $(".cx-step[data-step='affectation']").toggleClass("done", std || g.affectation.clientIds.length > 0 || g.affectation.groupeIds.length > 0 || ctrs.length > 0);
    }

    /* =================================================================
       Simulateur
       ================================================================= */
    $("#s-villeDep").html(optVilles()).val(CX.CONFIG.USER.ville);
    $("#s-villeDest").html(optVilles()).val("YAOUNDE");
    $("#s-trajet").append($.map(T.TRAJETS, function (t, k) { return "<option value='" + k + "'>" + U.esc(t.label) + "</option>"; }).join(""));
    $("#s-nature").html($.map(REF.NATURES_COLIS, function (n) { return "<option>" + U.esc(n) + "</option>"; }).join(""));
    $("#s-zone").html($.map(REF.ZONES_LIVRAISON, function (z) { return "<option value='" + z.code + "'>" + U.esc(z.nom) + "</option>"; }).join(""));
    $("#s-segEnvoi").html($.map(T.TYPES_ENVOI, function (t, k) {
        return "<label class='cx-seg-item'><input type='radio' name='s-typeEnvoi' value='" + k + "'" + (k === "COLIS" ? " checked" : "") + "><span><i class='fa " + t.icon + "'></i><b>" + U.esc(t.label) + "</b></span></label>";
    }).join(""));
    function majPays() {
        var t = $("#s-trajet").val(), etr = t === "REGIONAL" || t === "INTERNATIONAL";
        $("#s-destVille").toggleClass("cx-hidden", etr);
        $("#s-destPays").toggleClass("cx-hidden", !etr);
        if (etr) {
            var cur = $("#s-pays").val();
            $("#s-pays").html($.map($.grep(T.ZONES, function (z) { return z.trajet === t; }), function (z) {
                return "<optgroup label='" + U.esc(z.label) + "'>" + $.map(z.pays, function (p) { return "<option>" + U.esc(p) + "</option>"; }).join("") + "</optgroup>";
            }).join(""));
            if (cur && $("#s-pays option").filter(function () { return this.value === cur; }).length) $("#s-pays").val(cur);
        }
    }
    function lireSimulation() {
        var t = $("#s-trajet").val(), etr = t === "REGIONAL" || t === "INTERNATIONAL";
        return {
            typeTrajet: t, villeDep: $("#s-villeDep").val(), villeDest: etr ? "" : $("#s-villeDest").val(), paysDest: etr ? $("#s-pays").val() : "",
            typeEnvoi: $("input[name='s-typeEnvoi']:checked").val(), nature: $("#s-nature").val(),
            poids: U.num($("#s-poids").val()), L: U.num($("#s-L").val()), l: U.num($("#s-l").val()), H: U.num($("#s-H").val()),
            nombre: parseInt($("#s-nombre").val(), 10) || 1, valeurDeclaree: U.num($("#s-valeur").val()),
            livraison: $("#s-livraison").val(), zone: $("#s-livraison").val() === "DOMICILE" ? $("#s-zone").val() : "",
            express: $("#s-express").is(":checked"), emballage: $("#s-emballage").is(":checked")
        };
    }
    function simuler(g) {
        var env = lireSimulation(), res = T.calculer(g, env);
        $("#s-zone").prop("disabled", env.livraison !== "DOMICILE");
        $("#s-grilleNom").text(g.code || "");
        $("#s-total").text(U.fmt(res.total));
        $("#s-sub").html(res.regle ? (g.tvaIncluse ? "TTC · soit " + U.money(res.ht) + " HT" : "HT · " + U.money(res.ttc) + " TTC") : "Aucune règle ne couvre cet envoi");
        var tags = [];
        if (res.regle) tags.push("<span class='light'>" + U.esc(res.regle.libelle || T.MODELES[res.regle.modele].label) + "</span>");
        tags.push("<span>" + U.fmt(res.poidsTaxable, res.poidsTaxable % 1 ? 1 : 0) + " kg taxables</span>");
        if (res.regles.length && res.regles[0].niveau > 0) tags.push("<span>via la grille de base</span>");
        $("#s-tags").html(tags.join(""));
        $("#s-detail").html(T.detailHtml(res));
    }

    /* =================================================================
       Recalcul global (débouncé)
       ================================================================= */
    function majTout() {
        var g = lireGrille();
        majAffichage(g);
        var errs = controle(g, false);
        state.errs = errs;
        afficherErreurs(errs);
        simuler(g);
        return g;
    }
    var majDiff = U.debounce(majTout, 120);
    $form.on("input change", "input, select, textarea", function () { state.dirty = true; majDiff(); });
    $("#s-trajet").on("change", majPays);
    $("#affClients, #affGroupes").on("change", function () { state.dirty = true; majDiff(); });

    /* =================================================================
       Enregistrement
       ================================================================= */
    function enregistrer(statut, $btn) {
        if (state.saving) return;
        state.tente = true;
        var g = lireGrille(), errs = controle(g, statut === "ACTIVE");
        afficherErreurs(errs);
        if (errs.length) {
            U.toast(errs.length + " point(s) à corriger avant d'enregistrer.", "error");
            var $f = $form.find(".has-error").first();
            if ($f.length) $("html, body").animate({ scrollTop: $f.offset().top - 120 }, 200);
            return;
        }
        var creation = !state.grille, ancien = state.grille ? state.grille.statut : null;
        g.statut = statut;
        /* une seule grille standard active sur une même période : les autres sont archivées */
        var concurrentes = statut === "ACTIVE" && g.type === "STANDARD" ? $.grep(CX.api.listSync("tarifaires"), function (x) {
            return x.type === "STANDARD" && x.statut === "ACTIVE" && String(x.id) !== String(editId) &&
                (!x.au || !g.du || x.au >= g.du) && (!g.au || !x.du || g.au >= x.du);
        }) : [];
        var suite = concurrentes.length ? U.confirm({
            title: "Grille standard déjà active",
            message: "<p>La grille standard <b>" + U.esc(concurrentes[0].nom) + "</b> est active sur une période qui chevauche celle-ci.</p>" +
                "<p class='cx-muted'>Elle sera <b>archivée</b> et remplacée par cette grille.</p>",
            okText: "Activer et archiver l'autre"
        }) : $.Deferred().resolve().promise();

        suite.done(function () {
            state.saving = true;
            U.busy($btn, true);
            var action = creation ? "Grille créée" + (statut === "ACTIVE" ? " et activée" : " (brouillon)") :
                "Grille modifiée" + (ancien !== statut ? " · statut : " + T.STATUTS_GRILLE[ancien].label + " → " + T.STATUTS_GRILLE[statut].label : "");
            g.historique = [{ date: U.now(), user: CX.CONFIG.USER.nom, action: action }].concat(g.historique || []);
            // TODO API : PUT /commercial/tarifs/{id}/archiver pour chaque grille standard concurrente
            CX.api.patchMany("tarifaires", $.map(concurrentes, function (x) { return x.id; }), { statut: "ARCHIVEE" })
                // TODO API : POST /commercial/tarifs (création) | PUT /commercial/tarifs/{id} (modification)
                .then(function () { return CX.api.save("tarifaires", g); })
                .done(function (saved) {
                    state.dirty = false;
                    T.flash("Grille <b>" + U.esc(saved.code) + " · " + U.esc(saved.nom) + "</b> " + (statut === "ACTIVE" ? "enregistrée et active." : "enregistrée en brouillon.") +
                        (concurrentes.length ? " La grille « " + U.esc(concurrentes[0].nom) + " » a été archivée." : ""));
                    location.href = U.queryParam("retour") || "tarifs-liste.html";
                })
                .fail(function (e) { state.saving = false; U.busy($btn, false); U.toast("Enregistrement impossible : " + U.esc(e), "error"); });
        });
    }
    $("#btn-activer").on("click", function () { enregistrer("ACTIVE", $(this)); });
    $("#btn-enregistrer").on("click", function () {
        /* une grille active reste active quand on l'enregistre sans la désactiver explicitement */
        var st = state.grille && state.grille.statut === "ACTIVE" ? "ACTIVE" : (state.grille && state.grille.statut === "ARCHIVEE" ? "ARCHIVEE" : "BROUILLON");
        enregistrer(st, $(this));
    });
    $("#btn-annuler").on("click", function (e) {
        if (!state.dirty) return;
        e.preventDefault();
        var href = $(this).attr("href");
        U.confirm({ title: "Abandonner les modifications ?", message: "Les modifications de la grille ne seront pas enregistrées.", okText: "Abandonner", okClass: "cx-btn-danger", cancelText: "Continuer" })
            .done(function () { state.dirty = false; location.href = href; });
    });
    $(window).on("beforeunload", function () { if (state.dirty && !state.saving) return "Des modifications ne sont pas enregistrées."; });
    $form.on("submit", function (e) { e.preventDefault(); });

    /* =================================================================
       Remplissage
       ================================================================= */
    function remplir(g) {
        $("#nom").val(g.nom); $("#description").val(g.description || "");
        $("input[name='type'][value='" + g.type + "']").prop("checked", true);
        $("#du").val(g.du || ""); $("#au").val(g.au || ""); $("#devise").val(g.devise || "FCFA");
        $("#baseId").val(g.baseId || "");
        $("#remiseBasePct").val(g.remiseBasePct || 0);
        $("#heriterSupplements").prop("checked", g.heriterSupplements !== false);
        $("#diviseurVol").val(String(g.diviseurVol || T.DIVISEUR_DEFAUT));
        if (!$("#diviseurVol").val()) $("#diviseurVol").append("<option value='" + g.diviseurVol + "'>" + U.fmt(g.diviseurVol) + "</option>").val(String(g.diviseurVol));
        $("#minimum").val(g.minimum || ""); $("#arrondi").val(String(g.arrondi || 1)); $("#arrondiMode").val(g.arrondiMode || "SUP");
        $("#tvaIncluse").prop("checked", !!g.tvaIncluse);
        $("#regles").empty();
        $.each(g.regles || [], function (_, r) { ajouterRegle(r); });
        numeroter();
        remplirSupplements(g.supplements);
        var aff = g.affectation || {};
        $("#affClients").val($.map(aff.clientIds || [], String)).trigger("change.select2");
        $("#affGroupes").val($.map(aff.groupeIds || [], String)).trigger("change.select2");
        $("#code-display").text(g.code || "attribué à l'enregistrement");
        $("#statut-display").html(g.id ? T.badge(T.STATUTS_GRILLE, g.statut) : "");
        $("#note-archivee").toggleClass("cx-hidden", g.statut !== "ARCHIVEE");
        if (g.id) {
            document.title = "Commercial · " + g.code + " " + g.nom + " - ClemenTino";
            $("#page-title").text("Modifier la grille");
            $("#page-sub").text(g.code + " · " + g.nom);
            $("#crumb-current").text(g.code);
            $("#btn-enregistrer").html("<i class='fa fa-floppy-o'></i> " + (g.statut === "ACTIVE" ? "Enregistrer" : g.statut === "ARCHIVEE" ? "Enregistrer (archivée)" : "Brouillon"));
        }
        majTout();
        state.dirty = false;
    }

    /* =================================================================
       Démarrage
       ================================================================= */
    function demarrer(g) {
        remplir(g);
        majPays();
        simuler(lireGrille());
        if (location.hash === "#simulateur") {
            setTimeout(function () { $("#s-poids").focus().select(); }, 300);
        }
    }
    if (editId) {
        // TODO API : GET /commercial/tarifs/{id}
        CX.api.get("tarifaires", editId).done(function (g) {
            state.grille = g;
            demarrer(g);
        }).fail(function () { $form.addClass("cx-hidden"); $("#not-found").removeClass("cx-hidden"); });
    } else {
        var type = (U.queryParam("type") || "CLIENT").toUpperCase(), cid = U.queryParam("client");
        var g = T.nouvelleGrille(type);
        var std = T.grilleStandard();
        if (type !== "STANDARD" && std) { g.baseId = std.id; g.heriterSupplements = true; }
        if (type === "STANDARD") {
            g.minimum = 1500;
            g.supplements.livraison = $.map(REF.ZONES_LIVRAISON, function (z) { return { zone: z.code, prix: z.prix }; });
        }
        if (cid) {
            g.affectation.clientIds = [Number(cid)];
            g.nom = "Tarif " + CX.api.clientNom(cid) + " " + today.substr(0, 4);
        }
        g.regles = [T.nouvelleRegle("INCREMENTIEL")];
        g.regles[0].libelle = "National · colis";
        g.regles[0].perimetre.typeTrajet = "NATIONAL";
        demarrer(g);
        $("#nom").focus();
    }
});

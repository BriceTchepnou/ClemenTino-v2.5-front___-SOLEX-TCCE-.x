/* =====================================================================
   Commercial · Formulaire de cotation (cotation-form.html)
   ---------------------------------------------------------------------
   Paramètres d'URL :
     ?type=EXPEDITION | FRET | TARIFAIRE   type de la nouvelle cotation
     ?id=12                                modification (statut ENREGISTREE uniquement)
     ?client=4                             client présélectionné
   Une seule page pour les 3 types : les blocs propres à chaque type portent
   l'attribut data-type="..." et sont affichés / masqués (pseudo-SPA).
   Le récapitulatif de droite est recalculé à chaque saisie (recalc()).
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, COT = CX.cot, today = U.today();

    var state = {
        type: "EXPEDITION",
        cot: null,            // cotation existante (modification)
        client: null,         // client sélectionné
        tente: false,         // une tentative d'enregistrement a eu lieu -> on montre toutes les erreurs
        lecture: false,       // cotation non modifiable
        trajetManuel: false,  // l'utilisateur a forcé le type de trajet
        expAuto: true,        // l'expéditeur suit le client sélectionné
        remiseFigee: null,    // remise enregistrée sur une cotation existante (prioritaire sur la fiche client)
        tarif: null,          // grille applicable : CX.tarifs.resoudre(client, date) -> { grille, origine, contrat… }
        uid: 0                // compteur pour les noms de radios des colis
    };
    var dernierCalc = null;

    /* =================================================================
       Initialisation des listes
       ================================================================= */
    function optionsVilles($sel, vide) {
        $sel.html("<option value=''>" + (vide || "Choisir une ville…") + "</option>" + $.map(REF.VILLES, function (v) {
            return "<option value='" + v.nom + "'>" + U.esc(COT.villeLabel(v.nom)) + "</option>";
        }).join(""));
    }
    optionsVilles($("#villeDep")); optionsVilles($("#villeDest"));
    optionsVilles($("#fVilleDep")); optionsVilles($("#fVilleDest")); optionsVilles($("#fZoneVille"));
    optionsVilles($("#pfVilleDep"));
    $("#zone").html("<option value=''>Choisir une zone…</option>" + $.map(REF.ZONES_LIVRAISON, function (z) {
        return "<option value='" + z.code + "'>" + U.esc(z.nom) + " - " + U.money(z.prix) + "</option>";
    }).join(""));

    /* Bureaux d'une ville (CX.REF.agencesDe). Retourne le nombre de bureaux. */
    function remplirBureaux($sel, ville, valeur) {
        var ags = ville ? REF.agencesDe(ville) : [];
        if (!ville) $sel.html("<option value=''>Choisissez d'abord la ville</option>").prop("disabled", true);
        else if (!ags.length) $sel.html("<option value=''>Aucun bureau dans cette ville</option>").prop("disabled", true);
        else {
            $sel.prop("disabled", state.lecture).html("<option value=''>Choisir un bureau…</option>" + $.map(ags, function (a) {
                return "<option value='" + U.esc(a.nom) + "'>" + U.esc(a.nom) + "</option>";
            }).join(""));
            /* un seul bureau : sélection automatique */
            $sel.val(valeur && $.grep(ags, function (a) { return a.nom === valeur; }).length ? valeur : (ags.length === 1 ? ags[0].nom : ""));
        }
        return ags.length;
    }

    /* Clients (Select2) */
    $.each(CX.api.clientsSync(), function (_, c) {
        var $o = $("<option>").val(c.id).text(c.raisonSociale)
            .attr("data-sub", (c.code || "") + " · " + COT.villeLabel(c.ville) + (c.enCompte ? " · en compte" : " · comptant") + (c.statut !== "ACTIF" ? " · " + c.statut.toLowerCase() : ""));
        if (c.statut === "INACTIF") $o.prop("disabled", true);
        $("#clientId").append($o);
    });
    $("#clientId").select2({
        width: "100%", placeholder: "Rechercher un client…", allowClear: true,
        templateResult: function (o) {
            if (!o.id) return o.text;
            return $("<div><div style='font-weight:600'>" + U.esc(o.text) + "</div><small style='opacity:.7'>" + U.esc($(o.element).attr("data-sub")) + "</small></div>");
        }
    });

    /* Véhicules (cartes) */
    $("#vehicules").html($.map(REF.TYPES_VEHICULE, function (v) {
        var p = COT.PRIX_VEHICULE[v] || { icon: "fa-truck", jour: 0, desc: "" };
        return "<label class='cx-seg-item'><input type='radio' name='vehicule' value='" + U.esc(v) + "'>" +
            "<span><i class='fa " + p.icon + "'></i><b>" + U.esc(v) + "</b><small>" + U.esc(p.desc) + "</small>" +
            "<em>à partir de " + U.money(p.jour) + " / jour</em></span></label>";
    }).join(""));

    /* =================================================================
       Type de cotation : affichage des blocs
       ================================================================= */
    var TITRES = {
        EXPEDITION: { page: "Nouvelle cotation d'expédition", c1: "Client & trajet", c1sub: "Pour qui est la cotation, et d'où part l'envoi ?", kind: "Cotation d'expédition" },
        FRET: { page: "Nouvelle cotation de mise à disposition", c1: "Client & véhicule", c1sub: "Pour qui, et avec quel véhicule ?", kind: "Mise à disposition (FRET)" },
        TARIFAIRE: { page: "Nouvelle cotation tarifaire", c1: "Client & validité", c1sub: "Pour qui est la grille, et à partir de quand ?", kind: "Cotation tarifaire" }
    };
    function appliquerType() {
        var t = TITRES[state.type];
        $("[data-type]").each(function () { $(this).toggleClass("cx-hidden", $(this).data("type") !== state.type); });
        $("#pageTitre").text(state.cot ? (state.lecture ? "Cotation " : "Modifier la cotation ") + state.cot.numero : t.page);
        $("#pageCrumb").text(state.cot ? state.cot.numero : "Nouvelle");
        document.title = "Commercial · " + (state.cot ? state.cot.numero : t.page) + " - ClemenTino";
        $("#c1-titre").text(t.c1); $("#c1-sub").text(t.c1sub);
        $("#r-kind").text(t.kind);
        $("#r-totaux").toggleClass("cx-hidden", state.type === "TARIFAIRE");
        $("#btnSoumettre").html("<i class='fa fa-paper-plane-o'></i> Enregistrer &amp; soumettre");
    }

    /* =================================================================
       Colis (cotation d'expédition)
       ================================================================= */
    function colisHtml(c) {
        c = $.extend({ nature: "Colis", poids: "", L: "", l: "", H: "", nombre: 1, valeur: "", description: "" }, c);
        var uid = ++state.uid;
        var pills = $.map(REF.NATURES_COLIS, function (n) {
            return "<label class='cx-pill'><input type='radio' name='nature-" + uid + "' value='" + U.esc(n) + "'" + (n === c.nature ? " checked" : "") +
                "><span>" + U.esc(n) + "</span></label>";
        }).join("");
        return "<div class='cf-colis' data-uid='" + uid + "'>" +
            "<div class='cf-colis-head'><span class='cf-colis-num'>Colis 1</span><span class='cf-colis-titre'>" + U.esc(c.nature) + "</span>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs cf-colis-del' data-del-colis title='Retirer ce colis'><i class='fa fa-trash-o'></i> Retirer</button></div>" +
            "<div class='cx-field'><label class='cx-label'>Nature</label><div class='cx-pills'>" + pills + "</div></div>" +
            "<div class='row'>" +
            "<div class='col-sm-3'><div class='cx-field'><label class='cx-label req'>Poids réel</label>" +
            "<div class='input-group'><input type='text' class='form-control cf-num' data-f='poids' inputmode='decimal' value='" + U.esc(c.poids) + "' placeholder='0'><span class='input-group-addon'>kg</span></div></div></div>" +
            "<div class='col-sm-5'><div class='cx-field'><label class='cx-label'>Dimensions L × l × H <span class='cx-opt'>(cm)</span></label>" +
            "<div class='cf-dims'><input type='text' class='form-control' data-f='L' inputmode='numeric' placeholder='L' value='" + U.esc(c.L) + "'><span>×</span>" +
            "<input type='text' class='form-control' data-f='l' inputmode='numeric' placeholder='l' value='" + U.esc(c.l) + "'><span>×</span>" +
            "<input type='text' class='form-control' data-f='H' inputmode='numeric' placeholder='H' value='" + U.esc(c.H) + "'></div></div></div>" +
            "<div class='col-sm-4'><div class='cx-field'><label class='cx-label'>Nombre</label>" +
            "<div class='cx-stepper' data-stepper><button type='button' data-step='-1' aria-label='Moins'>−</button>" +
            "<input type='text' data-f='nombre' value='" + (parseInt(c.nombre, 10) || 1) + "' inputmode='numeric'>" +
            "<button type='button' data-step='1' aria-label='Plus'>+</button></div></div></div>" +
            "</div><div class='row'>" +
            "<div class='col-sm-4'><div class='cx-field'><label class='cx-label'>Valeur déclarée <span class='cx-opt'>(facultatif)</span></label>" +
            "<div class='input-group'><input type='text' class='form-control cf-num' data-f='valeur' inputmode='numeric' value='" + U.esc(c.valeur ? U.fmt(c.valeur) : "") + "' placeholder='0'><span class='input-group-addon'>FCFA</span></div></div></div>" +
            "<div class='col-sm-8'><div class='cx-field'><label class='cx-label'>Description du contenu</label>" +
            "<input type='text' class='form-control' data-f='description' maxlength='160' value='" + U.esc(c.description) + "' placeholder='Ex. : documents, échantillons…'></div></div>" +
            "</div>" +
            "<div class='cf-poids' data-poids></div>" +
            "</div>";
    }
    function ajouterColis(c) {
        var $c = $(colisHtml(c)).appendTo("#colisList");
        numeroterColis(); majPoidsColis($c);
        return $c;
    }
    function numeroterColis() {
        var $all = $("#colisList .cf-colis");
        $all.each(function (i) { $(this).find(".cf-colis-num").text("Colis " + (i + 1)); });
        $all.find("[data-del-colis]").toggle($all.length > 1 && !state.lecture);
    }
    function lireUnColis($c) {
        function f(k) { return $c.find("[data-f='" + k + "']").val(); }
        return {
            nature: $c.find("input[type=radio]:checked").val() || "Colis",
            poids: U.num(f("poids")), L: U.num(f("L")), l: U.num(f("l")), H: U.num(f("H")),
            nombre: Math.max(1, parseInt(f("nombre"), 10) || 1), valeur: U.num(f("valeur")), description: $.trim(f("description"))
        };
    }
    function lireColis() { return $("#colisList .cf-colis").map(function () { return lireUnColis($(this)); }).get(); }

    /* Barres « poids réel » vs « poids volumétrique » d'un colis */
    function majPoidsColis($c) {
        var c = lireUnColis($c), vol = CX.tarifs ? CX.tarifs.poidsVolumetrique(c.L, c.l, c.H, diviseurVol()) : CX.tarif.poidsVolumetrique(c.L, c.l, c.H), reel = c.poids;
        var max = Math.max(reel, vol, 0.0001), tax = Math.max(reel, vol) * c.nombre;
        $c.find(".cf-colis-titre").text(c.nature + (c.description ? " · " + c.description : ""));
        $c.find("[data-poids]").html(
            "<div class='cf-poids-item" + (reel >= vol && reel > 0 ? " win" : "") + "'>Poids réel <b>" + U.fmt(reel, 1) + " kg</b>" +
            "<div class='cx-bar'><i style='width:" + Math.round(reel / max * 100) + "%'></i></div></div>" +
            "<div class='cf-poids-item" + (vol > reel ? " win" : "") + "'>Poids volumétrique <b>" + U.fmt(vol, 1) + " kg</b>" +
            "<div class='cx-bar orange'><i style='width:" + Math.round(vol / max * 100) + "%'></i></div></div>" +
            "<div class='cf-taxable'><small>Poids taxable</small><b>" + U.fmt(Math.round(tax * 10) / 10, 1) + " kg</b>" +
            (c.nombre > 1 ? "<div class='cx-cell-sub'>" + c.nombre + " × " + U.fmt(Math.max(reel, vol), 1) + " kg</div>" : "") + "</div>");
    }

    $("#btnAddColis").on("click", function () {
        var $c = ajouterColis();
        $c.find("[data-f='poids']").focus();
        recalc();
    });
    $("#colisList").on("click", "[data-del-colis]", function () {
        $(this).closest(".cf-colis").remove();
        numeroterColis(); recalc();
    });
    $("#colisList").on("input change", "input", function () { majPoidsColis($(this).closest(".cf-colis")); });

    /* =================================================================
       Grille tarifaire (cotation tarifaire)
       ================================================================= */
    function ligneHtml(l) {
        l = $.extend({ villeDep: "", villeDest: "", tranche: COT.TRANCHES[0].code, prix: "" }, l);
        function villes(sel) {
            return "<option value=''>—</option>" + $.map(REF.VILLES, function (v) {
                return "<option value='" + v.nom + "'" + (v.nom === sel ? " selected" : "") + ">" + U.esc(COT.villeLabel(v.nom)) + "</option>";
            }).join("");
        }
        var tranches = $.map(COT.TRANCHES, function (t) {
            return "<option" + (t.code === l.tranche ? " selected" : "") + ">" + U.esc(t.code) + "</option>";
        }).join("");
        return "<tr><td class='cx-muted' data-rang></td>" +
            "<td><select class='form-control' data-g='villeDep'>" + villes(l.villeDep) + "</select></td>" +
            "<td><select class='form-control' data-g='villeDest'>" + villes(l.villeDest) + "</select></td>" +
            "<td><select class='form-control' data-g='tranche'>" + tranches + "</select></td>" +
            "<td><input type='text' class='form-control cf-num' data-g='prix' inputmode='numeric' value='" + (l.prix ? U.fmt(l.prix) : "") + "' placeholder='0'></td>" +
            "<td class='num cx-strong' data-net>—</td>" +
            "<td class='cx-right'><button type='button' class='cx-btn cx-btn-ghost cx-btn-icon' data-del-ligne title='Supprimer la ligne'><i class='fa fa-trash-o'></i></button></td></tr>";
    }
    function lireLignes() {
        return $("#grilleBody tr").map(function () {
            var $r = $(this);
            return {
                villeDep: $r.find("[data-g='villeDep']").val(), villeDest: $r.find("[data-g='villeDest']").val(),
                tranche: $r.find("[data-g='tranche']").val(), prix: U.num($r.find("[data-g='prix']").val())
            };
        }).get();
    }
    function majGrilleVide() {
        var n = $("#grilleBody tr").length;
        $("#grilleVide").toggle(n === 0);
        $(".cf-grille-wrap").toggle(n > 0);
        $("#grilleBody tr").each(function (i) { $(this).find("[data-rang]").text(i + 1); });
    }
    function remplirGrille(lignes) {
        $("#grilleBody").html($.map(lignes || [], ligneHtml).join(""));
        majGrilleVide();
    }
    $("#btnAddLigne").on("click", function () {
        /* reprend la ville de départ de la dernière ligne pour aller plus vite */
        var last = lireLignes().pop();
        $("#grilleBody").append(ligneHtml({ villeDep: last ? last.villeDep : $("#pfVilleDep").val() }));
        majGrilleVide();
        $("#grilleBody tr:last [data-g='villeDest']").focus();
        recalc();
    });
    $("#grilleBody").on("click", "[data-del-ligne]", function () {
        $(this).closest("tr").remove(); majGrilleVide(); recalc();
    });
    $("#btnPrefill").on("click", function () {
        var dep = $("#pfVilleDep").val();
        if (!dep) { U.toast("Choisissez la ville de départ à pré-remplir.", "warning"); $("#pfVilleDep").focus(); return; }
        function generer() {
            // TODO API : GET /commercial/tarifs/{grille}/bareme?villeDep={dep}  (barème calculé par le serveur)
            var lignes = [], g = state.tarif && state.tarif.grille;
            $.each(REF.VILLES, function (_, v) {
                if (v.nom === dep) return;
                $.each(COT.TRANCHES, function (_, t) {
                    var prix = g ? CX.tarifs.calculer(g, { villeDep: dep, villeDest: v.nom, typeEnvoi: "COLIS", nature: "Colis", poids: t.max, nombre: 1 }).ht
                        : CX.tarif.transport(dep, v.nom, t.max);
                    lignes.push({ villeDep: dep, villeDest: v.nom, tranche: t.code, prix: prix });
                });
            });
            remplirGrille(lignes);
            recalc();
            U.toast(lignes.length + " lignes générées depuis la grille « " + U.esc(g ? g.nom : "standard") + " » au départ de " + U.esc(COT.villeLabel(dep)) + ".");
        }
        if ($("#grilleBody tr").length) {
            U.confirm({
                title: "Pré-remplir la grille",
                message: "Les <b>" + $("#grilleBody tr").length + " ligne(s)</b> actuelles seront remplacées par la grille « " + U.esc(state.tarif && state.tarif.grille ? state.tarif.grille.nom : "standard") + " » au départ de <b>" + U.esc(COT.villeLabel(dep)) + "</b>.",
                okText: "Remplacer les lignes"
            }).done(generer);
        } else generer();
    });

    /* =================================================================
       Grille tarifaire du client (moteur CX.tarifs)
       Contrat en vigueur > grille propre > groupe > grille standard.
       Sans client : grille standard.
       ================================================================= */
    function majTarif() {
        if (!CX.tarifs) { state.tarif = null; return; }
        // TODO API : GET /commercial/tarifs/resoudre?client={id}&date={date}
        state.tarif = CX.tarifs.resoudre(state.client ? state.client.id : null, state.cot ? state.cot.dateCreation : today);
        var g = state.tarif.grille;
        $("#colisSub").text("Le poids taxable est le plus grand du poids réel et du poids volumétrique (L × l × H / " + U.fmt(diviseurVol()) + ")");
        $("#btnPrefillTxt").text(g ? "Pré-remplir depuis la grille « " + g.nom + " »" : "Pré-remplir depuis la grille standard");
        $("#colisList .cf-colis").each(function () { majPoidsColis($(this)); });
    }
    function diviseurVol() { return state.tarif && state.tarif.grille ? CX.tarifs.diviseurDe(state.tarif.grille) : 5000; }
    /* Remise : celle du contrat en vigueur s'il y en a un, sinon celle de la fiche client */
    function remiseContrat() {
        var k = state.tarif && state.tarif.contrat ? state.tarif.contrat.conditions : null;
        return k && k.remisePct != null ? U.num(k.remisePct) : null;
    }
    function majBlocTarif(r) {
        var t = state.tarif, g = t && t.grille, o = g ? CX.tarifs.ORIGINES[t.origine] : null;
        $("#r-tarif").toggleClass("cx-hidden", !CX.tarifs).toggleClass("std", !g || t.origine === "STANDARD");
        if (!CX.tarifs) return;
        $("#r-tarifNom").text(g ? g.nom : "aucune grille").attr("href", g ? "tarif-form.html?id=" + g.id : "tarifs-liste.html");
        $("#r-tarifOrigine").html(g ? U.esc(o.label) + (t.origine === "CONTRAT" ? " · contrat n° <b>" + U.esc(t.contrat.numero) + "</b>" : t.origine === "GROUPE" ? " · " + U.esc(t.libelle) : "") +
            (r.calcTarif && r.calcTarif.regle ? "<br>Règle : « " + U.esc(r.calcTarif.regle.libelle) + " »" : "") : U.esc((t && t.alertes[0]) || ""));
        var actif = $("#tarifAuto").is(":checked");
        $("#r-detailToggle").toggleClass("cx-hidden", !r.calcTarif || !actif);
        $("#r-detail").html(r.calcTarif ? CX.tarifs.detailHtml(r.calcTarif, { titreTotal: "Total grille (HT)" }) : "");
        var alertes = $.merge(t ? t.alertes.slice() : [], r.calcTarif && actif ? r.calcTarif.alertes : []);
        $("#r-tarifAlertes").html(alertes.length && actif && $("#r-detail").hasClass("cx-hidden") ? "<div class='cx-note cx-note-warn' style='font-size:12px'><i class='fa fa-exclamation-triangle'></i><div>" +
            $.map(alertes, function (a) { return U.esc(a); }).join("<br>") + "</div></div>" : "");
        var ex = g ? CX.tarifs.supplementsDe(g).express : null;
        $("#expressInfo").text(ex && ex.actif ? "Supplément " + (ex.mode === "FIXE" ? U.money(ex.valeur) : "+" + U.fmt(ex.valeur) + " % du transport") + " (grille du client)" : "Non proposé par la grille du client");
    }
    $("#r-detailToggle").on("click", function () {
        var $d = $("#r-detail").toggleClass("cx-hidden");
        $(this).html($d.hasClass("cx-hidden") ? "<i class='fa fa-plus-circle'></i> Détail du calcul" : "<i class='fa fa-minus-circle'></i> Masquer le détail");
        recalc();
    });

    /* =================================================================
       Lecture des données saisies
       ================================================================= */
    function typeTrajet() { return $("input[name='typeTrajet']:checked").val() || "NATIONALE"; }
    function estEtranger() { var t = typeTrajet(); return t === "REGIONALE" || t === "INTERNATIONALE"; }

    function lireDetails() {
        var d, $v;
        if (state.type === "EXPEDITION") {
            var etr = estEtranger();
            d = {
                typeTrajet: typeTrajet(),
                villeDep: $("#villeDep").val(), bureauDep: $("#bureauDep").val() || "",
                villeDest: etr ? "" : $("#villeDest").val(), bureauDest: etr ? "" : ($("#bureauDest").val() || ""),
                paysDest: etr ? $("#paysDest").val() : "", villeDestLibre: etr ? $.trim($("#villeDestLibre").val()) : "",
                livraison: $("input[name='livraison']:checked").val() || "BUREAU",
                express: $("#express").is(":checked"),
                quartier: $.trim($("#quartier").val()), zone: $("#zone").val(), repere: $.trim($("#repere").val()),
                colis: lireColis(),
                tarifAuto: $("#tarifAuto").is(":checked"),
                transport: U.num($("#in-transport").val()), livraisonMt: U.num($("#in-livraison").val()),
                emballage: U.num($("#in-emballage").val()), autres: U.num($("#in-autres").val()),
                expediteur: { nom: $.trim($("#expNom").val()), tel: $.trim($("#expTel").val()), adresse: $.trim($("#expAdresse").val()), email: $.trim($("#expEmail").val()) },
                destinataire: { nom: $.trim($("#destNom").val()), tel: $.trim($("#destTel").val()), adresse: $.trim($("#destAdresse").val()), email: $.trim($("#destEmail").val()) }
            };
            if (d.livraison !== "DOMICILE") { d.quartier = ""; d.zone = ""; d.repere = ""; }
        } else if (state.type === "FRET") {
            $v = $("input[name='vehicule']:checked");
            var mode = $("input[name='modeFret']:checked").val() || "TRAJET";
            d = {
                vehicule: $v.val() || "", dateDebut: $("#dateDebut").val(), nbJours: Math.max(0, parseInt($("#nbJours").val(), 10) || 0),
                mode: mode,
                villeDep: mode === "TRAJET" ? $("#fVilleDep").val() : $("#fZoneVille").val(),
                villeDest: mode === "TRAJET" ? $("#fVilleDest").val() : "",
                zone: mode === "ZONE" ? $.trim($("#fZone").val()) : "",
                prixJour: U.num($("#prixJour").val()),
                chauffeur: $("#chauffeur").is(":checked"), chauffeurJour: U.num($("#chauffeurJour").val()),
                carburant: $("#carburant").is(":checked"), carburantJour: U.num($("#carburantJour").val()),
                manutention: Math.max(0, parseInt($("#manutention").val(), 10) || 0), manutJour: U.num($("#manutJour").val()),
                frais: U.num($("#frais").val()), fraisLibelle: $.trim($("#fraisLibelle").val())
            };
            d.dateFin = d.dateDebut && d.nbJours ? U.addDays(d.dateDebut, d.nbJours - 1) : "";
        } else {
            d = { dateEffet: $("#dateEffet").val(), remiseGlobale: U.num($("#remiseGlobale").val()), lignes: lireLignes() };
        }
        d.validiteJours = parseInt($("#validiteJours").val(), 10) || 0;
        return d;
    }
    /* Remise client : celle de la fiche client, sauf cotation existante (remise figée à l'enregistrement) */
    function remiseClient() {
        if (state.remiseFigee != null) return state.remiseFigee;
        var rc = remiseContrat();
        if (rc != null) return rc;
        return state.client ? (state.client.remisePct || 0) : 0;
    }
    function calculer(d) {
        if (state.type === "EXPEDITION") return COT.calcExpedition(d, remiseClient(), state.tarif);
        if (state.type === "FRET") return COT.calcFret(d, remiseClient());
        return COT.calcTarifaire(d);
    }
    function baseValidite() { return state.cot ? state.cot.dateCreation : today; }

    /* Intitulé proposé si l'utilisateur n'en saisit pas */
    function intituleAuto(d) {
        if (state.type === "EXPEDITION") {
            var dest = estEtranger() ? (d.villeDestLibre || d.paysDest) : COT.villeLabel(d.villeDest);
            return "Expédition " + (COT.villeLabel(d.villeDep) || "…") + " → " + (dest || "…");
        }
        if (state.type === "FRET") return "Mise à disposition " + (d.vehicule || "véhicule") + (d.nbJours ? " - " + d.nbJours + " jour" + (d.nbJours > 1 ? "s" : "") : "");
        return "Grille tarifaire " + (state.client ? (state.client.sigle || state.client.raisonSociale) + " " : "") + (d.dateEffet || today).substr(0, 4);
    }

    /* =================================================================
       Contrôles de saisie : liste des champs obligatoires manquants
       Chaque erreur : { $el: élément à marquer, msg: libellé }
       ================================================================= */
    function telValide(t) {
        var d = String(t || "").replace(/\D/g, "");
        if (d.length === 12 && d.substr(0, 3) === "237") d = d.substr(3);
        return /^[62]\d{8}$/.test(d);
    }
    function emailValide(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

    function controle(d, r) {
        var errs = [];
        function req(sel, cond, msg) { if (!cond) errs.push({ $el: $(sel), msg: msg }); }

        req("#clientId", $("#clientId").val(), "Client");
        var v = d.validiteJours;
        req("#validiteJours", v >= 1 && v <= 365, "Validité de l'offre (1 à 365 jours)");

        if (state.type === "EXPEDITION") {
            req("#villeDep", d.villeDep, "Ville d'expédition");
            if (d.villeDep && REF.agencesDe(d.villeDep).length) req("#bureauDep", d.bureauDep, "Bureau d'expédition");
            if (estEtranger()) {
                req("#paysDest", d.paysDest, "Pays de destination");
                req("#villeDestLibre", d.villeDestLibre, "Ville de destination");
            } else {
                req("#villeDest", d.villeDest, "Ville de destination");
                if (d.villeDest && REF.agencesDe(d.villeDest).length) req("#bureauDest", d.bureauDest, "Bureau de destination");
            }
            if (d.livraison === "DOMICILE") {
                req("#quartier", d.quartier, "Quartier de livraison");
                req("#zone", d.zone, "Zone de livraison");
            }
            $("#colisList .cf-colis").each(function (i) {
                var $p = $(this).find("[data-f='poids']");
                req($p, U.num($p.val()) > 0, "Colis " + (i + 1) + " : poids réel");
            });
            req("#expTel", telValide(d.expediteur.tel), "Téléphone de l'expéditeur (9 chiffres)");
            req("#expNom", d.expediteur.nom, "Nom de l'expéditeur");
            req("#expEmail", emailValide(d.expediteur.email), "Email de l'expéditeur invalide");
            req("#destTel", telValide(d.destinataire.tel), "Téléphone du destinataire (9 chiffres)");
            req("#destNom", d.destinataire.nom, "Nom du destinataire");
            req("#destEmail", emailValide(d.destinataire.email), "Email du destinataire invalide");
            if (!d.tarifAuto) req("#in-transport", d.transport > 0, "Montant du transport");
            if (d.tarifAuto && r.ttc <= 0) errs.push({ $el: $("#in-autres"), msg: "Montant total (renseignez les colis et le trajet)" });
        } else if (state.type === "FRET") {
            req("#vehiculeCtrl", d.vehicule, "Type de véhicule");
            req("#dateDebut", d.dateDebut, "Date de début");
            req("#nbJours", d.nbJours >= 1, "Nombre de jours");
            if (d.mode === "TRAJET") {
                req("#fVilleDep", d.villeDep, "Ville de départ");
                req("#fVilleDest", d.villeDest, "Ville d'arrivée");
            } else {
                req("#fZoneVille", d.villeDep, "Ville d'intervention");
                req("#fZone", d.zone, "Zone / itinéraire");
            }
            req("#prixJour", d.prixJour > 0, "Prix de location par jour");
            if (d.frais > 0) req("#fraisLibelle", d.fraisLibelle, "Libellé des frais annexes");
        } else {
            req("#dateEffet", d.dateEffet, "Date d'effet");
            req("#remiseGlobale", d.remiseGlobale >= 0 && d.remiseGlobale <= 80, "Remise globale (0 à 80 %)");
            if (!d.lignes.length) errs.push({ $el: $("#btnAddLigne"), msg: "Au moins une ligne de tarif" });
            var vus = {};
            $("#grilleBody tr").removeClass("cf-doublon").each(function (i) {
                var $r = $(this), l = d.lignes[i], cle = l.villeDep + ">" + l.villeDest + ">" + l.tranche;
                req($r.find("[data-g='villeDep']"), l.villeDep, "Ligne " + (i + 1) + " : ville de départ");
                req($r.find("[data-g='villeDest']"), l.villeDest, "Ligne " + (i + 1) + " : ville de destination");
                req($r.find("[data-g='prix']"), l.prix > 0, "Ligne " + (i + 1) + " : prix");
                if (l.villeDep && l.villeDest) {
                    if (vus[cle]) { $r.addClass("cf-doublon"); errs.push({ $el: $r.find("[data-g='tranche']"), msg: "Ligne " + (i + 1) + " : doublon de la ligne " + vus[cle] }); }
                    else vus[cle] = i + 1;
                }
            });
        }
        return errs;
    }

    /* Marque les champs en erreur (seulement ceux déjà touchés, ou tous après une tentative) */
    function afficherErreurs(errs) {
        var $f = $("#formCot");
        $f.find(".has-error").removeClass("has-error");
        $f.find(".cf-err").remove();
        $.each(errs, function (_, e) {
            if (!state.tente && !e.$el.data("touched")) return;
            var $td = e.$el.closest("td");
            if ($td.length) { $td.addClass("has-error"); return; }
            var $fld = e.$el.closest(".cx-field");
            if (!$fld.length) { e.$el.addClass("has-error"); return; }   // ex. montants du récapitulatif
            $fld.addClass("has-error");
            if (!$fld.find(".cf-err").length) $fld.append("<span class='cx-help cx-error-text cf-err'>" + U.esc(e.msg) + "</span>");
            e.$el.closest(".cf-colis").addClass("has-error");
        });
    }

    /* =================================================================
       Recalcul complet + mise à jour du récapitulatif
       ================================================================= */
    function recalc() {
        var d = lireDetails(), r = calculer(d), t = state.type, tags = [];
        dernierCalc = { d: d, r: r };

        /* --- en-tête sombre --- */
        $("#r-statut").text(state.cot ? (REF.STATUT_COTATION[state.cot.statut] || {}).label : "Brouillon");
        $("#r-client").text(state.client ? state.client.raisonSociale : "Client non sélectionné");

        if (t === "EXPEDITION") {
            var etr = estEtranger();
            $("#r-route").removeClass("cx-hidden"); $("#r-titre").addClass("cx-hidden");
            $("#r-dep").text(COT.villeLabel(d.villeDep) || "- - -");
            $("#r-depSub").text(d.bureauDep ? "Bureau " + d.bureauDep : "Bureau ?");
            $("#r-dest").text(etr ? (d.villeDestLibre ? d.villeDestLibre.toUpperCase() : "- - -") : (COT.villeLabel(d.villeDest) || "- - -"));
            $("#r-destSub").text(etr ? (d.paysDest || "Pays ?") : (d.bureauDest ? "Bureau " + d.bureauDest : (d.villeDest && !REF.agencesDe(d.villeDest).length ? "Sans bureau" : "Bureau ?")));
            tags.push("<span class='light'>" + COT.TYPES_TRAJET[d.typeTrajet].label + "</span>");
            tags.push("<span>" + (d.livraison === "DOMICILE" ? "Livraison à domicile" : "Retrait au bureau") + "</span>");
            tags.push("<span>" + r.nbColis + " colis · " + U.fmt(r.poidsTaxable, 1) + " kg taxables</span>");

            $("#r-transport").text(U.money(r.transport)).toggleClass("cx-hidden", !d.tarifAuto);
            $("#in-transport").toggleClass("cx-hidden", d.tarifAuto);
            $("#r-livraison").text(d.livraison === "DOMICILE" ? U.money(r.livraison) : "Retrait bureau").toggleClass("cx-hidden", !d.tarifAuto);
            $("#in-livraison").toggleClass("cx-hidden", d.tarifAuto);
            $("#colisResume").text(r.nbColis + " colis · " + U.fmt(r.poidsReel, 1) + " kg réels · " + U.fmt(r.poidsTaxable, 1) + " kg taxables");
            if (d.express) tags.push("<span>Express</span>");
            majBlocTarif(r);

            /* cohérence type de trajet / villes */
            var deduit = COT.deduireTrajet(d.villeDep, d.villeDest), msg = "";
            if (!etr && d.villeDep && d.villeDest && deduit !== d.typeTrajet) {
                msg = deduit === "URBAINE" ? "Les villes de départ et de destination sont identiques : le trajet est normalement « Urbaine »."
                    : "Les villes de départ et de destination sont différentes : le trajet est normalement « Nationale ».";
            }
            $("#trajetIncoherent").toggleClass("cx-hidden", !msg); $("#trajetIncoherentTexte").text(msg);
        } else if (t === "FRET") {
            $("#r-titre").removeClass("cx-hidden").text(d.vehicule || "Véhicule à choisir");
            $("#r-route").toggleClass("cx-hidden", d.mode !== "TRAJET");
            $("#r-dep").text(COT.villeLabel(d.villeDep) || "- - -"); $("#r-depSub").text("Départ");
            $("#r-dest").text(COT.villeLabel(d.villeDest) || "- - -"); $("#r-destSub").text("Arrivée");
            tags.push("<span class='light'>" + r.jours + " jour" + (r.jours > 1 ? "s" : "") + "</span>");
            if (d.dateDebut) tags.push("<span>" + U.toFr(d.dateDebut) + (r.jours > 1 ? " → " + U.toFr(d.dateFin) : "") + "</span>");
            if (d.mode === "ZONE") tags.push("<span>Zone · " + U.esc(COT.villeLabel(d.villeDep) || "?") + "</span>");
            if (d.chauffeur) tags.push("<span>Chauffeur</span>");
            if (d.carburant) tags.push("<span>Carburant</span>");
            if (r.nbManut) tags.push("<span>" + r.nbManut + " manutentionnaire" + (r.nbManut > 1 ? "s" : "") + "</span>");

            $("#r-location").text(U.money(r.location));
            $("#r-locationSub").text(d.prixJour ? "(" + U.fmt(d.prixJour) + " × " + r.jours + " j)" : "");
            $("#r-chauffeur").text(d.chauffeur ? U.money(r.chauffeur) : "Non");
            $("#r-carburant").text(d.carburant ? U.money(r.carburant) : "Non");
            $("#r-manut").text(r.nbManut ? U.money(r.manutention) : "—");
            $("#r-frais").text(r.frais ? U.money(r.frais) : "—");
            $("#periodeInfo").text(d.dateDebut && r.jours ? "Du " + U.toFrLong(d.dateDebut) + " au " + U.toFrLong(d.dateFin) + " inclus" : "");
            $("#vehiculeLibelle").text(d.vehicule ? d.vehicule + " · " + r.jours + " jour(s)" : "Choisissez un véhicule");
            $("#vehiculeCtrl").val(d.vehicule);
            $("#chauffeurJour").closest(".cf-opt-prix").toggleClass("cf-off", !d.chauffeur);
            $("#carburantJour").closest(".cf-opt-prix").toggleClass("cf-off", !d.carburant);
        } else {
            $("#r-route").addClass("cx-hidden");
            $("#r-titre").removeClass("cx-hidden").text("Grille tarifaire");
            if (d.dateEffet) tags.push("<span class='light'>Effet au " + U.toFr(d.dateEffet) + "</span>");
            tags.push("<span>" + r.nb + " ligne" + (r.nb > 1 ? "s" : "") + "</span>");
            if (d.remiseGlobale) tags.push("<span>Remise " + U.fmt(d.remiseGlobale, d.remiseGlobale % 1 ? 1 : 0) + " %</span>");
            $("#r-nbLignes").text(r.nb);
            $("#r-trajets").text(r.trajets);
            $("#r-remiseG").text(U.fmt(d.remiseGlobale, d.remiseGlobale % 1 ? 1 : 0) + " %");
            $("#r-min").text(r.min == null ? "—" : U.money(r.min));
            $("#r-max").text(r.max == null ? "—" : U.money(r.max));
            /* prix nets dans le tableau */
            $("#grilleBody tr").each(function (i) {
                var l = d.lignes[i];
                $(this).find("[data-net]").text(l && l.prix ? U.money(COT.prixNet(l.prix, d.remiseGlobale)) : "—");
            });
        }
        $("#r-tags").html(tags.join(""));

        /* --- totaux --- */
        if (t !== "TARIFAIRE") {
            $("#r-brut").text(U.money(r.brut));
            $("#r-remiseLbl").text((state.remiseFigee == null && remiseContrat() != null ? "Remise contrat (" : "Remise client (") + U.fmt(r.remisePct) + " %)");
            $("#r-remise").text(r.remise ? "− " + U.money(r.remise) : U.money(0));
            $("#r-ht").text(U.money(r.ht));
            $("#r-tvaLbl").text("TVA (" + U.fmt(r.taux, 2) + " %)");
            $("#r-tva").text(U.money(r.tva));
            $("#r-ttc").text(U.fmt(r.ttc));
        }
        var validite = d.validiteJours > 0 ? U.addDays(baseValidite(), d.validiteJours) : "";
        $("#r-validite").text(validite ? U.toFr(validite) : "—");
        $("#validiteInfo").text(validite ? "Jusqu'au " + U.toFrLong(validite) : "");

        $("#nom").attr("placeholder", intituleAuto(d));

        /* --- contrôles --- */
        var errs = controle(d, r);
        afficherErreurs(errs);
        dernierCalc.errs = errs;
        $("#r-nbManq").text(errs.length);
        $("#r-listeManq").html($.map(errs.slice(0, 6), function (e, i) { return "<li data-err='" + i + "'>" + U.esc(e.msg) + "</li>"; }).join("") +
            (errs.length > 6 ? "<li>… et " + (errs.length - 6) + " autre(s)</li>" : ""));
        $("#r-manquants").toggleClass("cx-hidden", !errs.length || state.lecture);
        $("#r-ok").toggleClass("cx-hidden", !!errs.length || state.lecture);
        $("#btnSoumettre").prop("disabled", !!errs.length || state.lecture);
        return dernierCalc;
    }

    /* Clic sur un champ manquant du récapitulatif : on y va */
    $("#r-listeManq").on("click", "[data-err]", function () {
        var e = dernierCalc && dernierCalc.errs[$(this).data("err")];
        if (!e) return;
        var $t = e.$el.is("#vehiculeCtrl") ? $("#vehicules") : e.$el;
        if (e.$el.is("#clientId")) { $("#clientId").select2("open"); return; }
        $("html, body").animate({ scrollTop: $t.offset().top - 140 }, 200, function () { if ($t.is(":visible")) $t.focus(); });
    });

    /* =================================================================
       Évènements de saisie
       ================================================================= */
    var $form = $("#formCot");
    /* champ « touché » : on peut afficher son erreur */
    $form.on("change focusout", "input, select, textarea", function () { $(this).data("touched", true); });
    $form.on("input change", "input, select, textarea", U.debounce(function () { recalc(); }, 60));

    /* formatage des montants à la sortie du champ */
    $form.on("blur", ".cf-num", function () {
        var v = $.trim($(this).val());
        if (v !== "") $(this).val(U.fmt(U.num(v), U.num(v) % 1 ? 1 : 0));
    });

    /* compteurs − / + */
    $form.on("click", "[data-stepper] button", function () {
        var $s = $(this).closest("[data-stepper]"), $i = $s.find("input");
        var min = $s.data("min") != null ? parseInt($s.data("min"), 10) : 1;
        var n = Math.min(99, Math.max(min, (parseInt($i.val(), 10) || 0) + parseInt($(this).data("step"), 10)));
        $i.val(n).trigger("change");
    });

    /* blocs repliables (adresse / email) */
    $form.on("click", "[data-toggle-bloc]", function () {
        var $b = $($(this).data("toggle-bloc"));
        $b.toggleClass("cx-hidden");
        $(this).html($b.hasClass("cx-hidden") ? "<i class='fa fa-plus-circle'></i> Ajouter l'adresse et l'email" : "<i class='fa fa-minus-circle'></i> Masquer l'adresse et l'email");
    });

    /* --- client --- */
    $("#clientId").on("change", function () {
        $(this).data("touched", true);
        var id = $(this).val();
        state.client = id ? COT.client(id) : null;
        /* changement de client sur une cotation existante : on reprend la remise de la fiche */
        if (state.cot && String(id) !== String(state.cot.clientId)) state.remiseFigee = null;
        var c = state.client;
        majTarif();
        var rc = remiseContrat();
        $("#clientInfo").html(c
            ? (c.enCompte ? "<i class='fa fa-check-circle' style='color:var(--cx-green)'></i> Client en compte" : "Client au comptant") +
              " · " + U.esc(COT.villeLabel(c.ville)) + " · remise " + (rc != null ? "du contrat <b>" + U.fmt(rc) + " %</b>" : "contractuelle <b>" + U.fmt(c.remisePct || 0) + " %</b>") +
              (c.statut === "SUSPENDU" ? " · <span class='cx-error-text'>compte suspendu</span>" : "")
            : "Recherchez par raison sociale, sigle ou code client.");
        if (c && !state.lecture) {
            /* expéditeur pré-rempli depuis la fiche client */
            if (state.type === "EXPEDITION" && state.expAuto) {
                var ct = c.contacts && c.contacts[0] ? c.contacts[0] : {};
                $("#expNom").val(c.raisonSociale);
                $("#expTel").val(String(ct.tel1 || c.telStandard || "").replace(/^\+?237\s*/, ""));
                $("#expAdresse").val(c.adresse || "");
                $("#expEmail").val(ct.email || c.email || "");
                /* départ depuis la ville du client (si non saisie manuellement) */
                if (!state.cot && !$("#villeDep").data("touched") && c.ville) {
                    $("#villeDep").val(c.ville);
                    remplirBureaux($("#bureauDep"), c.ville, c.ville === CX.CONFIG.USER.ville ? CX.CONFIG.USER.agence : "");
                    majTrajetAuto();
                }
            }
            if (state.type === "FRET" && !state.cot && !$("#fVilleDep").data("touched") && c.ville) {
                $("#fVilleDep").val(c.ville); $("#fZoneVille").val(c.ville);
            }
            if (state.type === "TARIFAIRE" && !state.cot && !$("#remiseGlobale").data("touched")) {
                $("#remiseGlobale").val(rc != null ? rc : (c.remisePct || 0));
                if (c.ville) $("#pfVilleDep").val(c.ville);
            }
        }
        recalc();
    });
    /* une modification manuelle de l'expéditeur le détache du client */
    $("#expNom, #expTel").on("input", function () { state.expAuto = false; });

    /* --- trajet (expédition) --- */
    function majTrajetAuto() {
        if (state.trajetManuel) return;
        var t = COT.deduireTrajet($("#villeDep").val(), $("#villeDest").val());
        $("input[name='typeTrajet'][value='" + t + "']").prop("checked", true);
    }
    function majDestination() {
        var etr = estEtranger();
        $("#destNational").toggleClass("cx-hidden", etr);
        $("#destEtranger").toggleClass("cx-hidden", !etr);
        if (etr) {
            var liste = COT.PAYS[typeTrajet()], cur = $("#paysDest").val();
            $("#paysDest").html("<option value=''>Choisir un pays…</option>" + $.map(liste, function (p) {
                return "<option" + (p === cur ? " selected" : "") + ">" + U.esc(p) + "</option>";
            }).join(""));
        }
        majLivraison();
    }
    function majLivraison() {
        /* destination sans bureau : livraison à domicile imposée */
        var v = $("#villeDest").val(), sans = !estEtranger() && v && !REF.agencesDe(v).length;
        if (sans) $("input[name='livraison'][value='DOMICILE']").prop("checked", true);
        $("input[name='livraison'][value='BUREAU']").prop("disabled", !!sans || state.lecture).closest(".cx-seg-item").toggleClass("cf-off", !!sans);
        $("#sansBureauDest").toggleClass("cx-hidden", !sans);
        $("#blocDomicile").toggleClass("cx-hidden", $("input[name='livraison']:checked").val() !== "DOMICILE");
    }
    $("#villeDep").on("change", function () { remplirBureaux($("#bureauDep"), $(this).val()); majTrajetAuto(); majDestination(); });
    $("#villeDest").on("change", function () { remplirBureaux($("#bureauDest"), $(this).val()); majTrajetAuto(); majDestination(); });
    $("#segTrajet").on("change", "input", function () {
        var deduit = COT.deduireTrajet($("#villeDep").val(), $("#villeDest").val());
        /* revenir sur le type déduit réactive le mode automatique */
        state.trajetManuel = $(this).val() !== deduit;
        $("#trajetAutoInfo").text(state.trajetManuel ? "· choisi manuellement" : "· déduit des villes, modifiable");
        majDestination();
    });
    $("#segLivraison").on("change", "input", majLivraison);

    /* --- tarification automatique --- */
    $("#tarifAuto").on("change", function () {
        if (!this.checked && dernierCalc) {
            /* passage en saisie manuelle : on part des montants calculés */
            $("#in-transport").val(U.fmt(dernierCalc.r.transportAuto));
            $("#in-livraison").val(U.fmt(dernierCalc.r.livraisonAuto));
        }
    });

    /* --- FRET --- */
    $("#vehicules").on("change", "input", function () {
        var p = COT.PRIX_VEHICULE[$(this).val()];
        $("#vehiculeCtrl").data("touched", true);
        if (p) {
            // TODO API : GET /commercial/tarifs/fret?vehicule=...  (prix / jour et forfait carburant du paramétrage)
            $("#prixJour").val(U.fmt(p.jour));
            $("#carburantJour").val(U.fmt(p.carburant));
        }
    });
    $("#segModeFret").on("change", "input", function () {
        var zone = $(this).val() === "ZONE";
        $("#fretTrajet").toggleClass("cx-hidden", zone);
        $("#fretZone").toggleClass("cx-hidden", !zone);
        if (zone && !$("#fZoneVille").val()) $("#fZoneVille").val($("#fVilleDep").val());
    });

    /* =================================================================
       Enregistrement
       ================================================================= */
    function enregistrer(statut, $btn) {
        if (state.lecture) return;
        state.tente = true;
        var calc = recalc();
        if (calc.errs.length) {
            U.toast(calc.errs.length + " champ(s) à corriger avant d'enregistrer.", "error");
            var $first = $("#formCot .has-error").first();
            if ($first.length) $("html, body").animate({ scrollTop: $first.offset().top - 140 }, 200);
            return;
        }
        var d = calc.d, r = calc.r, existant = state.cot;
        d.remisePct = state.type === "TARIFAIRE" ? 0 : r.remisePct;
        if (state.type === "EXPEDITION") {
            /* on fige les montants retenus (utilisés par le devis) */
            d.transport = r.transport; d.livraisonMt = r.livraison; d.remise = r.remise;
            d.poidsTaxable = r.poidsTaxable;
            var tg = state.tarif && state.tarif.grille;
            d.tarif = d.tarifAuto && tg ? {
                grilleId: tg.id, grilleCode: tg.code, grilleNom: tg.nom, origine: state.tarif.origine,
                contratId: state.tarif.contrat ? state.tarif.contrat.id : null, contratNumero: state.tarif.contrat ? state.tarif.contrat.numero : null,
                regle: r.calcTarif && r.calcTarif.regle ? r.calcTarif.regle.libelle : null
            } : null;
        }
        if (state.type === "FRET") d.calc = { location: r.location, chauffeur: r.chauffeur, carburant: r.carburant, manutention: r.manutention, frais: r.frais, remise: r.remise };

        var obj = existant ? JSON.parse(JSON.stringify(existant)) : { type: state.type, motifRejet: "", historique: [] };
        $.extend(obj, {
            nom: $.trim($("#nom").val()) || intituleAuto(d),
            clientId: parseInt($("#clientId").val(), 10),
            description: $.trim($("#description").val()),
            statut: statut,
            dateSoumission: statut === "SOUMISE" ? today : null,
            dateValidite: U.addDays(baseValidite(), d.validiteJours),
            montantHT: state.type === "TARIFAIRE" ? 0 : r.ht,
            montantTTC: state.type === "TARIFAIRE" ? 0 : r.ttc,
            details: d
        });
        if (!obj.description) obj.description = obj.nom;

        U.busy($btn, true);
        // TODO API : POST /commercial/cotations (création) ou PUT /commercial/cotations/{id} (modification)
        CX.api.save("cotations", obj)
            .then(function (saved) {
                obj = saved;
                return CX.api.log("cotations", saved.id, existant ? "Cotation modifiée" : "Cotation enregistrée");
            })
            .then(function () {
                return statut === "SOUMISE" ? CX.api.log("cotations", obj.id, "Soumise au responsable pour validation") : obj;
            })
            .done(function () {
                var msg = "Cotation <b>" + U.esc(obj.numero) + "</b> " + (statut === "SOUMISE" ? "enregistrée et soumise au responsable." : "enregistrée.") +
                    " <a href='cotation-document.html?id=" + obj.id + "' style='color:#93c5fd'>Voir le devis</a>";
                COT.flash(msg);
                U.toast(msg);
                setTimeout(function () {
                    location.href = "cotations-liste.html?onglet=" + (statut === "SOUMISE" ? "SOUMISES" : "ENREGISTREES");
                }, 500);
            })
            .fail(function (e) { U.busy($btn, false); U.toast("Enregistrement impossible : " + U.esc(e), "error"); });
    }
    $("#btnEnregistrer").on("click", function () { enregistrer("ENREGISTREE", $(this)); });
    $("#btnSoumettre").on("click", function () {
        var $b = $(this);
        U.confirm({
            title: "Enregistrer et soumettre",
            message: "La cotation sera transmise au responsable pour validation et <b>ne sera plus modifiable</b>.",
            okText: "Soumettre"
        }).done(function () { enregistrer("SOUMISE", $b); });
    });

    /* =================================================================
       Remplissage (nouvelle cotation ou modification)
       ================================================================= */
    function valeursParDefaut() {
        var u = CX.CONFIG.USER;
        $("#validiteJours").val(CX.CONFIG.VALIDITE_COTATION_JOURS);
        if (state.type === "EXPEDITION") {
            $("#villeDep").val(u.ville); remplirBureaux($("#bureauDep"), u.ville, u.agence);
            remplirBureaux($("#bureauDest"), "");
            ajouterColis();
        } else if (state.type === "FRET") {
            $("#dateDebut").val(U.addDays(today, 1));
            $("#fVilleDep").val(u.ville); $("#fZoneVille").val(u.ville);
            $("#chauffeurJour").val(U.fmt(COT.OPTIONS_FRET.chauffeurJour));
            $("#manutJour").val(U.fmt(COT.OPTIONS_FRET.manutentionnaireJour));
        } else {
            $("#dateEffet").val(today);
            $("#pfVilleDep").val(u.ville);
            remplirGrille([]);
        }
    }

    function remplir(c) {
        var d = c.details || {};
        $("#nom").val(c.nom); $("#description").val(c.description === c.nom ? "" : c.description);
        $("#validiteJours").val(d.validiteJours || U.daysBetween(c.dateCreation, c.dateValidite) || CX.CONFIG.VALIDITE_COTATION_JOURS);
        state.expAuto = false;

        if (c.type === "EXPEDITION") {
            var deduit = COT.deduireTrajet(d.villeDep, d.villeDest), tt = d.typeTrajet || deduit;
            state.trajetManuel = tt !== deduit;
            $("input[name='typeTrajet'][value='" + tt + "']").prop("checked", true);
            $("#villeDep").val(d.villeDep); remplirBureaux($("#bureauDep"), d.villeDep, d.bureauDep);
            $("#villeDest").val(d.villeDest || ""); remplirBureaux($("#bureauDest"), d.villeDest, d.bureauDest);
            majDestination();
            $("#paysDest").val(d.paysDest || ""); $("#villeDestLibre").val(d.villeDestLibre || "");
            $("input[name='livraison'][value='" + (d.livraison === "DOMICILE" ? "DOMICILE" : "BUREAU") + "']").prop("checked", true);
            $("#quartier").val(d.quartier || ""); $("#zone").val(d.zone || ""); $("#repere").val(d.repere || "");
            majLivraison();
            $("#express").prop("checked", !!d.express);
            $("#colisList").empty();
            $.each(d.colis && d.colis.length ? d.colis : [{}], function (_, k) { ajouterColis(k); });
            var e = d.expediteur || {}, t = d.destinataire || {};
            $("#expNom").val(e.nom || ""); $("#expTel").val(e.tel || ""); $("#expAdresse").val(e.adresse || ""); $("#expEmail").val(e.email || "");
            $("#destNom").val(t.nom || ""); $("#destTel").val(t.tel || ""); $("#destAdresse").val(t.adresse || ""); $("#destEmail").val(t.email || "");
            if (e.adresse || e.email) $("[data-toggle-bloc='#expPlus']").trigger("click");
            if (t.adresse || t.email) $("[data-toggle-bloc='#destPlus']").trigger("click");
            $("#tarifAuto").prop("checked", d.tarifAuto === true);
            $("#in-transport").val(U.fmt(d.transport || 0)); $("#in-livraison").val(U.fmt(d.livraisonMt || 0));
            $("#in-emballage").val(U.fmt(d.emballage || 0)); $("#in-autres").val(U.fmt(d.autres || 0));
        } else if (c.type === "FRET") {
            /* données historiques (sans détail d.calc) : le prix / jour inclut déjà les options */
            var pv = COT.PRIX_VEHICULE[d.vehicule] || {}, legacy = !d.calc;
            if (legacy) { d = $.extend({}, d, { chauffeurJour: d.chauffeurJour || 0, carburantJour: d.carburantJour || 0, manutJour: d.manutJour || 0 }); }
            $("input[name='vehicule']").filter(function () { return this.value === d.vehicule; }).prop("checked", true);
            $("#dateDebut").val(d.dateDebut || ""); $("#nbJours").val(d.nbJours || 1);
            var mode = d.mode === "ZONE" ? "ZONE" : "TRAJET";
            $("input[name='modeFret'][value='" + mode + "']").prop("checked", true).trigger("change");
            if (mode === "TRAJET") { $("#fVilleDep").val(d.villeDep || ""); $("#fVilleDest").val(d.villeDest || ""); }
            else { $("#fZoneVille").val(d.villeDep || ""); $("#fZone").val(d.zone || ""); }
            $("#prixJour").val(U.fmt(d.prixJour || pv.jour || 0));
            $("#chauffeur").prop("checked", !!d.chauffeur); $("#chauffeurJour").val(U.fmt(d.chauffeurJour != null ? d.chauffeurJour : COT.OPTIONS_FRET.chauffeurJour));
            $("#carburant").prop("checked", !!d.carburant); $("#carburantJour").val(U.fmt(d.carburantJour != null ? d.carburantJour : (pv.carburant || 0)));
            $("#manutention").val(d.manutention || 0); $("#manutJour").val(U.fmt(d.manutJour != null ? d.manutJour : COT.OPTIONS_FRET.manutentionnaireJour));
            $("#frais").val(U.fmt(d.frais || 0)); $("#fraisLibelle").val(d.fraisLibelle || "");
        } else {
            $("#dateEffet").val(d.dateEffet || "");
            $("#remiseGlobale").val(d.remiseGlobale || 0);
            $("#pfVilleDep").val(d.lignes && d.lignes[0] ? d.lignes[0].villeDep : CX.CONFIG.USER.ville);
            remplirGrille(d.lignes || []);
        }
        /* client en dernier (son handler lit les champs déjà remplis) */
        $("#clientId").val(c.clientId).trigger("change");
    }

    /* Mode lecture : statut ≠ ENREGISTREE */
    function passerEnLecture(c) {
        state.lecture = true;
        $("#f-lecture").removeClass("cx-hidden");
        $("#f-lectureTexte").html("Cette cotation est au statut <b>" + U.esc((REF.STATUT_COTATION[c.statut] || {}).label || c.statut) +
            "</b> : elle n'est plus modifiable. <a href='cotation-document.html?id=" + c.id + "'>Voir le devis</a> · " +
            "dupliquez-la depuis la liste pour en créer une nouvelle version.");
        $("#formCot").find("input, select, textarea, button").not("#btnAnnuler").prop("disabled", true);
        $("#clientId").prop("disabled", true).trigger("change.select2");
        $("#btnSoumettre, #btnEnregistrer").addClass("cx-hidden");
        $("#btnAnnuler").html("<i class='fa fa-arrow-left'></i> Retour à la liste");
        $("[data-toggle-bloc], [data-del-colis]").hide();
        $("#btnAddColis, #btnAddLigne, #btnPrefill").addClass("cx-hidden");
    }

    /* =================================================================
       Démarrage
       ================================================================= */
    var idParam = U.queryParam("id");
    if (idParam) {
        // TODO API : GET /commercial/cotations/{id}
        CX.api.get("cotations", idParam).done(function (c) {
            state.cot = c;
            state.type = c.type;
            state.lecture = c.statut !== "ENREGISTREE";
            /* remise figée à l'enregistrement (0 pour les cotations historiques sans détail) */
            state.remiseFigee = c.details && c.details.remisePct != null ? c.details.remisePct : 0;
            appliquerType();
            remplir(c);
            if (state.lecture) passerEnLecture(c);
            recalc();
        }).fail(function (e) {
            COT.flash("Cotation introuvable (" + U.esc(e) + ").", "error");
            location.href = "cotations-liste.html";
        });
    } else {
        var t = (U.queryParam("type") || "EXPEDITION").toUpperCase();
        state.type = TITRES[t] ? t : "EXPEDITION";
        appliquerType();
        majTarif();
        valeursParDefaut();
        majDestination();
        var cid = U.queryParam("client");
        if (cid && COT.client(cid)) $("#clientId").val(cid).trigger("change");
        else recalc();
    }
});

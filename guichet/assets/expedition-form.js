/* =====================================================================
   ClemenTino 2.0 - Module GUICHET - saisie d'une expédition au comptoir
   (guichet/expedition-form.html[?id=][&recu=1])
   ---------------------------------------------------------------------
   Portage jQuery / ES5 de la maquette « Nouvelle expédition, guichet » :
     - démarrage rapide : pré-enregistrement (QR / n°) et « Remplir depuis
       un message client » (extraction par expressions régulières) ;
     - type de client : Particulier (comptant) ou Client en compte (NATEX) ;
     - 1 Trajet (type d'expédition, départ = bureau de l'utilisateur,
       destination, remise bureau / domicile, zone, repère, n° de LT manuel
       = feuille du carnet du client, bordereau) ;
     - 2 Colis (nature, poids réel, L × l × H, nombre, valeur, description ;
       poids volumétrique L×l×H/diviseur, poids taxable au kg supérieur) ;
     - 3 Expéditeur et destinataire (WhatsApp, adresse, email) ;
     - colonne « LETTRE DE TRANSPORT » : statut, route, étiquettes,
       tarification automatique (moteur CX.tarifs : grille du client ou
       standard ; repli sur le tarif de la maquette), montants, paiement,
       champs obligatoires manquants cliquables, Enregistrer / Annuler ;
     - après enregistrement : reçu A4 (CX.recu), Imprimer, PDF, WhatsApp,
       Corriger la saisie, Nouvelle expédition.
   ?id= recharge une expédition pour correction (interdite si livrée,
   facturée ou annulée) ; &recu=1 affiche directement son reçu.
   ===================================================================== */
$(function () {
    var U = CX.util, REF = CX.REF, G = CX.guichet, T = CX.tarifs || null, today = U.today();
    var USER = CX.CONFIG.USER;

    var state = {
        id: null,            // expédition en cours de correction
        orig: null,          // expédition telle qu'enregistrée
        client: null,        // client en compte sélectionné
        tarif: null,         // CX.tarifs.resoudre(...)
        calc: null,          // dernier calcul
        manquants: [],
        expDepuisClient: false,  // expéditeur pré-rempli depuis la fiche client
        feuille: null,       // dernier contrôle de la feuille de carnet
        saved: null          // expédition enregistrée affichée en reçu
    };
    var uidColis = 0;

    /* Pré-enregistrements (démo) - TODO API : GET /guichet/pre-enregistrements/{code} */
    var PREENREGISTREMENTS = {
        "PRE-0042": {
            service: "NATIONALE", villeDest: "YAOUNDE", livraison: "DOMICILE", quartier: "Bastos", zone: "Z1", repere: "Face à la boulangerie du carrefour",
            exp: { nom: "Mireille Ngassa", tel: "699001122" }, dst: { nom: "Paul Etoundi", tel: "677003344" },
            colis: [{ nature: "Colis", poids: 4, L: 40, l: 30, H: 25, nombre: 1, valeur: 25000, description: "Vêtements et chaussures" }]
        },
        "PRE-0043": {
            service: "URBAINE", livraison: "DOMICILE", quartier: "Bonapriso", zone: "Z1", repere: "Devant la pharmacie du carrefour",
            exp: { nom: "Aïcha Njoya", tel: "655123456" }, dst: { nom: "Serge Biyong", tel: "690112233" },
            colis: [{ nature: "Pli fermé", poids: 0.5, nombre: 1, valeur: 0, description: "Documents" }]
        }
    };

    /* =================================================================
       Référentiels -> listes
       ================================================================= */
    function optionsVilles($sel, vide) {
        $sel.html((vide ? "<option value=''>" + vide + "</option>" : "") + $.map(REF.VILLES, function (v) {
            return "<option value='" + U.esc(v.nom) + "'>" + U.esc(G.villeNom(v.nom)) + "</option>";
        }).join(""));
    }
    function optionsBureaux($sel, ville) {
        var ags = ville ? REF.agencesDe(ville) : [];
        $sel.html(ags.length ? $.map(ags, function (a) { return "<option value='" + U.esc(a.nom) + "'>" + U.esc(G.titre(a.nom)) + "</option>"; }).join("")
            : "<option value=''>Aucun bureau</option>").prop("disabled", !ags.length);
        return ags.length;
    }
    function optionsPays(service) {
        var zones = T ? T.ZONES : [{ code: "CEMAC", trajet: "REGIONAL", pays: ["Gabon", "Tchad", "Congo", "République centrafricaine", "Guinée équatoriale"] },
            { code: "AUTRES", trajet: "INTERNATIONAL", pays: ["Nigeria", "France", "Belgique", "États-Unis", "Chine"] }];
        var trajet = service === "REGIONALE" ? "REGIONAL" : "INTERNATIONAL", cur = $("#paysDest").val();
        var opts = ["<option value=''>Choisir le pays…</option>"];
        $.each(zones, function (_, z) {
            if (z.trajet !== trajet) return;
            opts.push("<optgroup label='" + U.esc(z.label || z.code) + "'>" + $.map(z.pays, function (p) { return "<option>" + U.esc(p) + "</option>"; }).join("") + "</optgroup>");
        });
        $("#paysDest").html(opts.join("")).val(cur && $("#paysDest option").filter(function () { return this.value === cur; }).length ? cur : "");
    }
    function optionsBordereaux() {
        // TODO API : GET /exploitation/bordereaux?villeDep=&villeDest=&statut=OUVERT (prochains départs)
        var cur = $("#bordereau").val(), dep = $("#villeDep").val(), dst = estEtranger() ? "" : $("#villeDest").val();
        var opts = "<option value=''>Affecter plus tard</option>";
        if (dep && (dst || estEtranger())) {
            var lib = "Prochain départ " + G.villeNom(dep) + " vers " + (estEtranger() ? ($("#paysDest").val() || "l'étranger") : G.villeNom(dst));
            opts += "<option value='B-" + U.esc(dep) + "-" + U.esc(dst || "ETR") + "'>" + U.esc(lib) + "</option>";
        }
        $("#bordereau").html(opts).val(cur && $("#bordereau option[value='" + cur + "']").length ? cur : "");
    }

    optionsVilles($("#villeDep"));
    optionsVilles($("#villeDest"));
    $("#zone").html($.map(REF.ZONES_LIVRAISON, function (z) { return "<option value='" + z.code + "'>" + U.esc(z.nom) + "</option>"; }).join(""));
    $("#payMode").html($.map(REF.MODES_PAIEMENT, function (m) { return "<option" + (m === "Espèces" ? " selected" : "") + ">" + U.esc(m) + "</option>"; }).join(""));

    /* Départ = bureau de l'utilisateur connecté */
    $("#villeDep").val(USER.ville);
    optionsBureaux($("#bureauDep"), USER.ville);
    $("#bureauDep").val(USER.agence);
    $("#villeDest").val(autreVille(USER.ville));
    optionsBureaux($("#bureauDest"), $("#villeDest").val());

    function autreVille(v) { return v === "YAOUNDE" ? "DOUALA" : "YAOUNDE"; }

    /* Clients en compte (Select2) */
    $.each(CX.api.clientsSync(), function (_, c) {
        if (!c.enCompte || c.statut === "INACTIF") return;
        $("#gx-client").append($("<option>").val(c.id).text(c.raisonSociale)
            .attr("data-sub", (c.code || "") + (c.sigle ? " · " + c.sigle : "") + " · " + G.villeNom(c.ville) + (c.statut !== "ACTIF" ? " · " + c.statut.toLowerCase() : "")));
    });
    $("#gx-client").select2({
        width: "100%", placeholder: "Rechercher un client en compte…", allowClear: true,
        templateResult: function (o) {
            if (!o.id) return o.text;
            return $("<div><div style='font-weight:600'>" + U.esc(o.text) + "</div><small style='opacity:.7'>" + U.esc($(o.element).attr("data-sub")) + "</small></div>");
        }
    });

    /* =================================================================
       Lecture de l'écran
       ================================================================= */
    function typeClient() { return $("input[name=typeClient]:checked").val(); }
    function service() { return $("input[name=service]:checked").val(); }
    function estEtranger() { var s = service(); return s === "REGIONALE" || s === "INTERNATIONALE"; }
    function domicile() { return $("input[name=livraison]:checked").val() === "DOMICILE"; }
    function chiffres(v) { return String(v || "").replace(/\D/g, "").length; }
    function diviseur() { return state.tarif && state.tarif.grille && T ? T.diviseurDe(state.tarif.grille) : 5000; }

    function lireColis() {
        return $("#gx-colis-list .gx-colis").map(function () {
            var $c = $(this);
            return {
                uid: $c.data("uid"),
                nature: $c.find("input[type=radio]:checked").val() || "Colis",
                poids: $.trim($c.find("[data-f=poids]").val()), L: $.trim($c.find("[data-f=L]").val()),
                l: $.trim($c.find("[data-f=l]").val()), H: $.trim($c.find("[data-f=H]").val()),
                nombre: Math.max(1, parseInt($c.find("[data-f=nombre]").val(), 10) || 1),
                valeur: $.trim($c.find("[data-f=valeur]").val()), description: $.trim($c.find("[data-f=description]").val())
            };
        }).get();
    }
    /* Poids d'un colis : volumétrique = L × l × H / diviseur ; taxable = max(réel, vol) arrondi au kg supérieur */
    function poidsColis(c) {
        var reel = U.num(c.poids), vol = U.num(c.L) * U.num(c.l) * U.num(c.H) / diviseur();
        var tax = Math.max(0, Math.ceil(Math.max(reel, vol) - 1e-9));
        return { reel: reel, vol: Math.round(vol * 10) / 10, tax: tax, volGagne: vol > reel };
    }

    function lire() {
        var etr = estEtranger();
        return {
            typeClient: typeClient(), clientId: typeClient() === "COMPTE" && state.client ? state.client.id : null,
            service: service(),
            villeDep: $("#villeDep").val(), bureauDep: $("#bureauDep").val() || "",
            villeDest: etr ? "" : $("#villeDest").val(), bureauDest: etr ? "" : ($("#bureauDest").val() || ""),
            paysDest: etr ? $("#paysDest").val() || "" : "", villeEtranger: etr ? $.trim($("#villeEtranger").val()) : "",
            livraison: domicile() ? "DOMICILE" : "BUREAU",
            quartier: $.trim($("#quartier").val()), zone: $("#zone").val(), repere: $.trim($("#repere").val()), telLiv: G.tel($("#telLiv").val()),
            nRtMan: $.trim($("#nRtMan").val()), bordereau: $("#bordereau").val() || "",
            colis: lireColis(),
            exp: { nom: $.trim($("#expNom").val()), tel: G.tel($("#expTel").val()), same: $("#expSame").is(":checked"), wa: G.tel($("#expWa").val()),
                adresse: $.trim($("#expAdresse").val()), email: $.trim($("#expEmail").val()) },
            dst: { nom: $.trim($("#dstNom").val()), tel: G.tel($("#dstTel").val()), same: $("#dstSame").is(":checked"), wa: G.tel($("#dstWa").val()),
                adresse: $.trim($("#dstAdresse").val()), email: $.trim($("#dstEmail").val()) },
            tarifAuto: $("#tarifAuto").is(":checked"),
            transportM: U.num($("#m-transport").val()), livraisonM: U.num($("#m-livraison").val()),
            emballage: U.round(U.num($("#m-emballage").val())), autres: U.round(U.num($("#m-autres").val())),
            payMode: $("#payMode").val(), payRecu: U.num($("#payRecu").val()), payRef: $.trim($("#payRef").val())
        };
    }

    /* =================================================================
       Tarification
       Moteur des Tarifaires (grille du contrat > du client > du groupe >
       standard) ; repli sur la règle de la maquette si aucune règle ne
       couvre l'envoi : 1 500 F + 500 F par kg taxable et par colis,
       livraison selon la zone.
       ================================================================= */
    function majTarif() {
        if (!T) { state.tarif = null; return; }
        // TODO API : GET /commercial/tarifs/resoudre?client={id}&date={date}
        state.tarif = T.resoudre(typeClient() === "COMPTE" && state.client ? state.client.id : null, state.orig ? state.orig.dateExp : today);
        $("#colisSub").text("Poids taxable = le plus grand du poids réel et du poids volumétrique (L × l × H / " + U.fmt(diviseur()) + "), arrondi au kg supérieur");
    }

    function calculer(d) {
        var S = G.SERVICES[d.service], r = { nb: 0, tax: 0, colis: [], source: "GUICHET", res: null };
        var designTransport = 0;
        $.each(d.colis, function (_, c) {
            var p = poidsColis(c);
            r.colis.push(p);
            r.nb += c.nombre; r.tax += p.tax * c.nombre;
            if (p.tax > 0) designTransport += c.nombre * (1500 + 500 * p.tax);
        });
        var zone = $.grep(REF.ZONES_LIVRAISON, function (z) { return z.code === d.zone; })[0];
        var designLivraison = d.livraison === "DOMICILE" ? (zone ? zone.prix : 0) : 0;
        r.transportAuto = designTransport; r.livraisonAuto = designLivraison;

        var g = state.tarif && state.tarif.grille;
        if (T && g && r.tax > 0) {
            var res = T.calculer(g, {
                typeTrajet: S.trajet, villeDep: d.villeDep, villeDest: d.villeDest, paysDest: d.paysDest,
                livraison: d.livraison, zone: d.zone,
                colis: $.map(d.colis, function (c, i) { return { nature: c.nature, poids: r.colis[i].tax, nombre: c.nombre, valeur: U.num(c.valeur) }; })
            });
            r.res = res;
            /* toutes les lignes de colis doivent être couvertes par une règle de la grille */
            if (res.regle && res.regles.length === $.grep(r.colis, function (p) { return p.tax > 0; }).length) {
                r.source = "GRILLE";
                r.transportAuto = res.parts.transport + res.parts.supplements + res.parts.assurance;
                r.livraisonAuto = res.parts.livraison;
            }
        }
        r.transport = U.round(d.tarifAuto ? r.transportAuto : d.transportM);
        r.livraison = U.round(d.tarifAuto ? r.livraisonAuto : d.livraisonM);
        if (!d.tarifAuto && d.livraison !== "DOMICILE") r.livraison = U.round(d.livraisonM);
        r.emballage = d.emballage; r.autres = d.autres;
        r.total = r.transport + r.livraison + r.emballage + r.autres;
        r.zone = zone;
        return r;
    }

    /* =================================================================
       Colis
       ================================================================= */
    function colisHtml(c) {
        var uid = ++uidColis, nat = c.nature || "Colis";
        var natures = REF.NATURES_COLIS.slice();
        if ($.inArray(nat, natures) < 0) natures.push(nat);
        return "<div class='gx-colis' data-uid='" + uid + "'>" +
            "<div class='gx-colis-head'><b class='gx-colis-titre'>Colis</b>" +
            "<button type='button' class='cx-btn cx-btn-danger cx-btn-icon' data-del aria-label='Retirer ce colis' title='Retirer ce colis'><i class='fa fa-trash-o'></i></button></div>" +
            "<p class='cx-section-label'>Nature</p>" +
            "<div class='cx-pills' role='radiogroup' aria-label='Nature du colis'>" + $.map(natures, function (n) {
                return "<label class='cx-pill'><input type='radio' name='nature-" + uid + "' value='" + U.esc(n) + "'" + (n === nat ? " checked" : "") + "><span>" + U.esc(n) + "</span></label>";
            }).join("") + "</div>" +
            "<div class='gx-colis-grid'>" +
            "<div class='cx-field gx-c-poids'><label class='cx-label' for='c-poids-" + uid + "'>Poids réel (kg)</label>" +
            "<input type='text' class='form-control gx-tab' id='c-poids-" + uid + "' data-f='poids' inputmode='decimal' value='" + U.esc(c.poids == null ? "" : c.poids) + "'></div>" +
            "<div class='cx-field gx-c-dims'><span class='cx-label' id='c-dim-" + uid + "'>Dimensions L × l × H (cm)</span>" +
            "<div class='gx-dims' role='group' aria-labelledby='c-dim-" + uid + "'>" +
            "<input type='text' class='form-control gx-tab' data-f='L' inputmode='decimal' aria-label='Longueur en centimètres' placeholder='L' value='" + U.esc(c.L || "") + "'>" +
            "<input type='text' class='form-control gx-tab' data-f='l' inputmode='decimal' aria-label='Largeur en centimètres' placeholder='l' value='" + U.esc(c.l || "") + "'>" +
            "<input type='text' class='form-control gx-tab' data-f='H' inputmode='decimal' aria-label='Hauteur en centimètres' placeholder='H' value='" + U.esc(c.H || "") + "'></div></div>" +
            "<div class='cx-field gx-c-nb'><span class='cx-label' id='c-nb-" + uid + "'>Nombre</span>" +
            "<div class='cx-stepper' role='group' aria-labelledby='c-nb-" + uid + "'><button type='button' data-step='-1' aria-label='Un colis de moins'>−</button>" +
            "<input type='text' data-f='nombre' value='" + (parseInt(c.nombre, 10) || 1) + "' inputmode='numeric' aria-live='polite' aria-label='Nombre de colis'>" +
            "<button type='button' data-step='1' aria-label='Un colis de plus'>+</button></div></div>" +
            "<div class='cx-field gx-c-val'><label class='cx-label' for='c-val-" + uid + "'>Valeur déclarée (FCFA)</label>" +
            "<input type='text' class='form-control gx-tab' id='c-val-" + uid + "' data-f='valeur' inputmode='numeric' value='" + U.esc(c.valeur || "") + "'></div>" +
            "</div>" +
            "<div class='gx-c-desc'><div class='cx-field'><label class='cx-label' for='c-desc-" + uid + "'>Description <span class='cx-opt'>(facultatif)</span></label>" +
            "<input type='text' class='form-control' id='c-desc-" + uid + "' data-f='description' maxlength='120' placeholder='Contenu du colis' value='" + U.esc(c.description || "") + "'></div></div>" +
            "<div class='gx-poids'><div class='gx-poids-bars'>" +
            "<div class='gx-poids-bar' data-bar='reel'><span>Poids réel</span><div class='cx-bar'><i style='width:0'></i></div><b>0 kg</b></div>" +
            "<div class='gx-poids-bar' data-bar='vol'><span>Poids volumétrique</span><div class='cx-bar'><i style='width:0'></i></div><b>0 kg</b></div></div>" +
            "<div class='gx-taxable'><small>Poids taxable</small><b data-tax>0 kg</b><em data-basis>Saisir poids ou dimensions</em></div></div>" +
            "</div>";
    }
    function ajouterColis(c, focus) {
        var $c = $(colisHtml(c || {})).appendTo("#gx-colis-list");
        renumeroter();
        majPoids($c);
        if (focus) $c.find("[data-f=poids]").focus();
        return $c;
    }
    function renumeroter() {
        var $all = $("#gx-colis-list .gx-colis");
        $all.each(function (i) { $(this).find(".gx-colis-titre").text("Colis " + (i + 1)); });
        $all.find("[data-del]").toggleClass("cx-hidden", $all.length < 2);
    }
    function majPoids($c) {
        var c = lireColis()[$c.index()], p = poidsColis(c), top = Math.max(p.reel, p.vol, 0.001);
        $c.find("[data-bar=reel]").toggleClass("win", !p.volGagne).find("i").css("width", Math.round(p.reel / top * 100) + "%");
        $c.find("[data-bar=reel] b").text(G.kg(p.reel));
        $c.find("[data-bar=vol]").toggleClass("win", p.volGagne).find("i").css("width", Math.round(p.vol / top * 100) + "%");
        $c.find("[data-bar=vol] b").text(G.kg(p.vol));
        $c.find("[data-tax]").text(G.kg(p.tax));
        $c.find("[data-basis]").text(p.tax === 0 ? "Saisir poids ou dimensions" : (p.volGagne ? "Base : volume" : "Base : poids réel"));
    }

    /* =================================================================
       Trajet : cohérence service / villes / remise
       ================================================================= */
    function majDestination() {
        var etr = estEtranger();
        $("#gx-dest-nat").toggleClass("cx-hidden", etr);
        $("#gx-dest-etr").toggleClass("cx-hidden", !etr);
        if (etr) optionsPays(service());
        var nbBureaux = etr ? 1 : optionsBureauxGarde($("#bureauDest"), $("#villeDest").val());
        /* Ville sans bureau : livraison à domicile obligatoire */
        var sansBureau = !etr && !nbBureaux;
        $("#gx-sans-bureau").toggleClass("cx-hidden", !sansBureau);
        $("input[name=livraison][value=BUREAU]").prop("disabled", sansBureau).closest(".cx-seg-item").css("opacity", sansBureau ? .45 : 1);
        if (sansBureau && !domicile()) $("input[name=livraison][value=DOMICILE]").prop("checked", true);
        $("#gx-domicile").toggleClass("cx-hidden", !domicile());
        optionsBordereaux();
    }
    function optionsBureauxGarde($sel, ville) {
        var cur = $sel.val(), n = optionsBureaux($sel, ville);
        if (cur && $sel.find("option[value='" + cur + "']").length) $sel.val(cur);
        return n;
    }
    function choisirService(sv) {
        $("input[name=service][value=" + sv + "]").prop("checked", true);
        var dep = $("#villeDep").val();
        if (sv === "URBAINE") { $("#villeDest").val(dep); $("input[name=livraison][value=DOMICILE]").prop("checked", true); }
        if (sv === "NATIONALE" && $("#villeDest").val() === dep) $("#villeDest").val(autreVille(dep));
        majDestination();
    }

    /* =================================================================
       Client en compte / particulier
       ================================================================= */
    function majTypeClient() {
        var compte = typeClient() === "COMPTE";
        $("#gx-carte-client").toggleClass("cx-hidden", !compte);
        $("#contactsSub").toggleClass("cx-hidden", !compte);
        $("#gx-pay-comptant").toggleClass("cx-hidden", compte);
        $("#gx-pay-compte").toggleClass("cx-hidden", !compte);
        $("#l-nRtMan").html(compte ? "N° de LT manuel <span class='cx-opt'>(feuille du carnet du client)</span>" : "N° reçu transport manuel <span class='cx-opt'>(facultatif)</span>");
        if (!compte) {
            if (state.client) $("#gx-client").val("").trigger("change.select2");
            choisirClient(null);
        } else choisirClient(state.client);
    }
    function choisirClient(c) {
        var avant = state.client;
        state.client = c;
        var compte = typeClient() === "COMPTE";
        /* expéditeur : pré-rempli depuis la fiche, effacé si on change de client */
        if (state.expDepuisClient && (!c || !compte || (avant && c && avant.id !== c.id))) {
            $("#expNom, #expTel, #expAdresse, #expEmail").val("");
            state.expDepuisClient = false;
        }
        if (c && compte && !$.trim($("#expNom").val())) {
            var p = (c.contacts || [])[0] || {};
            $("#expNom").val(c.raisonSociale);
            $("#expTel").val(G.telFmt(G.tel(p.tel1 || c.telStandard)));
            $("#expAdresse").val(c.adresse || c.localisation || "");
            $("#expEmail").val(c.email || "");
            state.expDepuisClient = true;
        }
        var info = [], alerte = "";
        if (c && compte) {
            info.push("<span><b>" + U.esc(c.code) + "</b>" + (c.sigle ? " · " + U.esc(c.sigle) : "") + "</span>");
            info.push("<span>" + U.esc(G.villeNom(c.ville)) + "</span>");
            info.push("<span>Délai de paiement <b>" + (c.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS) + " j</b></span>");
            info.push("<span><a href='" + G.lienCommercial("client-fiche.html?id=" + c.id) + "' target='_blank' rel='noopener'>Fiche client <i class='fa fa-external-link'></i></a></span>");
            if (c.statut === "SUSPENDU") alerte = "Compte <b>suspendu</b> : les expéditions en compte sont bloquées. Enregistrez l'envoi au comptant (Particulier) ou faites réactiver le compte.";
            $("#payCompteInfo").html("<br>" + U.esc(c.raisonSociale) + " · facture " + U.esc((c.periodicite || "mensuelle").toLowerCase()) + ", échéance " + (c.delaiPaiement || CX.CONFIG.DELAI_PAIEMENT_JOURS) + " jours.");
        } else {
            info.push("<span>Recherchez par raison sociale, sigle ou code client.</span>");
            $("#payCompteInfo").html("");
        }
        $("#gx-client-info").html(info.join(""));
        $("#gx-client-alerte").toggleClass("cx-hidden", !alerte).find("div").html(alerte);
        majTarif();
        majFeuille();
        recalc();
    }

    /* Contrôle de la feuille de carnet (client en compte) */
    function majFeuille() {
        var compte = typeClient() === "COMPTE", c = state.client, v = $.trim($("#nRtMan").val());
        var $i = $("#nRtManInfo").removeClass("gx-feuille-ok gx-feuille-err gx-feuille-warn");
        state.feuille = null;
        if (!compte) { $i.html(""); $("#nRtMan").attr("placeholder", ""); return; }
        if (!c) { $i.html("Sélectionnez d'abord le client."); return; }
        var carnets = G.carnets.duClient(c.id);
        var pro = G.carnets.prochaine(c.id);
        $("#nRtMan").attr("placeholder", pro ? pro.libelle : "");
        if (!carnets.length) {
            $i.html(G.carnets.dispo() ? "Aucun carnet de LT remis à ce client : n° facultatif." : "Carnets indisponibles sur ce poste.");
            if (v) state.feuille = G.carnets.verifier(c.id, v, state.id, state.orig && state.orig.nRtMan);
            if (state.feuille && !state.feuille.ok) $i.addClass("gx-feuille-err").html("<i class='fa fa-times-circle'></i> " + U.esc(state.feuille.erreur));
            return;
        }
        if (!v) {
            $i.html(pro ? "Prochaine feuille attendue : <a class='gx-proposer' data-feuille='" + pro.numero + "'>" + U.esc(pro.libelle) + "</a> (carnet " + U.esc(pro.carnet.numero) + ")"
                : "Plus aucune feuille disponible dans les carnets du client.");
            return;
        }
        var r = state.feuille = G.carnets.verifier(c.id, v, state.id, state.orig && state.orig.nRtMan);
        if (!r.ok) $i.addClass("gx-feuille-err").html("<i class='fa fa-times-circle'></i> " + U.esc(r.erreur) +
            (pro && pro.numero !== r.numero ? " Prochaine feuille attendue : <a class='gx-proposer' data-feuille='" + pro.numero + "'>" + U.esc(pro.libelle) + "</a>." : ""));
        else if (r.avertissement) $i.addClass("gx-feuille-warn").html("<i class='fa fa-exclamation-triangle'></i> " + U.esc(r.avertissement));
        else $i.addClass("gx-feuille-ok").html("<i class='fa fa-check-circle'></i> Feuille du carnet " + U.esc(r.carnet.numero) + " (" + r.carnet.debut + " – " + r.carnet.fin + ")");
    }

    /* =================================================================
       Récapitulatif + champs obligatoires
       ================================================================= */
    function recalc() {
        var d = lire(), r = state.calc = calculer(d), S = G.SERVICES[d.service], etr = estEtranger();
        var dstVille = etr ? (d.villeEtranger || d.paysDest || "À PRÉCISER").toUpperCase() : G.villeAff(d.villeDest);
        var dstLieu = etr ? (d.paysDest || "Pays à préciser") : (d.livraison === "DOMICILE" ? "Quartier " + (d.quartier || "…") : "Bureau " + G.titre(d.bureauDest));
        var zoneLabel = r.zone ? r.zone.nom : "";
        var colisTxt = r.nb + " colis", poidsTxt = G.kg(r.tax) + (r.tax > 1 ? " taxables" : " taxable");
        var modeTxt = d.livraison === "DOMICILE" ? "Livraison à domicile · " + zoneLabel : "Retrait au bureau " + G.titre(d.bureauDest);

        $("#r-dep").text(G.villeAff(d.villeDep)).toggleClass("gx-long", G.villeAff(d.villeDep).length > 8); $("#r-depSub").text("Bureau " + G.titre(d.bureauDep));
        $("#r-dst").text(dstVille).toggleClass("gx-long", dstVille.length > 8); $("#r-dstSub").text(dstLieu);
        var tags = ["<span class='light'>" + U.esc(S.full.charAt(0) + S.full.substr(1).toLowerCase()) + "</span>", "<span>" + U.esc(modeTxt) + "</span>", "<span>" + colisTxt + " · " + poidsTxt + "</span>"];
        if (d.typeClient === "COMPTE") tags.push("<span>NATEX" + (state.client ? " · " + U.esc(state.client.sigle || state.client.code) : "") + "</span>");
        $("#r-tags").html(tags.join(""));
        $("#gx-colis-resume").text(colisTxt + " · " + poidsTxt);
        if (r.zone) $("#zoneHint").text("Livraison " + r.zone.nom + " : " + U.money(r.zone.prix));

        /* Montants */
        $("#autoHint").text(d.tarifAuto ? "Transport et livraison calculés" : "Montants saisis à la main");
        $("#r-transport").text(U.money(r.transport)).toggleClass("cx-hidden", !d.tarifAuto);
        $("#w-transport").toggleClass("cx-hidden", d.tarifAuto);
        $("#r-livraison").text(U.money(r.livraison)).toggleClass("cx-hidden", !d.tarifAuto);
        $("#w-livraison").toggleClass("cx-hidden", d.tarifAuto);
        $("#r-total").text(U.fmt(r.total));
        majBlocTarif(r, d);

        /* Paiement comptant */
        var especes = d.payMode === "Espèces";
        $("#w-payRecu").toggleClass("cx-hidden", !especes);
        $("#w-payRef").toggleClass("cx-hidden", especes);
        var rendu = d.payRecu - r.total;
        $("#payRendu").text($.trim($("#payRecu").val()) ? (rendu >= 0 ? U.money(rendu) : "Manque " + U.money(-rendu)) : "—");
        $("#w-rendu").toggleClass("ko", $.trim($("#payRecu").val()) !== "" && rendu < 0);

        /* Champs obligatoires manquants */
        var m = [];
        function manque(ok, label, cible) { if (!ok) m.push({ label: label, cible: cible }); }
        if (d.typeClient === "COMPTE") {
            manque(!!state.client, "Client en compte", "#gx-client");
            if (state.client) {
                manque(state.client.statut !== "SUSPENDU", "Compte client suspendu", "#gx-client");
                var aCarnet = G.carnets.duClient(state.client.id).length > 0;
                if (aCarnet) manque(!!d.nRtMan, "N° de LT manuel (feuille du carnet)", "#nRtMan");
                if (d.nRtMan) manque(state.feuille && state.feuille.ok, "Feuille de carnet invalide", "#nRtMan");
            }
        }
        if (etr) manque(!!d.paysDest, "Pays de destination", "#paysDest");
        else manque(!!d.villeDest, "Ville de destination", "#villeDest");
        if (d.livraison === "DOMICILE") {
            manque(!!d.quartier, "Quartier de livraison", "#quartier");
            manque(!!d.repere, "Point de rencontre", "#repere");
        }
        manque(r.tax > 0, "Poids ou dimensions du colis", "#gx-colis-list [data-f=poids]:first");
        manque(chiffres(d.exp.tel) >= 9, "Téléphone de l'expéditeur", "#expTel");
        manque(!!d.exp.nom, "Nom de l'expéditeur", "#expNom");
        if (!d.exp.same) manque(chiffres(d.exp.wa) >= 9, "WhatsApp de l'expéditeur", "#expWa");
        manque(chiffres(d.dst.tel) >= 9, "Téléphone du destinataire", "#dstTel");
        manque(!!d.dst.nom, "Nom du destinataire", "#dstNom");
        if (!d.dst.same) manque(chiffres(d.dst.wa) >= 9, "WhatsApp du destinataire", "#dstWa");
        manque(r.total > 0, "Montant total", d.tarifAuto ? "#gx-colis-list [data-f=poids]:first" : "#m-transport");
        if (d.typeClient === "PARTICULIER" && especes) manque(d.payRecu >= r.total && $.trim($("#payRecu").val()) !== "", "Montant reçu (espèces)", "#payRecu");
        state.manquants = m;

        var ready = !m.length && !estVerrouille();
        $("#r-manquants").toggleClass("cx-hidden", !m.length);
        $("#r-nbManq").text(m.length === 1 ? "1 champ obligatoire à compléter" : m.length + " champs obligatoires à compléter");
        $("#r-listeManq").html($.map(m, function (x, i) { return "<li data-i='" + i + "' tabindex='0' role='button'>" + U.esc(x.label) + "</li>"; }).join(""));
        $("#r-ok").toggleClass("cx-hidden", m.length > 0);
        $("#btn-enregistrer").prop("disabled", !ready);
    }

    function majBlocTarif(r, d) {
        var t = state.tarif, g = t && t.grille, $chip = $("#r-tarif");
        if (r.source === "GRILLE" && g) {
            var o = T.ORIGINES[t.origine] || {};
            $chip.removeClass("std").toggleClass("std", t.origine === "STANDARD");
            $("#r-tarifNom").text(g.nom).attr("href", G.lienCommercial("tarif-form.html?id=" + g.id));
            $("#r-tarifOrigine").html(U.esc(o.label || "") + (t.origine === "CONTRAT" ? " · contrat n° <b>" + U.esc(t.contrat.numero) + "</b>" : t.origine === "GROUPE" ? " · " + U.esc(t.libelle) : "") +
                (r.res && r.res.regle ? "<br>Règle : « " + U.esc(r.res.regle.libelle) + " »" : ""));
        } else {
            $chip.addClass("std");
            $("#r-tarifNom").text("tarif indicatif du guichet").attr("href", G.lienCommercial("tarifs-liste.html"));
            $("#r-tarifOrigine").html(r.tax > 0 ? "1 500 F + 500 F par kg taxable et par colis · livraison selon la zone" +
                (g ? "<br>Aucune règle de la grille « " + U.esc(g.nom) + " » ne couvre cet envoi." : "") : "Renseignez le poids des colis.");
        }
        $chip.toggleClass("cx-hidden", !d.tarifAuto);
        var detail = d.tarifAuto && r.res && r.source === "GRILLE";
        $("#r-detailToggle").toggleClass("cx-hidden", !detail);
        if (!detail) $("#r-detail").addClass("cx-hidden");
        $("#r-detail").html(detail ? T.detailHtml(r.res, { titreTotal: "Total grille (transport + livraison)" }) : "");
        var alertes = d.tarifAuto && t ? t.alertes.slice() : [];
        if (d.tarifAuto && r.res && r.source === "GRILLE" && $("#r-detail").hasClass("cx-hidden")) $.merge(alertes, r.res.alertes);
        $("#r-alertes").html(alertes.length ? "<div class='cx-note cx-note-warn' style='font-size:12px'><i class='fa fa-exclamation-triangle'></i><div>" +
            $.map(alertes, function (a) { return U.esc(a); }).join("<br>") + "</div></div>" : "");
    }

    function estVerrouille() { return state.orig && !G.estModifiable(state.orig); }

    /* =================================================================
       Remplissage de l'écran depuis une expédition (correction)
       ================================================================= */
    function remplir(e0) {
        var e = G.normaliser(e0);
        $("input[name=typeClient][value=" + e.typeClient + "]").prop("checked", true);
        if (e.client) $("#gx-client").val(e.client.id).trigger("change.select2");
        state.client = e.typeClient === "COMPTE" ? e.client : null;
        $("input[name=service][value=" + e.service + "]").prop("checked", true);
        $("#villeDep").val(e.villeDep); optionsBureaux($("#bureauDep"), e.villeDep); $("#bureauDep").val(e.bureauDep);
        if (e.service === "REGIONALE" || e.service === "INTERNATIONALE") { optionsPays(e.service); $("#paysDest").val(e.paysDest || ""); $("#villeEtranger").val(e.villeEtranger || ""); }
        else { $("#villeDest").val(e.villeDest); optionsBureaux($("#bureauDest"), e.villeDest); $("#bureauDest").val(e.bureauDest); }
        $("input[name=livraison][value=" + e.livraison.mode + "]").prop("checked", true);
        $("#quartier").val(e.livraison.quartier); $("#zone").val(e.livraison.zone || "Z1"); $("#repere").val(e.livraison.repere); $("#telLiv").val(G.telFmt(e.livraison.telAppel));
        $("#nRtMan").val(e.typeClient === "COMPTE" ? (e.nRtMan || "") : (e.recuManuel || ""));
        majDestination();
        $("#bordereau").val(e.bordereau || "");
        $("#gx-colis-list").empty();
        $.each(e.colis, function (_, c) { ajouterColis(c); });
        $.each({ exp: e.expediteurInfo, dst: e.destinataireInfo }, function (k, p) {
            $("#" + k + "Nom").val(p.nom); $("#" + k + "Tel").val(G.telFmt(p.tel));
            var same = !p.whatsapp || G.tel(p.whatsapp) === G.tel(p.tel);
            $("#" + k + "Same").prop("checked", same); $("#" + k + "WaBloc").toggleClass("cx-hidden", same); $("#" + k + "Wa").val(same ? "" : G.telFmt(p.whatsapp));
            $("#" + k + "Adresse").val(p.adresse); $("#" + k + "Email").val(p.email);
            if (p.adresse || p.email) basculerPlus($("[data-plus='#" + k + "Plus']"), true);
        });
        state.expDepuisClient = false;
        var auto = e.tarifAuto !== false && !!e.tarifAuto;
        if (e0.tarifAuto == null) auto = false;   // expédition sans détail : montants repris tels quels
        $("#tarifAuto").prop("checked", auto);
        $("#m-transport").val(e.montants.transport); $("#m-livraison").val(e.montants.livraison);
        $("#m-emballage").val(e.montants.emballage); $("#m-autres").val(e.montants.autres);
        if (e.paiement.statut !== "EN_COMPTE") {
            $("#payMode").val(e.paiement.mode || "Espèces");
            $("#payRecu").val(e.paiement.recu || ""); $("#payRef").val(e.paiement.reference || "");
        }
        majTypeClientSansReset();
        majTarif();
        majFeuille();
        recalc();
    }
    function majTypeClientSansReset() {
        var compte = typeClient() === "COMPTE";
        $("#gx-carte-client").toggleClass("cx-hidden", !compte);
        $("#contactsSub").toggleClass("cx-hidden", !compte);
        $("#gx-pay-comptant").toggleClass("cx-hidden", compte);
        $("#gx-pay-compte").toggleClass("cx-hidden", !compte);
        $("#l-nRtMan").html(compte ? "N° de LT manuel <span class='cx-opt'>(feuille du carnet du client)</span>" : "N° reçu transport manuel <span class='cx-opt'>(facultatif)</span>");
        if (compte && state.client) choisirClientInfos();
    }
    function choisirClientInfos() { var keep = state.expDepuisClient; state.expDepuisClient = false; choisirClient(state.client); state.expDepuisClient = keep; }

    /* =================================================================
       Enregistrement
       ================================================================= */
    function construire(d, r) {
        var now = new Date(), heure = U.pad(now.getHours()) + ":" + U.pad(now.getMinutes());
        var S = G.SERVICES[d.service], compte = d.typeClient === "COMPTE";
        var colis = $.map(d.colis, function (c, i) {
            var p = r.colis[i];
            return { nature: c.nature, poids: U.num(c.poids), L: U.num(c.L) || "", l: U.num(c.l) || "", H: U.num(c.H) || "", nombre: c.nombre,
                valeur: U.round(U.num(c.valeur)), description: c.description, poidsVol: p.vol, poidsTaxable: p.tax };
        });
        var descs = $.grep($.map(d.colis, function (c) { return c.description; }), function (x) { return !!x; });
        var natures = []; $.each(d.colis, function (_, c) { if ($.inArray(c.nature, natures) < 0) natures.push(c.nature); });
        var agU = $.grep(REF.AGENCES, function (a) { return a.ville === USER.ville && a.nom === USER.agence; })[0];
        var t = state.tarif, g = t && t.grille;
        /* fusion superficielle : les sous-objets (livraison, colis, montants, paiement…) sont remplacés */
        var e = $.extend({}, state.orig || {}, {
            typeClient: d.typeClient, clientId: compte && state.client ? state.client.id : null,
            villeDep: d.villeDep, bureauDep: d.bureauDep, villeDest: d.villeDest || "", bureauDest: d.bureauDest || "",
            paysDest: d.paysDest, villeEtranger: d.villeEtranger,
            service: d.service, typeTrajet: S.trajet,
            livraison: { mode: d.livraison, zone: d.livraison === "DOMICILE" ? d.zone : "", quartier: d.livraison === "DOMICILE" ? d.quartier : "",
                repere: d.livraison === "DOMICILE" ? d.repere : "", telAppel: d.livraison === "DOMICILE" ? d.telLiv : "" },
            nRtMan: compte && d.nRtMan ? String(G.carnets.num(d.nRtMan) || d.nRtMan) : null,
            recuManuel: !compte && d.nRtMan ? d.nRtMan : "",
            bordereau: d.bordereau,
            expediteur: d.exp.nom, destinataire: d.dst.nom, telDestinataire: G.telFmt(d.dst.tel),
            expediteurInfo: { nom: d.exp.nom, tel: d.exp.tel, whatsapp: d.exp.same ? d.exp.tel : d.exp.wa, adresse: d.exp.adresse, email: d.exp.email },
            destinataireInfo: { nom: d.dst.nom, tel: d.dst.tel, whatsapp: d.dst.same ? d.dst.tel : d.dst.wa, adresse: d.dst.adresse, email: d.dst.email },
            colis: colis,
            contenu: descs.join(", ") || natures.join(", "),
            nbColis: r.nb, poids: r.tax,
            montant: r.total,
            montants: { transport: r.transport, emballage: r.emballage, livraison: r.livraison, autres: r.autres, total: r.total },
            tarifAuto: d.tarifAuto,
            tarif: d.tarifAuto ? (r.source === "GRILLE" && g ? {
                source: "GRILLE", grilleId: g.id, grilleCode: g.code, grilleNom: g.nom, origine: t.origine,
                contratId: t.contrat ? t.contrat.id : null, contratNumero: t.contrat ? t.contrat.numero : null,
                regle: r.res && r.res.regle ? r.res.regle.libelle : "", diviseur: diviseur()
            } : { source: "GUICHET", libelle: "Tarif indicatif du guichet (1 500 F + 500 F/kg taxable)" }) : { source: "MANUEL", libelle: "Montants saisis à la main" },
            paiement: compte ? { mode: G.MODE_COMPTE, statut: "EN_COMPTE", recu: 0, rendu: 0, reference: "", libelle: "En compte – facturé en fin de période" }
                : { mode: d.payMode, statut: "PAYE", recu: d.payMode === "Espèces" ? U.round(d.payRecu) : r.total,
                    rendu: d.payMode === "Espèces" ? Math.max(0, U.round(d.payRecu - r.total)) : 0, reference: d.payMode === "Espèces" ? "" : d.payRef }
        });
        if (!state.orig) {
            e.dateExp = today; e.heure = heure; e.dateLivraison = null;
            e.statut = "EN_TRANSIT"; e.preuveLivraison = false; e.factureId = null;
            e.guichetier = USER.nom; e.guichetierId = USER.id;
            e.bureau = { ville: USER.ville, agence: USER.agence, agenceId: agU ? agU.id : null };
            e.historique = [{ date: U.now(), user: USER.nom, action: "Expédition enregistrée au guichet (bureau " + G.titre(USER.agence) + ")" }];
        } else {
            e.historique = [{ date: U.now(), user: USER.nom, action: "Saisie corrigée au guichet" }].concat(state.orig.historique || []);
            e.dateModification = U.now(); e.modifiePar = USER.nom;
        }
        return e;
    }

    function enregistrer() {
        recalc();
        if (state.manquants.length || estVerrouille()) return;
        var d = lire(), r = state.calc, e = construire(d, r), $b = $("#btn-enregistrer");
        if (!state.orig) { e.nRt = G.prochainNumero(today); e.numero = e.nRt; }
        var ancienne = state.orig ? state.orig.nRtMan : null;
        U.busy($b, true);
        // TODO API : POST /guichet/expeditions (création, n° RT attribué par le serveur, avance du carnet,
        //            envoi WhatsApp du reçu) | PUT /guichet/expeditions/{id} (correction)
        var lib = ancienne && String(ancienne) !== String(e.nRtMan || "") ? G.carnets.liberer(ancienne) : $.Deferred().resolve().promise();
        lib.then(function () { return CX.api.save("expeditions", e); }).done(function (saved) {
            G.carnets.synchroniser();     // la feuille passe « Utilisée » dans le carnet
            U.toast((state.orig ? "Correction enregistrée : " : "Expédition enregistrée : ") + "<b>" + U.esc(saved.nRt) + "</b>.");
            if (state.prereg && !state.orig && G.preenreg) { G.preenreg.valider(state.prereg, saved); U.toast("Pré-enregistrement <b>" + U.esc(state.prereg) + "</b> validé.", "info"); state.prereg = null; }
            state.orig = saved; state.id = saved.id;
            afficherRecu(saved);
        }).fail(function () { U.toast("L'enregistrement a échoué.", "error"); })
            .always(function () { U.busy($b, false); recalc(); });
    }

    /* =================================================================
       Vue « expédition enregistrée »
       ================================================================= */
    function afficherRecu(e0) {
        var e = G.normaliser(e0);
        state.saved = e0;
        $("#gx-vue-saisie").addClass("cx-hidden");
        $("#gx-vue-recu").removeClass("cx-hidden");
        $("#gx-typeclient").addClass("cx-hidden");
        $("#gx-titre").text("Expédition enregistrée");
        $("#gx-crumb").text(e.nRt);
        document.title = "Reçu " + e.nRt + " - Guichet ClemenTino";
        $("#gx-recu").html(CX.recu.html(e0));
        $("#d-numero").text(e.nRt);
        var S = G.SERVICES[e.service];
        var lignes = [
            ["Type d'expédition", S.full.charAt(0) + S.full.substr(1).toLowerCase()],
            ["Remise", e.livraison.mode === "DOMICILE" ? "Livraison à domicile" : "Retrait au bureau " + G.titre(e.bureauDest)],
            ["Montant total", U.money(e.montants.total)],
            ["Paiement", e.paiement.statut === "EN_COMPTE" ? "En compte (facturé en fin de période)" : e.paiement.mode + (e.paiement.rendu ? " · rendu " + U.money(e.paiement.rendu) : "")]
        ];
        if (e.client) lignes.splice(0, 0, ["Client", e.client.raisonSociale]);
        if (e.nRtMan) lignes.push(["Feuille de carnet", e.nRtMan]);
        $("#d-infos").html($.map(lignes, function (l) { return "<dt>" + U.esc(l[0]) + "</dt><dd>" + U.esc(l[1]) + "</dd>"; }).join(""));
        lienWa("#btn-wa-exp", G.whatsapp(e, "EXPEDITEUR"));
        lienWa("#btn-wa-dst", G.whatsapp(e, "DESTINATAIRE"));
        $("#btn-corriger").toggleClass("cx-hidden", !G.estModifiable(e));
        if (window.history && history.replaceState) history.replaceState(null, "", "expedition-form.html?id=" + e.id + "&recu=1");
        $("html, body").scrollTop(0);
    }
    function lienWa(sel, url) {
        $(sel).attr("href", url || "#").toggleClass("disabled", !url).attr("aria-disabled", url ? null : "true")
            .attr("title", url ? "" : "Numéro WhatsApp invalide");
    }
    function retourSaisie() {
        var e = state.saved;
        $("#gx-vue-recu").addClass("cx-hidden");
        $("#gx-vue-saisie").removeClass("cx-hidden");
        $("#gx-typeclient").removeClass("cx-hidden");
        modeCorrection(e);
        remplir(e);
        verrouiller(e);
        if (window.history && history.replaceState) history.replaceState(null, "", "expedition-form.html?id=" + e.id);
    }
    function modeCorrection(e) {
        state.orig = e; state.id = e.id;
        $("#gx-titre").text("Corriger l'expédition " + e.nRt);
        $("#gx-crumb").text("Correction " + e.nRt);
        $("#r-statut").removeClass("brouillon enregistree").addClass("correction").text("Correction");
        $("#btn-enregistrer").text("Enregistrer la correction");
        $("#btn-annuler").text("Annuler la correction");
        document.title = "Guichet · Correction " + e.nRt + " - ClemenTino";
    }
    /* Expédition livrée, facturée ou annulée : consultation seule */
    function verrouiller(e) {
        var verrou = !G.estModifiable(e);
        $("#gx-lecture").toggleClass("cx-hidden", !verrou);
        if (!verrou) return;
        $("#gx-lectureTexte").html("<b>Correction impossible</b> : " + U.esc(G.motifNonModifiable(e).toLowerCase()) +
            ". <a href='recu.html?id=" + e.id + "'>Voir le reçu</a> · <a href='expeditions-liste.html'>Historique des saisies</a>");
        $("#gx-vue-saisie").find("input, select, textarea, button").not("#btn-annuler").prop("disabled", true);
        $("input[name=typeClient]").prop("disabled", true);
        $("#gx-client").prop("disabled", true).trigger("change.select2");
        $("#btn-annuler").text("Retour à l'historique");
        recalc();
    }

    /* =================================================================
       Pré-enregistrement et message client
       ================================================================= */
    function appliquerDonnees(p) {
        if (p.service) choisirService(p.service);
        if (p.villeDest && !estEtranger()) { $("#villeDest").val(p.villeDest); if (p.villeDest === $("#villeDep").val()) choisirService("URBAINE"); }
        if (p.livraison) $("input[name=livraison][value=" + p.livraison + "]").prop("checked", true);
        majDestination();
        if (p.quartier != null) $("#quartier").val(p.quartier);
        if (p.zone) $("#zone").val(p.zone);
        if (p.repere != null) $("#repere").val(p.repere);
        if (p.telLiv) $("#telLiv").val(G.telFmt(p.telLiv));
        $.each({ exp: p.exp, dst: p.dst }, function (k, x) {
            if (!x) return;
            if (x.nom) $("#" + k + "Nom").val(x.nom);
            if (x.tel) $("#" + k + "Tel").val(G.telFmt(x.tel));
        });
        if (p.exp && p.exp.nom) state.expDepuisClient = false;
        if (p.colis && p.colis.length) { $("#gx-colis-list").empty(); $.each(p.colis, function (_, c) { ajouterColis(c); }); }
        recalc();
    }
    function rechercherPrereg() {
        var v = $.trim($("#prereg").val()).toUpperCase(), $i = $("#prereg-info");
        if (!v) { $("#prereg").focus(); return; }
        var code = /^\d+$/.test(v) ? "PRE-" + ("0000" + v).slice(-4) : v.replace(/^.*(PRE-\d{4}).*$/, "$1");
        // TODO API : GET /guichet/pre-enregistrements/{code}  (QR du formulaire en ligne « Clients web »)
        var pr = G.preenreg ? G.preenreg.trouver(code) : null;
        if (pr && G.preenreg.statut(pr) !== "EN_ATTENTE") {
            $i.removeClass("cx-hidden cx-note-info cx-note-warn cx-note-ok").addClass("cx-note-warn").find("div").html("Pré-enregistrement <b>" + U.esc(code) + "</b> : " + U.esc(G.preenreg.STATUTS[G.preenreg.statut(pr)].label.toLowerCase()) + (pr.nRt ? " (" + U.esc(pr.nRt) + ")" : "") + ".");
            return;
        }
        var p = pr ? G.preenreg.versFormulaire(pr) : PREENREGISTREMENTS[code];
        state.prereg = p ? code : null;
        $i.removeClass("cx-hidden cx-note-info cx-note-warn cx-note-ok");
        if (!p) { $i.addClass("cx-note-warn").find("div").html("Aucun pré-enregistrement <b>" + U.esc(code) + "</b>. (Voir Opérations · Expéditions pré-enregistrées)"); return; }
        appliquerDonnees(p);
        $i.addClass("cx-note-ok").find("div").html("Pré-enregistrement <b>" + U.esc(code) + "</b> repris : vérifiez les informations avec le client, pesez et mesurez les colis.");
    }

    /* Extraction depuis un message (WhatsApp, SMS) par expressions régulières simples */
    var CIBLES = [
        { v: "", l: "Ignorer" }, { v: "expTel", l: "Téléphone expéditeur" }, { v: "expNom", l: "Nom expéditeur" },
        { v: "dstTel", l: "Téléphone destinataire" }, { v: "dstNom", l: "Nom destinataire" }, { v: "telLiv", l: "Personne à appeler (livraison)" },
        { v: "villeDest", l: "Ville de destination" }, { v: "quartier", l: "Quartier de livraison" }, { v: "repere", l: "Point de rencontre" }
    ];
    function analyserMessage(txt) {
        var res = [], vus = {}, norm = U.normalize(txt);
        function add(type, valeur, cible) {
            valeur = $.trim(String(valeur || "").replace(/\s+/g, " ").replace(/[\s,.;:\-]+$/, ""));
            if (!valeur || vus[type + valeur]) return;
            vus[type + valeur] = 1;
            res.push({ type: type, valeur: valeur, cible: cible });
        }
        var NOM = "([A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'\\-]+(?: [A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'\\-]+){0,3})";
        /* libellés explicites d'abord ; formules faibles (« pour », « je suis ») seulement
           si elles sont suivies d'un nom propre (majuscule) */
        var CIV = "\\s*(?:est|:|-)?\\s*(?:m\\.|mme|mlle|monsieur|madame)?\\s*";
        var NOM_PROPRE = "([A-ZÀ-Ý][A-Za-zÀ-ÿ'\\-]+(?: [A-ZÀ-Ý][A-Za-zÀ-ÿ'\\-]+){0,3})";
        var mExp = new RegExp("(?:exp[ée]diteur|de la part de|envoy[ée] par)" + CIV + NOM, "i").exec(txt) ||
            new RegExp("(?:[Jj]e suis|[Mm]oi c'est)" + CIV + NOM_PROPRE).exec(txt);
        var mDst = new RegExp("(?:destinataire|[àa] l'attention de|b[ée]n[ée]ficiaire|r[ée]cup[ée]r[ée] par|remettre [àa])" + CIV + NOM, "i").exec(txt) ||
            new RegExp("(?:[Pp]our)" + CIV + NOM_PROPRE).exec(txt);
        /* téléphones camerounais : 6XX XX XX XX ou 2XX XX XX XX, avec ou sans +237 */
        var reTel = /(?:\+?237[\s.\-]?)?([62](?:[\s.\-]?\d){8})(?!\d)/g, m, tels = [];
        while ((m = reTel.exec(txt))) {
            var t = m[1].replace(/\D/g, ""), avant = U.normalize(txt.substr(Math.max(0, m.index - 40), 40));
            var role = /exp[e]?diteur|de la part|moi|mon numero|envoye par/.test(avant) ? "expTel"
                : /destinataire|pour|appeler|livr|joindre|beneficiaire|recup/.test(avant) ? "dstTel" : "";
            tels.push({ t: t, role: role });
        }
        if (mExp) add("Nom", mExp[1], "expNom");
        if (mDst) add("Nom", mDst[1], "dstNom");
        var sansRole = $.grep(tels, function (x) { return !x.role; });
        $.each(tels, function (i, x) {
            var cible = x.role;
            if (!cible) {
                var a = $.grep(tels, function (y) { return y.role === "dstTel"; }).length, b = $.grep(tels, function (y) { return y.role === "expTel"; }).length;
                cible = !a ? "dstTel" : !b ? "expTel" : "telLiv";
                if (sansRole.length === 2 && !a && !b) cible = sansRole[0] === x ? "expTel" : "dstTel";
                x.role = cible;
            }
            add("Téléphone", G.telFmt(x.t), cible);
        });
        /* ville : nom d'une ville du référentiel cité dans le message (autre que le départ si possible) */
        var villes = $.grep(REF.VILLES, function (v) { return new RegExp("\\b" + U.normalize(v.nom) + "\\b").test(norm); });
        var dep = $("#villeDep").val();
        var ville = $.grep(villes, function (v) { return v.nom !== dep; })[0] || villes[0];
        if (ville) add("Ville", G.villeNom(ville.nom), "villeDest");
        var mq = /(?:quartier|qtier|qrt|quatier)\s*(?::|-)?\s*([A-Za-zÀ-ÿ'\- ]{2,40}?)(?=[,.;\n]|\s+(?:devant|face|pr[eè]s|derri[eè]re|vers|au|a|à|chez|t[ée]l|\d)|$)/i.exec(txt);
        if (mq) add("Quartier", mq[1], "quartier");
        var mr = /((?:devant|en face d[eu']?|face [àa]|pr[eè]s d[eu']?|derri[eè]re|[àa] c[oô]t[ée] d[eu']?|rep[eè]re\s*:?|point de rencontre\s*:?)\s*[^,.;\n\d]{3,60})/i.exec(txt);
        if (mr) add("Repère", mr[1].replace(/^(rep[eè]re|point de rencontre)\s*:?\s*/i, ""), "repere");
        return res;
    }
    function afficherExtraits(items) {
        if (!items.length) {
            $("#gx-msg-resultat").html("<div class='cx-note cx-note-warn'><i class='fa fa-info-circle'></i><div>Rien n'a été reconnu : saisissez les informations à la main.</div></div>");
            $("#gx-msg-appliquer").prop("disabled", true);
            return;
        }
        $("#gx-msg-resultat").html("<table class='gx-extraits'><tbody>" + $.map(items, function (x, i) {
            return "<tr><td>" + U.esc(x.type) + "</td><td><input type='text' class='form-control input-sm' data-x='" + i + "' value='" + U.esc(x.valeur) + "'></td>" +
                "<td><select class='form-control' data-c='" + i + "'>" + $.map(CIBLES, function (c) {
                    return "<option value='" + c.v + "'" + (c.v === x.cible ? " selected" : "") + ">" + U.esc(c.l) + "</option>";
                }).join("") + "</select></td></tr>";
        }).join("") + "</tbody></table>");
        $("#gx-msg-appliquer").prop("disabled", false);
    }
    function appliquerExtraits() {
        var p = { exp: {}, dst: {} };
        $("#gx-msg-resultat tr").each(function () {
            var v = $.trim($(this).find("input").val()), c = $(this).find("select").val();
            if (!v || !c) return;
            if (c === "expTel") p.exp.tel = v; else if (c === "expNom") p.exp.nom = v;
            else if (c === "dstTel") p.dst.tel = v; else if (c === "dstNom") p.dst.nom = v;
            else if (c === "telLiv") { p.telLiv = v; p.livraison = "DOMICILE"; }
            else if (c === "villeDest") {
                var vi = $.grep(REF.VILLES, function (x) { return U.normalize(x.nom) === U.normalize(v); })[0];
                if (vi) p.villeDest = vi.nom;
            } else if (c === "quartier") { p.quartier = v; p.livraison = "DOMICILE"; }
            else if (c === "repere") { p.repere = v; p.livraison = "DOMICILE"; }
        });
        if (p.villeDest && p.villeDest !== $("#villeDep").val() && service() === "URBAINE") p.service = "NATIONALE";
        appliquerDonnees(p);
        $("#gx-modal-msg").modal("hide");
        U.toast("Informations reprises du message : vérifiez-les avec le client.", "info");
    }

    /* =================================================================
       Évènements
       ================================================================= */
    $("input[name=typeClient]").on("change", majTypeClient);
    $("#gx-client").on("change", function () {
        var id = $(this).val();
        choisirClient(id ? $.grep(CX.api.clientsSync(), function (c) { return String(c.id) === String(id); })[0] || null : null);
    });
    $("#nRtMan").on("input", U.debounce(function () { majFeuille(); recalc(); }, 200));
    $("#nRtManInfo").on("click", "[data-feuille]", function () { $("#nRtMan").val($(this).data("feuille")); majFeuille(); recalc(); });

    $("input[name=service]").on("change", function () { choisirService(service()); recalc(); });
    $("#villeDep").on("change", function () {
        optionsBureaux($("#bureauDep"), $(this).val());
        if (service() === "URBAINE") $("#villeDest").val($(this).val());
        majDestination(); recalc();
    });
    $("#villeDest").on("change", function () {
        var same = $(this).val() === $("#villeDep").val();
        if (same && service() === "NATIONALE") $("input[name=service][value=URBAINE]").prop("checked", true);
        if (!same && service() === "URBAINE") $("input[name=service][value=NATIONALE]").prop("checked", true);
        majDestination(); recalc();
    });
    $("#paysDest").on("change", function () { optionsBordereaux(); recalc(); });
    $("input[name=livraison]").on("change", function () { majDestination(); recalc(); });
    $("#bureauDep, #bureauDest, #zone, #villeEtranger, #quartier, #repere, #telLiv, #bordereau").on("input change", recalc);

    /* Colis */
    $("#btn-add-colis").on("click", function () { ajouterColis({}, true); recalc(); });
    $("#gx-colis-list").on("click", "[data-del]", function () {
        $(this).closest(".gx-colis").remove();
        renumeroter(); recalc();
    });
    $("#gx-colis-list").on("click", "[data-step]", function () {
        var $in = $(this).siblings("input"), n = Math.max(1, (parseInt($in.val(), 10) || 1) + parseInt($(this).data("step"), 10));
        $in.val(n); recalc();
    });
    $("#gx-colis-list").on("input change", "input", function () {
        var $c = $(this).closest(".gx-colis");
        if ($(this).is("[data-f=nombre]") && !/^\d*$/.test(this.value)) this.value = this.value.replace(/\D/g, "");
        majPoids($c); recalc();
    });

    /* Contacts */
    $("#expTel, #expNom, #expWa, #expAdresse, #expEmail, #dstTel, #dstNom, #dstWa, #dstAdresse, #dstEmail").on("input", recalc);
    $("#expNom, #expTel").on("input", function () { state.expDepuisClient = false; });
    $("#expSame, #dstSame").on("change", function () {
        var k = this.id.substr(0, 3);
        $("#" + k + "WaBloc").toggleClass("cx-hidden", this.checked);
        if (!this.checked) $("#" + k + "Wa").focus();
        recalc();
    });
    function basculerPlus($a, ouvrir) {
        var $b = $($a.data("plus")), on = ouvrir != null ? ouvrir : $b.hasClass("cx-hidden");
        $b.toggleClass("cx-hidden", !on);
        $a.attr("aria-expanded", on ? "true" : "false").find("span").text(on ? "Masquer l'adresse et l'email" : "Ajouter l'adresse et l'email");
        $a.find(".fa").toggleClass("fa-angle-down", !on).toggleClass("fa-angle-up", on);
    }
    $("[data-plus]").on("click", function () { basculerPlus($(this)); });

    /* Montants / paiement */
    $("#tarifAuto").on("change", function () {
        if (!this.checked && state.calc) {   // comme la maquette : on repart des montants calculés
            $("#m-transport").val(state.calc.transportAuto);
            $("#m-livraison").val(state.calc.livraisonAuto);
        }
        recalc();
    });
    $("#m-transport, #m-livraison, #m-emballage, #m-autres, #payRecu, #payRef").on("input", recalc);
    $("#payMode").on("change", recalc);
    $("#r-detailToggle").on("click", function () {
        var $d = $("#r-detail").toggleClass("cx-hidden"), on = !$d.hasClass("cx-hidden");
        $(this).attr("aria-expanded", on ? "true" : "false").html(on ? "<i class='fa fa-minus-circle'></i> <span>Masquer le détail</span>" : "<i class='fa fa-plus-circle'></i> <span>Détail du calcul</span>");
        recalc();
    });

    /* Champs manquants cliquables */
    $("#r-listeManq").on("click keydown", "li", function (ev) {
        if (ev.type === "keydown" && ev.which !== 13 && ev.which !== 32) return;
        ev.preventDefault();
        var x = state.manquants[$(this).data("i")];
        if (!x) return;
        var $el = $(x.cible).first();
        if ($el.is("#gx-client")) { $("html, body").animate({ scrollTop: $("#gx-carte-client").offset().top - 90 }, 150); $el.select2("open"); return; }
        if (!$el.length || !$el.is(":visible")) return;
        $("html, body").animate({ scrollTop: $el.offset().top - 140 }, 150, function () {
            $el.focus();
            var $f = $el.closest(".cx-field, .input-group").first();
            $f.removeClass("gx-flash"); setTimeout(function () { $f.addClass("gx-flash"); }, 10);
        });
    });

    $("#btn-enregistrer").on("click", enregistrer);
    $("#btn-annuler").on("click", function () {
        if (state.orig) { window.location.href = "expeditions-liste.html"; return; }
        U.confirm({ title: "Annuler la saisie", message: "Les informations saisies seront effacées.", okText: "Effacer la saisie", okClass: "cx-btn-danger", cancelText: "Continuer la saisie" })
            .done(function () { window.location.href = "expedition-form.html"; });
    });

    /* Démarrage rapide */
    $("#btn-prereg").on("click", rechercherPrereg);
    $("#prereg").on("keydown", function (e) { if (e.which === 13) { e.preventDefault(); rechercherPrereg(); } });
    $("#btn-message").on("click", function () {
        $("#gx-msg-resultat").empty(); $("#gx-msg-appliquer").prop("disabled", true);
        $("#gx-modal-msg").modal("show");
    });
    $("#gx-modal-msg").on("shown.bs.modal", function () { $("#gx-msg-texte").focus(); });
    $("#gx-msg-analyser").on("click", function () { afficherExtraits(analyserMessage($("#gx-msg-texte").val())); });
    $("#gx-msg-appliquer").on("click", appliquerExtraits);

    /* Reçu */
    $("#btn-imprimer").on("click", function () { window.print(); });
    $("#btn-pdf").on("click", function () {
        // TODO API (option) : GET /guichet/expeditions/{id}/recu.pdf  (PDF serveur, ex. KnpSnappyBundle)
        CX.recu.telechargerPdf("#gx-recu .gx-sheet", "Reçu " + state.saved.nRt, this);
    });
    $("#btn-wa-exp, #btn-wa-dst").on("click", function (ev) {
        if ($(this).hasClass("disabled")) { ev.preventDefault(); U.toast("Numéro WhatsApp invalide.", "warning"); return; }
        // TODO API : POST /guichet/expeditions/{id}/whatsapp (traçabilité de l'envoi)
        CX.api.log("expeditions", state.saved.id, "Reçu envoyé par WhatsApp " + (this.id === "btn-wa-exp" ? "à l'expéditeur" : "au destinataire"));
    });
    $("#btn-corriger").on("click", retourSaisie);

    /* =================================================================
       Démarrage
       ================================================================= */
    var idParam = U.queryParam("id");
    if (idParam) {
        // TODO API : GET /guichet/expeditions/{id}
        CX.api.get("expeditions", idParam).done(function (e) {
            if (U.queryParam("recu") === "1") { state.orig = e; state.id = e.id; afficherRecu(e); $("#r-statut").removeClass("brouillon").addClass("enregistree").text("Enregistrée"); return; }
            modeCorrection(e);
            remplir(e);
            verrouiller(e);
        }).fail(function () {
            U.toast("Expédition introuvable.", "error");
            ajouterColis({}); majTarif(); majDestination(); recalc();
        });
    } else {
        ajouterColis({});
        majTypeClient();
        majDestination();
        recalc();
        /* Validation d’un pré-enregistrement depuis Opérations : ?prereg=PRE-NNNN */
        if (U.queryParam("prereg")) { $("#prereg").val(U.queryParam("prereg")); rechercherPrereg(); }
    }
});

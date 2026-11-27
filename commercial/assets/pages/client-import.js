/* =====================================================================
   Commercial · Import de clients (client-import.html)
   ---------------------------------------------------------------------
   Parcours en 4 étapes :
     1. Fichier      : .xlsx / .xls (SheetJS) ou .csv (lecteur maison, ; ou ,)
     2. Colonnes     : correspondance automatique colonne -> champ, modifiable
     3. Aperçu       : contrôle ligne par ligne (erreurs, avertissements,
                       doublons avec la base ou dans le fichier), correction
                       des cellules en direct, exclusion de lignes
     4. Import       : enregistrement, progression, rapport téléchargeable

   >>> INTÉGRATION SYMFONY <<<
   En production, le contrôle définitif est refait côté serveur :
     POST /commercial/clients/import/preview  (fichier -> lignes contrôlées)
     POST /commercial/clients/import          (lignes validées -> création en base,
                                               dans une transaction, rapport en retour)
   Lecture du fichier côté serveur : PhpSpreadsheet.
   ===================================================================== */
$(function () {
    var U = CX.util;

    /* ------------------------------------------------------------------
       Champs importables (clé = champ ClemenTino) et synonymes d'en-têtes
       ------------------------------------------------------------------ */
    var FIELDS = [
        { key: "code", label: "Code client", group: "Entreprise", syn: ["code", "code client", "ref", "reference", "ref client"] },
        { key: "raisonSociale", label: "Raison sociale", req: true, group: "Entreprise", syn: ["raison sociale", "societe", "entreprise", "nom", "client", "denomination", "nom client", "nom du client", "raison"] },
        { key: "sigle", label: "Sigle", group: "Entreprise", syn: ["sigle", "acronyme", "abreviation", "nom commercial"] },
        { key: "typeCompte", label: "Type de compte", group: "Entreprise", syn: ["type", "type de compte", "type compte", "mode de paiement", "en compte", "categorie"] },
        { key: "secteur", label: "Secteur d'activité", group: "Entreprise", syn: ["secteur", "secteur d activite", "branche", "domaine"] },
        { key: "rccm", label: "RCCM", group: "Entreprise", syn: ["rccm", "registre de commerce", "rc", "registre"] },
        { key: "niu", label: "NIU (carte contribuable)", group: "Entreprise", syn: ["niu", "carte contribuable", "contribuable", "numero contribuable", "nif", "n contribuable"] },
        { key: "ville", label: "Ville", group: "Entreprise", syn: ["ville", "city", "localite"] },
        { key: "localisation", label: "Localisation / quartier", group: "Entreprise", syn: ["localisation", "quartier", "situation", "lieu"] },
        { key: "adresse", label: "Adresse postale", group: "Entreprise", syn: ["adresse", "bp", "boite postale", "adresse postale"] },
        { key: "telStandard", label: "Téléphone standard", group: "Entreprise", syn: ["tel", "telephone", "tel standard", "standard", "phone", "tel entreprise", "telephone standard"] },
        { key: "email", label: "Email entreprise", group: "Entreprise", syn: ["email", "e mail", "mail", "email entreprise", "courriel", "adresse email"] },
        { key: "activites", label: "Activités", group: "Entreprise", syn: ["activites", "activite", "description", "activites de l entreprise"] },
        { key: "note", label: "Note interne", group: "Entreprise", syn: ["note", "notes", "commentaire", "commentaires", "observations", "observation"] },
        { key: "contactNom", label: "Contact principal - nom", group: "Contacts", syn: ["contact", "contact principal", "interlocuteur", "interlocuteur 1", "nom contact", "responsable", "nom et prenoms"] },
        { key: "contactTel", label: "Contact principal - téléphone", group: "Contacts", syn: ["tel contact", "telephone contact", "contact tel", "tel interlocuteur", "mobile", "portable", "gsm", "tel 1"] },
        { key: "contactEmail", label: "Contact principal - email", group: "Contacts", syn: ["email contact", "mail contact", "contact email", "email interlocuteur"] },
        { key: "contactTitre", label: "Contact principal - titre", group: "Contacts", syn: ["titre", "fonction", "poste", "titre contact"] },
        { key: "dgNom", label: "Directeur général - nom", group: "Contacts", syn: ["dg", "directeur general", "nom dg", "directeur"] },
        { key: "dgTel", label: "Directeur général - téléphone", group: "Contacts", syn: ["tel dg", "telephone dg"] },
        { key: "dgEmail", label: "Directeur général - email", group: "Contacts", syn: ["email dg", "mail dg"] },
        { key: "emailFacturation", label: "Email de facturation", group: "Conditions", syn: ["email facturation", "mail facturation", "facturation", "email de facturation"] },
        { key: "delaiPaiement", label: "Délai de paiement (jours)", group: "Conditions", syn: ["delai de paiement", "delai paiement", "delai", "echeance", "jours"] },
        { key: "plafondCredit", label: "Plafond de crédit", group: "Conditions", syn: ["plafond", "plafond de credit", "plafond credit", "encours max"] },
        { key: "remisePct", label: "Remise (%)", group: "Conditions", syn: ["remise", "remise %", "taux de remise", "remise pct"] },
        { key: "montantForfait", label: "Montant du forfait", group: "Conditions", syn: ["forfait", "montant forfait", "montant du forfait"] },
        { key: "agence", label: "Agence de rattachement", group: "Conditions", syn: ["agence", "bureau", "agence de rattachement", "affecte a"] },
        { key: "commercial", label: "Commercial", group: "Conditions", syn: ["commercial", "charge de compte", "gestionnaire", "commercial en charge"] }
    ];
    var FIELD = {}; $.each(FIELDS, function (_, f) { FIELD[f.key] = f; });

    /* Colonnes de l'aperçu (éditables) */
    var PREVIEW_COLS = ["raisonSociale", "typeCompte", "ville", "telStandard", "email", "niu", "rccm", "contactNom", "contactTel", "emailFacturation"];
    var TYPES = { COMPTANT: "Au comptant", EN_COMPTE: "En compte", FORFAIT: "Forfait" };

    var state = {
        fileName: "", workbook: null, aoa: [], headerRow: 0,
        headers: [], dataRows: [], mapping: [],   // mapping[i] = clé de champ ou ""
        records: [], filtre: "", dt: null, report: []
    };
    var existants = CX.api.clientsSync();       // TODO API : GET /commercial/clients?champs=id,raisonSociale,niu

    /* ------------------------------------------------------------------
       Outils
       ------------------------------------------------------------------ */
    function norm(s) { return U.normalize(s).replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim(); }
    /* Raison sociale comparable : sans accents, ponctuation ni forme juridique */
    function cleRS(s) {
        return (" " + norm(s) + " ").replace(/ (sarl|sa|sas|sasu|ets|etablissements|ste|societe|group|groupe|cie|et cie|gie) /g, " ").replace(/\s+/g, "");
    }
    function cell(v) { return v == null ? "" : $.trim(String(v)); }

    function telDecompose(v) {
        var s = String(v || "").replace(/[\s.\-()\/]/g, ""), intl = false;
        if (/^\+237/.test(s)) { s = s.substr(4); intl = true; }
        else if (/^00237/.test(s)) { s = s.substr(5); intl = true; }
        else if (/^237\d{9}$/.test(s)) { s = s.substr(3); intl = true; }
        return { chiffres: s, intl: intl };
    }
    function telValide(v) { return /^[26]\d{8}$/.test(telDecompose(v).chiffres); }
    function telFormate(v) {
        var p = telDecompose(v), d = p.chiffres;
        if (!/^[26]\d{8}$/.test(d)) return $.trim(v || "");
        return (p.intl ? "+237 " : "") + d.substr(0, 3) + " " + d.substr(3, 2) + " " + d.substr(5, 2) + " " + d.substr(7, 2);
    }
    function emailValide(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
    function nombre(v) {
        var s = String(v == null ? "" : v).replace(/[\s  ]|fcfa|xaf|f$/gi, "").replace(",", ".").replace("%", "");
        if (s === "") return null;
        var n = parseFloat(s); return isNaN(n) ? NaN : n;
    }
    function typeDepuis(v) {
        var s = norm(v);
        if (!s) return "COMPTANT";
        if (/forfait/.test(s)) return "FORFAIT";
        if (/compte|credit|mensuel|^oui$|^yes$|^x$|^1$|^o$/.test(s)) return "EN_COMPTE";
        if (/comptant|cash|espece|^non$|^no$|^0$|^n$/.test(s)) return "COMPTANT";
        return null;
    }

    /* ------------------------------------------------------------------
       Étapes (affichage)
       ------------------------------------------------------------------ */
    function goto(n) {
        $(".ci-pane").addClass("cx-hidden").filter("[data-pane='" + n + "']").removeClass("cx-hidden");
        $("#ci-steps li").each(function () {
            var s = parseInt($(this).data("step"), 10);
            $(this).toggleClass("active", s === n).toggleClass("done", s < n);
        });
        $("html, body").scrollTop(0);
    }
    $(document).on("click", "[data-goto]", function () { goto(parseInt($(this).data("goto"), 10)); });

    /* =====================================================================
       ÉTAPE 1 - lecture du fichier
       ===================================================================== */
    var $drop = $("#ci-drop");
    $drop.on("dragover dragenter", function (e) { e.preventDefault(); $drop.addClass("over"); })
        .on("dragleave drop", function (e) { e.preventDefault(); $drop.removeClass("over"); })
        .on("drop", function (e) { var f = e.originalEvent.dataTransfer.files[0]; if (f) lireFichier(f); });
    $("#ci-file").on("change", function () { if (this.files[0]) lireFichier(this.files[0]); this.value = ""; });

    function lireFichier(file) {
        var ext = (file.name.split(".").pop() || "").toLowerCase();
        if ($.inArray(ext, ["xlsx", "xls", "csv"]) < 0) { U.toast("Format non pris en charge : utilisez un fichier .xlsx, .xls ou .csv.", "error"); return; }
        if (file.size > 10 * 1024 * 1024) { U.toast("Fichier trop volumineux (10 Mo maximum).", "error"); return; }
        state.fileName = file.name;
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                if (ext === "csv") {
                    state.workbook = null;
                    chargerAoa(lireCsv(decoderTexte(e.target.result)));
                    $("#ci-sheet").closest(".cx-field").addClass("cx-hidden");
                } else {
                    if (!window.XLSX) throw new Error("Bibliothèque Excel indisponible (connexion internet ?)");
                    state.workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
                    var $s = $("#ci-sheet").empty();
                    $.each(state.workbook.SheetNames, function (_, n) { $s.append($("<option>").val(n).text(n)); });
                    /* première feuille qui contient des données */
                    var premiere = $.grep(state.workbook.SheetNames, function (n) { return feuilleAoa(n).length > 1; })[0] || state.workbook.SheetNames[0];
                    $s.val(premiere);
                    $("#ci-sheet").closest(".cx-field").toggleClass("cx-hidden", state.workbook.SheetNames.length < 2);
                    chargerAoa(feuilleAoa(premiere));
                }
            } catch (err) {
                U.toast("Lecture impossible : " + U.esc(err.message || err), "error");
            }
        };
        reader.readAsArrayBuffer(file);
    }
    function decoderTexte(buf) {
        var txt;
        try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
        catch (e) { txt = new TextDecoder("windows-1252").decode(buf); }   // CSV « Excel » enregistré en ANSI
        return txt.replace(/^﻿/, "");
    }
    /* Lecteur CSV : séparateur ; ou , détecté, guillemets et retours à la ligne gérés */
    function lireCsv(txt) {
        var first = txt.split(/\r?\n/)[0] || "";
        var sep = (first.split(";").length >= first.split(",").length) ? ";" : ",";
        if (first.split("\t").length > first.split(sep).length) sep = "\t";
        var rows = [], row = [], cur = "", q = false;
        for (var i = 0; i < txt.length; i++) {
            var ch = txt.charAt(i);
            if (q) {
                if (ch === '"') { if (txt.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
                else cur += ch;
            } else if (ch === '"') q = true;
            else if (ch === sep) { row.push(cur); cur = ""; }
            else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && txt.charAt(i + 1) === "\n") i++;
                row.push(cur); rows.push(row); row = []; cur = "";
            } else cur += ch;
        }
        if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
        return rows;
    }
    function feuilleAoa(nom) {
        var ws = state.workbook.Sheets[nom];
        return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false, dateNF: "dd/mm/yyyy" });
    }
    $("#ci-sheet").on("change", function () { chargerAoa(feuilleAoa($(this).val())); });

    function chargerAoa(aoa) {
        aoa = $.grep(aoa, function (r) { return $.grep(r, function (c) { return cell(c) !== ""; }).length > 0; });
        if (!aoa.length) { U.toast("Le fichier est vide.", "warning"); return; }
        state.aoa = aoa;
        /* ligne d'en-tête : première ligne avec au moins 2 cellules texte non vides */
        var h = 0;
        for (var i = 0; i < Math.min(10, aoa.length); i++) {
            if ($.grep(aoa[i], function (c) { return cell(c) !== "" && isNaN(cell(c)); }).length >= 2) { h = i; break; }
        }
        var $h = $("#ci-header-row").empty();
        for (var j = 0; j < Math.min(10, aoa.length); j++) {
            $h.append($("<option>").val(j).text("Ligne " + (j + 1) + " : " + $.grep(aoa[j], function (c) { return cell(c) !== ""; }).slice(0, 4).join(" · ").substr(0, 70)));
        }
        $h.val(h);
        appliquerEntete(h);
        $("#ci-file-info").removeClass("cx-hidden").html(
            "<i class='fa fa-file-excel-o'></i><div><b>" + U.esc(state.fileName) + "</b><span>" +
            state.dataRows.length + " ligne(s) de données · " + state.headers.length + " colonne(s)</span></div>" +
            "<button type='button' class='cx-btn cx-btn-primary' id='btn-to-2'>Continuer <i class='fa fa-arrow-right'></i></button>");
        $("#ci-file-options").removeClass("cx-hidden");
    }
    $("#ci-header-row").on("change", function () { appliquerEntete(parseInt($(this).val(), 10)); });
    function appliquerEntete(h) {
        state.headerRow = h;
        var width = 0; $.each(state.aoa, function (_, r) { width = Math.max(width, r.length); });
        state.headers = [];
        for (var c = 0; c < width; c++) state.headers.push(cell(state.aoa[h][c]) || ("Colonne " + (c + 1)));
        state.dataRows = state.aoa.slice(h + 1);
        if (state.dataRows.length > 5000) { U.toast("5 000 lignes maximum par import : seules les 5 000 premières sont prises.", "warning"); state.dataRows = state.dataRows.slice(0, 5000); }
        autoMap();
        $("#ci-file-info span").text(state.dataRows.length + " ligne(s) de données · " + state.headers.length + " colonne(s)");
    }
    $(document).on("click", "#btn-to-2", function () {
        if (!state.dataRows.length) { U.toast("Aucune ligne de données sous les en-têtes.", "warning"); return; }
        renderMapping(); goto(2);
    });

    /* =====================================================================
       ÉTAPE 2 - correspondance des colonnes
       ===================================================================== */
    function autoMap() {
        var pris = {};
        state.mapping = $.map(state.headers, function () { return ""; });
        /* 1er passage : correspondance exacte ; 2e : l'en-tête contient un synonyme long */
        $.each([true, false], function (_, exact) {
            $.each(state.headers, function (i, h) {
                if (state.mapping[i]) return;
                var nh = norm(h);
                $.each(FIELDS, function (_, f) {
                    if (pris[f.key]) return;
                    var ok = $.grep(f.syn.concat([norm(f.label)]), function (s) {
                        return exact ? nh === s : (s.length >= 5 && (" " + nh + " ").indexOf(" " + s + " ") >= 0);
                    }).length;
                    if (ok) { state.mapping[i] = f.key; pris[f.key] = true; return false; }
                });
            });
        });
    }
    function exemples(i) {
        var ex = [];
        $.each(state.dataRows, function (_, r) { var v = cell(r[i]); if (v && ex.length < 3 && $.inArray(v, ex) < 0) ex.push(v); });
        return ex;
    }
    function renderMapping() {
        var opts = "<option value=''>— Ignorer cette colonne —</option>", grp = "";
        $.each(FIELDS, function (_, f) {
            if (f.group !== grp) { opts += (grp ? "</optgroup>" : "") + "<optgroup label='" + f.group + "'>"; grp = f.group; }
            opts += "<option value='" + f.key + "'>" + U.esc(f.label) + (f.req ? " *" : "") + "</option>";
        });
        opts += "</optgroup>";
        $("#ci-map tbody").html($.map(state.headers, function (h, i) {
            return "<tr data-i='" + i + "'><td class='cx-strong'>" + U.esc(h) + "</td>" +
                "<td class='ci-ex'>" + $.map(exemples(i), function (e) { return "<span>" + U.esc(e.substr(0, 40)) + "</span>"; }).join("") + "</td>" +
                "<td><select class='form-control input-sm ci-map-sel'>" + opts + "</select></td></tr>";
        }).join(""));
        $("#ci-map tbody tr").each(function () { $(this).find("select").val(state.mapping[$(this).data("i")]); });
        checkMapping();
    }
    $("#ci-map").on("change", ".ci-map-sel", function () {
        var i = $(this).closest("tr").data("i"), v = $(this).val();
        /* un champ ne peut être alimenté que par une colonne */
        if (v) $.each(state.mapping, function (j, k) { if (k === v && j !== i) { state.mapping[j] = ""; $("#ci-map tr[data-i='" + j + "'] select").val(""); } });
        state.mapping[i] = v;
        checkMapping();
    });
    $("#btn-automap").on("click", function () { autoMap(); renderMapping(); U.toast("Correspondance re-détectée.", "info"); });
    function checkMapping() {
        var mapped = {}; $.each(state.mapping, function (_, k) { if (k) mapped[k] = true; });
        $("#ci-map tbody tr").each(function () { $(this).toggleClass("cx-row-muted", !state.mapping[$(this).data("i")]); });
        var cles = ["raisonSociale", "typeCompte", "telStandard", "email", "niu", "rccm", "contactNom", "contactTel", "emailFacturation", "ville"];
        $("#ci-map-check").html($.map(cles, function (k) {
            return "<li class='" + (mapped[k] ? "ok" : "") + "'><i class='fa " + (mapped[k] ? "fa-check-circle" : "fa-circle-o") + "'></i>" +
                U.esc(FIELD[k].label) + (FIELD[k].req ? " <b>*</b>" : "") + "</li>";
        }).join("") + "<li class='ok'><i class='fa fa-columns'></i>" + $.grep(state.mapping, function (k) { return !!k; }).length + " colonne(s) importée(s) sur " + state.headers.length + "</li>");
        var ok = !!mapped.raisonSociale;
        $("#ci-map-err").toggleClass("cx-hidden", ok).find("div").text("Associez une colonne au champ « Raison sociale » (obligatoire).");
        $("#btn-to-3").prop("disabled", !ok);
    }
    $("#btn-to-3").on("click", function () { construireRecords(); goto(3); });

    /* =====================================================================
       ÉTAPE 3 - contrôle des lignes
       ===================================================================== */
    $.each(CX.REF.AGENCES, function (_, a) { $("#ci-agence").append($("<option>").val(a.id).text(a.nom + " (" + a.ville + ")")); });
    $("#ci-agence").val(CX.REF.AGENCES[0].id);

    function construireRecords() {
        state.records = $.map(state.dataRows, function (r, idx) {
            var v = {};
            $.each(state.mapping, function (i, k) { if (k) v[k] = cell(r[i]); });
            return { ligne: state.headerRow + idx + 2, v: v, exclu: false };
        });
        $.each(state.records, function (_, rec) { normaliser(rec); });
        controlerTout();
        if (!state.dt) initTable(); else state.dt.setRows(state.records);
        renderSynthese();
    }

    /* Mise en forme douce (sans perte) avant contrôle */
    function normaliser(rec) {
        var v = rec.v;
        $.each(["telStandard", "contactTel", "dgTel"], function (_, k) { if (v[k]) v[k] = telFormate(v[k]); });
        $.each(["email", "contactEmail", "dgEmail", "emailFacturation"], function (_, k) { if (v[k]) v[k] = v[k].toLowerCase(); });
        if (v.ville) {   /* « Yaoundé » -> « YAOUNDE » (nom du référentiel, sans tenir compte des accents) */
            var ref = $.grep(CX.REF.VILLES, function (x) { return norm(x.nom) === norm(v.ville); })[0];
            v.ville = ref ? ref.nom : v.ville.toUpperCase();
        }
        if (v.raisonSociale) v.raisonSociale = v.raisonSociale.replace(/\s+/g, " ");
        if (v.niu) v.niu = v.niu.replace(/\s/g, "").toUpperCase();
    }

    function controler(rec) {
        var v = rec.v, err = [], warn = [];
        rec.type = typeDepuis(v.typeCompte);
        if (!v.raisonSociale) err.push("Raison sociale manquante");
        if (rec.type === null) { warn.push("Type de compte « " + v.typeCompte + " » non reconnu : importé « Au comptant »"); rec.type = "COMPTANT"; }

        $.each([["email", "Email entreprise"], ["contactEmail", "Email du contact"], ["dgEmail", "Email du DG"]], function (_, p) {
            if (v[p[0]] && !emailValide(v[p[0]])) warn.push(p[1] + " invalide (ignoré)");
        });
        $.each([["telStandard", "Téléphone standard"], ["contactTel", "Téléphone du contact"], ["dgTel", "Téléphone du DG"]], function (_, p) {
            if (v[p[0]] && !telValide(v[p[0]])) warn.push(p[1] + " non conforme (9 chiffres, 2 ou 6)");
        });
        if (v.niu && !/^[A-Z0-9]{10,20}$/.test(v.niu)) warn.push("NIU au format inhabituel");
        if (v.ville && !$.grep(CX.REF.VILLES, function (x) { return x.nom === v.ville; }).length) warn.push("Ville « " + v.ville + " » absente du référentiel");
        $.each([["delaiPaiement", "Délai de paiement"], ["plafondCredit", "Plafond"], ["remisePct", "Remise"], ["montantForfait", "Forfait"]], function (_, p) {
            if (v[p[0]] && isNaN(nombre(v[p[0]]))) warn.push(p[1] + " n'est pas un nombre (ignoré)");
        });
        if (v.remisePct && nombre(v.remisePct) > 50) warn.push("Remise supérieure à 50 %");
        rec.agenceId = null;
        if (v.agence) {
            var a = $.grep(CX.REF.AGENCES, function (x) { return norm(x.nom) === norm(v.agence) && (!v.ville || x.ville === v.ville); })[0] ||
                $.grep(CX.REF.AGENCES, function (x) { return norm(x.nom) === norm(v.agence); })[0];
            if (a) rec.agenceId = a.id; else warn.push("Agence « " + v.agence + " » inconnue : agence par défaut");
        }

        /* Règles d'un client en compte (identiques au formulaire) */
        if (rec.type === "EN_COMPTE" || rec.type === "FORFAIT") {
            var manque = [];
            if (!v.niu) manque.push("NIU");
            if (!v.rccm) manque.push("RCCM");
            if (!v.contactNom) manque.push("nom du contact");
            if (!v.contactTel) manque.push("téléphone du contact");
            if (!v.emailFacturation && !(v.contactEmail && emailValide(v.contactEmail)) && !(v.email && emailValide(v.email))) manque.push("email de facturation");
            else if (v.emailFacturation && !emailValide(v.emailFacturation)) err.push("Email de facturation invalide");
            if (manque.length) err.push("Client en compte : " + manque.join(", ") + " manquant(s)");
        }
        if (rec.type === "FORFAIT" && !(nombre(v.montantForfait) > 0)) err.push("Montant du forfait manquant");

        /* Doublons : base existante puis fichier */
        rec.dupOf = null; rec.dupFichier = null;
        if (v.raisonSociale || v.niu) {
            var cle = cleRS(v.raisonSociale);
            var ex = $.grep(existants, function (c) { return (cle && cleRS(c.raisonSociale) === cle) || (v.niu && c.niu && c.niu.toUpperCase() === v.niu); })[0];
            if (ex) rec.dupOf = ex;
        }
        rec.err = err; rec.warn = warn;
    }
    function controlerTout() {
        $.each(state.records, function (_, r) { controler(r); });
        /* doublons internes au fichier : la 1re occurrence garde la main */
        var vus = {};
        $.each(state.records, function (_, r) {
            var k = cleRS(r.v.raisonSociale) || ("niu:" + (r.v.niu || ""));
            if (!k || k === "niu:") return;
            if (vus[k]) { r.dupFichier = vus[k]; r.err.push("Doublon dans le fichier (ligne " + vus[k] + ")"); }
            else vus[k] = r.ligne;
        });
        $.each(state.records, function (_, r) { r.statut = r.exclu ? "excl" : r.err.length ? "err" : r.dupOf ? "dup" : r.warn.length ? "warn" : "ok"; });
    }

    function badgeStatut(r) {
        var m = { ok: ["green", "Prête"], warn: ["orange", "Avertissement"], err: ["red", "Erreur"], dup: ["purple", "Existe déjà"], excl: ["grey", "Exclue"] }[r.statut];
        return "<span class='cx-badge cx-badge-" + m[0] + "'>" + m[1] + "</span>";
    }
    function initTable() {
        var cols = [
            { key: "ligne", title: "Ligne", className: "num", width: "60px", sortValue: function (r) { return r.ligne; } },
            { key: "statut", title: "Statut", render: badgeStatut, sortValue: function (r) { return { err: 0, dup: 1, warn: 2, ok: 3, excl: 4 }[r.statut]; }, searchValue: function (r) { return r.statut; } }
        ];
        $.each(PREVIEW_COLS, function (_, k) {
            cols.push({
                key: k, title: FIELD[k].label.replace("Contact principal - ", "Contact - "),
                render: function (r) {
                    var val = k === "typeCompte" ? TYPES[r.type] : (r.v[k] || "");
                    var vide = !val;
                    return "<span class='ci-cell" + (vide ? " vide" : "") + "' data-k='" + k + "' title='Cliquer pour modifier'>" + (vide ? "—" : U.esc(val)) + "</span>";
                },
                sortValue: function (r) { return r.v[k] || ""; }, searchValue: function (r) { return r.v[k] || ""; }
            });
        });
        cols.push({
            key: "msg", title: "Contrôles", sortable: false,
            render: function (r) {
                var h = "";
                if (r.dupOf) h += "<div class='ci-msg dup'><i class='fa fa-clone'></i> Existe déjà : <a href='client-fiche.html?id=" + r.dupOf.id + "' target='_blank'>" + U.esc(r.dupOf.raisonSociale) + "</a></div>";
                $.each(r.err, function (_, m) { h += "<div class='ci-msg err'><i class='fa fa-times-circle'></i> " + U.esc(m) + "</div>"; });
                $.each(r.warn, function (_, m) { h += "<div class='ci-msg warn'><i class='fa fa-exclamation-triangle'></i> " + U.esc(m) + "</div>"; });
                return h || "<span class='cx-muted'><i class='fa fa-check' style='color:var(--cx-green)'></i> OK</span>";
            },
            searchValue: function (r) { return r.err.concat(r.warn).join(" "); }
        });
        cols.push({
            key: "excl", title: "", sortable: false, className: "center",
            render: function (r) {
                return "<button type='button' class='cx-btn cx-btn-xs " + (r.exclu ? "cx-btn-soft" : "cx-btn-ghost") + " ci-excl' title='" +
                    (r.exclu ? "Réintégrer la ligne" : "Exclure la ligne de l'import") + "'><i class='fa " + (r.exclu ? "fa-undo" : "fa-ban") + "'></i></button>";
            }
        });
        state.dt = new CX.DataTable("#ci-preview", {
            columns: cols, rows: visibles(), pageSize: 50, sortKey: "ligne", rowId: function (r) { return r.ligne; },
            searchInput: "#ci-search", emptyText: "Aucune ligne dans cette catégorie", emptyIcon: "fa-table",
            rowClass: function (r) { return "ci-row-" + r.statut; }
        });
    }
    function visibles() {
        if (!state.filtre) return state.records;
        return $.grep(state.records, function (r) { return r.statut === state.filtre; });
    }
    function rafraichir() {
        controlerTout();
        state.dt.setRows(visibles());
        renderSynthese();
    }
    $("#ci-tabs").on("click", "a", function () {
        $("#ci-tabs a").removeClass("active"); $(this).addClass("active");
        state.filtre = $(this).data("filtre") || "";
        state.dt.setRows(visibles());
    });

    /* Édition d'une cellule en place */
    $("#ci-preview").on("click", ".ci-cell", function () {
        var $c = $(this), k = $c.data("k"), ligne = $c.closest("tr").data("id");
        var rec = $.grep(state.records, function (r) { return String(r.ligne) === String(ligne); })[0];
        if (!rec || $c.find("input,select").length) return;
        var $in;
        if (k === "typeCompte") {
            $in = $("<select class='form-control input-sm'>" + $.map(TYPES, function (l, code) { return "<option value='" + code + "'>" + l + "</option>"; }).join("") + "</select>").val(rec.type);
        } else {
            $in = $("<input type='text' class='form-control input-sm'>").val(rec.v[k] || "");
        }
        $c.html($in); $in.focus();
        function valider() {
            var val = $.trim($in.val());
            if (k === "typeCompte") rec.v.typeCompte = TYPES[val]; else rec.v[k] = val;
            normaliser(rec);
            rafraichir();
        }
        $in.on("blur change", valider).on("keydown", function (e) { if (e.which === 13) $in.blur(); if (e.which === 27) { $in.off("blur change"); rafraichir(); } });
    });
    $("#ci-preview").on("click", ".ci-excl", function () {
        var ligne = $(this).closest("tr").data("id");
        var rec = $.grep(state.records, function (r) { return String(r.ligne) === String(ligne); })[0];
        rec.exclu = !rec.exclu;
        rafraichir();
    });
    $("input[name=ci-dup], #ci-opt-warn").on("change", renderSynthese);

    /* Lignes qui seront effectivement importées selon les options */
    function aImporter() {
        var modeDup = $("input[name=ci-dup]:checked").val(), avecWarn = $("#ci-opt-warn").is(":checked");
        return $.grep(state.records, function (r) {
            if (r.exclu || r.err.length) return false;
            if (r.dupOf && modeDup === "IGNORER") return false;
            if (!avecWarn && r.warn.length) return false;
            return true;
        });
    }
    function renderSynthese() {
        var c = { all: state.records.length, ok: 0, warn: 0, err: 0, dup: 0, excl: 0 };
        $.each(state.records, function (_, r) { c[r.statut]++; });
        $.each(c, function (k, n) { $("#ci-tabs [data-c='" + k + "']").text(n); });
        var n = aImporter().length, maj = $.grep(aImporter(), function (r) { return r.dupOf && $("input[name=ci-dup]:checked").val() === "MAJ"; }).length;
        $("#ci-kpis").html(
            kpi("Lignes lues", c.all, U.esc(state.fileName), "fa-file-excel-o", "") +
            kpi("Prêtes", c.ok, "sans anomalie", "fa-check", "green") +
            kpi("Avertissements", c.warn, "importables, à vérifier", "fa-exclamation-triangle", "orange") +
            kpi("Erreurs", c.err, "non importées", "fa-times-circle", "red") +
            kpi("Déjà en base", c.dup, "selon l'option choisie", "fa-clone", "purple"));
        $("#ci-hero-n, #ci-btn-n").text(n);
        $("#ci-hero-file").text(state.fileName);
        $("#ci-hero-sub").text((n - maj) + " création(s)" + (maj ? " · " + maj + " mise(s) à jour" : "") + " · " + (c.all - n) + " ligne(s) écartée(s)");
        $("#btn-import").prop("disabled", n === 0);
        $("#ci-block").toggleClass("cx-hidden", c.err === 0).find("div")
            .html("<b>" + c.err + " ligne(s) en erreur</b> ne seront pas importées. Corrigez-les dans l'aperçu (clic sur la cellule) ou dans le fichier.");
    }
    function kpi(label, val, foot, icon, color) {
        return "<div class='cx-kpi " + color + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div><div class='cx-kpi-label'>" + label +
            "</div><div class='cx-kpi-value'>" + val + "</div><div class='cx-kpi-foot'>" + foot + "</div></div>";
    }

    /* =====================================================================
       ÉTAPE 4 - import
       ===================================================================== */
    function versClient(rec, base) {
        var v = rec.v, n = function (k) { var x = nombre(v[k]); return isNaN(x) || x == null ? null : x; };
        var okMail = function (k) { return v[k] && emailValide(v[k]) ? v[k] : ""; };
        var c = base ? $.extend(true, {}, base) : {
            raisonSociale: "", sigle: "", secteur: "", rccm: "", niu: "", ville: CX.CONFIG.USER.ville, localisation: "", telStandard: "",
            email: "", adresse: "", activites: "", note: "",
            contacts: [{ role: "PRINCIPAL", nom: "", tel1: "", tel2: "", email: "", titre: "" },
                { role: "SECOND", nom: "", tel1: "", tel2: "", email: "", titre: "" },
                { role: "DG", nom: "", tel1: "", tel2: "", email: "" }],
            enCompte: false, forfait: false, montantForfait: 0, tarifAuto: false, tarifToutesAgences: false, tarifAgences: [],
            remisePct: 0, delaiPaiement: CX.CONFIG.DELAI_PAIEMENT_JOURS, periodicite: "MENSUELLE", plafondCredit: 0,
            emailFacturation: "", agenceId: parseInt($("#ci-agence").val(), 10), commercial: CX.CONFIG.USER.nom,
            ficheClient: null, statut: "ACTIF", historique: []
        };
        /* en mise à jour, seules les valeurs non vides du fichier remplacent l'existant */
        function set(champ, val) { if (val !== "" && val != null) c[champ] = val; }
        set("code", v.code); set("raisonSociale", v.raisonSociale); set("sigle", v.sigle); set("secteur", v.secteur);
        set("rccm", v.rccm); set("niu", v.niu); set("ville", v.ville); set("localisation", v.localisation);
        set("adresse", v.adresse); set("telStandard", v.telStandard); set("email", okMail("email"));
        set("activites", v.activites); set("note", v.note); set("commercial", v.commercial);
        var p = c.contacts[0], dg = c.contacts[2];
        if (v.contactNom) p.nom = v.contactNom; if (v.contactTel) p.tel1 = v.contactTel;
        if (okMail("contactEmail")) p.email = v.contactEmail; if (v.contactTitre) p.titre = v.contactTitre;
        if (v.dgNom) dg.nom = v.dgNom; if (v.dgTel) dg.tel1 = v.dgTel; if (okMail("dgEmail")) dg.email = v.dgEmail;
        if (v.typeCompte || !base) {
            c.enCompte = rec.type !== "COMPTANT"; c.forfait = rec.type === "FORFAIT"; c.tarifAuto = c.enCompte;
        }
        set("emailFacturation", okMail("emailFacturation") || (c.enCompte && !c.emailFacturation ? (okMail("contactEmail") || okMail("email")) : ""));
        set("delaiPaiement", n("delaiPaiement")); set("plafondCredit", n("plafondCredit"));
        set("remisePct", n("remisePct")); set("montantForfait", n("montantForfait"));
        if (rec.agenceId) c.agenceId = rec.agenceId;
        return c;
    }

    $("#btn-import").on("click", function () {
        var lignes = aImporter(), modeDup = $("input[name=ci-dup]:checked").val();
        if (!lignes.length) return;
        U.confirm({
            title: "Confirmer l'import",
            message: "<p><b>" + lignes.length + " client(s)</b> vont être enregistrés en base depuis <b>" + U.esc(state.fileName) + "</b>.</p>" +
                "<p class='cx-muted'>Doublons : " + { IGNORER: "ignorés", MAJ: "mis à jour", CREER: "créés en double" }[modeDup] + ".</p>",
            okText: "Importer", okClass: "cx-btn-success"
        }).done(function () { lancer(lignes, modeDup); });
    });

    function lancer(lignes, modeDup) {
        goto(4);
        state.report = [];
        var i = 0, res = { crees: 0, maj: 0, ignores: 0, erreurs: 0 }, total = lignes.length;
        /* lignes écartées (erreur, exclusion, doublon ignoré) dans le rapport */
        $.each(state.records, function (_, r) {
            if ($.inArray(r, lignes) >= 0) return;
            var raison = r.exclu ? "Exclue manuellement" : r.err.length ? r.err.join(" ; ") : r.dupOf ? "Doublon ignoré (" + r.dupOf.code + ")" : "Avertissement non importé : " + r.warn.join(" ; ");
            state.report.push([r.ligne, r.v.raisonSociale || "", r.err.length ? "ERREUR" : "IGNORÉE", "", raison]);
            if (r.err.length) res.erreurs++; else res.ignores++;
        });
        function suivant() {
            if (i >= total) return fin();
            var lot = lignes.slice(i, i + 25);     // par lots de 25 pour garder l'interface fluide
            var calls = $.map(lot, function (rec) {
                var maj = rec.dupOf && modeDup === "MAJ";
                var c = versClient(rec, maj ? rec.dupOf : null);
                c.historique = c.historique || [];
                c.historique.unshift({ date: U.now(), user: CX.CONFIG.USER.nom, action: (maj ? "Mise à jour" : "Création") + " par import du fichier « " + state.fileName + " » (ligne " + rec.ligne + ")" });
                // TODO API : en production, un seul POST /commercial/clients/import avec toutes les lignes (transaction)
                return CX.api.save("clients", c).done(function (s) {
                    if (maj) res.maj++; else res.crees++;
                    state.report.push([rec.ligne, s.raisonSociale, maj ? "MISE À JOUR" : "CRÉÉ", s.code || s.numero, rec.warn.join(" ; ")]);
                });
            });
            $.when.apply($, calls).always(function () {
                i += lot.length;
                var pct = Math.round(i / total * 100);
                $("#ci-progress").css("width", pct + "%");
                $("#ci-progress-txt").text(i + " / " + total + " client(s) traités");
                setTimeout(suivant, 60);
            });
        }
        function fin() {
            $("#ci-progress-zone").addClass("cx-hidden");
            $("#ci-done").removeClass("cx-hidden");
            $("#ci-done-sub").text("Fichier « " + state.fileName + " » · " + U.toFr(U.today()));
            $("#ci-done-kpis").html(
                kpi("Créés", res.crees, "nouveaux comptes", "fa-plus", "green") +
                kpi("Mis à jour", res.maj, "comptes existants", "fa-refresh", "") +
                kpi("Ignorés", res.ignores, "doublons / exclus", "fa-minus-circle", "orange") +
                kpi("En erreur", res.erreurs, "voir le rapport", "fa-times-circle", "red"));
            state.report.sort(function (a, b) { return a[0] - b[0]; });
            U.toast(res.crees + " client(s) créé(s), " + res.maj + " mis à jour.");
        }
        suivant();
    }

    /* =====================================================================
       Fichiers téléchargeables
       ===================================================================== */
    function csv(nom, entetes, lignes) {
        var esc = function (x) { x = String(x == null ? "" : x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
        var txt = "﻿" + [entetes].concat(lignes).map(function (l) { return $.map(l, esc).join(";"); }).join("\r\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
        a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    }
    $("#btn-report").on("click", function () {
        csv("rapport-import-clients-" + U.today() + ".csv", ["Ligne", "Raison sociale", "Résultat", "Code client", "Remarques"], state.report);
    });
    $("#btn-errors-csv").on("click", function () {
        var l = $.map($.grep(state.records, function (r) { return r.err.length || r.warn.length || r.dupOf; }), function (r) {
            return [[r.ligne, r.v.raisonSociale || "", r.err.length ? "ERREUR" : r.dupOf ? "DOUBLON" : "AVERTISSEMENT", r.err.concat(r.warn).join(" ; ") + (r.dupOf ? " Existe déjà : " + r.dupOf.code : "")]];
        });
        csv("anomalies-import-clients.csv", ["Ligne", "Raison sociale", "Type", "Détail"], l);
    });

    /* Modèle Excel : en-têtes reconnus + 2 exemples + feuille d'instructions */
    function telechargerModele() {
        if (!window.XLSX) { U.toast("Bibliothèque Excel indisponible.", "error"); return; }
        var cles = ["code", "raisonSociale", "sigle", "typeCompte", "secteur", "rccm", "niu", "ville", "localisation", "adresse", "telStandard", "email",
            "contactNom", "contactTel", "contactEmail", "contactTitre", "dgNom", "dgTel", "dgEmail", "emailFacturation", "delaiPaiement",
            "plafondCredit", "remisePct", "montantForfait", "agence", "commercial", "activites", "note"];
        var ent = $.map(cles, function (k) { return FIELD[k].label; });
        var ex1 = ["", "PHARMACIE DU LITTORAL SARL", "PDL", "En compte", "Pharmacie / Santé", "RC/DLA/2019/B/1234", "M091900012345A", "DOUALA", "Akwa, rue Joss",
            "BP 1234 Douala", "233 42 11 11", "contact@pharmalittoral.cm", "Mme Ngo Esther", "699 12 34 56", "esther@pharmalittoral.cm", "Responsable achats",
            "M. Ekambi Paul", "677 00 11 22", "dg@pharmalittoral.cm", "compta@pharmalittoral.cm", 30, 1500000, 5, "", "AKWA", CX.CONFIG.USER.nom, "Officine", ""];
        var ex2 = ["", "QUINCAILLERIE MODERNE", "", "Comptant", "Commerce / Distribution", "", "", "YAOUNDE", "Mvog-Mbi", "", "222 23 45 67", "", "M. Abega Jean",
            "690 11 22 33", "", "", "", "", "", "", "", "", "", "", "CENTRALE", "", "", ""];
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet([ent, ex1, ex2]);
        ws["!cols"] = $.map(ent, function (e) { return { wch: Math.max(14, e.length + 2) }; });
        XLSX.utils.book_append_sheet(wb, ws, "Clients");
        var aide = [["Champ", "Obligatoire", "Format / valeurs acceptées"]].concat($.map(cles, function (k) {
            var f = FIELD[k], fmt = {
                typeCompte: "Comptant | En compte | Forfait (vide = Comptant)", telStandard: "9 chiffres commençant par 2 ou 6, +237 facultatif",
                contactTel: "9 chiffres commençant par 2 ou 6", niu: "Lettres et chiffres sans espace", ville: "Nom de ville (DOUALA, YAOUNDE…)",
                delaiPaiement: "Nombre de jours", plafondCredit: "Montant en FCFA", remisePct: "Pourcentage (ex : 5)", montantForfait: "Montant en FCFA (obligatoire si Forfait)",
                agence: "Nom de l'agence (AKWA, BONANJO, CENTRALE…)", emailFacturation: "Obligatoire pour un client en compte (sinon email du contact)"
            }[k] || "Texte libre";
            return [[f.label, f.req ? "Oui" : (k === "niu" || k === "rccm" || k === "contactTel" ? "Si en compte" : "Non"), fmt]];
        }));
        var ws2 = XLSX.utils.aoa_to_sheet(aide);
        ws2["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, ws2, "Instructions");
        XLSX.writeFile(wb, "modele-import-clients.xlsx");
    }
    $("#btn-modele, #btn-modele-2").on("click", telechargerModele);
});

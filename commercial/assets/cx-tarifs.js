/* =====================================================================
   ClemenTino 2.0 - Module COMMERCIAL - moteur de tarification (CX.tarifs)
   ---------------------------------------------------------------------
   À charger APRÈS cx-core.js et cx-data.js.

   Vocabulaire
     - Grille tarifaire (« tarifaire ») : collection "tarifaires" du store.
       Type STANDARD (tous les clients sans tarif spécifique), CLIENT
       (affectée à un ou plusieurs clients) ou GROUPE (affectée à des
       groupes de clients). Statut BROUILLON | ACTIVE | ARCHIVEE.
     - Règle : un périmètre (trajet, villes / zone, type d'envoi, natures,
       bornes de poids) + un modèle de tarification + ses paramètres.
     - Contrat client : collection "contrats" ; il rattache une grille à un
       client pour une période donnée (prioritaire sur tout le reste).
     - Groupe de clients : collection "groupesClients" { nom, clientIds }.

   Modèle de données d'une grille
     {
       id, code: "TAR-0001", nom, description,
       type: "STANDARD" | "CLIENT" | "GROUPE",
       statut: "BROUILLON" | "ACTIVE" | "ARCHIVEE",
       du: "2026-01-01", au: "" (vide = sans date de fin), devise: "FCFA",
       baseId: null | id d'une autre grille,   // grille de base (repli)
       remiseBasePct: 10,                      // remise sur la base (négatif = majoration)
       heriterSupplements: true,               // suppléments repris de la base
       diviseurVol: 5000,                      // poids volumétrique = L × l × H (cm) / diviseur
       minimum: 1500,                          // minimum de perception par envoi
       arrondi: 100, arrondiMode: "SUP" | "PROCHE",
       tvaIncluse: false,                      // prix saisis TTC ?
       regles: [ regle, ... ],
       supplements: {
         natures:   [{ nature: "Fragile", mode: "PCT" | "FIXE", valeur: 25 }],
         livraison: [{ zone: "Z1", prix: 1500 }],            // livraison à domicile par zone
         express:   { actif: true, mode: "PCT" | "FIXE", valeur: 50 },
         emballage: { actif: true, mode: "PAR_COLIS" | "FIXE", valeur: 500 }
       },
       affectation: { clientIds: [1], groupeIds: [2] }
     }
   Règle
     {
       id, libelle, actif: true, cumulable: false,  // cumulable = s'ajoute à la règle principale (ex. assurance)
       perimetre: {
         typeTrajet: "" | "URBAIN" | "NATIONAL" | "REGIONAL" | "INTERNATIONAL",
         villesDep: ["DOUALA"], villesDest: ["GAROUA"], bidirectionnel: true,
         zones: ["CEMAC"],                          // régional / international
         typesEnvoi: ["DOCUMENT" | "COLIS" | "FRET"], natures: ["Fragile"],
         poidsMin: "" (exclu), poidsMax: "" (inclus)
       },
       modele: "TRANCHES" | "INCREMENTIEL" | "PALIERS" | "AU_KG" | "PIECE" | "AD_VALOREM",
       params: { ... selon le modèle, voir defaultParams() }
     }

   Choix de la règle : parmi les règles actives non cumulables dont le
   périmètre couvre l'envoi, la plus PRÉCISE l'emporte (score : villes > zone
   > type de trajet > type d'envoi / nature / poids) ; à égalité, la première
   de la liste. Si aucune ne convient, on passe à la grille de base (avec sa
   remise). Les règles cumulables (ad valorem…) s'ajoutent ensuite.

   API
     CX.tarifs.resoudre(clientId, dateIso[, opts])  -> { grille, origine, contrat, groupe, libelle, alertes }
           origine : CONTRAT > CLIENT (grille affectée) > GROUPE > STANDARD
     CX.tarifs.calculer(grille, envoi) -> { total, ht, tva, ttc, regle, lignes[], alertes[], parts{}, poidsTaxable… }
           envoi = { villeDep, villeDest, typeTrajet, typeEnvoi, nature, poids, L, l, H, nombre,
                     valeurDeclaree, livraison: "BUREAU"|"DOMICILE", zone: "Z1", express, emballage,
                     paysDest, colis: [{ nature, poids, L, l, H, nombre, valeur }] (facultatif, plusieurs colis) }
     + libellés (libModele, libPerimetre, libOrigine…), aides d'interface (detailHtml) et valeurs par défaut.

   >>> INTÉGRATION SYMFONY <<<
   Le calcul doit être refait côté serveur (service TarificationService) à
   partir des mêmes données ; ce fichier sert de spécification exécutable et
   de calcul « en direct » dans l'interface. Points serveur repérés par
   « TODO API ». Le moteur n'utilise pas jQuery (testable sous node :
   commercial/tests/tarifs-moteur.test.js).
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.tarifs = (function () {
    var U = CX.util;

    /* =================================================================
       Référentiels propres à la tarification
       ================================================================= */
    var TYPES_GRILLE = {
        STANDARD: { label: "Standard", color: "blue", icon: "fa-globe", desc: "Tous les clients sans tarif spécifique" },
        CLIENT: { label: "Client", color: "purple", icon: "fa-user", desc: "Tarif négocié d'un ou plusieurs clients" },
        GROUPE: { label: "Groupe", color: "orange", icon: "fa-users", desc: "Tarif d'un groupe de clients" }
    };
    var STATUTS_GRILLE = {
        BROUILLON: { label: "Brouillon", color: "grey" },
        ACTIVE: { label: "Active", color: "green" },
        ARCHIVEE: { label: "Archivée", color: "red" }
    };
    var STATUTS_CONTRAT = {
        ACTIF: { label: "Actif", color: "green" },
        A_VENIR: { label: "À venir", color: "blue" },
        EXPIRE: { label: "Expiré", color: "orange" },
        RESILIE: { label: "Résilié", color: "red" }
    };
    var ORIGINES = {
        CONTRAT: { label: "Contrat client", color: "purple", icon: "fa-file-text-o" },
        CLIENT: { label: "Grille du client", color: "blue", icon: "fa-user" },
        GROUPE: { label: "Groupe de clients", color: "orange", icon: "fa-users" },
        STANDARD: { label: "Grille standard", color: "grey", icon: "fa-globe" }
    };
    var TRAJETS = {
        URBAIN: { label: "Urbain", desc: "Même ville", icon: "fa-building-o" },
        NATIONAL: { label: "National", desc: "Entre villes du Cameroun", icon: "fa-road" },
        REGIONAL: { label: "Régional", desc: "Zone CEMAC", icon: "fa-globe" },
        INTERNATIONAL: { label: "International", desc: "Reste du monde", icon: "fa-plane" }
    };
    var TYPES_ENVOI = {
        DOCUMENT: { label: "Document / pli", icon: "fa-envelope-o", desc: "Plis, enveloppes, courrier" },
        COLIS: { label: "Colis", icon: "fa-cube", desc: "Messagerie standard" },
        FRET: { label: "Fret", icon: "fa-truck", desc: "Messagerie lourde, palettes" }
    };
    var MODELES = {
        TRANCHES: { label: "Forfait par tranches", icon: "fa-bar-chart", desc: "Un prix fixe par tranche de poids (0–1 kg, 1–5 kg…)" },
        INCREMENTIEL: { label: "Valeur incrémentielle", icon: "fa-plus-square-o", desc: "Prix de base jusqu'à N kg + X F par kg (ou pas) supplémentaire" },
        PALIERS: { label: "Forme incrémentielle", icon: "fa-signal", desc: "Prix au kg différent par palier (cumulatif ou au palier atteint)" },
        AU_KG: { label: "Prix au kg", icon: "fa-balance-scale", desc: "Prix au kg simple avec minimum" },
        PIECE: { label: "À la pièce", icon: "fa-files-o", desc: "Prix par pli, document ou colis (dégressif possible)" },
        AD_VALOREM: { label: "Ad valorem", icon: "fa-shield", desc: "% de la valeur déclarée (assurance) avec minimum" }
    };
    /* Zones régionales / internationales (pays de destination -> zone) */
    var ZONES = [
        { code: "CEMAC", label: "Zone CEMAC", trajet: "REGIONAL", pays: ["Gabon", "Tchad", "Congo", "République centrafricaine", "Guinée équatoriale"] },
        { code: "AFRIQUE", label: "Reste de l'Afrique", trajet: "INTERNATIONAL", pays: ["Nigeria"] },
        { code: "EUROPE", label: "Europe", trajet: "INTERNATIONAL", pays: ["France", "Belgique", "Suisse", "Allemagne", "Royaume-Uni"] },
        { code: "AMERIQUE", label: "Amérique du Nord", trajet: "INTERNATIONAL", pays: ["États-Unis", "Canada"] },
        { code: "ASIE", label: "Asie & Moyen-Orient", trajet: "INTERNATIONAL", pays: ["Chine", "Émirats arabes unis"] }
    ];
    var NATURES_DOCUMENT = ["Pli fermé", "Document"];
    var DIVISEUR_DEFAUT = 5000;
    var EPS = 1e-9;

    /* =================================================================
       Petites aides (sans jQuery)
       ================================================================= */
    function each(a, fn) { for (var i = 0; i < (a ? a.length : 0); i++) fn(a[i], i); }
    function filter(a, fn) { var r = []; each(a, function (x, i) { if (fn(x, i)) r.push(x); }); return r; }
    function find(a, fn) { for (var i = 0; i < (a ? a.length : 0); i++) if (fn(a[i], i)) return a[i]; return null; }
    function map(a, fn) { var r = []; each(a, function (x, i) { r.push(fn(x, i)); }); return r; }
    function contient(a, v) { for (var i = 0; i < (a ? a.length : 0); i++) if (String(a[i]) === String(v)) return true; return false; }
    function num(v) { return U.num(v); }
    function rnd(n) { return Math.round(Number(n) || 0); }
    function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function vide(v) { return v == null || v === ""; }
    function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
    function ceilDiv(a, b) { return Math.ceil(a / b - EPS); }
    function dec(n) { n = r2(n); return n % 1 ? (Math.round(n * 10) === n * 10 ? 1 : 2) : 0; }
    /* Formats courts utilisés dans le détail du calcul */
    function F(n) { return U.fmt(rnd(n)) + " F"; }
    function kg(n) { n = r2(n); return U.fmt(n, dec(n)) + " kg"; }
    function pct(n) { n = r2(n); return U.fmt(n, dec(n)) + " %"; }
    function parPas(pas) { return Number(pas) === 1 ? "kg" : "tranche de " + kg(pas); }
    function plage(de, a) { return a == null || a === Infinity ? "plus de " + kg(de) : U.fmt(r2(de), dec(de)) + " – " + kg(a); }
    function villeLabel(v) {
        var acc = { YAOUNDE: "Yaoundé", NGAOUNDERE: "Ngaoundéré", BUEA: "Buéa" };
        if (!v) return "";
        return acc[v] || (v.charAt(0) + v.substr(1).toLowerCase());
    }

    /* Accès synchrone au store (référentiel déjà chargé dans la page) */
    function store(coll) {
        // TODO API : en production, ces lectures sont remplacées par GET /commercial/tarifs/resoudre?client=&date=
        //            (le serveur renvoie directement la grille applicable et son origine)
        return CX.api && CX.api.listSync ? CX.api.listSync(coll) : [];
    }
    function grilleParId(id) {
        if (vide(id)) return null;
        return find(store("tarifaires"), function (g) { return String(g.id) === String(id); });
    }

    /* =================================================================
       Normalisation de l'envoi
       ================================================================= */
    /* "URBAINE" (cotations) -> "URBAIN" (tarifs) */
    function normTrajet(t) {
        t = String(t || "").toUpperCase();
        if (TRAJETS[t]) return t;
        if (t && t.charAt(t.length - 1) === "E" && TRAJETS[t.substr(0, t.length - 1)]) return t.substr(0, t.length - 1);
        return "";
    }
    function zoneDuPays(pays) {
        if (!pays) return "";
        var z = find(ZONES, function (x) { return contient(x.pays, pays); });
        return z ? z.code : "";
    }
    function deduireTrajet(villeDep, villeDest, paysDest) {
        if (paysDest) { var z = find(ZONES, function (x) { return x.code === zoneDuPays(paysDest); }); return z ? z.trajet : "INTERNATIONAL"; }
        if (villeDep && villeDest && villeDep === villeDest) return "URBAIN";
        return "NATIONAL";
    }
    function typeEnvoiDeNature(nature) { return contient(NATURES_DOCUMENT, nature) ? "DOCUMENT" : "COLIS"; }
    function poidsVolumetrique(L, l, H, diviseur) {
        var d = num(diviseur) || DIVISEUR_DEFAUT;
        return Math.round((num(L) * num(l) * num(H)) / d * 10) / 10;
    }
    function arrondir(m, pas, mode) {
        pas = num(pas);
        if (pas <= 1) return rnd(m);
        return mode === "PROCHE" ? Math.round(m / pas) * pas : Math.ceil(m / pas - EPS) * pas;
    }

    function normaliserEnvoi(env) {
        env = env || {};
        var e = {
            villeDep: env.villeDep || "", villeDest: env.villeDest || "", paysDest: env.paysDest || "",
            livraison: env.livraison === "DOMICILE" ? "DOMICILE" : "BUREAU", zone: env.zone || "",
            express: !!env.express, emballage: !!env.emballage, typeEnvoi: TYPES_ENVOI[env.typeEnvoi] ? env.typeEnvoi : ""
        };
        e.zoneInter = env.zoneInter || zoneDuPays(e.paysDest);
        e.typeTrajet = normTrajet(env.typeTrajet) || deduireTrajet(e.villeDep, e.villeDest, e.paysDest);
        if (e.typeTrajet === "URBAIN" && !e.villeDest) e.villeDest = e.villeDep;
        if (e.typeTrajet === "REGIONAL" || e.typeTrajet === "INTERNATIONAL") e.villeDest = "";
        var src = env.colis && env.colis.length ? env.colis : [{
            nature: env.nature, poids: env.poids, L: env.L, l: env.l, H: env.H, nombre: env.nombre, valeur: env.valeurDeclaree
        }];
        e.colis = map(src, function (c) {
            return {
                nature: c.nature || (e.typeEnvoi === "DOCUMENT" ? "Document" : "Colis"),
                poids: Math.max(0, num(c.poids)), L: num(c.L), l: num(c.l), H: num(c.H),
                nombre: Math.max(1, parseInt(c.nombre, 10) || 1),
                valeur: Math.max(0, num(c.valeur != null ? c.valeur : c.valeurDeclaree))
            };
        });
        return e;
    }

    /* =================================================================
       Chaîne de grilles (grille -> base -> base de la base…)
       ================================================================= */
    function chaineGrilles(grille) {
        var chaine = [], vus = {}, g = grille;
        while (g && chaine.length < 4) {
            if (g.id != null && vus[g.id]) break;          // protection contre une boucle de bases
            if (g.id != null) vus[g.id] = true;
            chaine.push(g);
            g = vide(g.baseId) ? null : grilleParId(g.baseId);
        }
        return chaine;
    }
    function diviseurDe(grille) {
        var ch = chaineGrilles(grille);
        for (var i = 0; i < ch.length; i++) if (num(ch[i].diviseurVol) > 0) return num(ch[i].diviseurVol);
        return DIVISEUR_DEFAUT;
    }
    function supplementsVides() {
        return { natures: [], livraison: [], express: { actif: false, mode: "PCT", valeur: 0 }, emballage: { actif: false, mode: "PAR_COLIS", valeur: 0 } };
    }
    /* Suppléments effectifs : ceux de la grille, ou de sa base si « hériter » */
    function supplementsDe(grille) {
        var ch = chaineGrilles(grille), g = ch[0], i = 0;
        while (g && g.heriterSupplements && !vide(g.baseId) && ch[i + 1]) { i++; g = ch[i]; }
        var s = g && g.supplements ? g.supplements : {}, v = supplementsVides();
        return {
            natures: s.natures || v.natures, livraison: s.livraison || v.livraison,
            express: s.express || v.express, emballage: s.emballage || v.emballage,
            source: g
        };
    }

    /* =================================================================
       Correspondance règle <-> envoi
       ================================================================= */
    function perimetre(r) {
        var p = (r && r.perimetre) || {};
        return {
            typeTrajet: p.typeTrajet || "", villesDep: p.villesDep || [], villesDest: p.villesDest || [],
            bidirectionnel: p.bidirectionnel !== false, zones: p.zones || [],
            typesEnvoi: p.typesEnvoi || [], natures: p.natures || [],
            poidsMin: vide(p.poidsMin) ? null : num(p.poidsMin), poidsMax: vide(p.poidsMax) ? null : num(p.poidsMax)
        };
    }
    /* ec = { typeTrajet, villeDep, villeDest, zoneInter, typeEnvoi, nature, poids } */
    function correspond(r, ec) {
        if (!r || r.actif === false) return false;
        var p = perimetre(r);
        if (p.typeTrajet && p.typeTrajet !== ec.typeTrajet) return false;
        if (p.villesDep.length || p.villesDest.length) {
            var sens = function (a, b) {
                return (!p.villesDep.length || contient(p.villesDep, a)) && (!p.villesDest.length || contient(p.villesDest, b));
            };
            if (!(sens(ec.villeDep, ec.villeDest) || (p.bidirectionnel && sens(ec.villeDest, ec.villeDep)))) return false;
        }
        if (p.zones.length && !contient(p.zones, ec.zoneInter)) return false;
        if (p.typesEnvoi.length && !contient(p.typesEnvoi, ec.typeEnvoi)) return false;
        if (p.natures.length && !contient(p.natures, ec.nature)) return false;
        if (p.poidsMin != null && p.poidsMin > 0 && !(ec.poids > p.poidsMin + EPS)) return false;
        if (p.poidsMax != null && p.poidsMax > 0 && ec.poids > p.poidsMax + EPS) return false;
        return true;
    }
    function score(r) {
        var p = perimetre(r);
        return (p.villesDep.length ? 4 : 0) + (p.villesDest.length ? 4 : 0) + (p.zones.length ? 3 : 0) + (p.typeTrajet ? 2 : 0) +
            (p.typesEnvoi.length ? 1 : 0) + (p.natures.length ? 1 : 0) + ((p.poidsMin || p.poidsMax) ? 1 : 0);
    }
    function meilleureRegle(regles, ec) {
        var best = null, bs = -1;
        each(regles, function (r) {
            if (r.cumulable || !correspond(r, ec)) return;
            var s = score(r);
            if (s > bs) { best = r; bs = s; }
        });
        return best;
    }
    /* Règle principale en remontant la chaîne des bases */
    function principal(chaine, ec) {
        var facteur = 1;
        for (var i = 0; i < chaine.length; i++) {
            if (i > 0) facteur *= (1 - num(chaine[i - 1].remiseBasePct) / 100);
            var r = meilleureRegle(chaine[i].regles, ec);
            if (r) return { regle: r, grille: chaine[i], niveau: i, remisePct: r2((1 - facteur) * 100) };
        }
        return null;
    }
    /* Règles cumulables : celles de la première grille de la chaîne qui en définit */
    function cumulables(chaine, ec) {
        for (var i = 0; i < chaine.length; i++) {
            var cum = filter(chaine[i].regles, function (r) { return r.cumulable && r.actif !== false; });
            if (cum.length) return filter(cum, function (r) { return correspond(r, ec); });
        }
        return [];
    }

    /* =================================================================
       Prix d'une règle selon son modèle
       p = poids taxable d'UN colis (kg), nombre = nombre de colis identiques,
       valeur = valeur déclarée de la ligne (FCFA)
       Retour : { unitaire, total, texte, alertes[] }
       ================================================================= */
    function triees(liste, cle) {
        return filter(liste || [], function (x) { return !!x; }).sort(function (a, b) {
            var va = vide(a[cle]) ? Infinity : num(a[cle]), vb = vide(b[cle]) ? Infinity : num(b[cle]);
            return va - vb;
        });
    }
    function prixModele(r, p, nombre, valeur) {
        var pa = (r && r.params) || {}, out = { unitaire: 0, total: 0, texte: "", alertes: [] };
        nombre = Math.max(1, parseInt(nombre, 10) || 1);
        p = Math.max(0, num(p));
        var unit = 0, texte = "", i, parUnite = true;

        switch (r && r.modele) {
            case "TRANCHES": {
                var tr = filter(triees(pa.tranches, "max"), function (t) { return num(t.max) > 0; });
                if (!tr.length) { out.alertes.push("règle sans tranche de poids"); break; }
                var idx = -1;
                for (i = 0; i < tr.length; i++) if (p <= num(tr[i].max) + EPS) { idx = i; break; }
                if (idx >= 0) {
                    unit = num(tr[idx].prix);
                    texte = "tranche " + plage(idx ? num(tr[idx - 1].max) : 0, num(tr[idx].max)) + " : " + F(unit);
                } else {
                    var der = tr[tr.length - 1], parKg = num(pa.auDelaParKg), pasA = num(pa.auDelaPas) || 1;
                    if (parKg > 0) {
                        var nA = ceilDiv(p - num(der.max), pasA);
                        unit = num(der.prix) + nA * parKg;
                        texte = "au-delà de " + kg(der.max) + " : " + F(der.prix) + " + " + nA + " × " + F(parKg) + " (par " + parPas(pasA) + " supplémentaire)";
                    } else {
                        unit = num(der.prix);
                        texte = "dernière tranche (" + plage(tr.length > 1 ? num(tr[tr.length - 2].max) : 0, num(der.max)) + ") : " + F(unit);
                        out.alertes.push("poids de " + kg(p) + " au-delà de la dernière tranche (" + kg(der.max) + ") : prix de la dernière tranche appliqué");
                    }
                }
                break;
            }
            case "INCREMENTIEL": {
                var base = num(pa.prixBase), pb = num(pa.poidsBase), inc = num(pa.increment), pas = num(pa.pas) || 1;
                if (p <= pb + EPS) { unit = base; texte = F(base) + " jusqu'à " + kg(pb); }
                else {
                    var n = ceilDiv(p - pb, pas);
                    unit = base + n * inc;
                    texte = F(base) + " jusqu'à " + kg(pb) + " + " + n + " × " + F(inc) + " (par " + parPas(pas) + " supplémentaire)";
                }
                break;
            }
            case "PALIERS": {
                var pal = filter(triees(pa.paliers, "max"), function (x) { return x && !vide(x.prixKg); });
                if (!pal.length) { out.alertes.push("règle sans palier"); break; }
                var m = 0, morceaux = [], prev = 0, t;
                if (pa.mode === "ATTEINT") {
                    t = null;
                    for (i = 0; i < pal.length; i++) {
                        var haut = vide(pal[i].max) ? Infinity : num(pal[i].max);
                        if (p <= haut + EPS) { t = pal[i]; prev = i ? num(pal[i - 1].max) : 0; break; }
                    }
                    if (!t) { t = pal[pal.length - 1]; prev = pal.length > 1 ? num(pal[pal.length - 2].max) : 0; }
                    m = p * num(t.prixKg);
                    texte = kg(p) + " × " + F(t.prixKg) + "/kg (palier atteint " + plage(prev, vide(t.max) ? Infinity : num(t.max)) + ")";
                } else {
                    for (i = 0; i < pal.length && prev < p - EPS; i++) {
                        var h = vide(pal[i].max) ? Infinity : num(pal[i].max);
                        if (i === pal.length - 1) h = Infinity;     // le dernier palier est prolongé
                        var portion = Math.min(p, h) - prev;
                        if (portion > EPS) { m += portion * num(pal[i].prixKg); morceaux.push(kg(portion) + " × " + F(pal[i].prixKg)); }
                        prev = h;
                    }
                    texte = "cumul des paliers : " + morceaux.join(" + ");
                }
                if (num(pa.priseEnCharge) > 0) { m += num(pa.priseEnCharge); texte += " + prise en charge " + F(pa.priseEnCharge); }
                unit = rnd(m);
                texte += " = " + F(unit);
                if (num(pa.minimum) > unit) { texte += " → minimum " + F(pa.minimum); unit = num(pa.minimum); }
                break;
            }
            case "AU_KG": {
                var pk = num(pa.prixKg), pasK = num(pa.pasKg), q = pasK > 0 ? r2(ceilDiv(p, pasK) * pasK) : r2(p);
                unit = rnd(q * pk);
                texte = kg(q) + " × " + F(pk) + "/kg = " + F(unit);
                if (num(pa.minimum) > unit) { texte += " → minimum " + F(pa.minimum); unit = num(pa.minimum); }
                break;
            }
            case "PIECE": {
                parUnite = false;
                unit = num(pa.prix);
                var seuil = 0;
                each(triees(pa.degressif, "des"), function (d) {
                    if (num(d.des) > 0 && nombre >= num(d.des)) { unit = num(d.prix); seuil = num(d.des); }
                });
                out.unitaire = unit; out.total = rnd(unit * nombre);
                out.texte = nombre + " pièce" + (nombre > 1 ? "s" : "") + " × " + F(unit) + (seuil ? " (tarif dès " + seuil + " pièces)" : "") +
                    (nombre > 1 ? " = " + F(out.total) : "");
                return out;
            }
            case "AD_VALOREM": {
                var taux = num(pa.taux), v = num(valeur);
                if (v <= 0) { out.texte = "aucune valeur déclarée"; return out; }
                var av = rnd(v * taux / 100);
                out.texte = pct(taux) + " × " + F(v) + " = " + F(av);
                if (num(pa.minimum) > av) { out.texte += " → minimum " + F(pa.minimum); av = num(pa.minimum); }
                out.unitaire = av; out.total = av;
                return out;
            }
            default:
                out.alertes.push("modèle de tarification inconnu");
        }
        if (parUnite) {
            out.unitaire = rnd(unit);
            out.total = rnd(unit) * nombre;
            out.texte = texte + (nombre > 1 ? " × " + nombre + " colis = " + F(out.total) : "");
        }
        return out;
    }

    /* =================================================================
       Calcul complet d'un envoi
       ================================================================= */
    function calculer(grille, envoi) {
        var res = {
            total: 0, ht: 0, tva: 0, ttc: 0, regle: null, regles: [], lignes: [], alertes: [],
            parts: { transport: 0, supplements: 0, assurance: 0, livraison: 0 },
            poidsReel: 0, poidsTaxable: 0, nbColis: 0, grille: grille || null, tvaIncluse: false, diviseur: DIVISEUR_DEFAUT
        };
        if (!grille) { res.alertes.push("Aucune grille tarifaire applicable."); return res; }

        var e = normaliserEnvoi(envoi), chaine = chaineGrilles(grille), div = diviseurDe(grille), supp = supplementsDe(grille);
        var brut = { transport: 0, supplements: 0, assurance: 0, livraison: 0 };
        res.tvaIncluse = !!grille.tvaIncluse;
        res.diviseur = div;
        function ligne(type, libelle, detail, montant) {
            res.lignes.push({ type: type, libelle: libelle, detail: detail || "", montant: montant == null ? null : rnd(montant) });
        }
        function alerte(m) { res.alertes.push(m); }

        /* Trajet */
        var trajetTxt = (TRAJETS[e.typeTrajet] || {}).label || e.typeTrajet;
        if (e.villeDep) trajetTxt += " · " + villeLabel(e.villeDep) + " → " +
            (e.typeTrajet === "REGIONAL" || e.typeTrajet === "INTERNATIONAL" ? (e.paysDest || "?") + (e.zoneInter ? " (" + zoneLabel(e.zoneInter) + ")" : "") : villeLabel(e.villeDest) || "?");
        ligne("info", "Trajet", trajetTxt, null);

        /* Colis par colis */
        each(e.colis, function (c, i) {
            var n = c.nombre, vol = poidsVolumetrique(c.L, c.l, c.H, div), tax = Math.max(c.poids, vol);
            var pref = e.colis.length > 1 ? "Colis " + (i + 1) + " : " : "";
            res.nbColis += n; res.poidsReel += c.poids * n; res.poidsTaxable += tax * n;
            var ec = {
                typeTrajet: e.typeTrajet, villeDep: e.villeDep, villeDest: e.villeDest, zoneInter: e.zoneInter,
                typeEnvoi: e.typeEnvoi || typeEnvoiDeNature(c.nature), nature: c.nature, poids: tax
            };
            ligne("info", (e.colis.length > 1 ? "Colis " + (i + 1) + " · " : "") + c.nature + (n > 1 ? " × " + n : "") + " · " + TYPES_ENVOI[ec.typeEnvoi].label,
                "Poids réel " + kg(c.poids) + (vol > 0 ? " · volumétrique " + U.fmt(c.L) + "×" + U.fmt(c.l) + "×" + U.fmt(c.H) + " / " + U.fmt(div) + " = " + kg(vol) : "") +
                " → poids taxable " + kg(tax) + (n > 1 ? " par colis" : ""), null);

            var pr = principal(chaine, ec);
            if (!pr) {
                alerte(pref + "aucune règle de la grille ne couvre ce trajet / ce type d'envoi (" + trajetTxt + " · " + TYPES_ENVOI[ec.typeEnvoi].label + " · " + kg(tax) + ").");
                return;
            }
            if (!res.regle) res.regle = pr.regle;
            res.regles.push({ regle: pr.regle, grille: pr.grille, niveau: pr.niveau });
            if (pr.regle.modele !== "PIECE" && pr.regle.modele !== "AD_VALOREM" && tax <= 0) { alerte(pref + "poids à renseigner."); return; }

            var px = prixModele(pr.regle, tax, n, c.valeur);
            ligne("base", "Règle « " + (pr.regle.libelle || MODELES[pr.regle.modele].label) + " »" + (pr.niveau > 0 ? " · grille de base " + (pr.grille.code || pr.grille.nom) : ""),
                (MODELES[pr.regle.modele] || {}).label + " : " + px.texte, px.total);
            each(px.alertes, function (a) { alerte(pref + a + "."); });
            var net = px.total;
            if (pr.remisePct) {
                var rem = rnd(px.total * pr.remisePct / 100);
                ligne("remise", (pr.remisePct > 0 ? "Remise " + pct(pr.remisePct) : "Majoration " + pct(-pr.remisePct)) + " sur la grille de base", "", -rem);
                net -= rem;
            }
            brut.transport += net;

            /* Supplément lié à la nature */
            var sn = find(supp.natures, function (s) { return s.nature === c.nature && num(s.valeur); });
            if (sn) {
                var ms = sn.mode === "FIXE" ? num(sn.valeur) * n : rnd(net * num(sn.valeur) / 100);
                ligne("supp", "Supplément « " + c.nature + " »", sn.mode === "FIXE" ? F(sn.valeur) + " par colis" + (n > 1 ? " × " + n : "") : "+" + pct(sn.valeur) + " du transport (" + F(net) + ")", ms);
                brut.supplements += ms;
            }
            /* Règles cumulables (assurance ad valorem…) */
            each(cumulables(chaine, ec), function (r) {
                if (r.modele === "AD_VALOREM" && !(c.valeur > 0)) return;
                var pc = prixModele(r, tax, n, c.valeur);
                if (!pc.total) return;
                ligne("supp", r.libelle || MODELES[r.modele].label, (MODELES[r.modele] || {}).label + " : " + pc.texte, pc.total);
                if (r.modele === "AD_VALOREM") brut.assurance += pc.total; else brut.supplements += pc.total;
            });
        });

        /* Options de l'envoi */
        if (e.express) {
            var ex = supp.express;
            if (ex && ex.actif && num(ex.valeur)) {
                var mx = ex.mode === "FIXE" ? num(ex.valeur) : rnd(brut.transport * num(ex.valeur) / 100);
                ligne("supp", "Express / urgence", ex.mode === "FIXE" ? "Forfait par envoi" : "+" + pct(ex.valeur) + " du transport (" + F(brut.transport) + ")", mx);
                brut.supplements += mx;
            } else alerte("L'option express n'est pas proposée par cette grille.");
        }
        if (e.emballage) {
            var em = supp.emballage;
            if (em && em.actif && num(em.valeur)) {
                var me = em.mode === "FIXE" ? num(em.valeur) : num(em.valeur) * res.nbColis;
                ligne("supp", "Emballage", em.mode === "FIXE" ? "Forfait par envoi" : F(em.valeur) + " par colis × " + res.nbColis, me);
                brut.supplements += me;
            } else alerte("L'emballage n'est pas tarifé dans cette grille.");
        }
        if (e.livraison === "DOMICILE") {
            if (!e.zone) alerte("Zone de livraison à préciser pour la livraison à domicile.");
            else {
                var lz = find(supp.livraison, function (z) { return z.zone === e.zone && num(z.prix) > 0; });
                var refZ = find((CX.REF && CX.REF.ZONES_LIVRAISON) || [], function (z) { return z.code === e.zone; });
                var pl = lz ? num(lz.prix) : (refZ ? refZ.prix : 0);
                ligne("supp", "Livraison à domicile · " + (refZ ? refZ.nom : e.zone), lz ? "Tarif de la grille" : "Tarif réseau (zone non tarifée dans la grille)", pl);
                brut.livraison += pl;
            }
        }

        /* Minimum de perception, arrondi */
        var st = brut.transport + brut.supplements + brut.assurance + brut.livraison;
        var mini = num(grille.minimum);
        if (st > 0 && mini > st) {
            ligne("ajust", "Minimum de perception", "Montant porté à " + F(mini), mini - st);
            brut.transport += mini - st; st = mini;
        }
        var pasA = num(grille.arrondi);
        if (st > 0 && pasA > 1) {
            var ar = arrondir(st, pasA, grille.arrondiMode);
            if (ar !== st) {
                ligne("ajust", "Arrondi " + (grille.arrondiMode === "PROCHE" ? "aux " + F(pasA) + " les plus proches" : "aux " + F(pasA) + " supérieurs"), "", ar - st);
                brut.transport += ar - st; st = ar;
            }
        }

        /* HT / TVA / TTC (parts toujours exprimées HT) */
        var taux = CX.CONFIG.TVA;
        res.total = rnd(st);
        if (grille.tvaIncluse) {
            res.ttc = res.total;
            res.ht = rnd(res.total / (1 + taux / 100));
            res.tva = res.ttc - res.ht;
            var k = 1 / (1 + taux / 100), somme = 0;
            each(["supplements", "assurance", "livraison"], function (cle) { res.parts[cle] = rnd(brut[cle] * k); somme += res.parts[cle]; });
            res.parts.transport = res.ht - somme;
        } else {
            res.ht = res.total;
            res.tva = rnd(res.ht * taux / 100);
            res.ttc = res.ht + res.tva;
            each(["transport", "supplements", "assurance", "livraison"], function (cle) { res.parts[cle] = rnd(brut[cle]); });
        }
        res.poidsReel = Math.round(res.poidsReel * 10) / 10;
        res.poidsTaxable = Math.round(res.poidsTaxable * 10) / 10;
        return res;
    }

    /* =================================================================
       Résolution de la grille d'un client
       ================================================================= */
    function estValide(g, date) {
        return !!g && g.statut === "ACTIVE" && (!g.du || g.du <= date) && (!g.au || g.au >= date);
    }
    function plusRecente(liste) {
        return liste.slice().sort(function (a, b) { return (b.du || "") > (a.du || "") ? 1 : (b.du || "") < (a.du || "") ? -1 : b.id - a.id; })[0] || null;
    }
    function statutContrat(c, date) {
        date = date || U.today();
        if (!c) return null;
        if (c.statut === "RESILIE") return "RESILIE";
        if (c.au && c.au < date) return "EXPIRE";
        if (c.du && c.du > date) return "A_VENIR";
        return "ACTIF";
    }
    function contratEnVigueur(clientId, date, contrats) {
        date = date || U.today();
        var liste = filter(contrats || store("contrats"), function (c) {
            return String(c.clientId) === String(clientId) && statutContrat(c, date) === "ACTIF";
        });
        return plusRecente(liste);
    }
    function groupesDuClient(clientId) {
        return filter(store("groupesClients"), function (g) { return contient(g.clientIds, clientId); });
    }
    function grilleStandard(date) {
        date = date || U.today();
        return plusRecente(filter(store("tarifaires"), function (g) { return g.type === "STANDARD" && estValide(g, date); }));
    }

    /* opts.groupeIds : appartenance aux groupes à simuler (formulaire client non enregistré) */
    function resoudre(clientId, dateIso, opts) {
        // TODO API : GET /commercial/tarifs/resoudre?client={clientId}&date={dateIso}
        var date = dateIso || U.today(), res = { grille: null, origine: null, contrat: null, groupe: null, libelle: "", alertes: [], date: date };
        opts = opts || {};
        var grilles = store("tarifaires");
        if (!vide(clientId)) {
            /* 1. contrat en vigueur */
            var ctr = contratEnVigueur(clientId, date);
            if (ctr) {
                res.contrat = ctr;
                var gc = grilleParId(ctr.tarifaireId);
                if (gc && estValide(gc, date)) { res.grille = gc; res.origine = "CONTRAT"; res.libelle = libOrigine(res); return res; }
                res.alertes.push(ctr.tarifaireId ? "La grille du contrat n° " + ctr.numero + " n'est pas active à cette date : la grille suivante est appliquée."
                    : "Le contrat n° " + ctr.numero + " n'a pas de grille tarifaire attachée.");
            }
            /* 2. grille affectée directement au client */
            var direct = plusRecente(filter(grilles, function (g) {
                return g.type !== "STANDARD" && estValide(g, date) && contient((g.affectation || {}).clientIds, clientId);
            }));
            if (direct) { res.grille = direct; res.origine = "CLIENT"; res.libelle = libOrigine(res); return res; }
            /* 3. grille d'un groupe du client */
            var groupes = opts.groupeIds ? filter(store("groupesClients"), function (g) { return contient(opts.groupeIds, g.id); }) : groupesDuClient(clientId);
            var cand = [];
            each(groupes, function (gr) {
                each(grilles, function (g) {
                    if (g.type !== "STANDARD" && estValide(g, date) && contient((g.affectation || {}).groupeIds, gr.id)) cand.push({ g: g, gr: gr });
                });
            });
            if (cand.length) {
                var best = plusRecente(map(cand, function (x) { return x.g; }));
                res.grille = best; res.origine = "GROUPE";
                res.groupe = find(cand, function (x) { return x.g === best; }).gr;
                if (cand.length > 1) {
                    var noms = {}; each(cand, function (x) { noms[x.g.nom] = 1; });
                    if (Object.keys(noms).length > 1) res.alertes.push("Le client appartient à plusieurs groupes tarifés : la grille la plus récente est appliquée.");
                }
                res.libelle = libOrigine(res);
                return res;
            }
        }
        /* 4. grille standard */
        var std = grilleStandard(date);
        if (std) { res.grille = std; res.origine = "STANDARD"; }
        else res.alertes.push("Aucune grille standard active à cette date.");
        res.libelle = libOrigine(res);
        return res;
    }

    /* Utilisation d'une grille (avant suppression / archivage) */
    function utilisation(grilleId) {
        var g = grilleParId(grilleId) || {}, aff = g.affectation || {};
        return {
            contrats: filter(store("contrats"), function (c) { return String(c.tarifaireId) === String(grilleId); }),
            filles: filter(store("tarifaires"), function (x) { return String(x.baseId) === String(grilleId); }),
            clients: (aff.clientIds || []).length, groupes: (aff.groupeIds || []).length
        };
    }
    function estUtilisee(grilleId) {
        var u = utilisation(grilleId);
        return u.contrats.length + u.filles.length + u.clients + u.groupes > 0;
    }

    /* Compatibilité CX.tarif : transport « standard » (colis, sans options) */
    function transportStandard(villeDep, villeDest, poidsTaxable) {
        var g = grilleStandard();
        if (!g) return null;
        var r = calculer(g, { villeDep: villeDep, villeDest: villeDest, typeEnvoi: "COLIS", nature: "Colis", poids: poidsTaxable || 1, nombre: 1 });
        return r.regle ? r.ht : null;
    }
    function livraisonStandard(codeZone) {
        var g = grilleStandard();
        if (!g) return null;
        var z = find(supplementsDe(g).livraison, function (x) { return x.zone === codeZone && num(x.prix) > 0; });
        return z ? num(z.prix) : null;
    }

    /* =================================================================
       Contrôles d'une règle / d'une grille (formulaire)
       Retourne une liste de messages
       ================================================================= */
    function verifierRegle(r) {
        var errs = [], pa = r.params || {}, i;
        var p = perimetre(r);
        if (p.poidsMin != null && p.poidsMax != null && p.poidsMax > 0 && p.poidsMin >= p.poidsMax) errs.push("bornes de poids incohérentes");
        switch (r.modele) {
            case "TRANCHES":
                if (!(pa.tranches || []).length) errs.push("au moins une tranche de poids");
                for (i = 0; i < (pa.tranches || []).length; i++) {
                    var t = pa.tranches[i];
                    if (!(num(t.max) > 0)) errs.push("tranche " + (i + 1) + " : poids maximal");
                    if (!(num(t.prix) > 0)) errs.push("tranche " + (i + 1) + " : prix");
                    if (i && num(t.max) <= num(pa.tranches[i - 1].max)) errs.push("tranche " + (i + 1) + " : le poids doit être croissant");
                }
                break;
            case "INCREMENTIEL":
                if (!(num(pa.prixBase) > 0)) errs.push("prix de base");
                if (!(num(pa.poidsBase) >= 0)) errs.push("poids inclus dans le prix de base");
                if (!(num(pa.pas) > 0)) errs.push("pas de l'incrément");
                break;
            case "PALIERS":
                if (!(pa.paliers || []).length) errs.push("au moins un palier");
                for (i = 0; i < (pa.paliers || []).length; i++) {
                    var q = pa.paliers[i], dernier = i === pa.paliers.length - 1;
                    if (!(num(q.prixKg) > 0)) errs.push("palier " + (i + 1) + " : prix au kg");
                    if (!dernier && !(num(q.max) > 0)) errs.push("palier " + (i + 1) + " : poids maximal");
                    if (i && !vide(q.max) && num(q.max) <= num(pa.paliers[i - 1].max)) errs.push("palier " + (i + 1) + " : le poids doit être croissant");
                }
                break;
            case "AU_KG":
                if (!(num(pa.prixKg) > 0)) errs.push("prix au kg");
                break;
            case "PIECE":
                if (!(num(pa.prix) > 0)) errs.push("prix à la pièce");
                for (i = 0; i < (pa.degressif || []).length; i++) {
                    if (!(num(pa.degressif[i].des) > 1) || !(num(pa.degressif[i].prix) > 0)) errs.push("dégressif " + (i + 1) + " : quantité et prix");
                }
                break;
            case "AD_VALOREM":
                if (!(num(pa.taux) > 0)) errs.push("taux ad valorem");
                break;
            default:
                errs.push("modèle de tarification");
        }
        return errs;
    }

    /* =================================================================
       Libellés
       ================================================================= */
    function zoneLabel(code) { var z = find(ZONES, function (x) { return x.code === code; }); return z ? z.label : code; }
    function libModele(r) {
        var pa = (r && r.params) || {}, n;
        switch (r && r.modele) {
            case "TRANCHES":
                var tr = triees(pa.tranches, "max");
                if (!tr.length) return "Aucune tranche";
                return tr.length + " tranche" + (tr.length > 1 ? "s" : "") + " · de " + F(tr[0].prix) + " (≤ " + kg(tr[0].max) + ") à " +
                    F(tr[tr.length - 1].prix) + " (≤ " + kg(tr[tr.length - 1].max) + ")" + (num(pa.auDelaParKg) > 0 ? " puis +" + F(pa.auDelaParKg) + "/" + parPas(num(pa.auDelaPas) || 1) : "");
            case "INCREMENTIEL":
                return F(pa.prixBase) + " jusqu'à " + kg(pa.poidsBase) + " + " + F(pa.increment) + " par " + parPas(num(pa.pas) || 1) + " suppl.";
            case "PALIERS":
                var pl = triees(pa.paliers, "max");
                n = pl.length;
                return n + " palier" + (n > 1 ? "s" : "") + (pa.mode === "ATTEINT" ? " (au palier atteint)" : " (cumulatifs)") +
                    (n ? " · " + F(pl[0].prixKg) + (n > 1 ? " → " + F(pl[n - 1].prixKg) : "") + "/kg" : "") + (num(pa.minimum) ? " · min. " + F(pa.minimum) : "");
            case "AU_KG":
                return F(pa.prixKg) + "/kg" + (num(pa.minimum) ? " · minimum " + F(pa.minimum) : "") + (num(pa.pasKg) > 0 && num(pa.pasKg) !== 1 ? " · par pas de " + kg(pa.pasKg) : "");
            case "PIECE":
                var dg = triees(pa.degressif, "des");
                return F(pa.prix) + " la pièce" + (dg.length ? " · " + map(dg, function (d) { return F(d.prix) + " dès " + d.des; }).join(", ") : "");
            case "AD_VALOREM":
                return pct(pa.taux) + " de la valeur déclarée" + (num(pa.minimum) ? " · min. " + F(pa.minimum) : "");
        }
        return "—";
    }
    function libPerimetre(r) {
        var p = perimetre(r), parts = [];
        parts.push(p.typeTrajet ? TRAJETS[p.typeTrajet].label : "Tous trajets");
        if (p.villesDep.length || p.villesDest.length) {
            parts.push((p.villesDep.length ? map(p.villesDep, villeLabel).join(", ") : "toutes villes") + (p.bidirectionnel ? " ⇄ " : " → ") +
                (p.villesDest.length ? map(p.villesDest, villeLabel).join(", ") : "toutes villes"));
        }
        if (p.zones.length) parts.push(map(p.zones, zoneLabel).join(", "));
        parts.push(p.typesEnvoi.length ? map(p.typesEnvoi, function (t) { return TYPES_ENVOI[t] ? TYPES_ENVOI[t].label : t; }).join(", ") : "tous envois");
        if (p.natures.length) parts.push(p.natures.join(", "));
        if (p.poidsMin || p.poidsMax) parts.push((p.poidsMin ? "> " + kg(p.poidsMin) : "") + (p.poidsMin && p.poidsMax ? " et " : "") + (p.poidsMax ? "≤ " + kg(p.poidsMax) : ""));
        return parts.join(" · ");
    }
    function libOrigine(res) {
        if (!res || !res.grille) return "Aucune grille applicable";
        switch (res.origine) {
            case "CONTRAT": return "Contrat n° " + res.contrat.numero + (res.contrat.au ? " · jusqu'au " + U.toFr(res.contrat.au) : "");
            case "CLIENT": return "Grille affectée au client";
            case "GROUPE": return "Groupe « " + (res.groupe ? res.groupe.nom : "?") + " »";
            default: return "Grille standard (aucun tarif spécifique)";
        }
    }
    function libValidite(g) {
        if (!g) return "";
        if (g.du && g.au) return "du " + U.toFr(g.du) + " au " + U.toFr(g.au);
        if (g.du) return "depuis le " + U.toFr(g.du);
        if (g.au) return "jusqu'au " + U.toFr(g.au);
        return "sans limite";
    }
    function badge(map2, code) {
        var s = map2[code] || { label: code || "—", color: "grey" };
        return "<span class='cx-badge cx-badge-" + s.color + "'>" + U.esc(s.label) + "</span>";
    }

    /* =================================================================
       Aide d'interface : détail du calcul en HTML (classes .cx-calc de cx.css)
       opts = { titreTotal: "Total", masquerInfos: false }
       ================================================================= */
    function detailHtml(res, opts) {
        opts = opts || {};
        if (!res) return "";
        var h = ["<ul class='cx-calc'>"];
        each(res.lignes, function (l) {
            if (opts.masquerInfos && l.type === "info") return;
            h.push("<li class='cx-calc-" + l.type + "'><span>" + U.esc(l.libelle) + (l.detail ? "<small>" + U.esc(l.detail) + "</small>" : "") + "</span>" +
                (l.montant == null ? "" : "<b>" + (l.montant < 0 ? "− " + U.money(-l.montant) : U.money(l.montant)) + "</b>") + "</li>");
        });
        if (res.regle || res.total) {
            h.push("<li class='cx-calc-total'><span>" + U.esc(opts.titreTotal || (res.tvaIncluse ? "Total TTC (TVA incluse)" : "Total HT")) + "</span><b>" + U.money(res.total) + "</b></li>");
            if (res.tvaIncluse) h.push("<li class='cx-calc-info'><span>soit HT</span><b>" + U.money(res.ht) + "</b></li>");
        }
        h.push("</ul>");
        if (res.alertes.length) {
            h.push("<div class='cx-note cx-note-warn cx-calc-alertes'><i class='fa fa-exclamation-triangle'></i><div>" +
                map(res.alertes, function (a) { return U.esc(a); }).join("<br>") + "</div></div>");
        }
        return h.join("");
    }

    /* =================================================================
       Valeurs par défaut (création)
       ================================================================= */
    function defaultParams(modele) {
        switch (modele) {
            case "TRANCHES": return { tranches: [{ max: 1, prix: 2500 }, { max: 5, prix: 4500 }, { max: 10, prix: 7000 }, { max: 20, prix: 11000 }], auDelaParKg: 500, auDelaPas: 1 };
            case "INCREMENTIEL": return { prixBase: 2500, poidsBase: 1, increment: 500, pas: 1 };
            case "PALIERS": return { paliers: [{ max: 10, prixKg: 400 }, { max: 50, prixKg: 300 }, { max: "", prixKg: 200 }], mode: "CUMULATIF", priseEnCharge: 0, minimum: 2000 };
            case "AU_KG": return { prixKg: 350, minimum: 3000, pasKg: 1 };
            case "PIECE": return { prix: 1000, degressif: [{ des: 10, prix: 800 }] };
            case "AD_VALOREM": return { taux: 1, minimum: 1000 };
        }
        return {};
    }
    function nouvelleRegle(modele) {
        modele = MODELES[modele] ? modele : "INCREMENTIEL";
        return {
            id: "r" + new Date().getTime().toString(36) + Math.floor(Math.random() * 1000),
            libelle: "", actif: true, cumulable: modele === "AD_VALOREM",
            perimetre: { typeTrajet: "", villesDep: [], villesDest: [], bidirectionnel: true, zones: [], typesEnvoi: [], natures: [], poidsMin: "", poidsMax: "" },
            modele: modele, params: defaultParams(modele)
        };
    }
    function nouvelleGrille(type) {
        return {
            code: "", nom: "", description: "", type: TYPES_GRILLE[type] ? type : "CLIENT", statut: "BROUILLON",
            du: U.today(), au: "", devise: CX.CONFIG.DEVISE, baseId: null, remiseBasePct: 0, heriterSupplements: true,
            diviseurVol: DIVISEUR_DEFAUT, minimum: 0, arrondi: 100, arrondiMode: "SUP", tvaIncluse: false,
            regles: [], supplements: supplementsVides(), affectation: { clientIds: [], groupeIds: [] }, historique: []
        };
    }

    /* Message « flash » transmis d'une page à l'autre (toast après redirection) */
    function flash(msg, type) {
        try { sessionStorage.setItem("cx_tar_flash", JSON.stringify({ msg: msg, type: type || "success" })); } catch (e) { /* stockage indisponible */ }
    }
    function showFlash() {
        try {
            var f = JSON.parse(sessionStorage.getItem("cx_tar_flash") || "null");
            sessionStorage.removeItem("cx_tar_flash");
            if (f && f.msg) U.toast(f.msg, f.type);
        } catch (e) { /* rien */ }
    }

    return {
        /* référentiels */
        TYPES_GRILLE: TYPES_GRILLE, STATUTS_GRILLE: STATUTS_GRILLE, STATUTS_CONTRAT: STATUTS_CONTRAT, ORIGINES: ORIGINES,
        TRAJETS: TRAJETS, TYPES_ENVOI: TYPES_ENVOI, MODELES: MODELES, ZONES: ZONES, NATURES_DOCUMENT: NATURES_DOCUMENT,
        DIVISEUR_DEFAUT: DIVISEUR_DEFAUT,
        /* moteur */
        resoudre: resoudre, calculer: calculer, prixModele: prixModele, correspond: correspond, score: score,
        normaliserEnvoi: normaliserEnvoi, chaineGrilles: chaineGrilles, supplementsDe: supplementsDe, diviseurDe: diviseurDe,
        poidsVolumetrique: poidsVolumetrique, arrondir: arrondir, normTrajet: normTrajet, deduireTrajet: deduireTrajet,
        zoneDuPays: zoneDuPays, typeEnvoiDeNature: typeEnvoiDeNature,
        /* données */
        grilleParId: grilleParId, grilleStandard: grilleStandard, estValide: estValide, statutContrat: statutContrat,
        contratEnVigueur: contratEnVigueur, groupesDuClient: groupesDuClient, utilisation: utilisation, estUtilisee: estUtilisee,
        transportStandard: transportStandard, livraisonStandard: livraisonStandard, verifierRegle: verifierRegle,
        /* libellés / interface */
        libModele: libModele, libPerimetre: libPerimetre, libOrigine: libOrigine, libValidite: libValidite, zoneLabel: zoneLabel,
        villeLabel: villeLabel, badge: badge, detailHtml: detailHtml,
        /* valeurs par défaut */
        defaultParams: defaultParams, nouvelleRegle: nouvelleRegle, nouvelleGrille: nouvelleGrille, supplementsVides: supplementsVides,
        clone: clone, flash: flash, showFlash: showFlash
    };
})();

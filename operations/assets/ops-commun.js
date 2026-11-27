/* =====================================================================
   ClemenTino 2.0 - Module OPÉRATIONS - fonctions communes (CX.ops)
   ---------------------------------------------------------------------
   À charger APRÈS cx-core.js, cx-data.js, cx-tarifs.js,
   cx-demo-exploitation.js et ../guichet/assets/guichet-commun.js,
   et AVANT cx-shell.js (l'agence courante choisie dans le sélecteur
   remplace celle de CX.CONFIG.USER, affichée dans l'en-tête).

     CX.ops.ETAPES, etapeBadge()       libellés / couleurs / icônes des étapes
     CX.ops.agenceCourante()           agence de l'utilisateur { id, ville, nom }
     CX.ops.selecteurAgence(cible)     sélecteur d'agence (en-tête de page)
     CX.ops.norm(e)                    expédition normalisée pour l'affichage
     CX.ops.agDest / agDep / position  agences de destination, de départ, actuelle
     CX.ops.avancer(id, etape, info)   transition d'étape (suivi[] + historique[])
     CX.ops.sla(e)                     délai cible, échéance, retard
     CX.ops.fiche(id, options)         fiche détaillée d'une LT (modale)
     CX.ops.modaleRemise(e)            remise au destinataire (pièce, signature, photo)
     CX.ops.modaleReorienter(exps)     réorientation d'une ou plusieurs LT
     CX.ops.modalePartenaire(exps)     transmission au partenaire international
     CX.ops.avis(e, canal, type)       avis d'arrivée WhatsApp / SMS
     CX.ops.scanner(input, onCode)     saisie rapide au clavier / douchette

   Collections ajoutées au store (CX.api) :
     bordereaux  { numero BRD-AAMMJJ-NNN, date, heure, agenceDepId, villeDep, agenceDep,
                   agenceDestId, villeDest, agenceDest, vehicule { type, immatriculation },
                   chauffeur { nom, tel }, scelle, expeditionIds[], statut PREPARE | PARTI |
                   ARRIVE | CLOTURE, dateDepart, dateArrivee, recus[], ecarts[], observations,
                   historique[] }
     tournees    { numero TRN-AAMMJJ-NN, date, agenceId, ville, agence, livreurId, livreurNom,
                   expeditionIds[], statut EN_COURS | CLOTUREE, resultats { idExp: {...} },
                   dateCloture, historique[] }
   Champs ajoutés à une expédition : etape, suivi[] (cx-demo-exploitation.js),
   positionAgenceId (agence où se trouve physiquement le colis), bordereau,
   bordereauId, tourneeId, livreurId, avis[], remise {…}, reorientations[],
   incidents[], notes[], partenaire { nom, awb, date }, retour { date, motif }.

   >>> INTÉGRATION SYMFONY <<<
   Toutes les transitions sont à refaire côté serveur (service
   « Exploitation ») : le JS ne fait qu'appeler les routes repérées par
   « TODO API ». Le sélecteur d'agence est réservé aux superviseurs ; pour
   un agent, l'agence vient de son affectation (CX.CONFIG.USER, Twig).
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.ops = (function () {
    var U = CX.util, G = CX.guichet;

    /* =================================================================
       Étapes du cycle d'exploitation
       ================================================================= */
    var ETAPES = {
        ENREGISTREE: { label: "Enregistrée", court: "Enregistrée", color: "grey", icon: "fa-pencil-square-o", ordre: 1, desc: "Saisie au guichet de départ" },
        GROUPEE: { label: "Groupée", court: "Groupée", color: "purple", icon: "fa-cubes", ordre: 2, desc: "Placée dans un bordereau de départ" },
        EN_TRANSIT: { label: "En transit", court: "En transit", color: "blue", icon: "fa-truck", ordre: 3, desc: "En route vers l'agence de destination" },
        ARRIVEE: { label: "Arrivée", court: "Arrivée", color: "blue", icon: "fa-sign-in", ordre: 4, desc: "Réceptionnée à l'agence (dégroupage)" },
        EN_INSTANCE: { label: "En agence", court: "En instance", color: "orange", icon: "fa-building-o", ordre: 5, desc: "Disponible au retrait en agence" },
        EN_LIVRAISON: { label: "En livraison", court: "En livraison", color: "orange", icon: "fa-motorcycle", ordre: 5, desc: "Confiée à un livreur" },
        ECHEC: { label: "Échec de livraison", court: "Échec", color: "red", icon: "fa-exclamation-triangle", ordre: 5, desc: "Tentative de livraison échouée" },
        LIVREE: { label: "Livrée", court: "Livrée", color: "green", icon: "fa-check-circle", ordre: 6, desc: "Remise au destinataire" },
        ANNULEE: { label: "Annulée", court: "Annulée", color: "red", icon: "fa-ban", ordre: 0, desc: "Expédition annulée" }
    };
    /* Transitions autorisées (contrôle d'intégrité ; le serveur refait le contrôle) */
    var TRANSITIONS = {
        ENREGISTREE: ["GROUPEE", "ARRIVEE", "EN_TRANSIT", "ANNULEE"],
        GROUPEE: ["EN_TRANSIT", "ENREGISTREE", "ARRIVEE"],
        EN_TRANSIT: ["ARRIVEE", "LIVREE"],
        ARRIVEE: ["EN_INSTANCE", "EN_LIVRAISON", "GROUPEE", "LIVREE", "EN_TRANSIT", "ARRIVEE"],
        EN_INSTANCE: ["LIVREE", "EN_LIVRAISON", "ARRIVEE"],
        EN_LIVRAISON: ["LIVREE", "ECHEC"],
        ECHEC: ["EN_LIVRAISON", "EN_INSTANCE", "ARRIVEE", "LIVREE"],
        LIVREE: [],
        ANNULEE: []
    };
    var STATUT_BORDEREAU = {
        PREPARE: { label: "En préparation", color: "purple" },
        PARTI: { label: "Parti", color: "blue" },
        ARRIVE: { label: "Pointage en cours", color: "orange" },
        CLOTURE: { label: "Clôturé", color: "green" }
    };
    var STATUT_TOURNEE = {
        EN_COURS: { label: "En cours", color: "orange" },
        CLOTUREE: { label: "Clôturée", color: "green" }
    };
    var MOTIFS_ECHEC = ["Destinataire absent", "Adresse introuvable", "Refus du destinataire", "Téléphone injoignable", "Zone inaccessible", "Autre"];
    var MOTIFS_REORIENTATION = ["Erreur de destination à la saisie", "Demande de l'expéditeur", "Demande du destinataire", "Agence plus proche du destinataire", "Retour à l'expéditeur", "Autre"];
    var TYPES_INCIDENT = {
        AVARIE: { label: "Avarie (colis endommagé)", color: "orange" },
        PERTE: { label: "Perte / colis introuvable", color: "red" },
        SPOLIATION: { label: "Spoliation (contenu manquant)", color: "red" },
        RETARD: { label: "Retard anormal", color: "orange" },
        AUTRE: { label: "Autre incident", color: "grey" }
    };
    var PIECES = ["Carte nationale d'identité", "Passeport", "Permis de conduire", "Carte de séjour", "Récépissé de CNI", "Carte professionnelle"];
    var PARTENAIRES = ["TNT", "DHL Express", "FedEx", "UPS", "Chronopost", "EMS Campost"];
    var CHAUFFEURS = [
        { nom: "MBIDA Joseph", tel: "699 11 45 78" }, { nom: "TCHATCHOUA Eric", tel: "677 52 08 31" },
        { nom: "ABOUBAKAR Moussa", tel: "655 90 12 64" }, { nom: "NGUEMA Fabrice", tel: "690 23 77 15" }
    ];
    var VEHICULES = [
        { type: "Camionnette (3,5 t)", immatriculation: "LT 452 AB" }, { type: "Fourgonnette (1,5 t)", immatriculation: "CE 218 KF" },
        { type: "Camion 10 t", immatriculation: "LT 907 HC" }, { type: "Fourgonnette (1,5 t)", immatriculation: "OU 334 DA" }
    ];

    /* Délais cibles (SLA) en jours, par type de trajet. TODO API : paramètres d'exploitation */
    var SLA = { URBAIN: 1, NATIONAL: 3, AUTRE: 5 };
    var INSTANCE_ALERTE_J = 3;   // en instance depuis plus de 3 jours : à relancer
    var INSTANCE_RETOUR_J = 15;  // au-delà : retour à l'expéditeur proposé

    function etapeBadge(code, court) {
        var s = ETAPES[code] || { label: code || "—", color: "grey" };
        return "<span class='cx-badge cx-badge-" + s.color + "'>" + U.esc(court ? s.court : s.label) + "</span>";
    }
    function badge(map, code) { return CX.REF.badge(map, code); }
    function pl(n, mot, motPl) { return n + " " + (n > 1 ? (motPl || mot + "s") : mot); }

    /* =================================================================
       Agences
       ================================================================= */
    function agenceId(ville, nom) {
        var a = $.grep(CX.REF.AGENCES, function (x) { return x.ville === ville && x.nom === nom; })[0];
        if (!a && ville) a = CX.REF.agencesDe(ville)[0];
        return a ? a.id : null;
    }
    function agence(id) { return id == null ? null : CX.REF.agence(id); }
    function agenceLib(id, court) {
        var a = agence(id);
        if (!a) return "—";
        return court ? G.titre(a.nom) : G.villeNom(a.ville) + " · " + G.titre(a.nom);
    }

    /* Agence courante : choix mémorisé du sélecteur, sinon affectation de l'utilisateur */
    var CLE_AGENCE = "ox_agence_courante";
    (function initAgence() {
        var u = CX.CONFIG.USER, id = null;
        try { id = window.localStorage.getItem(CLE_AGENCE); } catch (err) { id = null; }
        var a = id ? CX.REF.agence(id) : null;
        if (!a) a = CX.REF.agence(agenceId(u.ville, u.agence));
        if (a) { u.ville = a.ville; u.agence = a.nom; u.agenceId = a.id; }
    })();
    function agenceCourante() {
        var u = CX.CONFIG.USER;
        return { id: u.agenceId || agenceId(u.ville, u.agence), ville: u.ville, nom: u.agence };
    }
    function estMoi(id) { return id != null && String(id) === String(agenceCourante().id); }

    /* Sélecteur d'agence (en-tête de page). TODO API : réservé aux superviseurs (rôle ROLE_SUPERVISEUR) */
    function selecteurAgence(cible) {
        var cur = agenceCourante();
        var html = "<label class='ox-agence-pick' title=\"Agence dont vous traitez l'exploitation\"><i class='fa fa-map-marker'></i>" +
            "<span>Agence</span><select id='ox-agence' class='form-control input-sm'>" +
            $.map(CX.REF.VILLES, function (v) {
                var ags = CX.REF.agencesDe(v.nom);
                if (!ags.length) return null;
                return "<optgroup label='" + U.esc(G.villeNom(v.nom)) + "'>" + $.map(ags, function (a) {
                    return "<option value='" + a.id + "'" + (a.id === cur.id ? " selected" : "") + ">" + U.esc(G.villeNom(a.ville) + " · " + G.titre(a.nom)) + "</option>";
                }).join("") + "</optgroup>";
            }).join("") + "</select></label>";
        $(cible).html(html);
        $(cible).on("change", "#ox-agence", function () {
            try { window.localStorage.setItem(CLE_AGENCE, $(this).val()); } catch (err) { /* navigation privée */ }
            window.location.reload();
        });
    }
    function changerAgence(id) { try { window.localStorage.setItem(CLE_AGENCE, String(id)); } catch (err) { /* */ } }

    /* =================================================================
       Expédition : normalisation et positions
       ================================================================= */
    function agDest(e) {
        if (e.service === "REGIONALE" || e.service === "INTERNATIONALE") {
            if (!e.villeDest || e.paysDest) return null;
        }
        return agenceId(e.villeDest, e.bureauDest);
    }
    function agDep(e) { return agenceId(e.villeDep, e.bureauDep) || (e.bureau ? e.bureau.agenceId : null); }
    /* Agence où se trouve physiquement le colis (null = dans un véhicule / chez un partenaire) */
    function position(e) {
        var et = e.etape || "ENREGISTREE";
        if (et === "EN_TRANSIT") return null;
        if (e.positionAgenceId != null) return e.positionAgenceId;
        if (et === "ENREGISTREE" || et === "GROUPEE") return agDep(e);
        return agDest(e);
    }
    function international(e) { return e.service === "REGIONALE" || e.service === "INTERNATIONALE" || !!e.paysDest; }
    /* Colis présent dans l'agence mais dont la destination finale est ailleurs */
    function enTransitIci(e) {
        var p = position(e);
        return estMoi(p) && !international(e) && !estMoi(agDest(e)) && (e.etape === "ARRIVEE");
    }
    function etapeDeduite(e) {
        if (e.etape) return e.etape;
        if (e.statut === "LIVREE") return "LIVREE";
        if (e.statut === "ANNULEE") return "ANNULEE";
        return "ENREGISTREE";
    }
    function norm(e0) {
        var e = G.normaliser(e0);
        e.etape = etapeDeduite(e);
        e.suivi = e.suivi || [];
        e.agDestId = agDest(e);
        e.agDepId = agDep(e);
        e.positionId = position(e);
        e.sla = sla(e);
        return e;
    }
    function dernierEvenement(e, etape) {
        var s = e.suivi || [], r = null;
        for (var i = 0; i < s.length; i++) if (!etape || s[i].etape === etape) r = s[i];
        return r;
    }
    function destinationLib(e) {
        if (international(e)) return (e.villeEtranger ? e.villeEtranger + ", " : "") + (e.paysDest || "Étranger");
        return G.villeNom(e.villeDest) + (e.bureauDest ? " · " + G.titre(e.bureauDest) : "");
    }

    /* =================================================================
       SLA : délai cible selon le trajet
       ================================================================= */
    function typeTrajet(e) {
        if (international(e)) return "AUTRE";
        if (e.villeDep && e.villeDep === e.villeDest) return "URBAIN";
        return "NATIONAL";
    }
    function sla(e) {
        var t = typeTrajet(e), cible = SLA[t], echeance = U.addDays(e.dateExp, cible);
        var fini = e.etape === "LIVREE" || e.etape === "ANNULEE" || e.statut === "LIVREE" || e.statut === "ANNULEE";
        var ref = fini ? (e.dateLivraison || U.today()) : U.today();
        var ecart = U.daysBetween(echeance, ref);
        return {
            type: t, cible: cible, echeance: echeance, fini: fini,
            retard: !fini && ecart > 0, joursRetard: ecart > 0 ? ecart : 0,
            horsDelai: fini && e.etape === "LIVREE" && ecart > 0,
            age: U.daysBetween(e.dateExp, U.today())
        };
    }
    function slaBadge(e) {
        var s = e.sla || sla(e);
        if (s.retard) return "<span class='cx-badge cx-badge-red cx-no-dot' title='Délai cible : " + pl(s.cible, "jour") + " (échéance " + U.toFr(s.echeance) + ")'><i class='fa fa-clock-o'></i> +" + pl(s.joursRetard, "j", "j") + "</span>";
        return "";
    }

    /* =================================================================
       Transitions
       ================================================================= */
    function majExp(id, fn) {
        // TODO API : les transitions sont des routes dédiées (voir avancer) ; ici lecture + écriture du store simulé
        return CX.api.get("expeditions", id).then(function (e) {
            var r = fn(e);
            if (r === false) return $.Deferred().reject("Opération refusée").promise();
            if (typeof r === "string") return $.Deferred().reject(r).promise();
            return CX.api.save("expeditions", e);
        });
    }
    function journal(e, action, date) {
        e.historique = e.historique || [];
        e.historique.unshift({ date: date || U.now(), user: CX.CONFIG.USER.nom, action: action });
    }
    /* Applique une étape à l'objet brut (sans enregistrer). Retourne un message d'erreur ou "" */
    function appliquerEtape(e, etape, info) {
        info = info || {};
        var avant = etapeDeduite(e);
        if (!info.forcer && $.inArray(etape, TRANSITIONS[avant] || []) < 0) {
            return "Transition impossible : " + (ETAPES[avant] || {}).label + " → " + (ETAPES[etape] || {}).label + " (" + (e.nRt || e.id) + ")";
        }
        var A = info.agence || agenceCourante(), d = info.date || U.now();
        e.etape = etape;
        e.suivi = e.suivi || [];
        e.suivi.push({ date: d, etape: etape, lieu: A.ville, agence: A.nom, user: info.user || CX.CONFIG.USER.nom, note: info.note || "" });
        journal(e, "Étape « " + ETAPES[etape].label + " »" + (info.note ? " : " + info.note : ""), d);
        if (etape === "LIVREE") {
            e.statut = "LIVREE";
            e.dateLivraison = d.substr(0, 10);
            e.preuveLivraison = info.preuve !== false;   // remise signée = preuve de livraison (rend l'expédition facturable)
        } else if (etape === "ANNULEE") {
            e.statut = "ANNULEE";
        } else if (e.statut !== "ANNULEE") {
            e.statut = "EN_TRANSIT";
        }
        if (etape === "EN_TRANSIT") e.positionAgenceId = null;
        if (info.hasOwnProperty("position")) e.positionAgenceId = info.position;
        if (info.patch) $.extend(e, info.patch);
        return "";
    }
    /* Transition d'une expédition.
       info : { note, agence {id,ville,nom}, position (agence physique), preuve, patch {}, forcer }
       TODO API : POST /exploitation/expeditions/{id}/etape  { etape, note, agenceId, ... }
       (une route par opération métier : groupage, depart, reception, mise-en-instance, remise, livraison) */
    function avancer(id, etape, info) {
        return majExp(id && id.id ? id.id : id, function (e) { return appliquerEtape(e, etape, info) || true; });
    }
    /* Version en lot : infoFn(e) peut renvoyer une info propre à chaque colis */
    function avancerLot(ids, etape, infoFn) {
        var d = $.Deferred(), res = [], err = [];
        var i = 0;
        function suivant() {
            if (i >= ids.length) { d.resolve(res, err); return; }
            var id = ids[i++];
            CX.api.get("expeditions", id).done(function (brut) {
                var info = typeof infoFn === "function" ? infoFn(brut) : infoFn;
                avancer(id, etape, info).done(function (e) { res.push(e); }).fail(function (m) { err.push(m); }).always(suivant);
            }).fail(function (m) { err.push(m); suivant(); });
        }
        suivant();
        return d.promise();
    }

    /* =================================================================
       Numérotation (TODO API : attribuée par le serveur)
       ================================================================= */
    function aammjj(iso) { return iso.substr(2, 2) + iso.substr(5, 2) + iso.substr(8, 2); }
    function prochainNumero(coll, prefixe, iso, chiffres) {
        var p = prefixe + "-" + aammjj(iso || U.today()) + "-", max = 0;
        $.each(CX.api.listSync(coll), function (_, b) {
            if (String(b.numero || "").indexOf(p) === 0) max = Math.max(max, parseInt(b.numero.substr(p.length), 10) || 0);
        });
        return p + ("000" + (max + 1)).slice(-(chiffres || 3));
    }
    function numeroBordereau(iso) { return prochainNumero("bordereaux", "BRD", iso, 3); }
    function numeroTournee(iso) { return prochainNumero("tournees", "TRN", iso, 2); }

    /* =================================================================
       Données de démonstration : bordereaux et tournées reconstitués à
       partir du suivi généré par cx-demo-exploitation.js (une seule fois).
       ================================================================= */
    function assurerDemo() {
        var deja = false;
        CX.api.list("meta").done(function (m) { deja = $.grep(m, function (x) { return x.cle === "demoOperations"; }).length > 0; });
        if (deja) return;
        var exps = CX.api.listSync("expeditions"), today = U.today(), limite = U.addDays(today, -12);
        var groupes = {}, cles = [];
        $.each(exps, function (_, e) {
            var g = null;
            $.each(e.suivi || [], function (_, s) { if (s.etape === "GROUPEE") g = s; });
            if (!g || g.date.substr(0, 10) < limite || e.bordereau) return;
            var dep = agDep(e), dst = agDest(e);
            if (!dep || !dst) return;
            var k = g.date.substr(0, 10) + "|" + dep + "|" + dst;
            if (!groupes[k]) { groupes[k] = { date: g.date.substr(0, 10), dep: dep, dst: dst, exps: [] }; cles.push(k); }
            groupes[k].exps.push(e);
        });
        cles.sort();
        var n = 0;
        $.each(cles, function (_, k) {
            var g = groupes[k], aD = agence(g.dep), aA = agence(g.dst);
            var etapes = $.map(g.exps, function (e) { return e.etape; });
            var statut = $.inArray("GROUPEE", etapes) >= 0 ? "PREPARE" : $.inArray("EN_TRANSIT", etapes) >= 0 ? "PARTI" : "CLOTURE";
            var v = VEHICULES[n % VEHICULES.length], c = CHAUFFEURS[n % CHAUFFEURS.length]; n++;
            var b = {
                numero: numeroBordereau(g.date), date: g.date, heure: "17:30",
                agenceDepId: aD.id, villeDep: aD.ville, agenceDep: aD.nom, agenceDestId: aA.id, villeDest: aA.ville, agenceDest: aA.nom,
                vehicule: { type: v.type, immatriculation: v.immatriculation }, chauffeur: { nom: c.nom, tel: c.tel },
                scelle: "SC-" + ("00000" + (41000 + n * 37)).slice(-6), expeditionIds: $.map(g.exps, function (e) { return e.id; }),
                statut: statut, dateDepart: statut !== "PREPARE" ? U.addDays(g.date, 1) + " 06:15" : null,
                dateArrivee: statut === "CLOTURE" ? U.addDays(g.date, 1) + " 15:40" : null, dateCloture: statut === "CLOTURE" ? U.addDays(g.date, 1) + " 16:05" : null,
                recus: statut === "CLOTURE" ? $.map(g.exps, function (e) { return e.id; }) : [], ecarts: [], observations: "",
                creePar: "Chef d'agence", dateCreation: g.date,
                historique: [{ date: g.date + " 17:30", user: "Chef d'agence", action: "Bordereau constitué (groupage du soir)" }]
            };
            CX.api.save("bordereaux", b).done(function (bb) {
                CX.api.patchMany("expeditions", bb.expeditionIds, { bordereau: bb.numero, bordereauId: bb.id });
            });
        });
        /* Tournées en cours : colis EN_LIVRAISON regroupés par jour et par livreur */
        var tg = {}, tk = [];
        $.each(CX.api.listSync("expeditions"), function (_, e) {
            if (e.etape !== "EN_LIVRAISON" || e.tourneeId) return;
            var s = dernierEvenement(e, "EN_LIVRAISON"), ag = agDest(e);
            if (!s || !ag) return;
            var k = s.date.substr(0, 10) + "|" + ag + "|" + (e.livreurId || 0);
            if (!tg[k]) { tg[k] = { date: s.date.substr(0, 10), ag: ag, livreurId: e.livreurId || null, ids: [] }; tk.push(k); }
            tg[k].ids.push(e.id);
        });
        tk.sort();
        var livreurs = CX.api.listSync("livreurs");
        $.each(tk, function (_, k) {
            var t = tg[k], a = agence(t.ag), l = $.grep(livreurs, function (x) { return x.id == t.livreurId; })[0];
            CX.api.save("tournees", {
                numero: numeroTournee(t.date), date: t.date, heure: "08:30", agenceId: a.id, ville: a.ville, agence: a.nom,
                livreurId: l ? l.id : null, livreurNom: l ? l.nom : "Coursier externe", vehicule: l ? l.vehicule : "",
                expeditionIds: t.ids, statut: "EN_COURS", resultats: {}, creePar: "Dispatch", dateCreation: t.date,
                historique: [{ date: t.date + " 08:30", user: "Dispatch", action: "Tournée constituée" }]
            }).done(function (tt) { CX.api.patchMany("expeditions", tt.expeditionIds, { tourneeId: tt.id }); });
        });
        CX.api.save("meta", { cle: "demoOperations", version: 1, date: U.now(), numero: "META-OPS-1" });
    }

    /* =================================================================
       Avis d'arrivée (WhatsApp / SMS)
       ================================================================= */
    function messageAvis(e, type) {
        var A = agence(position(e)) || agenceCourante();
        var nom = (e.destinataireInfo && e.destinataireInfo.nom) || e.destinataire || "";
        return (type === "RELANCE" ? "RAPPEL - " : "") + "Bonjour " + nom + ", votre colis N° " + e.nRt +
            " (expéditeur : " + ((e.expediteurInfo && e.expediteurInfo.nom) || e.expediteur || "") + ") est disponible à notre agence " +
            G.villeNom(A.ville) + " · " + G.titre(A.nom) + ". Présentez ce numéro et une pièce d'identité au retrait. " +
            (CX.CONFIG.SOCIETE.nom || "") + " - " + (CX.CONFIG.SOCIETE.tel || "");
    }
    /* canal : WHATSAPP | SMS ; type : AVIS | RELANCE. Ouvre l'application et trace l'envoi.
       TODO API : POST /exploitation/expeditions/{id}/avis  { canal, type } (envoi par la passerelle SMS / WhatsApp Business) */
    function avis(e, canal, type) {
        var info = e.destinataireInfo || {}, num = G.tel(canal === "WHATSAPP" ? (info.whatsapp || info.tel || e.telDestinataire) : (info.tel || e.telDestinataire));
        if (num.length !== 9) { U.toast("Numéro du destinataire invalide : corrigez-le depuis la fiche de la LT.", "warning"); return $.Deferred().reject().promise(); }
        var texte = messageAvis(e, type);
        var url = canal === "WHATSAPP" ? "https://wa.me/237" + num + "?text=" + encodeURIComponent(texte) : "sms:+237" + num + "?body=" + encodeURIComponent(texte);
        try { window.open(url, "_blank"); } catch (err) { /* bloqueur de fenêtres */ }
        return majExp(e.id, function (x) {
            x.avis = x.avis || [];
            x.avis.push({ date: U.now(), canal: canal, type: type || "AVIS", user: CX.CONFIG.USER.nom, numero: num });
            journal(x, (type === "RELANCE" ? "Relance" : "Avis d'arrivée") + " envoyé par " + (canal === "WHATSAPP" ? "WhatsApp" : "SMS") + " au " + G.telFmt(num));
            return true;
        });
    }

    /* =================================================================
       Petites fabriques d'interface
       ================================================================= */
    function modale(id, titre, icone, corps, pied, taille) {
        $("#" + id).remove();
        return $("<div class='modal fade ox-modal' id='" + id + "' tabindex='-1' role='dialog' aria-labelledby='" + id + "-t'><div class='modal-dialog" + (taille ? " " + taille : "") + "' role='document'><div class='modal-content'>" +
            "<div class='modal-header'><button type='button' class='close' data-dismiss='modal' aria-label='Fermer'>&times;</button>" +
            "<h4 class='modal-title' id='" + id + "-t'><i class='fa " + icone + "'></i>" + titre + "</h4></div>" +
            "<div class='modal-body'>" + corps + "</div>" +
            "<div class='modal-footer'>" + pied + "</div></div></div></div>").appendTo("body");
    }
    function champ(id, label, input, req, aide) {
        return "<div class='cx-field'><label class='cx-label" + (req ? " req" : "") + "' for='" + id + "'>" + label + "</label>" + input +
            (aide ? "<span class='cx-help'>" + aide + "</span>" : "") + "</div>";
    }
    function options(liste, sel) {
        return $.map(liste, function (o) {
            var v = typeof o === "object" ? o.v : o, l = typeof o === "object" ? o.l : o;
            return "<option value='" + U.esc(v) + "'" + (String(v) === String(sel) ? " selected" : "") + ">" + U.esc(l) + "</option>";
        }).join("");
    }
    function erreurChamp($m, sel, msg) {
        var $f = $m.find(sel).closest(".cx-field");
        $f.addClass("has-error").find(".cx-error-text").remove();
        $f.append("<span class='cx-help cx-error-text'>" + U.esc(msg) + "</span>");
        $m.find(sel).focus();
    }
    function effacerErreurs($m) { $m.find(".cx-field.has-error").removeClass("has-error").find(".cx-error-text").remove(); }
    function optionsAgences(sel) {
        return $.map(CX.REF.VILLES, function (v) {
            var ags = CX.REF.agencesDe(v.nom);
            if (!ags.length) return null;
            return "<optgroup label='" + U.esc(G.villeNom(v.nom)) + "'>" + $.map(ags, function (a) {
                return "<option value='" + a.id + "'" + (String(a.id) === String(sel) ? " selected" : "") + ">" + U.esc(G.villeNom(a.ville) + " · " + G.titre(a.nom)) + "</option>";
            }).join("") + "</optgroup>";
        }).join("");
    }

    /* Pavé de signature sur canevas (souris + tactile). Retourne { vide(), dataUrl(), effacer() } */
    function signature(canvas) {
        var ctx = canvas.getContext("2d"), dessine = false, trace = false;
        function taille() {
            var r = canvas.getBoundingClientRect();
            if (r.width) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); }
            ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
        }
        function pt(ev) {
            var r = canvas.getBoundingClientRect(), t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
            return { x: (t.clientX - r.left) * (canvas.width / (r.width || 1)), y: (t.clientY - r.top) * (canvas.height / (r.height || 1)) };
        }
        function debut(ev) { ev.preventDefault(); dessine = true; var p = pt(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
        function bouge(ev) { if (!dessine) return; ev.preventDefault(); var p = pt(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); trace = true; $(canvas).trigger("ox:signe"); }
        function fin() { dessine = false; }
        canvas.addEventListener("mousedown", debut); canvas.addEventListener("mousemove", bouge); window.addEventListener("mouseup", fin);
        canvas.addEventListener("touchstart", debut, { passive: false }); canvas.addEventListener("touchmove", bouge, { passive: false }); canvas.addEventListener("touchend", fin);
        return {
            taille: taille,
            vide: function () { return !trace; },
            effacer: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); trace = false; },
            dataUrl: function () { return trace ? canvas.toDataURL("image/png") : null; }
        };
    }
    /* Photo facultative : réduite (600 px max, JPEG) avant stockage */
    function lirePhoto(file) {
        var d = $.Deferred();
        if (!file) return d.resolve(null).promise();
        var fr = new FileReader();
        fr.onload = function () {
            var img = new Image();
            img.onload = function () {
                var k = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
                d.resolve(c.toDataURL("image/jpeg", 0.72));
            };
            img.onerror = function () { d.resolve(null); };
            img.src = fr.result;
        };
        fr.onerror = function () { d.resolve(null); };
        fr.readAsDataURL(file);
        return d.promise();
    }

    /* =================================================================
       Remise au destinataire (retrait en agence ou livraison) -> LIVREE
       ================================================================= */
    function modaleRemise(e0, opts) {
        opts = opts || {};
        var e = e0.destinataireInfo ? e0 : norm(e0), dfd = $.Deferred();
        var nomDefaut = e.retour ? e.expediteurInfo.nom : e.destinataireInfo.nom;
        var telDefaut = G.telFmt(e.retour ? e.expediteurInfo.tel : e.destinataireInfo.tel);
        var corps =
            "<div class='ox-remise-head'><div><span class='cx-mono cx-strong'>" + U.esc(e.nRt) + "</span> " + etapeBadge(e.etape) +
            "<div class='cx-cell-sub'>" + U.esc(e.nbColis || 1) + " colis · " + U.esc(G.kg(e.poids)) + " · " + U.esc(e.contenu || "") + "</div></div>" +
            "<div class='ox-remise-dest'><small>" + (e.retour ? "Retour à l'expéditeur" : "Destinataire prévu") + "</small><b>" + U.esc(nomDefaut) + "</b><span>" + U.esc(G.telAff(e.retour ? e.expediteurInfo.tel : e.destinataireInfo.tel)) + "</span></div></div>" +
            "<div class='ox-grid-2'>" +
            champ("rm-qui", "Personne qui retire", "<select class='form-control' id='rm-qui'><option value='TITULAIRE'>" + (e.retour ? "L'expéditeur" : "Le destinataire") + " lui-même</option><option value='MANDATAIRE'>Un mandataire (procuration)</option></select>", true) +
            champ("rm-nom", "Nom et prénom", "<input type='text' class='form-control' id='rm-nom' maxlength='80' value='" + U.esc(nomDefaut) + "'>", true) +
            champ("rm-piece", "Pièce d'identité", "<select class='form-control' id='rm-piece'>" + options(PIECES) + "</select>", true) +
            champ("rm-numpiece", "N° de la pièce", "<input type='text' class='form-control cx-mono' id='rm-numpiece' maxlength='30' autocomplete='off'>", true) +
            champ("rm-tel", "Téléphone", "<div class='input-group gx-tel'><span class='input-group-addon'>+237</span><input type='tel' class='form-control' id='rm-tel' maxlength='14' value='" + U.esc(telDefaut) + "'></div>", true) +
            champ("rm-photo", "Photo <span class='cx-opt'>(facultative : pièce ou personne)</span>", "<input type='file' class='form-control' id='rm-photo' accept='image/*' capture='environment'>") +
            "</div>" +
            "<div class='cx-field'><label class='cx-label req'>Signature de la personne qui retire</label>" +
            "<div class='ox-sign'><canvas id='rm-sign' width='600' height='160' aria-label='Zone de signature'></canvas>" +
            "<span class='ox-sign-hint' id='rm-sign-hint'><i class='fa fa-pencil'></i> Signez ici (souris, stylet ou doigt)</span>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-xs ox-sign-clear' id='rm-sign-clear'><i class='fa fa-eraser'></i> Effacer</button></div></div>" +
            champ("rm-obs", "Observation <span class='cx-opt'>(état du colis, réserves)</span>", "<input type='text' class='form-control' id='rm-obs' maxlength='200'>") +
            (e.factureId ? "" : (e.typeClient === "COMPTE" ? "<div class='cx-note cx-note-info'><i class='fa fa-info-circle'></i><div>Client en compte : la remise signée vaut <b>preuve de livraison</b> ; l'expédition devient facturable.</div></div>" : "")) +
            (e.paiement && e.paiement.statut !== "PAYE" && e.typeClient !== "COMPTE" ? "<div class='cx-note cx-note-warn'><i class='fa fa-money'></i><div>Port dû : encaisser <b>" + U.money(e.montants.total) + "</b> avant la remise.</div></div>" : "");
        var $m = modale("ox-remise", "Remise au destinataire", "fa-handshake-o", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button>" +
            "<button type='button' class='cx-btn cx-btn-success' id='rm-ok'><i class='fa fa-check'></i> Confirmer la remise</button>");
        var pad = signature($m.find("#rm-sign")[0]), fait = null;
        $m.on("shown.bs.modal", function () { pad.taille(); $("#rm-numpiece").focus(); });
        $m.on("ox:signe", "#rm-sign", function () { $("#rm-sign-hint").hide(); });
        $m.on("click", "#rm-sign-clear", function () { pad.effacer(); $("#rm-sign-hint").show(); });
        $m.on("change", "#rm-qui", function () {
            if ($(this).val() === "MANDATAIRE") $("#rm-nom").val("").focus(); else $("#rm-nom").val(nomDefaut);
        });
        $m.on("click", "#rm-ok", function () {
            effacerErreurs($m);
            var nom = $.trim($("#rm-nom").val()), num = $.trim($("#rm-numpiece").val()), tel = G.tel($("#rm-tel").val());
            if (nom.length < 3) return erreurChamp($m, "#rm-nom", "Indiquez le nom de la personne qui retire.");
            if (num.length < 4) return erreurChamp($m, "#rm-numpiece", "N° de pièce obligatoire.");
            if (tel.length !== 9) return erreurChamp($m, "#rm-tel", "Numéro à 9 chiffres.");
            if (pad.vide()) { $(".ox-sign").addClass("ox-sign-err"); U.toast("La signature est obligatoire.", "warning"); return; }
            var $b = $(this); U.busy($b, true);
            var sig = pad.dataUrl();
            lirePhoto(($("#rm-photo")[0].files || [])[0]).done(function (photo) {
                var remise = {
                    date: U.now(), user: CX.CONFIG.USER.nom, agenceId: agenceCourante().id, qui: $("#rm-qui").val(), nom: nom,
                    piece: $("#rm-piece").val(), numeroPiece: num, tel: tel, signature: sig, photo: photo,
                    observation: $.trim($("#rm-obs").val()), mode: opts.mode || "AGENCE", tourneeId: opts.tourneeId || null
                };
                // TODO API : POST /exploitation/expeditions/{id}/remise  (multipart : signature PNG, photo JPEG, pièce d'identité)
                avancer(e.id, "LIVREE", {
                    note: "Remis à " + nom + (remise.qui === "MANDATAIRE" ? " (mandataire)" : "") + " · " + remise.piece + " n° " + num,
                    preuve: true, patch: { remise: remise }
                }).done(function (maj) { fait = maj; $m.modal("hide"); })
                    .fail(function (msg) { U.busy($b, false); U.toast(U.esc(msg || "La remise a échoué."), "error"); });
            });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* =================================================================
       Réorientation d'une ou plusieurs LT (changement de destination)
       ================================================================= */
    function reorienterBrut(e, A, mode, motif, precision) {
        var et = etapeDeduite(e);
        if (et === "LIVREE" || et === "ANNULEE") return "LT " + e.nRt + " : déjà " + ETAPES[et].label.toLowerCase();
        if (et === "EN_LIVRAISON") return "LT " + e.nRt + " : en tournée, clôturez d'abord la tournée";
        var avant = G.villeNom(e.villeDest) + " · " + G.titre(e.bureauDest || "");
        var ici = position(e);
        e.reorientations = e.reorientations || [];
        e.reorientations.push({ date: U.now(), user: CX.CONFIG.USER.nom, agenceId: agenceCourante().id, de: { villeDest: e.villeDest, bureauDest: e.bureauDest },
            vers: { villeDest: A.ville, bureauDest: A.nom }, motif: motif, precision: precision || "" });
        e.villeDest = A.ville; e.bureauDest = A.nom;
        if (e.service === "URBAINE" && e.villeDep !== A.ville) e.service = "NATIONALE";
        if (e.service === "NATIONALE" && e.villeDep === A.ville) e.service = "URBAINE";
        e.typeTrajet = e.villeDep === A.ville ? "URBAIN" : "NATIONAL";
        if (mode) e.livraison = $.extend({}, e.livraison || {}, { mode: mode });
        if (motif === "Retour à l'expéditeur") e.retour = { date: U.now(), motif: precision || motif, user: CX.CONFIG.USER.nom };
        var note = "Réorientée de " + avant + " vers " + G.villeNom(A.ville) + " · " + G.titre(A.nom) + " (" + motif + (precision ? " - " + precision : "") + ")";
        /* colis présent dans une agence qui n'est plus sa destination : il repart (étape Arrivée, à regrouper) */
        if ((et === "EN_INSTANCE" || et === "ECHEC" || et === "ARRIVEE") && String(ici) !== String(A.id)) {
            return appliquerEtape(e, "ARRIVEE", { note: note + " - à réexpédier", position: ici, forcer: true });
        }
        /* colis déjà dans l'agence devenue sa destination : mis en instance / à livrer */
        if (et === "ARRIVEE" && String(ici) === String(A.id) && (e.livraison || {}).mode !== "DOMICILE") {
            return appliquerEtape(e, "EN_INSTANCE", { note: note, position: ici });
        }
        e.suivi = e.suivi || [];
        var C = agenceCourante();
        e.suivi.push({ date: U.now(), etape: et, lieu: C.ville, agence: C.nom, user: CX.CONFIG.USER.nom, note: note });
        journal(e, note);
        return "";
    }
    function modaleReorienter(liste, opts) {
        opts = opts || {};
        var dfd = $.Deferred(), exps = $.map(liste, function (x) { return x.destinataireInfo ? x : norm(x); });
        var bloquees = $.grep(exps, function (e) { return e.etape === "LIVREE" || e.etape === "ANNULEE" || e.etape === "EN_LIVRAISON"; });
        var e1 = exps[0];
        var corps =
            "<p class='cx-muted' style='margin-top:0'>" + (exps.length > 1 ? pl(exps.length, "lettre de transport") + " sélectionnée" + (exps.length > 1 ? "s" : "") + " : " : "Lettre de transport ") +
            $.map(exps.slice(0, 8), function (e) { return "<span class='cx-tag cx-mono'>" + U.esc(e.nRt) + "</span>"; }).join(" ") + (exps.length > 8 ? " …" : "") + "</p>" +
            (bloquees.length ? "<div class='cx-note cx-note-warn'><i class='fa fa-exclamation-triangle'></i><div>" + pl(bloquees.length, "LT ne sera pas réorientée", "LT ne seront pas réorientées") + " (livrée, annulée ou en tournée).</div></div>" : "") +
            "<div class='ox-grid-2'>" +
            champ("ro-agence", "Nouvelle agence de destination", "<select class='form-control' id='ro-agence'>" + optionsAgences(opts.agenceId || (exps.length === 1 ? e1.agDestId : "")) + "</select>", true) +
            champ("ro-mode", "Mode de remise", "<select class='form-control' id='ro-mode'><option value=''>Inchangé</option><option value='BUREAU'>Retrait en agence</option><option value='DOMICILE'>Livraison à domicile</option></select>") +
            champ("ro-motif", "Motif", "<select class='form-control' id='ro-motif'>" + options(MOTIFS_REORIENTATION, opts.motif || "") + "</select>", true) +
            champ("ro-precision", "Précision", "<input type='text' class='form-control' id='ro-precision' maxlength='160' placeholder='Ex. : demande du client au téléphone'>") +
            "</div><p class='cx-help' style='margin:0'><i class='fa fa-info-circle'></i> La réorientation est tracée dans le suivi de chaque LT (ancienne et nouvelle destination, motif, agent). " +
            "Un colis présent dans votre agence repart vers sa nouvelle destination via le groupage.</p>";
        var $m = modale("ox-reorienter", "Réorienter " + (exps.length > 1 ? "les LT" : "la LT"), "fa-random", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='ro-ok'><i class='fa fa-random'></i> Réorienter</button>");
        var fait = null;
        $m.on("click", "#ro-ok", function () {
            effacerErreurs($m);
            var A = agence($("#ro-agence").val()), motif = $("#ro-motif").val(), pr = $.trim($("#ro-precision").val()), mode = $("#ro-mode").val();
            if (!A) return erreurChamp($m, "#ro-agence", "Choisissez l'agence de destination.");
            if (motif === "Autre" && !pr) return erreurChamp($m, "#ro-precision", "Précisez le motif.");
            var cibles = $.grep(exps, function (e) { return $.inArray(e, bloquees) < 0; });
            if (!cibles.length) { U.toast("Aucune LT réorientable dans la sélection.", "warning"); return; }
            var $b = $(this); U.busy($b, true);
            var ok = [], ko = [], i = 0;
            // TODO API : POST /exploitation/expeditions/reorienter  { ids[], agenceId, mode, motif, precision }
            (function suivant() {
                if (i >= cibles.length) {
                    fait = { ok: ok, ko: ko };
                    if (ko.length) U.toast(U.esc(ko.join(" · ")), "warning");
                    $m.modal("hide");
                    return;
                }
                var c = cibles[i++];
                majExp(c.id, function (e) { var r = reorienterBrut(e, A, mode, motif, pr); return r || true; })
                    .done(function (x) { ok.push(x); }).fail(function (msg) { ko.push(msg); }).always(suivant);
            })();
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait && fait.ok.length) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* =================================================================
       Transmission au partenaire international (TNT…)
       ================================================================= */
    function modalePartenaire(liste) {
        var dfd = $.Deferred(), exps = $.map(liste, function (x) { return x.destinataireInfo ? x : norm(x); });
        var corps = "<p class='cx-muted' style='margin-top:0'>" + $.map(exps, function (e) { return "<span class='cx-tag cx-mono'>" + U.esc(e.nRt) + "</span>"; }).join(" ") + "</p>" +
            "<div class='ox-grid-2'>" + champ("pa-nom", "Partenaire", "<select class='form-control' id='pa-nom'>" + options(PARTENAIRES) + "</select>", true) +
            champ("pa-awb", "N° de lettre de transport partenaire (AWB)", "<input type='text' class='form-control cx-mono' id='pa-awb' maxlength='30'>", true, exps.length > 1 ? "Un même AWB (envoi groupé) ; le n° de chaque colis est suffixé." : "") +
            "</div>" + champ("pa-note", "Observation", "<input type='text' class='form-control' id='pa-note' maxlength='160'>");
        var $m = modale("ox-partenaire", "Transmettre au partenaire international", "fa-plane", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='pa-ok'><i class='fa fa-plane'></i> Transmettre</button>");
        var fait = null;
        $m.on("click", "#pa-ok", function () {
            effacerErreurs($m);
            var nom = $("#pa-nom").val(), awb = $.trim($("#pa-awb").val());
            if (awb.length < 4) return erreurChamp($m, "#pa-awb", "AWB obligatoire.");
            U.busy($(this), true);
            // TODO API : POST /exploitation/expeditions/partenaire  { ids[], partenaire, awb, note }
            avancerLot($.map(exps, function (e) { return e.id; }), "EN_TRANSIT", function (e) {
                return { note: "Remise au partenaire " + nom + " · AWB " + awb + ($("#pa-note").val() ? " · " + $("#pa-note").val() : ""),
                    patch: { partenaire: { nom: nom, awb: awb + (exps.length > 1 ? "-" + e.id : ""), date: U.now(), user: CX.CONFIG.USER.nom } } };
            }).done(function (ok, ko) { fait = ok; if (ko.length) U.toast(U.esc(ko.join(" · ")), "warning"); $m.modal("hide"); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait && fait.length) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* =================================================================
       Saisie rapide d'un n° de LT (douchette = clavier + Entrée)
       ================================================================= */
    function chercherLt(code, exps) {
        var c = $.trim(String(code || "")).toUpperCase().replace(/\s+/g, "");
        if (!c) return null;
        exps = exps || CX.api.listSync("expeditions");
        var r = $.grep(exps, function (e) { return String(e.nRt || "").toUpperCase() === c; })[0];
        if (!r) r = $.grep(exps, function (e) { return e.nRtMan && String(e.nRtMan).toUpperCase() === c; })[0];
        if (!r && /^\d{3,5}$/.test(c)) r = $.grep(exps, function (e) { return /-(\d{5})$/.test(e.nRt || "") && parseInt(e.nRt.substr(-5), 10) === parseInt(c, 10); })[0];
        return r || null;
    }
    function scanner(input, onCode) {
        $(input).on("keydown", function (ev) {
            if (ev.which !== 13) return;
            ev.preventDefault();
            var v = $.trim($(this).val());
            if (!v) return;
            $(this).val("");
            onCode(v);
        });
    }
    function flash($el) { $el.addClass("ox-flash"); setTimeout(function () { $el.removeClass("ox-flash"); }, 1400); }
    function bip(ok) {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            var a = bip.ctx = bip.ctx || new Ctx(), o = a.createOscillator(), g = a.createGain();
            o.frequency.value = ok ? 1250 : 260; g.gain.value = 0.06; o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + (ok ? 0.08 : 0.25));
        } catch (err) { /* pas de son */ }
    }

    /* =================================================================
       Frise des étapes (fiche + tracking)
       ================================================================= */
    function frise(e) {
        var finale = e.livraison && e.livraison.mode === "DOMICILE" ? "EN_LIVRAISON" : "EN_INSTANCE";
        if (e.etape === "EN_INSTANCE" || e.etape === "EN_LIVRAISON") finale = e.etape;
        var seq = ["ENREGISTREE", "GROUPEE", "EN_TRANSIT", "ARRIVEE", finale, "LIVREE"];
        if (international(e)) seq = ["ENREGISTREE", "EN_TRANSIT", "LIVREE"];
        var faites = {}; $.each(e.suivi || [], function (_, s) { faites[s.etape] = s; });
        var cur = e.etape === "ECHEC" ? finale : e.etape, iCur = $.inArray(cur, seq);
        if (e.etape === "ECHEC") faites[finale] = faites[finale] || faites.ECHEC;
        return "<ol class='ox-frise" + (e.etape === "ANNULEE" ? " ox-frise-annulee" : "") + "'>" + $.map(seq, function (k, i) {
            var s = faites[k], etat = i < iCur || (i === iCur && k === "LIVREE") ? "done" : i === iCur ? "current" : "todo";
            if (e.etape === "ECHEC" && i === iCur) etat = "error";
            var lib = k === "EN_INSTANCE" ? "En agence" : ETAPES[k].label;
            return "<li class='" + etat + "'><span class='ox-frise-dot'><i class='fa " + (etat === "done" ? "fa-check" : ETAPES[e.etape === "ECHEC" && i === iCur ? "ECHEC" : k].icon) + "'></i></span>" +
                "<b>" + U.esc(e.etape === "ECHEC" && i === iCur ? "Échec · nouvelle tentative" : lib) + "</b><small>" + (s ? U.esc(U.toFr(s.date)) : etat === "todo" ? "À venir" : "") + "</small></li>";
        }).join("") + "</ol>";
    }
    function timeline(e, publique) {
        var s = (e.suivi || []).slice().reverse();
        if (!s.length) return "<p class='cx-muted'>Aucun évènement.</p>";
        return "<ul class='ox-tl'>" + $.map(s, function (x) {
            var et = ETAPES[x.etape] || { label: x.etape, color: "grey", icon: "fa-circle" };
            return "<li class='ox-tl-" + et.color + "'><span class='ox-tl-ico'><i class='fa " + et.icon + "'></i></span><div>" +
                "<div class='ox-tl-top'><b>" + U.esc(et.label) + "</b><span>" + U.esc(U.toFr(x.date)) + "</span></div>" +
                "<div class='ox-tl-meta'><i class='fa fa-map-marker'></i> " + U.esc(G.villeNom(x.lieu)) + (x.agence ? " · " + U.esc(G.titre(x.agence)) : "") +
                (publique ? "" : " <span class='ox-tl-agent'><i class='fa fa-user-o'></i> " + U.esc(x.user || "—") + "</span>") + "</div>" +
                (x.note ? "<div class='ox-tl-note'>" + U.esc(publique ? notePublique(x) : x.note) + "</div>" : "") + "</div></li>";
        }).join("") + "</ul>";
    }
    /* Vue client : pas de noms d'agents, de pièces d'identité ni de motifs internes */
    function notePublique(x) {
        if (x.etape === "LIVREE") return "Colis remis au destinataire";
        if (x.etape === "EN_INSTANCE") return "Disponible au retrait, munissez-vous d'une pièce d'identité";
        if (x.etape === "ECHEC") return "Tentative de livraison infructueuse, nouvelle tentative prévue";
        if (/Réorientée/.test(x.note)) return "Destination mise à jour";
        if (x.etape === "GROUPEE") return "Préparé pour le départ";
        if (x.etape === "EN_TRANSIT") return "En route vers l'agence de destination";
        if (x.etape === "ARRIVEE") return "Arrivé à l'agence";
        return "";
    }

    /* =================================================================
       Fiche détaillée d'une LT (modale)
       options : { onChange: function(e) {} }
       ================================================================= */
    function personneHtml(titre, icone, p, pays, ville, agenceNom, extra) {
        function l(lbl, v, cls) { return "<dt>" + lbl + "</dt><dd" + (cls ? " class='" + cls + "'" : "") + ">" + (v ? v : "<span class='cx-muted'>—</span>") + "</dd>"; }
        return "<div class='cx-block ox-partie'><div class='cx-block-title'><i class='fa " + icone + "'></i> " + titre + "</div><dl class='cx-dl ox-dl'>" +
            l("Nom", "<b>" + U.esc(p.nom) + "</b>") + l("Pays", U.esc(pays || "Cameroun")) + l("Ville", U.esc(G.villeNom(ville))) + l("Agence", U.esc(G.titre(agenceNom || ""))) +
            l("Téléphone", p.tel ? "<a href='tel:+237" + U.esc(G.tel(p.tel)) + "'>" + U.esc(G.telAff(p.tel)) + "</a>" : "") +
            l("WhatsApp", p.whatsapp ? U.esc(G.telAff(p.whatsapp)) : "") + l("Adresse", U.esc(p.adresse || "")) + l("E-mail", U.esc(p.email || "")) + (extra || "") + "</dl></div>";
    }
    function ficheHtml(e) {
        var client = e.client, s = e.sla, lv = e.livraison || {};
        var bord = e.bordereauId ? "<a href='bordereau.html?id=" + e.bordereauId + "'>" + U.esc(e.bordereau) + "</a>" : (e.bordereau ? U.esc(e.bordereau) : "");
        var fac = e.factureId ? $.grep(CX.api.listSync("factures"), function (f) { return f.id == e.factureId; })[0] : null;
        var tags = [
            etapeBadge(e.etape), slaBadge(e),
            e.retour ? "<span class='cx-badge cx-badge-purple cx-no-dot'><i class='fa fa-undo'></i> Retour expéditeur</span>" : "",
            (e.incidents || []).length ? "<span class='cx-badge cx-badge-red cx-no-dot'><i class='fa fa-warning'></i> " + pl(e.incidents.length, "incident") + "</span>" : "",
            e.partenaire ? "<span class='cx-badge cx-badge-blue cx-no-dot'><i class='fa fa-plane'></i> " + U.esc(e.partenaire.nom) + "</span>" : ""
        ].join(" ");
        var colis = "<table class='cx-table ox-mini'><thead><tr><th>Nature</th><th>Description</th><th class='num'>Nb</th><th class='num'>Poids réel</th><th class='num'>Dim. (cm)</th><th class='num'>Taxable</th><th class='num'>Valeur</th></tr></thead><tbody>" +
            $.map(e.colis, function (c) {
                return "<tr><td>" + U.esc(c.nature) + "</td><td>" + U.esc(c.description || e.contenu || "") + "</td><td class='num'>" + U.esc(c.nombre || 1) + "</td><td class='num'>" + U.esc(G.kg(c.poids)) + "</td>" +
                    "<td class='num'>" + (c.L ? U.esc(c.L + "×" + c.l + "×" + c.H) : "—") + "</td><td class='num'>" + U.esc(G.kg(c.poidsTaxable || c.poids)) + "</td><td class='num'>" + (c.valeur ? U.money(c.valeur) : "—") + "</td></tr>";
            }).join("") + "</tbody></table>";
        var notes = (e.notes || []).slice().reverse(), inc = (e.incidents || []).slice().reverse(), reo = (e.reorientations || []).slice().reverse();
        var remise = e.remise ? "<div class='cx-block ox-preuve'><div class='cx-block-title'><i class='fa fa-handshake-o'></i> Preuve de remise</div><div class='ox-preuve-grid'><dl class='cx-dl ox-dl'>" +
            "<dt>Remis le</dt><dd>" + U.esc(U.toFr(e.remise.date)) + "</dd><dt>À</dt><dd><b>" + U.esc(e.remise.nom) + "</b>" + (e.remise.qui === "MANDATAIRE" ? " (mandataire)" : "") + "</dd>" +
            "<dt>Pièce</dt><dd>" + U.esc(e.remise.piece) + " n° <span class='cx-mono'>" + U.esc(e.remise.numeroPiece) + "</span></dd><dt>Téléphone</dt><dd>" + U.esc(G.telAff(e.remise.tel)) + "</dd>" +
            "<dt>Agent</dt><dd>" + U.esc(e.remise.user) + "</dd>" + (e.remise.observation ? "<dt>Observation</dt><dd>" + U.esc(e.remise.observation) + "</dd>" : "") + "</dl>" +
            "<div class='ox-preuve-img'>" + (e.remise.signature ? "<img src='" + e.remise.signature + "' alt='Signature'>" : "") + (e.remise.photo ? "<img src='" + e.remise.photo + "' alt='Photo'>" : "") + "</div></div></div>" : "";
        return "<div class='ox-fiche'>" +
            "<div class='ox-fiche-head'><div><div class='ox-fiche-num'>" + U.esc(e.nRt) + (e.nRtMan ? " <span class='cx-tag cx-mono' title='N° de LT manuelle (feuille de carnet)'>Man. " + U.esc(e.nRtMan) + "</span>" : "") + "</div>" +
            "<div class='ox-fiche-route'>" + U.esc(G.villeNom(e.villeDep)) + " <small>" + U.esc(G.titre(e.bureauDep)) + "</small> <i class='fa fa-long-arrow-right'></i> " + U.esc(destinationLib(e)) +
            " <small>" + (lv.mode === "DOMICILE" ? "livraison à domicile" + (lv.quartier ? " · " + U.esc(lv.quartier) : "") : "retrait en agence") + "</small></div>" +
            "<div class='ox-fiche-tags'>" + tags + "</div></div>" +
            "<dl class='ox-fiche-kv'><div><dt>Client</dt><dd>" + (client ? "<a href='../commercial/client-fiche.html?id=" + client.id + "'>" + U.esc(client.raisonSociale) + "</a>" : "Particulier (comptant)") + "</dd></div>" +
            "<div><dt>Montant</dt><dd>" + U.money(e.montants.total) + "</dd></div>" +
            "<div><dt>Paiement</dt><dd>" + U.esc(e.paiement.mode || "—") + "</dd></div>" +
            "<div><dt>Remise</dt><dd>" + (lv.mode === "DOMICILE" ? "Domicile" + (lv.zone ? " (" + U.esc(lv.zone) + ")" : "") : "Bureau") + "</dd></div>" +
            "<div><dt>Délai cible</dt><dd>" + pl(s.cible, "jour") + " · " + U.toFr(s.echeance) + "</dd></div></dl></div>" +
            frise(e) +
            "<div class='ox-grid-2'>" +
            personneHtml("Expéditeur", "fa-user", e.expediteurInfo, "Cameroun", e.villeDep, e.bureauDep) +
            personneHtml("Destinataire", "fa-map-marker", e.destinataireInfo, e.paysDest || "Cameroun", e.villeEtranger || e.villeDest, e.bureauDest,
                lv.mode === "DOMICILE" ? "<dt>Quartier</dt><dd>" + U.esc(lv.quartier || "—") + (lv.repere ? " · " + U.esc(lv.repere) : "") + "</dd>" : "") +
            "</div>" +
            "<div class='ox-sec'><h5><i class='fa fa-cubes'></i> Les paquets <small>" + pl(e.nbColis || 1, "colis") + " · " + U.esc(G.kg(e.poids)) + " taxables · " + U.esc(e.contenu || "") + "</small></h5>" + colis + "</div>" +
            "<div class='ox-grid-2'><div class='ox-sec'><h5><i class='fa fa-info-circle'></i> Informations</h5><dl class='cx-dl ox-dl'>" +
            "<dt>Créé par</dt><dd>" + U.esc(e.guichetier || e.creePar || "—") + " · " + U.toFr(e.dateExp) + (e.heure ? " " + U.esc(e.heure) : "") + "</dd>" +
            "<dt>Facture liée</dt><dd>" + (fac ? "<a href='../commercial/facture.html?id=" + fac.id + "'>" + U.esc(fac.numero) + "</a> " + badge(CX.REF.STATUT_FACTURE, fac.statut) : e.typeClient === "COMPTE" ? "<span class='cx-muted'>Non facturée</span>" : "<span class='cx-muted'>Payée au comptant</span>") + "</dd>" +
            "<dt>Carnet</dt><dd>" + (e.nRtMan ? "Feuille <b class='cx-mono'>" + U.esc(e.nRtMan) + "</b> · <a href='../maquettes-carnets/carnets-liste.html" + (e.clientId ? "?client=" + e.clientId : "") + "'>carnets du client</a>" : "<span class='cx-muted'>—</span>") + "</dd>" +
            "<dt>Bordereau</dt><dd>" + (bord || "<span class='cx-muted'>—</span>") + "</dd>" +
            "<dt>Position</dt><dd>" + (e.positionId ? U.esc(agenceLib(e.positionId)) : e.partenaire ? "Chez " + U.esc(e.partenaire.nom) + " (AWB " + U.esc(e.partenaire.awb) + ")" : e.etape === "EN_TRANSIT" ? "Dans le véhicule" : "—") + "</dd>" +
            (e.avis && e.avis.length ? "<dt>Avis envoyés</dt><dd>" + e.avis.length + " (dernier le " + U.toFr(e.avis[e.avis.length - 1].date) + ")</dd>" : "") +
            "</dl></div>" +
            "<div class='ox-sec'><h5><i class='fa fa-sticky-note-o'></i> Notes, incidents et réorientations</h5>" +
            (notes.length || inc.length || reo.length ? "<ul class='ox-notes'>" +
                $.map(inc, function (x) { return "<li class='ox-note-inc'><b>" + U.esc((TYPES_INCIDENT[x.type] || {}).label || x.type) + "</b> · " + U.esc(x.description) + "<small>" + U.esc(U.toFr(x.date)) + " · " + U.esc(x.user) + "</small></li>"; }).join("") +
                $.map(reo, function (x) { return "<li class='ox-note-reo'><b>Réorientée</b> " + U.esc(G.villeNom(x.de.villeDest) + " · " + G.titre(x.de.bureauDest || "")) + " → " + U.esc(G.villeNom(x.vers.villeDest) + " · " + G.titre(x.vers.bureauDest)) + " · " + U.esc(x.motif) + (x.precision ? " (" + U.esc(x.precision) + ")" : "") + "<small>" + U.esc(U.toFr(x.date)) + " · " + U.esc(x.user) + "</small></li>"; }).join("") +
                $.map(notes, function (x) { return "<li>" + U.esc(x.texte) + "<small>" + U.esc(U.toFr(x.date)) + " · " + U.esc(x.user) + "</small></li>"; }).join("") + "</ul>"
                : "<p class='cx-muted' style='margin:0'>Aucune note.</p>") + "</div></div>" +
            remise +
            "<div class='ox-sec'><h5><i class='fa fa-road'></i> Les étapes de votre expédition</h5>" + timeline(e) + "</div>" +
            "<div class='ox-action-zone' id='fx-zone'></div>" +
            "</div>";
    }
    function fiche(id, options) {
        options = options || {};
        var $m = modale("ox-fiche", "Fiche de la lettre de transport", "fa-file-text-o", "<div id='ox-fiche-body'></div>",
            "<div class='ox-fiche-actions'>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-fx='reorienter'><i class='fa fa-random'></i> Réorienter</button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-fx='destinataire'><i class='fa fa-pencil'></i> Corriger le destinataire</button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-fx='note'><i class='fa fa-sticky-note-o'></i> Ajouter une note</button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-fx='incident'><i class='fa fa-warning'></i> Déclarer un incident</button>" +
            "<button type='button' class='cx-btn cx-btn-success cx-btn-sm' data-fx='remise'><i class='fa fa-handshake-o'></i> Remettre</button>" +
            "<button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-fx='partenaire-livre'><i class='fa fa-plane'></i> Livraison partenaire confirmée</button>" +
            "</div><div class='ox-fiche-liens'><a class='cx-btn cx-btn-ghost cx-btn-sm' id='fx-recu' target='_blank'><i class='fa fa-print'></i> Réimprimer le reçu</a>" +
            "<a class='cx-btn cx-btn-ghost cx-btn-sm' id='fx-track' target='_blank'><i class='fa fa-crosshairs'></i> Tracking</a>" +
            "<button type='button' class='cx-btn cx-btn-dark cx-btn-sm' data-dismiss='modal'>Fermer</button></div>", "modal-lg ox-fiche-dialog");
        var e = null, change = false;
        function charger() {
            // TODO API : GET /exploitation/expeditions/{id}  (fiche complète : suivi, facture, bordereau, notes)
            return CX.api.get("expeditions", id).done(function (raw) {
                e = norm(raw);
                $("#ox-fiche-body").html(ficheHtml(e));
                $("#fx-recu").attr("href", "../guichet/recu.html?id=" + e.id);
                $("#fx-track").attr("href", "tracking.html?lt=" + encodeURIComponent(e.nRt));
                var fini = e.etape === "LIVREE" || e.etape === "ANNULEE";
                $m.find("[data-fx=reorienter]").prop("disabled", fini || e.etape === "EN_LIVRAISON");
                $m.find("[data-fx=destinataire]").prop("disabled", fini);
                $m.find("[data-fx=remise]").toggleClass("cx-hidden", !(estMoi(e.positionId) && $.inArray(e.etape, ["ARRIVEE", "EN_INSTANCE", "ECHEC"]) >= 0 && estMoi(e.agDestId)));
                $m.find("[data-fx=partenaire-livre]").toggleClass("cx-hidden", !(e.partenaire && e.etape === "EN_TRANSIT"));
            }).fail(function () { $("#ox-fiche-body").html("<div class='cx-empty'><i class='fa fa-search'></i><b>LT introuvable</b></div>"); });
        }
        function apres(maj, msg) { change = true; if (msg) U.toast(msg, "success"); charger(); if (options.onChange) options.onChange(maj); }
        /* Petits formulaires dans la fiche (pas de modale empilée) */
        function zone(titre, corps, okTxt, valider) {
            $("#fx-zone").html("<div class='ox-zone'><div class='ox-zone-head'><b>" + titre + "</b><button type='button' class='close' data-zone-close aria-label='Fermer'>&times;</button></div>" + corps +
                "<div class='ox-zone-foot'><button type='button' class='cx-btn cx-btn-ghost cx-btn-sm' data-zone-close>Annuler</button><button type='button' class='cx-btn cx-btn-primary cx-btn-sm' id='fx-ok'>" + okTxt + "</button></div></div>");
            var $z = $("#fx-zone");
            $z.find("input,textarea,select").first().focus();
            $m.find(".modal-body").animate({ scrollTop: $m.find(".modal-body")[0].scrollHeight }, 200);
            $z.off("click", "#fx-ok").on("click", "#fx-ok", function () { effacerErreurs($z); valider($z); });
        }
        $m.on("click", "[data-zone-close]", function () { $("#fx-zone").empty(); });
        $m.on("click", "[data-fx]", function () {
            var act = $(this).data("fx");
            if (!e) return;
            if (act === "note") {
                zone("Ajouter une note", champ("fx-note", "Note", "<textarea class='form-control' id='fx-note' maxlength='300' rows='2'></textarea>", true), "<i class='fa fa-check'></i> Enregistrer", function ($z) {
                    var t = $.trim($("#fx-note").val());
                    if (!t) return erreurChamp($z, "#fx-note", "Saisissez la note.");
                    // TODO API : POST /exploitation/expeditions/{id}/notes  { texte }
                    majExp(e.id, function (x) { x.notes = x.notes || []; x.notes.push({ date: U.now(), user: CX.CONFIG.USER.nom, texte: t }); journal(x, "Note : " + t); return true; })
                        .done(function (maj) { apres(maj, "Note ajoutée."); });
                });
            }
            if (act === "incident") {
                zone("Déclarer un incident", "<div class='ox-grid-2'>" + champ("fx-inc-type", "Type", "<select class='form-control' id='fx-inc-type'>" +
                    $.map(TYPES_INCIDENT, function (v, k) { return "<option value='" + k + "'>" + U.esc(v.label) + "</option>"; }).join("") + "</select>", true) +
                    champ("fx-inc-val", "Valeur estimée du préjudice (FCFA)", "<input type='number' min='0' step='500' class='form-control' id='fx-inc-val'>") + "</div>" +
                    champ("fx-inc-desc", "Description", "<textarea class='form-control' id='fx-inc-desc' rows='2' maxlength='300' placeholder='Constat, circonstances, témoins…'></textarea>", true),
                "<i class='fa fa-warning'></i> Déclarer", function ($z) {
                    var t = $.trim($("#fx-inc-desc").val()), ty = $("#fx-inc-type").val();
                    if (t.length < 5) return erreurChamp($z, "#fx-inc-desc", "Décrivez l'incident.");
                    // TODO API : POST /exploitation/expeditions/{id}/incidents  { type, description, valeur } (alerte au service qualité)
                    majExp(e.id, function (x) {
                        x.incidents = x.incidents || [];
                        x.incidents.push({ date: U.now(), user: CX.CONFIG.USER.nom, agenceId: agenceCourante().id, type: ty, description: t, valeur: U.num($("#fx-inc-val").val()), statut: "OUVERT" });
                        var C = agenceCourante();
                        x.suivi = x.suivi || [];
                        x.suivi.push({ date: U.now(), etape: etapeDeduite(x), lieu: C.ville, agence: C.nom, user: CX.CONFIG.USER.nom, note: "Incident déclaré : " + TYPES_INCIDENT[ty].label });
                        journal(x, "Incident déclaré (" + TYPES_INCIDENT[ty].label + ") : " + t);
                        return true;
                    }).done(function (maj) { apres(maj, "Incident déclaré : le service qualité est alerté."); });
                });
            }
            if (act === "destinataire") {
                var d = e.destinataireInfo, lv = e.livraison || {};
                zone("Corriger le destinataire", "<div class='ox-grid-2'>" +
                    champ("fx-d-nom", "Nom", "<input type='text' class='form-control' id='fx-d-nom' maxlength='80' value='" + U.esc(d.nom) + "'>", true) +
                    champ("fx-d-tel", "Téléphone", "<input type='tel' class='form-control' id='fx-d-tel' maxlength='14' value='" + U.esc(G.telFmt(d.tel)) + "'>", true) +
                    champ("fx-d-wa", "WhatsApp", "<input type='tel' class='form-control' id='fx-d-wa' maxlength='14' value='" + U.esc(G.telFmt(d.whatsapp)) + "'>") +
                    champ("fx-d-mail", "E-mail", "<input type='email' class='form-control' id='fx-d-mail' maxlength='80' value='" + U.esc(d.email) + "'>") +
                    champ("fx-d-adr", "Adresse", "<input type='text' class='form-control' id='fx-d-adr' maxlength='120' value='" + U.esc(d.adresse) + "'>") +
                    (lv.mode === "DOMICILE" ? champ("fx-d-q", "Quartier · repère", "<input type='text' class='form-control' id='fx-d-q' maxlength='120' value='" + U.esc((lv.quartier || "") + (lv.repere ? " · " + lv.repere : "")) + "'>") : "") +
                    "</div>" + champ("fx-d-motif", "Motif de la correction", "<input type='text' class='form-control' id='fx-d-motif' maxlength='120' placeholder='Ex. : numéro erroné signalé par l’expéditeur'>", true),
                "<i class='fa fa-check'></i> Corriger", function ($z) {
                    var nom = $.trim($("#fx-d-nom").val()), tel = G.tel($("#fx-d-tel").val()), motif = $.trim($("#fx-d-motif").val());
                    if (nom.length < 2) return erreurChamp($z, "#fx-d-nom", "Nom obligatoire.");
                    if (tel.length !== 9) return erreurChamp($z, "#fx-d-tel", "Numéro à 9 chiffres.");
                    if (!motif) return erreurChamp($z, "#fx-d-motif", "Indiquez le motif.");
                    // TODO API : PUT /exploitation/expeditions/{id}/destinataire  { nom, tel, whatsapp, email, adresse, quartier, motif }
                    majExp(e.id, function (x) {
                        var av = (x.destinataireInfo && x.destinataireInfo.nom) || x.destinataire;
                        x.destinataireInfo = $.extend({}, x.destinataireInfo || {}, { nom: nom, tel: tel, whatsapp: G.tel($("#fx-d-wa").val()), email: $.trim($("#fx-d-mail").val()), adresse: $.trim($("#fx-d-adr").val()) });
                        x.destinataire = nom; x.telDestinataire = G.telFmt(tel);
                        if ($("#fx-d-q").length) {
                            var q = $("#fx-d-q").val().split("·");
                            x.livraison = $.extend({}, x.livraison || {}, { quartier: $.trim(q[0] || ""), repere: $.trim(q.slice(1).join("·")) });
                        }
                        journal(x, "Destinataire corrigé (" + av + " → " + nom + ", " + G.telFmt(tel) + ") : " + motif);
                        return true;
                    }).done(function (maj) { apres(maj, "Destinataire corrigé."); });
                });
            }
            if (act === "reorienter" || act === "remise") {
                var cur = e;
                $m.one("hidden.bs.modal.oxre", function () {
                    var p = act === "reorienter" ? modaleReorienter([cur]) : modaleRemise(cur);
                    p.done(function (r) {
                        U.toast(act === "reorienter" ? "LT réorientée." : "Colis remis : LT <b>" + U.esc(cur.nRt) + "</b> livrée.", "success");
                        if (options.onChange) options.onChange(r);
                    }).always(function () { fiche(cur.id, options); });
                });
                $m.modal("hide");
            }
            if (act === "partenaire-livre") {
                CX.util.confirm({ title: "Livraison par le partenaire", message: "Confirmer que <b>" + U.esc(e.partenaire.nom) + "</b> a livré la LT <b>" + U.esc(e.nRt) + "</b> (preuve reçue) ?", okText: "Confirmer", okClass: "cx-btn-success" })
                    .done(function () {
                        // TODO API : POST /exploitation/expeditions/{id}/livraison-partenaire  (ou webhook de suivi du partenaire)
                        avancer(e.id, "LIVREE", { note: "Livraison confirmée par " + e.partenaire.nom + " (AWB " + e.partenaire.awb + ")", preuve: true, agence: agenceCourante() })
                            .done(function (maj) { apres(maj, "LT livrée."); });
                    });
            }
        });
        /* suppression différée : laisse s'exécuter l'enchaînement éventuel (réorienter / remettre) */
        $m.on("hidden.bs.modal", function () { setTimeout(function () { $m.remove(); }, 0); });
        charger().done(function () { $m.modal("show"); });
        return $m;
    }

    /* Menus d'actions des tableaux : positionnés en « fixed » (sinon rognés par .cx-table-wrap) */
    function menusFixes(sel) {
        function placer(dd) {
            var $mm = $(dd).find(".dropdown-menu"), r = $(dd).find("[data-toggle='dropdown']")[0].getBoundingClientRect();
            var h = $mm.outerHeight(), w = $mm.outerWidth(), top = r.bottom + 4;
            if (top + h > window.innerHeight - 40 && r.top - h - 4 > 0) top = r.top - h - 4;
            $mm.css({ position: "fixed", top: top, left: Math.max(8, r.right - w), right: "auto", bottom: "auto" });
        }
        $(sel).on("shown.bs.dropdown", ".dropdown", function () { placer(this); });
        $(sel).on("hidden.bs.dropdown", ".dropdown", function () { $(this).find(".dropdown-menu").css({ position: "", top: "", left: "", right: "", bottom: "" }); });
        $(window).on("scroll resize", function () { $(sel).find(".dropdown.open").each(function () { placer(this); }); });
    }

    /* =================================================================
       Bordereaux : départ, retrait d'un colis, annulation
       ================================================================= */
    function logBordereau(b, action) {
        b.historique = b.historique || [];
        b.historique.unshift({ date: U.now(), user: CX.CONFIG.USER.nom, action: action });
    }
    /* Étape d'un colis avant son groupage (ENREGISTREE au départ, ARRIVEE en transit) */
    function etapeAvantGroupage(e) {
        var s = e.suivi || [], av = "ENREGISTREE";
        for (var i = 0; i < s.length; i++) if (s[i].etape === "GROUPEE" && i > 0) av = s[i - 1].etape === "ARRIVEE" ? "ARRIVEE" : "ENREGISTREE";
        return av;
    }
    /* Ajoute des colis à un bordereau en préparation (étape GROUPEE) */
    function grouper(b, ids) {
        // TODO API : POST /exploitation/bordereaux/{id}/colis  { expeditionIds[] }
        var A = agenceCourante();
        return avancerLot(ids, "GROUPEE", { note: "Bordereau " + b.numero + " vers " + agenceLib(b.agenceDestId), position: A.id, patch: { bordereau: b.numero, bordereauId: b.id } })
            .then(function (ok, ko) {
                return CX.api.get("bordereaux", b.id).then(function (bb) {
                    $.each(ok, function (_, e) { if ($.inArray(e.id, bb.expeditionIds) < 0) bb.expeditionIds.push(e.id); });
                    logBordereau(bb, pl(ok.length, "colis ajouté", "colis ajoutés"));
                    return CX.api.save("bordereaux", bb).then(function (s) { return { bordereau: s, ok: ok, ko: ko }; });
                });
            });
    }
    function retirerDuBordereau(b, expId) {
        // TODO API : DELETE /exploitation/bordereaux/{id}/colis/{expeditionId}
        return CX.api.get("expeditions", expId).then(function (e) {
            return avancer(expId, etapeAvantGroupage(e), { note: "Retiré du bordereau " + b.numero, forcer: true, patch: { bordereau: null, bordereauId: null } });
        }).then(function (e) {
            return CX.api.get("bordereaux", b.id).then(function (bb) {
                bb.expeditionIds = $.grep(bb.expeditionIds, function (x) { return String(x) !== String(expId); });
                logBordereau(bb, "Colis " + e.nRt + " retiré");
                return CX.api.save("bordereaux", bb);
            });
        });
    }
    function annulerBordereau(b) {
        // TODO API : DELETE /exploitation/bordereaux/{id}  (uniquement en préparation)
        var exps = CX.api.listSync("expeditions"), ids = b.expeditionIds.slice(), d = $.Deferred(), i = 0;
        (function suivant() {
            if (i >= ids.length) { CX.api.remove("bordereaux", b.id).done(function () { d.resolve(); }); return; }
            var id = ids[i++], e = $.grep(exps, function (x) { return String(x.id) === String(id); })[0];
            if (!e || e.etape !== "GROUPEE") { suivant(); return; }
            avancer(id, etapeAvantGroupage(e), { note: "Bordereau " + b.numero + " annulé", forcer: true, patch: { bordereau: null, bordereauId: null } }).always(suivant);
        })();
        return d.promise();
    }
    /* Départ du véhicule : confirmation véhicule / chauffeur / scellé, bordereau PARTI, colis EN_TRANSIT */
    function modaleDepart(b) {
        var dfd = $.Deferred(), v = b.vehicule || {}, c = b.chauffeur || {};
        var corps = "<p class='cx-muted' style='margin-top:0'>Bordereau <b class='cx-mono'>" + U.esc(b.numero) + "</b> · " + U.esc(agenceLib(b.agenceDepId)) + " <i class='fa fa-long-arrow-right'></i> " +
            U.esc(agenceLib(b.agenceDestId)) + " · " + pl(b.expeditionIds.length, "colis") + "</p><div class='ox-grid-2'>" +
            champ("dp-type", "Véhicule", "<select class='form-control' id='dp-type'>" + options(CX.REF.TYPES_VEHICULE, v.type) + "</select>", true) +
            champ("dp-immat", "Immatriculation", "<input type='text' class='form-control cx-mono' id='dp-immat' maxlength='15' value='" + U.esc(v.immatriculation || "") + "'>", true) +
            champ("dp-chauffeur", "Chauffeur", "<input type='text' class='form-control' id='dp-chauffeur' maxlength='60' value='" + U.esc(c.nom || "") + "'>", true) +
            champ("dp-tel", "Téléphone du chauffeur", "<input type='tel' class='form-control' id='dp-tel' maxlength='14' value='" + U.esc(c.tel || "") + "'>") +
            champ("dp-scelle", "N° de scellé", "<input type='text' class='form-control cx-mono' id='dp-scelle' maxlength='20' value='" + U.esc(b.scelle || "") + "'>", true) +
            champ("dp-heure", "Heure de départ", "<input type='time' class='form-control' id='dp-heure' value='" + U.now().substr(11, 5) + "'>", true) +
            "</div>";
        var $m = modale("ox-depart", "Faire partir le bordereau", "fa-truck", corps,
            "<button type='button' class='cx-btn cx-btn-ghost' data-dismiss='modal'>Annuler</button><button type='button' class='cx-btn cx-btn-primary' id='dp-ok'><i class='fa fa-road'></i> Confirmer le départ</button>");
        var fait = null;
        $m.on("click", "#dp-ok", function () {
            effacerErreurs($m);
            var immat = $.trim($("#dp-immat").val()), ch = $.trim($("#dp-chauffeur").val()), sc = $.trim($("#dp-scelle").val());
            if (!b.expeditionIds.length) { U.toast("Le bordereau est vide.", "warning"); return; }
            if (immat.length < 4) return erreurChamp($m, "#dp-immat", "Immatriculation obligatoire.");
            if (ch.length < 3) return erreurChamp($m, "#dp-chauffeur", "Nom du chauffeur obligatoire.");
            if (sc.length < 3) return erreurChamp($m, "#dp-scelle", "N° de scellé obligatoire.");
            var $b = $(this); U.busy($b, true);
            var dateDep = U.today() + " " + ($("#dp-heure").val() || U.now().substr(11, 5));
            // TODO API : POST /exploitation/bordereaux/{id}/depart  { vehicule, chauffeur, scelle, heure }
            CX.api.get("bordereaux", b.id).then(function (bb) {
                bb.vehicule = { type: $("#dp-type").val(), immatriculation: immat };
                bb.chauffeur = { nom: ch, tel: $.trim($("#dp-tel").val()) };
                bb.scelle = sc; bb.statut = "PARTI"; bb.dateDepart = dateDep;
                logBordereau(bb, "Départ du véhicule " + immat + " (chauffeur " + ch + ", scellé " + sc + ")");
                return CX.api.save("bordereaux", bb);
            }).then(function (bb) {
                return avancerLot(bb.expeditionIds, "EN_TRANSIT", { note: "Départ bordereau " + bb.numero + " vers " + agenceLib(bb.agenceDestId) + " · " + immat, date: dateDep })
                    .then(function (ok, ko) { fait = { bordereau: bb, ok: ok, ko: ko }; $m.modal("hide"); });
            }).fail(function (m) { U.busy($b, false); U.toast(U.esc(m || "Départ impossible."), "error"); });
        });
        $m.on("hidden.bs.modal", function () { $m.remove(); if (fait) dfd.resolve(fait); else dfd.reject(); });
        $m.modal("show");
        return dfd.promise();
    }

    /* =================================================================
       Files de travail de l'agence courante (à partir d'expéditions
       normalisées) : utilisées par le tableau de bord et les écrans.
       TODO API : GET /exploitation/agences/{id}/files  (compteurs calculés côté serveur)
       ================================================================= */
    function ageInstance(e) {
        var s = dernierEvenement(e, "EN_INSTANCE") || dernierEvenement(e, "ARRIVEE");
        return s ? U.daysBetween(s.date.substr(0, 10), U.today()) : 0;
    }
    function files(exps, bordereaux) {
        var bMap = {};
        $.each(bordereaux || [], function (_, b) { bMap[b.id] = b; });
        var f = { aGrouper: [], locaux: [], transitIci: [], enTransitVersNous: [], bordereauxAttendus: [], enInstance: [], instanceAncien: [],
            aLivrer: [], enLivraison: [], echecs: [], international: [], aMettreEnAgence: [] };
        $.each(exps, function (_, e) {
            var ici = estMoi(e.positionId), et = e.etape, dest = estMoi(e.agDestId);
            if (et === "ENREGISTREE" && ici) {
                if (international(e)) f.international.push(e);
                else if (dest) f.locaux.push(e);
                else f.aGrouper.push(e);
            }
            if (et === "ARRIVEE" && ici) {
                if (international(e)) { if (!e.partenaire) f.international.push(e); }
                else if (!dest) { f.transitIci.push(e); f.aGrouper.push(e); }
                else if (e.livraison && e.livraison.mode === "DOMICILE") f.aLivrer.push(e);
                else f.aMettreEnAgence.push(e);
            }
            if (et === "EN_TRANSIT" && !e.partenaire) {
                var b = e.bordereauId ? bMap[e.bordereauId] : null;
                if (b ? estMoi(b.agenceDestId) : dest) f.enTransitVersNous.push(e);
            }
            if (et === "EN_INSTANCE" && ici) { f.enInstance.push(e); if (ageInstance(e) > INSTANCE_ALERTE_J) f.instanceAncien.push(e); }
            if (et === "ECHEC" && ici) { f.echecs.push(e); f.aLivrer.push(e); }
            if (et === "EN_LIVRAISON" && ici) f.enLivraison.push(e);
        });
        f.bordereauxAttendus = $.grep(bordereaux || [], function (b) { return (b.statut === "PARTI" || b.statut === "ARRIVE") && estMoi(b.agenceDestId); });
        return f;
    }

    /* Indicateur cliquable */
    function kpi(label, valeur, foot, icon, color, href) {
        return "<" + (href ? "a href='" + href + "'" : "div") + " class='cx-kpi " + (color || "") + (href ? " clickable" : "") + "'><div class='cx-kpi-ico'><i class='fa " + icon + "'></i></div>" +
            "<div class='cx-kpi-label'>" + label + "</div><div class='cx-kpi-value'>" + valeur + "</div><div class='cx-kpi-foot'>" + foot + "</div></" + (href ? "a" : "div") + ">";
    }

    /* Exécution au chargement : bordereaux / tournées de démonstration */
    try { assurerDemo(); } catch (err) { if (window.console) console.warn("CX.ops.assurerDemo", err); }

    return {
        ETAPES: ETAPES, TRANSITIONS: TRANSITIONS, STATUT_BORDEREAU: STATUT_BORDEREAU, STATUT_TOURNEE: STATUT_TOURNEE,
        MOTIFS_ECHEC: MOTIFS_ECHEC, MOTIFS_REORIENTATION: MOTIFS_REORIENTATION, TYPES_INCIDENT: TYPES_INCIDENT, PIECES: PIECES, PARTENAIRES: PARTENAIRES,
        CHAUFFEURS: CHAUFFEURS, VEHICULES: VEHICULES, SLA: SLA, INSTANCE_ALERTE_J: INSTANCE_ALERTE_J, INSTANCE_RETOUR_J: INSTANCE_RETOUR_J,
        etapeBadge: etapeBadge, badge: badge, pl: pl,
        agenceId: agenceId, agence: agence, agenceLib: agenceLib, agenceCourante: agenceCourante, estMoi: estMoi, selecteurAgence: selecteurAgence, changerAgence: changerAgence,
        agDest: agDest, agDep: agDep, position: position, international: international, enTransitIci: enTransitIci, destinationLib: destinationLib,
        norm: norm, dernierEvenement: dernierEvenement, sla: sla, slaBadge: slaBadge, typeTrajet: typeTrajet,
        majExp: majExp, journal: journal, appliquerEtape: appliquerEtape, avancer: avancer, avancerLot: avancerLot,
        numeroBordereau: numeroBordereau, numeroTournee: numeroTournee, assurerDemo: assurerDemo,
        avis: avis, messageAvis: messageAvis, modale: modale, champ: champ, options: options, optionsAgences: optionsAgences,
        erreurChamp: erreurChamp, effacerErreurs: effacerErreurs, signature: signature,
        modaleRemise: modaleRemise, modaleReorienter: modaleReorienter, modalePartenaire: modalePartenaire, reorienterBrut: reorienterBrut,
        chercherLt: chercherLt, scanner: scanner, flash: flash, bip: bip, frise: frise, timeline: timeline, fiche: fiche,
        menusFixes: menusFixes, kpi: kpi, files: files, ageInstance: ageInstance,
        grouper: grouper, retirerDuBordereau: retirerDuBordereau, annulerBordereau: annulerBordereau, modaleDepart: modaleDepart, logBordereau: logBordereau,
        /* Chargement commun : expéditions normalisées + bordereaux
           TODO API : GET /exploitation/expeditions?agence={id}&actives=1  et  GET /exploitation/bordereaux?agence={id} */
        charger: function () {
            var d = $.Deferred();
            $.when(CX.api.list("expeditions"), CX.api.list("bordereaux")).done(function (exps, bords) {
                d.resolve($.map(exps, function (e) { return norm(e); }), bords || []);
            }).fail(function (m) { d.reject(m); });
            return d.promise();
        }
    };
})();

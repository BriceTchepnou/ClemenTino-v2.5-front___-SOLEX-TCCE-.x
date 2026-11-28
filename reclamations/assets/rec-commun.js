/* =====================================================================
   ClemenTino 2.0 - Module RÉCLAMATIONS - socle commun (CX.rec)
   ---------------------------------------------------------------------
   À charger APRÈS cx-core.js et cx-data.js (et de préférence après
   cx-demo-exploitation.js : les réclamations de démonstration sont
   rattachées à de vraies expéditions).

   Collection « reclamations » :
     { numero REC-AAAA-NNNN, date "AAAA-MM-JJ HH:MM",
       origine RECU | FACTURE | SANS, reference (N° RT ou N° facture),
       expeditionId, factureId, clientId, clientNom, contact,
       type RECLAMATION | PLAINTE | INCIDENT | ACCIDENT,
       priorite NORMALE | PRIORITAIRE | URGENTE, echeance "AAAA-MM-JJ HH:MM",
       objet, description, agenceId, assigneA (nom), statut EN_ATTENTE |
       EN_TRAITEMENT | TRAITEE | ABANDONNEE, pieces[] { nom, taille, type },
       fil[] { date, user, genre COMMENTAIRE | STATUT | AFFECTATION | CREATION, texte },
       resolution { date, user, solution, geste { type, montant }, satisfaction },
       abandon { date, user, motif }, creePar }
   TODO API : /qualite/reclamations (GET liste filtrée, POST, PUT,
   POST /{id}/affecter, /{id}/commentaires, /{id}/resoudre, /{id}/abandonner, /{id}/rouvrir)
   ===================================================================== */
var CX = window.CX || {};
window.CX = CX;

CX.rec = (function () {
    var U = CX.util;
    var TYPES = {
        RECLAMATION: { label: "Réclamation", color: "orange", aide: "Service non conforme, retard, colis endommagé, remboursement…" },
        PLAINTE: { label: "Plainte", color: "purple", aide: "Comportement d'un agent ou d'un livreur, accueil, litige…" },
        INCIDENT: { label: "Incident", color: "blue", aide: "Perte, avarie, erreur d'acheminement, colis introuvable…" },
        ACCIDENT: { label: "Accident", color: "red", aide: "Dommage corporel ou matériel lors d'une opération (véhicule, manutention)…" }
    };
    /* délai de traitement en heures */
    var PRIORITES = {
        NORMALE: { label: "Normale", color: "blue", heures: 120, aide: "À traiter sous quelques jours (5 jours)." },
        PRIORITAIRE: { label: "Prioritaire", color: "orange", heures: 48, aide: "À traiter sous 48 heures." },
        URGENTE: { label: "Urgente", color: "red", heures: 24, aide: "À traiter dans la journée : client ou colis à risque." }
    };
    var STATUTS = {
        EN_ATTENTE: { label: "En attente", color: "orange" },
        EN_TRAITEMENT: { label: "En traitement", color: "blue" },
        TRAITEE: { label: "Traitée", color: "green" },
        ABANDONNEE: { label: "Abandonnée", color: "grey" }
    };
    var ORIGINES = {
        RECU: { label: "N° de reçu", icon: "fa-ticket", aide: "Colis, encaissement, service annexe (N° RT)" },
        FACTURE: { label: "N° de facture", icon: "fa-file-text-o", aide: "Client en compte, montant facturé" },
        SANS: { label: "Sans justificatif", icon: "fa-user-o", aide: "Client sans reçu, témoin, incident agence" }
    };
    var GESTES = ["Aucun", "Remboursement", "Avoir sur facture", "Réexpédition gratuite", "Bon de réduction"];
    /* Agents pouvant être assignés. TODO API : utilisateurs ayant le rôle ROLE_QUALITE / chefs d'agence */
    var AGENTS = ["Support KuTiWa", "M. NJOYA (chef d'agence Akwa)", "Mme EKOTTO (Bonanjo)", "M. TALLA (Bonabéri)", "Mme ABENA (Yaoundé Centrale)", "Service qualité", "Service commercial"];

    function echeance(date, priorite) {
        var p = PRIORITES[priorite] || PRIORITES.NORMALE, d = new Date(date.replace(" ", "T") + ":00");
        d.setHours(d.getHours() + p.heures);
        return U.isoDate(d) + " " + U.pad(d.getHours()) + ":" + U.pad(d.getMinutes());
    }
    function ouverte(r) { return r.statut === "EN_ATTENTE" || r.statut === "EN_TRAITEMENT"; }
    function enRetard(r) { return ouverte(r) && r.echeance && r.echeance < U.now(); }
    function badge(map, k) { var s = map[k] || { label: k || "—", color: "grey" }; return "<span class='cx-badge cx-badge-" + s.color + "'>" + U.esc(s.label) + "</span>"; }
    function numero(date) {
        var an = date.substr(0, 4), max = 0;
        $.each(CX.api.listSync("reclamations"), function (_, r) { var m = /^REC-(\d{4})-(\d+)$/.exec(r.numero || ""); if (m && m[1] === an) max = Math.max(max, parseInt(m[2], 10)); });
        return "REC-" + an + "-" + ("0000" + (max + 1)).slice(-4);
    }
    /* Délai de résolution en heures (traitées) */
    function delaiHeures(r) {
        if (!r.resolution || !r.resolution.date) return null;
        return Math.max(0, (new Date(r.resolution.date.replace(" ", "T")) - new Date(r.date.replace(" ", "T"))) / 3600000);
    }

    /* ---------------- Démonstration (une seule fois, meta « demoReclamations ») ---------------- */
    function assurerDemo() {
        if ($.grep(CX.api.listSync("meta"), function (x) { return x.cle === "demoReclamations"; }).length) return;
        var t = U.today(), exps = CX.api.listSync("expeditions"), facs = CX.api.listSync("factures"), clients = CX.api.listSync("clients");
        function d(j, h) { return U.addDays(t, j) + " " + h; }
        function exp(filtre, rang) { var l = $.grep(exps, filtre); return l[Math.min(rang || 0, l.length - 1)] || null; }
        function nomClient(id) { var c = $.grep(clients, function (x) { return x.id === id; })[0]; return c ? c.raisonSociale : ""; }
        var seq = 0;
        function rec(o) {
            seq++;
            var e = o.exp || null, f = o.fac || null, date = o.date;
            var r = {
                numero: "REC-" + date.substr(0, 4) + "-" + ("0000" + seq).slice(-4), date: date,
                origine: e ? "RECU" : f ? "FACTURE" : "SANS", reference: e ? e.nRt : f ? f.numero : "",
                expeditionId: e ? e.id : null, factureId: f ? f.id : null,
                clientId: e ? e.clientId || null : f ? f.clientId : null,
                clientNom: o.client || (e ? ((e.destinataireInfo || {}).nom || e.destinataire) : f ? nomClient(f.clientId) : ""),
                contact: o.contact || (e ? ((e.destinataireInfo || {}).tel || e.telDestinataire || "") : "699 00 11 22"),
                type: o.type, priorite: o.priorite, echeance: echeance(date, o.priorite), objet: o.objet, description: o.description,
                agenceId: o.agenceId || 1, assigneA: o.assigneA || "", statut: o.statut || "EN_ATTENTE", pieces: o.pieces || [],
                creePar: o.creePar || "M. NJOYA", dateCreation: date.substr(0, 10),
                fil: [{ date: date, user: o.creePar || "M. NJOYA", genre: "CREATION", texte: "Réclamation enregistrée" + (e ? " (reçu " + e.nRt + ")" : f ? " (facture " + f.numero + ")" : "") }]
            };
            $.each(o.fil || [], function (_, x) { r.fil.push({ date: x[0], user: x[1], genre: x[2], texte: x[3] }); });
            if (o.resolution) r.resolution = o.resolution;
            if (o.abandon) r.abandon = o.abandon;
            CX.api.save("reclamations", r);
        }
        var livreeDom = function (e) { return e.etape === "LIVREE" && e.livraison && e.livraison.mode === "DOMICILE"; };
        rec({ date: d(-9, "10:12"), exp: exp(livreeDom, 3), type: "RECLAMATION", priorite: "NORMALE", statut: "TRAITEE", assigneA: "Service qualité",
            objet: "Colis livré avec deux jours de retard", description: "Le destinataire indique avoir reçu le colis deux jours après la date annoncée au guichet. Il demande un geste commercial.",
            fil: [[d(-9, "11:00"), "Support KuTiWa", "AFFECTATION", "Assignée à Service qualité"], [d(-8, "09:30"), "Service qualité", "COMMENTAIRE", "Retard confirmé : véhicule immobilisé à Edéa (panne)."]],
            resolution: { date: d(-7, "15:20"), user: "Service qualité", solution: "Excuses présentées au client par téléphone ; bon de réduction de 20 % sur le prochain envoi.", geste: { type: "Bon de réduction", montant: 0 }, satisfaction: 4 } });
        rec({ date: d(-6, "14:40"), exp: exp(function (e) { return e.etape === "LIVREE"; }, 20), type: "INCIDENT", priorite: "URGENTE", statut: "EN_TRAITEMENT", assigneA: "M. NJOYA (chef d'agence Akwa)",
            objet: "Colis endommagé à la réception (carton écrasé)", description: "Carton écrasé, deux bouteilles de parfum cassées. Photos prises au comptoir. Le client réclame le remboursement de la valeur déclarée.",
            pieces: [{ nom: "photo-colis-ecrase.jpg", taille: 248000, type: "image/jpeg" }, { nom: "recu-client.pdf", taille: 82000, type: "application/pdf" }],
            fil: [[d(-6, "15:05"), "Support KuTiWa", "AFFECTATION", "Assignée à M. NJOYA (chef d'agence Akwa)"], [d(-5, "10:10"), "M. NJOYA (chef d'agence Akwa)", "STATUT", "Prise en charge"],
                [d(-4, "16:45"), "M. NJOYA (chef d'agence Akwa)", "COMMENTAIRE", "Déclaration transmise à l'assurance ; attente de l'expertise."]] });
        rec({ date: d(-4, "09:05"), fac: facs[2] || null, type: "RECLAMATION", priorite: "PRIORITAIRE", statut: "EN_ATTENTE",
            objet: "Contestation du montant facturé", description: "Le client conteste trois expéditions facturées qu'il dit ne pas avoir commandées. Il demande le détail des décharges signées.", creePar: "Service commercial" });
        rec({ date: d(-3, "17:30"), exp: exp(function (e) { return e.etape === "EN_INSTANCE"; }, 1), type: "PLAINTE", priorite: "NORMALE", statut: "EN_ATTENTE",
            objet: "Accueil désagréable au comptoir de retrait", description: "La cliente dit avoir attendu 40 minutes et avoir été mal reçue par l'agent de retrait ; elle souhaite une réponse écrite." });
        rec({ date: d(-2, "08:20"), client: "MBARGA Hervé", contact: "677 10 20 30", type: "ACCIDENT", priorite: "URGENTE", statut: "EN_TRAITEMENT", assigneA: "Service qualité", agenceId: 2,
            objet: "Véhicule de livraison a heurté un portail (Bonapriso)", description: "Le tricycle de livraison a endommagé le portail d'un riverain lors d'une manœuvre. Constat amiable rempli sur place, pas de blessé.",
            pieces: [{ nom: "constat-amiable.pdf", taille: 412000, type: "application/pdf" }],
            fil: [[d(-2, "08:40"), "Support KuTiWa", "AFFECTATION", "Assignée à Service qualité"], [d(-2, "11:00"), "Service qualité", "STATUT", "Prise en charge"]] });
        rec({ date: d(-1, "11:50"), exp: exp(function (e) { return e.etape === "EN_TRANSIT"; }, 2), type: "INCIDENT", priorite: "PRIORITAIRE", statut: "EN_ATTENTE", assigneA: "Mme ABENA (Yaoundé Centrale)",
            objet: "Colis introuvable au suivi depuis 3 jours", description: "Le suivi indique « en transit » depuis trois jours ; l'expéditeur demande où se trouve son colis.",
            fil: [[d(-1, "12:05"), "M. NJOYA (chef d'agence Akwa)", "AFFECTATION", "Assignée à Mme ABENA (Yaoundé Centrale)"]] });
        rec({ date: d(-1, "16:15"), client: "NANA Esther", contact: "655 77 88 99", type: "RECLAMATION", priorite: "NORMALE", statut: "ABANDONNEE",
            objet: "Demande de remboursement des frais de livraison", description: "La cliente demandait le remboursement des frais de livraison à domicile, finalement retirés en agence.",
            abandon: { date: d(0, "09:00"), user: "Support KuTiWa", motif: "Client injoignable après trois relances ; aucun justificatif fourni." } });
        rec({ date: d(0, "08:35"), exp: exp(function (e) { return e.etape === "EN_LIVRAISON"; }, 0), type: "RECLAMATION", priorite: "URGENTE", statut: "EN_ATTENTE",
            objet: "Livraison urgente : médicaments attendus ce matin", description: "Le destinataire attend des médicaments ce matin ; le livreur n'est pas encore passé. Demande de priorisation de la tournée." });
        CX.api.save("meta", { cle: "demoReclamations", version: 1, date: U.now(), numero: "META-REC-1" });
    }
    try { assurerDemo(); } catch (err) { if (window.console) console.warn("CX.rec.assurerDemo", err); }

    return {
        TYPES: TYPES, PRIORITES: PRIORITES, STATUTS: STATUTS, ORIGINES: ORIGINES, GESTES: GESTES, AGENTS: AGENTS,
        echeance: echeance, ouverte: ouverte, enRetard: enRetard, badge: badge, numero: numero, delaiHeures: delaiHeures, assurerDemo: assurerDemo
    };
})();

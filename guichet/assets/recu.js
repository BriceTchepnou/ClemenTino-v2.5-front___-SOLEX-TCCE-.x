/* =====================================================================
   ClemenTino 2.0 - Module GUICHET - reçu de transport A4 (CX.recu)
   ---------------------------------------------------------------------
   Portage jQuery / ES5 de la maquette « Reçu de transport A4, souche et
   client » (794 × 1123 px) : deux exemplaires (SOUCHE / CLIENT) séparés
   par « Découper ici », QR code du n° de LT, type d'expédition, trajet,
   remise, expéditeur / destinataire, livraison ou retrait, description,
   cadres arrivée / livraison, montants en chiffres et en lettres,
   signatures, mentions de la société.

     CX.recu.donnees(expedition)  -> objet d'affichage (libellés calculés)
     CX.recu.html(expedition)     -> HTML de la feuille <div class="gx-sheet">
     CX.recu.qr(texte)            -> { path, view } (QR code SVG, sans bibliothèque)

   Utilisé par guichet/expedition-form.html (après enregistrement) et
   guichet/recu.html (réimpression). Styles : guichet/assets/recu.css.

   >>> INTÉGRATION SYMFONY <<<
   Le même gabarit peut devenir un template Twig (guichet/recu.html.twig)
   pour un PDF serveur (KnpSnappyBundle) joint au message WhatsApp.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.recu = (function () {
    var U = CX.util, G = CX.guichet;

    /* Numéros des services affichés en bas du reçu.
       TODO API : paramètres société (GET /parametres/societe) */
    var SERVICES_TEL = [
        "Service qualité : 671 96 28 27",
        "Service logistique : 679 73 16 03",
        "Service commercial : 679 59 59 44"
    ];

    /* Icônes (tracés SVG de la maquette) */
    var ICONES = {
        URBAINE: "M5.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 16.5h7.5l2-6.5h-4M15 5h2.5l1.5 5M5.5 16.5l2-5h6",
        NATIONALE: "M2 6h12v10H2zM14 9h4l4 4v3h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
        REGIONALE: "M3 20h18M7 20V9l5-5 5 5v11M10 20v-5h4v5",
        INTERNATIONALE: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
        EXPEDITEUR: "M4 20V6a2 2 0 0 1 2-2h7l5 5v11M13 4v5h5M8 14h7M12 11l3 3-3 3",
        DESTINATAIRE: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM9.5 10h5M12 7.5v5",
        LIEU: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
        DRAPEAU: "M5 21V4M5 4h11l-2 4 2 4H5",
        TEL: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
        CISEAUX: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 20M8.1 16.1L20 4",
        FLECHE: "M9 6l6 6-6 6"
    };
    function svg(path, taille, couleur, epaisseur, extra) {
        return "<svg aria-hidden='true' width='" + taille + "' height='" + taille + "' viewBox='0 0 24 24' fill='none' stroke='" + (couleur || "currentColor") +
            "' stroke-width='" + (epaisseur || 1.8) + "' stroke-linecap='round' stroke-linejoin='round'" + (extra || "") + "><path d='" + path + "'></path></svg>";
    }

    /* =================================================================
       QR code (mode octet, correction M, versions 1 à 6, masque 0) :
       portage ES5 de la fonction qrMatrix de la maquette.
       ================================================================= */
    function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
    function falses(n) { var a = []; for (var i = 0; i < n; i++) a.push(false); return a; }
    function qr(texte) {
        var bytes = [], enc = unescape(encodeURIComponent(String(texte))), i, j;
        for (i = 0; i < enc.length; i++) bytes.push(enc.charCodeAt(i));
        /* [codewords de données, codewords de correction par bloc, tailles des blocs] */
        var T = [null, [16, 10, [16]], [28, 16, [28]], [44, 26, [44]], [64, 18, [32, 32]], [86, 24, [43, 43]], [108, 16, [27, 27, 27, 27]]];
        var ver = 1;
        while (ver < 6 && bytes.length + 2 > T[ver][0]) ver++;
        var cap = T[ver][0], bits = [];
        function put(v, n) { for (var k = n - 1; k >= 0; k--) bits.push((v >>> k) & 1); }
        put(4, 4); put(Math.min(bytes.length, cap - 2), 8);
        $.each(bytes.slice(0, cap - 2), function (_, b) { put(b, 8); });
        put(0, Math.min(4, cap * 8 - bits.length));
        while (bits.length % 8) bits.push(0);
        var data = [];
        for (i = 0; i < bits.length; i += 8) { var v = 0; for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }
        for (var p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xEC);
        function mul(x, y) { var z = 0; for (var k = 7; k >= 0; k--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> k) & 1) * x; } return z; }
        var deg = T[ver][1], div = zeros(deg), root = 1;
        div[deg - 1] = 1;
        for (i = 0; i < deg; i++) { for (j = 0; j < deg; j++) { div[j] = mul(div[j], root); if (j + 1 < deg) div[j] ^= div[j + 1]; } root = mul(root, 2); }
        var blocks = [], ecs = [], off = 0;
        $.each(T[ver][2], function (_, len) {
            var blk = data.slice(off, off + len), r = zeros(deg);
            off += len;
            $.each(blk, function (_, b) { var f = b ^ r.shift(); r.push(0); for (var k = 0; k < deg; k++) r[k] ^= mul(div[k], f); });
            blocks.push(blk); ecs.push(r);
        });
        var cw = [], maxLen = Math.max.apply(null, T[ver][2]);
        for (i = 0; i < maxLen; i++) $.each(blocks, function (_, b) { if (i < b.length) cw.push(b[i]); });
        for (i = 0; i < deg; i++) $.each(ecs, function (_, e) { cw.push(e[i]); });

        var n = ver * 4 + 17, m = [], fn = [], x, y;
        for (y = 0; y < n; y++) { m.push(falses(n)); fn.push(falses(n)); }
        function setF(cx, cy, d) { m[cy][cx] = d; fn[cy][cx] = true; }
        for (i = 0; i < n; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
        function finder(cx, cy) {
            for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
                var xx = cx + dx, yy = cy + dy;
                if (xx >= 0 && xx < n && yy >= 0 && yy < n) { var d = Math.max(Math.abs(dx), Math.abs(dy)); setF(xx, yy, d !== 2 && d !== 4); }
            }
        }
        finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
        if (ver > 1) {
            var a = n - 7;
            for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(a + ax, a + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
        }
        function fmt(mask) { var d = (0 << 3) | mask, r = d; for (var k = 0; k < 10; k++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; }
        function drawFmt(mask) {
            var b = fmt(mask), k;
            function g(q) { return ((b >>> q) & 1) === 1; }
            for (k = 0; k <= 5; k++) setF(8, k, g(k));
            setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
            for (k = 9; k < 15; k++) setF(14 - k, 8, g(k));
            for (k = 0; k < 8; k++) setF(n - 1 - k, 8, g(k));
            for (k = 8; k < 15; k++) setF(8, n - 15 + k, g(k));
            setF(8, n - 8, true);
        }
        drawFmt(0);
        var bit = 0;
        for (var right = n - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var vv = 0; vv < n; vv++) {
                for (j = 0; j < 2; j++) {
                    x = right - j;
                    var up = ((right + 1) & 2) === 0;
                    y = up ? n - 1 - vv : vv;
                    if (!fn[y][x] && bit < cw.length * 8) { m[y][x] = ((cw[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1; bit++; }
                }
            }
        }
        for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (!fn[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
        drawFmt(0);
        var path = "";
        for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) path += "M" + (x + 2) + " " + (y + 2) + "h1v1h-1z";
        return { size: n, path: path, view: "0 0 " + (n + 4) + " " + (n + 4) };
    }

    /* =================================================================
       Données d'affichage (équivalent de l'objet « recu » de la maquette)
       ================================================================= */
    function donnees(e0) {
        var e = G.normaliser(e0), L = e.livraison, S = G.SERVICES[e.service] || G.SERVICES.NATIONALE;
        var abroad = e.service === "REGIONALE" || e.service === "INTERNATIONALE";
        var domicile = L.mode === "DOMICILE";
        var zone = $.grep(CX.REF.ZONES_LIVRAISON, function (z) { return z.code === L.zone; })[0];
        var zoneLabel = zone ? zone.nom : (L.zone || "");
        var dstVille = abroad ? String(e.villeEtranger || e.paysDest || "À PRÉCISER").toUpperCase() : G.villeAff(e.villeDest);
        var dstLieu = abroad ? (e.paysDest || "Pays à préciser") : (domicile ? "Quartier " + (L.quartier || "—") : "Bureau " + G.titre(e.bureauDest));
        var telAppel = G.tel(L.telAppel).length === 9 ? L.telAppel : e.destinataireInfo.tel;
        var nb = 0, valeur = 0, taxable = 0, natures = [], descs = [];
        $.each(e.colis, function (_, c) {
            var k = Math.max(1, parseInt(c.nombre, 10) || 1);
            nb += k; valeur += U.num(c.valeur); taxable += (U.num(c.poidsTaxable) || U.num(c.poids)) * k;
            if ($.inArray(c.nature || "Colis", natures) < 0) natures.push(c.nature || "Colis");
            if ($.trim(c.description || "")) descs.push($.trim(c.description));
        });
        taxable = U.num(e.poids) || Math.round(taxable * 10) / 10;
        var c0 = e.colis[0] || {};
        var dims = e.colis.length === 1 && U.num(c0.L) && U.num(c0.l) && U.num(c0.H) ? c0.L + " x " + c0.l + " x " + c0.H + " cm, " : "";
        var lettres = U.enLettres(e.montants.total);
        var P = e.paiement || {};
        return {
            numero: e.nRt, nRtMan: e.nRtMan || "", annulee: e.statut === "ANNULEE",
            date: U.toFr(e.dateExp), heure: e.heure || "—",
            service: S.full, serviceId: e.service,
            remise: domicile ? "À DOMICILE" : "AU BUREAU",
            depVille: G.villeAff(e.villeDep), depLieu: "Bureau " + G.titre(e.bureauDep),
            dstVille: dstVille, dstLieu: dstLieu,
            expNom: e.expediteurInfo.nom || "—", expTel: G.telAff(e.expediteurInfo.tel),
            dstNom: e.destinataireInfo.nom || "—", dstTel: G.telAff(e.destinataireInfo.tel),
            livTitre: domicile ? (e.service === "URBAINE" ? "LIVRAISON URBAINE" : "LIVRAISON À DOMICILE") + (zoneLabel ? " · " + zoneLabel.toUpperCase() : "") : "RETRAIT AU BUREAU",
            livNote: domicile ? "Le livreur appelle avant de partir" : "Pièce d'identité exigée au retrait",
            c1l: domicile ? "Quartier" : "Bureau de retrait", c1v: domicile ? (L.quartier || "—") : G.titre(e.bureauDest) || "—",
            c2l: domicile ? "Point de rencontre" : "Ville", c2v: domicile ? (L.repere || "—") : dstVille,
            c3l: domicile ? "Personne à appeler" : "Destinataire à prévenir", c3v: G.telAff(telAppel),
            nbColis: nb + " colis", nature: natures.join(", "),
            desc: descs.join(", ") || e.contenu || "Sans description",
            mesures: dims + G.kg(taxable) + (taxable > 1 ? " taxables" : " taxable"),
            valeur: U.fmt(valeur) + " Fcfa",
            transport: U.fmt(e.montants.transport), emballage: U.fmt(e.montants.emballage),
            livraison: U.fmt(e.montants.livraison), autres: U.fmt(e.montants.autres), total: U.fmt(e.montants.total),
            lettres: lettres.charAt(0).toUpperCase() + lettres.substr(1),
            guichetier: e.guichetier || "—",
            paiement: P.statut === "EN_COMPTE" ? "En compte" + (e.client ? " · " + (e.client.sigle || e.client.code || "") : "")
                : (P.mode || "") + (P.statut === "PAYE" ? " · payé" : "")
        };
    }

    /* Un exemplaire (SOUCHE ou CLIENT) */
    function copie(d, k, q) {
        var esc = U.esc;
        var icon = ICONES[d.serviceId] || ICONES.NATIONALE;
        return (k.cut ? "<div class='gx-r-cut' aria-hidden='true'><i></i>" + svg(ICONES.CISEAUX, 14) + "<span>Découper ici</span><i></i></div>" : "") +
            "<div class='gx-r-copie'>" +
            /* En-tête */
            "<div class='gx-r-head'>" + logo() +
            "<div class='gx-r-id'><div class='gx-r-titre'><span>REÇU DE TRANSPORT</span><span class='gx-r-copie-tag'>" + k.copie + "</span></div>" +
            "<span class='gx-r-numero gx-r-mono'>N° " + esc(d.numero) + "</span>" +
            "<div class='gx-r-meta'><span>Date : <strong>" + esc(d.date) + "</strong></span><span>Heure : <strong>" + esc(d.heure) + "</strong></span>" +
            "<span class='gx-r-ell'>Destination : <strong>" + esc(d.dstVille) + "</strong></span>" +
            (d.nRtMan ? "<span>LT n° <strong class='gx-r-mono'>" + esc(d.nRtMan) + "</strong></span>" : "") + "</div></div>" +
            "<div class='gx-r-qr'><svg role='img' aria-label='QR code du reçu " + esc(d.numero) + "' viewBox='" + q.view + "' shape-rendering='crispEdges'><path d='" + q.path + "' fill='#0E1B2E'></path></svg>" +
            "<span>Scanner pour suivre</span></div></div>" +
            /* Bande type / trajet / remise */
            "<div class='gx-r-bande'><div class='gx-r-type'>" + svg(icon, 28, null, 1.7) +
            "<div style='min-width:0'><small>TYPE D'EXPÉDITION</small><b class='gx-r-cond'>" + esc(d.service) + "</b></div></div>" +
            "<div class='gx-r-trajet'><div><b class='gx-r-cond gx-r-ell'>" + esc(d.depVille) + "</b><span class='gx-r-ell'>" + esc(d.depLieu) + "</span></div>" +
            "<div class='gx-r-fleche' aria-hidden='true'><i></i>" + svg(ICONES.FLECHE, 16, null, 2.4) + "</div>" +
            "<div><b class='gx-r-cond gx-r-ell'>" + esc(d.dstVille) + "</b><span class='gx-r-ell'>" + esc(d.dstLieu) + "</span></div></div>" +
            "<div class='gx-r-remise'><small>REMISE</small><b>" + esc(d.remise) + "</b></div></div>" +
            /* Expéditeur / destinataire */
            "<div class='gx-r-parties'>" +
            "<div class='gx-r-partie gx-r-exp'>" + svg(ICONES.EXPEDITEUR, 92, "#5B3FA0", 1.2, " class='gx-r-filigrane'") +
            "<span class='gx-r-lbl'>EXPÉDITEUR</span><span class='gx-r-nom gx-r-ell'>" + esc(d.expNom) + "</span>" +
            "<span>Tél : <strong class='gx-r-mono'>" + esc(d.expTel) + "</strong></span><span class='gx-r-ell'>" + esc(d.depVille) + " · " + esc(d.depLieu) + "</span></div>" +
            "<div class='gx-r-partie gx-r-dst'>" + svg(ICONES.DESTINATAIRE, 92, "#4D5B73", 1.2, " class='gx-r-filigrane'") +
            "<span class='gx-r-lbl'>DESTINATAIRE</span><span class='gx-r-nom gx-r-ell'>" + esc(d.dstNom) + "</span>" +
            "<span>Tél : <strong class='gx-r-mono'>" + esc(d.dstTel) + "</strong></span><span class='gx-r-ell'>" + esc(d.dstVille) + " · " + esc(d.dstLieu) + "</span></div></div>" +
            /* Livraison / retrait */
            "<div class='gx-r-liv'><div class='gx-r-liv-titre'><span>" + esc(d.livTitre) + "</span><span>" + esc(d.livNote) + "</span></div>" +
            "<div class='gx-r-liv-grid'>" +
            "<div>" + svg(ICONES.LIEU, 20, "#1F7A33") + "<div><span class='gx-r-muted'>" + esc(d.c1l) + "</span><b class='gx-r-ell'>" + esc(d.c1v) + "</b></div></div>" +
            "<div>" + svg(ICONES.DRAPEAU, 20, "#1F7A33") + "<div><span class='gx-r-muted'>" + esc(d.c2l) + "</span><b class='gx-r-ell'>" + esc(d.c2v) + "</b></div></div>" +
            "<div>" + svg(ICONES.TEL, 20, "#1F7A33") + "<div><span class='gx-r-muted'>" + esc(d.c3l) + "</span><b class='gx-r-ell gx-r-mono'>" + esc(d.c3v) + "</b></div></div>" +
            "</div></div>" +
            /* Description / arrivée / livraison */
            "<div class='gx-r-infos'>" +
            "<div><span class='gx-r-lbl'>DESCRIPTION DE L'EXPÉDITION</span><span class='gx-r-ell' style='font-weight:600'>" + esc(d.nbColis) + " · " + esc(d.nature) + "</span>" +
            "<span class='gx-r-ell'>" + esc(d.desc) + "</span><span class='gx-r-ell'>" + esc(d.mesures) + "</span>" +
            "<span class='gx-r-ell'>Valeur marchande : <strong>" + esc(d.valeur) + "</strong></span></div>" +
            "<div><span class='gx-r-lbl'>INFORMATION ARRIVÉE</span><div class='gx-r-pts'><span>Date</span><i></i><span>Heure</span><i></i></div>" +
            "<div class='gx-r-pts'><span>Agent de réception</span><i></i></div><span class='gx-r-muted'>Signature et cachet</span></div>" +
            "<div><span class='gx-r-lbl'>INFORMATION LIVRAISON</span><div class='gx-r-pts'><span>Remis le</span><i></i><span>Heure</span><i></i></div>" +
            "<div class='gx-r-pts'><span>Déchargé par</span><i></i></div><span class='gx-r-muted'>Signature et cachet</span></div></div>" +
            /* Montants */
            "<div class='gx-r-montants'><div class='gx-r-tab'>" +
            "<div class='gx-r-th'><span></span><span>Transport (1)</span><span>Emballage (2)</span><span>Livraison (3)</span><span>Autres (4)</span></div>" +
            "<div class='gx-r-chiffres'><span>En chiffres</span><span>" + d.transport + " Fcfa</span><span>" + d.emballage + " Fcfa</span><span>" + d.livraison + " Fcfa</span><span>" + d.autres + " Fcfa</span></div>" +
            "<div class='gx-r-lettres'><span>En lettres</span><span class='gx-r-ell'>" + esc(d.lettres) + " francs CFA</span></div></div>" +
            "<div class='gx-r-total'><small>MONTANT TOTAL</small><b class='gx-r-cond'>" + d.total + " <span>Fcfa</span></b></div></div>" +
            /* Signatures */
            "<div class='gx-r-sign'><div class='gx-r-services'>" + $.map(SERVICES_TEL, function (s) { return "<span>" + esc(s) + "</span>"; }).join("") + "</div>" +
            "<div><b>Signature expéditeur</b></div>" +
            "<div><b>Guichetier(e)</b><span class='gx-r-ell'>" + esc(d.guichetier) + "</span></div>" +
            "<div><b>Caissier(e)</b><span class='gx-r-ell gx-r-muted'>" + esc(d.paiement) + "</span></div></div>" +
            "<div class='gx-r-pied'>" + piedSociete() + "</div>" +
            "</div>";
    }

    function logoSrc() {
        var l = CX.CONFIG.SOCIETE.logo || "";
        if (!l) return "";
        return /^(https?:|data:|\/)/.test(l) ? l : (window.CX_BASE || "") + l;
    }
    function logo() {
        var S = CX.CONFIG.SOCIETE, src = logoSrc();
        return "<div class='gx-r-logo'>" + (src ? "<img src='" + U.esc(src) + "' alt='" + U.esc(S.nom) + "'>" : "") +
            "<div style='min-width:0'><b class='gx-r-ell'>" + U.esc(S.nom) + "</b><small>" + U.esc(S.slogan || "") + "</small></div></div>";
    }
    function piedSociete() {
        var S = CX.CONFIG.SOCIETE;
        return $.map([S.nom + (S.adresse ? ", " + S.adresse : ""), S.rccm ? "RCCM " + S.rccm : "", S.niu ? "NIU " + S.niu : "", S.tel ? "Tél. " + S.tel : "", S.email], function (x) {
            return x ? U.esc(x) : null;
        }).join(" · ");
    }

    function html(e) {
        var d = donnees(e), q = qr(d.numero);
        return "<div class='gx-sheet' data-numero='" + U.esc(d.numero) + "'>" +
            (d.annulee ? "<div class='gx-r-annule'>ANNULÉE</div>" : "") +
            copie(d, { copie: "SOUCHE", cut: false }, q) + copie(d, { copie: "CLIENT", cut: true }, q) + "</div>";
    }

    /* PDF A4 sans marge (la feuille occupe toute la page) avec CX.pdf.
       CX.pdf applique des marges haut / bas prévues pour les factures : on
       les neutralise le temps de la génération du reçu. */
    function telechargerPdf(selecteur, nom, bouton) {
        var avant = CX.pdf.MARGES_MM;
        CX.pdf.MARGES_MM = [0, 0, 0, 0];
        return CX.pdf.telecharger(selecteur, { nom: nom, bouton: bouton }).always(function () { CX.pdf.MARGES_MM = avant; });
    }

    return { donnees: donnees, html: html, qr: qr, telechargerPdf: telechargerPdf, SERVICES_TEL: SERVICES_TEL };
})();

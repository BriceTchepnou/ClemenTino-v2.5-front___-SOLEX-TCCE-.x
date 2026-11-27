/* =====================================================================
   Commercial · Exports de fichiers (CSV « Excel », texte comptable)
   ---------------------------------------------------------------------
   Partagé par facture.html, journal-vente.html et commissions.html.
   Expose CX.exporter :
     CX.exporter.csv(lignes, sep)          tableau de tableaux -> texte CSV
     CX.exporter.telecharger(nom, texte, { mime, bom, ansi })
                                           propose le fichier au navigateur
     CX.exporter.ansi(texte)               encodage Windows-1252 (Sage, Excel ancien)
   Montants : entiers (francs CFA), sans séparateur de milliers, pour
   qu'Excel les reconnaisse comme nombres.
   >>> INTÉGRATION SYMFONY <<<
   Pour de gros volumes, générer le fichier côté serveur (StreamedResponse
   + PhpSpreadsheet pour un vrai .xlsx) ; ce module suffit pour l'écran.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.exporter = (function () {

    /* Une cellule : guillemets si elle contient le séparateur, un guillemet ou un saut de ligne */
    function cellule(v, sep) {
        var s = v == null ? "" : String(v);
        if (s.indexOf(sep) >= 0 || /["\r\n]/.test(s)) s = "\"" + s.replace(/"/g, "\"\"") + "\"";
        return s;
    }
    function csv(lignes, sep) {
        sep = sep || ";";
        return $.map(lignes, function (l) {
            return [$.map(l, function (v) { return cellule(v, sep); }).join(sep)];
        }).join("\r\n") + "\r\n";
    }

    /* Windows-1252 : Latin-1 + quelques caractères typographiques (€, ’, «, …) */
    var CP1252 = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
        0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
        0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
        0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
    };
    function ansi(texte) {
        var s = String(texte || ""), out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c === 0x202F || c === 0x00A0) c = 0x20;              // espaces insécables -> espace
            out[i] = c < 256 ? c : (CP1252[c] || 0x3F);               // sinon « ? »
        }
        return out;
    }

    function telecharger(nom, texte, opts) {
        opts = opts || {};
        var mime = opts.mime || "text/csv", contenu;
        if (opts.ansi) { contenu = [ansi(texte)]; mime += ";charset=windows-1252"; }
        else { contenu = (opts.bom ? ["﻿"] : []).concat([texte]); mime += ";charset=utf-8"; }
        var blob = new Blob(contenu, { type: mime });
        if (window.navigator && window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, nom); return blob; }
        var url = URL.createObjectURL(blob);
        var a = $("<a style='display:none'></a>").attr({ href: url, download: nom }).appendTo("body");
        a[0].click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
        return blob;
    }

    return { csv: csv, ansi: ansi, telecharger: telecharger };
})();

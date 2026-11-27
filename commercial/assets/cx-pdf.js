/* =====================================================================
   ClemenTino 2.0 - Module COMMERCIAL - export PDF des documents A4
   ---------------------------------------------------------------------
   « Télécharger en PDF » produit directement un fichier PDF A4, sans
   passer par la boîte d'impression du navigateur (dont les réglages -
   format Letter, marges, « graphiques d'arrière-plan » décoché, zoom -
   rognaient la page et faisaient disparaître les fonds et le logo).

   Principe : la feuille (.fx-sheet / .cd-sheet) est clonée hors écran à
   la largeur exacte d'une page A4 (794 px = 210 mm à 96 dpi), rendue en
   image haute définition (html2canvas, échelle 2) puis découpée en pages
   A4 (jsPDF). Bibliothèque : html2pdf.js, chargée à la demande.

   >>> INTÉGRATION SYMFONY <<<
   Pour un PDF joint aux e-mails (texte sélectionnable, archivage), générer
   le PDF côté serveur (KnpSnappyBundle / wkhtmltopdf) avec les mêmes
   gabarits ; ce module reste utile pour le téléchargement immédiat.
   ===================================================================== */

var CX = window.CX || {};
window.CX = CX;

CX.pdf = {
    LIB: "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js",
    PAGE_PX: 794,            // largeur A4 en pixels CSS
    MARGES_MM: [10, 0, 12, 0], // haut, droite, bas, gauche (les marges latérales sont dans la feuille)

    _lib: function () {
        if (window.html2pdf) return $.Deferred().resolve().promise();
        return $.ajax({ url: CX.pdf.LIB, dataType: "script", cache: true });
    },

    /* Nom de fichier sûr : "Facture FAC-2026-0001 - CLIENT.pdf" */
    nomFichier: function (s) {
        return String(s || "document").replace(/[\\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() + ".pdf";
    },

    /* sheet : sélecteur ou élément de la feuille A4 ; options : { nom, bouton } */
    telecharger: function (sheet, options) {
        options = options || {};
        var $btn = options.bouton ? $(options.bouton) : $();
        if ($btn.length) CX.util.busy($btn, true);

        return CX.pdf._lib().then(function () {
            var $src = $(sheet).first();
            /* Scène hors écran à la largeur A4 : la mise en page ne dépend plus de la fenêtre */
            var $stage = $("<div class='cx-pdf-stage'></div>").css({
                position: "fixed", left: "-12000px", top: 0, width: CX.pdf.PAGE_PX + "px", background: "#fff", zIndex: -1
            }).appendTo("body");
            var $clone = $src.clone(true).addClass("cx-pdf-mode").appendTo($stage);
            $clone.find(".cx-no-print, #fx-alertes").remove();

            var opt = {
                margin: CX.pdf.MARGES_MM,
                filename: CX.pdf.nomFichier(options.nom || document.title),
                image: { type: "jpeg", quality: 0.96 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: CX.pdf.PAGE_PX, scrollX: 0, scrollY: 0, logging: false },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
                /* pas de coupure au milieu d'une ligne de tableau ou d'un bloc de totaux */
                pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".cx-pdf-avoid", ".fx-bas", ".fx-signature", ".fx-pied", ".cd-avoid"] }
            };
            /* Attendre le chargement des images (logo) du clone */
            var imgs = $clone.find("img").get();
            var waits = $.map(imgs, function (img) {
                var d = $.Deferred();
                if (img.complete) d.resolve(); else { img.onload = img.onerror = function () { d.resolve(); }; }
                return d.promise();
            });
            return $.when.apply($, waits).then(function () {
                var p = $.Deferred();
                window.html2pdf().set(opt).from($clone[0]).save()
                    .then(function () { p.resolve(); }, function (e) { p.reject(e); });
                return p.promise();
            }).always(function () { $stage.remove(); });
        }).done(function () {
            CX.util.toast("PDF téléchargé : <b>" + CX.util.esc(CX.pdf.nomFichier(options.nom || document.title)) + "</b>");
        }).fail(function () {
            CX.util.toast("Le PDF n'a pas pu être généré (bibliothèque indisponible hors ligne ?). Utilisez « Imprimer » puis « Enregistrer au format PDF ».", "error");
        }).always(function () {
            if ($btn.length) CX.util.busy($btn, false);
        });
    }
};

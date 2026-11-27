# Module COMMERCIAL – maquettes « New IHM » (ClemenTino 2.0)

Maquettes HTML + jQuery 1.12 + Bootstrap 3.4 + Font Awesome 4.7 + Select2 4.0.13.
Pas de build, code ES5 non minifié et commenté, prêt à être découpé en templates Twig
dans l'application Symfony 3 existante.

## Pages

| Rubrique | Page | Rôle |
|---|---|---|
| Tableau de bord | `index.html` | Indicateurs (à facturer, facturé du mois, encours, échu, cotations, clients), expéditions à facturer par client, factures échues, cotations par étape, meilleurs clients. |
| Comptes clients | `clients-liste.html` | Liste filtrable (type, statut, ville, agence, « en compte uniquement »), export CSV, actions (fiche, modifier, cotation, facturer, carnets, suspendre, supprimer). |
| | `client-form.html[?id=]` | Création / modification : 1 Entreprise, 2 Contacts (principal, second, DG), 3 Type de compte & conditions (comptant / en compte / forfait, délai, plafond, remise, tarification automatique par agence), 4 Fiche client PDF. Récap + complétude à droite. |
| | `client-fiche.html?id=` | Vue 360° : indicateurs, informations, contacts, expéditions, factures, cotations, historique. |
| Cotations | `cotations-liste.html[#nouvelle]` | Onglets par statut, filtres, actions selon le circuit, modale « Nouvelle cotation » (3 types). |
| | `cotation-form.html?type=EXPEDITION\|FRET\|TARIFAIRE[&id=][&client=]` | Formulaire en cartes numérotées + récapitulatif sombre (calcul HT / TVA / TTC). |
| | `cotation-document.html?id=` | Devis A4 imprimable (Bon pour accord, montant en lettres, filigrane). |
| Facturation | `facture-emettre.html[?client=]` | Expéditions « À facturer » / « À régulariser » (saisie du montant, preuve de livraison reçue), sélection, récap, création de la facture. |
| | `factures-suivi.html[?relance=]` | Indicateurs, onglets par statut (dont « En retard »), paiements, envoi, relance, annulation. |
| | `facture.html?id=` | Facture A4 imprimable (détail des expéditions avec n° de feuille de carnet, TVA 19,25 %, arrêté en lettres, banque, cachet). |
| Carnets de LT | `../maquettes-carnets/` | Déjà livrés ; ils utilisent maintenant le même en-tête / méga-menu. |

Circuit d'une cotation : `ENREGISTREE → SOUMISE (responsable) → VALIDEE (interne) → EN_ATTENTE (envoyée au client) → ACCEPTEE | REJETEE`, `ANNULEE` possible avant acceptation.

Circuit de facturation : expédition livrée + feuille de LT revenue (preuve de livraison) + montant renseigné → « À facturer » → facture (1 facture = 1 client) → Émise → Envoyée → Partiellement payée → Payée.

## Fichiers communs (`assets/`)

| Fichier | Contenu |
|---|---|
| `cx.css` | Charte : couleurs (variables CSS), en-tête + méga-menu, cartes numérotées, choix segmentés, pastilles, interrupteurs, boutons, badges, tableaux, onglets, panneau récapitulatif, modales, toasts, impression. Toutes les classes sont préfixées `cx-` ; les surcharges Bootstrap sont confinées sous `body.cx-app`. |
| `cx-core.js` | `CX.CONFIG` (société, TVA, devise, utilisateur), `CX.util` (formats, dates, montants en lettres, toasts, confirm, lecture/remplissage de formulaires, erreurs), `CX.DataTable` (tri, recherche, pagination, sélection, totaux). |
| `cx-data.js` | Référentiels `CX.REF`, tarif indicatif `CX.tarif`, persistance simulée `CX.api` (localStorage) + jeu de données de démo. |
| `cx-shell.js` | En-tête, méga-menu Commercial et sous-navigation (arborescence unique dans `CX.MENU_COMMERCIAL`). |
| `pages/*.js|css` | Code propre à chaque écran. `cotations-commun.js` (`CX.cot`) et `facturation.js` (`CX.fac`) sont partagés au sein de leur rubrique. |

## Intégration dans Symfony

1. **Layout** : charger `cx.css` et `cx-core.js` dans le layout du module Commercial et ajouter `class="cx-app"` au `<body>` des pages concernées (les autres écrans ne sont pas affectés).
2. **Menu** : reprendre le bloc Commercial généré par `CX.shell.megaMenuHtml()` dans le template du menu existant, en remplaçant les `href` par des `path('…')`. Ne pas reprendre l'en-tête simulé ni le pied de page.
3. **Données** : remplacer le corps de chaque méthode de `CX.api` par un `$.ajax` (les pages consomment déjà des promesses jQuery). Chaque appel est repéré dans les pages par `// TODO API : <route proposée>`. Injecter les référentiels par Twig : `<script>CX.REF.AGENCES = {{ agences|json_encode|raw }};</script>`, idem `CX.CONFIG.USER` et `CX.CONFIG.SOCIETE`.
4. **Pseudo-SPA** : chaque page peut devenir un `<div>` masqué/affiché ; le JS de chaque page est autonome (un `$(function(){…})`), il suffit de l'appeler à l'affichage du `<div>`.
5. **Numérotation** : les numéros (CLI-, COT-, FAC-) sont attribués côté serveur. Pour les factures, attribuer le numéro à l'émission (pas au brouillon) pour garder une séquence sans trou.
6. **PDF** : les documents sont imprimables (`@page A4`) ; pour un envoi par e-mail avec pièce jointe, générer le PDF côté serveur (wkhtmltopdf / KnpSnappyBundle) à partir des mêmes templates.

## Tester en local

    npx http-server . -p 8765

puis ouvrir http://localhost:8765/commercial/index.html. Les données de démo sont dans le
localStorage (lien « Réinitialiser les données » en bas du tableau de bord).

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
| | `client-import.html` | Import en masse depuis Excel (.xlsx/.xls) ou CSV : 1 fichier (feuille, ligne d'en-têtes), 2 correspondance automatique des colonnes (modifiable), 3 aperçu contrôlé ligne par ligne (erreurs, avertissements, doublons base et fichier, correction des cellules en place, exclusion), options doublons (ignorer / mettre à jour / créer), 4 import avec progression et rapport CSV. Modèle Excel téléchargeable. Lecture : SheetJS (en production : PhpSpreadsheet côté serveur). |
| | `client-fiche.html?id=` | Vue 360° : indicateurs, informations, contacts, expéditions, factures, cotations, historique. |
| Cotations | `cotations-liste.html[#nouvelle]` | Onglets par statut, filtres, actions selon le circuit, modale « Nouvelle cotation » (3 types). |
| | `cotation-form.html?type=EXPEDITION\|FRET\|TARIFAIRE[&id=][&client=]` | Formulaire en cartes numérotées + récapitulatif sombre (calcul HT / TVA / TTC). |
| | `cotation-document.html?id=` | Devis A4 imprimable (Bon pour accord, montant en lettres, filigrane). |
| Facturation | `facture-emettre.html[?client=]` | Expéditions « À facturer » / « À régulariser » (saisie du montant, preuve de livraison reçue), sélection, récap, création de la facture. |
| | `factures-suivi.html[?relance=]` | Indicateurs, onglets par statut (dont « En retard »), paiements, envoi, relance, annulation. |
| | `facture.html?id=` | Facture A4 imprimable (détail des expéditions avec n° de feuille de carnet, TVA 19,25 %, arrêté en lettres, banque, cachet). |
| Tarifaires | `tarifs-liste.html`, `tarif-form.html`, `contrat-form.html` | Grilles tarifaires, groupes de clients, contrats clients : voir la section « Tarifaires » ci-dessous. |
| Carnets de LT | `../maquettes-carnets/` | Même en-tête / méga-menu et mêmes clients que le module (si ses scripts sont chargés). `?client=` filtre la liste ; « Retrouver une feuille » affiche l'expédition et la facture liées ; chaque expédition saisie avec un n° de feuille fait avancer le « dernier n° utilisé ». |

Circuit d'une cotation : `ENREGISTREE → SOUMISE (responsable) → VALIDEE (interne) → EN_ATTENTE (envoyée au client) → ACCEPTEE | REJETEE`, `ANNULEE` possible avant acceptation.

Circuit de facturation : expédition livrée + feuille de LT revenue (preuve de livraison) + montant renseigné → « À facturer » → facture (1 facture = 1 client) → Émise → Envoyée → Partiellement payée → Payée.

## Fichiers communs (`assets/`)

| Fichier | Contenu |
|---|---|
| `cx.css` | Charte : couleurs (variables CSS), en-tête + méga-menu, cartes numérotées, choix segmentés, pastilles, interrupteurs, boutons, badges, tableaux, onglets, panneau récapitulatif, modales, toasts, impression. Toutes les classes sont préfixées `cx-` ; les surcharges Bootstrap sont confinées sous `body.cx-app`. |
| `cx-core.js` | `CX.CONFIG` (société, TVA, devise, utilisateur), `CX.util` (formats, dates, montants en lettres, toasts, confirm, lecture/remplissage de formulaires, erreurs), `CX.DataTable` (tri, recherche, pagination, sélection, totaux). |
| `cx-data.js` | Référentiels `CX.REF`, tarif indicatif `CX.tarif`, persistance simulée `CX.api` (localStorage) + jeu de données de démo (dont grilles, groupes, contrats). |
| `cx-tarifs.js` | Moteur de tarification `CX.tarifs` (résolution de la grille d'un client, calcul détaillé, libellés). Voir « Tarifaires ». |
| `cx-shell.js` | En-tête, méga-menu Commercial et sous-navigation (arborescence unique dans `CX.MENU_COMMERCIAL`). |
| `pages/*.js|css` | Code propre à chaque écran. `cotations-commun.js` (`CX.cot`) et `facturation.js` (`CX.fac`) sont partagés au sein de leur rubrique. |

## Circuits de bout en bout

- **Cotation → expédition → facture** : une cotation d'expédition ou de mise à disposition acceptée est convertie en expédition (en transit) ; après livraison et retour de la décharge, elle apparaît dans « À facturer ».
- **Cotation tarifaire → grille client** : une cotation tarifaire acceptée devient une grille CLIENT active (une règle « tranches de poids » par trajet, repli sur la grille standard) affectée au client et, s'il a un contrat en vigueur, rattachée à ce contrat. Elle s'applique ensuite à toutes ses saisies (cotations, régularisation des montants en facturation).
- **Feuille de carnet → expédition → facture** : voir Carnets de LT.

## Documents PDF (facture, devis)

« Télécharger en PDF » génère directement le fichier A4 (`assets/cx-pdf.js`, html2pdf.js chargé à la demande) : la feuille est rendue à la largeur exacte d'une page A4, indépendamment de la fenêtre et des réglages de la boîte d'impression (format, marges, « graphiques d'arrière-plan »), avec le logo `CX.CONFIG.SOCIETE.logo` (démo : `assets/img/logo-societe.svg`, à remplacer par le logo officiel, servi depuis le même domaine). « Imprimer » reste disponible (styles d'impression A4 renforcés). En production, prévoir aussi un PDF serveur (KnpSnappyBundle / wkhtmltopdf) pour l'envoi par e-mail en pièce jointe.

## Intégration dans Symfony

1. **Layout** : charger `cx.css` et `cx-core.js` dans le layout du module Commercial et ajouter `class="cx-app"` au `<body>` des pages concernées (les autres écrans ne sont pas affectés).
2. **Menu** : reprendre le bloc Commercial généré par `CX.shell.megaMenuHtml()` dans le template du menu existant, en remplaçant les `href` par des `path('…')`. Ne pas reprendre l'en-tête simulé ni le pied de page.
3. **Données** : remplacer le corps de chaque méthode de `CX.api` par un `$.ajax` (les pages consomment déjà des promesses jQuery). Chaque appel est repéré dans les pages par `// TODO API : <route proposée>`. Injecter les référentiels par Twig : `<script>CX.REF.AGENCES = {{ agences|json_encode|raw }};</script>`, idem `CX.CONFIG.USER` et `CX.CONFIG.SOCIETE`.
4. **Pseudo-SPA** : chaque page peut devenir un `<div>` masqué/affiché ; le JS de chaque page est autonome (un `$(function(){…})`), il suffit de l'appeler à l'affichage du `<div>`.
5. **Numérotation** : les numéros (CLI-, COT-, FAC-) sont attribués côté serveur. Pour les factures, attribuer le numéro à l'émission (pas au brouillon) pour garder une séquence sans trou.
6. **PDF** : les documents sont imprimables (`@page A4`) ; pour un envoi par e-mail avec pièce jointe, générer le PDF côté serveur (wkhtmltopdf / KnpSnappyBundle) à partir des mêmes templates.

## Tarifaires (grilles, groupes de clients, contrats)

Besoin couvert : créer des grilles tarifaires et des tarifs (trajets, documents, natures, colis, poids,
plusieurs modèles de calcul), affecter une grille à un client ou à un groupe de clients, charger le
contrat d'un client et lui attacher sa grille. À chaque saisie pour ce client, sa grille est appliquée
et affichée (cotation, fiche client, formulaire client).

| Page | Rôle |
|---|---|
| `tarifs-liste.html[#grilles\|#groupes\|#contrats]` | Indicateurs (grilles en vigueur, grille standard, clients à tarif spécifique, contrats, échéances à 30 j) ; onglets Grilles (modifier, simuler, dupliquer, affecter, activer / archiver, supprimer si non utilisée), Groupes de clients (modale : nom, clients en Select2 multiple, grille du groupe), Contrats (statut calculé, échéance, résiliation, renouvellement). |
| `tarif-form.html[?id=][?type=CLIENT&client=][#simulateur]` | Éditeur de grille : 1 Identité & validité, 2 Base & paramètres (grille de base + remise ou majoration, diviseur volumétrique, minimum de perception, arrondi, TVA incluse), 3 Règles (périmètre + modèle en cartes + éditeur adapté + aperçu des prix), 4 Suppléments, 5 Affectation. À droite, **simulateur** en direct avec le détail du calcul pas à pas. |
| `contrat-form.html[?id=][?client=][&renouveler=]` | Contrat d'un client : dates, PDF signé (glisser-déposer), conditions (délai, remise, plafond, report sur la fiche), grille existante ou grille dédiée créée à partir d'une base + remise. Un seul contrat en vigueur par client et par date. |

**Moteur partagé `assets/cx-tarifs.js` (`CX.tarifs`)** - à charger après `cx-data.js` ; sans jQuery,
testable sous node (`node commercial/tests/tarifs-moteur.test.js`, 52 cas vérifiés à la main).

* `CX.tarifs.resoudre(clientId, date)` -> grille applicable et origine : **contrat en vigueur** >
  grille affectée au client > grille d'un de ses groupes > grille **standard** active.
* `CX.tarifs.calculer(grille, envoi)` -> `{ total, ht, tva, ttc, regle, lignes[], alertes[], parts }`.
  La règle retenue est la plus précise (villes > zone > type de trajet > type d'envoi / nature / poids) ;
  sinon on descend dans la grille de base (remise appliquée). Poids taxable = max(réel, L×l×H / diviseur).
* Modèles : forfait par **tranches** (avec prix au-delà), **valeur incrémentielle** (base jusqu'à N kg + X F
  par kg ou par pas de 0,5 kg…), **forme incrémentielle / paliers** (cumulatif ou au palier atteint, prise en
  charge, minimum), **prix au kg** avec minimum, **à la pièce** (dégressif), **ad valorem** (% de la valeur
  déclarée, minimum ; « cumulable » = s'ajoute au transport comme une assurance).
* Suppléments : par nature (% ou F par colis), livraison à domicile par zone, express, emballage ;
  héritables de la grille de base. Puis minimum de perception et arrondi (supérieur ou le plus proche).

Données (store `CX.api`, ajoutées sans effacer les données existantes du navigateur) :
`tarifaires`, `groupesClients` (`nom, description, clientIds`), `contrats` (`clientId, numero, objet,
dateSignature, du, au, tarifaireId, fichier, conditions {delaiPaiement, remisePct, plafondCredit, notes},
statut ACTIF | RESILIE` ; « expiré » et « à venir » sont calculés). Le modèle détaillé d'une grille est en
tête de `cx-tarifs.js`.

Intégrations : méga-menu (rubrique « Tarifaires »), `cotation-form` (tarif automatique par la grille du
client, encadré « Tarif appliqué » avec lien et n° de contrat, détail du calcul repliable, option express,
remise du contrat, pré-remplissage d'une cotation tarifaire depuis la grille du client ; la grille utilisée
est mémorisée dans `details.tarif`), `client-fiche` (onglet « Tarif & contrat » + simulateur),
`client-form` (grille appliquée, groupes de clients), tableau de bord (contrats à échéance sous 30 jours).
`CX.tarif.transport()` s'appuie sur la grille standard quand `cx-tarifs.js` est chargé.

Routes Symfony proposées (repérées par `TODO API`) : `GET /commercial/tarifs/resoudre?client=&date=`,
`GET|POST|PUT|DELETE /commercial/tarifs[/{id}]`, `PUT /commercial/tarifs/{id}/affectation`,
`POST /commercial/tarifs/{id}/activer|archiver|dupliquer`, `/commercial/groupes-clients[/{id}]`,
`/commercial/contrats[/{id}]`, `POST /commercial/contrats/{id}/resilier`, `POST|GET /commercial/contrats/{id}/document`.
Le calcul doit être refait côté serveur (service de tarification) avec les mêmes règles.

## Tester en local

    npx http-server . -p 8765

puis ouvrir http://localhost:8765/commercial/index.html. Les données de démo sont dans le
localStorage (lien « Réinitialiser les données » en bas du tableau de bord).

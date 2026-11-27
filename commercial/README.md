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

## Journal de vente, options de facturation, apporteurs d'affaires

| Page | Rôle |
|---|---|
| `journal-vente.html` | Factures émises sur une période (raccourcis), filtres clients (Select2 multiple), statut, agence ; indicateurs (nb, HT, TVA, TTC, acompte IS) ; tableau avec n° de compte client et totaux. Exports **PDF** (A4 paysage direct), **Excel** (CSV `;` + BOM), **Sage**. |
| `facture.html?id=` | Panneau « Options de la facture » (non imprimé) : PU moyen (colonnes Poids V. et P.U. moyen), sous-totaux par ville de départ / de destination, période automatique, TVA, acompte IS, remise, acompte, assurance / manutention / emballage, bon de commande, délai. Aperçu immédiat ; « Recalculer les montants » enregistre. Lignes Acompte IS / Acompte / **Solde à payer**. Export Excel de la facture. |
| `factures-suivi.html` | Actions « Facture réglée » (paiement du solde en un clic) et « Recalculer les montants ». |
| `apporteurs-liste.html` | Indicateurs, filtres (ville, agence, type, statut), activer / suspendre, clients apportés, commissions. |
| `apporteur-form.html[?id=]` | Identité, coordonnées, affectation & commission ; récap (clients apportés, CA HT de l'année). |
| `commissions.html[?apporteur=]` | Commission par apporteur sur une période (base CA HT facturé ou CA encaissé), détail par client, « Marquer payée » (fige le calcul), export CSV, état imprimable. |

**Modèle** (ajouts, tous facultatifs - absents = comportement historique) :
* client : `compte` (411 + 5 chiffres, sinon `411` + id calculé par `CX.REF.compteClient`), `avecTva`, `tauxTva`,
  `abonnementIs`, `tauxIs` (défaut 2,2 %), `assurance`, `manutention`, `emballage` (frais fixes HT par facture),
  `afficherPuMoyen`, `sousTotal` (`AUCUN|DEPART|DESTINATION`), `apporteurId` ; lecture par `CX.REF.conditionsFacturation(c)`.
* facture : `options{…}`, `frais{assurance, manutention, emballage}`, `fraisTotal`, `tauxIs`, `montantIS`, `acompte`,
  `soldeAPayer`, `bonCommande`. `CX.fac.calculer(facture, client, expeditions[, options])` centralise le calcul
  (net HT = lignes - remise + frais ; TVA ; TTC ; IS = net HT × taux ; solde = TTC - IS - acompte) ; le reste dû
  (`CX.fac.reste`) part du solde. À refaire côté serveur à l'identique.
* `apporteurs` (code `CRS` + n° + code ville, ex. `CRS513DLA`) et `commissions` (`COM-AAAA-NNNN`) : modèle détaillé en tête
  de `assets/pages/apporteurs.js`. Collections ajoutées aux données existantes du navigateur par `completer()` (cx-data.js).

**Export Sage** : une pièce par facture (annulées exclues) dans le journal `VT` - débit 411 client (TTC), crédit 706 (net HT),
crédit 4457 (TVA) ; si « Ventiler l'acompte IS » : débit compte IS (montant IS) et client débité du TTC - IS. Format texte
délimité (journal, date, pièce, compte général, compte tiers, libellé 35 car., débit, crédit, échéance), paramétrable dans
« Paramètres Sage » (codes journal / comptes, compte 411 individuel ou collectif + tiers, séparateur, format de date,
décimales, ANSI / UTF-8, en-tête), mémorisé dans le navigateur (`TODO API : /commercial/parametres/sage`). Aperçu des écritures
et contrôle débit = crédit par pièce et global : le téléchargement est bloqué en cas d'écart. Comptes par défaut
(70600000, 44570000, 44910000) **à valider avec la comptabilité** (plan OHADA).

Fichiers : `journal-vente.*`, `apporteurs-liste.*`, `apporteur-form.*`, `commissions.*`, `assets/pages/exports.js`
(`CX.exporter` : CSV, ANSI, téléchargement), `assets/pages/apporteurs.js|css` (`CX.app`).

## Tester en local

    npx http-server . -p 8765

puis ouvrir http://localhost:8765/commercial/index.html. Les données de démo sont dans le
localStorage (lien « Réinitialiser les données » en bas du tableau de bord).

## Guichet (`../guichet/`)

Saisie des expéditions au comptoir et historique des saisies, portage jQuery de la maquette « Nouvelle expédition, guichet ClemenTino » (et de son reçu A4). Pages chargées avec `window.CX_BASE = "../commercial/"` (liens du menu) et `<body data-module="guichet">` (onglet « Guichet » actif, sous-navigation propre).

| Page | Rôle |
|---|---|
| `expedition-form.html[?id=][&recu=1]` | Démarrage rapide (pré-enregistrement / QR, « Remplir depuis un message client » : extraction des téléphones, noms, ville, quartier, repère) ; type de client **Particulier** (comptant : mode de paiement, montant reçu, monnaie à rendre) ou **Client en compte NATEX** (Select2, expéditeur pré-rempli, n° de LT manuel = feuille de son carnet contrôlée, « En compte – facturé en fin de période ») ; 1 Trajet, 2 Colis (poids volumétrique L×l×H / diviseur de la grille, poids taxable au kg supérieur), 3 Expéditeur et destinataire ; colonne « Lettre de transport » (tarification automatique par `CX.tarifs`, repli 1 500 F + 500 F/kg taxable, détail du calcul, champs manquants cliquables). Après enregistrement : reçu, Imprimer, PDF, WhatsApp (`wa.me`), Corriger, Nouvelle expédition. `?id=` : correction (interdite si livrée, facturée ou annulée). |
| `recu.html?id=[&print=1]` | Reçu A4 seul (réimpression), 2 exemplaires SOUCHE / CLIENT, QR code, filigrane « ANNULÉE » le cas échéant, historique. |
| `expeditions-liste.html[?statut=][&client=][&periode=jour\|hier\|7j\|mois\|tout]` | Historique de toutes les saisies (y compris les expéditions de démo des clients en compte) : indicateurs du jour, filtres, onglets par statut, totaux, export CSV, actions (reçu, corriger, annuler avec motif, WhatsApp, facture), carte « Caisse du jour » du guichetier connecté. |

Fichiers : `guichet/assets/guichet-commun.js` (`CX.guichet` : statuts, libellés, normalisation, numérotation, WhatsApp, contrôle / libération des feuilles de carnet, annulation), `recu.js` (`CX.recu.html(expedition)`, QR code sans bibliothèque, PDF A4 sans marge via `CX.pdf`), `expedition-form.js`, `expeditions-liste.js`, `recu-page.js`, `guichet.css`, `recu.css` (classes `gx-`).

**Expédition saisie au guichet** (collection `expeditions`, champs existants conservés pour la facturation et les carnets) :
`id, numero = nRt ("RT-AAMM-NNNNN"), nRt, nRtMan (feuille de carnet, client en compte), clientId (null = particulier), dateExp, heure, dateLivraison, villeDep, bureauDep, villeDest, bureauDest, expediteur (nom), destinataire (nom), telDestinataire, contenu, nbColis, poids (taxable total), montant (= total du reçu), statut EN_TRANSIT | LIVREE | ANNULEE, preuveLivraison, factureId`
plus : `typeClient PARTICULIER | COMPTE, service URBAINE | NATIONALE | REGIONALE | INTERNATIONALE, typeTrajet, paysDest, villeEtranger, livraison { mode BUREAU | DOMICILE, zone, quartier, repere, telAppel }, recuManuel (particulier), bordereau, colis [{ nature, poids, L, l, H, nombre, valeur, description, poidsVol, poidsTaxable }], expediteurInfo / destinataireInfo { nom, tel, whatsapp, adresse, email }, montants { transport, emballage, livraison, autres, total }, tarifAuto, tarif { source GRILLE | GUICHET | MANUEL, grilleId, grilleCode, grilleNom, origine, contratNumero, regle }, paiement { mode, statut PAYE | EN_COMPTE, recu, rendu, reference }, guichetier, guichetierId, bureau { ville, agence, agenceId }, historique[], annulation { date, user, motif }, nRtManLibere`.
Les objets détaillés des parties sont dans `expediteurInfo` / `destinataireInfo` car `expediteur` / `destinataire` restent des chaînes (utilisées par la facturation).

**Intégration** : une expédition en compte apparaît dans `facture-emettre.html` (« À régulariser » tant qu'en transit, puis « À facturer ») ; sa feuille passe « Utilisée » dans les carnets (`CT.store.syncExpeditions`). L'annulation (statut `ANNULEE`, motif) libère la feuille : si c'est la dernière utilisée, le « dernier n° utilisé » du carnet recule d'un cran, sinon elle reste réutilisable au guichet (`nRtManLibere`). Les expéditions annulées sont exclues de la facturation (`facture-emettre.js`) ; le tableau de bord ne retient déjà que les expéditions livrées.
Routes proposées (`TODO API`) : `GET|POST /guichet/expeditions`, `GET|PUT /guichet/expeditions/{id}`, `POST /guichet/expeditions/{id}/annuler`, `POST /guichet/expeditions/{id}/whatsapp` (envoi du reçu par l'API WhatsApp Business), `GET /guichet/expeditions/{id}/recu.pdf`, `GET /guichet/pre-enregistrements/{code}`, `GET /guichet/caisse?date=&guichetier=`, `GET /exploitation/bordereaux`, `GET /carnets/recherche-feuille?numero=&client=`. Numéro RT, avance du carnet et calcul du tarif sont à refaire côté serveur.

## États (`../etats/`)

Rapports et statistiques (menu `CX.MENU_ETATS`, `<body data-module="etats">`, `window.CX_BASE = "../commercial/"`). Pages chargées avec `cx-data.js`, `cx-tarifs.js`, `cx-demo-exploitation.js`, `cx-pdf.js` et `../guichet/assets/guichet-commun.js` (normalisation des expéditions) ; classes `ex-`.

| Page | Rôle |
|---|---|
| `index.html` | Catalogue des états en cartes (chiffre clé du mois, recherche, favoris `localStorage`). |
| `chiffre-affaires.html[?type=agence\|ville\|client\|produit\|apporteur\|mois][&tab=stats][&src=FAC]` | CA à partir des expéditions ou des factures émises (ventilées par expédition) ; onglet États (sous-totaux, part, comparaison et écart %), onglet Statistiques (évolution, top 10, comptant / en compte, services). |
| `journal-expeditions.html` | Toutes les expéditions de la période, colonnes au choix (mémorisées), totaux, recherche, export. |
| `production.html` | Saisies par agence et par guichetier, panier moyen, carte de chaleur jour × heure. |
| `volumique.html[?mesure=]` | Matrice origine × destination (colis, poids, expéditions, CA), natures, services, distribution des poids. |
| `livraisons.html` | Délais moyen / médian, taux dans le délai cible (urbain 1 j, national 3 j, autres 5 j), en cours, retards, échecs (`suivi[]`), par trajet, agence de destination, service, livreur. |
| `tresorerie.html` | Encaissements comptant par mode, agence et jour ; versements (formulaire, annulation) ; excédent de caisse et alertes de plafond (plafond modifiable par agence). |
| `statistiques.html` | KPI avec tendances, CA mensuel 12 mois vs N-1, répartitions, top clients / agences / trajets, croissance. |

Socle `etats/assets/etats-commun.js` (`CX.etats`) : barre de filtres commune `CX.etats.Filtres` (période avec raccourcis, comparaison période précédente / N-1, niveau géographique ville / agence de départ, type de client, service + nature, apporteurs, données actives / toutes, source) **mémorisée dans l'URL** (« Copier le lien ») ; moteur d'agrégation en une passe `agreger(lignes, ["agence", "mois"])`, `croiser()`, `serie()` ; graphiques SVG sans bibliothèque `CX.etats.graph` (barres, barres horizontales, courbes, anneau, carte de chaleur, infobulles) ; `tableau()` / `tableauCsv()` ; exports CSV (BOM, `;`) et PDF A4 portrait / paysage (`pdf()`, en-tête société, filtres, date d'édition) ; `imprimer()`.

Règles de calcul : CA à partir des expéditions = toutes les ventes (date d'expédition, hors annulées) ; les montants du guichet (particuliers) sont considérés TTC (`CX.etats.CONFIG.PRIX_GUICHET_TTC`), ceux des clients en compte HT (TVA selon la fiche client) ; encaissé = paiements comptant `PAYE` (factures : paiements reçus, au prorata). Le CA du mois est identique dans le CA, le journal, la production et les statistiques.

Nouvelle collection `versements` : `numero (VER-AAAA-NNNN), date, heure, agenceId, montant, destination BANQUE | SIEGE | COFFRE, banque, reference, deposant, observation, statut VALIDE | ANNULE, annulation {date, user, motif}`. Des versements de démonstration sont créés une fois (meta `demoVersements`). Plafonds de caisse : `localStorage` `cx_etats_plafonds` (défaut `CX.etats.CONFIG.PLAFOND_CAISSE`). Collections lues si présentes : `apporteurs`, `livreurs` (vides = rubriques masquées).

Routes proposées (`TODO API`, requêtes SQL d'agrégation décrites en tête de chaque fichier) : `GET /etats/chiffre-affaires`, `/etats/journal-expeditions`, `/etats/production[/heures]`, `/etats/volumique/matrice|natures|poids`, `/etats/livraisons[/retards]`, `/etats/tresorerie`, `GET|POST /etats/tresorerie/versements`, `POST /etats/tresorerie/versements/{id}/annuler`, `/etats/statistiques/kpi|mensuel|top`, `/etats/catalogue/chiffres-cles`. En production les agrégats viennent du serveur ; le JS garde le rendu (graphiques, tableaux, exports).
## Opérations (`../operations/`)

Une fois l'expédition vendue au guichet (nationale, livraison urbaine, internationale, enlèvement d'un client en compte avec son carnet), tout revient aux opérations : **Envoi** des lots et colis (groupage + manifeste de voyage), **Réception** à l'agence de destination (mettre en agence, en transit ou en livraison), **Livraison** (retrait au comptoir, coursier, partenaire). Pages chargées avec `window.CX_BASE = "../commercial/"`, `<body data-module="operations">` (tracking : `data-module="tracking"`) ; scripts : `cx-demo-exploitation.js`, `../guichet/assets/guichet-commun.js`, `operations/assets/ops-commun.js` (**avant** `cx-shell.js`), puis `ops-listes.js` et le script de la page.

| Menu | Page | Rôle |
|---|---|---|
| Lots et colis | `index.html` | Tableau de bord de l'agence (sélecteur d'agence) : à envoyer, en transit vers nous, à réceptionner, à mettre en agence / en transit, en agence (> 3 j), à mettre en livraison, chez le livreur, échecs, international ; retards (SLA), bordereaux du jour, flux du jour, raccourcis, taux de livraison dans les délais. |
| | `groupage.html` — **Envoi des lots et colis** | Filtres bureau de provenance (= agence), bureau de destination, saisie du / au, saisie par, directions, nature du colis, recherche N° RT ; douchette ; colonnes N° reçu transport, N° RT man., N° réf. (lot), N° bord., N° bord. man., bureaux, client, contenu « (n) NATURE (poids) », expéditeur / destinataire (tél.), date exp., statut « Enregistré / à AKWA ». « Bordereau d'expédition » (nouveau, sélection -> GROUPEE) ou ajout à un bordereau en préparation ; « Faire partir » (véhicule, chauffeur, scellé) -> EN_TRANSIT. Onglet « Livraisons urbaines (même agence) ». |
| | `degroupage.html[?bordereau=][#agence\|#transit\|#livraison]` — **Réception des lots et colis** | Filtres Ville, Bureau, Du / Au, Saisie par ; recherche N° RT ou N° bordereau (BE ou manuel) ; bordereaux attendus -> pointage à la douchette (manquants / en trop consignés en écarts) ; onglets **À mettre en agence**, **À mettre en transit**, **À mettre en livraison** ; actions Réorienter les RT, Mettre en agence, Livré en agence, Mettre en transit (bordereau en préparation ou nouveau vers la direction), **Remettre au coursier** ; menu par ligne (détail, notes, modifier la livraison, reçu). |
| | `instance.html[#coursier\|#livreur\|#livrees][?anciennete=][&avis=0]` — **Livraison des lots et colis** | Onglets **Expéditions en agence**, À remettre au coursier, **Expéditions chez le livreur (livraison urbaine)**, **Expéditions livrées** ; filtres Ville, Bureau, Expédié du / au, Saisie par, ancienneté ; actions groupées Réorienter les RT, **Valider pour livraison** (bascule en livraison urbaine), **Livré en agence** (« Mise à jour des informations de livraison » : RT n°, livré par, date + heure, retiré par, pièce CNI / Passeport / Permis de conduire, n° de pièce, téléphone, signature, photo), **Envoyer à un partenaire**, **Remettre au coursier** (« Nouvelle fiche de livraison » : expéditions, livreur Select2 sur `livreurs` + saisie libre, matricule du véhicule), **Rebasculer en agence**, **Suspendre** (motif, réversible), avis WhatsApp, **Imprimer le reçu transport** ; colonnes Notes, Quartier dest. / Zone, Coursier ; onglet Livrées : Livré le, Retiré par, action Modifier. Retrait au comptoir par scan du N° RT ou du téléphone. |
| | `tournees.html[?date=AAAA-MM-JJ][#p<ID>]` — **Tournées de livraison** | Planning des tournées (collection `plannings` : `numero TOU-AAMMJJ-NN, date, heureDebut, heureFin, agenceId, zone Z1\|Z2\|Z3, quartiers[], livreurId, livreurNom, vehicule, capacite, statut PLANIFIEE\|ANNULEE, ficheIds[], observations, historique[]`). Vue semaine livreurs × jours, tournées du jour, liste ; création (répétition sur la semaine, contrôle des chevauchements par livreur), duplication, annulation, copie de la semaine précédente. Statut affiché par `CX.ops.statutPlanning()` (planifiée, en cours, réalisée, non réalisée, annulée) selon les fiches rattachées. « Affecter des colis » ouvre `instance.html?tournee=ID#coursier`. |
| | `livraisons.html[#cloturees\|#livreurs]` — **Fiches de livraison** | Fiches remises aux coursiers (collection `tournees`, champs `type TOURNEE\|EXPRESS`, `planningId`, `zone`) : à la création (« Remettre au coursier »), la fiche est **intégrée à une tournée planifiée du jour** (livreur et heure repris, capacité et zone contrôlées) ou **express** (spontanée) ; fiche imprimable / PDF, clôture au retour : livré (receveur, heure, décharge = preuve), échec (motif -> nouvelle tentative ou en agence), rebasculé en agence ; gestion des livreurs. |
| Expéditions & bordereaux | `preenregistrees.html` — **Expéditions pré-enregistrées** | Collection `preenregistrements` (web, WhatsApp, client en compte) : filtres Du / Au, Ville, Agence ; onglets En attente / Validées / Expirées (> 7 j) / Annulées ; voir, **valider au guichet** (`../guichet/expedition-form.html?prereg=CODE` : saisie pré-remplie, passage « Validé » + n° RT à l'enregistrement), annuler (motif). |
| | `bordereaux.html[#entrants\|#ajouter]` — **Bordereaux d'expédition** | Filtres Ville, Bureau, Du / Au ; onglets **Bordereaux envoyés** / **Bordereaux entrants** ; colonnes N° BE (ex. `AKW112700001`), N° BE manuel, départ de (heure), expéditions / colis (nb + poids), agences, départ prévu, moyen de transport (ROUTE + véhicule + chauffeur / transporteur), saisie le, Départ OUI/NON, Annulé OUI/NON, actions. « Ajouter bordereau » -> **Générer les bordereaux d'expédition de la journée** (lignes : plan de voyage, moyen Route / Air / Mer / Rail / Coursier, n° transport, transporteur, destination, n° bordereau manuel, départ et arrivée prévus, personne à contacter ; pré-remplissage avec les expéditions à envoyer de chaque destination). |
| | `bordereau.html?id=[&print=1]` | Manifeste de voyage A4 (N° BE + manuel, QR, plan de voyage, moyen / n° de transport, transporteur, contact, références de lots, pointage, écarts, signatures chef d'agence départ / chauffeur / chef d'agence arrivée), Imprimer, PDF (`CX.pdf`). |
| | `bordereaux-provisoires.html` — **Bordereaux provisoires** | Un bordereau provisoire par direction, calculé pour la journée à partir des expéditions en attente d'envoi ; ajustement (décocher, moyen, n° transport, heure) ; « Valider » / « Valider tous » -> bordereaux définitifs. |
| | `lettres-voiture.html[?q=][&id=]` | Gestion des lettres de voiture (recherche multicritère dont réf. de lot et N° bordereau manuel, réorientation en lot, export CSV, **fiche détaillée**). |
| | `tracking.html[?lt=][&vue=client]` | Suivi d'un colis (frise, journal, délai estimé, lien de partage, vue client sans données sensibles). |
| International | `international.html[#groupage\|#degroupage]` | Vue par défaut **Expéditions internationales** (export / import, partenaire, AWB, statut, livraison confirmée) ; **Groupage international** (transmission au partenaire DHL, TNT, Aramex… : AWB, date de remise, bordereau partenaire) ; **Dégroupage international** (imports reçus de l'étranger -> réception, mise en agence ou en livraison). |

**Fiche détaillée** (modale `CX.ops.fiche`, depuis toutes les listes) : N° reçu transport et N° reçu manuel, réf. (lots), client, montant, remise %, paiement, livraison, délai cible, frise des étapes, expéditeur / destinataire, section **« Les lots »** repliable par colis (référence, nature, poids théorique, poids volumétrique, taxable, nombre, L × l × H, valeur), informations (réf. client, créé par, enregistrée le, dernière modification par / le, livré le / retiré par, bordereau(x) + manuel, coursier, partenaire, facture, carnet, position), notes / incidents / réorientations, preuve de remise (signature, photo) ; actions réorienter, corriger le destinataire, note, incident, suspendre / lever, remettre, modifier la livraison, réimprimer le reçu, tracking.

**Référence de lot** : `AAMMJJ-AGC-NNN-<n>S<total>` (ex. `261126-AKW-006-1S1`) : date d'expédition, code agence de départ sur 3 lettres (`AKWA` -> `AKW`, agences « Centre / Centrale » -> code ville `YDE`, `BFS`…, import -> `INT`), rang de l'expédition dans les saisies du jour de l'agence, n° du colis sur le total. **N° BE** : code agence + MMJJ + séquence sur 5 chiffres. Numéros calculés côté client pour la maquette (`CX.ops.refBase`, `numeroBordereau`) : à attribuer par le serveur.

**Cycle (champ `etape`)** : `ENREGISTREE → GROUPEE` (bordereau) `→ EN_TRANSIT` (départ) `→ ARRIVEE` (réception) puis : **mettre en agence** `→ EN_INSTANCE` ; **mettre en livraison** (reste ARRIVEE « domicile ») `→ EN_LIVRAISON` (remise au coursier) ; **mettre en transit** `→ GROUPEE` (bordereau vers la direction suivante). `EN_INSTANCE → ARRIVEE` (valider pour livraison) ou `→ EN_LIVRAISON` ; `EN_LIVRAISON → EN_INSTANCE` (rebascule) | `ECHEC` | `LIVREE`. Partenaire : `→ EN_TRANSIT` (+ `partenaire`) `→ LIVREE`. Import : `EN_TRANSIT` (chez le partenaire) `→ ARRIVEE` (réception). Chaque transition (`CX.ops.avancer`) contrôle la table des transitions, refuse une expédition **suspendue**, ajoute une entrée `suivi[]` (`date, etape, lieu, agence, user, note`) et `historique[]` ; `statut` reste `EN_TRANSIT` jusqu'à la remise, puis **`LIVREE` + `dateLivraison` + `preuveLivraison`** (remise signée, décharge rapportée, confirmation du partenaire) : une expédition de client en compte devient alors facturable dans `facture-emettre.html`.

**Données** (store `CX.api`) : `bordereaux` (`numero` N° BE, `numeroManuel, date, heure, agenceDepId/villeDep/agenceDep, agenceDestId/villeDest/agenceDest, planVoyage, moyen ROUTE | AIR | MER | RAIL | COURSIER, numeroTransport, transporteur, contact, departPrevu, arriveePrevue, vehicule, chauffeur, scelle, expeditionIds[], statut PREPARE | PARTI | ARRIVE | CLOTURE, annule, dateDepart, dateArrivee, dateCloture, recus[], ecarts[], observations, historique[]`), `tournees` = fiches de livraison (`numero TRN-AAMMJJ-NN, livreurId | livreurNom, matricule, expeditionIds[], statut EN_COURS | CLOTUREE, resultats {idExp: {resultat LIVREE | ECHEC | AGENCE | REBASCULE, …}}`), `livreurs`, `preenregistrements` (voir `CX.guichet.preenreg` dans `guichet-commun.js`). Champs ajoutés aux expéditions : `positionAgenceId, bordereau, bordereauId, bordereauManuel, bordereauxHist[], tourneeId, livreurId, coursier, avis[], remise {date, livrePar, nom, qui, piece, numeroPiece, tel, signature, photo, observation, mode}, suspendu {date, user, motif} / suspensions[], reorientations[], incidents[], notes[], manquant, partenaire {nom, awb, dateRemise, bordereau}, retour, paysDep / villeOrigine (import), dateModification, modifiePar`. Démo : bordereaux / fiches reconstitués du suivi, 8 expéditions internationales et 6 pré-enregistrements, ajoutés une seule fois (marqueurs `meta`).

**Guichet** (modification ciblée) : `expedition-form.js` lit les pré-enregistrements dans la collection (`?prereg=CODE` au chargement, refus si validé / expiré / annulé) et les passe « Validé » à l'enregistrement.

Routes proposées (`TODO API`) : `GET /exploitation/expeditions[/{id}]`, `POST /exploitation/expeditions/{id}/etape`, `POST|PUT /exploitation/expeditions/{id}/remise`, `POST /exploitation/expeditions/reorienter|mise-en-agence|valider-livraison|rebascule-agence|suspendre|partenaire|avis`, `DELETE /exploitation/expeditions/{id}/suspension`, `PUT /exploitation/expeditions/{id}/livraison|destinataire`, `POST /exploitation/expeditions/{id}/notes|incidents`, `GET|POST /exploitation/bordereaux`, `POST /exploitation/bordereaux/journee`, `GET /exploitation/bordereaux/provisoires`, `POST /exploitation/bordereaux/provisoires/valider`, `POST /exploitation/bordereaux/{id}/colis|depart|reception|annuler`, `PUT /exploitation/bordereaux/{id}/pointage`, `POST /exploitation/fiches-livraison`, `POST /exploitation/tournees/{id}/cloture`, `GET|POST|PUT /exploitation/livreurs`, `GET /exploitation/international`, `POST /exploitation/international/reception`, `GET /guichet/pre-enregistrements[/{code}]`, `POST /guichet/pre-enregistrements/{code}/valider|annuler`, `GET /exploitation/tracking?q=` et page publique `GET /suivi/{numero}`.

## Jeu de données de démonstration « semaine »

Pour visualiser les écrans avec des données, un jeu complémentaire couvrant **J-7 à J+4** est ajouté une seule fois, sans effacer les saisies du navigateur :

- `cx-demo-exploitation.js` → `CX.demoExploitation.assurerSemaine()` (meta `demoSemaine`) : agence Douala · Akwa — expéditions à envoyer et urbaines, 2 bordereaux attendus, colis à mettre en agence / en transit / en livraison, en agence (avec avis), échec à relivrer, fiches de livraison en cours (dont 1 express) et clôturées, planning des tournées de Douala et Yaoundé ;
- `cx-data.js` → `complementSemaine()` (drapeau `demoSemaine` du store) : factures brouillon / émise / annulée, cotations récentes ;
- `guichet-commun.js` → pré-enregistrements validé, annulé et dépôts annoncés pour les jours à venir (meta `demoPreenregistrements2`).

Fichiers de démonstration uniquement : à ne pas reprendre en production.

## Multi-entreprise (charte, logo, coordonnées)

Sélecteur (drop-up) à droite du pied de page : **Solex Express** (bleu / jaune), **Touristique Logistique** (TL · TCCE · Touristique, vert) et **Autre entreprise…** (raison sociale, couleurs, logo, coordonnées saisis dans le navigateur, pour présenter le logiciel à un autre client).

- Registre `CX.SOCIETES` et module `CX.societe` dans `cx-core.js` : `liste()`, `code()`, `choisir(code)`, `logoUrl()`, `perso()`, `enregistrerPerso(o)`. Choix mémorisé dans `localStorage` (`cx_societe`, `cx_societe_perso`).
- `CX.CONFIG.SOCIETE` = entreprise courante : toutes les pages et documents (factures, cotations, reçus, bordereaux, fiches de livraison, journal de vente, commissions, états, PDF) reprennent son nom, son logo et ses coordonnées.
- Charte : variables CSS `--cx-navy`, `--cx-navy-top`, `--cx-navy-2`, `--cx-navy-3`, `--cx-blue-soft`, `--cx-accent`, `--cx-footer-text` injectées dans `<style id="cx-theme">` ; les couleurs codées en dur des CSS (opérations, états, guichet, reçu, carnets) passent par ces variables.
- Logos : `commercial/assets/img/societes/` (`solex-banniere.png` pour l'en-tête et les documents, `solex-logo.png` comme icône, `touristique-logo.png`).
- **Intégration Symfony** : la société vient du tenant de l'utilisateur connecté (paramètres société en base, `GET /parametres/societe`) ; le sélecteur est réservé à la démonstration. Les données de démonstration sont communes aux entreprises.

## Vues multiples (`cx-vues.js`)

Composant `CX.vues` : `Selecteur` (boutons de vue mémorisés), rendus `cartes`, `kanban`, `calendrier` (mois), `gantt` (frise heures ou jours) et `brancher(dt, options)` qui ajoute ces vues à un `CX.DataTable` existant (mêmes lignes filtrées et triées que le tableau).

| Écran | Vues |
|---|---|
| Opérations › Tournées de livraison | Planning de la semaine, cartes du jour, Kanban par statut, calendrier du mois, Gantt de la journée (une ligne par livreur), liste |
| Opérations › Livraison de colis | Par onglet (tableaux + actions groupées) ou Kanban du flux : en agence → à remettre au coursier → chez le livreur → livrées (7 jours) |
| Opérations › Bordereaux d'expédition | Tableau, cartes, Kanban par statut, calendrier des départs, Gantt départ → arrivée par direction |
| Commercial › Cotations | Tableau, cartes, Kanban du circuit (enregistrée → acceptée / rejetée) |
| Guichet › Historique des saisies | Tableau, cartes, Kanban par étape du colis, calendrier des saisies |

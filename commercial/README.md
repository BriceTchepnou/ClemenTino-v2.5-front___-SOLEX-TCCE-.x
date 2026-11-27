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

Exploitation des colis de l'agence de l'utilisateur (flux départ → transport → arrivée → remise) et page Tracking. Pages chargées avec `window.CX_BASE = "../commercial/"`, `<body data-module="operations">` (tracking : `data-module="tracking"`) ; elles chargent aussi `cx-demo-exploitation.js`, `../guichet/assets/guichet-commun.js` (normalisation des expéditions) puis `operations/assets/ops-commun.js` **avant** `cx-shell.js`.

| Page | Rôle |
|---|---|
| `index.html` | Tableau de bord de l'agence (sélecteur d'agence) : colis par étape (à grouper, en transit vers nous, à réceptionner, à orienter, en instance, > 3 j, à livrer, en livraison, échecs), retards (SLA), bordereaux du jour, flux du jour, raccourcis, taux de livraison dans les délais (30 j). |
| `groupage.html` | Départs : colis ENREGISTRÉS de l'agence (et colis en transit à réexpédier) regroupés par agence de destination, sélection par case ou **douchette** (saisie + Entrée, bip), création d'un bordereau (destination, véhicule, chauffeur, scellé, départ prévu ; colis en transit signalés) ou ajout à un bordereau en préparation, retrait d'un colis, annulation, **Faire partir** (confirmation véhicule / chauffeur / scellé). Onglet « Locaux » : colis destinés à l'agence elle-même → en agence / à livrer. |
| `bordereaux.html[?sens=DEP\|ARR\|TOUS]` | Liste des bordereaux (départs / arrivées / réseau, période, statut, écarts), actions selon le statut. |
| `bordereau.html?id=[&print=1]` | Manifeste A4 (QR code, trajet, véhicule, scellé, colis avec case de pointage, totaux, écarts, signatures chef d'agence départ / chauffeur / chef d'agence arrivée), Imprimer, PDF direct (`CX.pdf`), historique. |
| `degroupage.html[?bordereau=][#agence\|#transit\|#inter]` | Arrivées : bordereaux attendus → pointage colis par colis (scan ou case, progression, colis **en trop** détectés au scan), « Enregistrer le pointage » (en cours) ou « Valider la réception » (reçus → ARRIVEE + orientation automatique, manquants / en trop consignés dans `ecarts`, bordereau CLOTURE). Onglets « Expéditions à mettre en agence », « À réexpédier (transit) », « À transmettre au partenaire international » ; actions **Réorienter les LT**, Mettre en agence, Livré en agence, Transmettre au partenaire (AWB) ; recherche par n° de LT ou de bordereau. |
| `instance.html[?anciennete=3\|7\|15][&avis=0\|1]` | Colis en agence : ancienneté, avis envoyés, avis / relance WhatsApp (`wa.me`) ou SMS (`sms:`) tracés, **remise au destinataire** (titulaire ou mandataire, pièce d'identité + n°, téléphone, signature sur canevas, photo facultative réduite) → LIVREE + preuve ; retour à l'expéditeur (proposé après 15 j) ; retrait au comptoir par scan du n° de LT ou du téléphone. |
| `livraisons.html[#tournees\|#cloturees\|#livreurs]` | Colis à livrer par zone / quartier (échecs à retenter inclus) → **tournée** pour un livreur (colis EN_LIVRAISON), feuille de route A4 (aperçu, impression, PDF), clôture : livré (receveur, heure, décharge rapportée = preuve) ou échec (absent, adresse introuvable, refus…) → nouvelle tentative ou mise en instance ; gestion des livreurs. |
| `lettres-voiture.html[?q=][&etape=][&retard=1][&incident=1][&id=]` | Toutes les LT : recherche multicritère (n° LT, n° manuel, téléphone, nom, bordereau, AWB), filtres étape / agence (départ, arrivée, présentes) / période / retard / incident, export CSV, réorientation en lot, **fiche détaillée** en modale. |
| `tracking.html[?lt=][&vue=client]` | Recherche par n° de LT, n° manuel ou téléphone (liste si plusieurs colis), en-tête de statut, frise des étapes franchies / à venir, journal, délai estimé, lien de partage (copie, WhatsApp) et **Vue client** (noms abrégés, téléphones masqués, ni montant, ni agent, ni pièce d'identité). |

**`assets/ops-commun.js` (`CX.ops`)** : étapes (libellés, couleurs, icônes) et transitions autorisées, agence courante + sélecteur (mémorisé dans `localStorage` `ox_agence_courante`, remplace `CX.CONFIG.USER.ville/agence` sur les pages Opérations ; en production : réservé aux superviseurs), positions (`agDest`, `agDep`, `position`), `avancer(id, etape, info)` / `avancerLot`, SLA (`SLA = { URBAIN: 1, NATIONAL: 3, AUTRE: 5 }` jours), files de travail de l'agence (`files`), avis WhatsApp / SMS, modales partagées (fiche détaillée, remise, réorientation, partenaire, départ d'un bordereau), frise et journal, scan douchette, bordereaux et tournées de démonstration reconstitués une fois à partir du suivi. Styles : `assets/ops.css` (classes `ox-`).

**Cycle (champ `etape`)** : `ENREGISTREE → GROUPEE` (bordereau) `→ EN_TRANSIT` (départ) `→ ARRIVEE` (dégroupage) `→ EN_INSTANCE` (retrait) | reste ARRIVEE « à livrer » `→ EN_LIVRAISON` (tournée) `→ LIVREE` | `ECHEC → EN_LIVRAISON` (nouvelle tentative) ou `EN_INSTANCE`. Colis local : `ENREGISTREE → ARRIVEE`. Partenaire international : `→ EN_TRANSIT` (+ `partenaire`) `→ LIVREE` (confirmation depuis la fiche). Réorientation : colis présent dans une agence qui n'est plus sa destination → `ARRIVEE` (à réexpédier, proposé au groupage). Chaque transition ajoute une entrée `suivi[]` (`date, etape, lieu, agence, user, note`) et `historique[]` ; `statut` reste `EN_TRANSIT` jusqu'à la remise, puis **`LIVREE` + `dateLivraison` + `preuveLivraison`** (remise signée en agence, décharge rapportée en tournée) : une expédition de client en compte devient alors facturable dans `facture-emettre.html`.

**Données** (store `CX.api`) : `bordereaux` (`numero BRD-AAMMJJ-NNN, date, heure, agenceDepId/villeDep/agenceDep, agenceDestId/villeDest/agenceDest, vehicule {type, immatriculation}, chauffeur {nom, tel}, scelle, expeditionIds[], statut PREPARE | PARTI | ARRIVE | CLOTURE, dateDepart, dateArrivee, dateCloture, recus[], ecarts[{type MANQUANT | EN_TROP, expeditionId, nRt, note, date, user}], observations, historique[]`), `tournees` (`numero TRN-AAMMJJ-NN, date, heure, agenceId, livreurId, livreurNom, vehicule, expeditionIds[], statut EN_COURS | CLOTUREE, resultats {idExp: {resultat, receveur, heure, decharge, motif, suite}}, dateCloture`), `livreurs` (`code, nom, tel, ville, agenceId, vehicule, statut ACTIF | CONGE | INACTIF`). Champs ajoutés aux expéditions : `positionAgenceId, bordereau, bordereauId, tourneeId, livreurId, avis[], remise {date, user, agenceId, qui, nom, piece, numeroPiece, tel, signature, photo, observation, mode AGENCE | DOMICILE}, reorientations[], incidents[{type AVARIE | PERTE | SPOLIATION | RETARD | AUTRE, description, valeur, statut}], notes[], manquant, partenaire {nom, awb}, retour`.

Routes proposées (`TODO API`) : `GET /exploitation/expeditions[/{id}]`, `POST /exploitation/expeditions/{id}/etape`, `POST /exploitation/expeditions/{id}/remise` (multipart signature / photo), `POST /exploitation/expeditions/reorienter`, `POST /exploitation/expeditions/mise-en-agence`, `POST /exploitation/expeditions/partenaire`, `POST /exploitation/expeditions/{id}/avis|notes|incidents`, `PUT /exploitation/expeditions/{id}/destinataire`, `GET|POST /exploitation/bordereaux`, `POST /exploitation/bordereaux/{id}/colis|depart|reception`, `PUT /exploitation/bordereaux/{id}/pointage`, `GET|POST /exploitation/tournees`, `POST /exploitation/tournees/{id}/cloture`, `GET|POST|PUT /exploitation/livreurs`, `GET /exploitation/tracking?q=` et page publique `GET /suivi/{numero}`. Numéros (BRD, TRN), transitions, écarts et SLA sont à refaire côté serveur.

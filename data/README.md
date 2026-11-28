# Jeu de données de démonstration — ClemenTino 2.0

Données fictives utilisées par les maquettes (Commercial, Guichet, Opérations, États, Carnets de LT),
exportées en JSON pour servir de référence (fixtures, migrations, tests côté Symfony).

> Données **fictives** : noms, téléphones, montants et numéros sont générés. Ne pas utiliser en production.

## Fichiers

| Fichier | Contenu |
|---|---|
| `jeu-de-donnees.json` | Store complet de l'application (clé `localStorage` `cx_commercial_demo_v1`) |
| `carnets.json` | Carnets de lettres de transport (clé `ct_carnets_demo_cx_v1`) |
| `collections/<nom>.json` | Une collection par fichier : `clients`, `expeditions`, `factures`, `cotations`, `tarifaires`, `groupesClients`, `contrats`, `apporteurs`, `commissions`, `livreurs`, `bordereaux`, `tournees` (fiches de livraison), `plannings` (tournées planifiées), `preenregistrements`, `reclamations`, `meta` |
| `referentiels.json` | Villes, agences, zones de livraison, natures de colis, secteurs, modes de paiement, véhicules, entreprises (Solex, Touristique Logistique) |
| `index.json` | Date de génération, période couverte, volumes par collection |

Période couverte : ~3 mois d'historique jusqu'à **J+4** (date de référence = date de génération), avec un
jeu « semaine » détaillé (J-7 à J+4) pour l'agence **Douala · Akwa** : expéditions à envoyer, bordereaux
attendus, colis à mettre en agence / en transit / en livraison, fiches de livraison en cours et clôturées,
planning des tournées, pré-enregistrements, factures et cotations.

Les modèles de chaque collection sont décrits dans `commercial/README.md` et en tête de
`operations/assets/ops-commun.js` et `guichet/assets/guichet-commun.js`.

## Régénérer

Le script exécute sous Node les mêmes générateurs que les maquettes :

```bash
node outils/generer-jeu-de-donnees.js              # date de référence = aujourd'hui
node outils/generer-jeu-de-donnees.js 2026-11-27   # date de référence imposée
```

## Charger ce jeu dans les maquettes

Pages servies par un serveur local (ex. `npx http-server . -p 8765`), dans la console du navigateur :

```js
fetch("/data/jeu-de-donnees.json").then(function (r) { return r.text(); }).then(function (t) {
    localStorage.setItem("cx_commercial_demo_v1", t);
    return fetch("/data/carnets.json").then(function (r) { return r.text(); });
}).then(function (t) { localStorage.setItem("ct_carnets_demo_cx_v1", t); location.reload(); });
```

Sans cette étape, les maquettes génèrent elles-mêmes les mêmes données au premier chargement.

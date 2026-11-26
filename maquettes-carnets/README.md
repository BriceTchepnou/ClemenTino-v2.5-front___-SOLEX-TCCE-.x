# Maquettes – Gestion des carnets de lettres de transport (LT)

Interfaces HTML + jQuery + Bootstrap 3 (pas de React, pas de build, code non minifié),
prêtes à être intégrées dans le front existant de ClemenTino.

## Fichiers

| Fichier | Rôle |
|---|---|
| `carnets-liste.html` | Liste des carnets : filtres (dates, client, agence, statut), indicateurs, tableau trié/paginé, recherche rapide (y compris par n° de feuille), actions par ligne. |
| `carnet-detail.html?id=X` | Détail d'un carnet : informations, indicateurs, grille de toutes les feuilles (paginée par 100), sélection multiple (Maj + clic), onglets anomalies et historique. |
| `assets/carnets-common.js` | Référentiels, règles métier (`CT.metier`), utilitaires, persistance simulée (`CT.store`) et modale partagée « Ajouter / Modifier un carnet » (`CT.formCarnet`). |
| `assets/carnets-liste.js` | Comportement de la page liste. |
| `assets/carnet-detail.js` | Comportement de la page détail. |
| `assets/carnets.css` | Styles, tous préfixés `ct-` pour ne pas entrer en conflit avec le CSS existant. |

## Modales
- **Ajouter / Modifier un carnet** : n° carnet, préfixe, nombre de feuilles (calcule le n° de fin), n° début / fin,
  client, agence, dernier n° utilisé, n° perdus (`456045, 456101-456105`) + motif, observation, récapitulatif en direct.
- **Déclarer des feuilles perdues / annulées** (liste et détail).
- **Mettre à jour le dernier n° utilisé** (détail), avec boutons −1 / +1.
- **Retrouver une feuille** : à quel carnet / client / agence appartient un n° de LT, et son statut.
- **Confirmation** générique (clôture, suppression, rétablissement).

## Règles métier mises en œuvre (à reproduire côté serveur)
- Les feuilles sont utilisées dans l'ordre : toute feuille ≤ *dernier n° utilisé* est « Utilisée ».
- Statut d'une feuille : Disponible / Utilisée / Perdue / Annulée (+ « Prochaine » = prochaine feuille attendue).
- Statut d'un carnet : En stock (sans client) / Affecté / Épuisé (plus de feuille disponible) / Clôturé.
- Début ≤ fin ; dernier utilisé et n° perdus compris dans la plage ; n° de carnet unique ;
  pas de chevauchement de plage entre deux carnets de même préfixe.
- Un carnet dont des feuilles ont été utilisées ne peut pas être supprimé, seulement clôturé.
- Alerte quand il reste moins de 10 % de feuilles dans un carnet affecté.
- Chaque action est tracée dans l'historique du carnet.

## Intégration
1. Ne pas reprendre `.ct-topbar` / `.ct-footer` (menu et pied de page existent déjà).
2. Remplacer les référentiels `CT.CLIENTS`, `CT.AGENCES`, `CT.CURRENT_USER` par les données du serveur.
3. Remplacer chaque méthode de `CT.store` par un `$.ajax` ; les points d'API proposés sont listés
   en commentaire au-dessus de `CT.store` et marqués `TODO API` dans les pages. Les méthodes renvoient déjà
   des promesses jQuery, donc les pages n'ont pas à changer.
4. Les champs date utilisent `<input type="date">` : les remplacer par le datepicker de l'application si besoin.
5. Si DataTables est déjà utilisé dans l'application, il peut remplacer le tri/pagination maison de la liste.

## Tester en local
Servir le dossier avec n'importe quel serveur statique, par exemple :

    npx http-server maquettes-carnets -p 8765

puis ouvrir http://localhost:8765/carnets-liste.html. Les données de démo sont stockées dans le
localStorage du navigateur (lien « Réinitialiser les données de démo » en bas de la liste).

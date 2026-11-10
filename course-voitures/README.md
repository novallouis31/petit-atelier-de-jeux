# Petites Voitures — Grand Prix des Genêts

Jeu de course 2D en vue du dessus, de 2 à 4 voitures, avec des adversaires
gérés par l'ordinateur. Aucune dépendance, aucun build : ouvrez `index.html`
dans un navigateur récent.

![2 à 4 voitures](https://img.shields.io/badge/voitures-2%20%C3%A0%204-63e6c0)

## Course

- **3 tours** de circuit, un chrono par tour, un meilleur tour par pilote ;
- grille de départ, compte à rebours, écran de résultat ;
- 2 à 4 voitures : jusqu'à deux joueurs humains, le reste en pilote automatique.

## Commandes

| | Joueur 1 | Joueur 2 |
| --- | --- | --- |
| Accélérer | `↑` | `Z` ou `W` |
| Freiner / marche arrière | `↓` | `S` |
| Braquer | `←` `→` | `Q`/`A` · `D` |
| Frein à main | `Espace` | `E` ou `Maj` gauche |

## Menu de départ

- **Voitures en piste** : 2, 3 ou 4 ;
- **Niveau des adversaires** : *Calme*, *Confirmé*, *Expert* ;
- **Circuit** : *Boucle des Genêts* ou *La Cigogne* ;
- l'écran affiche les statistiques du circuit (longueur, largeur, nombre de points).

## Physique

Modèle bicyclette, et non une simpleTranslation de rectangle :

- glissement par essieu (`slipF`, `slipR`) et pneus à **formule magique** ;
- **transfert de charge** longitudinal : la voiture s'enfonce à l'accélération et
  se cabre au freinage, ce qui modifie l'adhérence disponible ;
- **cercle de friction** : l'effort longitudinal consomme l'adhérence latérale,
  c'est la raison du dérapage en sortie de courbe ;
- frein à main, collisions voiture-voiture à impulsions, surface hors-piste
  distincte de l'asphalte ;
- intégrateur à pas fixe `1/180 s` avec accumulateur.

## Pilotes automatiques

`js/ai.js` implémente un pilotage par **pure pursuit** :

- suivi de la ligne de course, corrigé de l'écart latéral ;
- vitesse limitée par la **courbure** de la ligne (on ralentit dans les virages) ;
- évitement des voitures devant et **marche arrière de dégagement** quand on
  reste bloqué ;
- trois niveaux (`calme`, `confirme`, `expert`) qui changent gains, vitesse
  maximale et audace.

## Banc d'essai

`js/bench.js` valide les circuits en faisant courir quatre IA dessus, puis relève :
tours valides, temps au tour, sorties de piste, tête-à-queue, collisions, arrêts
et rayon minimal de freinage emprunté.

Depuis la console du navigateur :

```js
__bench.run('genets')   // un circuit
__bench.all()           // tous les circuits
```

## Fichiers

```text
index.html      structure, HUD, panneaux (menu / pause / résultat)
styles.css      interface
js/game.js      boucle de jeu, état de la course, entrées, HUD
js/physics.js   moteur physique (modèle bicyclette, collisions)
js/render.js    rendu canvas
js/world.js     géométrie des circuits, surface, decoration
js/ai.js        pilotes automatiques
js/bench.js     banc d'essai / validation des circuits
```

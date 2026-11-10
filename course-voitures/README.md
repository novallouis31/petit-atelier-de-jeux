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
- **Circuit** : *Boucle des Genêts*, *L'Aiguille*, *La Cigogne*, *L'Escargot*, *L'Onde* ;
- l'écran affiche les statistiques du circuit (longueur, largeur, nombre de points)
  et le verdict du banc d'essai IA (`Validé par IA · tour 30.7 s · rayon min 40 m · très propre`).

Le réglage est mémorisé dans le navigateur (`localStorage`, clé
`petites-voitures/settings`).

## Circuits

| Circuit | Caractère | Longueur | Rayon min |
| --- | --- | --- | --- |
| Boucle des Genêts | rapide, harmonieux, deux longues courbes | 533 m | 40 m |
| L'Aiguille | boucle étirée, deux épingles serrées | 557 m | 23 m |
| La Cigogne | trois grands lobes | 549 m | 46 m |
| L'Escargot | quatre bosses, tracé technique en lacets | 568 m | 44 m |
| L'Onde | sinueux, en permanence dans les esses | 552 m | 47 m |

Les cinq circuits sont décrits par des harmoniques (rayon polaire), donc la
boucle est fermée mathématiquement. Un circuit est décrit dans `TRACKS`
(`js/world.js`) : `rx`, `ry`, harmoniques, largeur de route et largeur de
dégagement.

## Physique

Modèle bicyclette, et non une simple translation de rectangle :

- glissement par essieu (`slipF`, `slipR`) et pneus à **formule magique** ;
- **transfert de charge** longitudinal : la voiture s'enfonce à l'accélération et
  se cabre au freinage, ce qui modifie l'adhérence disponible ;
- **cercle de friction** : l'effort longitudinal consomme l'adhérence latérale,
  c'est la raison du dérapage en sortie de courbe ;
- **correcteur de stabilité (ESC)** : le lacet est ramené à la limite
  d'adhérence (`r_max = mu·g / v`), donc la voiture peut glisser dans un virage
  mais ne part plus en tête-à-queue ;
- **contrôle de motricité** : le couple arrière est réduit quand les roues
  avant sont braquées ;
- frein à main, collisions voiture-voiture à impulsions, surface hors-piste
  distincte de l'asphalte ;
- intégrateur à pas fixe `1/180 s` avec accumulateur.

Les réglages sont regroupés dans `PHYS` (`js/world.js`).

## Pilotes automatiques

`js/ai.js` implémente un pilotage par **pure pursuit** :

- suivi de la ligne de course, corrigé de l'écart latéral (correction
  proportionnelle à la vitesse, comme un contrôleur Stanley) ;
- **planification de vitesse à reculons** : on freine assez tôt pour arriver à
  la vitesse permise par la courbure de la ligne de course ;
- **anticipation du gradient de courbure** : quand un virage se referme, l'IA
  ralentit et regarde plus loin ;
- décalage vers l'intérieur limité en proportion au rayon du virage (sinon la
  trajectoire devient plus serrée que la route) ;
- évitement des voitures devant, contre-braquage quand l'arrière décroche, et
  **marche arrière de dégagement** quand on reste bloqué ;
- trois niveaux (`calme`, `confirme`, `expert`) qui changent gains, vitesse
  maximale, audace et niveau de freinage.

## Banc d'essai

`js/bench.js` valide les circuits en faisant courir l'IA **seule** dessus (de
façon à isoler la qualité du tracé des contacts entre voitures), puis relève :
tours valides, temps au tour, sorties de piste, durée maximale de perte de
contrôle, collisions, arrêts, écart latéral et glissement max.

Verdict actuel (niveau *Expert*, 3 tours) :

| Circuit | Tour | Hors piste | Perte de contrôle | Note |
| --- | --- | --- | --- | --- |
| Boucle des Genêts | 30,7 s | 0 % | 0 s | très propre |
| La Cigogne | 31,5 s | 0 % | 0 s | très propre |
| L'Onde | 31,6 s | 0 % | 0 s | très propre |
| L'Escargot | 32,6 s | 0 % | 0 s | exigeant |
| L'Aiguille | 33,5 s | 0 % | 0,26 s | serré |

Depuis la console du navigateur :

```js
__bench.run('genets')   // un circuit
__bench.all()           // tous les circuits, classés par score
__bench.publish()       // recalcule et met à jour le menu
```

## Fichiers

```text
index.html      structure, HUD, panneaux (menu / pause / résultat)
styles.css      interface
js/game.js      boucle de jeu, état de la course, entrées, HUD, audio
js/physics.js   moteur physique (modèle bicyclette, ESC, collisions)
js/render.js    rendu canvas, décor, vignettes des circuits
js/world.js     catalogue des circuits, géométrie, réglages physiques
js/ai.js        pilotes automatiques
js/bench.js     banc d'essai / validation des circuits
```

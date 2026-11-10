# Architecture

Ce document explique comment le projet est découpé et pourquoi.

## Le principe directeur : `core/` est pur

La règle structurante du projet est simple :

> `src/core/` ne contient **aucune** référence au DOM ni à Three.js.

Conséquence directe : la simulation (physique, IA, chronométrage) peut
s'exécuter sous Node, sans navigateur et sans rendu. C'est ce qui rend
possible le banc d'essai `npm run bench`, qui fait piloter chaque circuit par
l'IA et rapporte des métriques chiffrées.

```bash
npm run bench     # 6 circuits × 3 niveaux d'IA, sans navigateur
```

Si la physique dépendait de Three.js, ce banc serait impossible à écrire.

### Les dépendances entre couches

```
        core/            render/           ui/
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ mathx.js   │◄───│ scene.js   │    │ menu.js    │
    │ tracks.js  │◄───│ trackMesh  │    │ hud.js     │
    │ track.js   │◄───│ carMesh    │    └────────────┘
    │ physics.js │◄───│ camera.js  │
    │ ai.js      │◄───│ effects.js │
    │ race.js    │    └────────────┘
    └────────────┘          │
         ▲                  ▼
         └──────── main.js ─┘
              (orchestration)
```

`core/` ne connaît personne. `render/` et `ui/` connaissent `core/`.
`main.js` assemble le tout.

## Le circuit est la source de vérité

Le fichier `core/track.js` construit la géométrie complète d'un circuit :
points échantillonnés, tangentes 3D, courbure, dévers, normale de la route,
et une fonction `locate(x, z)` qui retrouve la position d'un point dans la
piste.

C'est le **même** objet que le moteur physique et le rendu consomment. Il
n'y a pas de « version 2D » et de « version 3D » du circuit qui pourraient
diverger : la simulation et ce que l'on voit à l'écran sont garantis
identiques.

### Conventions de signe

C'est la source de bugs la plus probable du projet, donc les conventions sont
écrites explicitement dans `core/track.js` :

| Grandeur | Signe positif signifie |
| --- | --- |
| `heading` | cap vers +Z (sens trigonométrique dans le plan XZ) |
| `lateral` | côté **droit** de la route |
| `curvS` | virage à **droite** |
| `bank` | côté droit **plus bas** (donc côté gauche surélevé) |
| `v` (vitesse latérale) | vers la **droite** de la voiture |
| `r` (vitesse de lacet) | lacet vers la **droite** |

Le repère de la voiture est donc : `x` avant, `y` latéral droit, `z` haut.
Le lacet positif tourne vers la droite, comme sur un volant réel.

## Le modèle physique

`core/physics.js` implémente un **modèle bicyclette** : deux essieux, des
angles de glissement distincts, et une courbe de dérive approchée par la
formule magique de Pacejka.

### Ordre de calcul d'un pas

1. Localisation sur la piste (grip, hauteur, normale).
2. Suspension : la voiture suit la route, ou décolle si elle passe une
   crête trop vite.
3. Direction : limitation en vitesse, lissage de la commande, angle max.
4. Charges par essieu : transfert de charge longitudinal.
5. Appui aérodynamique (croît avec le carré de la vitesse).
6. Angles de glissement avant et arrière.
7. Forces de pneu (formule magique).
8. Moteur, frein, marche arrière, contrôle de motricité.
9. Cercle de friction : la force longitudinale consomme du grip latéral.
10. Gravité projetée : pente et dévers.
11. Résistances : roulement et traînée.
12. Intégration semi-implicite, puis correction ESC.

### Pourquoi pas un moteur physique générique ?

Un solveur de corps rigides (cannon-es, Rapier) traite la voiture comme une
boîte qui glisse. Il ne connaît ni le transfert de charge, ni le glissement
des pneus, ni le cercle de friction. Or ce sont précisément ces effets qui
font la différence entre « une boîte qui glisse » et « une voiture ».

C'est la même raison qui fait qu'Unity utilise un `WheelCollider` dédié
plutôt que son solveur de corps rigides.

## L'IA

`core/ai.js` implémente des pilotes automatiques en trois couches :

1. **Trajectoire** : suivi de la ligne de course par « pure pursuit », avec
   correction d'écart latéral proportionnelle à la vitesse.
2. **Vitesse** : planification à reculons. Pour chaque point à `d` mètres,
   on calcule la vitesse maximale permise par la courbure, puis la vitesse
   d'entrée nécessaire pour pouvoir freiner à temps jusqu'à ce point. On
   tient aussi compte de la pente.
3. **Tactique** : évitement des voitures devant, dégagement en marche
   arrière si la voiture est bloquée, contre-braquage quand l'arrière
   décroche.

Les niveaux (`calme`, `confirmé`, `expert`) modifient la latence
d'adhérence visée, la vitesse maximale, l'anticipation et l'agressivité.

## Le rendu

`render/` ne fait que translator l'état de simulation en images :

- `scene.js` : scène, lumières, ciel, post-traitement (bloom, tone mapping) ;
- `trackMesh.js` : maillage de la route (bande de triangles suivant la
  ligne médiane), vibreurs, glissières, décor ;
- `carMesh.js` : la voiture est **construite par code** (aucun modèle 3D
  externe à télécharger) ;
- `camera.js` : caméra de poursuite, avec lissage et anticipation du virage ;
- `effects.js` : effets de vitesse (FOV, flou, lignes de fuite).

## Validation

| Niveau | Outil | Ce qu'il vérifie |
| --- | --- | --- |
| Unitaire | `npm test` | Physique, géométrie, conventions de signe |
| Intégration | `npm run bench` | Chaque circuit est-il pilotable par l'IA ? |
| Visuel | navigateur | Rendu, caméra, HUD, sensations |

Le banc d'essai est la pièce maîtresse : il simule des courses complètes
sans rendu et mesure des métriques objectives — tours bouclés, temps au tour,
pourcentage hors piste, pertes de contrôle, blocages, écart à l'axe.

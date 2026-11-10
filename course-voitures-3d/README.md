# Petites Voitures 3D

Reprise en 3D du jeu de course : moteur physique complet et catalogue de
circuits, autour de [three.js](https://threejs.org/).

> **État du projet — en cours de développement.**
> Le moteur physique et la géométrie des circuits sont terminés et testables,
> mais **le point d'entrée du jeu n'existe pas encore** : il n'y a pas encore
> d'`index.html` ni de `src/main.js`. Le projet n'est donc pas jouable en l'état.

## Installation

```powershell
cd course-voitures-3d
npm install
npm run fetch-textures
```

`fetch-textures` télécharge les textures **CC0** de Poly Haven (asphalte,
gravier, herbe, béton, dalles) dans `public/textures/` — environ 5,6 Mo une fois
optimisées par `tools/optimize-textures.mjs`. Le catalogue des assets, leurs URL
et leurs licences sont listés dans `public/textures/SOURCES.json`.

Les textures sont **versionnées** : elles sont régénérables à l'identique, mais
leur poids reste raisonnable et cela évite un téléchargement à l'installation.

## Modules

```text
src/core/mathx.js     utilitaires mathématiques (clamp, lerp, moveTowards…)
src/core/physics.js   moteur physique du véhicule
src/core/track.js     construction géométrique d'un circuit
src/core/tracks.js    catalogue des circuits
vendor/three/         three.js embarqué (build + quelques modules jsm)
tools/fetch-textures.mjs   téléchargeur de textures
```

Les quatre modules de `src/core/` sont **purs** : aucun accès au DOM, ce qui les
rend utilisables sous Node pour des tests.

## Physique

Modèle bicyclette inspiré de *Vehicle Dynamics* (Pacejka), enrichi pour la 3D :

- **transfert de charge** longitudinal : squat et plongeon ;
- **formule magique** par essieu, avec courbe de dérive simplifiée ;
- **cercle de friction** : la force longitudinale consomme l'adhérence latérale ;
- **gravité projetée** : la pente fait accélérer la voiture en descente, le
  dévers pousse vers l'intérieur du virage ;
- **appui aérodynamique** proportionnel au carré de la vitesse ;
- **ESC** (correction électronique de stabilité) et contrôle de motricité.

Unités SI strictes : mètres, kilogrammes, secondes, newtons.

### Repères

- Monde : **X**, **Y** (haut), **Z** ;
- cap `heading` : `0` = +X, sens trigonométrique dans le plan XZ ;
- véhicule : **x** avant, **y** latéral (vers la droite du conducteur), **z** vertical.

## Circuits

| Identifiant | Nom |
| --- | --- |
| `genets` | Boucle des Genêts |
| `aiguille` | L'Aiguille |
| `cigogne` | La Cigogne |
| `escargot` | L'Escargot |
| `onde` | L'Onde |
| `saut` | Le Saut |

Chaque circuit est décrit par une forme en plan (harmoniques polaires) : la
boucle est fermée par construction, et `track.js` en déduit la géométrie 3D,
la surface roulable, le sens de parcours et les points de contrôle.

## Reste à faire

- [ ] point d'entrée (`index.html` + `src/main.js`) et boucle de rendu ;
- [ ] interface (HUD, menu, résultats) ;
- [ ] pilotes automatiques, en transposant `../course-voitures/js/ai.js` ;
- [ ] tests sous Node des modules `src/core/`.

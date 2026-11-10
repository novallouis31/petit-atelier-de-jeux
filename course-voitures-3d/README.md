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
npm run fetch:textures      # textures CC0 (Poly Haven)
npm run optimize:textures   # compression des textures
```

Scripts disponibles :

| Script | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement Vite |
| `npm run build` | build de production |
| `npm run preview` | prévisualisation du build |
| `npm run fetch:textures` | télécharge les textures Poly Haven (CC0) |
| `npm run optimize:textures` | compresse les textures téléchargées |
| `npm run bench` | banc d'essai IA des circuits |
| `npm test` | tests unitaires (`node --test`) |
| `npm run setup:git` | applique `.gitconfig-projet` au dépôt courant |

`fetch:textures` télécharge les textures **CC0** de Poly Haven (asphalte,
gravier, herbe, béton, dalles) dans `public/textures/` — environ 5,6 Mo une fois
optimisées par `optimize:textures`. Le catalogue des assets, leurs URL et leurs
licences sont listés dans `public/textures/SOURCES.json`.

Les textures sont **versionnées** : elles sont régénérables à l'identique, mais
leur poids reste raisonnable et cela évite un téléchargement à l'installation.

## Modules

```text
src/core/mathx.js     utilitaires mathématiques (clamp, lerp, moveTowards…)
src/core/physics.js   moteur physique du véhicule
src/core/track.js     construction géométrique d'un circuit
src/core/tracks.js    catalogue des circuits
tests/                tests unitaires (node --test)
docs/architecture.md  pourquoi le projet est découpé ainsi
public/textures/      textures CC0 (Poly Haven), versionnées
tools/fetch-textures.mjs       téléchargeur de textures
tools/optimize-textures.mjs    compression des textures
tools/setup-git.mjs             application de la configuration Git du projet
```

`three.js` n'est pas embarqué : il vient de `node_modules` et est résolu par
Vite au moment du build.

## Architecture

Le principe directeur est simple : **`src/core/` ne contient aucune référence au
DOM ni à Three.js**. La simulation s'exécute donc sous Node, sans navigateur et
sans rendu — c'est ce qui rend possible le banc d'essai `npm run bench`.

Le raisonnement complet est dans [`docs/architecture.md`](docs/architecture.md).

## Tests

```powershell
npm test
```

Les tests couvrent le comportement observable du modèle physique
(accélération, freinage, sens de rotation, dérapage au-delà de l'adhérence,
respect des limites du circuit) et la construction géométrique des circuits.

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
- [x] tests sous Node des modules `src/core/`.

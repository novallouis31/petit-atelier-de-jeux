# Course 3D

Reprise en 3D du jeu de course : moteur physique complet, circuits en
relief et adversaires pilotés par une IA, autour de
[three.js](https://threejs.org/).

![Course en 3D](docs/capture-circuit.png)

> **État du projet — jouable.**
> Le jeu se lance (`npm run dev`), les six circuits sont validés par le banc
> d'essai IA, et le rendu 3D est en place : voiture, décor, caméra de
> poursuite et effets de vitesse.

## Installation

Le plus simple, sous Windows : **double-cliquez sur `demarrer.cmd`**, à côté de
`index.html`. Le script installe les dépendances au premier lancement, démarre
le serveur et ouvre le navigateur. Fermer la fenêtre arrête le jeu.

En ligne de commande :

```powershell
cd course-voitures-3d
npm install
npm run dev
```

puis ouvrir l'adresse affichée par Vite (http://127.0.0.1:5173 par défaut).

Le lanceur (`npm start`, ou `node demarrer.mjs`) fait la même chose que
`npm run dev`, avec deux différences : il ouvre le navigateur tout seul, et il
**réutilise un serveur déjà lancé** au lieu d'en démarrer un second. Options :
`--sans-navigateur`, et la variable `PORT` (par défaut 5173).

Les textures sont **versionnées** : `npm run fetch:textures` et
`npm run optimize:textures` ne servent qu'à les régénérer.

Scripts disponibles :

| Script | Rôle |
| --- | --- |
| `npm start` | lance le jeu et ouvre le navigateur (`demarrer.mjs`) |
| `npm run dev` | serveur de développement Vite |
| `npm run build` | build de production |
| `npm run preview` | prévisualisation du build |
| `npm run fetch:textures` | télécharge les textures Poly Haven (CC0) |
| `npm run optimize:textures` | compresse les textures téléchargées |
| `npm run bench` | banc d'essai IA des circuits |
| `npm test` | tests unitaires (`node --test`) |
| `npm run setup:git` | applique la configuration Git du dépôt (script racine) |

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
src/core/ai.js        pilotes automatiques
src/core/race.js      déroulement d'une course (tours, positions, arrivée)
src/core/input.js     correspondance clavier → commandes de conduite
src/render/scene.js   scène, lumières, ciel, post-traitement
src/render/trackMesh.js  maillage de la route, vibreurs, glissières, décor
src/render/carMesh.js    modèle de voiture (construit par code)
src/render/camera.js      caméra de poursuite
src/render/effects.js     shader des effets de vitesse
src/render/speedPass.js   passe de post-traitement (voir docs/rendu.md)
src/ui/interface.js       menu, HUD, résultats
src/main.js         point d'entrée
tests/                tests unitaires (node --test)
docs/architecture.md  pourquoi le projet est découpé ainsi
docs/rendu.md         les pièges du rendu Three.js rencontrés
public/textures/      textures CC0 (Poly Haven), versionnées
tools/fetch-textures.mjs       téléchargeur de textures
tools/optimize-textures.mjs    compression des textures
tools/bench.mjs                  banc d'essai IA des circuits
demarrer.cmd          lanceur Windows (double-clic)
demarrer.mjs          logique du lanceur (Node)
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

Les modules de `src/core/` sont **purs** : aucun accès au DOM, ce qui les rend
utilisables sous Node pour des tests.

## Banc d'essai

```powershell
npm run bench
```

Le banc d'essai fait piloter chaque circuit par l'IA, sans navigateur ni
rendu, et rapporte des métriques objectives : tours bouclés, temps au tour,
pourcentage hors piste, pertes de contrôle, blocages, écart maximal à l'axe
et vitesses atteintes.

Il sert de garde-fou : un circuit n'est livrable que si l'IA le boucle
proprement. Les six circuits sont aujourd'hui validés (notes 93 à 97 sur 100,
0 % hors piste, aucun blocage).

## IA

Les pilotes automatiques combinent trois couches :

- **trajectoire** — suivi de la ligne de course par *pure pursuit*, avec
  correction d'écart latéral de type Stanley ;
- **vitesse** — planification à reculons : la vitesse d'entrée est calculée
  pour pouvoir freiner à temps jusqu'au virage, en tenant compte de la
  courbure et de la pente ;
- **tactique** — évitement et dépassement, contre-braquage quand l'arrière
  décroche, dégagement en marche arrière si la voiture est bloquée.

Trois niveaux : `calme`, `confirmé`, `expert`.

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

- [ ] sons (moteur, adhérence, gravier) ;
- [ ] commandes de rattrapage après une sortie de piste ;
- [x] point d'entrée (`index.html` + `src/main.js`) et boucle de rendu ;
- [x] rendu 3D : maillage de la route, voiture, caméra de poursuite,
      effets de vitesse ;
- [x] interface (HUD, menu, résultats) ;
- [x] moteur physique et géométrie des circuits ;
- [x] pilotes automatiques et banc d'essai hors écran ;
- [x] tests sous Node des modules `src/core/`.

## Notes de rendu

Le rendu Three.js a posé plusieurs pièges, documentés dans
[`docs/rendu.md`](docs/rendu.md) : double conversion sRGB, tone mapping
appliqué deux fois, copie superflue du compositeur, échelle du ciel, ordre
des triangles. Ce sont des erreurs **visibles** mais silencieuses : le jeu
tourne, seule l'image est délavée. Elles ne se trouvent pas à la lecture du
code, mais en comparant des images.

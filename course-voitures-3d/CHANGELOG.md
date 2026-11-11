# Historique des versions

Toutes les versions importantes de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Corrigé

- **La direction à droite était muette.** `KEYMAP` contenait `KeyRight` au
  lieu de `ArrowRight` — un code `KeyboardEvent` qui n'existe pas. La touche
  n'était donc jamais enregistrée, sans aucune erreur. La correspondance
  clavier est désormais dans `src/core/input.js` (module pur, testé sous
  Node) et un test vérifie que chaque code mappé est un code valide.

## [0.2.0]

Le jeu est jouable : rendu 3D, interface et course complète.

### Ajouté

- **Rendu 3D** : scène éclairée (soleil directionnel avec ombres, lumière
  hémisphérique, ciel analytique de Preetham), maillage du circuit (route,
  vibreurs, glissières, terrain, décor, balises), voiture **construite par
  code**, caméra de poursuite et effets de vitesse.
- **Effets de vitesse** : flou radial, lignes de fuite, aberration
  chromatique, vignettage et déformation de l'image en virage, plus
  l'élargissement du champ de vision avec la vitesse.
- **Interface** : menu avec vignettes des six circuits, HUD (compteur de
  vitesse, chronomètre, classement, mini-carte), écran de résultats.
- **Moteur de course** (`src/core/race.js`) : grille de départ, compte à
  rebours, tours, classement, arrivée, et mode démonstration où l'IA pilote
  aussi le joueur.
- **Tests de rendu** (`tests/render.test.js`) : construction du décor,
  orientation des triangles, placement de la caméra et de l'interface.

### Corrigé

- Traînée aérodynamique en `v³` au lieu de `v²`.
- Contre-braquage de l'IA : signe inversé entre les repères 2D et 3D.
- Route et terrain invisibles : triangles dans le mauvais sens.
- Terrain éclairé par en dessous : normales inversées.
- Image délavée : tone mapping et conversion sRGB appliqués deux fois,
  copie superflue du compositeur, échelle du ciel hors du champ de vision.
- Voiture noyée dans le décor : la caméra d'ombre ne suivait pas le joueur.

## [0.1.0]

Socle du projet Course 3D.

### Ajouté

- **Moteur physique** : modèle bicyclette avec transfert de charge
  longitudinal, courbe de dérive de type Pacejka, cercle de friction,
  appui aérodynamique, ESC et contrôle de motricité.
- **Circuits** : six tracés en 3D avec altitude et dévers calculé d'après la
  courbure (Genêts, Aiguille, Cigogne, Escargot, Onde, Saut).
- **IA** : pilotes automatiques (suivi de trajectoire, planification de
  vitesse en fonction de la courbure et de la pente, évitement, dégagement).
- **Outillage** : téléchargement et optimisation des textures Poly Haven
  (CC0), banc d'essai IA des circuits, configuration Git du projet.

### Choix techniques

- Moteur 3D **Three.js** (WebGL 2) : rendu PBR, ombres, tone mapping et
  post-traitement sans installation ni chaîne de compilation.
- Physique **écrite pour le projet** plutôt qu'un moteur générique : un
  solveur de corps rigides ne modélise ni le transfert de charge, ni le
  glissement des pneus, ni le cercle de friction.
- Modules `core/` **sans dépendance au DOM** : la simulation et l'IA sont
  exécutables sous Node, ce qui rend la validation hors écran possible.

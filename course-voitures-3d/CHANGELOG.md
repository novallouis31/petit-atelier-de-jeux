# Historique des versions

Toutes les versions importantes de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Lanceur d'un double-clic** (`demarrer.cmd`, logique dans `demarrer.mjs`,
  aussi accessible par `npm start`). Il vérifie Node, installe les
  dépendances au premier lancement, démarre Vite, ouvre le navigateur, et
  réutilise un serveur déjà lancé au lieu d'en démarrer un second.
- **Quatre nouveaux circuits** (dix au total) : Les Esses (enchaînement de
  S), Le Col (montagne, grand dénivelé), L'Horloge (asymétrique, épingle,
  crépuscule) et Le Village (urbain à angles droits, forme **polygonale**
  avec congés — nouveau type de tracé dans `track.js`).
- **Décor enrichi et instancié** : arbres (trois variétés), rochers,
  buissons, lampadaires, balises de distance, panneaux publicitaires,
  pneus empilés, tribunes, bâtiments des stands, portique de départ.
  Tout passe par `InstancedMesh` : trois cents arbres ne coûtent que
  quatre appels de dessin.
- **Textures procédurales** (`src/render/proceduralTextures.js`) : bandes
  rouge et blanc, bannières, pneus, tribunes, métal, rocher, écorce,
  feuillage, peinture métallisée, carbone, numéro de course. La voiture
  aussi est entièrement texturée (carrosserie pailletée, roues, jantes,
  numéro sur le capot).
- **Validation du rendu** (`src/render/validation.js`, testé sous Node) :
  aucun objet du décor ni de la voiture ne peut rester sans texture ;
  le résultat est exposé par `window.__game.validerRendu()`.

### Corrigé

- **La direction à droite était muette.** `KEYMAP` contenait `KeyRight` au
  lieu de `ArrowRight` — un code `KeyboardEvent` qui n'existe pas. La touche
  n'était donc jamais enregistrée, sans aucune erreur. La correspondance
  clavier est désormais dans `src/core/input.js` (module pur, testé sous
  Node) et un test vérifie que chaque code mappé est un code valide.
- **Glissières invisibles.** Le mur n'était dessiné que d'une seule face,
  orientée vers l'extérieur : vue de la route, elle était éliminée par le
  back-face culling — des murs fantômes que la physique bloquait quand
  même. Le mur a maintenant trois faces (intérieure, extérieure, dessus)
  en `DoubleSide`, plus un rail rayé.
- **Sol troué.** Le terrain n'était qu'un anneau autour de la piste :
  l'intérieur de la boucle et la bande entre route et glissière montraient
  le ciel. Le terrain est désormais une grille complète (4 m de
  résolution) qui couvre toute la zone, avec bandes de gravier (run-off)
  entre la route et les murs.
- **Terrain qui perçait la chaussée déversée.** Sur les circuits à dévers
  (Le Saut, Le Col), la chaussée est inclinée sur le côté : le terrain,
  calculé depuis l'axe seul, restait au-dessus de la chaussée inclinée et
  la perçait d'un escalier de triangles. Le terrain part désormais de la
  **projection** du point sur la piste (`track.locate`), fondue vers le
  profil libre au-delà du run-off. Le maillage et le décor utilisent la
  même projection : sans cela, les objets posés au sol flottaient de
  plusieurs mètres dans les épingles. Un test headless
  (`tests/terrain.test.js`) verrouille ce comportement — le défaut
  n'apparaissait qu'à la capture, sans la moindre erreur en console.

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

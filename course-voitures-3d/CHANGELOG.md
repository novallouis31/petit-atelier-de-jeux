# Historique des versions

Toutes les versions importantes de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

## [0.1.0] — En cours

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

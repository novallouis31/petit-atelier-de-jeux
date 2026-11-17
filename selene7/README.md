# SÉLÉNÉ 7 — Atterrisseur planétaire

Jeu d'atterrissage 2D en vue de côté, sans dépendance ni build.
Ouvrez simplement `index.html` dans un navigateur récent (Chrome, Edge, Firefox, Safari).

Le vaisseau démarre **posé sur sa base**, stable et vertical. La mission ne commence
qu'à la première poussée : on prend son temps, on respire, puis on décolle.

## Mission

La base SELENE est posée à gauche. La zone d'atterrissage balisée se trouve à droite,
plus bas, derrière un terrain accidenté. Il faut :

1. décoller de la plateforme de départ,
2. traverser le relief en gérant vitesse, altitude et carburant,
3. freiner,
4. poser **les deux trains d'atterrissage** dans la zone, avec une vitesse verticale,
   une vitesse horizontale et une inclinaison sous les limites affichées.

Tout contact ailleurs que sur la plateforme cible (ou trop violent) détruit le vaisseau.

## Personnalisation de la mission

Depuis l'écran titre, le bouton **Personnaliser** (ou la touche `C`) ouvre la
configuration. Trois réglages :

- **Le monde** : gravité, densité de l'atmosphère, ciel et textures du terrain ;
- **Le vaisseau** : masse à sec, poussée, carburant, gabarit ;
- **Le mode de vol** : interrupteur **« Assiette réaliste · vaisseau spatial »**.

| Monde | Gravité | Atmosphère | Effet |
| --- | --- | --- | --- |
| Lune | 1,62 m/s² | vide | Trajectoires longues, corrections douces |
| Mars | 3,71 m/s² | ténue | Chute plus rapide, l'air ne freine presque pas |
| Terre | 9,81 m/s² | modérée | Le frein de l'air aide beaucoup, la chute est brutale |
| Titan | 1,35 m/s² | épaisse | Vol lent et flottant, l'air porte le vaisseau |
| Sur mesure | 0,4 à 12 m/s² | 0 à 6 kg/m³ | Valeurs libres |

| Vaisseau | Masse | Poussée/propulseur | Carburant | Caractère |
| --- | --- | --- | --- | --- |
| Classique | 850 kg | 3 000 N | 92 kg | Équilibré, tolérant |
| Éclaireur | 540 kg | 1 950 N | 64 kg | Léger et nerveux, réservoir court |
| Cargo | 1 650 kg | 6 400 N | 165 kg | Stable et puissant, difficile à freiner tard |
| Sur mesure | 400 à 2 000 kg | 1 200 à 7 000 N | 40 à 220 kg | Tout est réglable |

La configuration est conservée dans le navigateur (`localStorage`, clé `selene7.config`).

## Commandes

| Touche | Action |
| --- | --- |
| `←` | Propulseur qui pousse vers la gauche |
| `→` | Propulseur qui pousse vers la droite |
| `Espace` | Les deux propulseurs (poussée verticale) |
| `A` / `Q` | RCS : piquer du nez à gauche *(mode assiette réaliste)* |
| `D` | RCS : piquer du nez à droite *(mode assiette réaliste)* |
| `Entrée` | Décoller (écran titre) |
| `C` | Ouvrir / fermer la configuration |
| `P` / `Échap` | Pause |
| `I` ou bouton `⇄` | Inverser la poussée gauche / droite (préférence conservée) |
| `R` | Rejouer la même mission (même terrain) |
| `N` | Nouvelle mission (terrain aléatoire) |
| `M` | Couper / remettre le son |
| `1` `2` `3` | Difficulté facile / normale / difficile |

Les deux propulseurs sont montés en bas du vaisseau et inclinés à 45°. Leurs axes de
poussée passent par le centre de masse : un seul propulseur pousse donc en diagonale
(vers le haut et sur le côté), les deux ensemble donnent une poussée verticale. C'est
ce qui rend le pilotage intéressant : accélérer latéralement, c'est aussi monter.

### Mode « assiette réaliste · vaisseau spatial »

Dans ce mode (interrupteur de la configuration, désactivé par défaut), le vaisseau
se pilote comme un vrai engin spatial :

- les gyroscopes automatiques sont désactivés : le RCS n'obéit plus qu'à vos
  touches `A` / `D` (gauche / droite), avec un amortissement qui évite l'emballement ;
- **la poussée latérale fait pivoter le vaisseau**, d'un sens ou de l'autre selon
  le propulseur utilisé, proportionnellement à son intensité : pousser vers la
  droite fait pivoter le nez vers la gauche, et inversement (effet pendule — la
  ligne de poussée passe sous le centre de masse, le haut du vaisseau prend du
  retard). Poussée verticale (les deux propulseurs) = pas de moment de tangage ;
- le joueur gère simultanément **vitesse, altitude et assiette** ; un instrument
  d'assiette (horizon artificiel) s'affiche en bas à gauche du HUD, avec l'angle
  en degrés et la vitesse angulaire ;
- les tolérances d'atterrissage restent identiques : il faut se poser droit, à
  force de corrections RCS.

## Physique

- gravité et poussée **proportionnelles** au monde choisi : sur un monde plus lourd,
  la poussée et le carburant embarqué augmentent dans la même proportion, ce qui rend
  chaque monde jouable avec les mêmes réflexes ;
- carburant : la masse du vaisseau = masse à sec + carburant restant, l'accélération
  augmente donc au fur et à mesure que le réservoir se vide ;
- **freinage atmosphérique** : `F = ½ · ρ · CdA · v²`, appliqué sur les deux axes.
  Une atmosphère dense ralentit la chute et permet des approches plus douces ;
- couple réel des propulseurs (léger désaxage volontaire) compensé par un
  contrôle d'attitude à couple limité, visible à l'écran (RCS) ;
  en mode **assiette réaliste**, ce contrôle devient manuel (`A` / `D`) et la
  poussée latérale ajoute un moment de tangage directionnel, proportionnel à
  son intensité (`game.pitchK`) ;
- collisions à impulsion sur un terrain en polyligne : normale de surface, restitution,
  frottement, moment angulaire ;
- intégration à pas fixe `1/240 s` avec accumulateur, indépendante du taux de rafraîchissement.

Les seuils d'atterrissage (vitesses, inclinaison, taille de la zone) dépendent de la
difficulté et sont indiqués dans le HUD. Sur les mondes à forte gravité, les tolérances
de vitesse sont élargies pour que la distance de freinage reste comparable. Le score
récompense le carburant restant, la rapidité, le centrage et la douceur du contact.

## Fichiers

- `index.html` — structure et écrans (titre, configuration, pause, résultat) ;
- `styles.css` — interface ;
- `game.js` — mondes, vaisseaux, monde procédural, physique, rendu et audio.

## Réglages rapides

Tout est regroupé en haut de `game.js` :

- `PLANETS` : gravité, densité d'atmosphère et palette (ciel, terrain, astroïde) ;
- `SHIPS` : masse, poussée, carburant, traînée et gabarit ;
- `DIFFICULTIES` : multiplicateur de carburant, taille de la piste, vitesses, relief ;
- `game.pitchK`, `game.rcsManualK`, `game.rcsDampK` : réglages du mode assiette réaliste ;
- `WORLD` : dimensions du monde ;
- `genTerrain()` : forme du relief et position de la piste.

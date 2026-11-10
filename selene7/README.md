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
configuration. Deux réglages decided :

- **Le monde** : gravité, densité de l'atmosphère, ciel et textures du terrain ;
- **Le vaisseau** : masse à sec, poussée, carburant, gabarit.

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
- `WORLD` : dimensions du monde ;
- `genTerrain()` : forme du relief et position de la piste.

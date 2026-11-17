# MOTO-X — Trial 2D

Jeu de moto trial en vue de côté, dans l'esprit d'Elastomania / X-Moto,
sans dépendance ni build. Ouvrez simplement `index.html` dans un navigateur
récent (Chrome, Edge, Firefox, Safari).

## Mission

Traversez chaque parcours et franchissez le drapeau d'arrivée. Le terrain est
piégeux : bosses, creux, rampes et ravins. Il faut doser la vitesse, garder
l'équilibre en l'air comme au sol, et se retourner quand la pente se raidit.

**Le casque qui touche le sol = chute.** Le niveau redémarre immédiatement à
zéro (chrono remis à zéro, un essai compté en plus).

## Commandes

| Touche | Action |
| --- | --- |
| `↑` | Accélérer (roue arrière, avec glissement réaliste) |
| `↓` | Freiner les **deux roues** |
| `←` | Équilibre : lever l'avant (cabrer / backflip) |
| `→` | Équilibre : faire descendre l'avant (frontflip en l'air) |
| `Espace` | Retourner la moto (demi-tour instantané) |
| `R` | Recommencer le niveau (utile si on est coincé) |
| `P` | Pause |
| `M` | Couper / remettre le son |
| `Échap` | Menu |

## Niveaux

11 parcours répartis en quatre difficultés :

- **Facile** — Balade, Petites bosses, Vaguelettes
- **Normal** — Vallons, Contrebas, Marches
- **Difficile** — Ravins, Muraille, Échiquier
- **Expert** — Volcan, Inferno

Terminer un niveau débloque le suivant. Les meilleurs temps sont conservés
dans le navigateur (`localStorage`, clé `motox.save.v1`).

## Physique

- la moto est un **corps rigide** (châssis + deux roues soudées) avec masse,
  inertie et couple ; les contacts sont résolus à impulsion sur un terrain en
  polyligne (normale de surface, restitution faible, correction de position) ;
- **adhérence de Coulomb** : la force de traction est limitée par
  `µ · N` (µ ≈ 1,15) — trop d'accélération et la roue arrière patine,
  trop de frein et ça dérape ;
- **couple moteur sur la roue** avec glissement : la roue accélère, le
  frottement transforme la rotation en avance ; le patinage projette de la terre ;
- l'accélération et le freinage font naturellement cabrer / piquer la moto
  (la poussée s'applique au niveau du sol, sous le centre de masse) ;
  l'équilibre `←` / `→` complète en l'air comme au sol ;
- intégration à pas fixe **1/240 s**, indépendante du taux de rafraîchissement ;
- points fatals : casque et guidon — tout contact avec le sol est fatal ;
  chute hors du monde = chute mortelle.

## Fichiers

- `index.html` — structure et écrans (menu, fin, pause) ;
- `styles.css` — interface ;
- `game.js` — niveaux, physique, rendu, audio et sauvegarde.

## Réglages rapides

En haut de `game.js` : `ENGINE_TQ` (couple moteur), `BRAKE_TQ` (freinage),
`MU` (adhérence), `LEAN_GND` / `LEAN_AIR` (équilibre), `REACT_K` (tendance au
cabrage), `RESTITUTION` (rebond des roues).

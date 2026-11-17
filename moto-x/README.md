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

- **châssis + masses non suspendues** : le châssis (masse 140 kg, inertie propre)
  porte deux roues de 8 kg reliées par une vraie **suspension ressort-amortisseur**
  le long de l'axe vertical local (raideur 18 kN/m, amortissement compression /
  détente distincts, course 5→34 cm, butées renforcées) ; les roues bougent
  donc réellement par rapport au véhicule, et le bras oscillant / la fourche
  sont dessinés articulés sur la course ;
- **pneu modélisé** : raideur de contact + amortissement, force limitée
  (écrêtage à 9 kN) — les atterrissages s'écrasent dans le pneu puis dans la
  suspension au lieu de faire de violents à-coups de tangage ;
- **adhérence de Coulomb lissée** : la traction est limitée par `µ · N`
  (µ = 1,0) avec une zone de glissement progressive — trop de gaz et la roue
  arrière patine (terre projetée), trop de frein et ça dérape ;
- **transmission des efforts** : la composante le long de l'axe de suspension
  comprime le ressort, la composante longitudinale remonte au châssis à
  l'ancrage — d'où cabrage à l'accélération, stoppie au freinage et
  **transferts de charge** réalistes en appui ;
- **inertie** : masse et inertie accrues, la moto garde son mouvement (une
  rotation engagée en l'air se poursuit et se corrige aux flèches) ; au
  franchissement d'un sommet la moto prend la courbure du terrain (nez qui
  tombe au décollage) — anticipez comme en vrai ;
- moteur sur la roue arrière avec **limiteur de régime** (plus de couple au-delà),
  freinage des deux roues, équilibre du pilote au sol et en l'air ;
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
cabrage), `SUSP_K` / `SUSP_C` / `SUSP_CR` (raideur et amortissements de
suspension), `SUSP_REST` / `SUSP_MIN` / `SUSP_MAX` (course), `TIRE_K` / `TIRE_C`
(pneu), `TIRE_FMAX` (plafond d'effort pneu).

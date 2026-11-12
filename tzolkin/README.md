# Tzolk'in : le calendrier maya

Jeu de plateau jouable dans le navigateur, implémenté en JavaScript sans
framework ni build (scripts classiques).

## Lancer

Ouvrez `index.html` dans un navigateur récent, ou servez le dossier :

```powershell
python -m http.server 8000
# puis http://localhost:8000/tzolkin/
```

Le script `npm run start` n'est pas fourni : le jeu se sert simplement en
ouvrant `index.html`, ou via le serveur HTTP ci-dessus.

## Tests

```powershell
node --test tests/          # 50 tests
node tests/stress.js 300    # banc d'essai : 300 parties simulees
```

Le projet 3D fournit aussi un Node local dans `.tools/` a la racine du depot ;
il n'est pas necessaire ici (Node 20+ suffit).

## Structure

- `js/data.js` : données (engrenages, temples, technologies, bâtiments, tribus, prophéties, actions rapides).
- `js/engine.js` : machine à états (`dispatch`), pile `pending`, file `effects`.
- `js/scoring.js` : score final.
- `js/ui.js` : rendu navigateur (hot-seat).

## Extensions

Activables au démarrage via le menu (cases à cocher) : Tribus, Prophéties,
Actions rapides. Le jeu de base reste jouable sans extension.

## IA

Le menu de démarrage permet de choisir le nombre de joueurs humains ; les
autres sont joués par une IA simple (heuristique). Les joueurs humains et IA
se partagent le même écran (hot-seat).

## Plateau

Les engrenages sont rendus sous forme de roues cliquables (sélection des
cases directement sur la roue). Pour afficher l'image officielle du plateau
en fond, placez-la dans `tzolkin/img/board.jpg` (optionnel).

- La rareté des crânes au jour de famine est évaluée globalement (banque) :
  si la banque ne peut pas fournir tout le monde, personne ne reçoit de crâne.
- La case spéciale de Cit-Bolon-Tum n'est pas exploitée par le bot de
  simulation (choix documenté, non bloquant).
- L'IA des joueurs (bot hot-seat) est rudimentaire ; une IA dédiée est prévue
  dans une seconde phase.

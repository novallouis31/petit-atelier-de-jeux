# Petit Atelier de Jeux

Dépôt regroupant trois projets de jeux web, écrits en JavaScript sans framework
ni build (le projet 3D est le seul à utiliser `three.js`).

| Projet | Dossier | Description |
| --- | --- | --- |
| **Séléné 7** | [`selene7/`](selene7/) | Jeu d'atterrissage planétaire 2D, vue de côté |
| **Petites Voitures** | [`course-voitures/`](course-voitures/) | Jeu de course 2D, vue du dessus, 2 à 4 voitures |
| **Petites Voitures 3D** | [`course-voitures-3d/`](course-voitures-3d/) | Jeu de course 3D, vue par derrière (`three.js`) — jouable |
| **Tzolk'in** | [`tzolkin/`](tzolkin/) | Jeu de plateau maya (calendrier à engrenages), moteur complet + extension Tribes & Prophecies optionnelle |

## Circuits de course

Le jeu 2D propose **cinq circuits**, tous validés par un banc d'essai qui fait
courir l'IA dessus :

| Circuit | Caractère | Longueur | Rayon min |
| --- | --- | --- | --- |
| Boucle des Genêts | rapide, harmonieux, deux longues courbes | 533 m | 40 m |
| L'Aiguille | boucle étirée, deux épingles serrées | 557 m | 23 m |
| La Cigogne | trois grands lobes | 549 m | 46 m |
| L'Escargot | quatre bosses, tracé technique en lacets | 568 m | 44 m |
| L'Onde | sinueux, en permanence dans les esses | 552 m | 47 m |

Le circuit se choisit dans le menu de départ ; le verdict du banc d'essai
(temps au tour, rayon minimal, hors piste) y est affiché.

## Lancer un projet

Les deux jeux 2D n'ont **aucune dépendance** : ouvrez simplement le fichier
`index.html` dans un navigateur récent.

```text
selene7/index.html          → ouvrir directement dans le navigateur
course-voitures/index.html  → ouvrir directement dans le navigateur
```

Pour un serveur local (utile si le navigateur bloque certaines ressources) :

```bash
python -m http.server 8000
# puis http://localhost:8000/selene7/
```

Le projet 3D nécessite Node.js :

```bash
cd course-voitures-3d
npm install
npm run fetch-textures   # textures CC0 (Poly Haven), ~40 Mo
```

## Organisation du dépôt

```text
.
├── selene7/              # Atterrisseur planétaire (jeu complet)
├── tzolkin/              # Jeu de plateau maya (calendrier à engrenages), moteur complet + extension Tribes & Prophecies optionnelle
├── course-voitures/      # Grand Prix 2D (jeu complet)
├── course-voitures-3d/   # Jeu de course 3D (jeu complet)
├── tools/setup-git.mjs   # application de la configuration Git du dépôt
├── tools/publish-github.py # publication du dépôt sur GitHub (PAT)
├── tools/GITKRAKEN.md    # guide d'utilisation de GitKraken
├── .gitattributes        # normalisation des fins de ligne
├── .gitconfig-projet     # réglages Git propres au dépôt
└── .gitignore
```

Chaque projet a son propre `README.md` avec le détail de ses commandes et de sa
physique.

## Git

La branche de travail est `main`. Le dépôt est configuré de façon identique
sous Windows, Linux et macOS :

- **`.gitattributes`** normalise les fins de ligne en **LF** dans le dépôt et
  dans l'arborescence de travail ;
- **`.gitignore`** exclut `node_modules/`, les caches de build, les journaux et
  les fichiers d'éditeur ;
- **`.gitconfig-projet`** décrit les réglages jugés pertinents pour ce dépôt
  (rebases plutôt que fusions, style de conflit `zdiff3`, `rerere`, détection de
  casse, chemins UTF-8 non échappés) ;
- **`tools/setup-git.mjs`** l'applique avec `git config --local` — donc sans
  toucher à la configuration globale de la machine :

```bash
node tools/setup-git.mjs
```

La configuration est unique pour tout le dépôt : le projet 3D l'utilise
aussi via `npm run setup:git` (qui appelle le script racine).

### Publier sur GitHub

Le dépôt est piloté avec [GitKraken](https://www.gitkraken.com/). Le guide
complet (création du Personal Access Token, clone, push, pull request,
résolution de conflits, dépannage) est dans
[`tools/GITKRAKEN.md`](tools/GITKRAKEN.md).

```bash
# publication (crée le dépôt GitHub s'il n'existe pas)
python3 tools/publish-github.py --repo petit-atelier-de-jeux --token ghp_VOTRE_JETON --tags
```

Le jeton est stocké chiffré par GitKraken, jamais dans le dépôt ; le script
vérifie l'absence de secret avant de pousser.

## Conventions

- **Français** pour l'interface, les commentaires et la documentation.
- **UTF-8** sans BOM, fins de ligne **LF** (garanti par `.gitattributes`).
- Nommage : `camelCase` pour le code, `kebab-case` pour les fichiers CSS.
- Aucun bundler : des `<script>` classiques, ce qui permet l'ouverture directe
  des fichiers sur le disque.

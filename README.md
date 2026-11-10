# Petit Atelier de Jeux

Dépôt regroupant trois projets de jeux web, écrits en JavaScript sans framework
ni build (le projet 3D est le seul à utiliser `three.js`).

| Projet | Dossier | Description |
| --- | --- | --- |
| **Séléné 7** | [`selene7/`](selene7/) | Jeu d'atterrissage planétaire 2D, vue de côté |
| **Petites Voitures** | [`course-voitures/`](course-voitures/) | Jeu de course 2D, vue du dessus, 2 à 4 voitures |
| **Petites Voitures 3D** | [`course-voitures-3d/`](course-voitures-3d/) | Moteur et circuits 3D (`three.js`) — en cours |

## Lancer un projet

Les deux jeux 2D n'ont **aucune dépendance** : ouvrez simplement le fichier
`index.html` dans un navigateur récent.

```text
selene7/index.html          → ouvrir directement dans le navigateur
course-voitures/index.html  → ouvrir directement dans le navigateur
```

Pour un serveur local (utile si le navigateur bloque certaines ressources) :

```powershell
python -m http.server 8000
# puis http://localhost:8000/selene7/
```

Le projet 3D nécessite Node.js :

```powershell
cd course-voitures-3d
npm install
npm run fetch-textures   # textures CC0 (Poly Haven), ~40 Mo
```

## Organisation du dépôt

```text
.
├── selene7/              # Atterrisseur planétaire (jeu complet)
├── course-voitures/      # Grand Prix 2D (jeu complet)
├── course-voitures-3d/   # Moteur 3D (en développement)
├── tools/setup-git.mjs   # application de la configuration Git du dépôt
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

```powershell
node tools/setup-git.mjs
```

Le projet 3D embarque le même outillage (`course-voitures-3d/tools/setup-git.mjs`)
pour rester utilisable de façon autonome.

## Conventions

- **Français** pour l'interface, les commentaires et la documentation.
- **UTF-8** sans BOM, fins de ligne **LF** (garanti par `.gitattributes`).
- Nommage : `camelCase` pour le code, `kebab-case` pour les fichiers CSS.
- Aucun bundler : des `<script>` classiques, ce qui permet l'ouverture directe
  des fichiers sur le disque.

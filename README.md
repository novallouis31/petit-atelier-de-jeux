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
├── .gitattributes        # normalisation des fins de ligne
└── .gitignore
```

Chaque projet a son propre `README.md` avec le détail de ses commandes et de sa
physique.

## Conventions

- **Français** pour l'interface, les commentaires et la documentation.
- **UTF-8** sans BOM, fins de ligne **LF** (garanti par `.gitattributes`).
- Nommage : `camelCase` pour le code, `kebab-case` pour les fichiers CSS.
- Aucun bundler : des `<script>` classiques, ce qui permet l'ouverture directe
  des fichiers sur le disque.

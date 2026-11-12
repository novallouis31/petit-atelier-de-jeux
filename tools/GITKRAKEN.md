# GitKraken et Git sur ce depot

Ce depot est pilote avec [GitKraken](https://www.gitkraken.com/) (client
graphique) et l'outillage Git local. La **CLI GitKraken** (`gk`) est
egalement disponible pour les operations scriptables.

## Regles du depot

| Element | Valeur |
|---|---|
| Branche de travail | `main` |
| Depot local | `C:\Users\Louis\Documents\Projet par defaut` |
| Tags | `v0.1.0`, `v0.2.0` |
| Fins de ligne | LF partout (garanti par `.gitattributes`) |
| Configuration Git | `.gitconfig-projet`, appliquee par `tools/setup-git.mjs` |

```powershell
node tools/setup-git.mjs
```

## Se connecter a GitHub

GitKraken utilise un **Personal Access Token** (PAT) pour GitHub. Il est
stocke dans le magasin chiffre de l'application et **jamais** dans le depot.

### Creer le PAT

GitHub > **Settings** > **Developer settings** > **Personal access tokens** >
**Tokens (classic)** > **Generate new token (classic)**.

Perimetres : `repo` (ou `public_repo` si le depot est public).

### Enregistrer le PAT

Dans la CLI GitKraken :

```powershell
gk provider add github -t ghp_VOTRE_JETON
gk provider list
```

Dans l'interface : **File > Preferences > Authentication** > **+** >
**GitHub** > coller le PAT > **Add**.

## Publier le depot

```powershell
# publication complete (cree le depot GitHub s'il n'existe pas)
powershell -ExecutionPolicy Bypass -File tools\publish-github.ps1 `
    -Repo petit-atelier-de-jeux -Token ghp_VOTRE_JETON -Tags
```

Le script verifie avant le push qu'aucun secret n'est versionne, cree le
depot si besoin, configure le remote `origin` et pousse la branche ainsi que
les tags. Le jeton n'est jamais ecrit dans `.git/config`.

Si le jeton est deja enregistre dans GitKraken, utiliser `-UseGitKraken` :

```powershell
powershell -ExecutionPolicy Bypass -File tools\publish-github.ps1 `
    -Repo petit-atelier-de-jeux -UseGitKraken -Tags
```

## Operations courantes

| Action | GitKraken | Ligne de commande |
|---|---|---|
| Historique | onglet **Graph** | `gk graph` |
| Commit | onglet **Uncommitted changes** | `git add -A && git commit` |
| Push | bouton **Push** | `git push origin main` |
| Pull | bouton **Pull** | `git pull --rebase` |
| Branche | **branches > New Branch** | `git switch -c <nom>` |
| Fusion | **branches > Merge** | `git merge <branche>` |
| Pull request | **branches > Create Pull Request** | `gh pr create` |

## Avant de commiter

```powershell
# 1. tests du projet 3D
cd course-voitures-3d; npm test

# 2. tests de Tzolk'in
cd ..\tzolkin; node --test tests/

# 3. etat git
git status
```

Les tests utilisent le Node local du depot si Node 20+ n'est pas dans le
`PATH` :

```powershell
$env:Path="$PWD\.tools\node-v26.13.0-win-x64;$env:Path"
```

## Depannage

| Symptome | Correctif |
|---|---|
| `Authentication failed` | PAT absent, expire ou sans perimetre `repo` |
| `Updates were rejected` | `git pull --rebase origin main` puis `git push` |
| `Could not resolve host github.com` | `ipconfig /flushdns` puis re-tester |
| `Permission denied (publickey)` sur SSH | utiliser HTTPS (le remote du depot est en HTTPS) |
| Fichiers avec `^M` en fin de ligne | `.gitattributes` les normalise ; `git add --renormalize .` |

Test rapide de l'authentification :

```powershell
git ls-remote origin
```

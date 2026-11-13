#!/usr/bin/env python3
"""Publie le depot « Petit Atelier de Jeux » sur GitHub.

Equivalent Python de l'ancien ``tools/publish-github.ps1``.

Le Personal Access Token peut etre fourni par ``--token`` ou par la variable
d'environnement ``GITHUB_TOKEN`` (plus sur pour l'historique du shell). Il est
 egalement enregistre dans le magasin chiffre de la CLI GitKraken
 (``gk provider add github -t ...``) lorsqu'elle est installee.

Le jeton n'est jamais ecrit dans ``.git/config`` : le remote ``origin`` reste
une URL HTTPS propre.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API = "https://api.github.com"

SECRET_PATTERNS = (
    re.compile(r"BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"glpat-[A-Za-z0-9_-]{20,}"),
)


def git(*args: str, cwd: Path) -> str:
    proc = subprocess.run(
        ["git", "-C", str(cwd)] + list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return proc.stdout.decode("utf-8", "replace")


def api(path: str, token: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": "Bearer {}".format(token),
        "User-Agent": "petit-atelier-de-jeux",
        "Accept": "application/vnd.github+json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
        return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            "API GitHub {} : {}".format(exc.code, exc.read().decode("utf-8", "replace")[:300])
        )
    except urllib.error.URLError as exc:
        raise SystemExit("API GitHub injoignable : {}".format(exc))


def scan_secrets(repo: Path) -> list[str]:
    alerts: list[str] = []
    for rel in [ln for ln in git("ls-files", cwd=repo).splitlines() if ln.strip()]:
        path = repo.joinpath(*Path(rel).parts)
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            alerts.append(rel)
    return alerts


def register_in_gitkraken(token: str) -> None:
    """Enregistre le PAT dans le magasin chiffre de la CLI GitKraken."""
    candidates = []
    localappdata = os.environ.get("LOCALAPPDATA")
    if localappdata:
        candidates.append(Path(localappdata) / "GitKrakenCLI" / "gk.exe")
    found = shutil.which("gk")
    if found:
        candidates.append(Path(found))
    for gk in candidates:
        if gk.exists():
            subprocess.run(
                [str(gk), "provider", "add", "github", "-t", token],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
            print("  PAT enregistre dans le magasin chiffre de GitKraken")
            return
    print("  CLI GitKraken introuvable : le PAT n'a pas ete enregistre dans gk")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="publish-github.py",
        description="Publie le depot sur GitHub.",
    )
    parser.add_argument("--repo", default="petit-atelier-de-jeux", help="nom du depot GitHub")
    parser.add_argument("--path", default=str(REPO_ROOT), help="depot local")
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="Personal Access Token (ou variable GITHUB_TOKEN)",
    )
    parser.add_argument("--owner", default="", help="compte proprietaire")
    parser.add_argument("--visibility", default="public", choices=("public", "private"))
    parser.add_argument("--tags", action="store_true", help="pousser aussi les tags")
    args = parser.parse_args(argv)

    repo = Path(args.path).resolve()
    if not (repo / ".git").exists():
        print("Ce dossier n'est pas un depot git : {}".format(repo), file=sys.stderr)
        return 1

    print("=== 1. controle du depot ===")
    branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=repo).strip()
    files = [ln for ln in git("ls-files", cwd=repo).splitlines() if ln.strip()]
    print("  depot   : {}".format(repo))
    print("  branche : {}".format(branch))
    print("  {} fichiers suivis".format(len(files)))
    dirty = [ln for ln in git("status", "--short", cwd=repo).splitlines() if ln.strip()]
    if dirty:
        print("  modifications non commitees :")
        for line in dirty[:10]:
            print("    " + line)
    else:
        print("  arbre propre")

    alerts = scan_secrets(repo)
    if alerts:
        for rel in alerts:
            print("  FUITE : secret detecte dans {}".format(rel), file=sys.stderr)
        print("Publication interrompue : secret detecte", file=sys.stderr)
        return 1
    print("  aucun secret detecte")

    print("")
    print("=== 2. authentification GitHub ===")
    token = args.token
    if not token:
        print("  aucun jeton fourni (--token ou variable GITHUB_TOKEN)", file=sys.stderr)
        return 2
    register_in_gitkraken(token)

    print("")
    print("=== 3. depot GitHub ===")
    owner = args.owner
    if not owner:
        owner = api("/user", token).get("login", "")
        print("  compte : {}".format(owner))
    remote = "https://github.com/{}/{}.git".format(owner, args.repo)
    print("  cible  : {}".format(remote))

    exists = True
    try:
        api("/repos/{}/{}".format(owner, args.repo), token)
    except SystemExit:
        exists = False
    if not exists:
        api(
            "/user/repos",
            token,
            method="POST",
            body={
                "name": args.repo,
                "description": "Petit Atelier de Jeux : quatre jeux web en JavaScript "
                "(Selene 7, Petites Voitures 2D/3D, Tzolk'in), sans build ni framework",
                "private": args.visibility == "private",
                "auto_init": False,
            },
        )
        print("  depot cree ({})".format(args.visibility))
    else:
        print("  depot deja existant")

    print("")
    print("=== 4. remote et push ===")
    git("remote", "remove", "origin", cwd=repo)
    git("remote", "add", "origin", remote, cwd=repo)
    print("  origin -> {}".format(remote))

    push_url = "https://{}:{}@github.com/{}/{}.git".format(owner, token, owner, args.repo)
    push_args = ["push", "-u", push_url, branch]
    if args.tags:
        push_args.append("--tags")
    out = git(*push_args, cwd=repo)
    for line in out.splitlines()[-10:]:
        print("  " + line)
    git("remote", "set-url", "origin", remote, cwd=repo)

    if "rejected" in out or "error" in out.lower():
        print("", file=sys.stderr)
        print("ECHEC du push : verifier que le PAT a le perimetre 'repo'.", file=sys.stderr)
        return 1

    print("")
    print("=== PUBLICATION REUSSIE ===")
    print("  https://github.com/{}/{}".format(owner, args.repo))
    return 0


if __name__ == "__main__":
    sys.exit(main())

/**
 * Applique la configuration Git du dépôt au dépôt courant.
 *
 *   node tools/setup-git.mjs
 *
 * La configuration provient du fichier `.gitconfig-projet` placé à la racine,
 * qui décrit les réglages jugés pertinents pour ce dépôt (normalisation des
 * fins de ligne, fusion en style zdiff3, rerere, etc.). Elle est appliquée avec
 * `git config --local`, donc elle reste propre à ce dépôt et ne touche pas
 * à la configuration globale de la machine.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = join(ROOT, '.gitconfig-projet');

function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...opts,
  });
}

/** Analyse le fichier .gitconfig-projet (format INI simple). */
function parseConfig(text) {
  const entries = [];
  let section = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const kv = line.match(/^(\S+)\s*=\s*(.*)$/);
    if (kv && section) {
      entries.push([section, kv[1], kv[2].trim()]);
    }
  }
  return entries;
}

/**
 * Clés gérées par ce dépôt : elles sont supprimées avant chaque
 * application, ce qui rend le script idempotent.
 *
 * `type` indique le type de valeur attendu par Git. On l'explicite car
 * Git refuse silencieusement certaines valeurs : un booléen invalide
 * (`merge` au lieu de `always`) rend ensuite *toutes* les commandes
 * Git inutilisables.
 */
const MANAGED = {
  'core.autocrlf': 'bool',
  'core.safecrlf': 'bool',
  'core.quotepath': 'bool',
  'core.ignorecase': 'bool',
  'core.compression': 'int',
  'init.defaultbranch': 'string',
  'branch.rebase': 'bool',
  'branch.autosetupmerge': 'string',
  'branch.autosetuprebase': 'string',
  'merge.conflictstyle': 'string',
  'diff.renames': 'string',
  'diff.algorithm': 'string',
  'diff.colormoved': 'string',
  'push.default': 'string',
  'push.followtags': 'bool',
  'push.autosetupremote': 'bool',
  'pull.ff': 'string',
  'fetch.prune': 'bool',
  'fetch.prunetags': 'bool',
  'rebase.autostash': 'bool',
  'rebase.updaterefs': 'bool',
  'rerere.enabled': 'bool',
  'rerere.autoupdate': 'bool',
  'tag.sort': 'string',
  'help.autocorrect': 'string',
};

const MANAGED_KEYS = Object.keys(MANAGED);

function main() {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`Configuration introuvable : ${CONFIG_FILE}`);
    process.exit(1);
  }

  // Le dépôt doit déjà être initialisé.
  try {
    git(['rev-parse', '--git-dir'], { quiet: true });
  } catch {
    git(['init', '-b', 'main']);
    console.log('✓ Dépôt initialisé (branche main)');
  }

  // Nettoyage : on retire les clés gérées pour repartir d'une base propre.
  // Cela rend le script idempotent : une clé devenue inutile disparaît
  // au lieu de subsister en doublon.
  let removed = 0;
  for (const key of MANAGED_KEYS) {
    try {
      git(['config', '--local', '--unset-all', key], { quiet: true });
      removed++;
    } catch {
      /* la clé n'était pas présente */
    }
  }

  const entries = parseConfig(readFileSync(CONFIG_FILE, 'utf8'));
  let applied = 0;
  const failed = [];

  for (const [section, key, value] of entries) {
    try {
      // On valide d'abord : `git config` refuse les valeurs mal formées
      // (un booléen invalide casse toutes les commandes Git suivantes).
      git(['config', '--local', '--type=bool', `${section}.${key}`, value], {
        quiet: true,
      });
    } catch {
      // Ce n'est pas un booléen : on l'écrit tel quel.
      try {
        git(['config', '--local', `${section}.${key}`, value], { quiet: true });
      } catch {
        failed.push(`${section}.${key} = ${value}`);
        continue;
      }
    }
    applied++;
  }

  if (failed.length) {
    console.error('✗ Réglages refusés par Git :');
    for (const f of failed) console.error('    ' + f);
    console.error('\nCorrigez .gitconfig-projet puis relancez le script.');
    process.exit(1);
  }

  console.log(`✓ ${applied} réglages appliqués depuis .gitconfig-projet`);

  // Identité : on ne l'écrase pas si l'utilisateur l'a déjà définie.
  for (const key of ['user.name', 'user.email']) {
    try {
      git(['config', '--local', '--get', key], { quiet: true });
    } catch {
      console.log(
        `⚠ ${key} non défini. Renseignez-le avec :\n` +
          `    git config --local user.name "Votre Nom"\n` +
          `    git config --local user.email "vous@exemple.fr"`
      );
    }
  }

  console.log('\nConfiguration locale du dépôt :');
  console.log(git(['config', '--local', '--list'], { quiet: true }).trim());
}

main();

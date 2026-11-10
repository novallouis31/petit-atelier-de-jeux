/**
 * Applique la configuration Git du projet au dépôt courant.
 *
 *   node tools/setup-git.mjs
 *
 * La configuration provient du fichier `.gitconfig-projet`, qui décrit les
 * réglages jugés pertinents pour ce dépôt (normalisation des fins de ligne,
 * fusion en style zdiff3, rerere, etc.). Elle est appliquée avec
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

  const entries = parseConfig(readFileSync(CONFIG_FILE, 'utf8'));
  let applied = 0;
  for (const [section, key, value] of entries) {
    git(['config', '--local', `${section}.${key}`, value], { quiet: true });
    applied++;
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

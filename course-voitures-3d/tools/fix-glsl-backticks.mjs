/**
 * Retire les backticks des commentaires GLSL.
 *
 * Le code des shaders est écrit dans des template literals JavaScript : un
 * backtick dans un commentaire ferme la chaîne et casse le build. On les
 * remplace par des apostrophes.
 *
 * Usage : node tools/fix-glsl-backticks.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIBLE = join(ROOT, 'src', 'render', 'effects.js');

const BACKTICK = String.fromCharCode(96);

const source = await readFile(CIBLE, 'utf8');

// On ne touche qu'aux portions GLSL (entre les délimiteurs de shader).
const debutShader = source.indexOf('fragmentShader');
const finShader = source.indexOf('}', source.indexOf('`,\n};', debutShader));

if (debutShader < 0 || finShader < 0) {
  console.error('Shader non trouvé.');
  process.exit(1);
}

const avant = source.slice(debutShader, finShader);
const apres = avant.split(BACKTICK).join("'");

if (avant === apres) {
  console.log('✓ Aucun backtick à corriger.');
} else {
  await writeFile(CIBLE, source.slice(0, debutShader) + apres + source.slice(finShader), 'utf8');
  console.log(`✓ ${avant.split(BACKTICK).length - 1} backtick(s) corrigé(s).`);
}

/**
 * Optimisation des textures téléchargées.
 *
 * Les originaux Poly Haven (surtout les cartes de normales en PNG) pèsent
 * très lourd : on les réduit à 1024 px et on recompresse. Les textures
 * finales tiennent ainsi le dépôt Git à une taille raisonnable.
 *
 * Usage : node tools/optimize-textures.mjs
 */
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'textures');

/** Taille maximale du côté long, en pixels. */
const MAX_SIZE = 1024;

async function optimizeFile(file) {
  const full = join(DIR, file);
  const ext = extname(file);
  const before = (await stat(full)).size;

  const pipeline = sharp(full).resize({
    width: MAX_SIZE,
    height: MAX_SIZE,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Fichier temporaire distinct : on n'écrase jamais l'original avant d'avoir
  // vérifié que la version compressée est bien plus légère.
  const tmp = join(DIR, `__tmp__${file}`);
  if (ext === '.png') {
    await pipeline.png({ compressionLevel: 9, palette: true, quality: 82 }).toFile(tmp);
  } else {
    await pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(tmp);
  }

  const after = (await stat(tmp)).size;
  if (after < before) {
    // fs.rename remplace la destination : l'ancien fichier est écrasé par
    // la version compressée. Aucun unlink ici, sinon on supprimerait le
    // fichier que l'on vient d'écrire.
    await rename(tmp, full);
    console.log(`✓ ${file} — ${Math.round(before / 1024)} Ko → ${Math.round(after / 1024)} Ko`);
    return after;
  }
  // Pas de gain : on garde l'original et on jette la version compressée.
  await unlink(tmp);
  console.log(`· ${file} — déjà optimisé (${Math.round(before / 1024)} Ko)`);
  return before;
}

async function main() {
  const files = await readdir(DIR);
  let total = 0;
  for (const file of files) {
    if (!/\.(png|jpg|jpeg)$/i.test(file)) continue;
    total += await optimizeFile(file);
  }
  console.log(`\nTotal textures optimisées : ${Math.round(total / 1024 / 1024, 1)} Mo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

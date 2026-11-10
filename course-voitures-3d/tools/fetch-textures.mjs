/**
 * Téléchargement des textures CC0 depuis Poly Haven (polyhaven.com).
 * Les fichiers retenus sont listés explicitement : URL stables, licence CC0.
 *
 * Usage : node tools/fetch-textures.mjs
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'textures');

/** Base de téléchargement Poly Haven (CC0). */
const DL = 'https://dl.polyhaven.org/file/ph-assets/Textures';

/**
 * Liste des textures retenues.
 *  - asset : identifiant Poly Haven
 *  - map   : carte downloads (diff / nrm / rough)
 *  - res   : résolution
 */
const WANTED = [
  { asset: 'asphalt_02', maps: ['diff', 'nrm', 'rough'], res: '2k' },
  { asset: 'worn_asphalt', maps: ['diff', 'nrm'], res: '2k' },
  { asset: 'grass_ground', maps: ['diff', 'nrm'], res: '2k' },
  { asset: 'gravel_road', maps: ['diff', 'nrm'], res: '1k' },
  { asset: 'concrete', maps: ['diff', 'nrm', 'rough'], res: '1k' },
  { asset: 'checkered_pavement_tiles', maps: ['diff'], res: '1k' },
];

/**
 * Poly Haven sert la diffuse et la roughness en JPEG, mais les cartes de
 * normales uniquement en PNG. On suit donc ce découpage.
 */
const SUFFIX = { diff: 'diff', nrm: 'nor_gl', rough: 'rough' };
const EXT = { diff: 'jpg', nrm: 'png', rough: 'jpg' };

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const item of WANTED) {
    for (const map of item.maps) {
      const suffix = SUFFIX[map];
      const ext = EXT[map];
      const name = `${item.asset}_${suffix}_${item.res}.${ext}`;
      const url = `${DL}/${ext}/${item.res}/${item.asset}/${name}`;
      const dest = join(OUT, name);

      try {
        const existing = await stat(dest);
        if (existing.size > 1024) {
          console.log(`· ${name} (déjà présent, ${Math.round(existing.size / 1024)} Ko)`);
          continue;
        }
      } catch {
        /* pas encore téléchargé */
      }

      try {
        const buf = await fetchBuffer(url);
        await writeFile(dest, buf);
        console.log(`✓ ${name} — ${Math.round(buf.length / 1024)} Ko`);
      } catch (err) {
        console.error(`✗ ${name} — ${err.message}`);
      }
    }
  }

  // Fichier de traçabilité : sources + licence, affichables dans le jeu.
  const manifest = WANTED.map((w) => ({
    asset: w.asset,
    maps: w.maps,
    resolution: w.res,
    source: `https://polyhaven.com/a/${w.asset}`,
    license: 'CC0 (domaine public)',
  }));
  await writeFile(join(OUT, 'SOURCES.json'), JSON.stringify(manifest, null, 2));
  console.log('\nTextures prêtes dans public/textures');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

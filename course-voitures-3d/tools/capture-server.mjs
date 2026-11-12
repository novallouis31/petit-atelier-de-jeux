/**
 * Petit serveur de capture : reçoit une image PNG envoyée par le navigateur
 * et l'écrit sur le disque.
 *
 * Utile pour la validation visuelle : la capture est produite par la page
 * (canvas WebGL), puis écrite ici pour être inspectée.
 *
 * Usage : node tools/capture-server.mjs [port]
 */
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');
const PORT = Number(process.argv[2]) || 4180;

const server = createServer(async (req, res) => {
  // La page (5173) et ce serveur (4180) sont d'origines différentes :
  // sans CORS, le navigateur bloque la capture.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Capture de l\'écran de jeu. POST un corps JSON {nom, data}.');
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');

  try {
    const { nom, data } = JSON.parse(body);
    if (!nom || !data) throw new Error('champs manquants');

    const base64 = data.replace(/^data:image\/png;base64,/, '');
    const cible = join(OUT, nom.endsWith('.png') ? nom : `${nom}.png`);
    await mkdir(dirname(cible), { recursive: true });
    await writeFile(cible, Buffer.from(base64, 'base64'));

    console.log(`✓ capture écrite : ${cible}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, fichier: cible }));
  } catch (err) {
    console.error('✗', err.message);
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, erreur: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serveur de capture sur http://127.0.0.1:${PORT}`);
});

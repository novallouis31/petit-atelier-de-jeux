#!/usr/bin/env node
/**
 * Démarre le jeu en un geste.
 *
 *   • Windows : double-cliquez sur `demarrer.cmd` (juste à côté de index.html)
 *   • partout  : `node demarrer.mjs` ou `npm start`
 *
 * Le script :
 *   1. vérifie que Node est assez récent ;
 *   2. installe les dépendances au premier lancement ;
 *   3. démarre le serveur Vite ;
 *   4. ouvre le navigateur dès que la page répond.
 *
 * Si le serveur tourne déjà, il se contente d'ouvrir le navigateur — pas de
 * deuxième serveur, pas de conflit de port.
 *
 * Options :
 *   --sans-navigateur   ne pas ouvrir le navigateur (utile en test)
 *   PORT=5199           changer le port (variable d'environnement)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = dirname(fileURLToPath(import.meta.url));
const ADRESSE = '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const URL_JEU = `http://${ADRESSE}:${PORT}/`;
const SANS_NAVIGATEUR = process.argv.includes('--sans-navigateur');
const VITE = join(RACINE, 'node_modules', 'vite', 'bin', 'vite.js');

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

/**
 * Lance `npm …` dans le dossier du projet.
 *
 * Sous Windows, `npm` est un script `.cmd` : depuis Node 18.20, `spawn` refuse
 * de l'exécuter directement (EINVAL). On passe donc par `cmd.exe`. L'option
 * `shell: true` ferait la même chose mais déclenche l'avertissement DEP0190
 * (arguments non échappés) — et les arguments sont fixes de toute façon.
 */
function lancerNpm(args) {
  const options = { cwd: RACINE, stdio: 'inherit' };
  if (process.platform === 'win32') {
    const cmd = process.env.ComSpec || 'cmd.exe';
    return spawn(cmd, ['/d', '/s', '/c', 'npm', ...args], options);
  }
  return spawn('npm', args, options);
}

/** Vrai si le port est libre sur l'adresse locale. */
function portLibre(port) {
  return new Promise((resolve) => {
    const serveur = net.createServer();
    serveur.once('error', () => resolve(false));
    serveur.once('listening', () => serveur.close(() => resolve(true)));
    serveur.listen(port, ADRESSE);
  });
}

/** Attend qu'une URL réponde, ou abandonne au bout de `delaiMs`. */
async function attendreServeur(url, delaiMs = 30000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    try {
      const reponse = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (reponse.ok) return true;
    } catch {
      // Pas encore prêt : on réessaie.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Ouvre l'URL dans le navigateur par défaut du système. */
function ouvrirNavigateur(url) {
  const tables = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
  };
  const [commande, args] = tables[process.platform] ?? ['xdg-open', [url]];
  try {
    const enfant = spawn(commande, args, { stdio: 'ignore', detached: true });
    enfant.on('error', () => {
      console.log(`\n  Ouvrez l'adresse à la main : ${url}\n`);
    });
    enfant.unref();
  } catch {
    console.log(`\n  Ouvrez l'adresse à la main : ${url}\n`);
  }
}

/* --------------------------------------------------------------------------
   Programme
   -------------------------------------------------------------------------- */

async function main() {
  const majeur = Number(process.versions.node.split('.')[0]);
  if (Number.isNaN(majeur) || majeur < 20) {
    console.error(
      `\n  Node.js ${process.versions.node} est trop ancien.\n` +
        '  Il faut Node.js 20 ou plus récent : https://nodejs.org/\n'
    );
    process.exitCode = 1;
    return;
  }

  // --- dépendances ---
  if (!existsSync(VITE)) {
    console.log('\n  Première fois : installation des dépendances (npm install)…\n');
    const code = await new Promise((resolve) => {
      lancerNpm(['install']).on('exit', (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      console.error(
        '\n  npm install a échoué. Vérifiez votre connexion, puis relancez.\n'
      );
      process.exitCode = 1;
      return;
    }
  }

  // --- serveur déjà lancé ? ---
  if (!(await portLibre(PORT))) {
    if (await attendreServeur(URL_JEU, 3000)) {
      console.log(`\n  Le jeu tourne déjà : ${URL_JEU}`);
      console.log('  (ctrl+C dans la fenêtre du serveur pour l’arrêter)\n');
      if (!SANS_NAVIGATEUR) ouvrirNavigateur(URL_JEU);
      return;
    }
    console.error(
      `\n  Le port ${PORT} est occupé par un autre programme.\n` +
        `  Libérez-le, ou choisissez un autre port :\n` +
        '    set PORT=5199 && demarrer.cmd\n'
    );
    process.exitCode = 1;
    return;
  }

  // --- démarrage ---
  // Vite est lancé directement par le Node courant : plus rapide qu'un
  // `npm run dev`, et l'arrêt (ctrl+C, fermeture de la fenêtre) est direct.
  console.log('\n  Démarrage du jeu…\n');
  const serveur = spawn(
    process.execPath,
    [VITE, '--port', String(PORT), '--host', ADRESSE, '--strictPort'],
    { cwd: RACINE, stdio: 'inherit' }
  );

  let arrete = false;
  let arretVoulu = false;
  serveur.on('exit', (code) => {
    arrete = true;
    if (code && !arretVoulu) {
      console.error(`\n  Le serveur s'est arrêté (code ${code}).\n`);
    }
  });
  const interrompre = () => {
    arretVoulu = true;
    serveur.kill();
  };
  process.on('SIGINT', interrompre);
  process.on('SIGTERM', interrompre);

  const pret = await attendreServeur(URL_JEU, 60000);
  if (!pret) {
    if (!arrete) {
      console.error(
        `\n  Le serveur n'a pas répondu sur ${URL_JEU}.\n` +
          '  Regardez les messages ci-dessus.\n'
      );
      arretVoulu = true;
      serveur.kill();
      process.exitCode = 1;
    }
    return;
  }
  if (arrete) return;

  console.log(`\n  Le jeu est prêt : ${URL_JEU}\n`);
  console.log('  ↑↓ accélérer / freiner · ←→ diriger · Espace frein à main');
  console.log('  C caméra · P pause · R recommencer · Entrée démarrer');
  console.log('\n  Fermez cette fenêtre (ou ctrl+C) pour arrêter le jeu.\n');

  if (!SANS_NAVIGATEUR) ouvrirNavigateur(URL_JEU);
}

main().catch((erreur) => {
  console.error(`\n  Erreur inattendue : ${erreur.message}\n`);
  process.exitCode = 1;
});
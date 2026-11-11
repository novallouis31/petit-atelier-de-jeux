/**
 * Point d'entrée du jeu.
 *
 * Assemble la simulation (`src/core/`) et le rendu (`src/render/`) :
 *  - charge le circuit demandé et construit son décor ;
 *  - crée les voitures et les place sur la grille de départ ;
 *  - fait tourner la boucle : entrées → simulation → rendu ;
 *  - gère les écrans (menu, course, pause, résultats).
 */

import * as THREE from 'three';
import { TRACKS, TRACK_IDS } from './core/tracks.js';
import { buildTrack } from './core/track.js';
import { bindTrack } from './core/physics.js';
import { Race, STEP, TOTAL_LAPS } from './core/race.js';
import { KEYMAP, readInput as readInputFromKeys, toCarInput } from './core/input.js';
import { createScene, resizeScene } from './render/scene.js';
import { buildTrackScene, disposeTrackScene } from './render/trackMesh.js';
import { buildCar, updateCarMesh, PLAYER_COLORS } from './render/carMesh.js';
import { ChaseCamera, CAMERA_MODES } from './render/camera.js';
import { SpeedEffects } from './render/effects.js';
import { Interface } from './ui/interface.js';

/* --------------------------------------------------------------------------
   État global
   -------------------------------------------------------------------------- */

const canvas = document.getElementById('scene');
const etat = {
  track: null,
  trackId: null,
  decor: null,
  race: null,
  ctx: null,
  camera: null,
  effects: new SpeedEffects(),
  cars: [],
  cameraMode: 0,
  accumulator: 0,
  lastTime: performance.now(),
  lastCountShown: null,
  muted: false,
  /** Mode démonstration : l'IA pilote aussi le joueur. */
  demo: false,
  /** Décalage du soleil par rapport à la cible d'ombre (qui suit la voiture). */
  soleilOffset: new THREE.Vector3(60, 150, 80),
};

/* --------------------------------------------------------------------------
   Entrées clavier
   -------------------------------------------------------------------------- */

const keys = new Set();

/**
 * Lit les commandes du joueur.
 *
 * La correspondance clavier est dans `src/core/input.js`, qui est testée
 * sous Node : une erreur de code y rend une touche muette sans lever
 * d'erreur, ce qui est exactement le genre de bug que l'on ne voit qu'en
 * jouant.
 */
function readInput() {
  return toCarInput(readInputFromKeys(keys));
}

window.addEventListener('keydown', (e) => {
  if (e.code in KEYMAP) {
    e.preventDefault();
    keys.add(e.code);
  }

  switch (e.code) {
    case 'KeyR':
      if (etat.race && etat.race.mode !== 'menu') startRace();
      break;
    case 'KeyP':
    case 'Escape':
      togglePause();
      break;
    case 'KeyC': {
      etat.cameraMode = (etat.cameraMode + 1) % CAMERA_MODES.length;
      etat.camera.setMode(etat.cameraMode);
      ui.toast(`CAMÉRA · ${CAMERA_MODES[etat.cameraMode].nom.toUpperCase()}`);
      break;
    }
    case 'KeyM':
      etat.muted = !etat.muted;
      ui.toast(etat.muted ? 'SON COUPÉ' : 'SON ACTIVÉ', 1100);
      break;
    case 'Enter':
    case 'NumpadEnter':
      if (!etat.race || etat.race.mode === 'menu' || etat.race.mode === 'finished') {
        startRace();
      }
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  if (etat.race && etat.race.mode === 'racing') togglePause();
});

/* --------------------------------------------------------------------------
   Chargement d'un circuit
   -------------------------------------------------------------------------- */

/** Charge un circuit et reconstruit son décor. */
function loadTrack(trackId) {
  const def = TRACKS[trackId];
  if (!def) return;

  etat.trackId = trackId;
  etat.track = buildTrack(def);

  // On branche la géométrie sur le moteur physique.
  bindTrack(
    (s) => etat.track.pointAtS(s),
    (x, z, hint) => etat.track.locate(x, z, hint),
    () => etat.track.runoff
  );

  // Décor.
  if (etat.decor) {
    etat.ctx.scene.remove(etat.decor);
    disposeTrackScene(etat.decor);
  }
  etat.decor = buildTrackScene(etat.track);
  etat.ctx.scene.add(etat.decor);

  // Thème : le ciel, les lumières et le brouillard dépendent du circuit.
  applyTheme(def.theme);

  etat.race = new Race({
    track: etat.track,
    bindTrack: () => {},
    cars: ui ? ui.cars : 4,
    aiLevel: ui ? ui.aiLevel : 'confirme',
    demo: etat.demo,
  });

  buildCars();
  etat.camera.snap();
}

/** Applique le thème visuel d'un circuit à la scène. */
function applyTheme(theme) {
  const { scene, dir, sky } = etat.ctx;

  scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);

  const phi = THREE.MathUtils.degToRad(90 - theme.sun.elevation * 90);
  const theta = THREE.MathUtils.degToRad(theme.sun.azimuth * 360);
  sky.material.uniforms.sunPosition.value.setFromSphericalCoords(1, phi, theta);

  // Décalage du soleil par rapport à sa cible (qui suit la voiture).
  // La distance est bornée par la portée de la caméra d'ombre (260 m),
  // sinon la shadow map est trop grossière et tout le relief passe à
  // l'ombre.
  const direction = new THREE.Vector3().setFromSphericalCoords(150, phi, theta);
  etat.soleilOffset = direction.clone();

  dir.position.copy(direction);
  dir.color.setHex(theme.key);

  // La lumière hémisphérique est retrouvée via la scène.
  scene.traverse((obj) => {
    if (obj.isHemisphereLight) {
      obj.color.setHex(theme.fill);
      obj.groundColor.setHex(theme.ambient);
    }
  });
}

/** (Re)crée les voitures visibles. */
function buildCars() {
  // On retire les anciennes.
  for (const entry of etat.cars) {
    etat.ctx.scene.remove(entry.mesh);
    entry.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }
  etat.cars = [];

  if (!etat.race) return;

  for (const entry of etat.race.entries) {
    const colors = PLAYER_COLORS[entry.index % PLAYER_COLORS.length];
    const mesh = buildCar({
      couleur: colors.couleur,
      secondaire: colors.secondaire,
    });
    mesh.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    etat.ctx.scene.add(mesh);
    etat.cars.push({ entry, mesh });
  }
}

/* --------------------------------------------------------------------------
   Déroulement
   -------------------------------------------------------------------------- */

function startRace() {
  if (!etat.race) return;

  etat.race.aiLevel = ui.aiLevel;
  etat.race.nbCars = ui.cars;
  etat.race.start();

  buildCars();
  etat.camera.snap();
  etat.lastCountShown = null;
  etat.accumulator = 0;

  ui.showPanel(null);
  ui.toast(
    `${TRACKS[etat.trackId].name.toUpperCase()} · ${TOTAL_LAPS} TOURS`,
    2200
  );
}

function togglePause() {
  if (!etat.race) return;
  if (etat.race.mode === 'racing') {
    etat.race.pause();
    ui.showPanel('pause');
  } else if (etat.race.mode === 'paused') {
    etat.race.resume();
    ui.showPanel(null);
  }
}

function goToMenu() {
  if (!etat.race) return;
  etat.race.mode = 'menu';
  etat.race.reset();
  buildCars();
  etat.camera.snap();
  ui.showPanel('menu');
}

/* --------------------------------------------------------------------------
   Boucle principale
   -------------------------------------------------------------------------- */

function frame(now) {
  const raw = (now - etat.lastTime) / 1000;
  etat.lastTime = now;
  const dt = Math.min(0.05, Math.max(0, raw));
  const race = etat.race;

  if (race) {
    // --- simulation ---
    if (race.mode === 'countdown') {
      const before = race.countdown;
      race.step(dt, [readInput()]);
      const n = Math.ceil(race.countdown);
      if (n !== etat.lastCountShown) {
        etat.lastCountShown = n;
        if (n > 0) ui.showCountdown(String(n), false);
        else {
          ui.showCountdown('GO', true);
          ui.hideCountdown();
        }
      }
      void before;
    } else if (race.mode === 'racing') {
      etat.accumulator += dt;
      let steps = 0;
      while (etat.accumulator >= STEP && steps < 8 && race.mode === 'racing') {
        race.step(STEP, [readInput()]);
        etat.accumulator -= STEP;
        steps++;
      }
      if (steps >= 8) etat.accumulator = 0;

      if (race.goTimer > 0) {
        race.goTimer -= dt;
        if (race.goTimer <= 0) ui.hideCountdown();
      }

      if (race.mode === 'finished') {
        ui.showResults(race);
      }
    } else {
      etat.accumulator = 0;
    }

    // --- animation des voitures ---
    for (const { entry, mesh } of etat.cars) {
      updateCarMesh(mesh, entry.car, race.mode === 'racing' ? dt : 0);

      // Les chocs font vibrer la caméra.
      const car = entry.car;
      if (car.wallImpact > 0.25 && entry.index === 0) {
        etat.camera.addShake(car.wallImpact * 0.6);
        car.wallImpact = 0;
      }
      if (car.collisionImpact > 0.25 && entry.index === 0) {
        etat.camera.addShake(car.collisionImpact * 0.45);
        car.collisionImpact = 0;
      }
    }

    // --- caméra et effets ---
    const joueur = race.entries[0];
    if (joueur) {
      etat.camera.update(joueur.car, dt, etat.track);
      etat.effects.update(joueur.car, race.mode === 'racing' ? dt : 0);

      // La caméra d'ombre suit la voiture : sinon la zone d'ombre reste
      // centrée sur l'origine du circuit et noircit tout le terrain.
      const cible = etat.ctx.dir.target;
      cible.position.set(joueur.car.x, joueur.car.y, joueur.car.z);
      cible.updateMatrixWorld();
      etat.ctx.dir.position.set(
        cible.position.x + etat.soleilOffset.x,
        cible.position.y + etat.soleilOffset.y,
        cible.position.z + etat.soleilOffset.z
      );

      // On décale légèrement la projection : sans cela, la voiture se
      // projette sa propre ombre dessus et paraît noire.
      etat.ctx.dir.shadow.camera.updateProjectionMatrix();
    }

    // --- ui ---
    if (race.mode !== 'menu') ui.updateHUD(race);
  }

  // --- rendu ---
  etat.effects.apply(etat.ctx.speedPass.uniforms);
  etat.ctx.composer.render();

  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Démarrage
   -------------------------------------------------------------------------- */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  resizeScene(etat.ctx, w, h);
}

const ui = new Interface({
  onStart: () => startRace(),
  onTrackChange: (trackId) => {
    loadTrack(trackId);
    ui.drawThumbnails((id) => buildTrack(TRACKS[id]));
  },
  onRestart: () => startRace(),
  onMenu: () => goToMenu(),
  onResume: () => {
    etat.race.resume();
    ui.showPanel(null);
  },
  onPause: () => togglePause(),
});

// La scène doit exister avant le premier chargement de circuit.
etat.ctx = createScene(canvas, TRACKS[TRACK_IDS[0]].theme);
etat.camera = new ChaseCamera(etat.ctx.camera);

window.addEventListener('resize', resize);
resize();

loadTrack(ui.trackId);
ui.drawThumbnails((id) => buildTrack(TRACKS[id]));
ui.syncSetup();
ui.showPanel('menu');

requestAnimationFrame(frame);

// Petit API de débogage (utile pour l'intégration continue).
window.__game = {
  etat,
  startRace,
  togglePause,
  goToMenu,
  loadTrack,
  ui,
  /**
   * Force le rendu d'une image sans attendre `requestAnimationFrame`.
   * Utile quand la boucle est bridée (onglet en arrière-plan) : on avance
   * alors le temps de simulation manuellement.
   */
  renderOnce(dt = 1 / 60) {
    etat.lastTime = performance.now() - dt * 1000;
    frame(performance.now());
  },
  /** Active le mode démonstration (l'IA pilote le joueur). */
  setDemo(actif) {
    etat.demo = !!actif;
    if (etat.race) {
      etat.race.demo = etat.demo;
      etat.race.reset();
      buildCars();
      etat.camera.snap();
    }
  },
  /** État des touches et des commandes (diagnostic). */
  debugEntrees() {
    return {
      touches: [...keys],
      commandes: readInput(),
    };
  },
};

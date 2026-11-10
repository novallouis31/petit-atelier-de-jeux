/**
 * Tests du modèle physique du véhicule.
 *
 * On vérifie le comportement observable : une voiture accélère, freine,
 * tourne du bon côté, dérape quand elle dépasse l'adhérence, et respecte
 * les limites du circuit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { PHYS, createCarState, resetCar, stepCar, bindTrack, resolveCarCollisions } from '../src/core/physics.js';

const DT = 1 / 180;

/**
 * Circuit d'essai quasi rectiligne (très grand rayon) : la voiture peut y
 * rouler droit sans sortir de la piste, ce qui permet de tester la
 * physique indépendamment du tracé.
 */
const STRAIGHT_DEF = {
  id: 'test',
  name: 'Droit',
  blurb: '',
  rx: 6000,
  ry: 6000,
  harmonics: [],
  elevation: [],
  startT: 0,
  width: 60,
  runoff: 40,
  spacing: 0.7,
  bank: 0,
};

/** Branche un circuit sur le moteur physique et renvoie la piste. */
function setup(trackId = 'genets') {
  const track =
    trackId === 'straight' ? buildTrack(STRAIGHT_DEF) : buildTrack(TRACKS[trackId]);
  bindTrack(
    (s) => track.pointAtS(s),
    (x, z, hint) => track.locate(x, z, hint),
    () => track.runoff
  );
  currentTrack = track;
  return track;
}

/** Fait avancer une voiture de `seconds` avec des entrées constantes. */
function drive(car, inputs, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    Object.assign(car.input, inputs);
    stepCar(car, DT);
  }
}

/** Piste actuellement branchée sur le moteur physique. */
let currentTrack = null;

/** Localise une voiture sur la piste courante (aide de test). */
function trackLocate(car) {
  return currentTrack.locate(car.x, car.z, car.idx);
}

test('la voiture accélère sous l’accélérateur', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 6);
  assert.ok(car.u > 12, `vitesse trop faible (${car.u.toFixed(1)} m/s)`);
  assert.ok(car.u < 70, `vitesse excessive (${car.u.toFixed(1)} m/s)`);
});

test('la voiture freine', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 6);
  const avant = car.u;
  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 1.5);
  assert.ok(car.u < avant - 8, `le freinage est trop faible (${avant.toFixed(1)} -> ${car.u.toFixed(1)})`);
});

test('le freinage est franc et réaliste', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 5);
  const avant = car.u;
  assert.ok(avant > 15, 'la voiture doit atteindre une bonne vitesse avant de freiner');

  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 1);
  const apres = car.u;
  const deceleration = (avant - apres) / 1;
  // Une voiture de course décélère de l'ordre de 10 à 15 m/s².
  assert.ok(deceleration > 8, `freinage trop faible (${deceleration.toFixed(1)} m/s²)`);
  assert.ok(deceleration < 20, `freinage irréaliste (${deceleration.toFixed(1)} m/s²)`);

  // Frein relâché : plus d'accélération, la voiture ne repart pas.
  const auReleve = car.u;
  drive(car, { throttle: 0, brake: 0, steer: 0, hand: false }, 1);
  assert.ok(car.u <= auReleve + 0.05, 'la voiture ne doit pas accélérer sans pédale');
});

test('le frein tenu à l’arrêt engage la marche arrière', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);

  // On freine en surveillant le passage par zéro : c'est l'instant d'arrêt.
  let vitesseMin = Infinity;
  for (let i = 0; i < 180 * 3; i++) {
    Object.assign(car.input, { throttle: 0, brake: 1, steer: 0, hand: false });
    stepCar(car, DT);
    vitesseMin = Math.min(vitesseMin, Math.abs(car.u));
  }
  assert.ok(vitesseMin < 1.0, `la voiture ne s’arrête pas (minimum ${vitesseMin.toFixed(2)} m/s)`);

  // Le frein maintenu finit par engager la marche arrière.
  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 1.5);
  assert.ok(car.u < -0.5, `la marche arrière ne s’engage pas (${car.u.toFixed(2)} m/s)`);
});

test('une direction à droite fait tourner la voiture vers la droite', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  const capAvant = car.heading;
  const lateralAvant = trackLocate(car).lateral;
  drive(car, { throttle: 1, brake: 0, steer: 1, hand: false }, 0.6);
  // Cap positif = lacet vers la droite (convention du projet).
  assert.ok(car.heading - capAvant > 0.05, `le virage à droite n’est pas établi (${(car.heading - capAvant).toFixed(3)} rad)`);
  assert.ok(car.r > 0, 'la vitesse de lacet devrait être positive');
  // La voiture doit aussi dériver vers la droite de la piste.
  assert.ok(trackLocate(car).lateral > lateralAvant, 'la voiture ne dérive pas vers la droite');
});

test('une direction à gauche fait tourner la voiture vers la gauche', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  const capAvant = car.heading;
  const lateralAvant = trackLocate(car).lateral;
  drive(car, { throttle: 1, brake: 0, steer: -1, hand: false }, 0.6);
  assert.ok(car.heading - capAvant < -0.05, 'le virage à gauche n’est pas établi');
  assert.ok(car.r < 0, 'la vitesse de lacet devrait être négative');
  assert.ok(trackLocate(car).lateral < lateralAvant, 'la voiture ne dérive pas vers la gauche');
});

test('la voiture reste à plat sur une route horizontale', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 3);
  // Le tangage ne doit jamais devenir fou.
  assert.ok(Math.abs(car.pitch) < 0.25, `tangage aberrant (${car.pitch.toFixed(3)} rad)`);
});

test('la voiture suit la hauteur de la route', () => {
  const track = setup('saut');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  const loc = track.locate(car.x, car.z, car.idx);
  assert.ok(
    Math.abs(car.y - loc.height) < 1.5,
    `la voiture ne suit pas la route (écart ${(car.y - loc.height).toFixed(2)} m)`
  );
});

test('la voiture reste dans les limites de la piste', () => {
  const track = setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  // On la lance tout droit : elle doit rester sur la route ou au pire dans
  // le run-off, jamais s'envoyer.
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 10);
  const loc = track.locate(car.x, car.z, car.idx);
  assert.ok(loc.dist < track.halfWidth + track.runoff + 2, `la voiture a quitté la piste (${loc.dist.toFixed(1)} m)`);
});

test('le transfert de charge agit dans le bon sens', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 3);
  // En accélération, l'essieu arrière est plus chargé que l'avant.
  assert.ok(car.fzR > car.fzF, `l’essieu arrière devrait être chargé (${car.fzR.toFixed(0)} vs ${car.fzF.toFixed(0)})`);

  const car2 = createCarState(1);
  resetCar(car2, 0.5, 0);
  drive(car2, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  drive(car2, { throttle: 0, brake: 1, steer: 0, hand: false }, 0.6);
  // En freinage, l'inverse se produit.
  assert.ok(car2.fzF > car2.fzR, `l’essieu avant devrait être chargé (${car2.fzF.toFixed(0)} vs ${car2.fzR.toFixed(0)})`);
});

test('la friction circle limite l’adhérence disponible', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  // Virage serré à grande vitesse : l'ESS ne doit pas laisser la voiture
  // partir en tête-à-queue.
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 6);
  drive(car, { throttle: 1, brake: 0, steer: 1, hand: false }, 3);
  const limite = (PHYS.muRoad * PHYS.gravity) / Math.max(car.u, 3);
  assert.ok(Math.abs(car.r) <= limite * 1.05, `le lacet dépasse la limite d’adhérence (${car.r.toFixed(2)} > ${limite.toFixed(2)})`);
});

test('le frein à main réduit l’adhérence arrière', () => {
  setup('straight');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 5);
  const avant = car.u;
  // Sans frein à main, la voiture continue tout droit.
  drive(car, { throttle: 0, brake: 0, steer: 0, hand: false }, 1.2);
  const sansMain = car.u;
  assert.ok(sansMain > avant - 2, `la voiture ne devrait pas ralentir seule (${sansMain.toFixed(1)})`);

  // Même situation avec le frein à main : les roues arrière sont bloquées,
  // la voiture perd de l'adhérence et ralentit nettement plus.
  const car2 = createCarState(1);
  resetCar(car2, 0.5, 0);
  drive(car2, { throttle: 1, brake: 0, steer: 0, hand: false }, 5);
  drive(car2, { throttle: 0, brake: 0, steer: 0, hand: true }, 1.2);
  assert.ok(car2.u < sansMain - 1, `le frein à main devrait ralentir davantage (${car2.u.toFixed(1)} vs ${sansMain.toFixed(1)})`);
});

test('les collisions entre voitures les repoussent', () => {
  setup();
  const a = createCarState(0);
  const b = createCarState(1);
  resetCar(a, 0.5, 0);
  resetCar(b, 0.5, 1.6);
  // On les superpose presque et on résout les collisions.
  b.x = a.x + 0.4;
  b.z = a.z;
  const distance = Math.hypot(a.x - b.x, a.z - b.z);
  resolveCarCollisions([a, b]);
  const apres = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(apres > distance, 'les voitures ne se sont pas repoussées');
});

test('la marche arrière fonctionne', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 2.5);
  assert.ok(car.u < -0.5, `la marche arrière ne fonctionne pas (${car.u.toFixed(2)} m/s)`);
  assert.ok(car.u > -PHYS.maxReverseSpeed - 1, 'la marche arrière n’est pas bridée');
});

test('le cap de la voiture suit la direction de la piste au départ', () => {
  const track = setup('aiguille');
  const car = createCarState(0);
  resetCar(car, 0.25, 0);
  const p = track.pointAtS(0.25);
  const attendu = Math.atan2(p.tz, p.tx);
  let ecart = car.heading - attendu;
  while (ecart > Math.PI) ecart -= Math.PI * 2;
  while (ecart < -Math.PI) ecart += Math.PI * 2;
  assert.ok(Math.abs(ecart) < 1e-6, `cap initial incorrect (écart ${ecart})`);
});

test('la simulation reste stable sur une longue durée', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0.3, hand: false }, 30);
  assert.ok(Number.isFinite(car.u) && Number.isFinite(car.x) && Number.isFinite(car.r), 'la simulation a divergé');
  assert.ok(Math.abs(car.u) < 100, `vitesse aberrante (${car.u})`);
});

test('la gravité agit dans le sens de la pente', () => {
  // Pente régulière : la voiture doit perdre de la vitesse en montant et
  // en gagner en descendant, à moteur coupé.
  const penteDef = {
    id: 'pente',
    name: 'Pente',
    blurb: '',
    rx: 400,
    ry: 400,
    harmonics: [],
    // Altitude en rampe : le tracé monte puis descend (harmonique n=1).
    elevation: [{ n: 1, a: 40, p: 0 }],
    startT: 0,
    width: 40,
    runoff: 20,
    spacing: 0.7,
    bank: 0,
  };
  const track = buildTrack(penteDef);
  bindTrack(
    (s) => track.pointAtS(s),
    (x, z, hint) => track.locate(x, z, hint),
    () => track.runoff
  );
  currentTrack = track;

  // On trouve le point le plus en pente et le point le plus en descente.
  let pointHaut = null;
  let pointBas = null;
  for (const p of track.pts) {
    if (!pointHaut || p.ty > pointHaut.ty) pointHaut = p;
    if (!pointBas || p.ty < pointBas.ty) pointBas = p;
  }
  assert.ok(pointHaut.ty > 0.05, 'la pente attendue n’existe pas');
  assert.ok(pointBas.ty < -0.05, 'la descente attendue n’existe pas');

  // En montée, la voiture qui roule sur le côté droit (là où la route
  // descend) doit descendre plus vite que celle du côté gauche.
  const mesure = (p, lateral) => {
    const car = createCarState(0);
    resetCar(car, p.s, lateral);
    // On impose une vitesse initiale et on mesure la variation.
    car.u = 20;
    for (let i = 0; i < 180; i++) {
      Object.assign(car.input, { throttle: 0, brake: 0, steer: 0, hand: false });
      stepCar(car, DT);
    }
    return car.u - 20;
  };

  // Pente dans le sens de la marche (ty > 0) : la gravité doit ralentir.
  const delta = mesure(pointHaut, 0);
  assert.ok(delta < 0, `la gravité ne freine pas en montée (${delta.toFixed(2)} m/s)`);
});

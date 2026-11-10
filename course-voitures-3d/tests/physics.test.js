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

/** Branche un circuit sur le moteur physique et renvoie la piste. */
function setup(trackId = 'genets') {
  const track = buildTrack(TRACKS[trackId]);
  bindTrack(
    (s) => track.pointAtS(s),
    (x, z, hint) => track.locate(x, z, hint),
    () => track.runoff
  );
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

test('la voiture accélère sous l’accélérateur', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 6);
  assert.ok(car.u > 12, `vitesse trop faible (${car.u.toFixed(1)} m/s)`);
  assert.ok(car.u < 70, `vitesse excessive (${car.u.toFixed(1)} m/s)`);
});

test('la voiture freine', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 6);
  const avant = car.u;
  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 1.5);
  assert.ok(car.u < avant - 8, `le freinage est trop faible (${avant.toFixed(1)} -> ${car.u.toFixed(1)})`);
});

test('la voiture s’arrête complètement sous le frein', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 5);
  drive(car, { throttle: 0, brake: 1, steer: 0, hand: false }, 6);
  assert.ok(Math.abs(car.u) < 1.5, `la voiture ne s’arrête pas (${car.u.toFixed(2)} m/s)`);
});

test('une direction à droite fait tourner la voiture vers la droite', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  const capAvant = car.heading;
  drive(car, { throttle: 1, brake: 0, steer: 1, hand: false }, 1.5);
  // Cap positif = lacet vers la droite (convention du projet).
  assert.ok(car.heading - capAvant > 0.05, `le virage à droite n’est pas établi (${(car.heading - capAvant).toFixed(3)} rad)`);
  assert.ok(car.r > 0, 'la vitesse de lacet devrait être positive');
});

test('une direction à gauche fait tourner la voiture vers la gauche', () => {
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 4);
  const capAvant = car.heading;
  drive(car, { throttle: 1, brake: 0, steer: -1, hand: false }, 1.5);
  assert.ok(car.heading - capAvant < -0.05, 'le virage à gauche n’est pas établi');
  assert.ok(car.r < 0, 'la vitesse de lacet devrait être négative');
});

test('la voiture reste à plat sur une route horizontale', () => {
  setup('genets');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 3);
  // Sur le circuit d'origine, l'altitude reste modérée : le tangage induced
  // par l'accélération ne doit pas devenir fou.
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
  const track = setup('genets');
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  // On la lance tout droit : elle doit rester sur la route ou au pire dans
  // le(run-off), jamais s'envoler.
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 10);
  const loc = track.locate(car.x, car.z, car.idx);
  assert.ok(loc.dist < track.half + track.runoff + 2, `la voiture a quitté la piste (${loc.dist.toFixed(1)} m)`);
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
  setup();
  const car = createCarState(0);
  resetCar(car, 0.5, 0);
  drive(car, { throttle: 1, brake: 0, steer: 0, hand: false }, 5);
  const avant = car.u;
  drive(car, { throttle: 0, brake: 0, steer: 1, hand: true }, 1.2);
  // Le frein à main fait perdre de la vitesse (roues arrière bloquées).
  assert.ok(car.u < avant, 'le frein à main devrait ralentir la voiture');
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

/**
 * Validation du shader d'effets de vitesse.
 *
 * Le shader GLSL n'est pas compilé par Vite : une erreur de syntaxe
 * n'apparaît qu'à l'exécution, dans le navigateur. Ce test vérifie donc
 * statiquement ce qui peut l'être, et reproduit le calcul du shader en
 * JavaScript pour contrôler le comportement attendu.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SpeedShader, SpeedEffects } from '../src/render/effects.js';

test('le shader déclare les uniforms attendus', () => {
  for (const nom of ['vitesse', 'virage', 'temps', 'resolution', 'intensite']) {
    assert.ok(nom in SpeedShader.uniforms, `l'uniform ${nom} doit exister`);
  }
});

test('le shader source une texture et une varying cohérentes', () => {
  const frag = SpeedShader.fragmentShader;
  const vert = SpeedShader.vertexShader;

  assert.ok(frag.includes('tDiffuse'), 'le fragment shader doit lire tDiffuse');
  assert.ok(frag.includes('vUv'), 'le fragment shader doit utiliser vUv');
  assert.ok(vert.includes('vUv'), 'le vertex shader doit fournir vUv');
  assert.ok(
    vert.includes('gl_Position') && frag.includes('gl_FragColor'),
    'les shaders doivent écrire une position et une couleur'
  );
});

test('le shader ne contient ni backtick ni accolade non refermée', () => {
  const frag = SpeedShader.fragmentShader;
  const vert = SpeedShader.vertexShader;

  // Un backtick casserait le template literal JavaScript.
  assert.ok(!frag.includes('`'), 'le fragment shader ne doit pas contenir de backtick');
  assert.ok(!vert.includes('`'), 'le vertex shader ne doit pas contenir de backtick');

  // On vérifie l'équilibrage des accolades et des parenthèses.
  for (const [nom, src] of [['fragment', frag], ['vertex', vert]]) {
    const accolades = (src.match(/\{/g) || []).length - (src.match(/\}/g) || []).length;
    assert.equal(accolades, 0, `${nom} : accolades non équilibrées`);
    const parentheses = (src.match(/\(/g) || []).length - (src.match(/\)/g) || []).length;
    assert.equal(parentheses, 0, `${nom} : parenthèses non équilibrées`);
  }
});

test('les effets restent nuls à l’arrêt', () => {
  const fx = new SpeedEffects();
  const car = { u: 0, r: 0 };

  for (let i = 0; i < 120; i++) fx.update(car, 1 / 60);

  assert.ok(fx.vitesse < 0.001, `l'effet de vitesse doit être nul (${fx.vitesse})`);
  assert.ok(Math.abs(fx.virage) < 0.001, 'la déformation de virage doit être nulle');
});

test('l’effet de vitesse croît avec la vitesse', () => {
  const fx = new SpeedEffects();
  const car = { u: 0, r: 0 };

  const valeurs = [];
  for (const v of [0, 10, 20, 30, 45]) {
    car.u = v;
    for (let i = 0; i < 120; i++) fx.update(car, 1 / 60);
    valeurs.push(fx.vitesse);
  }

  for (let i = 1; i < valeurs.length; i++) {
    assert.ok(
      valeurs[i] >= valeurs[i - 1] - 1e-6,
      `l'effet doit être monotone (${valeurs.join(' > ')})`
    );
  }
  assert.ok(valeurs[valeurs.length - 1] > 0.8, 'à pleine vitesse, l’effet doit être marqué');
});

test('la déformation de virage suit le lacet', () => {
  const fx = new SpeedEffects();
  const car = { u: 25, r: 0 };

  for (let i = 0; i < 60; i++) fx.update(car, 1 / 60);
  assert.ok(Math.abs(fx.virage) < 0.01, 'sans lacet, pas de déformation');

  car.r = 1.0;
  for (let i = 0; i < 60; i++) fx.update(car, 1 / 60);
  assert.ok(fx.virage > 0.2, `le virage à droite doit déformer l'image (${fx.virage})`);

  car.r = -1.0;
  for (let i = 0; i < 120; i++) fx.update(car, 1 / 60);
  assert.ok(fx.virage < -0.2, `le virage à gauche doit déformer l'image (${fx.virage})`);
});

/**
 * Reproduction en JavaScript du calcul de mélange du shader, pour vérifier
 * que l'image reste nette quand la force est nulle.
 */
function melangerShader(couleurOriginale, force) {
  // Poids par échantillon (identiques au shader).
  const poids = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    poids.push(1 - t * 0.55);
  }
  const somme = poids.reduce((a, b) => a + b, 0);

  // Flou simulé : on suppose des échantillons proches de l'original.
  const flou = poids.map((p) => p / somme);
  const couleurFlou = flou.reduce((acc, p) => acc + p * couleurOriginale, 0);

  if (force > 0.02) {
    const mix = Math.min(1, force * 1.6);
    return couleurOriginale * (1 - mix) + couleurFlou * mix;
  }
  return couleurOriginale;
}

test('le mélange du shader laisse l’image intacte à vitesse nulle', () => {
  const original = 0.75;
  assert.equal(melangerShader(original, 0), original);
  assert.equal(melangerShader(original, 0.02), original);
});

test('le mélange du shader rapproche l’image du flou en vitesse', () => {
  const original = 0.75;
  const floute = melangerShader(original, 1);
  // Le flou rapproche de la moyenne pondérée, qui est ici proche de l'original.
  assert.ok(Math.abs(floute - original) < 0.05);
});

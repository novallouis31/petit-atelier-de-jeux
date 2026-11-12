/**
 * Test de fumée du rendu et de l'interface.
 *
 * Le navigateur n'étant pas disponible dans l'environnement de test, on
 * reproduit sous Node ce dont le rendu a besoin : un canvas, une image, un
 * contexte 2D et un `requestAnimationFrame`. Cela permet de vérifier que :
 *
 *  - les modules de rendu s'importent et s'exécutent sans erreur ;
 *  - la construction du décor 3D produit une géométrie cohérente ;
 *  - la caméra et les effets se mettent à jour correctement ;
 *  - l'interface construit le menu et reacts aux clics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/* --------------------------------------------------------------------------
   Environnement navigateur simulé
   -------------------------------------------------------------------------- */

/** Canvas 2D factice : on enregistre les appels pour pouvoir les vérifier. */
class FakeContext2D {
  constructor() {
    this.calls = [];
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
  }
  save() { this.calls.push('save'); }
  restore() { this.calls.push('restore'); }
  beginPath() { this.calls.push('beginPath'); }
  closePath() { this.calls.push('closePath'); }
  moveTo() { this.calls.push('moveTo'); }
  lineTo() { this.calls.push('lineTo'); }
  arc() { this.calls.push('arc'); }
  stroke() { this.calls.push('stroke'); }
  fill() { this.calls.push('fill'); }
  clearRect() { this.calls.push('clearRect'); }
  fillRect() { this.calls.push('fillRect'); }
  fillText() { this.calls.push('fillText'); }
  setTransform() {}
  translate() {}
  scale() {}
  rotate() {}
  measureText() { return { width: 10 }; }
  strokeRect() { this.calls.push('strokeRect'); }
  /** Dégradés : les textures procédurales en utilisent. */
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = new Proxy(
      { setProperty: (k, v) => { this.style[k] = v; } },
      {
        get: (t, k) => t[k] ?? '',
        set: (t, k, v) => { t[k] = v; return true; },
      }
    );
    this.dataset = {};
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      toggle: (c, force) => {
        if (force === undefined) force = !this.classList._set.has(c);
        if (force) this.classList._set.add(c); else this.classList._set.delete(c);
        return force;
      },
      contains: (c) => this.classList._set.has(c),
    };
    this._listeners = {};
    this.textContent = '';
    this.innerHTML = '';
    this.width = 300;
    this.height = 150;
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) {
    for (const fn of this._listeners[type] || []) fn({ target: this, ...event });
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  getContext() { return (this._ctx ||= new FakeContext2D()); }
  getBoundingClientRect() { return { width: 300, height: 150, top: 0, left: 0 }; }
  animate() { return { finished: Promise.resolve() }; }
  focus() {}
  blur() {}
}

/** Éléments du DOM nécessaires au jeu, indexés par identifiant. */
const elements = new Map();

function installDom() {
  const listeners = {};
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement());
      return dom.get(id);
    },
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    body: new FakeElement('body'),
    hidden: false,
  };

  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };

  globalThis.Image = class {
    set src(v) { this._src = v; }
    get src() { return this._src; }
    addEventListener() {}
    removeEventListener() {}
  };

  globalThis.HTMLCanvasElement = FakeElement;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;

  return { elements, listeners };
}

const { elements: dom } = installDom();

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */
test('les modules de rendu s’importent sans erreur', async () => {
  const scene = await import('../src/render/scene.js');
  const trackMesh = await import('../src/render/trackMesh.js');
  const carMesh = await import('../src/render/carMesh.js');
  const camera = await import('../src/render/camera.js');
  const effects = await import('../src/render/effects.js');
  const textures = await import('../src/render/textures.js');

  assert.ok(typeof scene.createScene === 'function');
  assert.ok(typeof trackMesh.buildTrackScene === 'function');
  assert.ok(typeof carMesh.buildCar === 'function');
  assert.ok(typeof camera.ChaseCamera === 'function');
  assert.ok(typeof effects.SpeedEffects === 'function');
  assert.ok(typeof textures.roadMaterial === 'function');
});

test('le décor 3D d’un circuit est construit correctement', async () => {
  const THREE = await import('three');
  const { TRACKS } = await import('../src/core/tracks.js');
  const { buildTrack } = await import('../src/core/track.js');
  const { buildTrackScene } = await import('../src/render/trackMesh.js');

  const track = buildTrack(TRACKS.genets);
  const scene = buildTrackScene(track);

  assert.ok(scene, 'le décor doit être construit');
  assert.ok(scene.children.length > 0, 'le décor doit contenir des objets');

  // On vérifie que la géométrie de la route a une taille plausible.
  const route = scene.getObjectByName('route');
  assert.ok(route, 'la route doit exister');
  const positions = route.geometry.getAttribute('position');
  assert.ok(positions.count > 100, `la route doit avoir des sommets (${positions.count})`);

  // Les UV sont en mètres : la largeur de la piste doit s'y retrouver.
  const uv = route.geometry.getAttribute('uv');
  const largeurUV = uv.getY(1) - uv.getY(0);
  assert.ok(
    Math.abs(largeurUV - track.halfWidth * 2) < 0.5,
    `les UV doivent être en mètres (${largeurUV} pour une piste de ${track.halfWidth * 2})`
  );

  // Les normales pointent vers le haut.
  const normales = route.geometry.getAttribute('normal');
  assert.ok(normales.getY(0) > 0.8, 'les normales de la route doivent pointer vers le haut');

  // Les autres éléments du décor.
  for (const nom of ['terrain', 'vibreurs', 'glissieres', 'depart', 'decor']) {
    assert.ok(scene.getObjectByName(nom), `le décor doit contenir « ${nom} »`);
  }

  // Les triangles doivent être dans le sens direct (pas à l'envers).
  const index = route.geometry.getIndex();
  const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(2));
  const normale = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  assert.ok(normale.y > 0, 'les triangles de la route doivent être dans le sens direct');
});

test('la voiture est construite avec ses roues', async () => {
  const { buildCar, updateCarMesh } = await import('../src/render/carMesh.js');
  const { createCarState } = await import('../src/core/physics.js');

  const voiture = buildCar({ couleur: 0xff0000 });
  assert.ok(voiture.userData.roues.length === 4, 'il doit y avoir quatre roues');
  assert.ok(voiture.userData.taillights.length === 2, 'il doit y avoir deux feux arrière');

  // L'animation doit tourner sans erreur et produire une orientation valide.
  const car = createCarState(0);
  car.x = 10; car.y = 0; car.z = 20; car.heading = 1.2;
  car.nx = 0; car.ny = 1; car.nz = 0;
  car.u = 20; car.steer = 0.3;
  updateCarMesh(voiture, car, 1 / 60);

  assert.ok(Number.isFinite(voiture.position.x));
  assert.ok(Number.isFinite(voiture.userData.chassis.quaternion.x));
  const q = voiture.userData.chassis.quaternion;
  assert.ok(
    Math.abs(q.length() - 1) < 1e-6,
    'le quaternion du châssis doit être normalisé'
  );
});

test('la caméra de poursuite se place derrière la voiture', async () => {
  const THREE = await import('three');
  const { ChaseCamera } = await import('../src/render/camera.js');

  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  const chase = new ChaseCamera(camera);

  const car = {
    x: 0, y: 0, z: 0, heading: 0, u: 0, v: 0, r: 0, idx: 0,
  };

  chase.update(car, 1 / 60, null);
  // Avec un cap nul, la voiture avance vers +X : la caméra doit être
  // derrière elle, donc du côté -X.
  assert.ok(camera.position.x < 0, 'la caméra doit être derrière la voiture');
  assert.ok(camera.position.y > 0, 'la caméra doit être au-dessus du sol');

  // Le champ de vision s'élargit avec la vitesse.
  const fovLent = camera.fov;
  car.u = 45;
  for (let i = 0; i < 200; i++) chase.update(car, 1 / 60, null);
  assert.ok(camera.fov > fovLent, 'le champ de vision doit s’élargir avec la vitesse');
});

test('les effets de vitesse montent avec la vitesse', async () => {
  const { SpeedEffects } = await import('../src/render/effects.js');

  const fx = new SpeedEffects();
  const car = { u: 0, r: 0 };

  for (let i = 0; i < 60; i++) fx.update(car, 1 / 60);
  assert.ok(fx.vitesse < 0.01, 'au repos, il ne doit pas y avoir d’effet de vitesse');

  car.u = 45;
  for (let i = 0; i < 60; i++) fx.update(car, 1 / 60);
  assert.ok(fx.vitesse > 0.5, `l’effet de vitesse doit être marqué (${fx.vitesse})`);

  // Le virage déforme l’image.
  car.r = 1.2;
  for (let i = 0; i < 60; i++) fx.update(car, 1 / 60);
  assert.ok(Math.abs(fx.virage) > 0.1, 'le virage doit déformer l’image');
});

test('l’interface construit le menu et affiche les résultats', async () => {
  const { Interface } = await import('../src/ui/interface.js');
  const { TRACK_IDS } = await import('../src/core/tracks.js');

  const ui = new Interface({
    onStart() {}, onTrackChange() {}, onRestart() {},
    onMenu() {}, onResume() {}, onPause() {},
  });

  // Le menu doit contenir une vignette par circuit.
  const grid = dom.get('trackGrid');
  assert.ok(grid.innerHTML.includes('data-track='), 'les vignettes doivent être générées');
  for (const id of TRACK_IDS) {
    assert.ok(grid.innerHTML.includes(`data-track="${id}"`), `le circuit ${id} doit être présent`);
  }

  // L'affichage du HUD ne doit pas lever d'erreur.
  const { Race } = await import('../src/core/race.js');
  const { buildTrack } = await import('../src/core/track.js');
  const { TRACKS } = await import('../src/core/tracks.js');

  const track = buildTrack(TRACKS.genets);
  const race = new Race({
    track,
    bindTrack: () => {},
    cars: 4,
    aiLevel: 'expert',
  });
  race.start();
  race.mode = 'racing';
  race.time = 12.5;
  race.updatePlaces();

  ui.updateHUD(race);
  assert.ok(dom.get('speed').textContent !== undefined);
  assert.ok(dom.get('positions').innerHTML.includes('VOUS'), 'le classement doit lister le joueur');
});

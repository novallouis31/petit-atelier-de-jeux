/**
 * Gestion des textures.
 *
 * Les images viennent de `public/textures/` (Poly Haven, CC0). Ce module
 * les charge, les configure pour le rendu (répétition, filtrage, espace
 * colorimétrique) et les mémorise.
 */

import * as THREE from 'three';
import { eauTexture, eauNormales } from './proceduralTextures.js';

const TEX = '/textures/';

const cache = new Map();

/** Charge une texture et la configure. */
function load(name, { repeat = 1, srgb = false, aniso = 8 } = {}) {
  const key = `${name}|${repeat}|${srgb}`;
  if (cache.has(key)) return cache.get(key);

  const tex = new THREE.TextureLoader().load(`${TEX}${name}`);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  // Les cartes de normales et de rugosité sont des données, pas des
  // couleurs : pas de conversion sRGB.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;

  cache.set(key, tex);
  return tex;
}

/** Attend le chargement de toutes les textures demandées. */
export function loadAll(requests) {
  const pending = [];
  for (const req of requests) {
    const tex = load(req.name, req);
    if (!tex.image) pending.push(new Promise((resolve) => { tex.onUpdate = resolve; }));
  }
  return Promise.all(pending);
}

/**
 * Textures de sol, par environnement.
 *
 * Chaque environnement a sa texture : un terrain vert au milieu des dunes
 * casserait l'illusion. Le tableau est exporté pour être vérifié par les
 * tests (fichiers réellement présents dans `public/textures/`).
 */
export const SOLS = {
  grass: {
    diff: 'grass_ground_diff_2k.jpg',
    nrm: 'grass_ground_nor_gl_2k.png',
    roughness: 0.98,
    normalScale: 0.6,
  },
  gravel: {
    diff: 'gravel_road_diff_1k.jpg',
    roughness: 1.0,
  },
  concrete: {
    diff: 'concrete_diff_1k.jpg',
    rough: 'concrete_rough_1k.jpg',
    roughness: 0.9,
  },
  snow: {
    diff: 'snow_02_diff_2k.jpg',
    nrm: 'snow_02_nor_gl_2k.png',
    roughness: 0.85,
    normalScale: 0.45,
  },
  sand: {
    diff: 'sand_01_diff_2k.jpg',
    nrm: 'sand_01_nor_gl_2k.png',
    roughness: 1.0,
    normalScale: 0.5,
  },
  rock: {
    diff: 'rock_face_diff_1k.jpg',
    nrm: 'rock_face_nor_gl_1k.png',
    roughness: 1.0,
    normalScale: 0.8,
  },
};

/**
 * Matériau du sol pour un environnement donné.
 *
 * @param {string} ground  `grass`, `gravel`, `concrete`, `snow`, `sand`,
 *                         `rock`
 */
export function solMaterial(ground = 'grass') {
  const s = SOLS[ground] ?? SOLS.grass;
  const mat = new THREE.MeshStandardMaterial({
    map: load(s.diff, { srgb: true }),
    roughness: s.roughness,
    metalness: 0.0,
  });
  if (s.nrm) {
    mat.normalMap = load(s.nrm);
    mat.normalScale = new THREE.Vector2(s.normalScale, s.normalScale);
  }
  if (s.rough) mat.roughnessMap = load(s.rough);
  return mat;
}

/**
 * Matériau de route : asphalte avec carte de normales et rugosité.
 *
 * La répétition est gérée par les UV du maillage : chaque sommet reçoit
 * des coordonnées en mètres, ce qui donne une texture à l'échelle réelle
 * quelle que soit la largeur de la piste.
 */
export function roadMaterial(mapName = 'asphalt_02_diff_2k.jpg', normalName = 'asphalt_02_nor_gl_2k.png', roughName = 'asphalt_02_rough_2k.jpg') {
  return new THREE.MeshStandardMaterial({
    map: load(mapName, { srgb: true }),
    normalMap: load(normalName),
    roughnessMap: load(roughName),
    roughness: 0.92,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
}

/** Matériau du gazon / terrain tempéré. */
export function groundMaterial() {
  return solMaterial('grass');
}

/** Matériau de la neige (terrain). */
export function snowMaterial() {
  return solMaterial('snow');
}

/** Matériau du sable (désert). */
export function sandMaterial() {
  return solMaterial('sand');
}

/** Matériau de la roche (montagne). */
export function rockMaterial() {
  return solMaterial('rock');
}

/** Matériau du gravier / run-off. */
export function gravelMaterial() {
  return solMaterial('gravel');
}

/** Matériau du béton (glissières, tribunes). */
export function concreteMaterial() {
  return solMaterial('concrete');
}

/**
 * Matériau de l'eau : carte de couleur, carte de normales ondulée
 * (procédurales), surface semi-transparente qui reflète le ciel via
 * l'environnement de la scène.
 */
export function eauMaterial() {
  return new THREE.MeshStandardMaterial({
    map: eauTexture(),
    normalMap: eauNormales(),
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    opacity: 0.92,
    normalScale: new THREE.Vector2(0.9, 0.9),
    // La réflexion de l'environnement est bridée : le ciel de Preetham est
    // très lumineux près de l'horizon, et sans ce frein l'eau ne renvoie
    // qu'un reflet gris pâle — la teinte de la carte disparaît.
    envMapIntensity: 0.3,
  });
}

/** Matériau de la ligne de départ (damier). */
export function checkerMaterial(mapName = 'checkered_pavement_tiles_diff_1k.jpg') {
  return new THREE.MeshStandardMaterial({
    map: load(mapName, { srgb: true }),
    roughness: 0.75,
    metalness: 0.0,
  });
}

/** Libère le cache (changement de circuit). */
export function disposeTextures() {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}

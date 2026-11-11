/**
 * Gestion des textures.
 *
 * Les images viennent de `public/textures/` (Poly Haven, CC0). Ce module
 * les charge, les configure pour le rendu (répétition, filtrage, espace
 * colorimétrique) et les mémorise.
 */

import * as THREE from 'three';

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

/** Matériau du gazon / terrain. */
export function groundMaterial(mapName = 'grass_ground_diff_2k.jpg', normalName = 'grass_ground_nor_gl_2k.png') {
  return new THREE.MeshStandardMaterial({
    map: load(mapName, { srgb: true }),
    normalMap: load(normalName),
    roughness: 0.98,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
}

/** Matériau du gravier / run-off. */
export function gravelMaterial(mapName = 'gravel_road_diff_1k.jpg', normalName = 'gravel_road_nor_gl_1k.png') {
  return new THREE.MeshStandardMaterial({
    map: load(mapName, { srgb: true }),
    normalMap: load(normalName),
    roughness: 1.0,
    metalness: 0.0,
  });
}

/** Matériau du béton (glissières, tribunes). */
export function concreteMaterial(mapName = 'concrete_diff_1k.jpg', roughName = 'concrete_rough_1k.jpg') {
  return new THREE.MeshStandardMaterial({
    map: load(mapName, { srgb: true }),
    roughnessMap: load(roughName),
    roughness: 0.9,
    metalness: 0.0,
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

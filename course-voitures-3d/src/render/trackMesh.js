/**
 * Construction du décor 3D d'un circuit.
 *
 * Tout est généré à partir de la géométrie du circuit (`src/core/track.js`) :
 * la chaussée est une bande de triangles qui suit la ligne médiane, les
 * vibreurs sont posés sur les rebords, les glissières longent le run-off.
 *
 * Les UV sont exprimés en mètres : la texture garde ainsi la même échelle
 * quelle que soit la largeur de la piste.
 */

import * as THREE from 'three';
import {
  roadMaterial,
  groundMaterial,
  gravelMaterial,
  concreteMaterial,
  checkerMaterial,
} from './textures.js';

const KERB_RED = 0xc0392b;
const KERB_WHITE = 0xf2f2f2;

/**
 * Construit la chaussée : une bande de triangles entre les bords gauche et
 * droit de la route.
 */
function buildRoadMesh(track) {
  const N = track.N;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= N; i++) {
    const p = track.pts[i % track.N];
    const next = track.pts[(i + 1) % N];

    // Le bord droit de la route, en tenant compte du dévers.
    const rx = p.rx;
    const ry = p.ry;
    const rz = p.rz;
    const half = p.half;

    // Bord gauche (opposé du bord droit).
    const lx = p.x - rx * half;
    const ly = p.y - ry * half;
    const lz = p.z - rz * half;

    // Bord droit.
    const dx = p.x + rx * half;
    const dy = p.y + ry * half;
    const dz = p.z + rz * half;

    positions.push(lx, ly, lz, dx, dy, dz);
    normals.push(p.nx, p.ny, p.nz, p.nx, p.ny, p.nz);

    // UV en mètres : u le long de la piste, v en travers.
    const s = i * track.spacing;
    uvs.push(s, 0, s, p.width);
  }

  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    // Ordre des sommets : on tourne dans le sens direct (normale vers le
    // ciel). L'inverse rendrait la route invisible vue du dessus.
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();

  const mat = roadMaterial();
  // Les UV du maillage sont exprimés en mètres. La texture doit couvrir
  // plusieurs mètres : appliquée sur un seul mètre, le filtrage mipmap la
  // réduisait à un simple aplat gris. On vise 8 m par motif.
  const repetition = 1 / 8;
  mat.map.repeat.set(repetition, repetition);
  mat.normalMap.repeat.set(repetition, repetition);
  mat.roughnessMap.repeat.set(repetition, repetition);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'route';
  return mesh;
}

/**
 * Vibreurs (kerbs) : bandes rouge et blanc sur l'extérieur des virages
 * serrés. Ils sont posés là où la courbure le justifie.
 */
function buildKerbs(track) {
  const group = new THREE.Group();
  group.name = 'vibreurs';

  const redMat = new THREE.MeshStandardMaterial({
    color: KERB_RED, roughness: 0.75, metalness: 0,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: KERB_WHITE, roughness: 0.75, metalness: 0,
  });

  // Seuil de courbure au-delà duquel on pose un vibreur.
  const SEUIL = 0.006;

  for (const side of [1, -1]) {
    const red = [];
    const white = [];
    const indicesR = [];
    const indicesW = [];
    let count = 0;

    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      const idx = i % track.N;
      const courbure = Math.abs(p.curvS);
      const actif = courbure > SEUIL;

      // Position le long du bord de la route.
      const bx = p.rx * p.half * side;
      const by = p.ry * p.half * side;
      const bz = p.rz * p.half * side;

      // Le vibreur est un petit volume posé sur le bord, légèrement surélevé.
      const w = 0.9;
      const h = 0.07;
      // Direction du bord (le long de la piste).
      const tx = p.tx;
      const tz = p.tz;

      // Deux sommets : intérieur (sur la route) et extérieur.
      const ix = p.x + bx - tx * w * 0.5;
      const iy = p.y + by;
      const iz = p.z + bz - tz * w * 0.5;
      const ox = p.x + bx + tx * w * 0.5;
      const oy = p.y + by;
      const oz = p.z + bz + tz * w * 0.5;

      if (!actif) continue;

      // Couleur alternée : une bande sur deux.
      const cible = (idx >> 1) % 2 === 0 ? red : white;
      const targetIndices = cible === red ? indicesR : indicesW;
      const base = count * 4;

      // Pavé : quadrilatère incliné, légèrement surélevé du côté extérieur.
      cible.push(
        ix, iy + 0.01, iz,
        ox, oy + 0.01, oz,
        ox, oy + h, oz,
        ix, iy + h, iz
      );
      targetIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      count++;
    }

    for (const [positions, indices, mat] of [
      [red, indicesR, redMat],
      [white, indicesW, whiteMat],
    ]) {
      if (!positions.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  return group;
}

/**
 * Glissières : longues barriers en béton le long du run-off, des deux côtés.
 */
function buildBarriers(track) {
  const group = new THREE.Group();
  group.name = 'glissieres';

  const positions = [];
  const uvs = [];
  const indices = [];
  const H = 0.9;
  const EPAISSEUR = 0.35;

  let count = 0;
  for (const side of [1, -1]) {
    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      const d = p.half + track.runoff;

      const bx = p.rx * d * side;
      const bz = p.rz * d * side;
      const by = p.y + p.ry * d * side;

      // Direction perpendiculaire à la route, dans le plan horizontal.
      const ox = p.rx * side;
      const oz = p.rz * side;

      const base = count * 4;
      // Face intérieure basse, intérieure haute, extérieure haute, extérieure basse.
      positions.push(
        bx - ox * EPAISSEUR * 0.5, by, bz - oz * EPAISSEUR * 0.5,
        bx + ox * EPAISSEUR * 0.5, by, bz + oz * EPAISSEUR * 0.5,
        bx + ox * EPAISSEUR * 0.5, by + H, bz + oz * EPAISSEUR * 0.5,
        bx - ox * EPAISSEUR * 0.5, by + H, bz - oz * EPAISSEUR * 0.5
      );
      const s = i * track.spacing;
      uvs.push(s, 0, s, 0.35, s, H, s, H);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      count++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, concreteMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/**
 * Terrain : grand plan texturé qui épouse le relief autour du circuit.
 *
 * On construit un anneau de terrain autour de la boucle : une grille
 * grossière dont la hauteur suit celle de la piste, amortie vers
 * l'extérieur.
 */
function buildTerrain(track, theme) {
  const group = new THREE.Group();
  group.name = 'terrain';

  const marge = 120;
  const pas = 12;
  const bounds = track.bounds;

  // On construit une grille centrée sur la piste, en coordonnées polaires
  // autour du barycentre, ce qui suit mieux la forme de la boucle.
  let cx = 0;
  let cz = 0;
  for (const p of track.pts) {
    cx += p.x;
    cz += p.z;
  }
  cx /= track.N;
  cz /= track.N;

  const positions = [];
  const uvs = [];
  const indices = [];
  const couleurs = [];

  const RAYONS = 44;
  const ANGULAIRES = 190;

  /* Correspondence angle -> point de piste.
     On la calcule une fois pour toutes : chercher le point le plus proche
     pour chaque cellule de la grille serait quadratique et ruinerait le
     temps de chargement. */
  const parAngle = [];
  for (let ia = 0; ia <= ANGULAIRES; ia++) {
    const a = (ia / ANGULAIRES) * Math.PI * 2;
    const dirX = Math.cos(a);
    const dirZ = Math.sin(a);

    let best = null;
    let bestDot = -Infinity;
    for (const p of track.pts) {
      const dx = p.x - cx;
      const dz = p.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const dot = (dx / len) * dirX + (dz / len) * dirZ;
      if (dot > bestDot) {
        bestDot = dot;
        best = { p, r: len };
      }
    }
    parAngle.push(best);
  }

  for (let ir = 0; ir < RAYONS; ir++) {
    // Rayon interpolé entre le bord de la piste et l'extérieur.
    const t = ir / (RAYONS - 1);
    for (let ia = 0; ia <= ANGULAIRES; ia++) {
      const a = (ia / ANGULAIRES) * Math.PI * 2;
      const dirX = Math.cos(a);
      const dirZ = Math.sin(a);

      // Point de piste le plus proche de cette direction.
      const best = parAngle[ia];

      // Rayon du terrain : juste après la glissière, puis jusqu'au loin.
      const r0 = best.r + track.halfWidth + track.runoff + 6;
      const r = r0 + t * (marge + best.r * 0.5);

      const x = cx + dirX * r;
      const z = cz + dirZ * r;

      // Hauteur : celle de la piste au point le plus proche, amortie.
      const hauteur = best.p.y * (1 - t * 0.85) - t * 3;
      positions.push(x, hauteur, z);
      uvs.push(x / 12, z / 12);

      // Teinte : plus sombre au loin, pour assombrir l'atmosphère.
      const shade = 1 - t * 0.25;
      couleurs.push(shade, shade, shade);
    }
  }

  const stride = ANGULAIRES + 1;
  for (let ir = 0; ir < RAYONS - 1; ir++) {
    for (let ia = 0; ia < ANGULAIRES; ia++) {
      const a = ir * stride + ia;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Sens direct : les normales doivent pointer vers le haut, sinon le
      // terrain est éclairé par en dessous et paraît noir.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = groundMaterial();
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

/**
 * Ligne de départ : damier en travers de la piste.
 */
function buildStartLine(track) {
  const group = new THREE.Group();
  group.name = 'depart';

  const p = track.pointAtS(0);
  const geo = new THREE.PlaneGeometry(p.width, 2.4);
  const mesh = new THREE.Mesh(geo, checkerMaterial());

  // On place le damier sur la route, orienté selon la tangente.
  mesh.position.set(p.x, p.y + 0.02, p.z);
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  // La rotation finale aligne le damier avec la route.
  const angle = Math.atan2(p.tx, p.tz);
  mesh.rotateZ(angle);
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

/**
 * Décor : arbres et balises répartis autour du circuit.
 *
 * Le placement est déterministe (générateur à graine) pour que le décor
 * soit identique d'une course à l'autre.
 */
function buildScenery(track, theme) {
  const group = new THREE.Group();
  group.name = 'decor';

  // Générateur pseudo-aléatoire déterministe.
  let graine = 1337;
  const rnd = () => {
    graine = (graine * 1103515245 + 12345) & 0x7fffffff;
    return graine / 0x7fffffff;
  };

  const treeMat = new THREE.MeshStandardMaterial({
    color: theme.ground === 'gravel' ? 0x8a7a52 : 0x2f5d2a,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6);
  const foliageGeo = new THREE.ConeGeometry(1.9, 5.2, 7);
  const foliageGeo2 = new THREE.ConeGeometry(1.4, 3.8, 7);

  const bounds = track.bounds;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

  for (let i = 0; i < 260; i++) {
    const x = cx + (rnd() - 0.5) * span * 1.8;
    const z = cz + (rnd() - 0.5) * span * 1.8;

    // On écarte les arbres de la piste.
    const loc = track.locate(x, z, -1);
    if (loc.dist < track.halfWidth + track.runoff + 8) continue;

    // Hauteur du terrain, approchée par celle du point de piste le plus proche.
    const hauteur = loc.height - 1.2;

    const arbre = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.2;
    trunk.castShadow = true;
    arbre.add(trunk);

    const haut = new THREE.Mesh(foliageGeo, treeMat);
    haut.position.y = 4.2;
    haut.castShadow = true;
    arbre.add(haut);

    const bas = new THREE.Mesh(foliageGeo2, treeMat);
    bas.position.y = 2.4;
    bas.castShadow = true;
    arbre.add(bas);

    const echelle = 0.75 + rnd() * 0.75;
    arbre.scale.setScalar(echelle);
    arbre.position.set(x, hauteur, z);
    arbre.rotation.y = rnd() * Math.PI * 2;
    group.add(arbre);
  }

  // Balises de distance : petits poteaux rouges et blancs tous les 40 m.
  const baliseGeo = new THREE.BoxGeometry(0.5, 1.0, 0.14);
  const baliseMat = new THREE.MeshStandardMaterial({ color: 0xd94f3d, roughness: 0.8 });

  const espacement = Math.round(40 / track.spacing);
  for (let i = 0; i < track.N; i += espacement) {
    const p = track.pts[i];
    for (const side of [1, -1]) {
      const d = p.half + track.runoff - 0.4;
      const balise = new THREE.Mesh(baliseGeo, baliseMat);
      balise.position.set(
        p.x + p.rx * d * side,
        p.y + p.ry * d * side + 0.5,
        p.z + p.rz * d * side
      );
      balise.rotation.y = Math.atan2(p.tx, p.tz);
      balise.castShadow = true;
      group.add(balise);
    }
  }

  return group;
}

/**
 * Construit tout le décor d'un circuit.
 * @param {object} track  circuit (src/core/track.js)
 * @returns {THREE.Group}
 */
export function buildTrackScene(track) {
  const group = new THREE.Group();
  group.name = 'circuit';

  group.add(buildTerrain(track, track.theme));
  group.add(buildRoadMesh(track));
  group.add(buildKerbs(track));
  group.add(buildBarriers(track));
  group.add(buildStartLine(track));
  group.add(buildScenery(track, track.theme));

  return group;
}

/** Supprime un décor et libère sa mémoire GPU. */
export function disposeTrackScene(group) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
  group.removeFromParent();
}

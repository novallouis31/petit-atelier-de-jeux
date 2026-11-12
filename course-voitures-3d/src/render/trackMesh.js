/**
 * Construction du décor 3D d'un circuit.
 *
 * Tout est généré à partir de la géométrie du circuit (`src/core/track.js`) :
 * la chaussée est une bande de triangles qui suit la ligne médiane, les
 * vibreurs sont posés sur les rebords, les glissières longent le run-off et
 * le terrain couvre toute la zone — y compris sous la piste.
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
import { bandesTexture } from './proceduralTextures.js';
import { buildScenery } from './scenery.js';
import { hauteurTerrain } from './terrainHeight.js';

/**
 * Matériau du sol selon le thème : gazon, gravier ou béton.
 * Le thème « gravel » des circuits chauds donnait sinon un terrain vert
 * qui contredisait le décor.
 */
function terrainMaterial(theme) {
  if (theme?.ground === 'gravel') return gravelMaterial();
  if (theme?.ground === 'concrete') return concreteMaterial();
  return groundMaterial();
}

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
 * Bandes de gravier entre la route et les glissières.
 *
 * Sans elles, il y a un trou entre le bord de la chaussée et la glissière :
 * on voit le ciel à travers, et le sol n'existe que sous la route.
 */
function buildRunoff(track) {
  const group = new THREE.Group();
  group.name = 'runoff';

  const mat = gravelMaterial();
  // u est en mètres : une tuile de gravier tous les 2 m. La répétition est
  // intégrée aux UV plutôt que réglée sur la texture, qui est partagée avec
  // le terrain.

  for (const side of [1, -1]) {
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      const s = i * track.spacing;
      const d0 = p.half;
      const d1 = p.half + track.runoff;
      const creux = 0.03;

      // Intérieur (bord de route) puis extérieur (glissière).
      positions.push(
        p.x + p.rx * d0 * side, p.y + p.ry * d0 * side - creux, p.z + p.rz * d0 * side,
        p.x + p.rx * d1 * side, p.y + p.ry * d1 * side - creux, p.z + p.rz * d1 * side
      );
      // u et v en mètres, divisés par 2 : une tuile de gravier tous les 2 m.
      uvs.push(s * 0.5, 0, s * 0.5, track.runoff * 0.5);

      if (i < track.N) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        // Le sens de parcours dépend du côté : la normale doit pointer vers
        // le ciel dans les deux cas.
        if (side > 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * Vibreurs (kerbs) : bandes rouge et blanc sur l'extérieur des virages
 * serrés. Ils sont posés là où la courbure le justifie.
 *
 * Une seule texture rayée le long de la piste : les vibreurs sont un mesh
 * unique par côté, donc un seul appel de dessin, et le motif alterne tout
 * seul (l'alternance était auparavant deux matériaux unis).
 */
function buildKerbs(track) {
  const group = new THREE.Group();
  group.name = 'vibreurs';

  // Seuil de courbure au-delà duquel on pose un vibreur.
  const SEUIL = 0.006;
  const w = 0.9;
  const h = 0.07;

  for (const side of [1, -1]) {
    const positions = [];
    const uvs = [];
    const indices = [];
    let count = 0;

    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      if (Math.abs(p.curvS) <= SEUIL) continue;

      const bx = p.rx * p.half * side;
      const by = p.ry * p.half * side;
      const bz = p.rz * p.half * side;

      const tx = p.tx;
      const tz = p.tz;

      const ix = p.x + bx - tx * w * 0.5;
      const iy = p.y + by;
      const iz = p.z + bz - tz * w * 0.5;
      const ox = p.x + bx + tx * w * 0.5;
      const oy = p.y + by;
      const oz = p.z + bz + tz * w * 0.5;

      const s = i * track.spacing;
      const base = count * 4;
      positions.push(
        ix, iy + 0.01, iz,
        ox, oy + 0.01, oz,
        ox, oy + h, oz,
        ix, iy + h, iz
      );
      // u en mètres le long de la piste, v en travers du vibreur.
      uvs.push(s, 0, s, 1, s, 1, s, 0);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      count++;
    }

    if (!positions.length) continue;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: bandesTexture('vibreur'),
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    // u est en mètres : une tuile de 8 m donne des bandes d'un mètre.
    mat.map.repeat.set(1 / 8, 1);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * Glissières : murs de béton le long du run-off, des deux côtés.
 *
 * Le mur a **trois faces** (intérieure, extérieure, dessus) et un rail rayé
 * rouge et blanc sur le dessus. Les versions précédentes ne dessinaient
 * qu'une seule face, orientée vers l'extérieur : vue de la route, elle était
 * éliminée par le Faceside (backface culling), et la « glissière » était
 * invisible alors même que la physique la bloquait — des murs fantômes.
 */
function buildBarriers(track) {
  const group = new THREE.Group();
  group.name = 'glissieres';

  const H = 0.9;
  const EPAISSEUR = 0.35;
  const RAIL = 0.16;

  const mat = concreteMaterial();
  mat.side = THREE.DoubleSide;
  // UV en mètres, divisés par 2 (une tuile de béton tous les 2 m). La
  // répétition est intégrée aux UV : la texture est partagée avec les
  // tribunes et les bâtiments.

  const matRail = new THREE.MeshStandardMaterial({
    map: bandesTexture('glissiere', ['#c0392b', '#f2f2f2'], 4),
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // Une tuile de 2 m avec 4 bandes : des sections de 0,5 m.
  matRail.map.repeat.set(1 / 2, 1);

  for (const side of [1, -1]) {
    const positions = [];
    const uvs = [];
    const indices = [];
    let count = 0;

    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      const d = p.half + track.runoff;

      const cx = p.x + p.rx * d * side;
      const cy = p.y + p.ry * d * side;
      const cz = p.z + p.rz * d * side;

      // Axe perpendiculaire à la route (horizontal).
      const ox = p.rx * side;
      const oz = p.rz * side;

      const s = i * track.spacing;
      const base = count * 6;

      /* Mur : 6 sommets par échantillon — intérieur bas/haut, extérieur
         bas/haut, dessus intérieur/extérieur. */
      positions.push(
        cx - ox * EPAISSEUR * 0.5, cy, cz - oz * EPAISSEUR * 0.5, // 0 int. bas
        cx - ox * EPAISSEUR * 0.5, cy + H, cz - oz * EPAISSEUR * 0.5, // 1 int. haut
        cx + ox * EPAISSEUR * 0.5, cy, cz + oz * EPAISSEUR * 0.5, // 2 ext. bas
        cx + ox * EPAISSEUR * 0.5, cy + H, cz + oz * EPAISSEUR * 0.5, // 3 ext. haut
        cx - ox * EPAISSEUR * 0.5, cy + H, cz - oz * EPAISSEUR * 0.5, // 4 dessus int.
        cx + ox * EPAISSEUR * 0.5, cy + H, cz + oz * EPAISSEUR * 0.5 // 5 dessus ext.
      );
      uvs.push(
        s * 0.5, 0, s * 0.5, H * 0.5,
        s * 0.5, 0, s * 0.5, H * 0.5,
        s * 0.5, 0, s * 0.5, EPAISSEUR * 0.5
      );
      indices.push(
        base, base + 1, base + 4, // face intérieure
        base + 1, base + 5, base + 4,
        base + 2, base + 3, base + 5, // face extérieure
        base + 2, base + 5, base + 4
        // Le dessus est un quad entre deux échantillons consécutifs : il est
        // ajouté après la boucle.
      );
      count++;
    }

    /* Dessus du mur : quads entre échantillons consécutifs. */
    for (let i = 0; i < count - 1; i++) {
      const a = i * 6 + 4;
      const b = i * 6 + 5;
      const c = (i + 1) * 6 + 4;
      const d = (i + 1) * 6 + 5;
      const base = positions.length / 3;
      const s0 = i * track.spacing;
      const s1 = (i + 1) * track.spacing;
      positions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
        positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2],
        positions[d * 3], positions[d * 3 + 1], positions[d * 3 + 2]
      );
      uvs.push(
        s0 * 0.5, 0, s0 * 0.5, EPAISSEUR * 0.5,
        s1 * 0.5, 0, s1 * 0.5, EPAISSEUR * 0.5
      );
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    /* Rail rayé sur le dessus du mur. */
    const positionsRail = [];
    const uvsRail = [];
    const indicesRail = [];
    let railCount = 0;

    for (let i = 0; i <= track.N; i++) {
      const p = track.pts[i % track.N];
      const d = p.half + track.runoff + EPAISSEUR * 0.5;
      const cx = p.x + p.rx * d * side;
      const cy = p.y + p.ry * d * side;
      const cz = p.z + p.rz * d * side;
      const ox = p.rx * side;
      const oz = p.rz * side;
      const s = i * track.spacing;
      const base = railCount * 4;
      positionsRail.push(
        cx - ox * 0.06, cy + H, cz - oz * 0.06,
        cx + ox * 0.06, cy + H, cz + oz * 0.06,
        cx + ox * 0.06, cy + H + RAIL, cz + oz * 0.06,
        cx - ox * 0.06, cy + H + RAIL, cz - oz * 0.06
      );
      uvsRail.push(s, 0, s, 0.12, s, 0.12 + RAIL, s, RAIL);
      indicesRail.push(base, base + 1, base + 2, base, base + 2, base + 3);
      railCount++;
    }

    if (positionsRail.length) {
      const geoRail = new THREE.BufferGeometry();
      geoRail.setAttribute('position', new THREE.Float32BufferAttribute(positionsRail, 3));
      geoRail.setAttribute('uv', new THREE.Float32BufferAttribute(uvsRail, 2));
      geoRail.setIndex(indicesRail);
      geoRail.computeVertexNormals();
      const meshRail = new THREE.Mesh(geoRail, matRail);
      meshRail.castShadow = true;
      group.add(meshRail);
    }
  }

  return group;
}

/**
 * Terrain : une grille qui couvre **toute** la zone du circuit, y compris
 * l'intérieur de la boucle et la bande sous la route.
 *
 * Les versions précédentes ne construisaient qu'un anneau autour de la
 * piste : l'intérieur de la boucle et la bande entre la route et la
 * glissière étaient vides — on voyait le ciel à travers, et le sol n'avait
 * de texture que sous la chaussée.
 *
 * La hauteur suit celle de la piste, puis s'en éloigne en pente douce.
 */
function buildTerrain(track, theme) {
  const group = new THREE.Group();
  group.name = 'terrain';

  const bounds = track.bounds;
  const marge = 160;
  const minX = bounds.minX - marge;
  const maxX = bounds.maxX + marge;
  const minZ = bounds.minZ - marge;
  const maxZ = bounds.maxZ + marge;

  // Résolution de 4 m : assez fine pour épouser le relief près de la piste,
  // assez grossière pour rester raisonnable au loin.
  const pas = 4;
  const nx = Math.ceil((maxX - minX) / pas) + 1;
  const nz = Math.ceil((maxZ - minZ) / pas) + 1;

  /* Index spatial des points de piste : chercher le point le plus proche
     pour chaque sommet de la grille serait quadratique (13 000 × 1 500). */
  const cellule = 25;
  const index = new Map();
  const cle = (ix, iz) => ix + ':' + iz;
  for (let i = 0; i < track.N; i++) {
    const p = track.pts[i];
    const k = cle(Math.floor(p.x / cellule), Math.floor(p.z / cellule));
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(i);
  }

  /** Point de piste le plus proche, par couronnes de cellules. */
  function pointProche(x, z) {
    const ix = Math.floor(x / cellule);
    const iz = Math.floor(z / cellule);
    let meilleur = -1;
    let meilleurD2 = Infinity;
    for (let rayon = 0; rayon <= 8; rayon++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        for (let dz = -rayon; dz <= rayon; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rayon) continue;
          const liste = index.get(cle(ix + dx, iz + dz));
          if (!liste) continue;
          for (const i of liste) {
            const p = track.pts[i];
            const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d2 < meilleurD2) { meilleurD2 = d2; meilleur = i; }
          }
        }
      }
      if (meilleur >= 0) break;
    }
    if (meilleur < 0) {
      // Repli : balayage complet (ne devrait pas arriver).
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 < meilleurD2) { meilleurD2 = d2; meilleur = i; }
      }
    }
    return { p: track.pts[meilleur], d: Math.sqrt(meilleurD2) };
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const couleurs = [];

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ix * pas;
      const z = minZ + iz * pas;
      const { p, d } = pointProche(x, z);
      const ecart = Math.max(0, d - p.half);

      // Sous la route et jusqu'au run-off, le sol est juste sous la
      // chaussée. Ensuite il s'éloigne en pente douce, avec un peu de relief
      // pour ne pas ressembler à une galette.
      const hauteur = hauteurTerrain(p, d, p.half, x, z);

      positions.push(x, hauteur, z);
      uvs.push(x / 12, z / 12);

      // Teinte : plus sombre au loin, pour fondre dans la brume.
      const shade = THREE.MathUtils.clamp(1 - ecart / 220, 0.55, 1);
      couleurs.push(shade, shade, shade);
    }
  }

  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Sens direct : les normales doivent pointer vers le haut.
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = terrainMaterial(theme);
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
 * Construit tout le décor d'un circuit.
 * @param {object} track  circuit (src/core/track.js)
 * @returns {THREE.Group}
 */
export function buildTrackScene(track) {
  const group = new THREE.Group();
  group.name = 'circuit';

  group.add(buildTerrain(track, track.theme));
  group.add(buildRunoff(track));
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
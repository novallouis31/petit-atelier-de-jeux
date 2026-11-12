/**
 * Décor du circuit : arbres, rochers, buissons, tribunes, bâtiments,
 * panneaux publicitaires, pneus, lampadaires et portique de départ.
 *
 * Deux règles :
 *
 *  - tout ce qui se répète est **instancié** (`InstancedMesh`) : les trois
 *    cents arbres ne coûtent que quatre appels de dessin ;
 *  - chaque matériau porte une **texture**. Le validateur
 *    (`src/render/validation.js`) signale tout objet qui n'en aurait pas :
 *    un matériau uni se voit immédiatement à l'écran, et c'est le genre de
 *    défaut que l'on repère trop tard.
 *
 * Le placement est déterministe (générateur à graine) : le décor est
 * identique d'une course à l'autre.
 */

import * as THREE from 'three';
import { concreteMaterial } from './textures.js';
import {
  bandesTexture,
  banniereTexture,
  pneusTexture,
  tribuneTexture,
  metalTexture,
  rocherTexture,
  ecorceTexture,
  feuillageTexture,
  cactusTexture,
} from './proceduralTextures.js';
import { hauteurTerrain, niveauEau } from './terrainHeight.js';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function generer(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crée un `InstancedMesh` à partir d'une liste de transformations.
 *
 * Chaque transformation : `{ x, y, z, echelle | sx, sy, sz, rotY, couleur }`.
 */
function instancier(geo, mat, transforms, depot, { ombre = true, teinte = false } = {}) {
  if (!transforms.length) return null;

  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const ech = new THREE.Vector3();
  const axeY = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    const e = t.echelle ?? 1;
    q.setFromAxisAngle(axeY, t.rotY || 0);
    pos.set(t.x, t.y, t.z);
    ech.set(t.sx ?? e, t.sy ?? e, t.sz ?? e);
    m.compose(pos, q, ech);
    mesh.setMatrixAt(i, m);
    if (teinte) {
      c.set(t.couleur ?? 0xffffff);
      mesh.setColorAt(i, c);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = ombre;
  mesh.receiveShadow = true;
  depot.add(mesh);
  return mesh;
}

/** Hauteur du sol en un point, d'après la géométrie de la piste. */
function solEn(track, x, z) {
  const loc = track.locate(x, z, -1);
  // Même formule que le maillage du terrain (terrainHeight.js), avec le
  // plan tangent reconstruit depuis la projection sur l'axe : le décor
  // repose exactement sur le sol dessiné, dévers et pente compris.
  return {
    loc,
    sol: hauteurTerrain({
      x: loc.px, y: loc.py, z: loc.pz,
      rx: loc.rx, ry: loc.ry, rz: loc.rz,
      tx: loc.tx, ty: loc.ty, tz: loc.tz,
    }, loc.dist, loc.half, x, z),
  };
}

/* --------------------------------------------------------------------------
   Arbres, rochers, buissons — par environnement
   -------------------------------------------------------------------------- */

/**
 * Réglages de végétation par environnement.
 *
 * `env` vient du thème du circuit (`src/core/tracks.js`). Chaque
 * environnement a ses espèces, ses teintes et ses densités : des palmiers
 * ou des sapins enneigés au milieu des dunes casseraient l'illusion.
 */
const ENVS = {
  temperate: {
    pins: 0.45, feuillus: 0.35, cypres: 0.2, arbres: 340,
    rochers: 90, buissons: 150,
    teintePin: [0.30, 0.08, 0.35], teinteFeuillu: [0.30, 0.08, 0.35],
    teinteBuisson: null, teinteRocher: null,
  },
  /* Bord de lac : végétation plus dense et plus claire, près de l'eau. */
  lake: {
    pins: 0.3, feuillus: 0.5, cypres: 0.2, arbres: 380,
    rochers: 60, buissons: 190,
    teintePin: [0.32, 0.1, 0.38], teinteFeuillu: [0.31, 0.12, 0.4],
    teinteBuisson: null, teinteRocher: null,
  },
  /* Montagne : rochers dominants, conifères sombres, peu d'arbres. */
  mountain: {
    pins: 0.9, feuillus: 0.1, cypres: 0, arbres: 170,
    rochers: 260, buissons: 70,
    teintePin: [0.34, 0.28, 0.24], teinteFeuillu: [0.34, 0.28, 0.24],
    teinteBuisson: [0.33, 0.2, 0.3], teinteRocher: null,
  },
  /* Neige : conifères pâles (teinte froide qui désature le feuillage),
     pas de feuillus nus, rochers grisés. */
  snow: {
    pins: 0.75, feuillus: 0.25, cypres: 0, arbres: 230,
    rochers: 130, buissons: 60,
    teintePin: [0.36, 0.06, 0.55], teinteFeuillu: [0.36, 0.06, 0.55],
    teinteBuisson: [0.36, 0.06, 0.55], teinteRocher: [0.35, 0.05, 0.6],
  },
  /* Désert : cactus et buissons morts, rochers couleur grès. */
  desert: {
    pins: 0, feuillus: 0, cypres: 0, arbres: 0, cactus: 120,
    rochers: 200, buissons: 170,
    teintePin: null, teinteFeuillu: null,
    teinteBuisson: [0.09, 0.45, 0.35], teinteRocher: [0.08, 0.5, 0.45],
  },
  /* Ville : quelques arbres d'alignement, presque pas de rochers. */
  city: {
    pins: 0.2, feuillus: 0.6, cypres: 0.2, arbres: 110,
    rochers: 12, buissons: 90,
    teintePin: [0.3, 0.08, 0.35], teinteFeuillu: [0.3, 0.08, 0.35],
    teinteBuisson: null, teinteRocher: null,
  },
};

function buildVegetation(track, rnd, depot, zone, theme) {
  const { cx, cz, span, marge } = zone;
  const env = ENVS[theme?.env] ?? ENVS.temperate;
  // Au bord du lac, rien ne pousse sous le niveau de l'eau.
  const sousEau = niveauEau(track, theme);
  const horsEau = sousEau === null ? () => true : (sol) => sol > sousEau;

  // Feuillages selon l'environnement : enneigés dans la neige (le rendu
  // instancié multiplie la teinte par la texture — on ne peut donc pas
  // éclaircir une texture verte d'été, il faut une texture d'hiver),
  // desséchés dans le désert.
  const neige = theme?.env === 'snow';
  const aride = theme?.env === 'desert';
  const texPin = neige
    ? feuillageTexture('pin-neige', '#2c4a30', '#e6eef4')
    : feuillageTexture('pin', '#24491f', '#3f7a33');
  const texFeuillu = neige
    ? feuillageTexture('feuillu-neige', '#4a5560', '#e8f0f4')
    : feuillageTexture('feuillu', '#2f5d2a', '#63b04f');
  const texBuisson = neige
    ? feuillageTexture('buisson-neige', '#4a5560', '#e8f0f4')
    : aride
      ? feuillageTexture('buisson-aride', '#5f5233', '#8a7a45')
      : feuillageTexture('buisson', '#355c2a', '#5c9440');

  const troncGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 7);
  const troncMat = new THREE.MeshStandardMaterial({ map: ecorceTexture(), roughness: 1 });

  const pinGeo = new THREE.ConeGeometry(1.9, 5.2, 7);
  const pinMat = new THREE.MeshStandardMaterial({
    map: texPin,
    roughness: 0.95,
    flatShading: true,
  });
  const feuilluGeo = new THREE.IcosahedronGeometry(2.4, 1);
  const feuilluMat = new THREE.MeshStandardMaterial({
    map: texFeuillu,
    roughness: 0.95,
    flatShading: true,
  });
  const cypresGeo = new THREE.ConeGeometry(1.15, 6.2, 6);
  const cypresMat = new THREE.MeshStandardMaterial({
    map: feuillageTexture('cypres', '#2a4a26', '#4d8a3d'),
    roughness: 0.95,
    flatShading: true,
  });
  /* Cactus : colonne effilée, texture à côtes verticales. */
  const cactusGeo = new THREE.CylinderGeometry(0.26, 0.34, 2.6, 9);
  const cactusMat = new THREE.MeshStandardMaterial({
    map: cactusTexture(),
    roughness: 0.85,
  });

  const troncs = [];
  const pins = [];
  const feuillus = [];
  const cypres = [];
  const cactus = [];

  for (let i = 0; i < env.arbres; i++) {
    const x = cx + (rnd() - 0.5) * span * 1.7;
    const z = cz + (rnd() - 0.5) * span * 1.7;
    const { loc, sol } = solEn(track, x, z);
    if (loc.dist < marge + 9 || !horsEau(sol)) continue;

    const e = 0.7 + rnd() * 0.8;
    const rotY = rnd() * Math.PI * 2;
    const teinte = new THREE.Color().setHSL(
      env.teintePin[0] + rnd() * 0.04,
      env.teintePin[1],
      env.teintePin[2] + rnd() * 0.12
    );

    troncs.push({ x, y: sol + 1.3 * e, z, echelle: e, rotY });

    const variete = rnd();
    if (variete < env.pins) {
      // Pin : deux étages de branches.
      pins.push({ x, y: sol + 4.4 * e, z, echelle: e, rotY, couleur: teinte });
      pins.push({ x, y: sol + 2.5 * e, z, echelle: e * 0.78, rotY, couleur: teinte });
    } else if (variete < env.pins + env.feuillus) {
      feuillus.push({ x, y: sol + 3.3 * e, z, echelle: e, rotY, couleur: teinte });
    } else if (env.cypres > 0) {
      cypres.push({ x, y: sol + 4.0 * e, z, echelle: e, rotY, couleur: teinte });
    }
  }

  /* Cactus du désert : ils remplacent les arbres. */
  if (env.cactus) {
    for (let i = 0; i < env.cactus; i++) {
      const x = cx + (rnd() - 0.5) * span * 1.6;
      const z = cz + (rnd() - 0.5) * span * 1.6;
      const { loc, sol } = solEn(track, x, z);
      if (loc.dist < marge + 9 || !horsEau(sol)) continue;
      const e = 0.5 + rnd() * 1.1;
      cactus.push({ x, y: sol + 1.3 * e, z, echelle: e, rotY: rnd() * Math.PI * 2 });
    }
  }

  instancier(troncGeo, troncMat, troncs, depot);
  instancier(pinGeo, pinMat, pins, depot, { teinte: true });
  instancier(feuilluGeo, feuilluMat, feuillus, depot, { teinte: true });
  instancier(cypresGeo, cypresMat, cypres, depot, { teinte: true });
  instancier(cactusGeo, cactusMat, cactus, depot);

  /* Rochers et buissons : ils comblent les espaces vides et donnent de
     l'échelle au paysage. Leurs teintes suivent l'environnement. */
  const rocherGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocherMat = new THREE.MeshStandardMaterial({
    map: rocherTexture(),
    roughness: 1,
    flatShading: true,
  });
  const rochers = [];
  for (let i = 0; i < env.rochers; i++) {
    const x = cx + (rnd() - 0.5) * span * 1.6;
    const z = cz + (rnd() - 0.5) * span * 1.6;
    const { loc, sol } = solEn(track, x, z);
    if (loc.dist < marge + 7 || !horsEau(sol)) continue;
    const e = 0.5 + rnd() * 1.9;
    const t = env.teinteRocher
      ? new THREE.Color().setHSL(
          env.teinteRocher[0] + rnd() * 0.02,
          env.teinteRocher[1],
          env.teinteRocher[2] + rnd() * 0.08
        )
      : 0xffffff;
    rochers.push({
      x, y: sol + e * 0.25, z,
      sx: e, sy: e * (0.5 + rnd() * 0.5), sz: e * (0.7 + rnd() * 0.5),
      rotY: rnd() * Math.PI * 2,
      couleur: t,
    });
  }
  instancier(rocherGeo, rocherMat, rochers, depot, { teinte: true });

  const buissonGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const buissonMat = new THREE.MeshStandardMaterial({
    map: texBuisson,
    roughness: 1,
    flatShading: true,
  });
  const buissons = [];
  for (let i = 0; i < env.buissons; i++) {
    const x = cx + (rnd() - 0.5) * span * 1.5;
    const z = cz + (rnd() - 0.5) * span * 1.5;
    const { loc, sol } = solEn(track, x, z);
    if (loc.dist < marge + 4 || !horsEau(sol)) continue;
    const e = 0.5 + rnd() * 1.1;
    const t = env.teinteBuisson
      ? new THREE.Color().setHSL(
          env.teinteBuisson[0] + rnd() * 0.03,
          env.teinteBuisson[1],
          env.teinteBuisson[2] + rnd() * 0.08
        )
      : 0xffffff;
    buissons.push({
      x, y: sol + e * 0.45, z,
      sx: e, sy: e * 0.62, sz: e,
      rotY: rnd() * Math.PI * 2,
      couleur: t,
    });
  }
  instancier(buissonGeo, buissonMat, buissons, depot, { teinte: true });
}

/* --------------------------------------------------------------------------
   Lampadaires, panneaux, pneus, balises
   -------------------------------------------------------------------------- */

function buildEquipements(track, depot, zone, rnd) {
  const { marge } = zone;

  /* Lampadaires : un tous les ~90 m, alternés d'un côté à l'autre. */
  const poteauGeo = new THREE.CylinderGeometry(0.09, 0.15, 7, 6);
  const teteGeo = new THREE.BoxGeometry(1.5, 0.2, 0.45);
  const metal = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.45, metalness: 0.6 });
  const metalLumiere = new THREE.MeshStandardMaterial({
    map: metalTexture(),
    roughness: 0.4,
    metalness: 0.4,
    emissive: new THREE.Color(0xfff0c8),
    emissiveIntensity: 0.5,
  });

  const poteaux = [];
  const tetes = [];
  const pas = Math.max(1, Math.round(90 / track.spacing));
  for (let i = 0; i < track.N; i += pas) {
    const p = track.pts[i];
    const side = (i / pas) % 2 ? 1 : -1;
    const d = marge + 3;
    const x = p.x + p.rx * d * side;
    const z = p.z + p.rz * d * side;
    const sol = hauteurTerrain(p, d, p.half, x, z);
    poteaux.push({ x, y: sol + 3.5, z, echelle: 1 });
    tetes.push({ x, y: sol + 7.0, z, echelle: 1, rotY: Math.atan2(p.tx, p.tz) });
  }
  instancier(poteauGeo, metal, poteaux, depot);
  instancier(teteGeo, metalLumiere, tetes, depot);

  /* Balises de distance : petits panneaux rayés tous les 40 m. */
  const baliseGeo = new THREE.BoxGeometry(0.55, 1.1, 0.16);
  const baliseMat = new THREE.MeshStandardMaterial({
    map: bandesTexture('balise', ['#c0392b', '#f2f2f2'], 2),
    roughness: 0.7,
  });
  const balises = [];
  const pasBalise = Math.max(1, Math.round(40 / track.spacing));
  for (let i = 0; i < track.N; i += pasBalise) {
    const p = track.pts[i];
    for (const side of [1, -1]) {
      const d = marge - 0.4;
      const x = p.x + p.rx * d * side;
      const z = p.z + p.rz * d * side;
      const sol = hauteurTerrain(p, d, p.half, x, z);
      balises.push({ x, y: sol + 0.55, z, echelle: 1, rotY: Math.atan2(p.tx, p.tz) });
    }
  }
  instancier(baliseGeo, baliseMat, balises, depot);

  /* Panneaux publicitaires : dans les virages, face à la piste. */
  const BANNIERES = [
    { texte: 'COURSE 3D', fond: '#123a6b' },
    { texte: 'PNEUS', fond: '#8e2f22' },
    { texte: 'ESSENCE', fond: '#1d5c3a' },
    { texte: 'CHRONO', fond: '#20242c' },
  ];
  const panneauGeo = new THREE.PlaneGeometry(6, 2.2);

  const candidats = [];
  for (let i = 0; i < track.N; i++) {
    const p = track.pts[i];
    if (Math.abs(p.curvS) < 0.004) continue;
    const dernier = candidats[candidats.length - 1];
    if (dernier !== undefined) {
      const ecart = Math.min(
        Math.abs(i - dernier),
        track.N - Math.abs(i - dernier)
      ) * track.spacing;
      if (ecart < 55) continue;
    }
    candidats.push(i);
  }

  const parVariante = BANNIERES.map(() => []);
  candidats.slice(0, 16).forEach((i, k) => {
    const p = track.pts[i];
    // L'extérieur d'un virage à droite (curvS > 0) est le côté gauche.
    const side = p.curvS > 0 ? -1 : 1;
    const d = marge + 5;
    const x = p.x + p.rx * d * side;
    const z = p.z + p.rz * d * side;
    const sol = hauteurTerrain(p, d, p.half, x, z);
    // Le panneau regarde vers la piste.
    const rotY = Math.atan2(-side * p.rx, -side * p.rz);
    parVariante[k % BANNIERES.length].push({ x, y: sol + 2.6, z, echelle: 1, rotY });
  });

  BANNIERES.forEach((b, k) => {
    const mat = new THREE.MeshStandardMaterial({
      map: banniereTexture(b.texte, b.fond),
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    instancier(panneauGeo, mat, parVariante[k], depot, { ombre: false });
  });

  /* Pneus empilés : dans les virages serrés, derrière la glissière. */
  const pneuGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.84, 10);
  const pneuMat = new THREE.MeshStandardMaterial({ map: pneusTexture(), roughness: 0.95 });
  const pneus = [];
  let dernierPneu = -Infinity;
  for (let i = 0; i < track.N; i++) {
    const p = track.pts[i];
    if (Math.abs(p.curvS) < 0.011) continue;
    const s = i * track.spacing;
    if (s - dernierPneu < 30) continue;
    dernierPneu = s;
    const side = p.curvS > 0 ? -1 : 1;
    const d = marge + 2;
    const x = p.x + p.rx * d * side;
    const z = p.z + p.rz * d * side;
    const sol = hauteurTerrain(p, d, p.half, x, z);
    pneus.push({ x, y: sol + 0.42, z, echelle: 1, rotY: rnd() * Math.PI });
  }
  instancier(pneuGeo, pneuMat, pneus, depot);
}

/* --------------------------------------------------------------------------
   Tribunes, bâtiments, portique
   -------------------------------------------------------------------------- */

function buildTribunes(track, depot, zone) {
  const { marge } = zone;

  const baseGeo = new THREE.BoxGeometry(26, 5, 9);
  const baseMat = new THREE.MeshStandardMaterial({ map: tribuneTexture(), roughness: 0.85 });
  const toitGeo = new THREE.BoxGeometry(26.5, 0.3, 10);
  const toitMat = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.5, metalness: 0.5 });

  const bases = [];
  const toits = [];
  for (const s of [0.03, 0.065, 0.1]) {
    const p = track.pointAtS(s);
    const d = marge + 14;
    const x = p.x + p.rx * d;
    const z = p.z + p.rz * d;
    const sol = hauteurTerrain(p, d, p.half, x, z);
    const rotY = Math.atan2(p.tx, p.tz);
    bases.push({ x, y: sol + 2.5, z, echelle: 1, rotY });
    toits.push({ x, y: sol + 7.4, z, echelle: 1, rotY });
  }
  instancier(baseGeo, baseMat, bases, depot);
  instancier(toitGeo, toitMat, toits, depot);

  /* Bâtiments des stands, à côté de la ligne de départ. */
  const batGeo = new THREE.BoxGeometry(18, 6, 8);
  const batMat = concreteMaterial();
  const batToitGeo = new THREE.BoxGeometry(19, 0.4, 9);
  const batToits = [];
  const batiments = [];
  for (const s of [0.012, 0.05]) {
    const p = track.pointAtS(s);
    const d = marge + 20;
    const x = p.x - p.rx * d;
    const z = p.z - p.rz * d;
    const sol = hauteurTerrain(p, d, p.half, x, z);
    const rotY = Math.atan2(p.tx, p.tz);
    batiments.push({ x, y: sol + 3, z, echelle: 1, rotY });
    batToits.push({ x, y: sol + 6.2, z, echelle: 1, rotY });
  }
  instancier(batGeo, batMat, batiments, depot);
  instancier(batToitGeo, toitMat, batToits, depot);
}

/** Portique de départ : deux poteaux, une travée et une bannière. */
function buildPortique(track, depot) {
  const p = track.pointAtS(0);
  const groupe = new THREE.Group();
  groupe.name = 'portique';

  const metal = new THREE.MeshStandardMaterial({
    map: metalTexture(),
    roughness: 0.45,
    metalness: 0.6,
  });
  const banniereMat = new THREE.MeshStandardMaterial({
    map: banniereTexture('COURSE 3D', '#123a6b'),
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  const posteGeo = new THREE.BoxGeometry(0.45, 6.5, 0.45);
  for (const side of [1, -1]) {
    const poste = new THREE.Mesh(posteGeo, metal);
    poste.position.set(
      p.x + p.rx * (p.half + 1.2) * side,
      p.y + 3.25,
      p.z + p.rz * (p.half + 1.2) * side
    );
    poste.castShadow = true;
    groupe.add(poste);
  }

  const rotY = Math.atan2(p.tx, p.tz);

  const travee = new THREE.Mesh(
    new THREE.BoxGeometry(p.width + 3.6, 0.9, 0.5),
    metal
  );
  travee.position.set(p.x, p.y + 6.2, p.z);
  travee.rotation.y = rotY;
  travee.castShadow = true;
  groupe.add(travee);

  const banniere = new THREE.Mesh(
    new THREE.PlaneGeometry(p.width + 2, 1.7),
    banniereMat
  );
  banniere.position.set(p.x, p.y + 5.1, p.z);
  // La face avant du plan regarde la direction de course : vue de
  // l'approche, le texte est à l'endroit — et non en miroir.
  banniere.rotation.y = rotY + Math.PI;
  groupe.add(banniere);

  depot.add(groupe);
  return groupe;
}

/* --------------------------------------------------------------------------
   Point d'entrée
   -------------------------------------------------------------------------- */

/**
 * Construit le décor d'un circuit.
 * @param {object} track  circuit (src/core/track.js)
 * @param {object} theme  thème visuel (src/core/tracks.js)
 */
export function buildScenery(track, theme) {
  const group = new THREE.Group();
  group.name = 'decor';

  const rnd = generer(1337);
  const bounds = track.bounds;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const marge = track.halfWidth + track.runoff;

  const zone = { cx, cz, span, marge };

  buildVegetation(track, rnd, group, zone, theme);
  buildEquipements(track, group, zone, rnd);
  buildTribunes(track, group, zone);
  buildPortique(track, group);

  return group;
}
/**
 * Modèle 3D de la voiture.
 *
 * La voiture est **construite par code** : aucun modèle 3D externe à
 * télécharger, aucune question de licence, et des proportions maîtrisées.
 *
 * Repère local du modèle :
 *  - **+Z** vers l'avant ;
 *  - **+X** vers la gauche de la voiture ;
 *  - **+Y** vers le haut.
 *
 * L'orientation dans le monde n'est PAS reconstruite à partir d'angles
 * accumulés : on la déduit de la **normale de la route** (fournie par la
 * physique) et de la direction du véhicule. C'est exact sur les dévers et
 * les pentes, là où une simple accumulation de lacet, tangage et roulis
 * dériverait.
 */

import * as THREE from 'three';
import {
  peintureTexture,
  carboneTexture,
  numeroTexture,
  pneusTexture,
  metalTexture,
} from './proceduralTextures.js';

/** Dimensions de la carrosserie (mètres). */
const LONG = 4.3;
const LARGEUR = 1.9;
const HAUTEUR = 1.06;
const ROUE_R = 0.34;
const ROUE_LARGEUR = 0.3;
const ESSIEU_AVANT = 1.3;
const ESSIEU_ARRIERE = -1.3;
const DEMI_ESSIEU = LARGEUR * 0.45;

/**
 * Carrosserie : caisse, habitacle, vitres, aileron, diffuseur, phares.
 */
function buildBody(couleur, secondaire, numero = 1) {
  const group = new THREE.Group();

  // La peinture porte une texture de paillettes : sans elle, la carrosserie
  // est un aplat qui ne réagit pas à la lumière.
  const paint = new THREE.MeshPhysicalMaterial({
    color: couleur,
    map: peintureTexture(),
    roughness: 0.3,
    metalness: 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: secondaire,
    map: carboneTexture(),
    roughness: 0.55,
    metalness: 0.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x141a24,
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
  });

  // Bas de caisse.
  const bas = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR, 0.34, LONG), paint);
  bas.position.y = 0.34;
  bas.castShadow = true;
  group.add(bas);

  // Habitacle, plus étroit et plus court.
  const haut = new THREE.Mesh(
    new THREE.BoxGeometry(LARGEUR * 0.8, HAUTEUR - 0.34, LONG * 0.5),
    paint
  );
  haut.position.set(0, 0.34 + (HAUTEUR - 0.34) / 2, -0.2);
  haut.castShadow = true;
  group.add(haut);

  // Pare-brise incliné.
  const pareBrise = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR * 0.72, 0.52, 0.07), glass);
  pareBrise.position.set(0, 0.84, LONG * 0.23);
  pareBrise.rotation.x = -0.52;
  group.add(pareBrise);

  // Vitres latérales.
  for (const side of [1, -1]) {
    const vitre = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, LONG * 0.38), glass);
    vitre.position.set(side * LARGEUR * 0.4, 0.85, -0.2);
    group.add(vitre);
  }

  // Lunette arrière.
  const lunette = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR * 0.7, 0.4, 0.06), glass);
  lunette.position.set(0, 0.85, -LONG * 0.44);
  lunette.rotation.x = 0.55;
  group.add(lunette);

  // Aileron arrière.
  const aileron = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR * 0.9, 0.05, 0.36), dark);
  aileron.position.set(0, 0.94, -LONG / 2 + 0.18);
  aileron.castShadow = true;
  group.add(aileron);

  for (const side of [1, -1]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.1), dark);
    support.position.set(side * LARGEUR * 0.34, 0.8, -LONG / 2 + 0.18);
    group.add(support);
  }

  // Diffuseur.
  const diffuseur = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR * 0.78, 0.13, 0.28), dark);
  diffuseur.position.set(0, 0.25, -LONG / 2 + 0.07);
  group.add(diffuseur);

  // Phares avant.
  const headlights = [];
  for (const side of [1, -1]) {
    const phare = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.11, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xfff8e2,
        emissive: 0xffeec2,
        emissiveIntensity: 0.7,
        roughness: 0.25,
      })
    );
    phare.position.set(side * LARGEUR * 0.31, 0.53, LONG / 2 - 0.01);
    group.add(phare);
    headlights.push(phare);
  }

  // Feux arrière : ils s'allument au freinage.
  const taillights = [];
  for (const side of [1, -1]) {
    const feu = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x7a1414,
        emissive: 0xff2a1a,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      })
    );
    feu.position.set(side * LARGEUR * 0.29, 0.56, -LONG / 2 + 0.01);
    group.add(feu);
    taillights.push(feu);
  }

  // Numéro de course sur le capot.
  const numeroMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshStandardMaterial({ map: numeroTexture(numero), roughness: 0.65 })
  );
  numeroMesh.rotation.x = -Math.PI / 2;
  numeroMesh.position.set(0, 0.53, LONG * 0.34);
  group.add(numeroMesh);

  group.userData.taillights = taillights;
  group.userData.headlights = headlights;
  return group;
}

/** Une roue : pneu, jante et rayons (pour lire la rotation). */
function buildWheel() {
  const group = new THREE.Group();

  const pneu = new THREE.Mesh(
    new THREE.CylinderGeometry(ROUE_R, ROUE_R, ROUE_LARGEUR, 20),
    new THREE.MeshStandardMaterial({ color: 0x131313, map: pneusTexture(), roughness: 0.95 })
  );
  // Le cylindre est orienté selon Y : on le tourne pour l'aligner sur X.
  pneu.rotation.z = Math.PI / 2;
  pneu.castShadow = true;
  group.add(pneu);

  const jante = new THREE.Mesh(
    new THREE.CylinderGeometry(ROUE_R * 0.6, ROUE_R * 0.6, ROUE_LARGEUR * 1.03, 16),
    new THREE.MeshStandardMaterial({
      color: 0xc2c6ce,
      map: metalTexture(),
      roughness: 0.28,
      metalness: 0.9,
    })
  );
  jante.rotation.z = Math.PI / 2;
  group.add(jante);

  // Trois rayons : ils donnent le sens de rotation.
  for (let i = 0; i < 3; i++) {
    const rayon = new THREE.Mesh(
      new THREE.BoxGeometry(ROUE_LARGEUR * 1.06, ROUE_R * 0.86, 0.055),
      new THREE.MeshStandardMaterial({ color: 0x242424, map: carboneTexture(), roughness: 0.9 })
    );
    rayon.rotation.x = (i * Math.PI) / 3;
    group.add(rayon);
  }

  return group;
}

/**
 * Construit une voiture complète.
 * @param {object} opts { couleur, secondaire, numero }
 */
export function buildCar(opts = {}) {
  const couleur = opts.couleur ?? 0xff5666;
  const secondaire = opts.secondaire ?? 0xa71f32;

  const root = new THREE.Group();

  // Le châssis porte le tangage et le roulis dynamiques ; les roues restent
  // au sol.
  const chassis = new THREE.Group();
  const body = buildBody(couleur, secondaire, opts.numero ?? 1);
  chassis.add(body);
  root.add(chassis);

  // Les quatre roues : x = latéral, z = longitudinal.
  const roues = [];
  const positions = [
    { x: -DEMI_ESSIEU, z: ESSIEU_AVANT, avant: true },
    { x: DEMI_ESSIEU, z: ESSIEU_AVANT, avant: true },
    { x: -DEMI_ESSIEU, z: ESSIEU_ARRIERE, avant: false },
    { x: DEMI_ESSIEU, z: ESSIEU_ARRIERE, avant: false },
  ];

  for (const p of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(p.x, ROUE_R, p.z);
    const roue = buildWheel();
    pivot.add(roue);
    root.add(pivot);
    roues.push({ pivot, roue, avant: p.avant });
  }

  root.userData.chassis = chassis;
  root.userData.roues = roues;
  root.userData.taillights = body.userData.taillights;
  root.userData.headlights = body.userData.headlights;

  return root;
}

/* --------------------------------------------------------------------------
   Orientation
   -------------------------------------------------------------------------- */

/** Vecteurs auxiliaires, réutilisés pour éviter les allocations par image. */
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _left = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _yaw = new THREE.Matrix4();
const _invYaw = new THREE.Matrix4();
const _pitch = new THREE.Matrix4();
const _roll = new THREE.Matrix4();
const _local = new THREE.Matrix4();

/**
 * Met à jour l'animation d'une voiture à partir de son état de simulation.
 *
 * @param {THREE.Group} voiture
 * @param {object} car      état du véhicule (doit contenir la normale de la route)
 * @param {number} dt       pas de temps
 */
export function updateCarMesh(voiture, car, dt) {
  const { chassis, roues, taillights } = voiture.userData;

  // Position monde.
  voiture.position.set(car.x, car.y, car.z);

  // Cap : la voiture avance selon (cos h, 0, sin h). Le modèle local pointe
  // vers +Z, d'où la rotation de π/2 - h.
  const yaw = Math.PI / 2 - car.heading;
  voiture.rotation.set(0, yaw, 0);

  // --- orientation du châssis ---
  // Direction avant, dans le monde.
  _forward.set(Math.cos(car.heading), 0, Math.sin(car.heading));

  // Normale de la route : c'est elle qui donne l'assiette (pente + dévers).
  const nx = car.nx ?? 0;
  const ny = car.ny ?? 1;
  const nz = car.nz ?? 0;
  _up.set(nx, ny, nz).normalize();

  // Axe « gauche » : perpendiculaire à l'avant, dans le plan de la route.
  //
  // Attention au sens du produit vectoriel : `_up × _forward` donne la
  // GAUCHE (et forme une base directe avec `_up` et `_forward`).
  // `_forward × _up` donnerait la droite, mais la base serait alors **miroir**
  // (déterminant −1) : le châssis était affiché en miroir, et le roulis
  // apparaissait à l'envers — la voiture penchait vers l'intérieur du
  // virage alors que la physique veut l'extérieur.
  _left.crossVectors(_up, _forward).normalize();

  // Recompose une base orthonormée (l'axe haut est ré-orthogonalisé).
  _up.crossVectors(_forward, _left).normalize();

  // Base monde, puis passage dans le repère local du modèle.
  _basis.makeBasis(_left, _up, _forward);
  _yaw.makeRotationY(yaw);
  _invYaw.copy(_yaw).invert();
  _local.multiplyMatrices(_invYaw, _basis);

  // Tangage dynamique : nez qui lève sous l'accélération.
  _pitch.makeRotationX(-car.pitch);
  // Roulis dynamique : la voiture se couche vers l'extérieur du virage.
  _roll.makeRotationZ(car.roll);

  _local.multiply(_roll);
  _local.multiply(_pitch);

  chassis.matrix.copy(_local);
  chassis.matrix.decompose(chassis.position, chassis.quaternion, chassis.scale);

  // --- roues ---
  // Rotation : la roue tourne à la vitesse du véhicule.
  const rotationRoue = (car.u / ROUE_R) * dt;
  for (const r of roues) {
    r.roue.rotation.x += rotationRoue;
    // Les roues avant pivotent avec la direction.
    // `steer > 0` = vers la droite. Le modèle local a +X vers la GAUCHE :
    // une rotation positive autour de Y braque donc à gauche, d'où le signe
    // moins.
    if (r.avant) r.pivot.rotation.y = -car.steer;
  }

  // Feux arrière : ils s'allument au freinage.
  const allume = car.input.brake ? 2.4 : 0.3;
  for (const feu of taillights) {
    feu.material.emissiveIntensity +=
      (allume - feu.material.emissiveIntensity) * Math.min(1, dt * 12);
  }
}

/** Couleurs des pilotes. */
export const PLAYER_COLORS = [
  { couleur: 0xff5666, secondaire: 0xa71f32, nom: 'JOUEUR' },
  { couleur: 0x42a9ff, secondaire: 0x0f5f9e, nom: 'IA 1' },
  { couleur: 0x5de08a, secondaire: 0x1f7a45, nom: 'IA 2' },
  { couleur: 0xffb14d, secondaire: 0xa35c0a, nom: 'IA 3' },
];

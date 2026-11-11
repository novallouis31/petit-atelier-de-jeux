/**
 * Moteur physique du véhicule.
 *
 * Modèle bicyclette (d'après « Vehicle Dynamics » de Pacejka) enrichi pour
 * la 3D :
 *  - transfert de charge longitudinal (squat / plongeon) ;
 *  - courbe de dérive simplifiée (formule magique) par essieu ;
 *  - cercle de friction : la force longitudinale consomme l'adhérence latérale ;
 *  - gravité projetée : la pente fait accélérer la voiture en descente, le
 *    dévers pousse vers l'intérieur du virage ;
 *  - appui aérodynamique proportionnel au carré de la vitesse ;
 *  - correction électronique de stabilité (ESC) et contrôle de motricité.
 *
 * Repère véhicule : x avant, y latéral (vers la droite du conducteur),
 * z vertical. Unités SI strictes : mètres, kilogrammes, secondes, newtons.
 *
 * Module pur : aucun accès au DOM, testable sous Node.
 */

import { clamp, lerp, sign, moveTowards } from './mathx.js';

export const PHYS = {
  mass: 1180,
  // Centre de gravité légèrement reculé : plus de charge à l'arrière, donc
  // plus de motricité et un comportement globalement sous-vireur.
  cgFront: 1.28,   // distance CG → essieu avant (m)
  cgRear: 1.32,    // distance CG → essieu arrière (m)
  wheelbase: 2.6,
  trackWidth: 1.64,
  inertia: 1520,
  cgHeight: 0.46,
  gravity: 9.81,

  muRoad: 1.85,     // gomme slick sur asphalte
  muOff: 0.62,      // gazon / gravier
  rearGrip: 1.06,   // grip supplémentaire à l'arrière (stabilité)

  engineForce: 11000,   // force motrice max (N)
  enginePower: 165000,  // puissance max (W)
  reverseForce: 4800,
  maxReverseSpeed: 9,

  brakeForce: 16800,
  brakeFrontBias: 0.63,

  drag: 0.42,        // traînée aérodynamique (½ρCdA)
  offDrag: 0.68,
  rolling: 190,      // résistance au roulement (N)
  offRolling: 1500,
  downforce: 2.4,    // coefficient d'appui (N par (m/s)²)

  steerLock: 0.55,
  steerRateLow: 4.6,
  steerRateHigh: 1.9,
  lateralLimit: 12.4,
  handbrakeGrip: 0.34,
  handbrakeSteer: 0.32,

  tireB: 7.6,
  tireC: 1.42,

  yawDamping: 250,
  tractionControl: 0.78,
  esc: 1.0,

  // Collision
  bodyLength: 4.3,
  bodyWidth: 1.9,
  collisionRadius: 1.0,
  collisionOffsets: [-1.42, 0, 1.42],
};

/** Création d'un état de véhicule. */
export function createCarState(index) {
  return {
    index,
    x: 0, y: 0, z: 0,       // position monde
    heading: 0,              // lacet (rad)
    pitch: 0,                // tangage (rad)
    roll: 0,                 // roulis (rad)
    u: 0,                    // vitesse longitudinale (repère voiture)
    v: 0,                    // vitesse latérale (vers la droite)
    r: 0,                    // vitesse de lacet
    vy: 0,                   // vitesse verticale
    steer: 0,
    steerCmd: 0,
    ax: 0, ay: 0,
    slipF: 0, slipR: 0,
    fzF: 0, fzR: 0,
    nx: 0, ny: 1, nz: 0,      // normale de la route (assiette)
    idx: -1,
    progress: 0,
    prevProgress: 0,
    lateral: 0,              // écart au centre (positif = côté gauche)
    surface: 0,              // 0 = asphalte, 1 = hors piste
    onTrack: true,
    airborne: false,
    groundY: 0,
    wallImpact: 0,
    collisionImpact: 0,
    input: { throttle: 0, brake: 0, steer: 0, hand: false },

    started: false,
    cpNext: 0,
    lapsCompleted: 0,
    lapStart: 0,
    lapTimes: [],
    lastLap: 0,
    bestLap: 0,
    finished: false,
    finishTime: 0,
    position: index + 1,

    aiState: { stuck: 0, reverse: 0, seed: index * 2.17, lastSteer: 0 },
  };
}

/* --------------------------------------------------------------------------
   Adaptateurs injectés par le jeu (évite les imports croisés).
   -------------------------------------------------------------------------- */

const noTrack = {
  x: 0, y: 0, z: 0, tx: 1, ty: 0, tz: 0,
  rx: 0, ry: 0, rz: 1, nx: 0, ny: 1, nz: 0,
  half: 7, bank: 0,
};

let trackPointAtS = () => noTrack;
let trackLocate = () => ({
  index: 0, progress: 0, lateral: 0, dist: 0, half: 7, onTrack: true,
  height: 0, nx: 0, ny: 1, nz: 0, bank: 0, tx: 1, ty: 0, tz: 0,
});
let trackRunoff = () => 5.5;

/** Branche la géométrie du circuit courant sur le moteur physique. */
export function bindTrack(pointAtS, locate, runoff) {
  trackPointAtS = pointAtS;
  trackLocate = locate;
  if (typeof runoff === 'function') trackRunoff = runoff;
}

/** Replace un véhicule sur la grille de départ. */
export function resetCar(car, s, lateral) {
  const p = trackPointAtS(s);
  car.x = p.x + p.rx * lateral;
  car.y = p.y + p.ry * lateral;
  car.z = p.z + p.rz * lateral;
  car.heading = Math.atan2(p.tz, p.tx);
  car.pitch = Math.asin(clamp(p.ty, -1, 1));
  car.roll = p.bank;
  car.u = 0; car.v = 0; car.r = 0; car.vy = 0;
  car.steer = 0; car.steerCmd = 0;
  car.ax = 0; car.ay = 0;
  car.slipF = 0; car.slipR = 0;
  car.fzF = 0; car.fzR = 0;
  car.nx = 0; car.ny = 1; car.nz = 0;
  car.idx = -1;
  car.surface = 0;
  car.onTrack = true;
  car.airborne = false;
  car.wallImpact = 0;
  car.collisionImpact = 0;
  car.input.throttle = 0;
  car.input.brake = 0;
  car.input.steer = 0;
  car.input.hand = false;

  car.started = false;
  car.cpNext = 0;
  car.lapsCompleted = 0;
  car.lapStart = 0;
  car.lapTimes.length = 0;
  car.lastLap = 0;
  car.bestLap = 0;
  car.finished = false;
  car.finishTime = 0;

  const loc = trackLocate(car.x, car.z, -1);
  car.idx = loc.index;
  car.progress = loc.progress;
  car.prevProgress = loc.progress;
  car.lateral = loc.lateral;
  car.surface = loc.onTrack ? 0 : 1;
  car.onTrack = loc.onTrack;
  car.groundY = loc.height;
  car.y = loc.height;
}

/* --------------------------------------------------------------------------
   Correcteur électronique de stabilité
   -------------------------------------------------------------------------- */

function escLimitFor(car) {
  if (PHYS.esc <= 0 || Math.abs(car.u) <= 3) return Infinity;
  const mu = car.surface === 1 ? PHYS.muOff : PHYS.muRoad;
  const hand = car.input && car.input.hand ? 0.72 : 1;
  return ((mu * hand * PHYS.gravity) / Math.abs(car.u)) * PHYS.esc;
}

function applyEsc(car) {
  const lim = escLimitFor(car);
  if (car.r > lim) car.r = lim;
  else if (car.r < -lim) car.r = -lim;
}

/** Force latérale d'un pneu (formule magique simplifiée). */
function tireForce(alpha, mu, fz) {
  return -mu * fz * Math.sin(PHYS.tireC * Math.atan(PHYS.tireB * alpha));
}

/* --------------------------------------------------------------------------
   Avancement d'un véhicule d'un pas de temps fixe.
   -------------------------------------------------------------------------- */

export function stepCar(car, dt) {
  const inp = car.input;

  /* ---- localisation sur la piste ---- */
  const loc = trackLocate(car.x, car.z, car.idx);
  car.idx = loc.index;
  const off = loc.dist > loc.half;
  const mu = off ? PHYS.muOff : PHYS.muRoad;
  car.surface = off ? 1 : 0;
  car.onTrack = !off;

  const m = PHYS.mass;
  const ch = Math.cos(car.heading);
  const sh = Math.sin(car.heading);

  /* ---- géométrie de la route : normale et pentes ---- */
  const ny = loc.ny || 1;
  // Pente le long de l'axe avant de la voiture (metTRE 1 = montée).
  const slopeF = -((loc.nx || 0) * ch + (loc.nz || 0) * sh) / ny;
  // Pente le long de l'axe latéral (le dévers).
  const slopeV = -((loc.nx || 0) * -sh + (loc.nz || 0) * ch) / ny;
  // Charge normale : m·g·cos(angle de la route).
  const loadScale = clamp(ny, 0.4, 1);

  /* ---- suspension : la voiture suit la route, ou part en l'air ---- */
  const groundY = loc.height;
  const groundVy = (groundY - car.groundY) / dt;
  car.vy -= PHYS.gravity * dt;
  car.y += car.vy * dt;
  if (car.y <= groundY) {
    // La route est remontée par la voiture : on recolle.
    car.y = groundY;
    car.vy = clamp(groundVy, -40, 40);
    car.airborne = false;
  } else {
    // La route descend plus vite que la gravité : la voiture décolle.
    car.airborne = true;
  }
  car.groundY = groundY;

  /* ---- direction : limitation en vitesse + lissage ---- */
  const absU = Math.abs(car.u);
  const steerRate =
    lerp(PHYS.steerRateLow, PHYS.steerRateHigh, clamp(absU / 30, 0, 1)) *
    (Math.abs(inp.steer) > Math.abs(car.steerCmd) ? 1 : 1.6);
  car.steerCmd = moveTowards(car.steerCmd, inp.steer, steerRate * dt);

  let maxSteer = Math.min(
    PHYS.steerLock,
    Math.atan((PHYS.wheelbase * PHYS.lateralLimit) / Math.max(car.u * car.u, 4))
  );
  if (inp.hand) maxSteer = Math.max(maxSteer, PHYS.handbrakeSteer);
  car.steer = car.steerCmd * maxSteer;

  const delta = car.steer;
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);

  /* ---- charges par essieu (transfert longitudinal) ---- */
  const staticF = ((m * PHYS.gravity * PHYS.cgRear) / PHYS.wheelbase) * loadScale;
  const staticR = ((m * PHYS.gravity * PHYS.cgFront) / PHYS.wheelbase) * loadScale;
  const shift = (m * car.ax * PHYS.cgHeight) / PHYS.wheelbase;
  let fzF = clamp(staticF - shift, staticF * 0.20, staticF * 2.5);
  let fzR = clamp(staticR + shift, staticR * 0.20, staticR * 2.5);

  /* ---- appui aérodynamique (croît avec le carré de la vitesse) ---- */
  const speed2 = car.u * car.u + car.v * car.v;
  const downforce = PHYS.downforce * speed2;
  fzF += (downforce * fzF) / Math.max(1, fzF + fzR);
  fzR += (downforce * fzR) / Math.max(1, fzF + fzR);
  car.fzF = fzF;
  car.fzR = fzR;

  /* ---- angles de glissement ---- */
  const vfx = car.u;
  const vfy = car.v + PHYS.cgFront * car.r;
  const vrx = car.u;
  const vry = car.v - PHYS.cgRear * car.r;
  const spF = Math.hypot(vfx, vfy);
  const spR = Math.hypot(vrx, vry);

  let alphaF = 0;
  let alphaR = 0;
  if (spF > 0.45) {
    alphaF = Math.atan2(cosD * vfy - sinD * vfx, cosD * vfx + sinD * vfy);
  }
  if (spR > 0.45) {
    alphaR = Math.atan2(vry, vrx);
  }
  car.slipF = alphaF;
  car.slipR = alphaR;

  let fyF = tireForce(alphaF, mu, fzF);
  let fyR = tireForce(alphaR, mu * PHYS.rearGrip, fzR);

  /* ---- moteur / frein / marche arrière ---- */
  let engineDir = 0;
  let braking = 0;

  if (inp.throttle && !inp.brake) {
    if (car.u < -0.8) braking = 1;
    else engineDir = 1;
  } else if (inp.brake && !inp.throttle) {
    if (car.u > 0.8) braking = 1;
    else engineDir = -1;
  } else if (inp.throttle && inp.brake) {
    braking = 1;
  }

  const dir = sign(car.u) || 1;
  let fxFront = 0;
  let fxRear = 0;

  if (braking && Math.abs(car.u) > 0.3) {
    const front = Math.min(PHYS.brakeForce * PHYS.brakeFrontBias, mu * fzF * 0.97);
    const rear = Math.min(PHYS.brakeForce * (1 - PHYS.brakeFrontBias), mu * fzR * 0.97);
    fxFront -= dir * front;
    fxRear -= dir * rear;
  }

  if (engineDir > 0) {
    const powerLimit = PHYS.enginePower / Math.max(absU, 5);
    fxRear += Math.min(PHYS.engineForce, powerLimit);
    // Contrôle de motricité : on n'utilise pas toute l'adhérence arrière
    // pour propulser quand les roues avant sont braquées.
    const steerLoad = clamp(Math.abs(car.steer) / Math.max(1e-6, maxSteer), 0, 1);
    const cap = mu * fzR * lerp(1, PHYS.tractionControl, steerLoad * steerLoad);
    fxRear = Math.min(fxRear, cap);
  } else if (engineDir < 0 && car.u > -PHYS.maxReverseSpeed) {
    fxRear -= PHYS.reverseForce;
  }

  let rearGripScale = 1;
  if (inp.hand && Math.abs(car.u) > 0.8) {
    rearGripScale = PHYS.handbrakeGrip;
    fxRear = -dir * mu * fzR * 0.9;
  }

  /* ---- cercle de friction : la force longitudinale consomme du grip ---- */
  const utilF = clamp(Math.abs(fxFront) / Math.max(1, mu * fzF), 0, 1);
  const utilR = clamp(Math.abs(fxRear) / Math.max(1, mu * fzR), 0, 1);
  fyF *= Math.sqrt(Math.max(0, 1 - utilF * utilF));
  fyR *= Math.sqrt(Math.max(0, 1 - utilR * utilR)) * rearGripScale;

  /* ---- somme des forces dans le repère voiture ---- */
  let fxBody = fxFront * cosD - fyF * sinD + fxRear;
  let fyBody = fxFront * sinD + fyF * cosD + fyR;
  let mz = PHYS.cgFront * (fxFront * sinD + fyF * cosD) - PHYS.cgRear * fyR;
  mz -= PHYS.yawDamping * car.r * clamp(absU / 8, 0, 1);

  /* ---- gravité projetée dans le repère voiture ----
     En montée, une part du poids freine ; en descente, elle pousse.
     Le dévers ajoute une composante latérale qui aide à tenir le virage. */
  fxBody -= m * PHYS.gravity * slopeF;
  fyBody -= m * PHYS.gravity * slopeV;

  /* ---- résistances ---- */
  const rolling = off ? PHYS.offRolling : PHYS.rolling;
  const dragC = off ? PHYS.offDrag : PHYS.drag;

  fxBody -= sign(car.u) * rolling * clamp(Math.abs(car.u) / 1.5, 0, 1);
  // Traînée aérodynamique : elle est proportionnelle au CARRÉ de la vitesse
  // (F = ½·ρ·Cd·A·v²). On l'applique dans le sens opposé au mouvement.
  const speed = Math.hypot(car.u, car.v);
  if (speed > 0.05) {
    const dragForce = dragC * speed * speed;
    fxBody -= (car.u / speed) * dragForce;
    fyBody -= (car.v / speed) * dragForce;
  }

  car.ax = fxBody / m;
  car.ay = fyBody / m;

  /* ---- intégration semi-implicite (plan) ---- */
  car.u += (fxBody / m + car.r * car.v) * dt;
  car.v += (fyBody / m - car.r * car.u) * dt;
  car.r += (mz / PHYS.inertia) * dt;

  applyEsc(car);

  if (Math.abs(car.u) < 0.5 && Math.abs(car.v) < 0.5 && !inp.throttle && !inp.brake) {
    car.u *= 0.9;
    car.v *= 0.82;
    car.r *= 0.82;
  }
  if (Math.abs(car.u) + Math.abs(car.v) < 1.2) car.r *= 0.985;

  car.heading += car.r * dt;

  const ch2 = Math.cos(car.heading);
  const sh2 = Math.sin(car.heading);
  car.x += (car.u * ch2 - car.v * sh2) * dt;
  car.z += (car.u * sh2 + car.v * ch2) * dt;

  /* ---- position courante + collision avec les glissières ---- */
  const loc2 = trackLocate(car.x, car.z, car.idx);
  car.idx = loc2.index;
  car.progress = loc2.progress;
  car.lateral = loc2.lateral;
  car.surface = loc2.onTrack ? 0 : 1;
  car.onTrack = loc2.onTrack;

  const limit = loc2.half + trackRunoff();
  if (loc2.dist > limit) {
    // Axe « droite » de la route (latéral positif = côté gauche).
    const tl = Math.hypot(loc2.tx, loc2.tz) || 1;
    const rx = loc2.tz / tl;
    const rz = -loc2.tx / tl;
    const sgn = sign(loc2.lateral) || 1;
    const ox = -sgn * rx;
    const oz = -sgn * rz;
    const pen = loc2.dist - limit;

    car.x -= ox * pen;
    car.z -= oz * pen;

    let wx = car.u * ch2 - car.v * sh2;
    let wz = car.u * sh2 + car.v * ch2;
    const vn = wx * ox + wz * oz;
    if (vn > 0.05) {
      const restitution = 0.22;
      wx -= ox * vn * (1 + restitution);
      wz -= oz * vn * (1 + restitution);
      wx *= 0.86;
      wz *= 0.86;
      car.u = wx * ch2 + wz * sh2;
      car.v = -wx * sh2 + wz * ch2;
      car.r *= 0.88;
      car.wallImpact = Math.max(car.wallImpact, Math.min(1, vn / 12));
    }
  }

  /* ---- attitude ----
     La normale de la route est conservée : c'est elle qui détermine
     l'assiette réelle de la voiture (pente et dévers). Le tangage et le
     roulis stockés ici ne sont que les composantes *dynamiques* (squat,
     plongeon, inclinaison dans le virage) ; le rendu les ajoute à
     l'orientation donnée par la normale. */
  car.nx = loc2.nx;
  car.ny = loc2.ny;
  car.nz = loc2.nz;

  const targetPitch = Math.asin(clamp(car.ax / 26, -0.2, 0.2));
  const targetRoll = Math.asin(clamp(-car.ay / 26, -0.22, 0.22));
  const k = 1 - Math.exp(-9 * dt);
  car.pitch += (targetPitch - car.pitch) * k;
  car.roll += (targetRoll - car.roll) * k;

  return loc2;
}

/* --------------------------------------------------------------------------
   Collisions entre véhicules (impulsions + friction, 3 cercles par voiture)
   -------------------------------------------------------------------------- */

function carPoint(car, lx) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  return { x: car.x + lx * c, z: car.z + lx * s, c, s };
}

function pointVelocity(car, c, s, lx, ly) {
  return {
    x: car.u * c - car.v * s - car.r * ly,
    z: car.u * s + car.v * c + car.r * lx,
  };
}

export function resolveCarCollisions(cars) {
  if (cars.length < 2) return;
  const R = PHYS.collisionRadius;
  const invM = 1 / PHYS.mass;
  const invI = 1 / PHYS.inertia;
  const e = 0.18;

  for (let iter = 0; iter < 2; iter++) {
    for (let ia = 0; ia < cars.length; ia++) {
      for (let ib = ia + 1; ib < cars.length; ib++) {
        const a = cars[ia];
        const b = cars[ib];

        for (const oa of PHYS.collisionOffsets) {
          for (const ob of PHYS.collisionOffsets) {
            const pa = carPoint(a, oa);
            const pb = carPoint(b, ob);
            let dx = pb.x - pa.x;
            let dz = pb.z - pa.z;
            let dist = Math.hypot(dx, dz);
            if (dist < 1e-6) { dx = 1; dz = 0; dist = 1e-6; }
            const pen = R * 2 - dist;
            if (pen <= 0) continue;

            const nx = dx / dist;
            const nz = dz / dist;

            const corr = pen * 0.36;
            a.x -= nx * corr;
            a.z -= nz * corr;
            b.x += nx * corr;
            b.z += nz * corr;

            const rax = oa * pa.c;
            const raz = oa * pa.s;
            const rbx = ob * pb.c;
            const rbz = ob * pb.s;

            const va = pointVelocity(a, pa.c, pa.s, rax, raz);
            const vb = pointVelocity(b, pb.c, pb.s, rbx, rbz);
            const rvx = vb.x - va.x;
            const rvz = vb.z - va.z;
            const vn = rvx * nx + rvz * nz;
            if (vn >= 0) continue;

            const raCrossN = rax * nz - raz * nx;
            const rbCrossN = rbx * nz - rbz * nx;
            const denom =
              2 * invM + raCrossN * raCrossN * invI + rbCrossN * rbCrossN * invI;
            if (denom <= 1e-9) continue;

            const j = (-(1 + e) * vn) / denom;

            a.u += (-j * nx * pa.c - j * nz * pa.s) * invM;
            a.v += (j * nx * pa.s - j * nz * pa.c) * invM;
            a.r += (-j * raCrossN) * invI;

            b.u += (j * nx * pb.c + j * nz * pb.s) * invM;
            b.v += (-j * nx * pb.s + j * nz * pb.c) * invM;
            b.r += j * rbCrossN * invI;

            // Friction tangentielle
            const tx = -nz;
            const tz = nx;
            const vt = rvx * tx + rvz * tz;
            let jt = -vt / denom;
            const maxJt = 0.32 * j;
            jt = clamp(jt, -maxJt, maxJt);

            a.u += (-jt * tx * pa.c - jt * tz * pa.s) * invM;
            a.v += (jt * tx * pa.s - jt * tz * pa.c) * invM;
            a.r += (-jt * (rax * tz - raz * tx)) * invI;

            b.u += (jt * tx * pb.c + jt * tz * pb.s) * invM;
            b.v += (-jt * tx * pb.s + jt * tz * pb.c) * invM;
            b.r += jt * (rbx * tz - rbz * tx) * invI;

            const strength = Math.min(1, j / (PHYS.mass * 3));
            a.collisionImpact = Math.max(a.collisionImpact, strength);
            b.collisionImpact = Math.max(b.collisionImpact, strength);
          }
        }
      }
    }
    for (const car of cars) applyEsc(car);
  }
}

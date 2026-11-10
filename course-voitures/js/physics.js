'use strict';

/* ============================================================================
   PETITES VOITURES — physique des voitures
   Modèle bicyclette : glissement par essieu, pneus à formule magique,
   transfert de charge longitudinal, cercle de friction, frein à main,
   collisions voiture-voiture à impulsions.
   ========================================================================== */

function createCarState(index) {
  return {
    index,
    x: 0,
    y: 0,
    heading: 0,
    u: 0, // vitesse longitudinale (repère voiture)
    v: 0, // vitesse latérale
    r: 0, // vitesse de lacet
    steer: 0,
    steerCmd: 0,
    ax: 0,
    ay: 0,
    slipF: 0,
    slipR: 0,
    fzF: 0,
    fzR: 0,
    idx: -1,
    progress: 0,
    prevProgress: 0,
    lateral: 0, // écart latéral par rapport à la ligne médiane
    surface: 0, // 0 = asphalte, 1 = hors piste
    onTrack: true,
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

    emitAcc: 0,
    mark: null,
    aiState: { stuck: 0, reverse: 0, seed: index * 2.17, lastSteer: 0 },
  };
}

function resetCar(car, s, lateral) {
  const p = track.pointAtS(s);
  car.x = p.x + p.nx * lateral;
  car.y = p.y + p.ny * lateral;
  car.heading = Math.atan2(p.ty, p.tx);
  car.u = 0;
  car.v = 0;
  car.r = 0;
  car.steer = 0;
  car.steerCmd = 0;
  car.ax = 0;
  car.ay = 0;
  car.slipF = 0;
  car.slipR = 0;
  car.fzF = 0;
  car.fzR = 0;
  car.idx = -1;
  car.surface = 0;
  car.onTrack = true;
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

  car.emitAcc = 0;
  car.mark = null;
  car.aiState.stuck = 0;
  car.aiState.reverse = 0;
  car.aiState.lastSteer = 0;

  const loc = track.locate(car.x, car.y, -1);
  car.idx = loc.index;
  car.progress = loc.progress;
  car.prevProgress = loc.progress;
  car.lateral = loc.lateral;
  car.surface = loc.onTrack ? 0 : 1;
  car.onTrack = loc.onTrack;
}

/* --------------------------------------------------------------------------
   Correcteur électronique de stabilité (ESC)
   En virage stabilisé, l'accélération latérale vaut v * r et ne peut pas
   dépasser l'adhérence (mu * g). Le lacet est donc ramené à
   r_max = mu * g / v : la voiture peut glisser dans les virages, mais ne
   part plus en tête-à-queue. Le frein à main réduit l'adhérence arrière :
   on autorise alors davantage de rotation pour garder le drift possible.
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

function tireForce(alpha, mu, fz) {
  // Formule magique simplifiée : pic ~11°, dégressivité douce au-delà.
  return -mu * fz * Math.sin(PHYS.tireC * Math.atan(PHYS.tireB * alpha));
}

/* Avancement d'une voiture d'un pas de temps fixe. */
function stepCar(car, dt) {
  const inp = car.input;

  const startLoc = track.locate(car.x, car.y, car.idx);
  car.idx = startLoc.index;
  const off = startLoc.dist > track.halfWidth;
  const mu = off ? PHYS.muOff : PHYS.muRoad;
  car.surface = off ? 1 : 0;
  car.onTrack = !off;

  const m = PHYS.mass;

  /* ---- direction : limitation en vitesse + lissage de la commande ---- */
  const absU = Math.abs(car.u);
  const steerRate =
    lerp(PHYS.steerRateLow, PHYS.steerRateHigh, clamp(absU / 28, 0, 1)) *
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
  const staticF = (m * PHYS.gravity * PHYS.cgRear) / PHYS.wheelbase;
  const staticR = (m * PHYS.gravity * PHYS.cgFront) / PHYS.wheelbase;
  const shift = (m * car.ax * PHYS.cgHeight) / PHYS.wheelbase;
  const fzF = clamp(staticF - shift, staticF * 0.22, staticF * 2.4);
  const fzR = clamp(staticR + shift, staticR * 0.22, staticR * 2.4);
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

  const dir = Math.sign(car.u) || 1;
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
    fxRear = -dir * mu * fzR * 0.9; // roues arrière bloquées
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

  /* ---- correcteur électronique de stabilité (ESC) ----
     La limite de lacet est appliquée après l'intégration (voir
     applyEsc) : le frein à main réduit l'adhérence arrière, on autorise
     alors davantage de rotation pour garder le drift possible. */

  const rolling = off ? PHYS.offRolling : PHYS.rolling;
  const dragC = off ? PHYS.offDrag : PHYS.drag;

  fxBody -= Math.sign(car.u) * rolling * clamp(Math.abs(car.u) / 1.5, 0, 1);
  fxBody -= car.u * Math.abs(car.u) * dragC;
  fyBody -= car.v * Math.abs(car.v) * 0.35;

  car.ax = fxBody / m;
  car.ay = fyBody / m;

  /* ---- intégration semi-implicite ---- */
  car.u += (fxBody / m + car.r * car.v) * dt;
  car.v += (fyBody / m - car.r * car.u) * dt;
  car.r += (mz / PHYS.inertia) * dt;

  // Le correcteur bride le lacet à la limite d'adhérence.
  applyEsc(car);

  // Amortissement à très basse vitesse (évite les micro-oscillations)
  if (Math.abs(car.u) < 0.5 && Math.abs(car.v) < 0.5 && !inp.throttle && !inp.brake) {
    car.u *= 0.9;
    car.v *= 0.82;
    car.r *= 0.82;
  }
  if (Math.abs(car.u) + Math.abs(car.v) < 1.2) car.r *= 0.985;

  car.heading += car.r * dt;
  const ch = Math.cos(car.heading);
  const sh = Math.sin(car.heading);

  car.x += (car.u * ch - car.v * sh) * dt;
  car.y += (car.u * sh + car.v * ch) * dt;

  /* ---- position courante + collision avec les limites ---- */
  const loc = track.locate(car.x, car.y, car.idx);
  car.idx = loc.index;
  car.progress = loc.progress;
  car.lateral = loc.lateral;
  car.surface = loc.onTrack ? 0 : 1;
  car.onTrack = loc.onTrack;

  if (loc.dist > track.limit) {
    const sgn = Math.sign(loc.lateral) || 1;
    const ox = loc.nx * sgn;
    const oy = loc.ny * sgn;
    const pen = loc.dist - track.limit;

    car.x -= ox * pen;
    car.y -= oy * pen;

    let wx = car.u * ch - car.v * sh;
    let wy = car.u * sh + car.v * ch;
    const vn = wx * ox + wy * oy;

    if (vn > 0.05) {
      const restitution = 0.22;
      wx -= ox * vn * (1 + restitution);
      wy -= oy * vn * (1 + restitution);
      wx *= 0.86;
      wy *= 0.86;
      car.u = wx * ch + wy * sh;
      car.v = -wx * sh + wy * ch;
      car.r *= 0.88;
      car.wallImpact = Math.max(car.wallImpact, Math.min(1, vn / 12));
    }
  }

  return loc;
}

/* --------------------------------------------------------------------------
   Collisions voiture-voiture (3 cercles par voiture, impulsions + friction)
   -------------------------------------------------------------------------- */

function carPoint(car, lx, ly) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  return {
    x: car.x + lx * c - ly * s,
    y: car.y + lx * s + ly * c,
    c,
    s,
  };
}

function pointVelocity(car, c, s, lx, ly) {
  return {
    x: car.u * c - car.v * s - car.r * ly,
    y: car.u * s + car.v * c + car.r * lx,
  };
}

function resolveCarCollisions(cars) {
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
            const pa = carPoint(a, oa, 0);
            const pb = carPoint(b, ob, 0);
            let dx = pb.x - pa.x;
            let dy = pb.y - pa.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 1e-6) {
              dx = 1;
              dy = 0;
              dist = 1e-6;
            }
            const pen = R * 2 - dist;
            if (pen <= 0) continue;

            const nx = dx / dist;
            const ny = dy / dist;

            // séparation douce
            const corr = pen * 0.36;
            a.x -= nx * corr;
            a.y -= ny * corr;
            b.x += nx * corr;
            b.y += ny * corr;

            // points de contact relatifs au centre de gravité
            const rax = oa * pa.c;
            const ray = oa * pa.s;
            const rbx = ob * pb.c;
            const rby = ob * pb.s;

            const va = pointVelocity(a, pa.c, pa.s, rax, ray);
            const vb = pointVelocity(b, pb.c, pb.s, rbx, rby);
            const rvx = vb.x - va.x;
            const rvy = vb.y - va.y;
            const vn = rvx * nx + rvy * ny;
            if (vn >= 0) continue;

            const raCrossN = rax * ny - ray * nx;
            const rbCrossN = rbx * ny - rby * nx;
            const denom =
              2 * invM + raCrossN * raCrossN * invI + rbCrossN * rbCrossN * invI;
            if (denom <= 1e-9) continue;

            const j = (-(1 + e) * vn) / denom;

            // impulsion sur a (-j n) et b (+j n)
            a.u += (-j * nx * pa.c - j * ny * pa.s) * invM;
            a.v += (j * nx * pa.s - j * ny * pa.c) * invM;
            a.r += (-j * raCrossN) * invI;

            b.u += (j * nx * pb.c + j * ny * pb.s) * invM;
            b.v += (-j * nx * pb.s + j * ny * pb.c) * invM;
            b.r += j * rbCrossN * invI;

            // friction tangentielle
            const tx = -ny;
            const ty = nx;
            const vt = rvx * tx + rvy * ty;
            let jt = (-vt) / denom;
            const maxJt = 0.32 * j;
            jt = clamp(jt, -maxJt, maxJt);

            a.u += (-jt * tx * pa.c - jt * ty * pa.s) * invM;
            a.v += (jt * tx * pa.s - jt * ty * pa.c) * invM;
            a.r += (-jt * (rax * ty - ray * tx)) * invI;

            b.u += (jt * tx * pb.c + jt * ty * pb.s) * invM;
            b.v += (-jt * tx * pb.s + jt * ty * pb.c) * invM;
            b.r += jt * (rbx * ty - rby * tx) * invI;

            const strength = Math.min(1, j / (PHYS.mass * 3));
            a.collisionImpact = Math.max(a.collisionImpact, strength);
            b.collisionImpact = Math.max(b.collisionImpact, strength);
          }
        }
      }
    }

    // Un contact peut imprimer du lacet : on reborne aussi ici.
    for (const car of cars) applyEsc(car);
  }
}

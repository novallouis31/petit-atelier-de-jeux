'use strict';

/* ============================================================================
   PETITES VOITURES — pilotes automatiques
   Suivi de trajectoire (pure pursuit) corrigé par l'écart latéral,
   vitesse limitée par la courbure de la ligne de course,
   évitement des voitures devant et marche arrière de dégagement.
   ========================================================================== */

const AI_LEVELS = {
  calme: {
    label: 'Calme',
    latA: 9.2,
    vmax: 16,
    gain: 1.75,
    damp: 0.36,
    line: 0.32,
    lookK: 0.52,
    wobble: 0.05,
    cross: 0.05,
    safety: 0.9,
    brake: 8,
  },
  confirme: {
    label: 'Confirmé',
    latA: 10.2,
    vmax: 18,
    gain: 1.9,
    damp: 0.35,
    line: 0.45,
    lookK: 0.46,
    wobble: 0.032,
    cross: 0.05,
    safety: 0.9,
    brake: 10,
  },
  expert: {
    label: 'Expert',
    latA: 10.6,
    vmax: 18.6,
    gain: 1.95,
    damp: 0.34,
    line: 0.45,
    lookK: 0.44,
    wobble: 0.025,
    cross: 0.05,
    safety: 0.88,
    brake: 11,
  },
};

function aiLevel(car) {
  return AI_LEVELS[car.aiLevel] || AI_LEVELS.confirme;
}

/* Décalage latéral de la ligne de course (vers l'intérieur du virage).
   Le décalage est limité en proportion au rayon du virage : dans une
   épingle, se décaler de 3 m rendrait la trajectoire deux fois plus
   serrée que la route, et la voiture partirait en tête-à-queue. */
function aiLineOffset(p, level) {
  if (p.curv < 1e-4) return 0;
  const radius = 1 / p.curv;
  const want = clamp(p.curvS * 230, -1, 1) * track.halfWidth * level.line;
  const max = Math.min(track.halfWidth * level.line, radius * 0.28);
  return clamp(want, -max, max);
}

/* Courbure effective de la ligne de course (elle est plus serrée que
   celle de la ligne médiane quand on se décale vers l'intérieur). */
function aiLineCurvature(p, off) {
  const denom = 1 - off * p.curvS;
  return Math.abs(p.curvS) / Math.max(0.35, denom);
}

/* Vitesse cible : limitée par l'adhérence disponible et par la courbure
   de la ligne de course sur les ~60 m à venir.

   On fait une planification « à reculons » : pour chaque point situé à
   d mètres, on calcule la vitesse maximale permise par la courbure, puis
   la vitesse d'entrée nécessaire pour pouvoir freiner à temps jusqu'à
   ce point. C'est ce qui évite d'arriver trop vite dans un virage qui
   se referme. */
function aiTargetSpeed(car, level, spacing) {
  const P = track.pts;
  const N = track.N;
  const base = car.idx >= 0 ? car.idx : 0;
  const brake = level.brake;

  // Vitesse maximale permise par la courbure, en fonction de la distance.
  const limitAt = (d) => {
    const p = P[(base + Math.round(d / spacing)) % N];
    const off = aiLineOffset(p, level);
    const c = aiLineCurvature(p, off);
    if (c <= 1e-4) return level.vmax;
    return Math.sqrt((level.latA * level.safety) / c);
  };

  let vt = level.vmax;
  for (let d = 2; d <= 60; d += 3) {
    const vCorner = limitAt(d);
    // Vitesse maximale ici pour pouvoir arriver à vCorner en freinant.
    const allowed = Math.sqrt(vCorner * vCorner + 2 * brake * d);
    vt = Math.min(vt, allowed);
  }

  if (car.surface === 1) vt = Math.min(vt, 9);
  return Math.max(8, vt);
}

/* Anticipation : quand la courbure change vite (virage qui se referme,
   changement de direction), la voiture doit regarder plus loin et
   ralentir davantage. */
function aiCurvatureGradient(car, spacing) {
  const P = track.pts;
  const N = track.N;
  const base = car.idx >= 0 ? car.idx : 0;
  let maxGrad = 0;
  for (let d = 6; d <= 46; d += 4) {
    const a = P[(base + Math.round(d / spacing)) % N].curv;
    const b = P[(base + Math.round((d + 12) / spacing)) % N].curv;
    const grad = Math.abs(b - a) / 12;
    if (grad > maxGrad) maxGrad = grad;
  }
  return maxGrad;
}

function aiAvoidance(car, steer) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  let avoid = 0;
  let brake = 0;

  for (const other of race.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * c + dy * s;
    if (ahead < 0.5 || ahead > 9.5) continue;

    const side = c * dy - s * dx; // positif = à gauche
    const gap = Math.abs(side);
    if (gap > 2.7) continue;

    const urgency = 1 - ahead / 9.5;
    avoid -= Math.sign(side || 1) * 0.55 * urgency;
    if (ahead < 4.6 && gap < 2.1) brake = 1;
  }

  if (avoid) {
    steer = clamp(steer + avoid, -1, 1);
  }
  return { steer, brake };
}

function aiControls(car, dt) {
  const level = aiLevel(car);
  const st = car.aiState;
  const absU = Math.abs(car.u);
  const spacing = track.spacing;
  const base = car.idx >= 0 ? car.idx : 0;

  /* ---- dégagement : marche arrière si bloqué contre un mur ---- */
  if (st.reverse > 0) {
    st.reverse -= dt;
    return {
      throttle: 0,
      brake: 1,
      steer: clamp(-st.lastSteer * 0.85, -1, 1),
      hand: false,
    };
  }

  if (absU < 0.4) st.stuck += dt;
  else st.stuck = Math.max(0, st.stuck - dt * 2.5);

  if (st.stuck > 1.5) {
    st.reverse = car.surface === 1 ? 1.5 : 1.1;
    st.stuck = 0;
    st.lastSteer = 0;
    return { throttle: 0, brake: 1, steer: 0, hand: false };
  }

  /* ---- géométrie de la ligne de course ---- */
  const near = track.pts[(base + Math.round(6 / spacing)) % track.N];
  const lineNear = aiLineOffset(near, level);
  // écart de la voiture par rapport à la ligne de course (positif = à gauche)
  const latErr = car.lateral - lineNear;
  const offTrack = car.surface === 1 || Math.abs(latErr) > track.halfWidth * 0.85;

  /* ---- vitesse cible ---- */
  let vt = aiTargetSpeed(car, level, spacing);

  // Virage qui se referme : on ralentit et on regarde plus loin.
  const grad = aiCurvatureGradient(car, spacing);
  const tight = clamp((grad - 0.0012) / 0.004, 0, 1);
  vt = Math.min(vt, vt - tight * 4.5);
  const lookBoost = 1 + tight * 1.4;

  if (offTrack) vt = Math.min(vt, 10);
  // On ralentit quand on s'écarte de la trajectoire.
  vt = Math.min(vt, vt - Math.abs(latErr) * 0.45);

  /* ---- point de visée ---- */
  const look = (7 + absU * level.lookK) * lookBoost;
  const ti = (base + Math.round(look / spacing)) % track.N;
  const tp = track.pts[ti];
  const off = offTrack ? 0 : aiLineOffset(tp, level);
  const tx = tp.x + tp.nx * off;
  const ty = tp.y + tp.ny * off;

  let err = Math.atan2(ty - car.y, tx - car.x) - car.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;

  /* ---- correction d'écart latéral ----
     On corrige l'orientation pour ramener la voiture vers la ligne de
     course. La correction est proportionnelle à l'écart divided par la
     vitesse (comme un contrôleur Stanley) : elle reste donc efficace
     à basse vitesse sans saturer la direction à grande vitesse. */
  const corr = clamp(
    (latErr * level.cross) / Math.max(5, absU),
    -0.22,
    0.22
  );
  err -= corr;

  // léger flottement : évite deux IA perfectly synchronisées.
  err += Math.sin((race.time + st.seed) * 0.8) * level.wobble;

  let steer = clamp(err * level.gain - car.r * level.damp, -1, 1);

  /* ---- contre-braquage ----
     Quand l'arrière décroche vraiment (glissement important), on braque
     à contre-sens pour prendre le virtuose au lieu de partir en
     tête-à-queue. */
  const slipR = car.slipR;
  const excess = Math.abs(slipR) - 0.3;
  if (excess > 0 && absU > 6) {
    steer = clamp(steer - Math.sign(slipR) * excess * 2.2, -1, 1);
  }

  st.lastSteer = steer;

  const avoid = aiAvoidance(car, steer);
  steer = avoid.steer;

  /* ---- pédales ---- */
  let throttle = 0;
  let brake = avoid.brake;

  if (car.u < vt - 0.7) throttle = 1;
  else if (car.u > vt + 1.2) brake = 1;

  // On relâche les gaz si l'arrière commence à partir.
  if (!brake && car.u > 8 && Math.abs(car.slipR) > 0.32) throttle = 0;

  // Freinage plus franc quand on arrive trop vite.
  if (!brake && car.u > vt + 3.5) brake = 1;

  return { throttle, brake, steer, hand: false };
}

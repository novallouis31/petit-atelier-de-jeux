/**
 * Pilotes automatiques.
 *
 * Trois couches, du plus général au plus réactif :
 *
 *  1. **Trajectoire** — suivi de la ligne de course par « pure pursuit » :
 *     on vise un point situé sur la ligne de course, à une distance
 *     proportionnelle à la vitesse. La distance de visée augmente avec la
 *     vitesse, comme le ferait un pilote humain : on anticipe davantage
 *     quand on va vite.
 *
 *  2. **Vitesse** — planification « à reculons ». Pour chaque point situé à
 *     `d` mètres devant, on calcule la vitesse maximale permise par la
 *     courbure de la ligne de course, puis la vitesse d'entrée nécessaire
 *     pour pouvoir freiner à temps jusqu'à ce point. La pente est prise en
 *     compte : en descente, il faut freiner plus tôt ; en montée, on peut
 *     garder la vitesse plus longtemps.
 *
 *  3. **Tactique** — évitement des voitures devant, choix du côté pour
 *     dépasser, dégagement en marche arrière si la voiture est bloquée.
 *
 * Module pur : aucun accès au DOM.
 */

import { clamp, lerp, sign } from './mathx.js';

export const AI_LEVELS = {
  calme: {
    label: 'Calme',
    latAccel: 8.6,      // accélération latérale visée (m/s²)
    vmax: 17,           // vitesse maximale (m/s)
    gain: 1.85,         // gain de direction
    damp: 0.34,         // amortissement du lacet
    line: 0.30,         // décalage vers la ligne de course
    cross: 0.05,        // gain de correction latérale
    lookK: 0.50,        // anticipation (proportionnelle à la vitesse)
    wobble: 0.05,       // légère irrégularité, évite deux IA synchronisées
    safety: 0.86,       // marge de sécurité dans les virages
    brake: 7.5,         // décélération supposée (m/s²)
    overtake: 0.5,      // audace au dépassement
  },
  confirme: {
    label: 'Confirmé',
    latAccel: 9.6,
    vmax: 20,
    gain: 1.95,
    damp: 0.33,
    line: 0.42,
    cross: 0.05,
    lookK: 0.45,
    wobble: 0.03,
    safety: 0.88,
    brake: 9.0,
    overtake: 0.75,
  },
  expert: {
    label: 'Expert',
    latAccel: 10.4,
    vmax: 22,
    gain: 2.05,
    damp: 0.32,
    line: 0.50,
    cross: 0.06,
    lookK: 0.42,
    wobble: 0.022,
    safety: 0.92,
    brake: 10.0,
    overtake: 1.0,
  },
};

export function aiLevelFor(name) {
  return AI_LEVELS[name] || AI_LEVELS.confirme;
}

/* --------------------------------------------------------------------------
   Ligne de course
   -------------------------------------------------------------------------- */

/**
 * Décalage latéral de la ligne de course par rapport à l'axe de la piste.
 *
 * On se resserre à l'intérieur du virage. Le décalage est limité en
 * proportion au rayon : dans une épingle, se décaler de 3 m rendrait la
 * trajectoire deux fois plus serrée que la route, et la voiture partirait
 * en tête-à-queue.
 */
export function aiLineOffset(p, level, halfWidth) {
  if (p.curv < 1e-4) return 0;
  const radius = 1 / p.curv;
  // `curvS > 0` = virage à droite : l'intérieur est donc à droite.
  const want = clamp(p.curvS * 230, -1, 1) * halfWidth * level.line;
  const max = Math.min(halfWidth * level.line, radius * 0.28);
  return clamp(want, -max, max);
}

/**
 * Courbure effective de la ligne de course : elle est plus serrée que celle
 * de l'axe médian quand on se décale vers l'intérieur du virage.
 */
export function aiLineCurvature(p, off) {
  const denom = 1 - off * p.curvS;
  return Math.abs(p.curvS) / Math.max(0.35, denom);
}

/* --------------------------------------------------------------------------
   Planification de la vitesse
   -------------------------------------------------------------------------- */

/**
 * Vitesse cible : limitée par l'adhérence disponible, par la courbure de la
 * ligne de course sur les ~70 m à venir, et par la pente.
 *
 * On procède à reculons : pour chaque point situé à `d` mètres, on calcule
 * la vitesse maximale permise par la courbure, puis la vitesse d'entrée
 * nécessaire pour freiner à temps jusqu'à ce point. C'est ce qui évite
 * d'arriver trop vite dans un virage qui se referme.
 */
export function aiTargetSpeed(car, level, track, spacing) {
  const P = track.pts;
  const N = track.N;
  const base = car.idx >= 0 ? car.idx : 0;
  const brake = level.brake;

  // Vitesse maximale permise par la courbure, à `d` mètres devant.
  const limitAt = (d) => {
    const p = P[(base + Math.round(d / spacing)) % N];
    const off = aiLineOffset(p, level, track.halfWidth);
    const c = aiLineCurvature(p, off);
    if (c <= 1e-4) return level.vmax;
    return Math.sqrt((level.latAccel * level.safety) / c);
  };

  // Pente moyenne sur la distance de freinage : en descente (grade négatif),
  // la gravité aide à ralentir, donc on peut arriver plus vite ; en montée,
  // c'est l'inverse.
  const slopeAt = (d) => {
    const p = P[(base + Math.round(d / spacing)) % N];
    return p.ty;
  };

  let vt = level.vmax;
  for (let d = 2; d <= 70; d += 3) {
    const vCorner = limitAt(d);
    // Décélération effective : la gravité aide ou gêne selon la pente.
    const slope = slopeAt(d);
    const decel = Math.max(1.5, brake - PHYS_G * slope);
    // Vitesse maximale ici pour pouvoir arriver à vCorner en freinant.
    const allowed = Math.sqrt(Math.max(0, vCorner * vCorner + 2 * decel * d));
    vt = Math.min(vt, allowed);
  }

  if (car.surface === 1) vt = Math.min(vt, 9);
  return Math.max(7, vt);
}

const PHYS_G = 9.81;

/**
 * Anticipation : quand la courbure change vite (virage qui se referme), la
 * voiture doit regarder plus loin et ralentir davantage.
 */
export function aiCurvatureGradient(car, track, spacing) {
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

/* --------------------------------------------------------------------------
   Tactique : éviter et dépasser
   -------------------------------------------------------------------------- */

/**
 * Cherche une voiture devant et décide d'une correction de direction et
 * d'un éventuel freinage.
 *
 * Le côté choisi pour dépasser est celui qui offre le plus de place ; on
 * reste du côté où l'on est déjà si les deux se valent, pour éviter les
 * changements d'avis.
 */
function aiAvoidance(car, steer, ctx) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  let avoid = 0;
  let brake = 0;
  let target = null;

  for (const other of ctx.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * c + dz * s;
    if (ahead < 0.5 || ahead > 11) continue;

    // Écart latéral, positif = à gauche de la voiture (conventions du projet :
    // l'axe droite de la voiture est (-sin h, cos h)).
    const side = c * dz - s * dx;
    const gap = Math.abs(side);
    if (gap > 3.0) continue;

    const urgency = 1 - ahead / 11;
    const cible = { other, ahead, gap, side };

    if (!target || ahead < target.ahead) target = cible;

    // Si la voiture devant est franchement à un côté, on s'écarte de
    // l'autre. L'intensité dépend de l'urgence et de l'audace du pilote.
    if (gap < 2.6) {
      const ecarte = sign(side || 1) * 0.5 * urgency * level_aggression(ctx);
      avoid -= ecarte;
    }
    // Si on est dans son sillage et qu'on ne peut pas passer, on freine.
    if (ahead < 5.2 && gap < 2.0) brake = 1;
  }

  if (avoid) steer = clamp(steer + avoid, -1, 1);
  return { steer, brake, target };
}

/** Audace du pilote courant (0.5 = timide, 1 = intrépide). */
function level_aggression(ctx) {
  return ctx.level ? ctx.level.overtake : 0.75;
}

/* --------------------------------------------------------------------------
   Commande complète d'une voiture pilotée par l'IA
   -------------------------------------------------------------------------- */

/**
 * Calcule les commandes d'une voiture IA.
 *
 * @param {object} car    état du véhicule
 * @param {object} ctx    { track, cars, time, level }
 * @param {number} dt     pas de temps
 */
export function aiControls(car, ctx, dt) {
  const track = ctx.track;
  const level = ctx.level || AI_LEVELS.confirme;
  const st = car.aiState;
  const absU = Math.abs(car.u);
  const spacing = track.spacing;
  const base = car.idx >= 0 ? car.idx : 0;

  /* ---- dégagement : marche arrière si bloqué contre une glissière ---- */
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

  if (st.stuck > 1.4) {
    st.reverse = car.surface === 1 ? 1.6 : 1.1;
    st.stuck = 0;
    st.lastSteer = 0;
    return { throttle: 0, brake: 1, steer: 0, hand: false };
  }

  /* ---- géométrie de la ligne de course ---- */
  const near = track.pts[(base + Math.round(6 / spacing)) % track.N];
  const lineNear = aiLineOffset(near, level, track.halfWidth);
  // Écart de la voiture par rapport à la ligne de course (positif = à droite).
  const latErr = car.lateral - lineNear;
  const offTrack = car.surface === 1 || Math.abs(latErr) > track.halfWidth * 0.85;

  /* ---- vitesse cible ---- */
  let vt = aiTargetSpeed(car, level, track, spacing);

  // Virage qui se referme : on ralentit et on regarde plus loin.
  const grad = aiCurvatureGradient(car, track, spacing);
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
  const off = offTrack ? 0 : aiLineOffset(tp, level, track.halfWidth);
  const tx = tp.x + tp.rx * off;
  const tz = tp.z + tp.rz * off;

  // Erreur de cap : angle entre la direction de la voiture et celle du
  // point visé. `wrapAngle` normalise dans ]-PI, PI].
  let err = Math.atan2(tz - car.z, tx - car.x) - car.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;

  /* ---- correction d'écart latéral ----
     On corrige l'orientation pour ramener la voiture vers la ligne de
     course. La correction est proportionnelle à l'écart divisé par la
     vitesse (comme un contrôleur Stanley) : elle reste efficace à basse
     vitesse sans saturer la direction à grande vitesse.

     Le gain `cross` est volontairement faible : le suivi de trajectoire
     (pure pursuit) fait déjà l'essentiel du travail, et une correction
     latérale trop forte ferait osciller la voiture d'un bord à l'autre. */
  const corr = clamp((latErr * level.cross) / Math.max(5, absU), -0.22, 0.22);
  err -= corr;

  // Léger flottement : évite deux IA parfaitement synchronisées.
  err += Math.sin((ctx.time + st.seed) * 0.8) * level.wobble;

  let steer = clamp(err * level.gain - car.r * level.damp, -1, 1);

  /* ---- contre-braquage ----
     Quand l'arrière décroche vraiment (glissement important), on braque
     dans le sens du glissement pour le rattraper au lieu de partir en
     tête-à-queue.

     `slipR > 0` signifie que l'essieu arrière glisse vers la DROITE de la
     voiture : il faut donc braquer à droite (commande positive). */
  const slipR = car.slipR;
  const excess = Math.abs(slipR) - 0.3;
  if (excess > 0 && absU > 6) {
    steer = clamp(steer + sign(slipR) * excess * 2.2, -1, 1);
  }

  st.lastSteer = steer;

  /* ---- éviter / dépasser ---- */
  const avoid = aiAvoidance(car, steer, ctx);
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

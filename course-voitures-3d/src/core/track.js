/**
 * Construction géométrique d'un circuit 3D.
 *
 * CONVENTIONS (identiques au moteur physique et à l'IA) :
 *  - repère monde : X, Y (haut), Z ;
 *  - cap `heading` : 0 = +X, sens trigonométrique dans le plan XZ ;
 *  - axe « droite » de la voiture : R = (-sin h, 0, cos h) ;
 *  - écart latéral `lateral` : positif = côté DROITE de la route, mesuré le
 *    long de l'axe droite de la piste ;
 *  - courbure `curvS` : positive = virage à droite ;
 *  - dévers `bank` : positif = côté droit plus bas (donc côté gauche plus
 *    haut, côté extérieur d'un virage à droite).
 *
 * Le tracé est une boucle fermée décrite en polaire harmonique, avec un
 * profil d'altitude et un dévers calculé d'après la courbure.
 *
 * Module **pur** : aucune dépendance au DOM ni à Three.js. La simulation
 * (physique + IA) et le rendu consomment la même géométrie.
 */

import { TAU, clamp, lerp, mod, wrapAngle } from './mathx.js';

const DENSE = 6000;

/** Point du plan (sans altitude) pour le paramètre t et la forme donnée. */
function planPointAtT(t, def) {
  const a = mod(t, 1) * TAU;
  let r = 1;
  for (const h of def.harmonics) r += h.a * Math.cos(h.n * a + h.p);
  return { x: def.rx * r * Math.cos(a), z: def.ry * r * Math.sin(a) };
}

/** Altitude du tracé pour le paramètre t. */
function heightAtT(t, def) {
  if (!def.elevation || !def.elevation.length) return 0;
  const a = mod(t, 1) * TAU;
  let y = 0;
  for (const h of def.elevation) y += h.a * Math.cos(h.n * a + h.p);
  return y;
}

/** Largeur de la route au paramètre t (constante par défaut). */
function widthAtT(t, def) {
  if (!def.widthHarmonics || !def.widthHarmonics.length) return def.width;
  const a = mod(t, 1) * TAU;
  let w = def.width;
  for (const h of def.widthHarmonics) w += h.a * Math.cos(h.n * a + h.p);
  return Math.max(6, w);
}

/**
 * Dévers automatique : proportionnel à la courbure, borné.
 *
 * `curvS > 0` = virage à droite. L'extérieur d'un virage à droite est le
 * côté gauche de la route : ce côté doit être surélevé, donc le côté droit
 * descend, ce qui correspond à `bank > 0`.
 */
function bankForCurvature(curvS, factor, maxBank) {
  const radius = Math.abs(curvS) > 1e-6 ? 1 / Math.abs(curvS) : 1e9;
  // Les virages très serrés ne sont pas inclineables au-delà du maximum.
  const tighten = clamp((60 - radius) / 40, 0, 1);
  const raw = Math.tanh(curvS * 190) * factor * (0.45 + 0.55 * tighten);
  return clamp(raw, -maxBank, maxBank);
}

/** Produit vectoriel. */
function cross(ax, ay, az, bx, by, bz) {
  return {
    x: ay * bz - az * by,
    y: az * bx - ax * bz,
    z: ax * by - ay * bx,
  };
}

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function buildTrack(def) {
  /* ---- 1. échantillonnage dense (plan + altitude) ---- */
  const dense = [];
  for (let i = 0; i < DENSE; i++) {
    const t = def.startT + i / DENSE;
    const p = planPointAtT(t, def);
    dense.push({ t, x: p.x, y: heightAtT(t, def), z: p.z });
  }

  /* ---- 2. longueur cumulée en 3D ---- */
  const cum = [0];
  for (let i = 1; i <= DENSE; i++) {
    const a = dense[i % DENSE];
    const b = dense[i - 1];
    cum.push(cum[i - 1] + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  const length = cum[DENSE];

  /* ---- 3. ré-échantillonnage à pas constant ---- */
  const N = Math.max(64, Math.round(length / def.spacing));
  const pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i * length) / N;
    while (j < DENSE - 1 && cum[j + 1] < target) j++;
    const seg = Math.max(1e-9, cum[j + 1] - cum[j]);
    const f = (target - cum[j]) / seg;
    const a = dense[j];
    const b = dense[(j + 1) % DENSE];
    const t = lerp(a.t, b.t, f);
    pts.push({
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      z: lerp(a.z, b.z, f),
      t,
      width: widthAtT(t, def),
      s: i / N,
    });
  }

  /* ---- 4. tangentes 3D ---- */
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    const t = norm({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    pts[i].tx = t.x;
    pts[i].ty = t.y;
    pts[i].tz = t.z;
  }

  /* ---- 5. courbure signée (positive = virage à droite) ---- */
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 3 + N) % N];
    const b = pts[i];
    const c = pts[(i + 3) % N];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    // Le signe du produit vectoriel dans le plan XZ donne le sens du virage :
    // positif = rotation vers la droite du sens de circulation.
    const turn = abx * bcz - abz * bcx;
    const la = Math.hypot(abx, abz) || 1;
    const lb = Math.hypot(bcx, bcz) || 1;
    const ang = Math.asin(clamp(turn / (la * lb), -1, 1));
    const ds = (6 * length) / N;
    pts[i].curvS = ang / ds;
    pts[i].curv = Math.abs(pts[i].curvS);
  }

  /* ---- 6. dévers ---- */
  const maxBank = (def.maxBank ?? 9) * (Math.PI / 180);
  const bankFactor = def.bank ?? 0.4;
  for (let i = 0; i < N; i++) {
    pts[i].bank = bankForCurvature(pts[i].curvS, bankFactor, maxBank);
  }
  // Lissage du dévers pour éviter les ruptures de pente.
  const smoothed = new Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    let w = 0;
    for (let k = -6; k <= 6; k++) {
      const weight = 1 - Math.abs(k) / 7;
      sum += pts[(i + k + N) % N].bank * weight;
      w += weight;
    }
    smoothed[i] = sum / w;
  }
  for (let i = 0; i < N; i++) pts[i].bank = smoothed[i];

  /* ---- 7. repère local : tangente, axe droite, normale (avec dévers) ---- */
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    // Axe « droite » horizontal de la route : perpendiculaire à la tangente.
    const right = norm({ x: -p.tz, y: 0, z: p.tx });
    // Dévers : rotation de cet axe autour de la tangente (règle de la main
    // droite). `bank > 0` abaisse le côté droit de la route, donc surélève
    // le côté gauche — l'extérieur d'un virage à droite.
    const c = Math.cos(p.bank);
    const s = Math.sin(p.bank);
    const tCrossRight = cross(p.tx, p.ty, p.tz, right.x, right.y, right.z);
    p.rx = right.x * c + tCrossRight.x * s;
    p.ry = right.y * c + tCrossRight.y * s;
    p.rz = right.z * c + tCrossRight.z * s;
    // Normale de la route (vers le ciel) : elle s'incline vers le côté bas.
    const n = norm(cross(p.rx, p.ry, p.rz, p.tx, p.ty, p.tz));
    p.nx = n.x;
    p.ny = n.y;
    p.nz = n.z;
    // Pente le long de la route.
    p.grade = p.ty;
    p.half = p.width * 0.5;
  }

  /* ---- 7b. courbure verticale : sert à décoller en crête ---- */
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 4 + N) % N];
    const b = pts[i];
    const c = pts[(i + 4) % N];
    const ds = (8 * length) / N;
    // d²y/ds² : positif en creux, négatif en crête.
    pts[i].curvV = (c.ty - a.ty) / ds;
  }

  /* ---- 8. métriques ---- */
  let maxCurv = 0;
  for (const p of pts) maxCurv = Math.max(maxCurv, p.curv);
  const minRadius = maxCurv > 1e-6 ? 1 / maxCurv : Infinity;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }

  const track = {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    blurbShort: def.blurbShort,
    theme: def.theme,
    pts,
    N,
    length,
    spacing: length / N,
    maxCurvature: maxCurv,
    minRadius,
    bounds: { minX, maxX, minZ, maxZ, minY, maxY },
    runoff: def.runoff,
  };

  /** Échantillon interpolé à l'abscisse curviligne s (0..1). */
  track.pointAtS = function (s) {
    const f = mod(s, 1) * N;
    const i0 = Math.floor(f);
    const t = f - i0;
    const i1 = (i0 + 1) % N;
    const a = pts[i0];
    const b = pts[i1];
    const tx = lerp(a.tx, b.tx, t);
    const ty = lerp(a.ty, b.ty, t);
    const tz = lerp(a.tz, b.tz, t);
    const l = Math.hypot(tx, ty, tz) || 1;
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      tx: tx / l,
      ty: ty / l,
      tz: tz / l,
      rx: lerp(a.rx, b.rx, t),
      ry: lerp(a.ry, b.ry, t),
      rz: lerp(a.rz, b.rz, t),
      nx: lerp(a.nx, b.nx, t),
      ny: lerp(a.ny, b.ny, t),
      nz: lerp(a.nz, b.nz, t),
      bank: lerp(a.bank, b.bank, t),
      half: lerp(a.half, b.half, t),
      width: lerp(a.width, b.width, t),
      curvS: lerp(a.curvS, b.curvS, t),
      s: mod(s, 1),
    };
  };

  /**
   * Localisation d'un point horizontal dans la piste.
   * Renvoie l'écart latéral (positif = côté droit), la progression, la
   * hauteur de la route et sa normale.
   */
  track.locate = function (x, z, hint) {
    let best = -1;
    let bestD = Infinity;

    if (hint >= 0 && hint < N) {
      for (let k = -46; k <= 46; k++) {
        const i = (hint + k + N) % N;
        const dx = x - pts[i].x;
        const dz = z - pts[i].z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      // Fenêtre trop petite : on repart d'une recherche globale.
      if (bestD > 4900) { best = -1; bestD = Infinity; }
    }

    if (best < 0) {
      for (let i = 0; i < N; i++) {
        const dx = x - pts[i].x;
        const dz = z - pts[i].z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }

    let proj = null;
    for (let k = -1; k <= 0; k++) {
      const i0 = (best + k + N) % N;
      const i1 = (i0 + 1) % N;
      const a = pts[i0];
      const b = pts[i1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const vy = b.y - a.y;
      const l2 = vx * vx + vz * vz + vy * vy || 1e-9;
      const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / l2, 0, 1);
      const px = a.x + vx * t;
      const py = a.y + vy * t;
      const pz = a.z + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!proj || d < proj.d) proj = { i0, i1, t, d, px, py, pz, vx, vy, vz };
    }

    const segLen = Math.hypot(proj.vx, proj.vy, proj.vz) || 1;
    // Axe « droite » horizontal du tronçon (pour mesurer l'écart latéral).
    const sideX = -proj.vz / segLen;
    const sideZ = proj.vx / segLen;
    const lateral = (x - proj.px) * sideX + (z - proj.pz) * sideZ;
    const half = lerp(pts[proj.i0].half, pts[proj.i1].half, proj.t);

    // Normale de la route au point projeté (interpolée).
    const nx = lerp(pts[proj.i0].nx, pts[proj.i1].nx, proj.t);
    const ny = lerp(pts[proj.i0].ny, pts[proj.i1].ny, proj.t);
    const nz = lerp(pts[proj.i0].nz, pts[proj.i1].nz, proj.t);
    const bank = lerp(pts[proj.i0].bank, pts[proj.i1].bank, proj.t);
    // Axe « droite » 3D de la route (dévers compris).
    const rx = lerp(pts[proj.i0].rx, pts[proj.i1].rx, proj.t);
    const ry = lerp(pts[proj.i0].ry, pts[proj.i1].ry, proj.t);
    const rz = lerp(pts[proj.i0].rz, pts[proj.i1].rz, proj.t);

    return {
      index: best,
      progress: (proj.i0 + proj.t) / N,
      lateral,
      dist: Math.abs(lateral),
      half,
      onTrack: Math.abs(lateral) <= half,
      // Le dévers abaisse le côté droit : l'altitude baisse quand on va à droite.
      height: proj.py - lateral * Math.tan(bank),
      nx, ny, nz,
      rx, ry, rz,
      bank,
      tx: lerp(pts[proj.i0].tx, pts[proj.i1].tx, proj.t),
      ty: lerp(pts[proj.i0].ty, pts[proj.i1].ty, proj.t),
      tz: lerp(pts[proj.i0].tz, pts[proj.i1].tz, proj.t),
      curvS: lerp(pts[proj.i0].curvS, pts[proj.i1].curvS, proj.t),
    };
  };

  /**
   * Ligne de course : points décalés latéralement pour tracer l'axe idéal.
   * Dans un virage à droite (courbure positive), on se resserre à droite.
   */
  track.racingLine = function (strength = 0.45) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const radius = p.curv > 1e-5 ? 1 / p.curv : 1e9;
      const want = clamp(p.curvS * 260, -1, 1) * p.half * strength;
      const max = Math.min(p.half * strength, radius * 0.3);
      const off = clamp(want, -max, max);
      out[i] = {
        x: p.x + p.rx * off,
        y: p.y + p.ry * off,
        z: p.z + p.rz * off,
        offset: off,
        s: p.s,
      };
    }
    return out;
  };

  return track;
}

/**
 * Circuit actif. `useTrack` permet de changer de tracé à chaud
 * (menu, banc d'essai, validation).
 */
export let track = null;
export let currentTrackId = null;

export function useTrack(id, defs) {
  const def = defs[id];
  if (!def) return false;
  track = buildTrack(def);
  currentTrackId = id;
  return true;
}

/** Écart de cap entre une voiture et la direction de la piste. */
export function headingError(car, loc) {
  const trackHeading = Math.atan2(loc.tz, loc.tx);
  return wrapAngle(car.heading - trackHeading);
}

'use strict';

/* ============================================================================
   PETITES VOITURES — monde, piste et réglages
   ========================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;
const moveTowards = (cur, target, maxDelta) =>
  Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta;

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = [
  { name: 'JOUEUR 1', color: '#ff5666', light: '#ff9aa4', dark: '#a71f32', badge: '1' },
  { name: 'JOUEUR 2', color: '#42a9ff', light: '#a6d8ff', dark: '#0f5f9e', badge: '2' },
  { name: 'IA 1', color: '#5de08a', light: '#b6f5c8', dark: '#1f7a45', badge: '3', ai: true },
  { name: 'IA 2', color: '#ffb14d', light: '#ffe0ad', dark: '#a35c0a', badge: '4', ai: true },
];

const MAX_CARS = 4;
const DEFAULT_SETTINGS = { cars: 2, aiLevel: 'confirme', track: 'genets' };

/* --------------------------------------------------------------------------
   Modèle physique (unités SI : mètres, kilogrammes, secondes)
   -------------------------------------------------------------------------- */

const PHYS = {
  mass: 900,
  // CG légèrement reculé : plus de charge sur l'essieu arrière, donc plus
  // de motricité et un comportement globalement sous-vireur (plus facile).
  cgFront: 1.3,
  cgRear: 1.25,
  wheelbase: 2.55,
  inertia: 540,
  cgHeight: 0.44,
  gravity: 9.81,

  muRoad: 1.82,
  muOff: 0.6,
  // Grip supplémentaire à l'arrière : stabilise la voiture au lever de pied
  // et évite les têtes-à-queue intempestifs.
  rearGrip: 1.08,

  engineForce: 9000,
  enginePower: 80000,
  reverseForce: 4200,
  maxReverseSpeed: 9,

  brakeForce: 12000,
  brakeFrontBias: 0.62,

  drag: 2.1,
  offDrag: 3.4,
  rolling: 180,
  offRolling: 1300,

  steerLock: 0.55,
  steerRateLow: 4.2,
  steerRateHigh: 1.7,
  // La direction est bridée bien avant la limite d'adhérence : il reste
  // toujours de la marge pour freiner ou accélérer en virage.
  lateralLimit: 12.2,
  handbrakeGrip: 0.34,
  handbrakeSteer: 0.32,

  tireB: 7.4,
  tireC: 1.42,

  // Amortissement du lacet : gomme les coups de volant au clavier.
  yawDamping: 240,
  // Contrôle de motricité : limite le couple arrière quand les roues
  // avant sont braquées.
  tractionControl: 0.74,
  // Correcteur de stabilité : 1 = le lacet est bridé à la limite
  // d'adhérence (plus de tête-à-queue), 0 = correction désactivée.
  esc: 1.0,
  // Autorité du correcteur, en newtons-mètres par radian/s d'excès.
  escGain: 9000,

  // collision
  bodyLength: 4.2,
  bodyWidth: 1.9,
  collisionRadius: 0.98,
  collisionOffsets: [-1.38, 0, 1.38],
};

/* --------------------------------------------------------------------------
   Tracé du circuit
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Catalogue de circuits
   Chaque circuit est décrit par une courbe paramétrique fermée
   (rayon polaire harmonique) : la boucle est donc toujours fermée
   mathématiquement, et l'on peut jouer sur le nombre de lobes pour
   obtenir des tracés très différents (spermes, épingles, esses...).
   -------------------------------------------------------------------------- */

const TRACKS = {
  genets: {
    id: 'genets',
    name: 'Boucle des Genêts',
    blurb: "Le tracé d'origine : rapide, harmonieux, deux longues courbes.",
    rx: 100,
    ry: 56,
    harmonics: [
      { n: 2, a: 0.13, p: 0.6 },
      { n: 3, a: 0.06, p: -0.8 },
      { n: 5, a: 0.025, p: 1.7 },
    ],
    startT: 0.84,
    width: 14.5,
    runoff: 5.0,
    spacing: 0.7,
  },

  aiguille: {
    id: 'aiguille',
    name: "L'Aiguille",
    blurb: 'Une grande boucle étirée, deux épingles serrées à chaque bout.',
    rx: 94,
    ry: 44,
    harmonics: [
      { n: 2, a: 0.32, p: 0.15 },
      { n: 3, a: 0.07, p: 1.35 },
      { n: 4, a: 0.035, p: 0.0 },
    ],
    startT: 0.5,
    width: 13.5,
    runoff: 4.5,
    spacing: 0.7,
  },

  cigogne: {
    id: 'cigogne',
    name: 'La Cigogne',
    blurb: 'Trois grands lobes : deux longues courbes et une moyenne.',
    rx: 104,
    ry: 64,
    harmonics: [
      { n: 3, a: 0.11, p: 0.3 },
    ],
    startT: 0.34,
    width: 13.5,
    runoff: 4.5,
    spacing: 0.7,
  },

  escargot: {
    id: 'escargot',
    name: "L'Escargot",
    blurb: 'Quatre bosses enchaînées : un tracé technique, en lacets.',
    rx: 108,
    ry: 60,
    harmonics: [
      { n: 2, a: 0.1, p: 0.4 },
      { n: 4, a: 0.03, p: 1.0 },
    ],
    startT: 0.12,
    width: 14.0,
    runoff: 4.5,
    spacing: 0.7,
  },

  onde: {
    id: 'onde',
    name: "L'Onde",
    blurb: 'Une piste rapide et sinueuse, en permanence dans lesesses.',
    rx: 104,
    ry: 62,
    harmonics: [
      { n: 2, a: 0.08, p: 0.4 },
      { n: 3, a: 0.05, p: 1.2 },
      { n: 5, a: 0.02, p: 2.2 },
    ],
    startT: 0.66,
    width: 14.0,
    runoff: 4.5,
    spacing: 0.7,
  },
};

const TRACK_IDS = Object.keys(TRACKS);

function trackPointAtT(t, def) {
  const a = mod(t, 1) * TAU;
  let r = 1;
  for (const h of def.harmonics) r += h.a * Math.cos(h.n * a + h.p);
  return {
    x: def.rx * r * Math.cos(a),
    y: def.ry * r * Math.sin(a),
  };
}

function buildTrack(def) {
  const M = 6000;
  const dense = [];
  for (let i = 0; i < M; i++) dense.push(trackPointAtT(def.startT + i / M, def));

  const cum = [0];
  for (let i = 1; i <= M; i++) {
    const a = dense[i % M];
    const b = dense[i - 1];
    cum.push(cum[i - 1] + Math.hypot(a.x - b.x, a.y - b.y));
  }

  const length = cum[M];
  const N = Math.round(length / def.spacing);
  const pts = [];
  let j = 0;

  for (let i = 0; i < N; i++) {
    const target = (i * length) / N;
    while (j < M - 1 && cum[j + 1] < target) j++;
    const t = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = dense[j];
    const b = dense[(j + 1) % M];
    pts.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  }

  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    pts[i].tx = dx;
    pts[i].ty = dy;
    pts[i].nx = -dy;
    pts[i].ny = dx;
    pts[i].s = i / N;
  }

  // Courbure locale (pour les vibreurs et le rendu)
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 3 + N) % N];
    const b = pts[i];
    const c = pts[(i + 3) % N];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    const la = Math.hypot(abx, aby) || 1;
    const lb = Math.hypot(bcx, bcy) || 1;
    const ang = Math.asin(clamp(cross / (la * lb), -1, 1));
    pts[i].curvS = ang / (6 * (length / N));
    pts[i].curv = Math.abs(pts[i].curvS);
  }

  const halfWidth = def.width / 2;
  const runoff = def.runoff;
  const limit = halfWidth + runoff - 1.0;

  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const track = {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    pts,
    N,
    length,
    spacing: length / N,
    halfWidth,
    runoff,
    limit,
    width: def.width,
    bounds: { minX, maxX, minY, maxY },
  };

  // Rayon minimal du tracé (métrique de courbure) : sert à judge si le
  // circuit est franchissable et à l'afficher dans le menu.
  let maxCurv = 0;
  for (const p of pts) maxCurv = Math.max(maxCurv, p.curv);
  track.maxCurvature = maxCurv;
  track.minRadius = maxCurv > 1e-6 ? 1 / maxCurv : Infinity;

  track.viewBounds = {
    minX: minX - halfWidth - runoff - 1.5,
    maxX: maxX + halfWidth + runoff + 1.5,
    minY: minY - halfWidth - runoff - 1.5,
    maxY: maxY + halfWidth + runoff + 1.5,
  };

  track.offsetPolygon = function (offset) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      out[i] = { x: p.x + p.nx * offset, y: p.y + p.ny * offset };
    }
    return out;
  };

  track.roadPoly = track.offsetPolygon(halfWidth);
  track.outerPoly = track.offsetPolygon(halfWidth + runoff);

  track.pointAtS = function (s) {
    const f = mod(s, 1) * N;
    const i0 = Math.floor(f);
    const t = f - i0;
    const i1 = (i0 + 1) % N;
    const a = pts[i0];
    const b = pts[i1];
    let tx = lerp(a.tx, b.tx, t);
    let ty = lerp(a.ty, b.ty, t);
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      tx,
      ty,
      nx: -ty,
      ny: tx,
      s: mod(s, 1),
    };
  };

  /* Localisation d'un point sur la piste : projection sur le segment le plus
     proche autour de l'indice connu (recherche fenêtrée pour la performance). */
  track.locate = function (x, y, hint) {
    let best = -1;
    let bestD = 1e18;

    if (hint >= 0 && hint < N) {
      for (let k = -42; k <= 42; k++) {
        const i = (hint + k + N) % N;
        const dx = x - pts[i].x;
        const dy = y - pts[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD > 3600) {
        best = -1;
        bestD = 1e18;
      }
    }

    if (best < 0) {
      for (let i = 0; i < N; i++) {
        const dx = x - pts[i].x;
        const dy = y - pts[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }

    let proj = null;
    for (let k = -1; k <= 0; k++) {
      const i0 = (best + k + N) % N;
      const i1 = (i0 + 1) % N;
      const a = pts[i0];
      const b = pts[i1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const l2 = vx * vx + vy * vy || 1e-9;
      const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2, 0, 1);
      const px = a.x + vx * t;
      const py = a.y + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (!proj || d < proj.d) {
        proj = { i0, i1, t, d, px, py, vx, vy };
      }
    }

    const segLen = Math.hypot(proj.vx, proj.vy) || 1;
    const nx = -proj.vy / segLen;
    const ny = proj.vx / segLen;
    const lateral = (x - proj.px) * nx + (y - proj.py) * ny;

    return {
      index: best,
      progress: (proj.i0 + proj.t) / N,
      lateral,
      dist: Math.abs(lateral),
      px: proj.px,
      py: proj.py,
      nx,
      ny,
      tx: proj.vx / segLen,
      ty: proj.vy / segLen,
      onTrack: Math.abs(lateral) <= halfWidth,
    };
  };

  return track;
}

/* Circuit actif. `useTrack` permet de changer de tracé à chaud
   (sélection dans le menu, banc d'essai automatisé). */
let track = buildTrack(TRACKS[DEFAULT_SETTINGS.track]);

function useTrack(id) {
  const def = TRACKS[id];
  if (!def) return false;
  track = buildTrack(def);
  return true;
}

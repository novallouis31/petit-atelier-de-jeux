'use strict';

/* ============================================================================
   SÉLÉNÉ 7 — Atterrisseur lunaire 2D
   Physique : gravité lunaire, poussée, masse de carburant, couple, collisions
   à impulsion sur un terrain en polyligne. Pas de dépendance externe.
   ========================================================================== */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const approachRate = (dt, k) => 1 - Math.exp(-k * dt);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------------------------------------------------
   Constantes du monde
   -------------------------------------------------------------------------- */

const WORLD = { w: 720, h: 560 };
const BASE_GRAVITY = 1.62;         // gravité de référence (Lune)
const G0 = 9.80665;

/* ----------------------------------------------------------------------------
   Géométrie de référence du vaisseau (échelle 1)
   -------------------------------------------------------------------------- */

const SHIP_BASE = {
  nozzle: { x: 1.55, y: -1.5 },    // position locale (symétrique)
  // direction locale de poussée du propulseur gauche (pousse vers la droite)
  dirL: { x: 0.7654, y: 0.6434 },
  // points de contact (repère du vaisseau)
  points: [
    { x: -2.9, y: -2.6 }, { x: 2.9, y: -2.6 },   // pieds
    { x: -2.0, y: -1.15 }, { x: 2.0, y: -1.15 }, // coque basse
    { x: -2.6, y: -0.2 }, { x: 2.6, y: -0.2 },   // flancs
    { x: 0, y: 2.6 }                              // sommet
  ],
  feet: [{ x: -2.9, y: -2.6 }, { x: 2.9, y: -2.6 }]
};

/* ----------------------------------------------------------------------------
   Planètes et vaisseaux
   -------------------------------------------------------------------------- */

const PLANETS = {
  moon: {
    id: 'moon', name: 'Lune', gravity: 1.62, density: 0,
    desc: 'Aucune atmosphère, gravité faible. Le terrain d\'entraînement idéal : les trajectoires sont longues et les corrections se font en douceur.',
    pal: {
      sky: ['#020308', '#050a14', '#0a101d'], starAlpha: 1,
      haze: [56, 120, 180], hazeA: 0.09,
      terra: ['#243149', '#1a2438', '#080c15'],
      edge: 'rgba(150,205,235,0.5)', edge2: 'rgba(90,140,180,0.18)',
      strata: 'rgba(143,211,232,0.18)',
      rock: 'rgba(12,18,30,0.85)', rockEdge: 'rgba(120,175,210,0.18)',
      hills: ['#070c16', '#0a111e', '#0d1727'],
      pad: '#63e6c0',
      orb: { x: 0.8, y: 0.2, r: 0.055, glow: 'rgba(90,160,240,0.2)', stops: ['#79b8f2', '#3d78c4', '#1d3f77', '#0a1730'], clouds: true, ring: false }
    }
  },
  mars: {
    id: 'mars', name: 'Mars', gravity: 3.71, density: 0.02,
    desc: 'Atmosphère ténue et gravité intermédiaire. L\'air ne freine presque pas : il faut anticiper chaque freinage.',
    pal: {
      sky: ['#150a0d', '#371a15', '#7a3f24'], starAlpha: 0.55,
      haze: [225, 140, 90], hazeA: 0.22,
      terra: ['#4b2a1d', '#33190f', '#160a06'],
      edge: 'rgba(255,185,140,0.5)', edge2: 'rgba(200,120,90,0.2)',
      strata: 'rgba(255,170,120,0.16)',
      rock: 'rgba(30,14,9,0.85)', rockEdge: 'rgba(255,160,120,0.2)',
      hills: ['#1a0e0c', '#241310', '#33201a'],
      pad: '#ffb07a',
      orb: { x: 0.78, y: 0.16, r: 0.034, glow: 'rgba(255,205,150,0.26)', stops: ['#fff6d8', '#ffd88a', '#e8a04a', '#a65c14'], clouds: false, ring: false }
    }
  },
  earth: {
    id: 'earth', name: 'Terre', gravity: 9.81, density: 1.225,
    desc: 'Gravité forte et atmosphère dense. L\'air freine beaucoup, mais la chute est rapide : le dosage de la poussée est vital.',
    pal: {
      sky: ['#2c6ba8', '#7cb6d9', '#c9e2e8'], starAlpha: 0.12,
      haze: [205, 235, 245], hazeA: 0.5,
      terra: ['#3a4a35', '#283521', '#0c140d'],
      edge: 'rgba(190,240,190,0.55)', edge2: 'rgba(120,170,120,0.2)',
      strata: 'rgba(220,255,220,0.16)',
      rock: 'rgba(18,28,18,0.85)', rockEdge: 'rgba(180,230,180,0.22)',
      hills: ['#284234', '#1f372a', '#182d22'],
      pad: '#7fe3a8',
      orb: { x: 0.82, y: 0.18, r: 0.042, glow: 'rgba(220,235,255,0.18)', stops: ['#e8eef8', '#bcc7d8', '#828e9f', '#3d4655'], clouds: false, ring: false }
    }
  },
  titan: {
    id: 'titan', name: 'Titan', gravity: 1.35, density: 4.2,
    desc: 'Gravité très faible, atmosphère épaisse et orange. L\'air porte le vaisseau : les approches sont lentes et flottantes.',
    pal: {
      sky: ['#160d05', '#5a3410', '#b87a28'], starAlpha: 0.15,
      haze: [245, 175, 75], hazeA: 0.62,
      terra: ['#4a3418', '#2e1f0d', '#130b04'],
      edge: 'rgba(255,210,140,0.5)', edge2: 'rgba(210,150,80,0.2)',
      strata: 'rgba(255,200,120,0.16)',
      rock: 'rgba(26,16,6,0.85)', rockEdge: 'rgba(255,190,110,0.2)',
      hills: ['#241708', '#33200c', '#452d12'],
      pad: '#ffcf6b',
      orb: { x: 0.8, y: 0.17, r: 0.05, glow: 'rgba(255,200,120,0.24)', stops: ['#f6e2ae', '#d8b672', '#a6813f', '#5f461f'], clouds: false, ring: true }
    }
  },
  custom: {
    id: 'custom', name: 'Sur mesure', gravity: 2.5, density: 0.3,
    desc: '', pal: null
  }
};

const SHIPS = {
  classic: {
    id: 'classic', name: 'Classique', scale: 1,
    dryMass: 850, thrust: 3000, fuel: 92, drag: 9.0, inertiaCoef: 5.2,
    desc: 'Le vaisseau-école : masse moyenne, poussée confortable, très tolérant.'
  },
  scout: {
    id: 'scout', name: 'Éclaireur', scale: 0.84,
    dryMass: 540, thrust: 1950, fuel: 64, drag: 6.2, inertiaCoef: 4.6,
    desc: 'Léger et nerveux, mais réservoir plus petit. Pour les pilotes précis.'
  },
  cargo: {
    id: 'cargo', name: 'Cargo', scale: 1.28,
    dryMass: 1650, thrust: 6400, fuel: 165, drag: 15.5, inertiaCoef: 6.0,
    desc: 'Lourd, puissant et stable. Il pardonne moins les freinages tardifs.'
  },
  custom: {
    id: 'custom', name: 'Sur mesure', scale: 1,
    dryMass: 850, thrust: 3000, fuel: 92, drag: 9.0, inertiaCoef: 5.2,
    desc: 'Vos réglages : masse, poussée et carburant sont entièrement libres.'
  }
};

const DIFFICULTIES = {
  easy: {
    id: 'easy', label: 'FACILE', fuelMul: 1.25, pad: 64, rough: 0.62,
    maxVy: 3.0, maxVx: 2.2, maxTilt: 16, color: '#5ee2b0'
  },
  normal: {
    id: 'normal', label: 'NORMAL', fuelMul: 1, pad: 44, rough: 1.0,
    maxVy: 2.6, maxVx: 1.8, maxTilt: 13, color: '#63e6c0'
  },
  hard: {
    id: 'hard', label: 'DIFFICILE', fuelMul: 0.8, pad: 30, rough: 1.22,
    maxVy: 2.2, maxVx: 1.5, maxTilt: 10, color: '#ffc46b'
  }
};

/* ----------------------------------------------------------------------------
   Configuration persistante
   -------------------------------------------------------------------------- */

const CONFIG_KEY = 'selene7.config';

const config = {
  planetId: 'moon',
  shipId: 'classic',
  diffId: 'normal',
  customPlanet: { gravity: 2.5, density: 0.3 },
  customShip: { dryMass: 850, thrust: 3000, fuel: 92 }
};

function loadConfig() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch (e) {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return;
  if (PLANETS[raw.planetId]) config.planetId = raw.planetId;
  if (SHIPS[raw.shipId]) config.shipId = raw.shipId;
  if (DIFFICULTIES[raw.diffId]) config.diffId = raw.diffId;
  if (raw.customPlanet) {
    config.customPlanet.gravity = clamp(Number(raw.customPlanet.gravity) || 2.5, 0.4, 12);
    config.customPlanet.density = clamp(Number(raw.customPlanet.density) || 0, 0, 6);
  }
  if (raw.customShip) {
    config.customShip.dryMass = clamp(Number(raw.customShip.dryMass) || 850, 400, 2000);
    config.customShip.thrust = clamp(Number(raw.customShip.thrust) || 3000, 1200, 7000);
    config.customShip.fuel = clamp(Number(raw.customShip.fuel) || 92, 40, 220);
  }
}

function saveConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) { /* stockage indisponible */ }
}

/* ----------------------------------------------------------------------------
   Résolution de la configuration
   -------------------------------------------------------------------------- */

function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  return `rgb(${Math.round(lerp(ar, br, t))},${Math.round(lerp(ag, bg, t))},${Math.round(lerp(ab, bb, t))})`;
}

function hexRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function atmoLabel(density) {
  if (density <= 0.005) return 'Vide';
  if (density < 0.25) return 'Ténue';
  if (density < 2) return 'Modérée';
  if (density < 4) return 'Dense';
  return 'Épaisse';
}

function customPlanetPalette(gravity, density) {
  const t = clamp(density / 4, 0, 1);
  const starAlpha = clamp(1 - density * 0.55, 0.04, 1);
  const hills = t > 0.45
    ? ['#0b1512', '#10201a', '#162a22']
    : ['#0a0e18', '#0f1522', '#141d2c'];
  return {
    sky: [
      mixColor('#020308', '#24313b', t * 0.85),
      mixColor('#060a14', '#4a6470', t * 0.85),
      mixColor('#0b1220', '#9fb8b4', t * 0.9)
    ],
    starAlpha,
    haze: [140, 185, 195], hazeA: 0.08 + t * 0.6,
    terra: [
      mixColor('#2b3049', '#39443a', t * 0.6),
      mixColor('#1b2032', '#232c22', t * 0.6),
      '#080b13'
    ],
    edge: 'rgba(190,210,255,0.5)',
    edge2: 'rgba(130,150,190,0.2)',
    strata: 'rgba(190,210,255,0.16)',
    rock: 'rgba(14,18,28,0.85)',
    rockEdge: 'rgba(170,190,230,0.2)',
    hills,
    pad: '#a9b8ff',
    orb: density > 0.6
      ? { x: 0.8, y: 0.18, r: 0.05, glow: 'rgba(150,230,210,0.2)', stops: ['#bfe6e2', '#6fb4a8', '#2f6b62', '#12302c'], clouds: true, ring: false }
      : { x: 0.78, y: 0.16, r: 0.03, glow: 'rgba(255,215,160,0.24)', stops: ['#fff6d8', '#ffd88a', '#e8a04a', '#a65c14'], clouds: false, ring: false }
  };
}

function resolvePlanet() {
  if (config.planetId === 'custom') {
    const gravity = clamp(config.customPlanet.gravity, 0.4, 12);
    const density = clamp(config.customPlanet.density, 0, 6);
    return {
      id: 'custom', name: 'Sur mesure', gravity, density,
      desc: 'Monde entièrement personnalisé : ajustez la gravité et la densité de l\'air pour créer votre propre défi.',
      pal: customPlanetPalette(gravity, density)
    };
  }
  const p = PLANETS[config.planetId] || PLANETS.moon;
  return p;
}

function resolveShip() {
  if (config.shipId === 'custom') {
    const dryMass = clamp(config.customShip.dryMass, 400, 2000);
    const thrust = clamp(config.customShip.thrust, 1200, 7000);
    const fuel = clamp(config.customShip.fuel, 40, 220);
    const scale = clamp(0.8 + (dryMass - 400) / 1600 * 0.55, 0.8, 1.35);
    return {
      id: 'custom', name: 'Sur mesure', scale, dryMass, thrust, fuel,
      drag: 9 * scale * scale, inertiaCoef: 5.2,
      desc: 'Vos réglages : masse, poussée et carburant sont entièrement libres.'
    };
  }
  return SHIPS[config.shipId] || SHIPS.classic;
}

const fmtNum = (v, d = 2) => v.toFixed(d).replace('.', ',');

/* ----------------------------------------------------------------------------
   Audio (bruit de propulseur + bips)
   -------------------------------------------------------------------------- */

const sfx = {
  ctx: null,
  master: null,
  engineGain: null,
  engineFilter: null,
  muted: false,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 240;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    src.start();
  },

  setEngine(level) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this._lastEngine !== undefined && Math.abs(level - this._lastEngine) < 0.04 && now - (this._lastEngineAt || 0) < 0.1) return;
    this._lastEngine = level;
    this._lastEngineAt = now;
    const g = this.muted ? 0 : 0.12 * level;
    this.engineGain.gain.setTargetAtTime(g, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(170 + 300 * level, now, 0.08);
  },

  tone(freq, dur, type = 'sine', vol = 0.16, slide = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  },

  blip() { this.tone(660, 0.07, 'square', 0.08); },

  thud(power) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, power), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.4);
  },

  crash() {
    if (!this.ctx || this.muted) return;
    this.tone(90, 0.7, 'sawtooth', 0.3, 0.25);
    this.thud(0.9);
  },

  success() {
    if (!this.ctx || this.muted) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.4, 'sine', 0.14), i * 110);
    });
  }
};

/* ----------------------------------------------------------------------------
   Terrain procédural
   -------------------------------------------------------------------------- */

function genTerrain(seed, diff) {
  const rng = mulberry32(seed);
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  const startPad = { x1: 26, x2: 108, y: 176 + rng() * 30 };
  startPad.w = startPad.x2 - startPad.x1;

  const padW = diff.pad;
  const padX1 = 512 + rng() * 64;
  const pad = { x1: padX1, x2: padX1 + padW, y: 42 + rng() * 22 };
  pad.w = pad.x2 - pad.x1;

  const amp = diff.rough;
  function base(x) {
    return (
      118 +
      54 * Math.sin(x * 0.0082 + ph[0]) * amp +
      30 * Math.sin(x * 0.0195 + ph[1]) * amp +
      15 * Math.sin(x * 0.052 + ph[2]) +
      7 * Math.sin(x * 0.11 + ph[3])
    );
  }

  function blendTo(x, p, margin) {
    if (x <= p.x1 - margin || x >= p.x2 + margin) return 0;
    if (x >= p.x1 && x <= p.x2) return 1;
    const d = x < p.x1 ? p.x1 - x : x - p.x2;
    return smooth(1 - d / margin);
  }

  function height(x) {
    let h = base(x);
    h = lerp(h, startPad.y, blendTo(x, startPad, 34));
    h = lerp(h, pad.y, blendTo(x, pad, 44));
    return clamp(h, 10, 250);
  }

  // points d'échantillonnage, en excluant l'intérieur des plateformes
  const inside = (x) =>
    (x > startPad.x1 + 1e-6 && x < startPad.x2 - 1e-6) ||
    (x > pad.x1 + 1e-6 && x < pad.x2 - 1e-6);

  const xs = [];
  const seen = new Set();
  const pushX = (x) => {
    const key = x.toFixed(3);
    if (seen.has(key)) return;
    seen.add(key);
    xs.push(x);
  };
  for (let x = 0; x <= WORLD.w + 1e-6; x += 4) pushX(x);
  pushX(WORLD.w);
  pushX(startPad.x1); pushX(startPad.x2);
  pushX(pad.x1); pushX(pad.x2);
  xs.sort((a, b) => a - b);

  const pts = [];
  for (const x of xs) {
    if (inside(x)) continue;
    let y = height(x);
    if (Math.abs(x - startPad.x1) < 1e-6 || Math.abs(x - startPad.x2) < 1e-6) y = startPad.y;
    if (Math.abs(x - pad.x1) < 1e-6 || Math.abs(x - pad.x2) < 1e-6) y = pad.y;
    pts.push({ x, y });
  }

  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let padId = -1;
    if (Math.abs(dy) < 1e-5) {
      if (Math.abs(a.y - startPad.y) < 1e-5) padId = 0;
      else if (Math.abs(a.y - pad.y) < 1e-5) padId = 1;
    }
    segs.push({ nx: -dy / len, ny: dx / len, padId });
  }

  // décor : petits blocs de roche posés sur la surface
  const rocks = [];
  for (let i = 0; i < 90; i++) {
    const x = rng() * WORLD.w;
    if (x > startPad.x1 - 8 && x < startPad.x2 + 8) continue;
    if (x > pad.x1 - 10 && x < pad.x2 + 10) continue;
    const y = height(x);
    const s = 0.5 + rng() * 2.3;
    rocks.push({ x, y, w: s * (1 + rng() * 1.4), h: s, tilt: (rng() - 0.5) * 0.5 });
  }

  return { pts, segs, startPad, pad, height, rocks, seed };
}

const _samp = { y: 0, nx: 0, ny: 1, ax: 0, ay: 0, padId: -1 };

function sampleTerrain(x) {
  const pts = terrain.pts;
  x = clamp(x, 0, WORLD.w - 1e-6);
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].x <= x) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo], b = pts[lo + 1];
  const seg = terrain.segs[lo];
  const t = (x - a.x) / (b.x - a.x || 1);
  _samp.y = a.y + (b.y - a.y) * t;
  _samp.nx = seg.nx;
  _samp.ny = seg.ny;
  _samp.ax = a.x;
  _samp.ay = a.y;
  _samp.padId = seg.padId;
  return _samp;
}

function groundHeight(x) {
  return sampleTerrain(x).y;
}

/* ----------------------------------------------------------------------------
   État de jeu
   -------------------------------------------------------------------------- */

const game = {
  mode: 'title',          // title | config | flying | paused | landed | crashed
  diff: DIFFICULTIES.normal,
  planet: PLANETS.moon,
  shipDef: SHIPS.classic,
  geom: null,
  thrust: 0,
  fuelCap: 0,
  tolVy: 2.6,
  tolVx: 1.8,
  tolTilt: 13,
  rcsK: 7600,
  rcsC: 5200,
  rcsMax: 2600,
  dragAcc: 0,
  ready: false,
  airborne: false,
  launchedAt: -99,
  seed: 0,
  attempts: 0,
  missionTime: 0,
  missionId: 0,
  pausedFrom: null,
  result: null,
  endTimer: 0,
  keys: { left: false, right: false, both: false },
  invert: false,
  invertToastAt: -99,
  thrusterLevel: 0,
  time: 0
};

const ship = {
  x: 0, y: 0, vx: 0, vy: 0,
  theta: 0, omega: 0,
  fuel: 0, mass: 0, inertia: 0,
  thrustL: 0, thrustR: 0,
  alive: true,
  bornAt: 0
};

let terrain = null;
let particles = [];
let dust = [];
let cam = { x: 0, y: 0, scale: 6, shake: 0 };
let W = 1280, H = 720, DPR = 1;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* ----------------------------------------------------------------------------
   Particules
   -------------------------------------------------------------------------- */

function spawnExhaust(x, y, dx, dy, power) {
  const n = power > 0.5 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const spread = (Math.random() - 0.5) * 0.55;
    const ca = Math.cos(spread), sa = Math.sin(spread);
    const vx = (dx * ca - dy * sa) * (9 + Math.random() * 9);
    const vy = (dx * sa + dy * ca) * (9 + Math.random() * 9);
    particles.push({
      x, y,
      vx: vx + ship.vx * 0.6,
      vy: vy + ship.vy * 0.6,
      life: 0.18 + Math.random() * 0.22,
      max: 0.4,
      size: 0.35 + Math.random() * 0.7,
      kind: 'fire'
    });
  }
}

function spawnDust(x, y, power) {
  if (Math.random() > power * 0.9) return;
  const dir = Math.random() < 0.5 ? -1 : 1;
  dust.push({
    x: x + (Math.random() - 0.5) * 4,
    y: y + 0.2,
    vx: dir * (3 + Math.random() * 9),
    vy: 1 + Math.random() * 4,
    life: 0.6 + Math.random() * 0.8,
    max: 1.4,
    size: 0.6 + Math.random() * 1.6
  });
}

function spawnExplosion(x, y) {
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * TAU;
    const sp = 4 + Math.random() * 26;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 1.1,
      max: 1.6,
      size: 0.4 + Math.random() * 1.5,
      kind: Math.random() < 0.4 ? 'spark' : 'fire'
    });
  }
}

function updateParticles(dt) {
  const pg = clamp(game.planet.gravity / BASE_GRAVITY, 0.4, 3);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 2.4 * pg * dt;
    p.vx *= 1 - 0.9 * dt;
    p.vy *= 1 - 0.9 * dt;
  }
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life -= dt;
    if (d.life <= 0) { dust.splice(i, 1); continue; }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= 1 - 1.8 * dt;
    d.vy -= 0.9 * pg * dt;
    d.size += dt * 2.2;
  }
}

/* ----------------------------------------------------------------------------
   Démarrage / fin de mission
   -------------------------------------------------------------------------- */

const bestKey = (planetId, diffId) => `selene7.best.${planetId}.${diffId}`;

function readBest(planetId, diffId) {
  try {
    return parseInt(localStorage.getItem(bestKey(planetId, diffId)) || '0', 10) || 0;
  } catch (e) {
    return 0;
  }
}

function writeBest(planetId, diffId, score) {
  try {
    localStorage.setItem(bestKey(planetId, diffId), String(score));
  } catch (e) { /* stockage indisponible */ }
}

/* --- résolution de la mission en cours --- */

function applyMissionSetup(diff) {
  const planet = resolvePlanet();
  const shipDef = resolveShip();
  const k = planet.gravity / BASE_GRAVITY;
  game.diff = diff;
  game.planet = planet;
  game.shipDef = shipDef;
  game.thrust = shipDef.thrust * k;
  // Le carburant suit la gravité : une poussée plus forte sur un monde plus
  // lourd se paie en carburant supplémentaire, comme dans la réalité.
  game.fuelCap = shipDef.fuel * diff.fuelMul * k;
  // Tolérances d'atterrissage : on autorise des vitesses plus élevées là où
  // la gravité est forte (la distance de freinage reste comparable).
  const tol = clamp(Math.sqrt(k), 0.9, 1.6);
  game.tolVy = diff.maxVy * tol;
  game.tolVx = diff.maxVx * tol;
  game.tolTilt = diff.maxTilt;
  game.geom = {
    scale: shipDef.scale,
    points: SHIP_BASE.points.map((p) => ({ x: p.x * shipDef.scale, y: p.y * shipDef.scale })),
    feet: SHIP_BASE.feet.map((p) => ({ x: p.x * shipDef.scale, y: p.y * shipDef.scale })),
    nozzle: { x: SHIP_BASE.nozzle.x * shipDef.scale, y: SHIP_BASE.nozzle.y * shipDef.scale },
    dirL: SHIP_BASE.dirL,
    drag: shipDef.drag
  };
  return k;
}

function resetShipToStart() {
  applyMissionSetup(game.diff);
  const pad = terrain.startPad;
  const sc = game.shipDef.scale;
  ship.x = (pad.x1 + pad.x2) / 2;
  ship.y = pad.y + 2.6 * sc + 0.02;
  ship.vx = 0;
  ship.vy = 0;
  ship.theta = 0;
  ship.omega = 0;
  ship.fuel = game.fuelCap;
  ship.mass = game.shipDef.dryMass + ship.fuel;
  ship.inertia = ship.mass * game.shipDef.inertiaCoef * sc * sc;
  ship.thrustL = 0;
  ship.thrustR = 0;
  ship.alive = true;
  ship.bornAt = game.time;
  game.ready = true;
  game.airborne = false;
  game.dragAcc = 0;
  game.thrusterLevel = 0;
}

/* --- préférence : inversion gauche / droite --- */

const INVERT_KEY = 'selene7.invert';

function updateInvertButton() {
  const btn = document.getElementById('invertBtn');
  const label = document.getElementById('invertLabel');
  if (!btn || !label) return;
  btn.classList.toggle('on', game.invert);
  btn.setAttribute('aria-pressed', game.invert ? 'true' : 'false');
  label.textContent = game.invert ? 'Propulseurs : inversés' : 'Propulseurs : normaux';
}

function setInvert(value, announce) {
  game.invert = !!value;
  try {
    localStorage.setItem(INVERT_KEY, game.invert ? '1' : '0');
  } catch (e) { /* stockage indisponible */ }
  updateInvertButton();
  if (announce) {
    game.invertToastAt = game.time;
    sfx.blip();
  }
}

function loadSettings() {
  try {
    game.invert = localStorage.getItem(INVERT_KEY) === '1';
  } catch (e) {
    game.invert = false;
  }
  updateInvertButton();
}

function refreshBestTitle() {
  const el = document.getElementById('bestTitle');
  if (!el) return;
  const planet = game.planet || PLANETS.moon;
  const b = readBest(planet.id, game.diff.id);
  el.textContent = b > 0
    ? `Record ${planet.name} · ${game.diff.label} : ${b} pts`
    : `Aucun record sur ${planet.name} en ${game.diff.label.toLowerCase()}`;
}

function startMission(diffId, seed, replay) {
  const diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
  game.diff = diff;
  if (!replay) game.seed = seed >>> 0;
  if (replay && !game.seed) game.seed = seed >>> 0;

  terrain = genTerrain(game.seed, diff);
  game.attempts = replay ? game.attempts + 1 : 1;
  game.missionTime = 0;
  game.missionId++;
  game.result = null;
  game.endTimer = 0;
  game.pausedFrom = null;
  game.mode = 'flying';

  particles = [];
  dust = [];
  cam.shake = 0;

  resetShipToStart();

  game.keys.left = false;
  game.keys.right = false;
  game.keys.both = false;

  cam.x = ship.x;
  cam.y = ship.y + 10;
  cam.scale = 6;

  hidePanels();
  sfx.init();
  sfx.blip();
  refreshBestTitle();
}

function hidePanels() {
  document.getElementById('overlay').classList.add('hidden');
  ['panelTitle', 'panelConfig', 'panelPause', 'panelResult'].forEach((p) => {
    document.getElementById(p).classList.add('hidden');
  });
}

function showPanel(id) {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  ['panelTitle', 'panelConfig', 'panelPause', 'panelResult'].forEach((p) => {
    document.getElementById(p).classList.toggle('hidden', p !== id);
  });
}

function endMission(success, kind, detail) {
  if (game.mode !== 'flying') return;
  const diff = game.diff;
  const pad = terrain.pad;
  const padCenter = (pad.x1 + pad.x2) / 2;
  const vx = detail.vx || 0;
  const vy = detail.vy || 0;
  const off = Math.abs(ship.x - padCenter);
  const fuelLeft = Math.max(0, ship.fuel);
  let score = 0;

  if (success) {
    const fuelBonus = clamp(fuelLeft / game.fuelCap, 0, 1);
    const timeBonus = clamp(1 - Math.max(0, game.missionTime - 12) / 60, 0, 1);
    const centerBonus = clamp(1 - off / (pad.w / 2), 0, 1);
    const softBonus = clamp(1 - Math.abs(vy) / game.tolVy, 0, 1);
    score = Math.round(
      1000 + 700 * fuelBonus + 500 * timeBonus + 400 * centerBonus + 300 * softBonus
    );
  }

  const planetId = game.planet.id;
  const best = Math.max(readBest(planetId, diff.id), score);
  if (score > readBest(planetId, diff.id)) writeBest(planetId, diff.id, score);
  refreshBestTitle();

  game.mode = success ? 'landed' : 'crashed';
  game.endTimer = 0;
  game.crewSpeed = { vx, vy };
  game.result = {
    success, kind,
    score,
    best,
    vx,
    vy,
    off,
    fuel: fuelLeft,
    time: game.missionTime,
    padCenter
  };

  if (success) {
    sfx.setEngine(0);
    sfx.success();
    for (let i = 0; i < 26; i++) spawnDust(ship.x + (Math.random() - 0.5) * 8, terrain.pad.y, 1);
  } else {
    sfx.setEngine(0);
    sfx.crash();
    spawnExplosion(ship.x, ship.y);
    cam.shake = 1;
    ship.alive = false;
  }

  const resultMission = game.missionId;
  setTimeout(() => {
    if (game.missionId !== resultMission) return;
    if (game.mode === 'landed' || game.mode === 'crashed') fillResultPanel();
  }, success ? 900 : 1100);
}

function fillResultPanel() {
  if (!game.result) return;
  const r = game.result;
  const diff = game.diff;
  const title = document.getElementById('resultTitle');
  const eyebrow = document.getElementById('resultEyebrow');
  const msg = document.getElementById('resultMsg');
  const stats = document.getElementById('resultStats');
  const scoreEl = document.getElementById('resultScore');
  const bestEl = document.getElementById('resultBest');

  title.classList.toggle('ok', r.success);
  title.classList.toggle('fail', !r.success);

  if (r.success) {
    eyebrow.textContent = `MISSION SELENE-7 · ${game.planet.name.toUpperCase()} · ACCOMPLIE`;
    title.textContent = 'Atterrissage confirmé';
    msg.textContent = r.off < 4
      ? 'Contact parfaitement centré. Les contrôleurs au sol applaudissent (discrètement).'
      : 'Les deux trains sont posés dans la zone. Mission accomplie, commandant.';
  } else {
    eyebrow.textContent = `MISSION SELENE-7 · ${game.planet.name.toUpperCase()} · INTERROMPUE`;
    title.textContent = r.kind === 'bounds' ? 'Vaisseau perdu' : 'Échec de la mission';
    const reasons = {
      speed: 'Impact trop violent. Ce monde ne pardonne pas les approches rapides.',
      terrain: 'Le vaisseau s\'est posé sur un terrain accidenté. Seule la plateforme balisée est sûre.',
      edge: 'Un train d\'atterrissage a mordu le bord de la plateforme. Il fallait viser le centre.',
      tilt: 'Assiette trop inclinée au contact. Le vaisseau a basculé.',
      base: 'Retour à la base de départ. La mission n\'a pas progressé.',
      bounds: 'Le vaisseau a quitté la zone de vol. La mission est perdue.'
    };
    msg.textContent = reasons[r.kind] || reasons.terrain;
  }

  const fmt = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
  const row = (label, value, cls = '') =>
    `<div class="stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;

  stats.innerHTML = [
    row('Monde', game.planet.name, ''),
    row('Vaisseau', game.shipDef.name, ''),
    row('Vitesse verticale', `${fmt(r.vy)} m/s`, r.success ? 'good' : (Math.abs(r.vy) > game.tolVy ? 'bad' : '')),
    row('Vitesse horizontale', `${fmt(r.vx)} m/s`, Math.abs(r.vx) > game.tolVx ? 'bad' : 'good'),
    row('Écart au centre', `${r.off.toFixed(1)} m`, r.success && r.off < 4 ? 'good' : ''),
    row('Carburant restant', `${r.fuel.toFixed(1)} kg`, ''),
    row('Durée du vol', `${r.time.toFixed(1)} s`, ''),
    row('Tentatives', `${game.attempts}`, '')
  ].join('');

  scoreEl.textContent = r.score;
  bestEl.textContent = r.best;
  showPanel('panelResult');
}

/* ----------------------------------------------------------------------------
   Physique
   -------------------------------------------------------------------------- */

const _step = { fx: 0, fy: 0, torque: 0, mdot: 0 };

function applyEngine(nozzle, dir, command, dt) {
  if (command <= 0 || ship.fuel <= 0) return;
  const need = _step.mdot * dt;
  const throttle = Math.min(1, ship.fuel / need);
  ship.fuel = Math.max(0, ship.fuel - need * throttle);
  const T = game.thrust * throttle;

  const c = Math.cos(ship.theta);
  const s = Math.sin(ship.theta);

  // poussée locale -> monde
  const lx = nozzle.x;
  const ly = nozzle.y;
  const fx = (c * dir.x - s * dir.y) * T;
  const fy = (s * dir.x + c * dir.y) * T;

  // bras de levier (position du propulseur dans le monde)
  const rx = c * lx - s * ly;
  const ry = s * lx + c * ly;

  _step.fx += fx;
  _step.fy += fy;
  _step.torque += rx * fy - ry * fx;
}

function stepPhysics(dt) {
  game.time += dt;
  if (game.mode !== 'flying') return;

  const gravK = game.planet.gravity / BASE_GRAVITY;
  _step.mdot = game.thrust / (240 * G0);

  const k = game.keys;
  let cmdRight = 0; // propulseur gauche -> pousse vers la droite
  let cmdLeft = 0;  // propulseur droit  -> pousse vers la gauche
  if (k.both) {
    cmdRight = 1;
    cmdLeft = 1;
  } else {
    const pushRight = game.invert ? k.left : k.right;
    const pushLeft = game.invert ? k.right : k.left;
    if (pushRight) cmdRight = 1;
    if (pushLeft) cmdLeft = 1;
  }

  // premier ordre de poussée : la mission démarre, le chronomètre aussi
  if (game.ready && (cmdLeft > 0 || cmdRight > 0)) {
    game.ready = false;
    game.launchedAt = game.time;
    sfx.blip();
  }
  if (!game.ready) game.missionTime += dt;

  ship.thrustR = cmdRight;
  ship.thrustL = cmdLeft;

  _step.fx = 0;
  _step.fy = 0;
  _step.torque = 0;

  const geom = game.geom;
  const nozzleL = { x: -geom.nozzle.x, y: geom.nozzle.y };
  const nozzleR = { x: geom.nozzle.x, y: geom.nozzle.y };
  const dirRight = geom.dirL;
  const dirLeft = { x: -geom.dirL.x, y: geom.dirL.y };

  applyEngine(nozzleL, dirRight, cmdRight, dt);
  applyEngine(nozzleR, dirLeft, cmdLeft, dt);

  ship.mass = game.shipDef.dryMass + ship.fuel;
  ship.inertia = ship.mass * game.shipDef.inertiaCoef * geom.scale * geom.scale;

  // stabilisation d'attitude (gyroscopes / RCS)
  game.rcsK = 1.55 * ship.inertia * gravK;
  game.rcsC = 1.06 * ship.inertia * gravK;
  game.rcsMax = 0.55 * ship.inertia * gravK;
  const rcs = clamp(-game.rcsK * ship.theta - game.rcsC * ship.omega, -game.rcsMax, game.rcsMax);
  const torqueTotal = _step.torque + rcs;
  ship.omega += (torqueTotal / ship.inertia) * dt;
  ship.omega = clamp(ship.omega, -3, 3);

  // translation
  ship.vx += (_step.fx / ship.mass) * dt;
  ship.vy += (_step.fy / ship.mass - game.planet.gravity) * dt;

  // freinage atmosphérique : F = 0,5 · rho · CdA · v²
  game.dragAcc = 0;
  const rho = game.planet.density;
  if (rho > 0) {
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 0.005) {
      const decel = 0.5 * rho * geom.drag * speed / ship.mass;
      const ax = -decel * ship.vx;
      const ay = -decel * ship.vy;
      ship.vx += ax * dt;
      ship.vy += ay * dt;
      game.dragAcc = Math.hypot(ax, ay);
    }
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.theta += ship.omega * dt;

  if (!game.airborne && ship.y > terrain.startPad.y + 12 * geom.scale) game.airborne = true;

  // niveau visuel des propulseurs
  const target = Math.max(cmdLeft, cmdRight) * (ship.fuel > 0 ? 1 : 0);
  game.thrusterLevel = lerp(game.thrusterLevel, target, approachRate(dt, 14));

  // échappement + poussière
  const cosT = Math.cos(ship.theta);
  const sinT = Math.sin(ship.theta);
  if (ship.fuel > 0) {
    if (cmdRight) {
      const nx = ship.x + cosT * nozzleL.x - sinT * nozzleL.y;
      const ny = ship.y + sinT * nozzleL.x + cosT * nozzleL.y;
      spawnExhaust(nx, ny, -(cosT * dirRight.x - sinT * dirRight.y), -(sinT * dirRight.x + cosT * dirRight.y), 1);
      spawnDust(nx, groundHeight(nx), 0.5 * clamp(1 - (ny - groundHeight(nx)) / 26, 0, 1));
    }
    if (cmdLeft) {
      const nx = ship.x + cosT * nozzleR.x - sinT * nozzleR.y;
      const ny = ship.y + sinT * nozzleR.x + cosT * nozzleR.y;
      spawnExhaust(nx, ny, -(cosT * dirLeft.x - sinT * dirLeft.y), -(sinT * dirLeft.x + cosT * dirLeft.y), 1);
      spawnDust(nx, groundHeight(nx), 0.5 * clamp(1 - (ny - groundHeight(nx)) / 26, 0, 1));
    }
  }

  sfx.setEngine(ship.fuel > 0 ? Math.max(cmdLeft, cmdRight) * (0.7 + 0.3 * Math.random()) : 0);

  collide();

  // au repos sur la base de départ : le vaisseau reste stable et vertical
  if (game.ready) {
    ship.vx = 0;
    ship.vy = 0;
    ship.omega = 0;
    ship.theta = 0;
  }

  // sortie de la zone de vol
  if (game.mode === 'flying' && (ship.x < -40 || ship.x > WORLD.w + 40 || ship.y < -40 || ship.y > 780)) {
    endMission(false, 'bounds', { vx: ship.vx, vy: ship.vy });
  }
}

function applyImpulse(ix, iy, rx, ry) {
  ship.vx += ix / ship.mass;
  ship.vy += iy / ship.mass;
  ship.omega += (rx * iy - ry * ix) / ship.inertia;
}

/* ----------------------------------------------------------------------------
   Collisions avec le terrain
   -------------------------------------------------------------------------- */

function collide() {
  if (game.mode !== 'flying') return;

  const incoming = { vx: ship.vx, vy: ship.vy, omega: ship.omega };
  let contact = false;
  let padContact = false;
  let startPadContact = false;
  let maxImpact = 0;

  const geom = game.geom;
  for (const cp of geom.points) {
    const c = Math.cos(ship.theta);
    const s = Math.sin(ship.theta);
    const px = ship.x + c * cp.x - s * cp.y;
    const py = ship.y + s * cp.x + c * cp.y;

    const info = sampleTerrain(px);
    const dist = (px - info.ax) * info.nx + (py - info.ay) * info.ny;
    if (dist >= 0) continue;

    contact = true;
    if (info.padId === 1) padContact = true;
    else if (info.padId === 0) startPadContact = true;

    const pen = -dist;
    ship.x += info.nx * pen * 0.9;
    ship.y += info.ny * pen * 0.9;

    const rx = px - ship.x;
    const ry = py - ship.y;
    const vpx = ship.vx - ship.omega * ry;
    const vpy = ship.vy + ship.omega * rx;
    const vn = vpx * info.nx + vpy * info.ny;

    if (vn < 0) {
      maxImpact = Math.max(maxImpact, -vn);
      const rn = rx * info.ny - ry * info.nx;
      const invM = 1 / ship.mass;
      const invI = 1 / ship.inertia;
      const e = 0.06;
      const jn = (-(1 + e) * vn) / (invM + rn * rn * invI);
      applyImpulse(info.nx * jn, info.ny * jn, rx, ry);

      // frottement tangent
      const tx = -info.ny;
      const ty = info.nx;
      const vtx = ship.vx - ship.omega * ry;
      const vty = ship.vy + ship.omega * rx;
      const vt = vtx * tx + vty * ty;
      const rt = rx * ty - ry * tx;
      let jt = -vt / (invM + rt * rt * invI);
      const maxF = 0.7 * Math.abs(jn);
      jt = clamp(jt, -maxF, maxF);
      applyImpulse(tx * jt, ty * jt, rx, ry);

      if (-vn > 0.4) sfx.thud(clamp(-vn / 4, 0.1, 1));
      if (maxImpact > 2.8) cam.shake = Math.max(cam.shake, clamp((maxImpact - 2) / 8, 0.25, 1));
    }
  }

  if (!contact) return;

  const pad = terrain.pad;
  const c = Math.cos(ship.theta);
  const s = Math.sin(ship.theta);
  let feetIn = 0;
  for (const f of geom.feet) {
    const fx = ship.x + c * f.x - s * f.y;
    const fy = ship.y + s * f.x + c * f.y;
    const inX = fx > pad.x1 + 0.3 && fx < pad.x2 - 0.3;
    const onY = Math.abs(fy - pad.y) < 0.9;
    if (inX && onY) feetIn++;
  }

  const diff = game.diff;
  const slowEnough =
    Math.abs(incoming.vx) <= game.tolVx &&
    Math.abs(incoming.vy) <= game.tolVy &&
    Math.abs(incoming.omega) <= 0.7;
  const tiltOk = Math.abs(ship.theta) <= game.tolTilt / DEG;

  if (feetIn === 2 && slowEnough && tiltOk) {
    // posé : on colle le vaisseau au sol
    ship.vy = 0;
    ship.vx = 0;
    ship.omega = 0;
    endMission(true, 'ok', { vx: incoming.vx, vy: incoming.vy });
    return;
  }

  let kind = 'terrain';
  if (startPadContact) {
    // Tant que le vaisseau n'a pas décollé, rester sur la base de départ est normal.
    if (!game.airborne) return;
    kind = 'base';
  } else if (padContact || feetIn > 0) {
    if (feetIn === 0 || feetIn === 1) kind = 'edge';
    else if (!tiltOk) kind = 'tilt';
    else kind = 'speed';
  }
  endMission(false, kind, { vx: incoming.vx, vy: incoming.vy });
}

/* ----------------------------------------------------------------------------
   Rendu : caméra, ciel, terrain, vaisseau
   -------------------------------------------------------------------------- */

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}
window.addEventListener('resize', resize);

const stars = (() => {
  const rng = mulberry32(20261107);
  const arr = [];
  for (let i = 0; i < 260; i++) {
    arr.push({
      x: rng(), y: rng() * 0.92,
      r: 0.4 + rng() * 1.5,
      a: 0.18 + rng() * 0.7,
      tw: rng() * TAU,
      sp: 0.6 + rng() * 2
    });
  }
  return arr;
})();

function updateCamera(dt) {
  const speed = Math.hypot(ship.vx, ship.vy);
  const viewW = 156 + 28 * (game.shipDef.scale - 1) + clamp(speed, 0, 75) * 1.35;
  const viewH = viewW * 0.62;
  let s = Math.min(W / viewW, H / viewH);
  s = clamp(s, 2.2, 9.5);
  cam.scale = lerp(cam.scale, s, approachRate(dt, 2.0));

  const tx = ship.x + ship.vx * 0.55;
  const ty = ship.y + ship.vy * 0.22 + 6;
  cam.x = lerp(cam.x, tx, approachRate(dt, 4.5));
  cam.y = lerp(cam.y, ty, approachRate(dt, 4.5));

  const halfW = W / (2 * cam.scale);
  const halfH = H / (2 * cam.scale);
  if (WORLD.w > halfW * 2) cam.x = clamp(cam.x, halfW, WORLD.w - halfW);
  else cam.x = WORLD.w / 2;
  cam.y = Math.max(cam.y, halfH - 18);

  cam.shake *= Math.exp(-dt * 3.4);
}

function w2s(x, y) {
  return {
    x: W / 2 + (x - cam.x) * cam.scale,
    y: H / 2 - (y - cam.y) * cam.scale
  };
}

function drawSky() {
  const pal = game.planet.pal;
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, pal.sky[0]);
  gr.addColorStop(0.45, pal.sky[1]);
  gr.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);

  // étoiles (masquées par une atmosphère épaisse)
  const starA = pal.starAlpha;
  if (starA > 0.02) {
    for (const st of stars) {
      const tw = 0.62 + 0.38 * Math.sin(game.time * st.sp + st.tw);
      const a = st.a * tw * starA;
      ctx.fillStyle = `rgba(230,240,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, TAU);
      ctx.fill();
    }
  }

  drawCelestial();

  // halo d'horizon
  const horizon = w2s(0, 0).y;
  if (horizon > -200 && horizon < H + 200) {
    const [hr, hg, hb] = pal.haze;
    const hz = ctx.createLinearGradient(0, horizon - H * 0.28, 0, horizon + 20);
    hz.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
    hz.addColorStop(0.65, `rgba(${hr},${hg},${hb},${(pal.hazeA * 0.55).toFixed(3)})`);
    hz.addColorStop(1, `rgba(${hr},${hg},${hb},${pal.hazeA.toFixed(3)})`);
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - H * 0.28, W, H * 0.28 + 40);
  }

  drawHills();
}

function drawCelestial() {
  const o = game.planet.pal.orb;
  if (!o) return;
  const r = clamp(W * o.r, 18, 120);
  const cx = W * o.x;
  const cy = H * o.y;

  const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.8);
  glow.addColorStop(0, o.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.8, 0, TAU);
  ctx.fill();

  // anneaux (Titan / Saturne)
  if (o.ring) {
    ctx.save();
    ctx.strokeStyle = 'rgba(235,210,160,0.45)';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.7, r * 0.42, -0.34, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,190,0.22)';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.92, r * 0.5, -0.34, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  body.addColorStop(0, o.stops[0]);
  body.addColorStop(0.45, o.stops[1]);
  body.addColorStop(0.8, o.stops[2]);
  body.addColorStop(1, o.stops[3]);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  if (o.clouds) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#eef8ff';
    ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3 + i * r * 0.16, cy + (i - 2) * r * 0.3, r * (0.5 - i * 0.04), r * 0.1, -0.4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // terminateur
  const shade = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  shade.addColorStop(0.4, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function drawHills() {
  const pal = game.planet.pal;
  const layers = [
    { p: 0.10, base: 0.80, amp: 0.045, col: pal.hills[0], f1: 0.0031, f2: 0.0092 },
    { p: 0.22, base: 0.86, amp: 0.062, col: pal.hills[1], f1: 0.0042, f2: 0.0125 },
    { p: 0.38, base: 0.93, amp: 0.085, col: pal.hills[2], f1: 0.0055, f2: 0.017 }
  ];
  const horizon = w2s(0, 0).y;
  for (const L of layers) {
    const drift = cam.x * cam.scale * L.p;
    const base = Math.min(H * 0.96, horizon + H * 0.02 + (L.base - 0.8) * H * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 8; sx += 8) {
      const u = (sx + drift) * 0.01;
      const y =
        base -
        (Math.sin(u * L.f1 * 100) * 0.55 + Math.sin(u * L.f2 * 100 + 1.7) * 0.3) * H * L.amp -
        Math.sin(u * 0.17 + 3) * H * 0.008;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = L.col;
    ctx.fill();
  }
}

function drawTerrain() {
  const pts = terrain.pts;
  const pal = game.planet.pal;
  const grad = ctx.createLinearGradient(0, 240, 0, -20);
  grad.addColorStop(0, pal.terra[0]);
  grad.addColorStop(0.35, pal.terra[1]);
  grad.addColorStop(1, pal.terra[2]);

  ctx.beginPath();
  ctx.moveTo(0, -60);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(WORLD.w, -60);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // relief secondaire pour la profondeur
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -60);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(WORLD.w, -60);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = pal.strata;
  ctx.lineWidth = 0.12;
  for (let y = 6; y < 250; y += 7) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y + 3);
    ctx.stroke();
  }
  ctx.restore();

  // arête éclairée
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 0.55;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - 0.9);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - 0.9);
  ctx.strokeStyle = pal.edge2;
  ctx.lineWidth = 0.35;
  ctx.stroke();

  // rochers décoratifs
  for (const r of terrain.rocks) {
    ctx.save();
    ctx.translate(r.x, r.y - 0.2);
    ctx.rotate(r.tilt);
    ctx.beginPath();
    ctx.moveTo(-r.w / 2, 0);
    ctx.lineTo(-r.w / 3, r.h);
    ctx.lineTo(r.w / 3, r.h * 0.85);
    ctx.lineTo(r.w / 2, 0);
    ctx.closePath();
    ctx.fillStyle = pal.rock;
    ctx.fill();
    ctx.strokeStyle = pal.rockEdge;
    ctx.lineWidth = 0.12;
    ctx.stroke();
    ctx.restore();
  }

  drawPads();
}

function drawPads() {
  const sp = terrain.startPad;
  const tp = terrain.pad;
  const t = game.time;
  const pal = game.planet.pal;

  // plateforme de départ
  ctx.fillStyle = '#232d3e';
  ctx.fillRect(sp.x1, sp.y - 1.6, sp.w, 1.6);
  ctx.fillStyle = hexRgba(pal.pad, 0.1);
  ctx.fillRect(sp.x1, sp.y - 1.6, sp.w, 0.5);
  ctx.fillStyle = '#0c1420';
  ctx.fillRect(sp.x1, sp.y - 1.6, sp.w, 0.28);
  ctx.fillStyle = 'rgba(255,196,107,0.5)';
  for (let x = sp.x1 + 2; x < sp.x2 - 1; x += 5) ctx.fillRect(x, sp.y - 1.25, 2.4, 0.3);
  ctx.fillStyle = 'rgba(150,205,235,0.8)';
  ctx.fillRect(sp.x1, sp.y - 0.12, sp.w, 0.2);

  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? sp.x1 + 1.2 : sp.x2 - 1.2;
    const on = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2));
    const g = ctx.createRadialGradient(x, sp.y + 0.4, 0, x, sp.y + 0.4, 3);
    g.addColorStop(0, `rgba(255,196,107,${0.7 * on})`);
    g.addColorStop(1, 'rgba(255,196,107,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, sp.y + 0.4, 3, 0, TAU);
    ctx.fill();
  }

  // étiquette de la base de départ
  void 0;

  // halo de la plateforme cible
  const cx = (tp.x1 + tp.x2) / 2;
  const beam = ctx.createLinearGradient(0, tp.y, 0, tp.y + 64);
  const pulse = 0.06 + 0.03 * Math.sin(t * 2);
  beam.addColorStop(0, hexRgba(pal.pad, pulse + 0.03));
  beam.addColorStop(1, hexRgba(pal.pad, 0));
  ctx.fillStyle = beam;
  ctx.fillRect(tp.x1 + 2, tp.y, tp.w - 4, 64);

  // dalle
  ctx.fillStyle = '#121c2a';
  ctx.fillRect(tp.x1, tp.y - 1.55, tp.w, 1.55);
  ctx.fillStyle = hexRgba(pal.pad, 0.13);
  ctx.fillRect(tp.x1, tp.y - 1.55, tp.w, 0.5);
  ctx.fillStyle = hexRgba(pal.pad, 0.95);
  ctx.fillRect(tp.x1, tp.y - 0.16, tp.w, 0.22);

  // chevrons
  ctx.fillStyle = hexRgba(pal.pad, 0.5);
  for (let x = tp.x1 + 4; x < tp.x2 - 3; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, tp.y - 0.4);
    ctx.lineTo(x + 1.8, tp.y - 0.4);
    ctx.lineTo(x + 0.9, tp.y - 1.15);
    ctx.closePath();
    ctx.fill();
  }

  // feux de balisage
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? tp.x1 + 1.2 : tp.x2 - 1.2;
    const blink = 0.55 + 0.45 * Math.sin(t * 5 + i * Math.PI);
    const g = ctx.createRadialGradient(x, tp.y + 0.6, 0, x, tp.y + 0.6, 4);
    g.addColorStop(0, `rgba(255,120,120,${0.9 * blink})`);
    g.addColorStop(1, 'rgba(255,80,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, tp.y + 0.6, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,180,180,${0.9 * blink})`;
    ctx.beginPath();
    ctx.arc(x, tp.y + 0.4, 0.28, 0, TAU);
    ctx.fill();
  }

  // marquage central de la piste
  ctx.fillStyle = hexRgba(pal.pad, 0.5);
  const markW = Math.min(tp.w * 0.32, 9);
  ctx.fillRect(cx - markW / 2, tp.y - 1.5, markW, 0.32);
  ctx.fillRect(cx - markW / 2, tp.y - 0.8, markW, 0.32);
}

function drawShip() {
  if (!ship.alive) return;
  const geom = game.geom;

  // lueur de freinage atmosphérique
  if (game.dragAcc > 0.4) {
    const heat = clamp((game.dragAcc - 0.4) / 9, 0, 1);
    const gr = 4.8 * geom.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(ship.x, ship.y, 0.4, ship.x, ship.y, gr);
    glow.addColorStop(0, `rgba(255,225,170,${(0.3 * heat).toFixed(3)})`);
    glow.addColorStop(0.5, `rgba(255,150,60,${(0.16 * heat).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, gr, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.theta);
  ctx.scale(geom.scale, geom.scale);

  // propulseurs (bells)
  drawBell(1);
  drawBell(-1);

  // trains d'atterrissage
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#57657c';
  ctx.lineWidth = 0.24;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 1.65, -0.95);
    ctx.lineTo(side * 2.9, -2.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 2.15, -1.05);
    ctx.lineTo(side * 2.9, -2.55);
    ctx.strokeStyle = '#3f4b5f';
    ctx.lineWidth = 0.14;
    ctx.stroke();
    ctx.fillStyle = '#8b99ad';
    ctx.beginPath();
    ctx.ellipse(side * 2.9, -2.58, 0.46, 0.13, 0, 0, TAU);
    ctx.fill();
  }

  // coque
  const bodyGrad = ctx.createLinearGradient(-2.6, 2.6, 2.6, -1.2);
  bodyGrad.addColorStop(0, '#e2eaf6');
  bodyGrad.addColorStop(0.42, '#b6c3d6');
  bodyGrad.addColorStop(1, '#6d7c92');
  ctx.beginPath();
  ctx.moveTo(-2.55, 0.8);
  ctx.lineTo(-2.0, 2.0);
  ctx.lineTo(-0.85, 2.52);
  ctx.lineTo(0.85, 2.52);
  ctx.lineTo(2.0, 2.0);
  ctx.lineTo(2.55, 0.8);
  ctx.lineTo(2.5, -0.55);
  ctx.lineTo(1.9, -1.15);
  ctx.lineTo(-1.9, -1.15);
  ctx.lineTo(-2.5, -0.55);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(18,26,38,0.75)';
  ctx.lineWidth = 0.1;
  ctx.stroke();

  // panneaux
  ctx.strokeStyle = 'rgba(70,88,110,0.45)';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-1.55, -1.05); ctx.lineTo(-1.55, 1.75);
  ctx.moveTo(1.55, -1.05); ctx.lineTo(1.55, 1.75);
  ctx.moveTo(-1.55, 0.75); ctx.lineTo(1.55, 0.75);
  ctx.stroke();

  // feuille dorée
  ctx.fillStyle = 'rgba(216,167,90,0.85)';
  ctx.beginPath();
  ctx.moveTo(-2.42, 0.35);
  ctx.lineTo(-1.75, 0.75);
  ctx.lineTo(-1.75, 1.65);
  ctx.lineTo(-2.24, 1.7);
  ctx.closePath();
  ctx.fill();

  // hublot
  const winGrad = ctx.createLinearGradient(0, 1.0, 0, 2.15);
  winGrad.addColorStop(0, '#0d2033');
  winGrad.addColorStop(0.5, '#2a6f96');
  winGrad.addColorStop(1, '#8fe6ff');
  ctx.beginPath();
  ctx.moveTo(-0.95, 1.05);
  ctx.quadraticCurveTo(0, 2.35, 0.95, 1.05);
  ctx.closePath();
  ctx.fillStyle = winGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,25,38,0.85)';
  ctx.lineWidth = 0.12;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-0.32, 1.55, 0.18, 0.3, -0.5, 0, TAU);
  ctx.fill();

  // bande et petites lumières
  ctx.fillStyle = 'rgba(30,40,55,0.5)';
  ctx.fillRect(-1.6, -0.85, 3.2, 0.28);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 6);
  ctx.fillStyle = `rgba(255,90,90,${0.4 + 0.6 * blink})`;
  ctx.beginPath();
  ctx.arc(0, 2.62, 0.14, 0, TAU);
  ctx.fill();

  // antenne
  ctx.strokeStyle = '#aab7c9';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.95, 2.2);
  ctx.lineTo(1.35, 3.4);
  ctx.stroke();
  ctx.fillStyle = '#c8d6e6';
  ctx.beginPath();
  ctx.arc(1.35, 3.42, 0.18, 0, TAU);
  ctx.fill();

  // RCS visuel
  const rcs = clamp(-game.rcsK * ship.theta - game.rcsC * ship.omega, -game.rcsMax, game.rcsMax);
  if (Math.abs(rcs) > game.rcsMax * 0.18) {
    const side = rcs > 0 ? -1 : 1;
    const puff = 0.4 + 0.6 * Math.random();
    ctx.fillStyle = `rgba(200,235,255,${0.14 * puff})`;
    ctx.beginPath();
    ctx.arc(side * 2.7, 1.7, 0.26 * puff, 0, TAU);
    ctx.fill();
  }

  drawFlames();

  // ombre / halo du vaisseau
  ctx.restore();
}

function drawBell(side) {
  // side = 1 : propulseur droit (pousse à gauche), -1 : gauche
  ctx.save();
  ctx.translate(side * SHIP_BASE.nozzle.x, SHIP_BASE.nozzle.y);
  const dirX = side * SHIP_BASE.dirL.x;
  const dirY = -SHIP_BASE.dirL.y;
  const ang = Math.atan2(-dirX, dirY);
  ctx.rotate(ang);
  ctx.fillStyle = '#4a5568';
  ctx.beginPath();
  ctx.moveTo(-0.34, 0);
  ctx.lineTo(0.34, 0);
  ctx.lineTo(0.56, 0.85);
  ctx.lineTo(-0.56, 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#202834';
  ctx.beginPath();
  ctx.ellipse(0, 0.85, 0.56, 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFlames() {
  const t = game.time;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const engines = [
    { on: ship.thrustR > 0 && ship.fuel > 0, side: -1, phase: 0 },
    { on: ship.thrustL > 0 && ship.fuel > 0, side: 1, phase: 1.7 }
  ];

  for (const e of engines) {
    if (!e.on) continue;
    const nx = e.side * SHIP_BASE.nozzle.x;
    const ny = SHIP_BASE.nozzle.y;
    const dx = e.side * SHIP_BASE.dirL.x;
    const dy = -SHIP_BASE.dirL.y;
    const ox = nx + dx * 0.8;
    const oy = ny + dy * 0.8;
    const flick = 0.82 + 0.18 * Math.sin(t * 47 + e.phase) + 0.1 * Math.sin(t * 91 + e.phase * 2);
    const len = 5.0 * flick + Math.random() * 0.9;
    const wid = 0.34 * (0.85 + 0.15 * Math.random());
    const px = -dy, py = dx;

    // halo
    const glow = ctx.createRadialGradient(ox, oy, 0.1, ox, oy, 2.2);
    glow.addColorStop(0, 'rgba(255,175,80,0.32)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ox, oy, 2.2, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ox + px * wid, oy + py * wid);
    ctx.quadraticCurveTo(
      ox + dx * len * 0.6 + px * wid * 2.0,
      oy + dy * len * 0.6 + py * wid * 2.0,
      ox + dx * len,
      oy + dy * len
    );
    ctx.quadraticCurveTo(
      ox + dx * len * 0.6 - px * wid * 2.0,
      oy + dy * len * 0.6 - py * wid * 2.0,
      ox - px * wid,
      oy - py * wid
    );
    ctx.closePath();
    const fg = ctx.createLinearGradient(ox, oy, ox + dx * len, oy + dy * len);
    fg.addColorStop(0, 'rgba(255,245,215,0.95)');
    fg.addColorStop(0.35, 'rgba(255,170,70,0.75)');
    fg.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = fg;
    ctx.fill();

    // cœur bleu
    ctx.beginPath();
    ctx.moveTo(ox + px * wid * 0.38, oy + py * wid * 0.38);
    ctx.lineTo(ox + dx * len * 0.62, oy + dy * len * 0.62);
    ctx.lineTo(ox - px * wid * 0.38, oy - py * wid * 0.38);
    ctx.closePath();
    ctx.fillStyle = 'rgba(170,225,255,0.8)';
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'spark') {
      ctx.fillStyle = `rgba(255,225,170,${(a * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.55, 0, TAU);
      ctx.fill();
    } else {
      const c = a > 0.6 ? '255,230,170' : a > 0.3 ? '255,150,60' : '200,70,40';
      ctx.fillStyle = `rgba(${c},${(a * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  for (const d of dust) {
    const a = clamp(d.life / d.max, 0, 1) * 0.22;
    ctx.fillStyle = `rgba(170,190,205,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawTrajectory() {
  if (game.mode !== 'flying') return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const steps = 18;
  const h = 0.34;
  for (let i = 1; i <= steps; i++) {
    const t = i * h;
    const x = ship.x + ship.vx * t;
    const y = ship.y + ship.vy * t - 0.5 * game.planet.gravity * t * t;
    if (x < 0 || x > WORLD.w || y < 0) break;
    const a = 0.34 * (1 - i / (steps + 2));
    ctx.fillStyle = `rgba(150,220,255,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.26, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------------------------------------------------------
   HUD
   -------------------------------------------------------------------------- */

function rr(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function panelBox(x, y, w, h, alpha = 0.58) {
  ctx.fillStyle = `rgba(5,10,18,${alpha})`;
  rr(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,190,220,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function hudText(text, x, y, size, color, align = 'left', weight = 500, mono = true) {
  ctx.font = `${weight} ${size}px ${mono ? '"Cascadia Mono", Consolas, monospace' : '"Segoe UI", sans-serif'}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

const COL = {
  ink: '#e8eef8',
  muted: '#8fa0b8',
  dim: '#5f7088',
  accent: '#63e6c0',
  amber: '#ffc46b',
  red: '#ff5d6c'
};

function fmtSpeed(v) {
  const s = Math.abs(v) < 0.05 ? 0 : v;
  return (s > 0 ? '+' : '') + s.toFixed(2);
}

function drawHUD() {
  if (game.mode === 'title' || game.mode === 'config') return;
  const small = W < 760;
  const pad = terrain.pad;
  const diff = game.diff;
  const alt = Math.max(0, ship.y - groundHeight(ship.x));
  const vx = ship.vx;
  const vy = ship.vy;
  const speed = Math.hypot(vx, vy);
  const fuelFrac = clamp(ship.fuel / game.fuelCap, 0, 1);
  const timeStr = `${String(Math.floor(game.missionTime / 60)).padStart(1, '0')}:${String(Math.floor(game.missionTime % 60)).padStart(2, '0')}`;

  /* --- mission --- */
  const px = 16, py = 14, pw = small ? 188 : 228;
  panelBox(px, py, pw, 70);
  hudText('SÉLÉNÉ 7', px + 12, py + 19, 11, COL.accent, 'left', 700);
  hudText(diff.label, px + pw - 12, py + 19, 10, COL.muted, 'right', 600);
  hudText(`${game.planet.name.toUpperCase()} · ${game.shipDef.name.toUpperCase()}`, px + 12, py + 35, 8.5, COL.dim, 'left', 600);
  hudText(timeStr, px + 12, py + 58, 20, COL.ink, 'left', 600);
  hudText(`TENT. ${game.attempts}`, px + pw - 12, py + 57, 10, COL.muted, 'right', 500);

  /* --- fuel --- */
  panelBox(px, py + 78, pw, 46);
  hudText('CARBURANT', px + 12, py + 96, 9.5, COL.muted, 'left', 600);
  hudText(`${ship.fuel.toFixed(1)} kg`, px + pw - 12, py + 96, 10, fuelFrac < 0.18 ? COL.red : COL.ink, 'right', 600);
  const barX = px + 12, barY = py + 103, barW = pw - 24, barH = 9;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  rr(barX, barY, barW, barH, 4); ctx.fill();
  if (fuelFrac > 0) {
    const fg = fuelFrac > 0.45 ? COL.accent : fuelFrac > 0.2 ? COL.amber : COL.red;
    ctx.fillStyle = fg;
    rr(barX, barY, Math.max(3, barW * fuelFrac), barH, 4); ctx.fill();
    if (fuelFrac > 0.25) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(barX + 1, barY + 1, Math.max(2, barW * fuelFrac - 2), 2.5, 1.4); ctx.fill();
    }
  }

  /* --- cible / distance --- */
  const padCx = (pad.x1 + pad.x2) / 2;
  const dist = Math.hypot(padCx - ship.x, pad.y - ship.y);
  const labelW = small ? 178 : 232;
  const lx = W / 2 - labelW / 2;
  panelBox(lx, 14, labelW, 34, 0.5);
  const dir = padCx > ship.x ? '→' : '←';
  hudText(`ZONE ${dir} ${Math.round(dist)} m`, W / 2, 36, 12, COL.ink, 'center', 600);

  /* --- données de vol --- */
  const dh = 131, dw = small ? 200 : 228;
  const dx = 16, dy = H - 16 - dh;
  panelBox(dx, dy, dw, dh);
  hudText('DONNÉES DE VOL', dx + 12, dy + 18, 9.5, COL.muted, 'left', 600);
  const rows = [
    { l: 'ALTITUDE', v: `${alt.toFixed(1)} m`, c: COL.ink },
    { l: 'V. VERTICALE', v: `${fmtSpeed(vy)} m/s`, c: Math.abs(vy) > game.tolVy ? COL.red : Math.abs(vy) > game.tolVy * 0.72 ? COL.amber : COL.accent },
    { l: 'V. HORIZONTALE', v: `${fmtSpeed(vx)} m/s`, c: Math.abs(vx) > game.tolVx ? COL.red : Math.abs(vx) > game.tolVx * 0.72 ? COL.amber : COL.accent },
    { l: 'INCLINAISON', v: `${(ship.theta * DEG).toFixed(1)}°`, c: Math.abs(ship.theta) * DEG > game.tolTilt ? COL.red : COL.muted },
    game.planet.density > 0
      ? { l: 'FREINAGE AIR', v: `${game.dragAcc.toFixed(2)} m/s²`, c: game.dragAcc > 0.4 ? COL.amber : COL.muted }
      : { l: 'ATMOSPHÈRE', v: atmoLabel(game.planet.density), c: COL.muted }
  ];
  rows.forEach((r, i) => {
    const ry = dy + 38 + i * 19;
    hudText(r.l, dx + 12, ry, 9.5, COL.dim, 'left', 500);
    hudText(r.v, dx + dw - 12, ry, 11, r.c, 'right', 600);
  });

  /* --- propulseurs --- */
  const tw = small ? 170 : 196, th = 84;
  const tx = W - 16 - tw, ty = H - 16 - th;
  panelBox(tx, ty, tw, th);
  hudText(game.invert ? 'PROPULSEURS · INV' : 'PROPULSEURS', tx + 12, ty + 18, 9.5, game.invert ? COL.accent : COL.muted, 'left', 600);
  const bars = [
    { key: game.invert ? '→' : '←', on: ship.thrustL > 0 },
    { key: game.invert ? '←' : '→', on: ship.thrustR > 0 }
  ];
  bars.forEach((b, i) => {
    const by = ty + 32 + i * 22;
    ctx.fillStyle = b.on ? 'rgba(99,230,192,0.18)' : 'rgba(255,255,255,0.05)';
    rr(tx + 12, by, 22, 16, 4); ctx.fill();
    ctx.strokeStyle = b.on ? 'rgba(99,230,192,0.75)' : 'rgba(160,190,220,0.2)';
    ctx.lineWidth = 1;
    rr(tx + 12, by, 22, 16, 4); ctx.stroke();
    hudText(b.key, tx + 23, by + 12, 11, b.on ? COL.accent : COL.muted, 'center', 600);

    const bx = tx + 42, bw = tw - 54;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    rr(bx, by + 4, bw, 8, 3); ctx.fill();
    if (b.on) {
      ctx.fillStyle = COL.accent;
      rr(bx, by + 4, bw * 0.92, 8, 3); ctx.fill();
    }
  });

  /* --- minimap --- */
  drawMinimap(small);

  /* --- marqueur de zone --- */
  drawPadMarker(padCx);

  /* --- alertes --- */
  const alerts = [];
  const nearPad = alt < 90 || dist < 150;
  if (game.mode === 'flying') {
    if (game.ready) {
      alerts.push({ t: '▲  PRÊT — POUSSEZ POUR DÉCOLLER', c: COL.accent });
    } else {
      if (nearPad && Math.abs(vy) > game.tolVy) alerts.push({ t: '▼  VITESSE VERTICALE', c: COL.red });
      if (nearPad && Math.abs(vx) > game.tolVx) alerts.push({ t: '◀  VITESSE HORIZONTALE', c: COL.amber });
      if (fuelFrac < 0.18) alerts.push({ t: '▲  CARBURANT BAS', c: COL.red });
      if (nearPad && Math.abs(ship.theta) * DEG > game.tolTilt) alerts.push({ t: '◎  ASSIETTE', c: COL.amber });
    }
  }
  const blink = 0.55 + 0.45 * Math.sin(game.time * 7);
  alerts.slice(0, 2).forEach((a, i) => {
    ctx.globalAlpha = blink;
    hudText(a.t, W / 2, 72 + i * 20, 12, a.c, 'center', 700);
    ctx.globalAlpha = 1;
  });

  /* --- confirmation d'inversion --- */
  const invSince = game.time - game.invertToastAt;
  if (game.mode !== 'title' && invSince >= 0 && invSince < 2) {
    ctx.globalAlpha = clamp(1 - invSince / 2, 0, 1);
    hudText(game.invert ? '⇄  PROPULSEURS INVERSÉS' : '⇄  PROPULSEURS NORMAUX', W / 2, 110, 11, COL.accent, 'center', 600);
    ctx.globalAlpha = 1;
  }
  /* --- rappel commandes --- */
  if (game.mode === 'flying' && game.missionTime < 16) {
    const a = clamp(1 - Math.max(0, game.missionTime - 11) / 5, 0, 1) * 0.65;
    ctx.globalAlpha = a;
    hudText('← →  POUSSÉE LATÉRALE    ·    ESPACE  LES DEUX    ·    P  PAUSE', W / 2, H - 18, 10, COL.muted, 'center', 500);
    ctx.globalAlpha = 1;
  }
}

function drawPadMarker(padCx) {
  const pad = terrain.pad;
  const pal = game.planet.pal;
  const s = w2s(padCx, pad.y);
  const dist = Math.hypot(padCx - ship.x, pad.y - ship.y);
  const onScreen = s.x > 30 && s.x < W - 30 && s.y > 90 && s.y < H - 120;

  if (onScreen) {
    const w = clamp(pad.w * cam.scale * 0.5 + 18, 26, 90);
    const y = s.y - 16;
    ctx.strokeStyle = hexRgba(pal.pad, 0.7);
    ctx.lineWidth = 1.5;
    const b = 9;
    ctx.beginPath();
    ctx.moveTo(s.x - w, y + b); ctx.lineTo(s.x - w, y); ctx.lineTo(s.x - w + b, y);
    ctx.moveTo(s.x + w - b, y); ctx.lineTo(s.x + w, y); ctx.lineTo(s.x + w, y + b);
    ctx.stroke();
    hudText('ZONE D\'ATTERRISSAGE', s.x, y - 8, 9.5, hexRgba(pal.pad, 0.9), 'center', 600);
    return;
  }

  // indicateur hors écran
  const cx = W / 2, cy = H / 2;
  const ang = Math.atan2(s.y - cy, s.x - cx);
  const margin = 58;
  const rx = Math.min(W / 2 - margin, Math.abs(Math.cos(ang)) > 1e-4 ? (W / 2 - margin) : Infinity);
  const ry = Math.min(H / 2 - margin - 40, H / 2 - margin);
  const ex = clamp(cx + Math.cos(ang) * (W / 2 - margin), margin, W - margin);
  const ey = clamp(cy + Math.sin(ang) * (H / 2 - margin - 40), 100, H - margin);
  const distTxt = `${Math.round(dist)} m`;

  ctx.save();
  ctx.translate(ex, ey);
  const rot = Math.atan2(Math.sin(ang), Math.cos(ang));
  ctx.rotate(rot);
  ctx.fillStyle = hexRgba(pal.pad, 0.9);
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  hudText(distTxt, ex, ey + 26, 10, hexRgba(pal.pad, 0.9), 'center', 600);
}

function drawMinimap(small) {
  const mw = small ? 156 : 210;
  const mh = small ? 74 : 96;
  const mx = W - 16 - mw;
  const my = 14;
  panelBox(mx, my, mw, mh, 0.5);

  const innerPad = 8;
  const iw = mw - innerPad * 2;
  const ih = mh - innerPad * 2;
  const maxY = 250;
  const toX = (x) => mx + innerPad + (x / WORLD.w) * iw;
  const toY = (y) => my + innerPad + ih - (y / maxY) * ih;

  hudText('CARTE', mx + 10, my + 15, 8.5, COL.muted, 'left', 600);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mx + innerPad, my + innerPad + 4, iw, ih - 4);
  ctx.clip();

  ctx.beginPath();
  ctx.moveTo(toX(0), my + innerPad + ih);
  for (const p of terrain.pts) ctx.lineTo(toX(p.x), toY(p.y));
  ctx.lineTo(toX(WORLD.w), my + innerPad + ih);
  ctx.closePath();
  ctx.fillStyle = 'rgba(30,45,66,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,220,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(toX(terrain.pts[0].x), toY(terrain.pts[0].y));
  for (const p of terrain.pts) ctx.lineTo(toX(p.x), toY(p.y));
  ctx.stroke();

  // plateforme cible
  ctx.fillStyle = hexRgba(game.planet.pal.pad, 1);
  const px1 = toX(terrain.pad.x1), px2 = toX(terrain.pad.x2), py = toY(terrain.pad.y);
  ctx.fillRect(px1, py - 2, Math.max(4, px2 - px1), 3);

  // vaisseau
  if (ship.alive) {
    const sx = toX(clamp(ship.x, 0, WORLD.w));
    const sy = toY(clamp(ship.y, 0, maxY));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(sx, sy, 5 + (Math.sin(game.time * 4) + 1) * 1.5, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* ----------------------------------------------------------------------------
   Boucle principale, entrées, démarrage
   -------------------------------------------------------------------------- */

function newSeed() {
  return (Math.random() * 1e9) | 0;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  drawSky();

  const shx = (Math.random() - 0.5) * cam.shake * 16;
  const shy = (Math.random() - 0.5) * cam.shake * 16;

  ctx.save();
  ctx.translate(W / 2 + shx, H / 2 + shy);
  ctx.scale(cam.scale, -cam.scale);
  ctx.translate(-cam.x, -cam.y);

  drawTerrain();
  drawTrajectory();
  drawParticles();
  drawShip();

  ctx.restore();

  // vignettage
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawHUD();
}

function clearKeys() {
  game.keys.left = false;
  game.keys.right = false;
  game.keys.both = false;
  game.thrusterLevel = 0;
  sfx.setEngine(0);
}

function pauseGame() {
  if (game.mode !== 'flying') return;
  game.mode = 'paused';
  clearKeys();
  showPanel('panelPause');
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'flying';
  hidePanels();
  sfx.init();
  sfx.blip();
}

function retryMission() {
  startMission(game.diff.id, game.seed, true);
}

function nextMission() {
  startMission(game.diff.id, newSeed(), false);
}

function goToMenu() {
  clearKeys();
  sfx.setEngine(0);
  game.result = null;
  game.pausedFrom = null;
  initTitleScene();
  showPanel('panelTitle');
  updateTitleSummary();
  refreshBestTitle();
  sfx.blip();
}

/* ----------------------------------------------------------------------------
   Configuration : rendu de l'interface
   -------------------------------------------------------------------------- */

const el = (id) => document.getElementById(id);

function planetCardHTML(p) {
  const g = p.id === 'custom' ? config.customPlanet.gravity : p.gravity;
  const d = p.id === 'custom' ? config.customPlanet.density : p.density;
  const meta = p.id === 'custom'
    ? `${fmtNum(g)} m/s² · ${atmoLabel(d)}`
    : `${fmtNum(p.gravity)} m/s² · ${atmoLabel(p.density)}`;
  return `<button class="pick${config.planetId === p.id ? ' selected' : ''}" data-planet="${p.id}" type="button">
      <span class="pick-name">${p.name}</span>
      <span class="pick-meta">${meta}</span>
    </button>`;
}

function shipCardHTML(s) {
  const mass = s.id === 'custom' ? config.customShip.dryMass : s.dryMass;
  const push = s.id === 'custom' ? config.customShip.thrust : s.thrust;
  const meta = `${mass} kg · ${push} N`;
  return `<button class="pick${config.shipId === s.id ? ' selected' : ''}" data-ship="${s.id}" type="button">
      <span class="pick-name">${s.name}</span>
      <span class="pick-meta">${meta}</span>
    </button>`;
}

function shipStatsHTML() {
  const p = resolvePlanet();
  const s = resolveShip();
  const k = p.gravity / BASE_GRAVITY;
  const cap = s.fuel * game.diff.fuelMul * k;
  const m0 = s.dryMass + cap;
  const thrustTotal = 2 * s.thrust * k;
  const twr = thrustTotal / (m0 * p.gravity);
  const dv = 240 * G0 * Math.log(m0 / s.dryMass);
  const burn = cap / (2 * s.thrust * k / (240 * G0));
  return `Masse au départ <b>${Math.round(m0)} kg</b> · Poussée totale <b>${Math.round(thrustTotal)} N</b> · T/P <b>${twr.toFixed(1)}</b><br>` +
         `Δv <b>${Math.round(dv)} m/s</b> · Autonomie <b>${burn.toFixed(0)} s</b> · Carburant embarqué <b>${cap.toFixed(0)} kg</b>`;
}

function configSummaryText() {
  const p = resolvePlanet();
  const s = resolveShip();
  return `MONDE · ${p.name} — gravité ${fmtNum(p.gravity)} m/s², atmosphère ${atmoLabel(p.density).toLowerCase()}` +
         ` (${fmtNum(p.density)} kg/m³)<br>` +
         `VAISSEAU · ${s.name} — ${s.dryMass} kg à sec, ${s.thrust} N par propulseur<br>` +
         `DIFFICULTÉ · ${game.diff.label}`;
}

function updateTitleSummary() {
  const p = resolvePlanet();
  const s = resolveShip();
  const a = el('sumPlanet');
  const b = el('sumShip');
  const c = el('sumAtmo');
  if (a) a.textContent = p.name;
  if (b) b.textContent = s.name;
  if (c) c.textContent = atmoLabel(p.density);
}

function updateDiffSelection() {
  document.querySelectorAll('[data-diff]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.diff === config.diffId);
  });
}

function renderConfigUI() {
  const pc = el('planetCards');
  if (pc) pc.innerHTML = Object.values(PLANETS).map(planetCardHTML).join('');
  const sc = el('shipCards');
  if (sc) sc.innerHTML = Object.values(SHIPS).map(shipCardHTML).join('');

  const pd = el('planetDesc');
  if (pd) pd.textContent = resolvePlanet().desc;
  const sd = el('shipDesc');
  if (sd) sd.textContent = resolveShip().desc;

  const pcu = el('planetCustom');
  if (pcu) pcu.classList.toggle('hidden', config.planetId !== 'custom');
  const scu = el('shipCustom');
  if (scu) scu.classList.toggle('hidden', config.shipId !== 'custom');

  const grav = config.customPlanet.gravity;
  const dens = config.customPlanet.density;
  const gr = el('gravRange');
  if (gr) gr.value = String(grav);
  const go = el('gravOut');
  if (go) go.textContent = fmtNum(grav);
  const dr = el('densRange');
  if (dr) dr.value = String(dens);
  const doo = el('densOut');
  if (doo) doo.textContent = fmtNum(dens);

  const mass = config.customShip.dryMass;
  const push = config.customShip.thrust;
  const fuel = config.customShip.fuel;
  const mr = el('massRange');
  if (mr) mr.value = String(mass);
  const mo = el('massOut');
  if (mo) mo.textContent = String(mass);
  const tr = el('thrustRange');
  if (tr) tr.value = String(push);
  const to = el('thrustOut');
  if (to) to.textContent = String(push);
  const fr = el('fuelRange');
  if (fr) fr.value = String(fuel);
  const fo = el('fuelOut');
  if (fo) fo.textContent = String(fuel);

  const stats = el('shipStats');
  if (stats) stats.innerHTML = shipStatsHTML();
  const sum = el('configSummary');
  if (sum) sum.innerHTML = configSummaryText();

  updateDiffSelection();
  updateTitleSummary();
}

/* --- application d'un changement de configuration --- */

function applyConfigChange() {
  applyMissionSetup(game.diff);
  if (terrain) {
    terrain = genTerrain(game.seed || (game.seed = newSeed()), game.diff);
    resetShipToStart();
    cam.x = ship.x;
    cam.y = ship.y + 8;
    cam.scale = 6;
  }
  renderConfigUI();
  refreshBestTitle();
}

function selectDiff(id) {
  if (!DIFFICULTIES[id]) return;
  config.diffId = id;
  game.diff = DIFFICULTIES[id];
  saveConfig();
  applyConfigChange();
  sfx.blip();
}

function openConfig() {
  game.mode = 'config';
  renderConfigUI();
  showPanel('panelConfig');
}

function closeConfig() {
  game.mode = 'title';
  showPanel('panelTitle');
  updateTitleSummary();
  refreshBestTitle();
}

/* ----------------------------------------------------------------------------
   Entrées clavier
   -------------------------------------------------------------------------- */

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ' || k === 'Spacebar' ||
      k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
  }
  if (e.repeat) {
    // les touches de poussée restent actives, les actions uniques sont ignorées
    if (game.mode === 'flying') {
      if (k === 'ArrowLeft') game.keys.left = true;
      if (k === 'ArrowRight') game.keys.right = true;
      if (k === ' ' || k === 'Spacebar') game.keys.both = true;
    }
    return;
  }

  sfx.init();

  if (k === 'm' || k === 'M') {
    sfx.muted = !sfx.muted;
    if (sfx.muted) sfx.setEngine(0);
    sfx.blip();
    return;
  }

  if (k === 'i' || k === 'I') {
    setInvert(!game.invert, true);
    return;
  }

  const mode = game.mode;

  if (mode === 'flying') {
    if (k === 'ArrowLeft') game.keys.left = true;
    if (k === 'ArrowRight') game.keys.right = true;
    if (k === ' ' || k === 'Spacebar') {
      game.keys.both = true;
      game.keys.left = false;
      game.keys.right = false;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') pauseGame();
    else if (k === 'r' || k === 'R') retryMission();
    return;
  }

  if (mode === 'paused') {
    if (k === 'p' || k === 'P' || k === 'Escape') resumeGame();
    else if (k === 'r' || k === 'R') retryMission();
    return;
  }

  if (mode === 'landed' || mode === 'crashed') {
    if (k === 'r' || k === 'R') retryMission();
    else if (k === 'n' || k === 'N' || k === 'Enter') nextMission();
    else if (k === 'Escape') goToMenu();
    return;
  }

  if (mode === 'config') {
    if (k === 'Escape' || k === 'Backspace' || k === 'c' || k === 'C') closeConfig();
    else if (k === 'Enter') startMission(config.diffId, newSeed(), false);
    return;
  }

  if (mode === 'title') {
    if (k === '1') selectDiff('easy');
    else if (k === '2') selectDiff('normal');
    else if (k === '3') selectDiff('hard');
    else if (k === 'c' || k === 'C') openConfig();
    else if (k === 'Enter' || k === ' ') startMission(config.diffId, newSeed(), false);
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft') game.keys.left = false;
  if (k === 'ArrowRight') game.keys.right = false;
  if (k === ' ' || k === 'Spacebar') game.keys.both = false;
});

window.addEventListener('blur', () => {
  clearKeys();
  if (game.mode === 'flying') pauseGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'flying') pauseGame();
});

/* ----------------------------------------------------------------------------
   Boutons de l'interface
   -------------------------------------------------------------------------- */

document.addEventListener('click', (e) => {
  const diffBtn = e.target.closest('[data-diff]');
  if (diffBtn) {
    sfx.init();
    diffBtn.blur();
    selectDiff(diffBtn.dataset.diff);
    return;
  }
  const planetBtn = e.target.closest('[data-planet]');
  if (planetBtn) {
    sfx.init();
    config.planetId = planetBtn.dataset.planet;
    saveConfig();
    applyConfigChange();
    sfx.blip();
    return;
  }
  const shipBtn = e.target.closest('[data-ship]');
  if (shipBtn) {
    sfx.init();
    config.shipId = shipBtn.dataset.ship;
    saveConfig();
    applyConfigChange();
    sfx.blip();
  }
});

const btnRetry = el('btnRetry');
const btnNext = el('btnNext');
if (btnRetry) btnRetry.addEventListener('click', () => { sfx.init(); retryMission(); });
if (btnNext) btnNext.addEventListener('click', () => { sfx.init(); nextMission(); });

const btnResume = el('btnResume');
if (btnResume) btnResume.addEventListener('click', () => { sfx.init(); resumeGame(); });

const btnPauseMenu = el('btnPauseMenu');
if (btnPauseMenu) btnPauseMenu.addEventListener('click', () => { sfx.init(); goToMenu(); });

const btnResultMenu = el('btnResultMenu');
if (btnResultMenu) btnResultMenu.addEventListener('click', () => { sfx.init(); goToMenu(); });

const invertBtn = el('invertBtn');
if (invertBtn) {
  invertBtn.addEventListener('click', () => {
    setInvert(!game.invert, true);
    invertBtn.blur();
  });
}

const btnLaunch = el('btnLaunch');
if (btnLaunch) btnLaunch.addEventListener('click', () => {
  sfx.init();
  btnLaunch.blur();
  startMission(config.diffId, newSeed(), false);
});

const btnConfig = el('btnConfig');
if (btnConfig) btnConfig.addEventListener('click', () => {
  sfx.init();
  btnConfig.blur();
  openConfig();
});

const btnConfigBack = el('btnConfigBack');
if (btnConfigBack) btnConfigBack.addEventListener('click', () => {
  sfx.init();
  btnConfigBack.blur();
  closeConfig();
});

const btnConfigLaunch = el('btnConfigLaunch');
if (btnConfigLaunch) btnConfigLaunch.addEventListener('click', () => {
  sfx.init();
  btnConfigLaunch.blur();
  startMission(config.diffId, newSeed(), false);
});

/* --- curseurs de réglage --- */

function bindRange(id, apply) {
  const input = el(id);
  if (!input) return;
  input.addEventListener('input', () => {
    apply(parseFloat(input.value));
    saveConfig();
    applyConfigChange();
  });
}

bindRange('gravRange', (v) => {
  config.customPlanet.gravity = clamp(v || 0, 0.4, 12);
  config.planetId = 'custom';
});
bindRange('densRange', (v) => {
  config.customPlanet.density = clamp(v || 0, 0, 6);
  config.planetId = 'custom';
});
bindRange('massRange', (v) => {
  config.customShip.dryMass = clamp(v || 400, 400, 2000);
  config.shipId = 'custom';
});
bindRange('thrustRange', (v) => {
  config.customShip.thrust = clamp(v || 1200, 1200, 7000);
  config.shipId = 'custom';
});
bindRange('fuelRange', (v) => {
  config.customShip.fuel = clamp(v || 40, 40, 220);
  config.shipId = 'custom';
});

/* ----------------------------------------------------------------------------
   Scène d'accueil
   -------------------------------------------------------------------------- */

function initTitleScene() {
  game.seed = newSeed();
  game.diff = DIFFICULTIES[config.diffId] || DIFFICULTIES.normal;
  applyMissionSetup(game.diff);
  terrain = genTerrain(game.seed, game.diff);
  resetShipToStart();
  game.mode = 'title';
  game.missionTime = 0;
  game.attempts = 0;
  cam.x = ship.x;
  cam.y = ship.y + 8;
  cam.scale = 6;
  updateTitleSummary();
  updateDiffSelection();
  refreshBestTitle();
}

/* ----------------------------------------------------------------------------
   Boucle à pas fixe
   -------------------------------------------------------------------------- */

const FIXED_DT = 1 / 240;
let accumulator = 0;
let lastFrame = 0;

function frame(now) {
  if (!lastFrame) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.1) dt = 0.1;

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 24) {
    stepPhysics(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= 24) accumulator = 0;

  if (game.mode !== 'paused' && game.mode !== 'title' && game.mode !== 'config') {
    updateParticles(dt);
  }
  updateCamera(dt);
  render();

  requestAnimationFrame(frame);
}

resize();
loadSettings();
loadConfig();
initTitleScene();
showPanel('panelTitle');
requestAnimationFrame(frame);



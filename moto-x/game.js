'use strict';

/* ============================================================================
   MOTO-X — jeu de moto trial 2D en vue de côté (esprit Elastomania)
   Physique : corps rigide (châssis + 2 roues soudées), contacts à impulsion
   sur un terrain en polyligne, adhérence de Coulomb, couple moteur avec
   glissement, freinage des deux roues, équilibre du pilote.
   Le casque au sol = crash : le niveau redémarre à zéro. Pas de dépendance.
   ========================================================================== */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const approachRate = (dt, k) => 1 - Math.exp(-k * dt);
const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};

/* ----------------------------------------------------------------------------
   Audio (moteur + impacts)
   -------------------------------------------------------------------------- */

const sfx = {
  ctx: null, master: null,
  engineOsc: null, engineGain: null, engineFilter: null, noiseBuf: null,
  muted: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 400;
      flt.Q.value = 2;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(flt); flt.connect(g); g.connect(this.master);
      osc.start();
      this.engineOsc = osc; this.engineGain = g; this.engineFilter = flt;
      const len = Math.floor(ctx.sampleRate * 0.4);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) {
      this.ctx = null;
    }
  },

  setEngine(throttle, omega) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = this.muted ? 0 : 0.028 + throttle * 0.1;
    this.engineGain.gain.setTargetAtTime(target, t, 0.06);
    this.engineOsc.frequency.setTargetAtTime(46 + throttle * 30 + omega * 1.6, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + throttle * 500 + omega * 8, t, 0.08);
  },

  blip(f = 660, dur = 0.07, vol = 0.22) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  thud(vol) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(clamp(vol, 0, 0.7), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.2);
  },

  crash() { this.thud(0.6); this.blip(140, 0.3, 0.3); },

  setMuted(m) {
    this.muted = m;
    if (this.ctx && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(m ? 0 : 0.03, this.ctx.currentTime, 0.05);
    }
  }
};

/* ----------------------------------------------------------------------------
   Construction des niveaux (terrain en polyligne)
   -------------------------------------------------------------------------- */

function buildTerrain(buildFn) {
  const pts = [[0, 0]];
  let x = 0, y = 0;
  const add = (nx, ny) => {
    const lx = pts[pts.length - 1][0];
    if (nx <= lx + 0.25) nx = lx + 0.3;
    pts.push([nx, ny]);
  };
  const api = {
    // plat, avec option de dénivelé linéaire doux
    flat(len, dy = 0) {
      const n = Math.max(2, Math.round(len / 1.5));
      for (let i = 1; i <= n; i++) add(x + (len * i) / n, y + (dy * i) / n);
      x += len; y += dy;
    },
    // bosse lisse (cosinus) : monte de h puis redescend au niveau initial
    hill(len, h) {
      const n = Math.max(6, Math.round(len / 1.0));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        add(x + len * t, y + (h * (1 - Math.cos(Math.PI * t))) / 2);
      }
      x += len;
    },
    // vagues sinusoïdales (c cycles entiers, retour au niveau initial)
    wave(len, c, amp) {
      const n = Math.max(6, Math.round(len / 0.9));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        add(x + len * t, y + amp * Math.sin(Math.PI * c * t));
      }
      x += len;
    },
    // transition en S vers dy (signé)
    rampTo(len, dy) {
      const n = Math.max(3, Math.round(len / 0.8));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        add(x + len * t, y + dy * smooth(t));
      }
      x += len; y += dy;
    },
    // trou : descente, fond plat, remontée
    pit(len, depth, ramp = 0.32) {
      const l1 = Math.max(1.6, len * ramp);
      api.rampTo(l1, -depth);
      api.flat(len - 2 * l1);
      api.rampTo(l1, depth);
    },
    // chute quasi verticale
    drop(d) {
      add(x + 0.35, y - d);
      x += 0.35; y -= d;
    }
  };
  buildFn(api);
  return pts;
}

const DIFFS = ['facile', 'normal', 'difficile', 'expert'];

const LEVELS_DEF = [
  { name: 'Balade', diff: 'facile', build: (b) => {
    b.flat(10); b.hill(14, 2.2); b.flat(6); b.hill(16, 3); b.flat(8);
    b.hill(14, 2.4); b.flat(8); } },
  { name: 'Petites bosses', diff: 'facile', build: (b) => {
    b.flat(9); b.wave(14, 3, 0.55); b.flat(5); b.hill(12, 2);
    b.wave(12, 4, 0.6); b.flat(6); b.hill(13, 2.2); b.flat(8); } },
  { name: 'Vaguelettes', diff: 'facile', build: (b) => {
    b.flat(8); b.wave(18, 4, 0.85); b.flat(4); b.wave(16, 3, 1.05);
    b.flat(5); b.wave(14, 5, 0.7); b.flat(8); } },
  { name: 'Vallons', diff: 'normal', build: (b) => {
    b.flat(8); b.hill(18, 4.2); b.rampTo(9, -2.2); b.hill(16, 5);
    b.rampTo(7, 0.8); b.hill(20, 6); b.flat(9); } },
  { name: 'Contrebas', diff: 'normal', build: (b) => {
    b.flat(10); b.rampTo(8, -3); b.flat(4); b.hill(9, 2.4); b.drop(3.6);
    b.flat(3); b.rampTo(3, 0.4); b.flat(9); b.hill(12, 3); b.drop(2.2);
    b.flat(4); b.rampTo(3, 0.2); b.flat(8); } },
  { name: 'Marches', diff: 'normal', build: (b) => {
    b.flat(8);
    for (let i = 0; i < 3; i++) { b.rampTo(3.2, 1.1); b.flat(3); }
    b.flat(4);
    for (let i = 0; i < 3; i++) { b.rampTo(3.2, -1.1); b.flat(3); }
    b.flat(8); } },
  { name: 'Ravins', diff: 'difficile', build: (b) => {
    b.flat(8); b.pit(6, 3); b.flat(5); b.pit(8, 4); b.flat(5);
    b.hill(11, 2.6); b.pit(7, 4.2); b.flat(8); } },
  { name: 'Muraille', diff: 'difficile', build: (b) => {
    b.flat(8); b.rampTo(4.5, 3.4); b.flat(3); b.rampTo(4, 2.8); b.flat(3);
    b.rampTo(6, -5.2); b.wave(10, 3, 0.9); b.rampTo(4, 2.4); b.flat(4);
    b.rampTo(4, -2.4); b.flat(8); } },
  { name: 'Échiquier', diff: 'difficile', build: (b) => {
    b.flat(8); b.wave(12, 4, 1.1); b.flat(3); b.pit(7, 4); b.flat(3);
    b.wave(10, 3, 1.25); b.rampTo(6, 2.6); b.flat(3); b.pit(8, 5); b.flat(9); } },
  { name: 'Volcan', diff: 'expert', build: (b) => {
    b.flat(8); b.rampTo(5, 4.2); b.flat(3); b.pit(9, 6); b.flat(4);
    b.rampTo(5, 3.4); b.wave(12, 5, 1.3); b.flat(3); b.pit(10, 6.5);
    b.flat(3); b.rampTo(6, -4.5); b.flat(10); } },
  { name: 'Inferno', diff: 'expert', build: (b) => {
    b.flat(8); b.rampTo(4, 3.2); b.flat(2); b.rampTo(4, -3.2); b.flat(2);
    b.pit(9, 5.5); b.flat(3); b.rampTo(4.5, 3.8); b.drop(2.2); b.flat(4);
    b.wave(14, 6, 1.2); b.pit(10, 7); b.flat(4); b.rampTo(5, 4.5);
    b.flat(3); b.rampTo(5, -4.5); b.flat(10); } }
];

function compileLevel(def, idx) {
  const pts = buildTerrain(def.build);
  const last = pts[pts.length - 1];
  const goalX = last[0] - 6;
  // mur de fin (bloque le joueur après l'arrivée)
  const wn = 6, wallH = 28;
  for (let i = 1; i <= wn; i++) {
    const t = i / wn;
    pts.push([last[0] + 3.5 * t, last[1] + wallH * smooth(t)]);
  }
  // mur de gauche (bord du monde) : on retire la graine [0,0] du builder
  pts.shift();
  pts.unshift([0.04, 16], [0.8, 0]);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    segs.push({ nx: -dy / len, ny: dx / len });
  }
  return {
    idx, name: def.name, diff: def.diff, pts, segs,
    width: pts[pts.length - 1][0],
    goal: { x: goalX, y: groundAt(pts, goalX) },
    spawn: { x: 2.6, y: groundAt(pts, 2.6) + 0.641 }
  };
}

function groundAt(pts, x) {
  x = clamp(x, pts[0][0] + 1e-6, pts[pts.length - 1][0] - 1e-6);
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= x) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo], b = pts[lo + 1];
  const t = (x - a[0]) / ((b[0] - a[0]) || 1);
  return a[1] + (b[1] - a[1]) * t;
}

const LEVELS = LEVELS_DEF.map(compileLevel);

/* ----------------------------------------------------------------------------
   Sauvegarde (meilleurs temps + déblocage)
   -------------------------------------------------------------------------- */

const SAVE_KEY = 'motox.save.v1';
const save = (() => {
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (r && typeof r === 'object' && r.best) {
      return { unlocked: clamp(r.unlocked | 0 || 1, 1, LEVELS.length), best: r.best };
    }
  } catch (e) { /* localStorage indisponible */ }
  return { unlocked: 1, best: {} };
})();

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

/* ----------------------------------------------------------------------------
   État de jeu + moto (corps rigide)
   -------------------------------------------------------------------------- */

const G = 9.81, M = 130, I = 30, I_W = 0.5, WHEEL_R = 0.36;
const ENGINE_TQ = 400, OMEGA_MAX = 95, BRAKE_TQ = 360;
const MU = 1.0, RESTITUTION = 0.12;
const LEAN_GND = 520, LEAN_AIR = 700, REACT_K = 0.35;

const game = {
  mode: 'menu',          // menu | flying | paused | finished | dead
  li: 0,
  level: null,
  time: 0,
  timing: false,
  attempts: 1,
  deadT: 0,
  shake: 0,
  grounded: false
};

const bike = {
  x: 0, y: 0, vx: 0, vy: 0, th: 0, om: 0,
  dir: 1, dirVis: 1, flipCd: 0, leanVis: 0,
  wheels: [
    { lx: -0.71, ly: -0.28, om: 0, phi: 0, jn: 0, slip: 0, wasGround: false },
    { lx: 0.71, ly: -0.28, om: 0, phi: 0, jn: 0, slip: 0, wasGround: false }
  ]
};

const cam = { x: 0, y: 3, sc: 26, shakeT: 0 };
let particles = [];
let W = 1280, H = 720, DPR = 1;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  W = window.innerWidth || 1280;
  H = window.innerHeight || 720;
  DPR = clamp(window.devicePixelRatio || 1, 1, 2);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

function resetBike() {
  const L = game.level;
  bike.x = L.spawn.x; bike.y = L.spawn.y;
  bike.vx = 0; bike.vy = 0; bike.th = 0; bike.om = 0;
  bike.dir = 1; bike.dirVis = 1; bike.flipCd = 0; bike.leanVis = 0;
  for (const w of bike.wheels) {
    w.om = 0; w.phi = 0; w.jn = 0; w.slip = 0; w.wasGround = false;
  }
  particles.length = 0;
}

function startLevel(i, keep) {
  game.li = clamp(i, 0, LEVELS.length - 1);
  game.level = LEVELS[game.li];
  if (!keep) game.attempts = 1;
  game.time = 0; game.timing = false; game.deadT = 0; game.shake = 0;
  game.grounded = false;
  resetBike();
  game.mode = 'flying';
  hidePanels();
  cam.x = bike.x; cam.y = bike.y + 2; cam.shakeT = 0;
  sfx.init();
}

function restartLevel() {
  game.attempts++;
  startLevel(game.li, true);
}

/* ----------------------------------------------------------------------------
   Points fatals du corps (casque, guidon) en coordonnées locales
   -------------------------------------------------------------------------- */

const BODY_PTS = [
  { lx: 0.02, ly: 1.02, r: 0.16, name: 'casque' },
  { lx: 0.64, ly: 0.52, r: 0.07, name: 'guidon' }
];

function localToWorld(lx, ly) {
  const c = Math.cos(bike.th), s = Math.sin(bike.th);
  const x = bike.dir * lx;
  return {
    x: bike.x + c * x - s * ly,
    y: bike.y + s * x + c * ly
  };
}

/* ----------------------------------------------------------------------------
   Physique — pas fixe, contacts à impulsion
   -------------------------------------------------------------------------- */

const _samp = { y: 0, nx: 0, ny: 1 };

function sampleTerrain(x) {
  const pts = game.level.pts, segs = game.level.segs;
  x = clamp(x, pts[0][0] + 1e-6, pts[pts.length - 1][0] - 1e-6);
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= x) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo], b = pts[lo + 1], sg = segs[lo];
  const t = (x - a[0]) / ((b[0] - a[0]) || 1);
  _samp.y = a[1] + (b[1] - a[1]) * t;
  _samp.nx = sg.nx;
  _samp.ny = sg.ny;
  return _samp;
}

// contact roue : impulsion normale + impulsion de frottement (Coulomb),
// moteur et frein agissent sur la rotation de la roue (glissement réel)
function solveWheel(w, dt) {
  const b = bike;
  const wx = b.x + Math.cos(b.th) * b.dir * w.lx - Math.sin(b.th) * w.ly;
  const wy = b.y + Math.sin(b.th) * b.dir * w.lx + Math.cos(b.th) * w.ly;
  const s = sampleTerrain(wx);
  const d = s.ny * (wy - s.y);
  const pen = WHEEL_R - d;
  w.jn = 0; w.slip = 0;
  if (pen <= 0) { w.wasGround = false; return false; }

  const rx = wx - b.x, ry = wy - b.y;
  const c = Math.cos(b.th), sn = Math.sin(b.th);
  const vx = b.vx - b.om * ry;
  const vy = b.vy + b.om * rx;
  const vn = vx * s.nx + vy * s.ny;

  // impulsion normale (petite restitution, correction de position douce)
  const rn = rx * s.ny - ry * s.nx;
  const Kn = 1 / M + rn * rn / I;
  let jn = Math.max(0, -(1 + RESTITUTION) * vn / Kn);
  if (pen > 0.004) {
    const corr = Math.min(pen * 0.55, 0.05);
    b.x += s.nx * corr; b.y += s.ny * corr;
  }
  if (jn > 0) {
    b.vx += s.nx * jn / M;
    b.vy += s.ny * jn / M;
    b.om += rn * jn / I;
    w.jn = jn;
    if (!w.wasGround && jn > 1600) {
      sfx.thud(clamp(jn / 9000, 0.05, 0.6));
      game.shake = Math.max(game.shake, clamp(jn / 7000, 0, 0.45));
      spawnDust(wx, wy - WHEEL_R * 0.4, Math.min(10, Math.round(jn / 400)));
    }
  }
  w.wasGround = true;

  // frottement : cible = contact qui roule sans glisser
  const tx = s.ny, ty = -s.nx; // tangente orientée vers +x
  const vt = vx * tx + vy * ty;
  const slip = vt + w.om * WHEEL_R;
  const rt = rx * ty - ry * tx;
  const Kt = 1 / M + rt * rt / I + (WHEEL_R * WHEEL_R) / I_W;
  let jt = -slip / Kt;
  const maxF = MU * jn;
  jt = clamp(jt, -maxF, maxF);
  b.vx += tx * jt / M;
  b.vy += ty * jt / M;
  b.om += rt * jt / I;
  w.om += WHEEL_R * jt / I_W;
  w.slip = slip;
  return true;
}

function stepPhysics(dt) {
  if (game.mode !== 'flying') return;
  const b = bike;
  b.flipCd = Math.max(0, b.flipCd - dt);

  // équilibre : gauche = lever l'avant, droite = l'avant vers le bas
  const lean = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  let tq = lean * (game.grounded ? LEAN_GND : LEAN_AIR) * b.dir;

  // moteur : la roue arrière est entraînée (limiteur de régime : au-delà,
  // le moteur ne débite plus, donc plus de couple de réaction non plus)
  const te = keys.up && Math.abs(b.wheels[0].om) < OMEGA_MAX ? ENGINE_TQ : 0;
  if (te > 0) {
    b.wheels[0].om += (-b.dir * te * dt) / I_W;
    tq += b.dir * te * REACT_K;
  }

  // frein des deux roues
  if (keys.down) {
    const dOm = (BRAKE_TQ * dt) / I_W;
    for (const w of b.wheels) w.om -= clamp(w.om, -dOm, dOm);
  }

  // gravité + traînée légère
  b.vy -= G * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0.01) {
    const k = 0.55 * sp / M;
    b.vx -= k * b.vx * dt;
    b.vy -= k * b.vy * dt;
  }
  b.om *= 1 - 0.1 * dt;
  b.om = clamp(b.om + (tq / I) * dt, -12, 12);

  // contacts
  let anyContact = false;
  for (const w of b.wheels) {
    if (solveWheel(w, dt)) anyContact = true;
  }
  game.grounded = anyContact;

  // intégration
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.th += b.om * dt;
  b.dirVis += (b.dir - b.dirVis) * approachRate(dt, 9);
  b.leanVis += (lean - b.leanVis) * approachRate(dt, 7);
  for (const w of b.wheels) w.phi += w.om * dt;

  // chronomètre
  if (game.timing) game.time += dt;

  // contrôles fatals : casque / guidon au sol, moto enterrée, chute
  for (const p of BODY_PTS) {
    const q = localToWorld(p.lx, p.ly);
    const s = sampleTerrain(q.x);
    const d = s.ny * (q.y - s.y);
    if (p.r - d > 0.02) { crash(q.x, q.y); return; }
  }
  const sc = sampleTerrain(b.x);
  if (sc.ny * (b.y - sc.y) < -0.5) { crash(b.x, b.y); return; }
  if (b.y < -25) { crash(b.x, b.y); return; }

  // arrivée
  if (b.x >= game.level.goal.x - 0.6) { win(); return; }
}

function crash(hx, hy) {
  if (game.mode !== 'flying') return;
  sfx.crash();
  game.mode = 'dead';
  game.deadT = 1.05;
  game.shake = 0.55;
  sfx.setEngine(0, 0);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, sp2 = 1 + Math.random() * 5;
    particles.push({
      x: hx, y: hy,
      vx: Math.cos(a) * sp2, vy: Math.abs(Math.sin(a)) * sp2 + 2,
      life: 0.7 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.1,
      col: 'crash'
    });
  }
}

function win() {
  if (game.mode !== 'flying') return;
  game.mode = 'finished';
  sfx.setEngine(0, 0);
  sfx.blip(880, 0.12, 0.3);
  const id = LEVELS[game.li].name;
  const prev = save.best[id];
  game.bestNew = prev === undefined || game.time < prev;
  if (game.bestNew) save.best[id] = game.time;
  save.unlocked = clamp(Math.max(save.unlocked, game.li + 2), 1, LEVELS.length);
  persist();
  showFinish();
}

function flipBike() {
  if (game.mode !== 'flying' || bike.flipCd > 0) return;
  bike.dir *= -1;
  bike.flipCd = 0.35;
  sfx.blip(440, 0.06, 0.2);
}

/* ----------------------------------------------------------------------------
   Rendu
   -------------------------------------------------------------------------- */

function w2s(x, y) {
  return {
    x: (x - cam.x) * cam.sc + W / 2 + cam.shakeT * Math.sin(game.shake * 91) * 14,
    y: H / 2 - (y - cam.y) * cam.sc + cam.shakeT * Math.cos(game.shake * 77) * 10
  };
}

const SKY_COLS = {
  facile:    ['#8fd3e8', '#dff3ec'],
  normal:    ['#7ec3e0', '#f0e9c8'],
  difficile: ['#e8a45e', '#f5d9a8'],
  expert:    ['#b3504e', '#e8a07a']
};

function drawSky() {
  const cols = SKY_COLS[game.level ? game.level.diff : 'facile'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, cols[0]);
  g.addColorStop(1, cols[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // nuages (parallaxe)
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 6; i++) {
    const px = ((i * 230 + 60 - cam.x * 4) % (W + 260) + (W + 260)) % (W + 260) - 130;
    const py = 40 + (i % 3) * 52;
    ctx.beginPath();
    ctx.ellipse(px, py, 52, 15, 0, 0, TAU);
    ctx.ellipse(px + 34, py - 9, 36, 12, 0, 0, TAU);
    ctx.fill();
  }
}

function drawHills() {
  for (let layer = 0; layer < 2; layer++) {
    const par = layer === 0 ? 0.25 : 0.45;
    const amp = layer === 0 ? 26 : 18;
    const base = layer === 0 ? 0.42 : 0.52;
    ctx.fillStyle = layer === 0 ? 'rgba(80,140,150,0.28)' : 'rgba(60,110,90,0.32)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += 24) {
      const wx = cam.x * par + sx / cam.sc;
      const hy = base * H + Math.sin(wx * 0.09 + layer * 2) * amp - Math.sin(wx * 0.023 + layer) * amp * 0.7;
      ctx.lineTo(sx, hy);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTerrain() {
  const L = game.level;
  if (!L) return;
  const pts = L.pts;
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    const s = w2s(p[0], p[1]);
    if (!started) { ctx.moveTo(s.x, s.y); started = true; }
    else ctx.lineTo(s.x, s.y);
  }
  ctx.lineTo(W + 60, H + 60);
  ctx.lineTo(-60, H + 60);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6d4c33');
  g.addColorStop(1, '#3d2a1c');
  ctx.fillStyle = g;
  ctx.fill();
  // ligne d'herbe
  ctx.beginPath();
  started = false;
  for (const p of pts) {
    const s = w2s(p[0], p[1]);
    if (!started) { ctx.moveTo(s.x, s.y); started = true; }
    else ctx.lineTo(s.x, s.y);
  }
  ctx.strokeStyle = '#5da24a';
  ctx.lineWidth = Math.max(2, cam.sc * 0.14);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawFlag() {
  const L = game.level;
  if (!L) return;
  const fx = L.goal.x, fy = L.goal.y;
  const s = w2s(fx, fy);
  const poleH = 2.6 * cam.sc;
  ctx.strokeStyle = '#d8dee9';
  ctx.lineWidth = Math.max(2, cam.sc * 0.06);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x, s.y - poleH);
  ctx.stroke();
  const wav = Math.sin(performance.now() / 240) * 3;
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - poleH);
  ctx.lineTo(s.x + cam.sc * 0.9, s.y - poleH + cam.sc * 0.25 + wav);
  ctx.lineTo(s.x, s.y - poleH + cam.sc * 0.55);
  ctx.closePath();
  ctx.fill();
}

function drawMinimap() {
  const L = game.level;
  if (!L) return;
  const mw = Math.min(210, W * 0.22), mh = 52;
  const mx = W - 16 - mw, my = 14;
  ctx.fillStyle = 'rgba(9,14,24,0.6)';
  ctx.strokeStyle = 'rgba(160,190,220,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(mx, my, mw, mh, 10) : ctx.rect(mx, my, mw, mh);
  ctx.fill(); ctx.stroke();
  const pad = 8, iw = mw - pad * 2, ih = mh - pad * 2;
  const sx = (x) => mx + pad + (x / L.width) * iw;
  const sy = (y) => my + pad + ih * 0.72 - clamp(y / 30, -0.4, 0.9) * ih * 0.8;
  ctx.strokeStyle = 'rgba(140,200,160,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < L.pts.length; i += 3) {
    const p = L.pts[i];
    if (i === 0) ctx.moveTo(sx(p[0]), sy(p[1]));
    else ctx.lineTo(sx(p[0]), sy(p[1]));
  }
  ctx.stroke();
  // arrivée
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath();
  ctx.arc(sx(L.goal.x), sy(L.goal.y) - 4, 3, 0, TAU);
  ctx.fill();
  // moto
  ctx.fillStyle = '#63e6c0';
  ctx.beginPath();
  ctx.arc(sx(bike.x), sy(bike.y) - 4, 3.4, 0, TAU);
  ctx.fill();
}

function drawBike() {
  const b = bike;
  const s = w2s(b.x, b.y);
  const k = cam.sc;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(-b.th);
  ctx.scale(k * b.dirVis, -k);

  // roues
  for (let i = 0; i < 2; i++) {
    const w = b.wheels[i];
    ctx.save();
    ctx.translate(w.lx, w.ly);
    ctx.strokeStyle = '#23262b';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R - 0.05, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#8a97ad';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R * 0.52, 0, TAU);
    ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const a = w.phi + (j * TAU) / 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * WHEEL_R * 0.5, Math.sin(a) * WHEEL_R * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // châssis : bras oscillant, fourche, cadre, réservoir-selle
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a4353';
  ctx.lineWidth = 0.075;
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.1); ctx.lineTo(-0.71, -0.32); // bras oscillant
  ctx.moveTo(0.3, 0.24); ctx.lineTo(0.71, -0.32);    // fourche
  ctx.stroke();
  ctx.strokeStyle = '#e0523f';
  ctx.lineWidth = 0.085;
  ctx.beginPath();
  ctx.moveTo(-0.62, 0.02);
  ctx.lineTo(-0.28, 0.36);
  ctx.lineTo(0.1, 0.4);
  ctx.lineTo(0.52, 0.44);
  ctx.lineTo(0.62, 0.52);
  ctx.moveTo(-0.62, 0.02);
  ctx.lineTo(0.02, -0.12);
  ctx.lineTo(0.32, 0.26);
  ctx.stroke();
  // bloc moteur
  ctx.fillStyle = '#2d3442';
  ctx.beginPath();
  ctx.rect(-0.08, -0.14, 0.34, 0.2);
  ctx.fill();

  // pilote
  const lean = clamp(b.leanVis, -1, 1);
  ctx.strokeStyle = '#2b3340';
  ctx.lineWidth = 0.095;
  ctx.beginPath();
  ctx.moveTo(0.02, -0.08);                       // repose-pied
  ctx.lineTo(-0.05 - lean * 0.06, 0.5);          // hanche
  ctx.lineTo(0.1 - lean * 0.2, 0.84);            // épaule
  ctx.moveTo(0.12 - lean * 0.2, 0.8);            // bras
  ctx.lineTo(0.64, 0.52);                        // guidon
  ctx.stroke();
  // casque (le point fatal)
  ctx.fillStyle = '#f2f5fa';
  ctx.beginPath();
  ctx.arc(0.02, 1.02, 0.16, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#e0523f';
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.arc(0.02, 1.02, 0.16, -0.5, 0.7);
  ctx.stroke();
  ctx.restore();
}

function spawnDust(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.7) * 3, vy: Math.random() * 2.4,
      life: 0.4 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.09,
      col: 'dirt'
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 7 * dt;
    if (p.col === 'dirt' && p.y < groundAt(game.level.pts, p.x)) {
      p.y = groundAt(game.level.pts, p.x); p.vy = 0; p.vx *= 0.7;
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const s = w2s(p.x, p.y);
    ctx.globalAlpha = clamp(p.life * 2, 0, 1) * 0.85;
    ctx.fillStyle = p.col === 'crash' ? '#e0523f' : '#7a5a3a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.size * cam.sc, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateCamera(dt) {
  const b = bike;
  const tx = b.x + clamp(b.vx * 0.5, -4.5, 4.5);
  const ty = Math.max(b.y + 1.6, groundAt(game.level.pts, b.x) + 2.4);
  cam.x += (tx - cam.x) * approachRate(dt, 4.2);
  cam.y += (ty - cam.y) * approachRate(dt, 5);
  const speed = Math.hypot(b.vx, b.vy);
  const target = (H / 26) * clamp(1 - speed * 0.006, 0.72, 1);
  cam.sc += (target - cam.sc) * approachRate(dt, 3);
  game.shake = Math.max(0, game.shake - dt * 1.6);
  cam.shakeT = game.shake > 0.02 ? game.shake : 0;
}

/* ----------------------------------------------------------------------------
   HUD
   -------------------------------------------------------------------------- */

function hudText(text, x, y, size, color, align = 'left', weight = 500) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Consolas, "Cascadia Mono", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function drawHUD() {
  const L = game.level;
  if (!L || game.mode === 'menu') return;
  // panneau principal
  ctx.fillStyle = 'rgba(9,14,24,0.6)';
  ctx.strokeStyle = 'rgba(160,190,220,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(16, 14, 240, 84, 12) : ctx.rect(16, 14, 240, 84);
  ctx.fill(); ctx.stroke();
  hudText(`NIVEAU ${game.li + 1} · ${L.name.toUpperCase()}`, 30, 36, 11, '#63e6c0', 'left', 700);
  hudText(L.diff.toUpperCase(), 242, 36, 10, '#8fa0b8', 'right', 600);
  hudText(fmtTime(game.time), 30, 66, 22, '#e8eef8', 'left', 600);
  hudText(`ESSAI ${game.attempts}`, 242, 64, 11, '#8fa0b8', 'right', 500);
  hudText(`${Math.round(Math.hypot(bike.vx, bike.vy) * 3.6)} KM/H`, 242, 82, 10, '#5f7088', 'right', 500);

  drawMinimap();

  // rappel des commandes
  hudText('↑ ACCÉLÉRER · ↓ FREINER · ← → ÉQUILIBRE · ESPACE DEMI-TOUR · R RECOMMENCER · P PAUSE',
    W / 2, H - 16, 10, 'rgba(143,160,184,0.85)', 'center', 500);

  // crash : flash + message
  if (game.mode === 'dead') {
    const a = clamp(game.deadT, 0, 1);
    ctx.fillStyle = `rgba(160,20,30,${0.28 * a})`;
    ctx.fillRect(0, 0, W, H);
    hudText('CASQUE AU SOL !', W / 2, H / 2 - 10, 34, '#ff5d6c', 'center', 700);
    hudText('Le niveau redémarre…', W / 2, H / 2 + 24, 14, '#e8eef8', 'center', 500);
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawHills();
  drawTerrain();
  drawFlag();
  drawParticles();
  if (game.mode !== 'menu') drawBike();
  // vignettage
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  drawHUD();
}

/* ----------------------------------------------------------------------------
   Interface (menu, fin, pause)
   -------------------------------------------------------------------------- */

const el = (id) => document.getElementById(id);

function hidePanels() {
  for (const id of ['panelMenu', 'panelFinish', 'panelPause']) {
    const p = el(id);
    if (p) p.classList.add('hidden');
  }
}

function showPanel(id) {
  hidePanels();
  const p = el(id);
  if (p) p.classList.remove('hidden');
}

function showFinish() {
  const L = LEVELS[game.li];
  const stats = el('finStats');
  if (stats) {
    const prev = game.bestNew ? '—' : fmtTime(save.best[L.name]);
    stats.innerHTML =
      `<div class="finrow"><span>Temps</span><b>${fmtTime(game.time)}</b></div>` +
      `<div class="finrow"><span>Record</span><b>${game.bestNew ? fmtTime(save.best[L.name]) + ' ★' : prev}</b></div>` +
      `<div class="finrow"><span>Essais</span><b>${game.attempts}</b></div>`;
  }
  const btnNext = el('btnNext');
  if (btnNext) btnNext.classList.toggle('hidden', game.li >= LEVELS.length - 1);
  showPanel('panelFinish');
}

const DIFF_LABELS = { facile: 'FACILE', normal: 'NORMAL', difficile: 'DIFFICILE', expert: 'EXPERT' };

function buildLevelGrid() {
  const grid = el('levelGrid');
  if (!grid) return;
  grid.innerHTML = DIFFS.map((diff) => {
    const idxs = LEVELS.map((L, i) => ({ L, i })).filter((o) => o.L.diff === diff);
    const btns = idxs.map(({ L, i }) => {
      const locked = i >= save.unlocked;
      const best = save.best[L.name] !== undefined ? fmtTime(save.best[L.name]) : '—';
      return `<button class="lvl-btn ${locked ? 'locked' : ''}" data-idx="${i}" ${locked ? 'disabled' : ''}>
        <span class="lvl-name">${locked ? '🔒' : '🏁'} ${L.name}</span>
        <span class="lvl-best">${best}</span>
      </button>`;
    }).join('');
    return `<h3 class="lvl-group ${diff}">${DIFF_LABELS[diff]}</h3><div class="lvl-row">${btns}</div>`;
  }).join('');
}

function openMenu() {
  game.mode = 'menu';
  sfx.setEngine(0, 0);
  buildLevelGrid();
  showPanel('panelMenu');
}

function showPause() {
  game.mode = 'paused';
  sfx.setEngine(0, 0);
  showPanel('panelPause');
}

/* ----------------------------------------------------------------------------
   Entrées clavier
   -------------------------------------------------------------------------- */

const keys = { up: false, down: false, left: false, right: false };

function anyDriveKey() {
  return keys.up || keys.down || keys.left || keys.right;
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  if (game.mode === 'menu') {
    if (k === 'Enter') startLevel(clamp(save.unlocked - 1, 0, LEVELS.length - 1));
    return;
  }
  if (game.mode === 'finished') {
    if (k === ' ' || k === 'Enter') {
      if (game.li < LEVELS.length - 1) startLevel(game.li + 1);
      else openMenu();
    } else if (k === 'r' || k === 'R') restartLevel();
    else if (k === 'Escape') openMenu();
    return;
  }
  if (game.mode === 'dead') {
    if (k === 'r' || k === 'R') restartLevel();
    return;
  }
  if (game.mode === 'paused') {
    if (k === 'p' || k === 'P' || k === 'Escape') { game.mode = 'flying'; hidePanels(); }
    else if (k === 'r' || k === 'R') restartLevel();
    return;
  }
  // flying
  if (k === 'ArrowUp') keys.up = true;
  else if (k === 'ArrowDown') keys.down = true;
  else if (k === 'ArrowLeft') keys.left = true;
  else if (k === 'ArrowRight') keys.right = true;
  else if (k === ' ') flipBike();
  else if (k === 'r' || k === 'R') restartLevel();
  else if (k === 'p' || k === 'P') showPause();
  else if (k === 'Escape') openMenu();
  else if (k === 'm' || k === 'M') sfx.setMuted(!sfx.muted);
  if (anyDriveKey() && !game.timing) game.timing = true;
});

window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowUp') keys.up = false;
  else if (k === 'ArrowDown') keys.down = false;
  else if (k === 'ArrowLeft') keys.left = false;
  else if (k === 'ArrowRight') keys.right = false;
});

/* ----------------------------------------------------------------------------
   Boucle principale
   -------------------------------------------------------------------------- */

let _last = performance.now();
let _acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - _last) / 1000);
  _last = now;
  if (game.mode === 'flying') {
    _acc += dt;
    const h = 1 / 240;
    let n = 0;
    while (_acc >= h && n < 30) { stepPhysics(h); _acc -= h; n++; }
    if (n >= 30) _acc = 0;
    sfx.setEngine(keys.up ? 1 : 0, Math.abs(bike.wheels[0].om));
    // projection de terre sous glissement
    const rear = bike.wheels[0];
    if (game.grounded && Math.abs(rear.slip) > 2 && rear.jn > 60 && Math.random() < 0.6) {
      const c = localToWorld(rear.lx, rear.ly - WHEEL_R);
      spawnDust(c.x, c.y, 1);
    }
    if (game.mode === 'flying') { updateCamera(dt); updateParticles(dt); }
  } else if (game.mode === 'dead') {
    game.deadT -= dt;
    updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt * 1.2);
    if (game.deadT <= 0) restartLevel();
  } else if (game.level) {
    updateParticles(dt);
  }
  if (game.level) render();
}

/* ----------------------------------------------------------------------------
   Liaisons interface + démarrage
   -------------------------------------------------------------------------- */

document.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('[data-idx]') : null;
  if (btn && !btn.classList.contains('locked')) {
    sfx.init();
    sfx.blip(520, 0.06, 0.2);
    startLevel(parseInt(btn.dataset.idx, 10));
  }
});

const bind = (id, fn) => {
  const b = el(id);
  if (b) b.addEventListener('click', fn);
};

bind('btnReplay', () => { sfx.init(); restartLevel(); });
bind('btnNext', () => { sfx.init(); startLevel(game.li + 1); });
bind('btnMenu2', () => openMenu());
bind('btnResume', () => { game.mode = 'flying'; hidePanels(); });
bind('btnPauseRestart', () => { sfx.init(); restartLevel(); });
bind('btnPauseMenu', () => openMenu());

resize();
openMenu();
requestAnimationFrame(frame);




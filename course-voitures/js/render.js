'use strict';

/* ============================================================================
   PETITES VOITURES — rendu (piste pré-rendue + couche dynamique)
   ========================================================================== */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const staticCanvas = document.createElement('canvas');
const sctx = staticCanvas.getContext('2d', { alpha: false });

const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
const skids = [];
const particles = [];
const MAX_SKIDS = 1600;
const MAX_PARTICLES = 340;

let decor = null;

/* Vide le décor décoratif (nécessaire quand on change de circuit). */
function resetDecor() {
  decor = null;
}

/* --------------------------------------------------------------------------
   Cadrage : caméra fixe, piste entière visible
   -------------------------------------------------------------------------- */

function hudTopInset() {
  if (typeof els === 'undefined' || !els.hudLeft || !els.hudRight) return 120;
  const side = Math.max(els.hudLeft.offsetHeight, els.hudRight.offsetHeight);
  let inset = 16 + side + 8;
  if (els.aiBoard && !els.aiBoard.classList.contains('hidden')) {
    inset = Math.max(inset, els.aiBoard.offsetTop + els.aiBoard.offsetHeight + 8);
  }
  return inset;
}

function resizeView() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  view.w = w;
  view.h = h;
  view.dpr = dpr;

  for (const c of [canvas, staticCanvas]) {
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
  }

  const b = track.viewBounds;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const padX = Math.max(15, Math.min(34, w * 0.02));
  const padTop = Math.min(h * 0.42, hudTopInset());
  const padBottom = Math.max(24, Math.min(58, h * 0.07));
  const availW = w - padX * 2;
  const availH = h - padTop - padBottom;
  const scale = Math.min(availW / bw, availH / bh);

  view.scale = scale;
  view.ox = w / 2 - ((b.minX + b.maxX) / 2) * scale;
  view.oy = padTop + availH / 2 - ((b.minY + b.maxY) / 2) * scale;

  renderStatic();
}

function renderStatic() {
  const g = sctx;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.clearRect(0, 0, view.w, view.h);

  drawGrass(g);
  drawTrackBase(g);
  drawKerbs(g);
  drawBarriers(g);
  drawStartLine(g);
  drawDecor(g);
  drawVignette(g);
}

function polyPath(g, pts) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = p.x * view.scale + view.ox;
    const y = p.y * view.scale + view.oy;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/* Anneau compris entre deux décalages de la ligne centrale. */
function ringPath(g, outerOffset, innerOffset) {
  const pts = track.pts;
  const N = track.N;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const p = pts[i % N];
    const x = (p.x + p.nx * outerOffset) * view.scale + view.ox;
    const y = (p.y + p.ny * outerOffset) * view.scale + view.oy;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const p = pts[i % N];
    const x = (p.x + p.nx * innerOffset) * view.scale + view.ox;
    const y = (p.y + p.ny * innerOffset) * view.scale + view.oy;
    g.lineTo(x, y);
  }
  g.closePath();
}

function offsetPath(g, offset) {
  const pts = track.pts;
  g.beginPath();
  for (let i = 0; i <= pts.length; i++) {
    const p = pts[i % pts.length];
    const x = (p.x + p.nx * offset) * view.scale + view.ox;
    const y = (p.y + p.ny * offset) * view.scale + view.oy;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

/* --------------------------------------------------------------------------
   Vignettes des circuits (menu) : miniatures SVG dessinées à partir des
   points de la ligne centrale.
   -------------------------------------------------------------------------- */

function drawTrackThumb(el, def) {
  const T = buildTrack(def);
  const b = T.bounds;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const pad = (T.halfWidth + T.runoff) * 0.35;
  const W = 100;
  const H = Math.max(30, Math.round((W * (h + pad * 2)) / (w + pad * 2)));

  const sx = W / (w + pad * 2);
  const sy = H / (h + pad * 2);
  const s = Math.min(sx, sy);
  const ox = (W - (w + pad * 2) * s) / 2;
  const oy = (H - (h + pad * 2) * s) / 2;

  const px = (p) => (ox + (p.x - b.minX + pad) * s).toFixed(2);
  const py = (p) => (oy + (p.y - b.minY + pad) * s).toFixed(2);

  const outer = T.offsetPolygon(T.halfWidth + T.runoff);
  const road = T.offsetPolygon(T.halfWidth);

  const ring = (poly) =>
    poly.map((p, i) => (i ? 'L' : 'M') + px(p) + ' ' + py(p)).join(' ') + ' Z';

  const svg =
    '<svg viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<path d="' +
    ring(outer) +
    '" fill="#b39c72" fill-rule="evenodd" stroke="none"/>' +
    '<path d="' +
    ring(road) +
    '" fill="#3b3f47" fill-rule="evenodd" stroke="none"/>' +
    '</svg>';

  el.innerHTML = svg;
}

function renderTrackThumbs() {
  const thumbs = document.querySelectorAll('[data-thumb]');
  for (const el of thumbs) {
    const def = TRACKS[el.dataset.thumb];
    if (def) drawTrackThumb(el, def);
  }
}

/* --------------------------------------------------------------------------
   Décor statique
   -------------------------------------------------------------------------- */

function drawGrass(g) {
  const { w, h } = view;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#37764e');
  grad.addColorStop(0.55, '#2f6b46');
  grad.addColorStop(1, '#255c3b');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // bandes de tonte très discrètes
  g.save();
  for (let y = -h * 0.2; y < h * 1.2; y += 78) {
    g.fillStyle = 'rgba(255,255,255,0.017)';
    g.fillRect(0, y, w, 39);
  }

  // grandes taches d'ombre
  const rand = mulberry32(9182);
  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 50 + rand() * 150;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(8,40,22,0.16)');
    rg.addColorStop(1, 'rgba(8,40,22,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // brins d'herbe
  for (let i = 0; i < 2400; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const v = rand();
    g.fillStyle = v > 0.55 ? 'rgba(150,205,160,0.09)' : 'rgba(6,40,22,0.13)';
    const s = 1 + rand() * 2.4;
    g.fillRect(x, y, s, s * (0.7 + rand()));
  }
  g.restore();
}

function drawTrackBase(g) {
  const s = view.scale;
  const hw = track.halfWidth;

  // zone de dégagement (gravier)
  ringPath(g, hw + track.runoff, -(hw + track.runoff));
  g.fillStyle = '#b39c72';
  g.fill('evenodd');

  // asphalte
  ringPath(g, hw, -hw);
  g.fillStyle = '#3b3f47';
  g.fill('evenodd');

  // texture d'asphalte
  g.save();
  ringPath(g, hw, -hw);
  g.clip('evenodd');

  const rand = mulberry32(4242);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * view.w;
    const y = rand() * view.h;
    const v = rand();
    if (v > 0.5) {
      g.fillStyle = 'rgba(255,255,255,0.035)';
      const sz = 1 + rand() * 2;
      g.fillRect(x, y, sz, sz);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.05)';
      const sz = 1 + rand() * 2.6;
      g.fillRect(x, y, sz, sz);
    }
  }

  // traces de gomme permanentes dans les virages
  g.globalAlpha = 0.1;
  g.strokeStyle = '#14161a';
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.lineWidth = Math.max(1.2, 0.55 * s);
    g.beginPath();
    let drawing = false;
    for (let i = 0; i < track.N; i++) {
      const p = track.pts[i];
      if (p.curv < 1 / 200) {
        drawing = false;
        continue;
      }
      const x = (p.x + p.nx * hw * 0.55 * side) * s + view.ox;
      const y = (p.y + p.ny * hw * 0.55 * side) * s + view.oy;
      if (!drawing) {
        g.moveTo(x, y);
        drawing = true;
      } else {
        g.lineTo(x, y);
      }
    }
    g.stroke();
  }
  g.restore();

  // liserés blancs sur les bords
  g.lineWidth = Math.max(1, 0.17 * s);
  g.strokeStyle = 'rgba(240,244,235,0.62)';
  offsetPath(g, hw - 0.18);
  g.stroke();
  offsetPath(g, -hw + 0.18);
  g.stroke();
}

function drawKerbs(g) {
  const s = view.scale;
  const hw = track.halfWidth;
  const pts = track.pts;
  const N = track.N;

  for (let i = 0; i < N; i++) {
    const p = pts[i];
    if (p.curv < 1 / 240) continue;
    const q = pts[(i + 1) % N];
    const col = Math.floor(i / 4) % 2 ? '#d94b4b' : '#f0efe7';

    for (const side of [-1, 1]) {
      const a = hw - 1.32;
      const b = hw + 0.1;
      const ax = (p.x + p.nx * a * side) * s + view.ox;
      const ay = (p.y + p.ny * a * side) * s + view.oy;
      const bx = (p.x + p.nx * b * side) * s + view.ox;
      const by = (p.y + p.ny * b * side) * s + view.oy;
      const cx = (q.x + q.nx * b * side) * s + view.ox;
      const cy = (q.y + q.ny * b * side) * s + view.oy;
      const dx = (q.x + q.nx * a * side) * s + view.ox;
      const dy = (q.y + q.ny * a * side) * s + view.oy;

      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineTo(cx, cy);
      g.lineTo(dx, dy);
      g.closePath();
      g.fillStyle = col;
      g.fill();
    }
  }
}

function drawBarriers(g) {
  const s = view.scale;
  const off = track.halfWidth + track.runoff;

  g.save();
  g.lineCap = 'butt';

  for (const side of [-1, 1]) {
    offsetPath(g, off * side);

    g.strokeStyle = 'rgba(20,18,12,0.3)';
    g.lineWidth = Math.max(3, 0.85 * s);
    g.save();
    g.translate(0, 0.12 * s);
    g.stroke();
    g.restore();

    g.strokeStyle = '#efeee7';
    g.lineWidth = Math.max(2, 0.62 * s);
    g.stroke();

    g.save();
    g.setLineDash([3.2 * s, 3.2 * s]);
    g.strokeStyle = '#cf4a4a';
    g.lineWidth = Math.max(2, 0.62 * s);
    g.stroke();
    g.restore();
  }

  g.restore();
}

function drawStartLine(g) {
  const p = track.pts[0];
  const s = view.scale;
  const rows = 2;
  const cols = 15;
  const cellW = 1.25;
  const cellH = track.width / cols;

  g.save();
  g.translate(p.x * s + view.ox, p.y * s + view.oy);
  g.rotate(Math.atan2(p.ty, p.tx));
  g.scale(s, s);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? '#16181b' : '#f2f1e8';
      g.fillRect(
        -rows * cellW * 0.5 + r * cellW,
        -track.halfWidth + c * cellH,
        cellW + 0.02,
        cellH + 0.02
      );
    }
  }
  g.restore();
}

function drawDecor(g) {
  if (!decor) {
    decor = [];
    const rand = mulberry32(20260410);
    const b = track.viewBounds;
    for (let tries = 0; tries < 900 && decor.length < 72; tries++) {
      const x = b.minX + rand() * (b.maxX - b.minX);
      const y = b.minY + rand() * (b.maxY - b.minY);
      const loc = track.locate(x, y, -1);
      if (loc.dist < track.halfWidth + track.runoff + 5.5) continue;
      let tooClose = false;
      for (const d of decor) {
        if (Math.hypot(d.x - x, d.y - y) < 6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      const big = rand() < 0.58;
      decor.push({
        x,
        y,
        r: big ? 2.0 + rand() * 2.0 : 1.0 + rand() * 0.8,
        big,
      });
    }
  }

  const s = view.scale;
  for (const d of decor) {
    const x = d.x * s + view.ox;
    const y = d.y * s + view.oy;
    const r = d.r * s;
    if (r < 2) continue;

    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(x + r * 0.25, y + r * 0.38, r * 1.1, r * 0.78, 0, 0, TAU);
    g.fill();

    g.fillStyle = d.big ? '#1b4a30' : '#20573a';
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(x - r * 0.45, y + r * 0.18, r * 0.62, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(x + r * 0.4, y - r * 0.22, r * 0.58, 0, TAU);
    g.fill();

    g.fillStyle = 'rgba(120,190,135,0.32)';
    g.beginPath();
    g.arc(x - r * 0.28, y - r * 0.3, r * 0.34, 0, TAU);
    g.fill();
  }
}

function drawVignette(g) {
  const { w, h } = view;
  const grad = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.78
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.24)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/* --------------------------------------------------------------------------
   Couche dynamique : gomme, particules, voitures
   -------------------------------------------------------------------------- */

function addParticle(x, y, vx, vy, size, color, life) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({
    x,
    y,
    vx,
    vy,
    size,
    color,
    life,
    maxLife: life,
  });
}

function addSkid(x1, y1, x2, y2, strength) {
  if (skids.length >= MAX_SKIDS) skids.shift();
  skids.push({
    x1,
    y1,
    x2,
    y2,
    life: 11,
    maxLife: 11,
    strength,
  });
}

function updateEffects(cars, dt, emit) {
  // gomme
  for (let i = skids.length - 1; i >= 0; i--) {
    skids[i].life -= dt;
    if (skids[i].life <= 0) skids.splice(i, 1);
  }

  // particules
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.exp(-2.2 * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.size += dt * 0.55;
  }

  for (const car of cars) {
    const speed = Math.hypot(car.u, car.v);

    if (emit) {
      if (car.wallImpact > 0.12) {
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU;
          addParticle(
            car.x,
            car.y,
            Math.cos(a) * (1 + Math.random() * 3),
            Math.sin(a) * (1 + Math.random() * 3),
            0.22,
            '255,196,110',
            0.35 + Math.random() * 0.3
          );
        }
        car.wallImpact = 0;
      }

      if (car.collisionImpact > 0.08) {
        const p = carPoint(car, 1.6, 0);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * TAU;
          addParticle(
            p.x,
            p.y,
            Math.cos(a) * (1 + Math.random() * 3.5),
            Math.sin(a) * (1 + Math.random() * 3.5),
            0.2,
            '255,208,130',
            0.3 + Math.random() * 0.35
          );
        }
        car.collisionImpact = 0;
      }

      const drifting =
        car.surface === 0 &&
        speed > 7 &&
        (car.input.hand ||
          Math.abs(car.slipR) > 0.28 ||
          Math.abs(car.slipF) > 0.3);

      if (drifting) {
        car.emitAcc += dt * 55;
        while (car.emitAcc >= 1) {
          car.emitAcc -= 1;
          const w = carPoint(car, -1.35, Math.random() < 0.5 ? -0.86 : 0.86);
          addParticle(
            w.x,
            w.y,
            -car.u * 0.12 + (Math.random() - 0.5) * 2,
            -car.v * 0.12 + (Math.random() - 0.5) * 2,
            0.5 + Math.random() * 0.5,
            '214,214,208',
            0.55 + Math.random() * 0.5
          );
        }
      } else if (car.surface === 1 && speed > 4) {
        car.emitAcc += dt * 42;
        while (car.emitAcc >= 1) {
          car.emitAcc -= 1;
          const w = carPoint(car, -1.35, Math.random() < 0.5 ? -0.86 : 0.86);
          addParticle(
            w.x,
            w.y,
            -car.u * 0.15 + (Math.random() - 0.5) * 1.6,
            -car.v * 0.15 + (Math.random() - 0.5) * 1.6,
            0.55 + Math.random() * 0.6,
            '198,178,138',
            0.5 + Math.random() * 0.45
          );
        }
      }

      // marques de pneus : deux traces arrière
      if (car.surface === 0 && speed > 5 && drifting) {
        if (!car.mark) car.mark = [null, null];
        const sides = [-0.86, 0.86];
        for (let k = 0; k < 2; k++) {
          const w = carPoint(car, -1.35, sides[k]);
          const prev = car.mark[k];
          if (prev) {
            const d = Math.hypot(w.x - prev.x, w.y - prev.y);
            if (d > 0.03 && d < 3) {
              addSkid(prev.x, prev.y, w.x, w.y, clamp(d * 0.9, 0.3, 1));
            }
          }
          car.mark[k] = { x: w.x, y: w.y };
        }
      } else {
        car.mark = null;
      }
    }
  }
}

function drawSkids(g) {
  if (!skids.length) return;
  const s = view.scale;
  const buckets = [[], [], [], []];

  for (const sk of skids) {
    const f = sk.life / sk.maxLife;
    const b = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
    buckets[b].push(sk);
  }

  const alphas = [0.46, 0.34, 0.23, 0.12];
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = '#121316';
  g.lineWidth = Math.max(1.3, 0.31 * s);

  for (let b = 0; b < 4; b++) {
    if (!buckets[b].length) continue;
    g.globalAlpha = alphas[b];
    g.beginPath();
    for (const sk of buckets[b]) {
      g.moveTo(sk.x1 * s + view.ox, sk.y1 * s + view.oy);
      g.lineTo(sk.x2 * s + view.ox, sk.y2 * s + view.oy);
    }
    g.stroke();
  }
  g.restore();
}

function drawParticles(g) {
  if (!particles.length) return;
  const s = view.scale;
  for (const p of particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    g.fillStyle = 'rgba(' + p.color + ',' + (a * 0.42).toFixed(3) + ')';
    g.beginPath();
    g.arc(
      p.x * s + view.ox,
      p.y * s + view.oy,
      Math.max(0.8, p.size * s),
      0,
      TAU
    );
    g.fill();
  }
}

function drawCar(g, car) {
  const p = PLAYERS[car.index];
  const s = view.scale;
  const x = car.x * s + view.ox;
  const y = car.y * s + view.oy;

  g.save();
  g.translate(x, y);
  g.rotate(car.heading);
  g.scale(s, s);

  // ombre
  g.fillStyle = 'rgba(0,0,0,0.3)';
  rr(g, -2.06 + 0.16, -0.92 + 0.26, 4.16, 1.86, 0.55);
  g.fill();

  // roues
  const wheels = [
    [1.32, -0.9, true],
    [1.32, 0.9, true],
    [-1.32, -0.92, false],
    [-1.32, 0.92, false],
  ];
  for (const [wx, wy, front] of wheels) {
    g.save();
    g.translate(wx, wy);
    if (front) g.rotate(car.steer);
    g.fillStyle = '#121417';
    rr(g, -0.47, -0.2, 0.94, 0.4, 0.12);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.1)';
    rr(g, -0.4, -0.15, 0.8, 0.09, 0.04);
    g.fill();
    g.restore();
  }

  // carrosserie
  const body = g.createLinearGradient(0, -1, 0, 1);
  body.addColorStop(0, p.light);
  body.addColorStop(0.32, p.color);
  body.addColorStop(0.75, p.color);
  body.addColorStop(1, p.dark);
  g.fillStyle = body;
  rr(g, -2.08, -0.92, 4.16, 1.84, 0.52);
  g.fill();
  g.lineWidth = 0.055;
  g.strokeStyle = 'rgba(8,10,12,0.55)';
  g.stroke();

  // bande centrale
  g.fillStyle = 'rgba(255,255,255,0.23)';
  g.fillRect(-1.92, -0.15, 3.75, 0.3);

  // habitacle
  g.fillStyle = '#101b21';
  rr(g, 0.02, -0.61, 1.28, 1.22, 0.4);
  g.fill();
  g.fillStyle = 'rgba(150,205,225,0.33)';
  rr(g, 0.34, -0.48, 0.52, 0.3, 0.1);
  g.fill();
  g.fillStyle = 'rgba(150,205,225,0.18)';
  rr(g, 0.34, 0.2, 0.52, 0.26, 0.1);
  g.fill();

  // aileron
  g.fillStyle = '#161b1f';
  g.fillRect(-2.1, -0.98, 0.28, 1.96);
  g.fillStyle = p.dark;
  g.fillRect(-2.05, -0.86, 0.18, 1.72);

  // phares
  g.fillStyle = '#fff3c4';
  rr(g, 1.85, -0.68, 0.23, 0.31, 0.08);
  g.fill();
  rr(g, 1.85, 0.37, 0.23, 0.31, 0.08);
  g.fill();

  // feux arrière
  const braking = car.input.brake && Math.abs(car.u) > 0.5;
  g.fillStyle = braking ? '#ff3333' : '#8d2222';
  rr(g, -2.13, -0.68, 0.15, 0.31, 0.05);
  g.fill();
  rr(g, -2.13, 0.37, 0.15, 0.31, 0.05);
  g.fill();

  // reflet
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 0.045;
  g.beginPath();
  g.moveTo(-1.45, -0.8);
  g.lineTo(1.15, -0.8);
  g.stroke();

  g.restore();

  // pastille joueur
  const bx = x;
  const by = y - Math.max(18, 2.45 * s);
  const rad = Math.max(7.5, Math.min(10, s * 1.2));
  g.beginPath();
  g.arc(bx, by, rad, 0, TAU);
  g.fillStyle = p.color;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(6,12,8,0.72)';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 ' + Math.round(rad * 1.05) + 'px "Bahnschrift", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(p.badge, bx, by + 0.5);
}

function renderFrame(cars) {
  const g = ctx;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.drawImage(staticCanvas, 0, 0, view.w, view.h);

  drawSkids(g);
  drawParticles(g);

  const sorted = cars.slice().sort((a, b) => a.y - b.y);
  for (const car of sorted) drawCar(g, car);
}

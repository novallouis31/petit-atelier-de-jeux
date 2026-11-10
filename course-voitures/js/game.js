'use strict';

/* ============================================================================
   PETITES VOITURES — logique de course, entrées, HUD, audio
   ========================================================================== */

const TOTAL_LAPS = 3;
const STEP = 1 / 180;
const CHECKPOINTS = [0.25, 0.5, 0.75];

function formatClock(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + s.toFixed(2).padStart(5, '0');
}

function formatLap(t) {
  if (!t || !isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? m + ':' + s.toFixed(2).padStart(5, '0') : s.toFixed(2);
}

const $ = (id) => document.getElementById(id);

const els = {
  overlay: $('overlay'),
  hud: $('hud'),
  menu: $('panelMenu'),
  pause: $('panelPause'),
  result: $('panelResult'),
  countdown: $('countdown'),
  countdownText: $('countdownText'),
  flash: $('flash'),
  toast: $('toast'),
  footer: $('footerHint'),
  raceTime: $('raceTime'),
  raceSub: $('raceSub'),
  resultKicker: $('resultKicker'),
  resultTitle: $('resultTitle'),
  resultMsg: $('resultMsg'),
  resultGrid: $('resultGrid'),
  btnStart: $('btnStart'),
  btnResume: $('btnResume'),
  btnRestart: $('btnRestart'),
  btnRestartPause: $('btnRestartPause'),
  btnMenu: $('btnMenu'),
  cards: [$('card-0'), $('card-1'), $('card-2'), $('card-3')],
  who: [$('who-0'), $('who-1'), $('who-2'), $('who-3')],
  hudLeft: $('hudLeft'),
  hudRight: $('hudRight'),
  aiBoard: $('aiBoard'),
  pos: [$('pos-0'), $('pos-1'), $('pos-2'), $('pos-3')],
  speed: [$('speed-0'), $('speed-1'), $('speed-2'), $('speed-3')],
  lap: [$('lap-0'), $('lap-1'), $('lap-2'), $('lap-3')],
  best: [$('best-0'), $('best-1'), $('best-2'), $('best-3')],
  last: [$('last-0'), $('last-1'), $('last-2'), $('last-3')],
  carCount: $('carCount'),
  aiLevel: $('aiLevel'),
  setupNote: $('setupNote'),
  aiNote: $('aiNote'),
  trackGrid: $('trackGrid'),
  trackNote: $('trackNote'),
  trackStats: $('trackStats'),
  trackName: $('trackName'),
};

/* Résultats de validation du banc d'essai (js/bench.js). Injectés au
   chargement pour alimenter le menu ; le banc peut les recalculer. */
const trackStats = {};

/* --------------------------------------------------------------------------
   Réglages (nombre de voitures, niveau de l'IA)
   -------------------------------------------------------------------------- */

function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem('petites-voitures/settings');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && Number.isFinite(saved.cars)) {
        s.cars = clamp(Math.round(saved.cars), 2, MAX_CARS);
      }
      if (saved && AI_LEVELS[saved.aiLevel]) {
        s.aiLevel = saved.aiLevel;
      }
      if (saved && TRACKS[saved.track]) {
        s.track = saved.track;
      }
    }
  } catch (err) {}
  return s;
}

const settings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem('petites-voitures/settings', JSON.stringify(settings));
  } catch (err) {}
}

const race = {
  mode: 'menu', // menu | countdown | racing | paused | finished
  time: 0,
  countdown: 0,
  lastCount: null,
  goTimer: 0,
  winner: -1,
  cars: Array.from({ length: settings.cars }, (_, i) => createCarState(i)),
};

/* --------------------------------------------------------------------------
   Audio (WebAudio, synthèse légère)
   -------------------------------------------------------------------------- */

class Sound {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.master = null;
    this.engines = [];
    this.skid = null;
    this.muted = false;
  }

  init() {
    if (this.ready) {
      this.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      this.ctx = ac;

      const master = ac.createGain();
      master.gain.value = this.muted ? 0 : 0.55;
      master.connect(ac.destination);
      this.master = master;

      this.engines = [0, 1, 2, 3].map(() => this.makeEngine());
      this.skid = this.makeSkid();
      this.ready = true;
      this.resume();
    } catch (err) {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  makeEngine() {
    const ac = this.ctx;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;

    const sub = ac.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 26;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 2.5;

    const gain = ac.createGain();
    gain.gain.value = 0;

    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.master);
    } else {
      gain.connect(this.master);
    }

    osc.start();
    sub.start();
    return { osc, sub, filter, gain, pan };
  }

  makeSkid() {
    const ac = this.ctx;
    const len = Math.floor(ac.sampleRate * 1.1);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1850;
    band.Q.value = 1.1;

    const gain = ac.createGain();
    gain.gain.value = 0;

    src.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    src.start();
    return { gain };
  }

  update(cars, mode) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const running = mode === 'racing' || mode === 'countdown';

    cars.forEach((car, i) => {
      const e = this.engines[i];
      if (!e) return;

      const kmh = Math.abs(car.u) * 3.6;
      const gears = [0, 28, 55, 85, 112, 145];
      let gi = 0;
      while (gi < gears.length - 1 && kmh > gears[gi + 1]) gi++;
      const frac = clamp(
        (kmh - gears[gi]) / Math.max(1, gears[gi + 1] - gears[gi]),
        0,
        1
      );
      const target = 48 + frac * 52 + gi * 4 + (car.input.throttle ? 7 : 0);

      e.osc.frequency.setTargetAtTime(target, t, 0.045);
      e.sub.frequency.setTargetAtTime(target * 0.5, t, 0.045);
      e.filter.frequency.setTargetAtTime(480 + target * 8, t, 0.07);

      const vol = running
        ? 0.011 + car.input.throttle * 0.024 + Math.min(0.01, kmh * 0.0002)
        : 0;
      e.gain.gain.setTargetAtTime(vol, t, 0.09);

      if (e.pan) {
        const screenX = car.x * view.scale + view.ox;
        const p = clamp((screenX / Math.max(1, view.w)) * 2 - 1, -0.8, 0.8);
        e.pan.pan.setTargetAtTime(p, t, 0.1);
      }
    });

    for (let i = cars.length; i < this.engines.length; i++) {
      const e = this.engines[i];
      if (e) e.gain.gain.setTargetAtTime(0, t, 0.06);
    }

    let skidLevel = 0;
    if (running) {
      for (const car of cars) {
        if (car.surface !== 0 || Math.abs(car.u) < 4) continue;
        const slip = Math.max(Math.abs(car.slipF), Math.abs(car.slipR));
        skidLevel = Math.max(skidLevel, clamp((slip - 0.2) * 2.4, 0, 1));
      }
    }
    this.skid.gain.gain.setTargetAtTime(skidLevel * 0.045, t, 0.05);
  }

  beep(freq = 440, dur = 0.1, vol = 0.1, type = 'square') {
    if (!this.ready) return;
    try {
      const ac = this.ctx;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    } catch (err) {}
  }

  toggle() {
    this.muted = !this.muted;
    if (this.ready && this.master) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.55,
        this.ctx.currentTime,
        0.04
      );
    }
    return this.muted;
  }
}

const snd = new Sound();

/* --------------------------------------------------------------------------
   Overlays
   -------------------------------------------------------------------------- */

function setOverlay(panel) {
  if (!panel) {
    els.overlay.classList.add('hidden');
    els.hud.classList.remove('hidden');
    return;
  }
  els.overlay.classList.remove('hidden');
  els.menu.classList.toggle('hidden', panel !== els.menu);
  els.pause.classList.toggle('hidden', panel !== els.pause);
  els.result.classList.toggle('hidden', panel !== els.result);
  els.hud.classList.toggle('hidden', panel === els.menu);
}

function hideCountdown() {
  els.countdown.classList.add('hidden');
}

function showCountdown(text, isGo) {
  els.countdown.classList.remove('hidden');
  els.countdownText.textContent = text;
  els.countdownText.classList.toggle('go', !!isGo);
  try {
    els.countdownText.animate(
      [
        { transform: 'scale(1.55)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1, offset: 0.22 },
        { transform: 'scale(0.94)', opacity: 1 },
      ],
      {
        duration: isGo ? 620 : 720,
        easing: 'cubic-bezier(.16,.9,.2,1)',
        fill: 'both',
      }
    );
  } catch (err) {}
}

function flashScreen() {
  els.flash.classList.remove('on');
  void els.flash.offsetWidth;
  els.flash.classList.add('on');
}

let toastTimer = null;
function toast(message, ms = 1900) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
}

/* --------------------------------------------------------------------------
   Course
   -------------------------------------------------------------------------- */

function gridSlots(n) {
  if (n <= 2) {
    return [
      { s: 0.9945, lat: -3.3 },
      { s: 0.9945, lat: 3.3 },
    ];
  }
  if (n === 3) {
    return [
      { s: 0.9945, lat: -3.3 },
      { s: 0.9945, lat: 3.3 },
      { s: 0.9852, lat: 0 },
    ];
  }
  return [
    { s: 0.9945, lat: -3.3 },
    { s: 0.9945, lat: 3.3 },
    { s: 0.9852, lat: -3.3 },
    { s: 0.9852, lat: 3.3 },
  ];
}

function ensureCars() {
  if (race.cars.length !== settings.cars) {
    race.cars = Array.from({ length: settings.cars }, (_, i) => createCarState(i));
  }
  race.cars.forEach((car, i) => {
    car.index = i;
    car.aiLevel = settings.aiLevel;
  });
}

function syncHUDCards() {
  for (let i = 0; i < MAX_CARS; i++) {
    if (els.cards[i]) els.cards[i].classList.toggle('hidden', i >= settings.cars);
    if (els.who[i]) els.who[i].textContent = PLAYERS[i].name;
  }
  if (els.aiBoard) els.aiBoard.classList.toggle('hidden', settings.cars <= 2);
}

function updateRaceSub() {
  els.raceSub.textContent = TOTAL_LAPS + ' TOURS · ' + settings.cars + ' VOITURES';
}

function syncSetupUI() {
  if (els.carCount) {
    els.carCount.querySelectorAll('[data-cars]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.cars) === settings.cars);
    });
  }
  if (els.aiLevel) {
    els.aiLevel.querySelectorAll('[data-level]').forEach((b) => {
      b.classList.toggle('active', b.dataset.level === settings.aiLevel);
    });
  }
  if (els.setupNote) {
    els.setupNote.textContent =
      settings.cars === 2
        ? 'Duel local à deux joueurs.'
        : settings.cars === 3
          ? 'Deux joueurs + 1 adversaire IA.'
          : 'Deux joueurs + 2 adversaires IA.';
  }
  if (els.aiNote) {
    els.aiNote.textContent =
      settings.cars > 2
        ? 'Niveau appliqué aux voitures 3 et 4.'
        : "Utilisé dès qu'une voiture IA est en piste.";
  }
  updateRaceSub();
}

/* --------------------------------------------------------------------------
   Circuits
   -------------------------------------------------------------------------- */

function applyTrack(id, announce) {
  if (!TRACKS[id]) return;
  settings.track = id;
  saveSettings();
  useTrack(id);
  resetDecor();
  resetGrid();
  resizeView();
  syncTrackUI();
  if (announce) toast('CIRCUIT · ' + TRACKS[id].name.toUpperCase());
}

function syncTrackUI() {
  if (els.trackGrid) {
    els.trackGrid.querySelectorAll('[data-track]').forEach((b) => {
      b.classList.toggle('active', b.dataset.track === settings.track);
    });
  }
  if (els.trackNote) {
    const def = TRACKS[settings.track];
    els.trackNote.textContent = def
      ? def.blurb + ' · ' + Math.round(track.length) + ' m de long.'
      : '';
  }
  if (els.trackName) {
    els.trackName.textContent = TRACKS[settings.track]
      ? TRACKS[settings.track].name
      : '';
  }
  // Statistiques de validation (issues du banc d'essai IA).
  if (els.trackStats) {
    const st = trackStats[settings.track];
    els.trackStats.textContent = st
      ? 'Validé par IA · tour ' +
        st.tour.toFixed(1) +
        ' s · rayon min ' +
        st.rayon +
        ' m · ' +
        st.note
      : '';
  }
}

function resetGrid() {
  ensureCars();
  const slots = gridSlots(settings.cars);
  race.cars.forEach((car, i) => {
    car.aiLevel = settings.aiLevel;
    resetCar(car, slots[i].s, slots[i].lat);
  });
  race.time = 0;
  race.countdown = 0;
  race.lastCount = null;
  race.goTimer = 0;
  race.winner = -1;
  skids.length = 0;
  particles.length = 0;
  els.countdown.classList.add('hidden');
  els.toast.classList.add('hidden');
  syncHUDCards();
  updateRaceSub();
}

function startRace() {
  resetGrid();
  race.mode = 'countdown';
  race.countdown = 3.0;
  race.lastCount = null;
  race.time = 0;

  els.countdownText.textContent = '3';
  els.countdownText.classList.remove('go');
  els.countdown.classList.remove('hidden');
  els.resultGrid.innerHTML = '';
  setOverlay(null);
  els.footer.classList.remove('hidden');

  snd.init();
  snd.resume();

  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
}

function beginGo() {
  race.mode = 'racing';
  race.time = 0;
  race.goTimer = 0.95;
  showCountdown('GO', true);
  snd.beep(880, 0.24, 0.14, 'triangle');
  flashScreen();
}

function updateCountdown(dt) {
  race.countdown -= dt;
  const n = Math.ceil(race.countdown);
  if (n !== race.lastCount) {
    race.lastCount = n;
    if (n > 0) {
      showCountdown(String(n), false);
      snd.beep(440, 0.09, 0.11, 'square');
    } else {
      beginGo();
    }
  }
}

function pauseRace() {
  if (race.mode !== 'racing') return;
  race.mode = 'paused';
  setOverlay(els.pause);
}

function resumeRace() {
  if (race.mode !== 'paused') return;
  race.mode = 'racing';
  setOverlay(null);
}

function goToMenu() {
  resetGrid();
  race.mode = 'menu';
  setOverlay(els.menu);
  els.resultGrid.innerHTML = '';
}

function finishRace(car) {
  if (race.mode !== 'racing') return;
  car.finished = true;
  car.finishTime = race.time;
  race.winner = car.index;
  race.mode = 'finished';
  race.goTimer = 0;
  hideCountdown();
  flashScreen();
  snd.beep(660, 0.16, 0.13, 'triangle');
  setTimeout(() => snd.beep(990, 0.3, 0.13, 'triangle'), 140);
  showResult();
}

function showResult() {
  const winner = race.cars[race.winner] || race.cars[0];
  const p = PLAYERS[winner.index];

  els.resultKicker.textContent = 'DAMIER · ' + TOTAL_LAPS + ' TOURS';
  els.resultTitle.textContent = p.name + ' gagne';
  els.resultMsg.textContent =
    'Course bouclée en ' +
    formatClock(winner.finishTime) +
    ' · meilleur tour ' +
    formatLap(winner.bestLap) +
    ' s.';

  const order = race.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.lapsCompleted + b.progress - (a.lapsCompleted + a.progress);
  });

  els.resultGrid.innerHTML = order
    .map((car, i) => {
      const pl = PLAYERS[car.index];
      const time = car.finished
        ? TOTAL_LAPS + ' tours · ' + formatClock(car.finishTime)
        : car.lapsCompleted + ' / ' + TOTAL_LAPS + ' tours bouclés';
      return (
        '<div class="result-row' +
        (i === 0 ? ' winner' : '') +
        '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="color" style="background:' + pl.color + '"></span>' +
        '<span class="rname">' + pl.name + '</span>' +
        '<span class="rtime">' + time + '</span>' +
        '<span class="rbest">Meilleur <b>' + formatLap(car.bestLap) + '</b></span>' +
        '</div>'
      );
    })
    .join('');

  setOverlay(els.result);
}

function completeLap(car) {
  const lapTime = race.time - car.lapStart;
  car.lastLap = lapTime;
  car.lapTimes.push(lapTime);

  let newBest = false;
  if (!car.bestLap || lapTime < car.bestLap) {
    car.bestLap = lapTime;
    newBest = true;
  }

  car.lapsCompleted += 1;
  car.lapStart = race.time;
  car.cpNext = 0;

  if (car.lapsCompleted >= TOTAL_LAPS) {
    finishRace(car);
    return;
  }

  if (car.lapsCompleted === TOTAL_LAPS - 1) {
    toast('DERNIER TOUR · ' + PLAYERS[car.index].name);
  } else if (newBest && car.lapsCompleted > 1) {
    toast('MEILLEUR TOUR · ' + formatLap(lapTime) + ' s');
  }
}

function updateCarProgress(car) {
  if (race.mode !== 'racing' || car.finished) {
    car.prevProgress = car.progress;
    return;
  }

  const p = car.progress;

  // passage de la ligne dans le bon sens
  if (car.prevProgress > 0.8 && p < 0.2) {
    if (!car.started) {
      car.started = true;
      car.lapStart = race.time;
      car.cpNext = 0;
    } else if (car.cpNext >= 3) {
      completeLap(car);
    }
  }

  // checkpoints dans l'ordre
  if (car.cpNext < 3) {
    const target = CHECKPOINTS[car.cpNext];
    if (Math.abs(p - target) < 0.05) car.cpNext += 1;
  }

  car.prevProgress = p;
}

function stepWorld(dt) {
  race.time += dt;

  for (const car of race.cars) {
    car.input = PLAYERS[car.index].ai ? aiControls(car, dt) : readInput(car.index);
  }
  for (const car of race.cars) stepCar(car, dt);
  resolveCarCollisions(race.cars);
  for (const car of race.cars) updateCarProgress(car);
}

/* --------------------------------------------------------------------------
   Entrées
   -------------------------------------------------------------------------- */

const keys = new Set();

const CONTROLS = [
  {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    hand: ['Space'],
  },
  {
    up: ['KeyW', 'KeyZ'],
    down: ['KeyS'],
    left: ['KeyA', 'KeyQ'],
    right: ['KeyD'],
    hand: ['KeyE', 'ShiftLeft'],
  },
];

function readInput(i) {
  const k = CONTROLS[i];
  const any = (list) => list.some((c) => keys.has(c));
  return {
    throttle: any(k.up) ? 1 : 0,
    brake: any(k.down) ? 1 : 0,
    steer: (any(k.right) ? 1 : 0) - (any(k.left) ? 1 : 0),
    hand: any(k.hand),
  };
}

const PREVENT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

window.addEventListener('keydown', (e) => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (e.repeat) return;

  keys.add(e.code);
  snd.init();

  if (e.code === 'KeyM') {
    const muted = snd.toggle();
    toast(muted ? 'SON COUPÉ' : 'SON ACTIVÉ', 1100);
    return;
  }

  if (e.code === 'KeyR' && race.mode !== 'menu') {
    startRace();
    return;
  }

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (race.mode === 'racing') {
      pauseRace();
      return;
    }
    if (race.mode === 'paused') {
      resumeRace();
      return;
    }
  }

  if (race.mode === 'menu' || race.mode === 'finished') {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') startRace();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  if (race.mode === 'racing') pauseRace();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && race.mode === 'racing') pauseRace();
});

/* --------------------------------------------------------------------------
   HUD
   -------------------------------------------------------------------------- */

let hudClock = 0;

function ranking() {
  const list = race.cars.map((car) => {
    const dist = car.finished
      ? 1e6 - car.finishTime
      : car.lapsCompleted + (car.started ? car.progress : car.progress - 1);
    return { car, dist };
  });
  list.sort((a, b) => b.dist - a.dist);
  return list;
}

function updateHUD(dt) {
  els.raceTime.textContent = formatClock(race.time);

  hudClock += dt;
  if (hudClock < 0.05) return;
  hudClock = 0;

  const order = ranking();

  race.cars.forEach((car) => {
    const i = car.index;
    const rank = order.findIndex((o) => o.car === car);

    els.pos[i].innerHTML =
      rank + 1 + '<small>' + (rank === 0 ? 'er' : 'e') + '</small>';
    els.speed[i].textContent = Math.round(Math.abs(car.u) * 3.6);

    let lapText;
    if (car.finished) lapText = 'TERMINÉ';
    else lapText = 'Tour ' + Math.min(car.lapsCompleted + 1, TOTAL_LAPS) + '/' + TOTAL_LAPS;
    els.lap[i].textContent = lapText;

    els.best[i].textContent = formatLap(car.bestLap);
    els.last[i].textContent = car.lastLap ? 'Dernier ' + formatLap(car.lastLap) : '';

    els.cards[i].classList.toggle('leading', rank === 0 && race.mode !== 'menu');
  });
}

/* --------------------------------------------------------------------------
   Boucle principale
   -------------------------------------------------------------------------- */

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = clamp(raw, 0, 0.05);

  if (race.mode === 'countdown') {
    updateCountdown(dt);
  } else if (race.mode === 'racing') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 8 && race.mode === 'racing') {
      stepWorld(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps >= 8) accumulator = 0;

    if (race.goTimer > 0) {
      race.goTimer -= dt;
      if (race.goTimer <= 0) hideCountdown();
    }
  } else {
    accumulator = 0;
  }

  const effectsDt =
    race.mode === 'paused' || race.mode === 'menu' ? 0 : dt;
  updateEffects(race.cars, effectsDt, race.mode === 'racing');
  snd.update(race.cars, race.mode);

  renderFrame(race.cars);
  updateHUD(dt);

  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Boutons + démarrage
   -------------------------------------------------------------------------- */

els.btnStart.addEventListener('click', startRace);
els.btnResume.addEventListener('click', resumeRace);
els.btnRestart.addEventListener('click', startRace);
els.btnRestartPause.addEventListener('click', startRace);
els.btnMenu.addEventListener('click', goToMenu);

els.carCount.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cars]');
  if (!btn) return;
  settings.cars = clamp(Number(btn.dataset.cars), 2, MAX_CARS);
  saveSettings();
  syncSetupUI();
  if (race.mode === 'menu') {
    resetGrid();
    resizeView();
  } else {
    syncHUDCards();
  }
});

els.aiLevel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-level]');
  if (!btn || !AI_LEVELS[btn.dataset.level]) return;
  settings.aiLevel = btn.dataset.level;
  saveSettings();
  syncSetupUI();
  if (race.mode === 'menu') resetGrid();
});

els.trackGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-track]');
  if (!btn || !TRACKS[btn.dataset.track]) return;
  applyTrack(btn.dataset.track, true);
});

window.addEventListener('resize', () => {
  resizeView();
});

syncSetupUI();
if (!TRACKS[settings.track]) settings.track = DEFAULT_SETTINGS.track;
applyTrack(settings.track, false);
renderTrackThumbs();
resizeView();
setOverlay(els.menu);
els.hud.classList.add('hidden');
requestAnimationFrame(frame);

/* Le banc d'essai (optionnel) publie les statistiques de validation des
   circuits : l'IA joue chaque tracé en tâche de fond. */
window.__benchSchedule = function () {
  setTimeout(() => {
    try {
      window.__bench.publish();
    } catch (err) {
      /* le banc est optionnel */
    }
  }, 120);
};

/* --------------------------------------------------------------------------
   Petit API de debug (utile pour les tests automatisés)
   -------------------------------------------------------------------------- */

window.__race = {
  race,
  get track() {
    return track;
  },
  view,
  settings,
  aiLevels: AI_LEVELS,
  start: startRace,
  pause: pauseRace,
  resume: resumeRace,
  menu: goToMenu,
  reset: resetGrid,
  setCars(n) {
    settings.cars = clamp(Math.round(n), 2, MAX_CARS);
    saveSettings();
    syncSetupUI();
    resetGrid();
  },
  setTrack(id) {
    applyTrack(id, false);
  },
  trackIds: TRACK_IDS,
  setAiLevel(level) {
    if (!AI_LEVELS[level]) return;
    settings.aiLevel = level;
    saveSettings();
    syncSetupUI();
    resetGrid();
  },
  setKey(code, down) {
    if (down) keys.add(code);
    else keys.delete(code);
  },
  teleport(i, s, lateral) {
    resetCar(race.cars[i], s, lateral);
    race.cars[i].aiLevel = settings.aiLevel;
  },
  snapshot() {
    return {
      mode: race.mode,
      time: race.time,
      winner: race.winner,
      settings: { ...settings },
      cars: race.cars.map((c) => ({
        index: c.index,
        name: PLAYERS[c.index].name,
        ai: !!PLAYERS[c.index].ai,
        x: c.x,
        y: c.y,
        u: c.u,
        v: c.v,
        r: c.r,
        steer: c.steer,
        slipF: c.slipF,
        slipR: c.slipR,
        surface: c.surface,
        progress: c.progress,
        laps: c.lapsCompleted,
        started: c.started,
        cpNext: c.cpNext,
        best: c.bestLap,
        finished: c.finished,
      })),
    };
  },
};

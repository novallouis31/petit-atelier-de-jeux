/**
 * Interface : menu, HUD et résultats.
 *
 * Tout le DOM est manipulé ici. Les modules `core/` n'en savent rien.
 */

import { TRACKS, TRACK_IDS, ENVIRONNEMENTS } from '../core/tracks.js';
import { AI_LEVELS } from '../core/ai.js';
import { Race, TOTAL_LAPS } from '../core/race.js';

const $ = (id) => document.getElementById(id);

/** Couleurs des participants, alignées sur `carMesh.js`. */
export const COULEURS = [
  { css: '#ff5666', nom: 'JOUEUR' },
  { css: '#42a9ff', nom: 'IA 1' },
  { css: '#5de08a', nom: 'IA 2' },
  { css: '#ffb14d', nom: 'IA 3' },
];

export class Interface {
  /**
   * @param {object} callbacks
   *   - onStart(trackId, aiLevel, cars)
   *   - onTrackChange(trackId)
   *   - onRestart()
   *   - onMenu()
   *   - onResume()
   *   - onPause()
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.els = {
      overlay: $('overlay'),
      menu: $('menu'),
      pause: $('pause'),
      resultat: $('resultat'),
      hud: $('hud'),
      countdown: $('countdown'),
      countdownText: $('countdownText'),
      toast: $('toast'),
      trackGrid: $('trackGrid'),
      trackNote: $('trackNote'),
      surTitre: $('surTitre'),
      aiLevel: $('aiLevel'),
      carCount: $('carCount'),
      btnStart: $('btnStart'),
      btnResume: $('btnResume'),
      btnRestart: $('btnRestart'),
      btnRestartPause: $('btnRestartPause'),
      btnMenu: $('btnMenu'),
      raceTime: $('raceTime'),
      raceSub: $('raceSub'),
      speed: $('speed'),
      gear: $('gear'),
      lap: $('lap'),
      place: $('place'),
      best: $('best'),
      positions: $('positions'),
      minimap: $('minimap'),
      resultTitle: $('resultTitle'),
      resultMsg: $('resultMsg'),
      resultGrid: $('resultGrid'),
      hint: $('hint'),
    };

    this.trackId = TRACK_IDS[0];
    this.aiLevel = 'confirme';
    this.cars = 4;

    this.bindEvents();
    this.buildTrackGrid();
    this.buildMinimap();
  }

  /* ------------------------------------------------------------------
     Mise en place
     ------------------------------------------------------------------ */

  bindEvents() {
    const cb = this.callbacks;

    this.els.btnStart.addEventListener('click', () => this.startRace());
    this.els.btnResume.addEventListener('click', () => cb.onResume());
    this.els.btnRestart.addEventListener('click', () => this.startRace());
    this.els.btnRestartPause.addEventListener('click', () => this.startRace());
    this.els.btnMenu.addEventListener('click', () => cb.onMenu());

    this.els.trackGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-track]');
      if (!btn) return;
      this.trackId = btn.dataset.track;
      this.syncSetup();
      cb.onTrackChange(this.trackId);
    });

    this.els.aiLevel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-level]');
      if (!btn || !AI_LEVELS[btn.dataset.level]) return;
      this.aiLevel = btn.dataset.level;
      this.syncSetup();
    });

    this.els.carCount.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cars]');
      if (!btn) return;
      this.cars = Number(btn.dataset.cars);
      this.syncSetup();
    });
  }

  /** Construit les vignettes de circuit. */
  buildTrackGrid() {
    this.els.trackGrid.innerHTML = TRACK_IDS.map((id) => {
      const def = TRACKS[id];
      const env = ENVIRONNEMENTS[def.theme.env];
      return `
        <button class="piste" type="button" data-track="${id}">
          <canvas class="piste-vignette" data-vignette="${id}" width="150" height="110"></canvas>
          <span class="piste-nom">${def.name}</span>
          <span class="piste-desc">${def.blurbShort}</span>
          <span class="piste-env" style="--env:${env.couleur}">${env.nom}</span>
        </button>`;
    }).join('');
  }

  /** Dessine les mini-circuits dans le menu. */
  drawThumbnails(trackFactory) {
    for (const id of TRACK_IDS) {
      const canvas = this.els.trackGrid.querySelector(`[data-vignette="${id}"]`);
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      const track = trackFactory(id);

      const b = track.bounds;
      const w = canvas.width;
      const h = canvas.height;
      const pad = 12;
      const spanX = b.maxX - b.minX;
      const spanZ = b.maxZ - b.minZ;
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);

      ctx.clearRect(0, 0, w, h);

      ctx.beginPath();
      for (let i = 0; i <= track.N; i += 2) {
        const p = track.pts[i % track.N];
        const x = w / 2 + (p.x - (b.minX + b.maxX) / 2) * scale;
        const y = h / 2 + (p.z - (b.minZ + b.maxZ) / 2) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      // La couleur de la vignette annonce l'environnement du circuit.
      const env = ENVIRONNEMENTS[TRACKS[id].theme.env];
      ctx.strokeStyle = env.couleur;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#dce9f8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /** Prépare le canvas de la mini-carte. */
  buildMinimap() {
    this.minimapCtx = this.els.minimap.getContext('2d');
  }

  /* ------------------------------------------------------------------
     Affichage
     ------------------------------------------------------------------ */

  syncSetup() {
    this.els.trackGrid.querySelectorAll('[data-track]').forEach((b) => {
      b.classList.toggle('actif', b.dataset.track === this.trackId);
    });
    this.els.aiLevel.querySelectorAll('[data-level]').forEach((b) => {
      b.classList.toggle('actif', b.dataset.level === this.aiLevel);
    });
    this.els.carCount.querySelectorAll('[data-cars]').forEach((b) => {
      b.classList.toggle('actif', Number(b.dataset.cars) === this.cars);
    });

    const def = TRACKS[this.trackId];
    this.els.trackNote.textContent = def ? def.blurb : '';
    this.els.raceSub.textContent = `${TOTAL_LAPS} TOURS · ${this.cars} VOITURES`;
    if (this.els.surTitre) {
      this.els.surTitre.innerHTML =
        `COURSE 3D <span class="sep">/</span> ${TRACK_IDS.length} CIRCUITS ` +
        `<span class="sep">/</span> ${this.cars} VOITURES`;
    }
  }

  showPanel(panel) {
    const e = this.els;
    if (!panel) {
      e.overlay.classList.add('cache');
      e.hud.classList.remove('cache');
      return;
    }
    e.overlay.classList.remove('cache');
    e.menu.classList.toggle('cache', panel !== 'menu');
    e.pause.classList.toggle('cache', panel !== 'pause');
    e.resultat.classList.toggle('cache', panel !== 'resultat');
    e.hud.classList.toggle('cache', panel === 'menu');
  }

  startRace() {
    this.callbacks.onStart(this.trackId, this.aiLevel, this.cars);
  }

  showCountdown(text, isGo) {
    const e = this.els;
    e.countdown.classList.remove('cache');
    e.countdownText.textContent = text;
    e.countdownText.classList.toggle('go', !!isGo);
    e.countdownText.animate(
      [
        { transform: 'scale(1.5)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'scale(0.94)', opacity: 1 },
      ],
      { duration: isGo ? 620 : 700, easing: 'cubic-bezier(.16,.9,.2,1)', fill: 'both' }
    );
  }

  hideCountdown() {
    this.els.countdown.classList.add('cache');
  }

  toast(message, ms = 1800) {
    const e = this.els;
    e.toast.textContent = message;
    e.toast.classList.remove('cache');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => e.toast.classList.add('cache'), ms);
  }

  /** Met à jour le HUD à partir de l'état de la course. */
  updateHUD(race) {
    const e = this.els;
    e.raceTime.textContent = race.clock;

    const joueur = race.entries[0];
    if (!joueur) return;
    const car = joueur.car;

    e.speed.textContent = Math.round(Math.abs(car.u) * 3.6);
    e.lap.textContent = car.finished
      ? 'TERMINÉ'
      : `Tour ${Math.min(car.lapsCompleted + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;
    e.place.textContent = joueur.place;
    e.best.textContent = Race.formatLap(car.bestLap);

    // Vitesse maximale : on montre l'échelle de 0 à 300 km/h.
    const ratio = Math.min(1, Math.abs(car.u) * 3.6 / 300);
    e.speed.style.setProperty('--vitesse', ratio.toFixed(3));

    // Classement à droite.
    const classement = race.classement || race.entries;
    e.positions.innerHTML = classement.map((entry) => `
      <li class="${entry.index === 0 ? 'joueur' : ''}">
        <span class="pos">${entry.place}</span>
        <span class="pastille" style="background:${COULEURS[entry.index].css}"></span>
        <span class="nom">${entry.index === 0 ? 'VOUS' : `IA ${entry.index}`}</span>
        <span class="ecart">${Math.round(Math.abs(entry.car.u) * 3.6)}</span>
      </li>`).join('');

    this.drawMinimap(race);
  }

  /** Dessine la mini-carte de la course en cours. */
  drawMinimap(race) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const canvas = this.els.minimap;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const track = race.track;
    const b = track.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const pad = 10;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;

    const proj = (x, z) => [
      w / 2 + (x - cx) * scale,
      h / 2 + (z - cz) * scale,
    ];

    // Tracé.
    ctx.beginPath();
    for (let i = 0; i <= track.N; i += 3) {
      const p = track.pts[i % track.N];
      const [x, y] = proj(p.x, p.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(150,180,215,0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Voitures.
    for (const entry of race.entries) {
      const [x, y] = proj(entry.car.x, entry.car.z);
      ctx.beginPath();
      ctx.arc(x, y, entry.index === 0 ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = COULEURS[entry.index].css;
      ctx.fill();
      if (entry.index === 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  /** Affiche les résultats. */
  showResults(race) {
    const e = this.els;
    const gagnant = race.entries[race.winner];
    if (!gagnant) return;

    e.resultTitle.textContent =
      gagnant.index === 0 ? 'Vous gagnez !' : `${COULEURS[gagnant.index].nom} gagne`;

    const joueur = race.entries[0];
    e.resultMsg.textContent =
      `Course bouclée en ${race.clock} · votre meilleur tour ` +
      `${Race.formatLap(joueur.car.bestLap)} s.`;

    e.resultGrid.innerHTML = (race.classement || []).map((entry) => {
      const car = entry.car;
      const temps = car.finished
        ? Race.formatLap(car.finishTime)
        : `${car.lapsCompleted}/${TOTAL_LAPS} tours`;
      return `
        <div class="ligne ${entry.index === 0 ? 'joueur' : ''}">
          <span class="rang">${entry.place}</span>
          <span class="pastille" style="background:${COULEURS[entry.index].css}"></span>
          <span class="nom">${entry.index === 0 ? 'VOUS' : `IA ${entry.index}`}</span>
          <span class="temps">${temps}</span>
          <span class="meilleur">${Race.formatLap(car.bestLap)}</span>
        </div>`;
    }).join('');

    this.showPanel('resultat');
  }
}

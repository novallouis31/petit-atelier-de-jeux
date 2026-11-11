/**
 * Déroulement d'une course.
 *
 * Ce module gère l'état de la partie : grille de départ, compte à rebours,
 * tours, positions, arrivée. Il ne connaît ni le DOM ni le rendu : il se
 * contente de faire avancer la simulation et de notifier les changements.
 *
 * Module pur : utilisable sous Node.
 */

import { clamp, mod } from './mathx.js';
import { createCarState, resetCar, stepCar, resolveCarCollisions } from './physics.js';
import { aiControls, AI_LEVELS } from './ai.js';

export const TOTAL_LAPS = 3;
export const STEP = 1 / 180;
const CHECKPOINTS = [0.25, 0.5, 0.75];

/** Positions de départ sur la grille. */
export const GRID_SLOTS = [
  { s: 0.9945, lat: -3.3 },
  { s: 0.9945, lat: 3.3 },
  { s: 0.9852, lat: -3.3 },
  { s: 0.9852, lat: 3.3 },
];

/** Un participant : une voiture et ses métadonnées. */
function createEntry(index, isAI, aiLevel) {
  const car = createCarState(index);
  car.aiLevel = aiLevel;
  return {
    index,
    car,
    isAI,
    aiLevel,
    nom: isAI ? `IA ${index}` : `JOUEUR ${index + 1}`,
    place: index + 1,
  };
}

/**
 * Moteur de course.
 */
export class Race {
  /**
   * @param {object} opts
   *   - track        : circuit (src/core/track.js)
   *   - bindTrack    : fonction qui branche le circuit sur la physique
   *   - cars         : nombre de participants (1 joueur + IA)
   *   - aiLevel      : niveau des adversaires
   *   - demo         : si vrai, le joueur est lui aussi piloté par l'IA
   *                    (mode démonstration, utile pour les captures et les
   *                    tests de rendu)
   */
  constructor(opts) {
    this.track = opts.track;
    this.bindTrack = opts.bindTrack;
    this.aiLevel = opts.aiLevel || 'confirme';
    this.nbCars = opts.cars ?? 4;
    this.demo = !!opts.demo;

    this.mode = 'menu'; // menu | countdown | racing | paused | finished
    this.time = 0;
    this.countdown = 0;
    this.lastCount = null;
    this.goTimer = 0;
    this.winner = -1;
    this.finishOrder = [];

    this.entries = [];
    this.reset();
  }

  /** Replace tous les participants sur la grille. */
  reset() {
    this.bindTrack(this.track);

    this.entries = [];
    for (let i = 0; i < this.nbCars; i++) {
      // Le joueur est le premier, les autres sont des IA.
      const isAI = i > 0;
      const entry = createEntry(i, isAI, this.aiLevel);
      const slot = GRID_SLOTS[i % GRID_SLOTS.length];
      resetCar(entry.car, slot.s, slot.lat);
      entry.car.aiLevel = this.aiLevel;
      this.entries.push(entry);
    }

    this.time = 0;
    this.countdown = 0;
    this.lastCount = null;
    this.goTimer = 0;
    this.winner = -1;
    this.finishOrder = [];
    this.updatePlaces();
  }

  /** Démarre le compte à rebours. */
  start() {
    this.reset();
    this.mode = 'countdown';
    this.countdown = 3;
    this.lastCount = null;
    return this;
  }

  /** Fige / reprend la course. */
  pause() {
    if (this.mode === 'racing') this.mode = 'paused';
  }

  resume() {
    if (this.mode === 'paused') this.mode = 'racing';
  }

  /** Contexte passé à l'IA. */
  aiContext(entry) {
    return {
      track: this.track,
      cars: this.entries.map((e) => e.car),
      time: this.time,
      level: AI_LEVELS[entry.aiLevel] || AI_LEVELS.confirme,
    };
  }

  /**
   * Avance la simulation d'un pas de temps fixe.
   * @param {number} dt
   * @param {object} inputs  commandes du joueur, par index de voiture
   */
  step(dt, inputs) {
    if (this.mode === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n <= 0) {
          this.mode = 'racing';
          this.time = 0;
          this.goTimer = 0.9;
        }
      }
      return;
    }

    if (this.mode !== 'racing') return;

    this.time += dt;

    // Commandes : IA pour les adversaires, joueur pour le premier — sauf en
    // mode démonstration, où l'IA pilote aussi le joueur.
    for (const entry of this.entries) {
      if (entry.isAI || this.demo) {
        entry.car.input = aiControls(entry.car, this.aiContext(entry), dt);
      } else {
        entry.car.input = inputs[entry.index] || entry.car.input;
      }
    }

    // Physique.
    const cars = this.entries.map((e) => e.car);
    for (const car of cars) stepCar(car, dt);
    resolveCarCollisions(cars);

    // Progression, tours, arrivées.
    for (const entry of this.entries) {
      this.updateProgress(entry);
    }
    this.updatePlaces();
  }

  /** Gère le passage de la ligne et les checkpoints. */
  updateProgress(entry) {
    const car = entry.car;
    if (this.mode !== 'racing' || car.finished) {
      car.prevProgress = car.progress;
      return;
    }

    const p = car.progress;

    if (car.prevProgress > 0.8 && p < 0.2) {
      if (!car.started) {
        car.started = true;
        car.lapStart = this.time;
        car.cpNext = 0;
      } else if (car.cpNext >= 3) {
        this.completeLap(entry);
      }
    }

    if (car.cpNext < 3) {
      const target = CHECKPOINTS[car.cpNext];
      if (Math.abs(p - target) < 0.05) car.cpNext += 1;
    }

    car.prevProgress = p;
  }

  /** Boucle un tour. */
  completeLap(entry) {
    const car = entry.car;
    const lapTime = this.time - car.lapStart;
    car.lastLap = lapTime;
    car.lapTimes.push(lapTime);
    if (!car.bestLap || lapTime < car.bestLap) car.bestLap = lapTime;

    car.lapsCompleted += 1;
    car.lapStart = this.time;
    car.cpNext = 0;

    if (car.lapsCompleted >= TOTAL_LAPS) {
      car.finished = true;
      car.finishTime = this.time;
      this.finishOrder.push(entry.index);
      if (this.winner < 0) {
        this.winner = entry.index;
        this.mode = 'finished';
      }
    }
  }

  /** Recalcule le classement. */
  updatePlaces() {
    const classement = this.entries.slice().sort((a, b) => {
      const ca = a.car;
      const cb = b.car;
      if (ca.finished && cb.finished) return ca.finishTime - cb.finishTime;
      if (ca.finished) return -1;
      if (cb.finished) return 1;
      return (
        cb.lapsCompleted + cb.progress - (ca.lapsCompleted + ca.progress)
      );
    });
    classement.forEach((entry, i) => {
      entry.place = i + 1;
    });
    this.classement = classement;
  }

  /** Temps écoulé formaté. */
  get clock() {
    const t = Math.max(0, this.time);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  /** Temps au tour formaté. */
  static formatLap(t) {
    if (!t || !isFinite(t)) return '—';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}`;
  }
}

/**
 * Caméra de poursuite.
 *
 * La caméra est placée derrière la voiture et la suit avec un lissage
 * exponentiel : elle reste stable dans les vibrations mais ne colle pas
 * rigidement au véhicule. Elle anticipe le virage en regardant légèrement
 * vers l'intérieur, comme le fait un pilote.
 *
 * Le champ de vision s'élargit avec la vitesse : c'est le principal effet
 * de sensation de vitesse, et il est physique (les yeux s-accommodent
 * plus, le monde semble se contracter).
 */

import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/mathx.js';

/** Réglages de la caméra. */
export const CAMERA_MODES = [
  {
    id: 'arriere',
    nom: 'Arrière',
    distance: 7.4,
    hauteur: 2.9,
    fovBase: 62,
    fovVitesse: 22,
    anticipation: 0.28,
    lookAhead: 9,
  },
  {
    id: 'rapprochee',
    nom: 'Rapprochée',
    distance: 5.2,
    hauteur: 2.0,
    fovBase: 66,
    fovVitesse: 26,
    anticipation: 0.34,
    lookAhead: 7,
  },
  {
    id: 'cockpit',
    nom: 'Cockpit',
    distance: -0.35,
    hauteur: 1.15,
    fovBase: 72,
    fovVitesse: 26,
    anticipation: 0.18,
    lookAhead: 12,
  },
];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = CAMERA_MODES[0];
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.fov = this.mode.fovBase;
    this.shake = 0;
    this.shakeSeed = 0;
    this.initialised = false;
  }

  /** Change de mode de caméra. */
  setMode(index) {
    this.mode = CAMERA_MODES[((index % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length];
    this.initialised = false;
    return this.mode;
  }

  cycleMode() {
    return this.setMode(CAMERA_MODES.indexOf(this.mode) + 1);
  }

  /** Enregistre un choc (collision, sortie de piste). */
  addShake(intensity) {
    this.shake = Math.min(1.2, this.shake + intensity);
  }

  /**
   * Met à jour la position de la caméra.
   * @param {object} car   état du véhicule suivi
   * @param {number} dt    pas de temps
   * @param {object} track circuit (pour l'anticipation)
   */
  update(car, dt, track) {
    const mode = this.mode;
    const speed = Math.abs(car.u);

    // Direction avant de la voiture.
    const fx = Math.cos(car.heading);
    const fz = Math.sin(car.heading);

    // Axe droit de la voiture : (avant) × (haut) = droite.
    const rx = -fz;
    const rz = fx;

    // Position cible, derrière la voiture.
    const cibleX = car.x - fx * mode.distance;
    const cibleY = car.y + mode.hauteur;
    const cibleZ = car.z - fz * mode.distance;

    if (!this.initialised) {
      this.position.set(cibleX, cibleY, cibleZ);
      this.initialised = true;
    } else {
      // Lissage : la caméra suit avec un léger retard.
      const lambda = 7.5;
      this.position.x = damp(this.position.x, cibleX, lambda, dt);
      this.position.y = damp(this.position.y, cibleY, lambda * 1.3, dt);
      this.position.z = damp(this.position.z, cibleZ, lambda, dt);
    }

    // Point visé : devant la voiture, en anticipant le virage.
    let lookX = car.x + fx * mode.lookAhead;
    let lookZ = car.z + fz * mode.lookAhead;
    let lookY = car.y + 1.1;

    // Anticipation : on décale le regard vers l'intérieur du virage, en
    // fonction du lacet. C'est ce qui donne l'impression de « prendre » le
    // virage.
    const anticipation = clamp(car.r * mode.anticipation, -1.6, 1.6);
    lookX += rx * anticipation;
    lookZ += rz * anticipation;

    // La caméra doit rester au-dessus du sol : on relève le regard si la
    // route descend devant.
    if (track) {
      const loc = track.locate(lookX, lookZ, car.idx);
      lookY = damp(lookY, loc.height + 1.1, 4, dt);
    }

    this.target.set(lookX, lookY, lookZ);

    // Champ de vision : il s'élargit avec la vitesse.
    const ratio = clamp(speed / 45, 0, 1);
    const fovCible = mode.fovBase + mode.fovVitesse * ratio * ratio;
    this.fov = damp(this.fov, fovCible, 5, dt);

    // Vibrations : décroissance progressive.
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakeSeed += dt * 47;

    let sx = 0;
    let sy = 0;
    let sz = 0;
    if (this.shake > 0.001) {
      const amp = this.shake * this.shake * 0.42;
      sx = Math.sin(this.shakeSeed * 1.7) * amp;
      sy = Math.sin(this.shakeSeed * 2.3 + 1.1) * amp * 0.8;
      sz = Math.cos(this.shakeSeed * 1.9 + 0.4) * amp;
    }

    this.camera.position.set(
      this.position.x + sx,
      this.position.y + sy,
      this.position.z + sz
    );
    this.camera.lookAt(this.target);

    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Replace instantanément la caméra (démarrage de course, changement de circuit). */
  snap() {
    this.initialised = false;
  }
}

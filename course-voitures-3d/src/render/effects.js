/**
 * Effets de vitesse.
 *
 * Ce module regroupe tout ce qui donne la **sensation de vitesse** :
 *
 *  - **flou radial** : l'image est étirée vers l'extérieur à partir du
 *    centre, comme un objectif qui bouge pendant la prise de vue ;
 *  - **lignes de fuite** : des stries radiales qui apparaissent à haute
 *    vitesse, analogues aux traînées lumineuses d'un appareil photo ;
 *  - **aberration chromatique** : les couleurs se séparent sur les bords,
 *    effet réel de l'optique en conditions de vitesse ;
 *  - **vignettage** : le pourtour de l'image s'assombrit, ce qui fixe le
 *    regard au centre ;
 *  - **déformation de l'image** : l'horizon se courbe dans les virages
 *    serrés (effet de « barrel » inversé, très utilisé en jeu de course).
 *
 * Tout est reunion dans un seul shader, appliqué après le rendu de la
 * scène : une seule passe, donc un coût constant.
 */

import * as THREE from 'three';

/**
 * Shader d'effets de vitesse.
 *
 * @param {object} uniforms
 *   - vitesse        : 0..1, intensité des effets
 *   - virage         : -1..1, intensité de la déformation en virage
 *   - temps          : temps écoulé (animation des lignes)
 *   - resolution     : résolution du rendu
 */
export const SpeedShader = {
  name: 'SpeedShader',

  uniforms: {
    vitesse: { value: 0 },
    virage: { value: 0 },
    temps: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    intensite: { value: 1 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform float vitesse;
    uniform float virage;
    uniform float temps;
    uniform vec2 resolution;
    uniform float intensite;

    // La texture de la scène est fournie par le pipeline de post-traitement
    // via cet uniform : il doit être déclaré dans le shader.
    uniform sampler2D tDiffuse;

    varying vec2 vUv;

    // Bruit pseudo-aléatoire bon marché, suffisant pour des stries.
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      // --- déformation de l'image dans les virages ---
      // Le point de fuite est décalé vers l'intérieur du virage, et
      // l'image est courbée : plus le point est loin du centre, plus il
      // est déformé.
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);

      vec2 centerShifted = center + vec2(virage * 0.07, 0.0);
      vec2 dirShifted = vUv - centerShifted;
      float rShifted = length(dirShifted);
      float courbure = virage * 0.14 * rShifted * rShifted;
      vec2 uv = centerShifted + dirShifted * (1.0 - courbure);

      // --- flou radial ---
      // On échantillonne plusieurs fois en remontant vers le centre : c'est
      // un flou de mouvement directionnel, celui d'une caméra qui bouge.
      //
      // Le flou doit être rigoureusement nul à l'arrêt : sinon l'image est
      // déformée en permanence, même au ralenti. On n'échantillonne donc
      // qu'au-delà d'un seuil de vitesse, et on mélange avec l'image
      // d'origine pour que le poids du flou reste proportionnel à 'force'.
      float force = vitesse * intensite;

      // Image de référence : elle est échantillonnée à la position
      // déformée, de sorte que la courbure du virage est visible.
      vec4 couleur = texture2D(tDiffuse, clamp(uv, 0.002, 0.998));

      if (force > 0.02) {
        // Flou radial : on décale les échantillons vers le centre. Le
        // décalage est proportionnel à la distance au centre, ce qui donne
        // le flou de mouvement d'une caméra qui avance.
        vec4 flou = vec4(0.0);
        float poidsTotal = 0.0;
        const int ECHANTILLONS = 5;
        for (int i = 0; i < ECHANTILLONS; i++) {
          float t = float(i) / float(ECHANTILLONS - 1);
          // Le premier échantillon est l'image d'origine.
          vec2 ech = mix(vUv, centerShifted + dirShifted * 0.86, t * force * 0.55);
          float poids = 1.0 - t * 0.35;
          flou += texture2D(tDiffuse, clamp(ech, 0.002, 0.998)) * poids;
          poidsTotal += poids;
        }
        flou /= poidsTotal;
        // Le mélange reste partiel : au-delà, l'image devient illisible et
        // le joueur perd les repères de la piste.
        couleur = mix(couleur, flou, clamp(force * 0.7, 0.0, 0.45));
      }

      // --- lignes de fuite ---
      // Des stries radiales apparaissent au-delà d'un certain rayon.
      if (force > 0.02) {
        float angle = atan(dir.y, dir.x);
        float rayon = length(dir);
        // On tire des lignes fines, animées, qui fuient vers l'extérieur.
        float stries = hash(vec2(floor(angle * 78.0), floor(temps * 12.0)));
        float seuil = 0.28 + 0.34 * hash(vec2(floor(angle * 78.0), 3.7));
        float largeur = smoothstep(seuil, seuil + 0.22, rayon);
        float intensiteStrie = step(0.62, stries) * largeur * force;
        // Les stries sont blanches et transparentes.
        couleur.rgb += vec3(0.9, 0.95, 1.0) * intensiteStrie * 0.16;
      }

      // --- aberration chromatique ---
      // Les canaux rouge et bleu sont décalés radialement, d'autant plus
      // loin du centre que la vitesse est élevée.
      if (force > 0.02) {
        float decalage = force * 0.004 * dist;
        vec2 dirNorm = dist > 0.0001 ? dir / dist : vec2(0.0);
        float r = texture2D(tDiffuse, clamp(vUv - dirNorm * decalage, 0.002, 0.998)).r;
        float b = texture2D(tDiffuse, clamp(vUv + dirNorm * decalage, 0.002, 0.998)).b;
        couleur.r = mix(couleur.r, r, force * 0.8);
        couleur.b = mix(couleur.b, b, force * 0.8);
      }

      // --- vignettage ---
      // L'atténuation reste légère : un vignettage fort Focus l'image et
      // masque la route, ce qui gêne à la conduite.
      float vignette = smoothstep(0.95, 0.28, dist);
      couleur.rgb *= mix(1.0, vignette, 0.18 + 0.18 * force);

      // --- léger renforcement de la saturation en vitesse ---
      float luminance = dot(couleur.rgb, vec3(0.299, 0.587, 0.114));
      couleur.rgb = mix(vec3(luminance), couleur.rgb, 1.0 + force * 0.18);

      gl_FragColor = couleur;
    }
  `,
};

/**
 * Pilote les effets : calcule l'intensité à partir de l'état de la voiture.
 */
export class SpeedEffects {
  constructor() {
    this.vitesse = 0;
    this.virage = 0;
    this.temps = 0;
    this.intensite = 1;
  }

  /**
   * @param {object} car   état du véhicule
   * @param {number} dt    pas de temps
   */
  update(car, dt) {
    this.temps += dt;

    // La vitesse est normalisée : 0 au repos, 1 à grande vitesse.
    const cible = Math.min(1, Math.abs(car.u) / 42);
    // Le flou ne commence qu'au-delà d'une certaine vitesse : en dessous,
    // l'image doit rester nette.
    const seuil = Math.max(0, (cible - 0.28) / 0.72);
    this.vitesse += (seuil * seuil - this.vitesse) * Math.min(1, dt * 4);

    // Le virage déforme l'image : on mesure le lacet, pas l'angle de la
    // route (c'est le lacet qui donne la sensation de force centrifuge).
    const cibleVirage = Math.max(-1, Math.min(1, car.r * 0.42));
    this.virage += (cibleVirage - this.virage) * Math.min(1, dt * 3.5);
  }

  /** Applique les valeurs calculées aux uniformes du shader. */
  apply(uniforms, resolution) {
    uniforms.vitesse.value = this.vitesse;
    uniforms.virage.value = this.virage;
    uniforms.temps.value = this.temps;
    uniforms.intensite.value = this.intensite;
    if (resolution) uniforms.resolution.value.copy(resolution);
  }
}

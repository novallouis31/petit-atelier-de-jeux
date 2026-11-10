/**
 * Utilitaires mathématiques partagés par le moteur physique, l'IA et le rendu.
 * Module pur : aucun accès au DOM, utilisable sous Node pour les tests.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (n, m) => ((n % m) + m) % m;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function moveTowards(cur, target, maxDelta) {
  return Math.abs(target - cur) <= maxDelta
    ? target
    : cur + sign(target - cur) * maxDelta;
}

/** Interpolation exponentielle indépendante de la fréquence d'images. */
export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

/** Ramène un angle dans ]-PI, PI]. */
export function wrapAngle(a) {
  a = mod(a + Math.PI, TAU) - Math.PI;
  return a;
}

/** Angle absolu entre deux directions, en radians. */
export function angleDiff(a, b) {
  return Math.abs(wrapAngle(a - b));
}

/**
 * Pseudo-aléatoire déterministe (mulberry32) : les décors procéduraux
 * sont ainsi reproductibles d'une session à l'autre.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit de valeur 1D lissé, utile pour les profils d'altitude. */
export function valueNoise1D(x, seed = 1337) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = (n + seed) | 0;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

/** Somme d'octaves de bruit 1D. */
export function fbm1D(x, octaves = 3, seed = 1337) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise1D(x * freq, seed + o * 977) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

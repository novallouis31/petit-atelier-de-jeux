/**
 * Catalogue des circuits.
 *
 * Chaque circuit est décrit par :
 *  - une forme en plan (harmoniques polaires) : la boucle est fermée par
 *    construction ;
 *  - un profil d'altitude (harmoniques du même paramètre) : la route monte
 *    et descend, ce qui donne du relief au rendu 3D et modifie réellement la
 *    physique (gravité dans la pente, freinage plus long en descente) ;
 *  - un thème visuel (ciel, sol, soleil) pour distinguer les circuits.
 *
 * Module pur : utilisable sous Node pour la validation hors écran.
 */

export const TRACKS = {
  genets: {
    id: 'genets',
    name: 'Boucle des Genêts',
    blurb: 'Le tracé d’origine : rapide, harmonieux, deux longues courbes.',
    blurbShort: 'Rapide et fluide',
    rx: 100,
    ry: 56,
    harmonics: [
      { n: 2, a: 0.13, p: 0.6 },
      { n: 3, a: 0.06, p: -0.8 },
      { n:  5, a: 0.025, p: 1.7 },
    ],
    elevation: [
      { n: 1, a: 5.5, p: 0.4 },
      { n: 2, a: 3.2, p: 1.9 },
    ],
    startT: 0.84,
    width: 15.0,
    runoff: 6.0,
    spacing: 0.7,
    bank: 0.35,
    theme: {
      sky: 0x87b7e8,
      horizon: 0xcfe0f0,
      ground: 'grass',
      sun: { azimuth: 2.1, elevation: 0.62 },
      fog: { color: 0xb9d2e8, density: 0.0016 },
      key: 0xfff4e0,
      fill: 0x9dc4ee,
      ambient: 0x6a7d94,
    },
  },

  aiguille: {
    id: 'aiguille',
    name: 'L’Aiguille',
    blurb: 'Une grande boucle étirée, deux épingles serrées à chaque bout.',
    blurbShort: 'Épingles serrées',
    rx: 96,
    ry: 46,
    harmonics: [
      { n: 2, a: 0.32, p: 0.15 },
      { n: 3, a: 0.07, p: 1.35 },
      { n: 4, a: 0.035, p: 0.0 },
    ],
    elevation: [
      { n: 1, a: 7.0, p: 2.1 },
      { n: 3, a: 2.4, p: 0.3 },
    ],
    startT: 0.5,
    width: 14.0,
    runoff: 5.0,
    spacing: 0.7,
    bank: 0.5,
    theme: {
      sky: 0xf0a868,
      horizon: 0xffd9a8,
      ground: 'gravel',
      sun: { azimuth: 4.0, elevation: 0.16 },
      fog: { color: 0xe8b184, density: 0.0022 },
      key: 0xffc98a,
      fill: 0xc98a5e,
      ambient: 0x6b5442,
    },
  },

  cigogne: {
    id: 'cigogne',
    name: 'La Cigogne',
    blurb: 'Trois grands lobes : deux longues courbes et une moyenne.',
    blurbShort: 'Trois longues courbes',
    rx: 106,
    ry: 66,
    harmonics: [
      { n: 3, a: 0.11, p: 0.3 },
    ],
    elevation: [
      { n: 2, a: 6.0, p: 0.8 },
      { n: 3, a: 2.0, p: 2.4 },
    ],
    startT: 0.34,
    width: 14.0,
    runoff: 5.5,
    spacing: 0.7,
    bank: 0.4,
    theme: {
      sky: 0x2b3f6b,
      horizon: 0x6b7fb0,
      ground: 'grass',
      sun: { azimuth: 5.6, elevation: 0.22 },
      fog: { color: 0x35466e, density: 0.0024 },
      key: 0xbfd2ff,
      fill: 0x4a5f8f,
      ambient: 0x2b3350,
    },
  },

  escargot: {
    id: 'escargot',
    name: 'L’Escargot',
    blurb: 'Quatre bosses enchaînées : un tracé technique, en lacets.',
    blurbShort: 'Technique, en lacets',
    rx: 110,
    ry: 62,
    harmonics: [
      { n: 2, a: 0.1, p: 0.4 },
      { n: 4, a: 0.03, p: 1.0 },
    ],
    elevation: [
      { n: 1, a: 4.0, p: 1.2 },
      { n: 4, a: 3.4, p: 0.2 },
    ],
    startT: 0.12,
    width: 14.5,
    runoff: 5.0,
    spacing: 0.7,
    bank: 0.28,
    theme: {
      sky: 0x9fd0e8,
      horizon: 0xdff0f7,
      ground: 'grass',
      sun: { azimuth: 1.1, elevation: 0.78 },
      fog: { color: 0xc4e2f0, density: 0.0014 },
      key: 0xffffff,
      fill: 0xa8d4ef,
      ambient: 0x76889a,
    },
  },

  onde: {
    id: 'onde',
    name: 'L’Onde',
    blurb: 'Une piste rapide et sinueuse, en permanence dans les esses.',
    blurbShort: 'Vitesse pure, esses',
    rx: 106,
    ry: 64,
    harmonics: [
      { n: 2, a: 0.08, p: 0.4 },
      { n: 3, a: 0.05, p: 1.2 },
      { n: 5, a: 0.02, p: 2.2 },
    ],
    elevation: [
      { n: 2, a: 8.0, p: 0.2 },
      { n: 5, a: 2.2, p: 1.4 },
    ],
    startT: 0.66,
    width: 14.5,
    runoff: 5.0,
    spacing: 0.7,
    bank: 0.45,
    theme: {
      sky: 0x1b2740,
      horizon: 0x3c4a6b,
      ground: 'gravel',
      sun: { azimuth: 3.4, elevation: 0.3 },
      fog: { color: 0x232f4a, density: 0.0026 },
      key: 0xcfe0ff,
      fill: 0x3d4c74,
      ambient: 0x1e2536,
    },
  },

  saut: {
    id: 'saut',
    name: 'Le Saut',
    blurb: 'Une crête plantée entre deux vallées : on la franchit en montée.',
    blurbShort: 'Grande crête',
    rx: 102,
    ry: 58,
    harmonics: [
      { n: 2, a: 0.16, p: 0.9 },
      { n: 3, a: 0.05, p: 2.6 },
    ],
    elevation: [
      { n: 1, a: 12.0, p: 0.2 },
      { n: 2, a: 5.0, p: 2.8 },
      { n: 3, a: 2.0, p: 0.9 },
    ],
    startT: 0.58,
    width: 15.5,
    runoff: 6.5,
    spacing: 0.7,
    bank: 0.42,
    theme: {
      sky: 0x6fb7d6,
      horizon: 0xbfe4f2,
      ground: 'grass',
      sun: { azimuth: 0.7, elevation: 0.52 },
      fog: { color: 0xa8cfe0, density: 0.0018 },
      key: 0xfff0d8,
      fill: 0x8fc6e8,
      ambient: 0x5f7386,
    },
  },
};

export const TRACK_IDS = Object.keys(TRACKS);
export const DEFAULT_TRACK = 'genets';

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
    blurb: 'Le tracé d’origine, au bord du lac : rapide, deux longues courbes.',
    blurbShort: 'Rapide, au bord de l’eau',
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
      env: 'lake',
      sky: 0x87b7e8,
      horizon: 0xcfe0f0,
      ground: 'grass',
      sun: { azimuth: 2.1, elevation: 0.62 },
      fog: { color: 0xb9d2e8, density: 0.0002 },
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
      env: 'temperate',
      sky: 0xf0a868,
      horizon: 0xffd9a8,
      ground: 'gravel',
      sun: { azimuth: 4.0, elevation: 0.16 },
      fog: { color: 0xe8b184, density: 0.000092 },
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
      env: 'temperate',
      sky: 0x2b3f6b,
      horizon: 0x6b7fb0,
      ground: 'grass',
      sun: { azimuth: 5.6, elevation: 0.22 },
      fog: { color: 0x35466e, density: 0.000100 },
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
      env: 'temperate',
      sky: 0x9fd0e8,
      horizon: 0xdff0f7,
      ground: 'grass',
      sun: { azimuth: 1.1, elevation: 0.78 },
      fog: { color: 0xc4e2f0, density: 0.000058 },
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
      env: 'temperate',
      sky: 0x1b2740,
      horizon: 0x3c4a6b,
      ground: 'gravel',
      sun: { azimuth: 3.4, elevation: 0.3 },
      fog: { color: 0x232f4a, density: 0.000108 },
      key: 0xcfe0ff,
      fill: 0x3d4c74,
      ambient: 0x1e2536,
    },
  },

  saut: {
    id: 'saut',
    name: 'Le Saut',
    blurb: 'Une crête enneigée entre deux vallées : on la franchit en montée.',
    blurbShort: 'Grande crête, neige',
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
      env: 'snow',
      sky: 0x9fc4e0,
      horizon: 0xe4f0f8,
      ground: 'snow',
      sun: { azimuth: 0.7, elevation: 0.4 },
      fog: { color: 0xd8e6f0, density: 0.00026 },
      key: 0xeaf2ff,
      fill: 0xb4cce4,
      ambient: 0x78889c,
    },
  },

  /* ------------------------------------------------------------------
     Les circuits ci-dessous élargissent la gamme : un tracé d'esses, une
     montagne, un crépuscule asymétrique et un circuit urbain à angles
     droits (forme polygonale, pas harmonique).
     ------------------------------------------------------------------ */

  esses: {
    id: 'esses',
    name: 'Les Esses',
    blurb: 'Des S enchaînés sans une seule ligne droite : la fluidité avant tout.',
    blurbShort: 'En permanence en S',
    rx: 104,
    ry: 62,
    harmonics: [
      { n: 2, a: 0.10, p: 0.4 },
      { n: 3, a: 0.06, p: 1.2 },
      { n: 5, a: 0.04, p: 2.4 },
      { n: 7, a: 0.018, p: 0.7 },
    ],
    elevation: [
      { n: 1, a: 4.5, p: 0.9 },
      { n: 3, a: 2.0, p: 2.0 },
    ],
    startT: 0.2,
    width: 13.5,
    runoff: 5.0,
    spacing: 0.7,
    bank: 0.4,
    theme: {
      env: 'temperate',
      sky: 0x8fc4ee,
      horizon: 0xd8ecf8,
      ground: 'grass',
      sun: { azimuth: 1.4, elevation: 0.5 },
      fog: { color: 0xc2dff0, density: 0.000062 },
      key: 0xfff6e6,
      fill: 0xa8d0f0,
      ambient: 0x70879c,
    },
  },

  col: {
    id: 'col',
    name: 'Le Col',
    blurb: 'Une montée de 20 % de dénivelé, puis une descente à décrocher.',
    blurbShort: 'Montagne, grand dénivelé',
    rx: 104,
    ry: 62,
    harmonics: [
      { n: 2, a: 0.14, p: 0.7 },
      { n: 3, a: 0.06, p: 1.9 },
      { n: 4, a: 0.02, p: 0.2 },
    ],
    elevation: [
      { n: 1, a: 16.0, p: 0.5 },
      { n: 2, a: 6.0, p: 2.2 },
      { n: 3, a: 2.5, p: 1.1 },
    ],
    startT: 0.62,
    width: 13.0,
    runoff: 6.0,
    spacing: 0.7,
    bank: 0.5,
    theme: {
      env: 'mountain',
      sky: 0x7ba4cc,
      horizon: 0xc2d4e4,
      ground: 'rock',
      sun: { azimuth: 2.8, elevation: 0.35 },
      fog: { color: 0x9cb2c8, density: 0.00022 },
      key: 0xeef4ff,
      fill: 0x8aa4c0,
      ambient: 0x4c5a6c,
    },
  },

  horloge: {
    id: 'horloge',
    name: 'L’Horloge',
    blurb: 'Un grand tour asymétrique dans le désert, une épingle au crépuscule.',
    blurbShort: 'Désert, crépuscule',
    rx: 108,
    ry: 60,
    harmonics: [
      { n: 2, a: 0.20, p: 1.1 },
      { n: 3, a: 0.09, p: 0.3 },
      { n: 5, a: 0.025, p: 2.0 },
    ],
    elevation: [
      { n: 1, a: 6.0, p: 2.4 },
      { n: 4, a: 3.0, p: 0.6 },
    ],
    startT: 0.45,
    width: 14.0,
    runoff: 5.5,
    spacing: 0.7,
    bank: 0.45,
    theme: {
      env: 'desert',
      sky: 0x3a2f52,
      horizon: 0xd98a5c,
      ground: 'sand',
      sun: { azimuth: 5.0, elevation: 0.12 },
      fog: { color: 0x6b4f3c, density: 0.00016 },
      key: 0xffb37a,
      fill: 0x6b5a80,
      ambient: 0x3a2c26,
    },
  },

  village: {
    id: 'village',
    name: 'Le Village',
    blurb: 'Un circuit urbain dans les rues du village : angles droits, murs proches.',
    blurbShort: 'Urbain, angles droits',
    /* Forme polygonale : des angles droits, impossibles avec des
       harmoniques polaires qui ne produisent que des courbes douces. Les
       angles sont raccordés par `planPoly` avec un congé de 13 m — comme
       les virages d'un vrai circuit urbain. Toute arête dépasse 29 m pour
       que le congé ne soit jamais bridé par ses voisines. */
    poly: [
      { x: 0, z: 0 },
      { x: 120, z: 0 },
      { x: 120, z: 58 },
      { x: 72, z: 58 },
      { x: 72, z: 28 },
      { x: 42, z: 28 },
      { x: 42, z: 58 },
      { x: 0, z: 58 },
    ],
    elevation: [
      { n: 1, a: 3.0, p: 0.3 },
      { n: 2, a: 1.5, p: 1.4 },
    ],
    startT: 0.02,
    width: 11.5,
    runoff: 3.5,
    spacing: 0.7,
    bank: 0.18,
    maxBank: 4,
    theme: {
      env: 'city',
      sky: 0xb8c4cc,
      horizon: 0xd8dee2,
      ground: 'concrete',
      sun: { azimuth: 3.8, elevation: 0.42 },
      fog: { color: 0xc4ccd2, density: 0.00009 },
      key: 0xf4f6f8,
      fill: 0xa8b4bc,
      ambient: 0x5d666e,
    },
  },
};

export const TRACK_IDS = Object.keys(TRACKS);
export const DEFAULT_TRACK = 'genets';

/**
 * Noms et couleurs des environnements (`theme.env`).
 *
 * Le menu s'en sert pour annoncer le décor d'un circuit ; la couleur sert
 * à teinter la vignette du tracé.
 */
export const ENVIRONNEMENTS = {
  temperate: { nom: 'Prairie', couleur: '#8fb4e0' },
  lake: { nom: 'Bord du lac', couleur: '#6fb7c9' },
  snow: { nom: 'Montagne enneigée', couleur: '#cfe3f2' },
  mountain: { nom: 'Montagne', couleur: '#9aa7b5' },
  desert: { nom: 'Désert', couleur: '#d9a066' },
  city: { nom: 'Ville', couleur: '#b8b0c6' },
};

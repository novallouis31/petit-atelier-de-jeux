/**
 * Textures procédurales (canvas 2D).
 *
 * Les textures photographiques (asphalte, béton, gazon…) viennent de Poly
 * Haven, mais elles ne couvrent pas tout : bandes rouges et blanches,
 * bannières, pneus, tribunes… Ici, on les **dessine** plutôt que de les
 * télécharger — c'est plus léger, et cela garantit que chaque objet du
 * décor porte une texture.
 *
 * Les textures sont **mémorisées** : le décor est reconstruit à chaque
 * changement de circuit, et recréer une vingtaine de canvas à chaque fois
 * finirait par remplir la mémoire GPU.
 */

import * as THREE from 'three';

const cache = new Map();

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crée un canvas 2D et son contexte. */
function toile(largeur, hauteur) {
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

/** Convertit un canvas en texture Three.js, avec les réglages du projet. */
function versTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  // Ce sont des couleurs, pas des données : conversion sRGB.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Mémorisation : une texture procédurale n'est dessinée qu'une fois. */
function memo(cle, fabrique) {
  if (!cache.has(cle)) cache.set(cle, fabrique());
  return cache.get(cle);
}

/* --------------------------------------------------------------------------
   Textures
   -------------------------------------------------------------------------- */

/** Bandes alternées (vibreurs, haut de glissière, drapeaux). */
export function bandesTexture(
  cle = 'rouge-blanc',
  couleurs = ['#c0392b', '#f2f2f2'],
  nb = 8
) {
  return memo(`bandes:${cle}`, () => {
    const { canvas, ctx } = toile(256, 64);
    const largeur = canvas.width / nb;
    for (let i = 0; i < nb; i++) {
      ctx.fillStyle = couleurs[i % couleurs.length];
      ctx.fillRect(Math.floor(i * largeur), 0, Math.ceil(largeur), canvas.height);
    }
    return versTexture(canvas);
  });
}

/** Bannière texte : portique de départ, panneaux publicitaires. */
export function banniereTexture(texte, fond = '#123a6b', encre = '#ffffff') {
  return memo(`banniere:${texte}:${fond}`, () => {
    const { canvas, ctx } = toile(512, 128);
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Léger dégradé pour éviter l'aplat.
    const degrade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    degrade.addColorStop(0, 'rgba(255,255,255,0.14)');
    degrade.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    ctx.fillStyle = encre;
    ctx.font = 'bold 58px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texte, canvas.width / 2, canvas.height / 2 + 2);

    return versTexture(canvas);
  });
}

/** Pneus empilés : gomme sombre avec crampons. */
export function pneusTexture() {
  return memo('pneus', () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(20240);
    ctx.fillStyle = '#17171a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Crampons en quinconce.
    for (let y = 0; y < canvas.height; y += 32) {
      const decal = (y / 32) % 2 ? 12 : 0;
      ctx.fillStyle = '#232327';
      for (let x = -24; x < canvas.width + 24; x += 24) {
        ctx.fillRect(x + decal, y + 5, 14, 22);
      }
    }

    // Poussière et usure.
    for (let i = 0; i < 500; i++) {
      const x = rnd() * canvas.width;
      const y = rnd() * canvas.height;
      ctx.fillStyle = `rgba(140,120,90,${(rnd() * 0.12).toFixed(3)})`;
      ctx.fillRect(x, y, 2, 2);
    }
    return versTexture(canvas);
  });
}

/** Tribunes : rangées de sièges. */
export function tribuneTexture() {
  return memo('tribune', () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(777);
    ctx.fillStyle = '#26313f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rangs = 8;
    for (let r = 0; r < rangs; r++) {
      const y = r * (canvas.height / rangs);
      // Dossier.
      ctx.fillStyle = '#232c38';
      ctx.fillRect(0, y, canvas.width, 10);
      // Assise : deux teintes sourdes alternées, comme les sièges d'un stand.
      ctx.fillStyle = r % 2 ? '#7a4a42' : '#5c6672';
      ctx.fillRect(0, y + 10, canvas.width, 14);
      // Ombre sous le rang.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y + 24, canvas.width, 8);
    }

    // Quelques spectateurs.
    for (let i = 0; i < 260; i++) {
      const x = rnd() * canvas.width;
      const y = 10 + Math.floor(rnd() * rangs) * (canvas.height / rangs);
      ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)},45%,60%)`;
      ctx.fillRect(x, y + 4, 3, 5);
    }
    return versTexture(canvas);
  });
}

/** Métal : poteaux, portique, lampadaires. */
export function metalTexture() {
  return memo('metal', () => {
    const { canvas, ctx } = toile(128, 256);
    const rnd = alea(4242);
    const degrade = ctx.createLinearGradient(0, 0, canvas.width, 0);
    degrade.addColorStop(0, '#6d7480');
    degrade.addColorStop(0.45, '#9aa2ad');
    degrade.addColorStop(0.55, '#b6bcc5');
    degrade.addColorStop(1, '#5d646f');
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rayures verticales.
    for (let i = 0; i < 90; i++) {
      const x = rnd() * canvas.width;
      ctx.fillStyle = `rgba(255,255,255,${(rnd() * 0.06).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * canvas.width;
      ctx.fillStyle = `rgba(0,0,0,${(rnd() * 0.08).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    return versTexture(canvas);
  });
}

/** Rocher : nuances grises, utilisé pour les rochers et les murets. */
export function rocherTexture() {
  return memo('rocher', () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(99);
    ctx.fillStyle = '#8d8d8a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Taches sombres et claires.
    for (let i = 0; i < 900; i++) {
      const x = rnd() * canvas.width;
      const y = rnd() * canvas.height;
      const r = 2 + rnd() * 9;
      const clair = rnd() > 0.5;
      ctx.fillStyle = clair
        ? `rgba(200,200,195,${(rnd() * 0.16).toFixed(3)})`
        : `rgba(70,70,68,${(rnd() * 0.18).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fissures.
    ctx.strokeStyle = 'rgba(50,50,48,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      let x = rnd() * canvas.width;
      let y = rnd() * canvas.height;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 60;
        y += (rnd() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return versTexture(canvas);
  });
}

/** Écorce : troncs d'arbres. */
export function ecorceTexture() {
  return memo('ecorce', () => {
    const { canvas, ctx } = toile(128, 256);
    const rnd = alea(31337);
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Fibres verticales.
    for (let i = 0; i < 220; i++) {
      const x = rnd() * canvas.width;
      const l = 20 + rnd() * 80;
      ctx.fillStyle = rnd() > 0.5
        ? `rgba(28,18,10,${(rnd() * 0.35).toFixed(3)})`
        : `rgba(120,90,60,${(rnd() * 0.3).toFixed(3)})`;
      ctx.fillRect(x, rnd() * canvas.height, 1 + rnd() * 2, l);
    }
    return versTexture(canvas);
  });
}

/** Gravier : granulats clairs et sombres. */
export function gravierTex() {
  return memo('gravier-procedural', () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(5150);
    ctx.fillStyle = '#9a8f7c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * canvas.width;
      const y = rnd() * canvas.height;
      ctx.fillStyle = rnd() > 0.5
        ? `rgba(60,52,42,${(rnd() * 0.25).toFixed(3)})`
        : `rgba(210,200,180,${(rnd() * 0.2).toFixed(3)})`;
      ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    return versTexture(canvas);
  });
}

/** Feuillage : texture de feuilles pour les arbres et les buissons. */
export function feuillageTexture(cle = 'vert', fond = '#2f5d2a', tache = '#55a04b') {
  return memo(`feuillage:${cle}`, () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(cle.length * 7919 + 13);
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Touffes de feuilles.
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * canvas.width;
      const y = rnd() * canvas.height;
      const r = 1 + rnd() * 4;
      ctx.fillStyle = rnd() > 0.45
        ? tache
        : `rgba(20,40,18,${(rnd() * 0.35).toFixed(3)})`;
      ctx.globalAlpha = 0.35 + rnd() * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return versTexture(canvas);
  });
}

/** Peinture métallisée : paillettes fines, à multiplier par la couleur. */
export function peintureTexture() {
  return memo('peinture', () => {
    const { canvas, ctx } = toile(256, 256);
    const rnd = alea(2024);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 9000; i++) {
      const v = 190 + Math.floor(rnd() * 65);
      ctx.fillStyle = `rgba(${v},${v},${v},0.55)`;
      ctx.fillRect(rnd() * canvas.width, rnd() * canvas.height, 1, 1);
    }
    return versTexture(canvas);
  });
}

/** Carbone tissé : aileron, diffuseur, jantes. */
export function carboneTexture() {
  return memo('carbone', () => {
    const { canvas, ctx } = toile(128, 128);
    const taille = 8;
    for (let y = 0; y < 128; y += taille) {
      for (let x = 0; x < 128; x += taille) {
        const pair = ((x + y) / taille) % 2 === 0;
        ctx.fillStyle = pair ? '#26292e' : '#14161a';
        ctx.fillRect(x, y, taille, taille);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, taille, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + taille - 1, taille, 1);
      }
    }
    return versTexture(canvas);
  });
}

/** Rondel de numéro de course, pour le capot. */
export function numeroTexture(chiffre) {
  return memo(`numero:${chiffre}`, () => {
    const { canvas, ctx } = toile(128, 128);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1d2126';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#16181c';
    ctx.font = 'bold 60px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(chiffre), 64, 68);
    return versTexture(canvas);
  });
}

/**
 * Eau : carte de couleur et **carte de normales** calculée d'un champ de
 * hauteur (interférence de vagues). La normale encode les pentes des vagues
 * : éclairée, la surface ondule bien plus qu'un simple aplat bleu.
 */

/** Champ de hauteur des vagues, partagé par les deux cartes. */
function champVagues(taille) {
  const h = new Float32Array(taille * taille);
  const K = Math.PI * 2 / taille;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const u = x * K;
      const v = y * K;
      // Quatre trains de vagues croisées, plus un petit clapotis.
      h[y * taille + x] =
        Math.sin(u * 3 + v * 1.2) * 0.55 +
        Math.sin(u * 1.4 - v * 2.7 + 1.3) * 0.4 +
        Math.sin(u * 5.2 + v * 4.1 + 2.1) * 0.22 +
        Math.sin(u * 9.1 - v * 7.6) * 0.1;
    }
  }
  return h;
}

export function eauTexture() {
  return memo('eau-couleur', () => {
    const taille = 256;
    const { canvas, ctx } = toile(taille, taille);
    const img = ctx.createImageData(taille, taille);
    const h = champVagues(taille);
    // Bleu profond : la scène l'éclaire fortement (soleil + ciel), une
    // carte claire donne une eau gris pâle à l'écran.
    for (let i = 0; i < taille * taille; i++) {
      // Crête de vague = un peu plus clair.
      const c = 0.85 + h[i] * 0.15;
      img.data[i * 4] = Math.min(255, Math.round(14 * c));
      img.data[i * 4 + 1] = Math.min(255, Math.round(51 * c));
      img.data[i * 4 + 2] = Math.min(255, Math.round(82 * c));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // Ce sont des couleurs, pas des données : conversion sRGB. Interprétée
    // en linéaire, la carte donne une eau gris clair délavée.
    return versTexture(canvas, { srgb: true });
  });
}

export function eauNormales() {
  return memo('eau-normales', () => {
    const taille = 256;
    const { canvas, ctx } = toile(taille, taille);
    const img = ctx.createImageData(taille, taille);
    const h = champVagues(taille);
    const AMPL = 3.2; // force du relief, en pixels de haut par unité de h
    for (let y = 0; y < taille; y++) {
      for (let x = 0; x < taille; x++) {
        const i = y * taille + x;
        // Dérivées par différences finies, avec rebouclage.
        const hx = h[y * taille + ((x + 1) % taille)] - h[y * taille + ((x - 1 + taille) % taille)];
        const hy = h[((y + 1) % taille) * taille + x] - h[((y - 1 + taille) % taille) * taille + x];
        // Normale de la surface z = h(x, y), renormalisée puis encodée.
        const nx = -hx * AMPL;
        const ny = -hy * AMPL;
        const nz = 2;
        const l = Math.hypot(nx, ny, nz);
        img.data[i * 4] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
        img.data[i * 4 + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
        img.data[i * 4 + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return versTexture(canvas, { srgb: false });
  });
}

/** Cactus : colonne verte à côtes verticales. */
export function cactusTexture() {
  return memo('cactus', () => {
    const { canvas, ctx } = toile(128, 256);
    const rnd = alea(8102);
    ctx.fillStyle = '#3d6b35';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Côtes verticales : clair sur l'arête, ombre dans le creux.
    for (let x = 0; x < canvas.width; x += 14) {
      ctx.fillStyle = '#54844a';
      ctx.fillRect(x, 0, 5, canvas.height);
      ctx.fillStyle = 'rgba(20,40,18,0.4)';
      ctx.fillRect(x + 9, 0, 4, canvas.height);
    }
    // Épines : petites mouchetures claires.
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(230,235,200,${(0.3 + rnd() * 0.4).toFixed(2)})`;
      ctx.fillRect(rnd() * canvas.width, rnd() * canvas.height, 1.5, 1.5);
    }
    return versTexture(canvas);
  });
}
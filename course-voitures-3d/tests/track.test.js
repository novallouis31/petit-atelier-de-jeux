/**
 * Tests de la géométrie du circuit et des conventions de signe.
 *
 * Ces conventions sont la source de bugs la plus probable du projet :
 * une inversion de signe passerait le test « ça roule » mais produirait
 * des virages à l'envers. On les verrouille donc explicitement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, TRACK_IDS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';

test('les six circuits sont définis et valides', () => {
  assert.equal(TRACK_IDS.length, 6);
  for (const id of TRACK_IDS) {
    const def = TRACKS[id];
    assert.ok(def.name.length > 0, `${id} : nom manquant`);
    assert.ok(def.blurb.length > 0, `${id} : description manquante`);
    assert.ok(def.width > 8, `${id} : route trop étroite`);
    assert.ok(def.harmonics.length > 0, `${id} : forme absente`);
    assert.ok(def.theme, `${id} : thème absent`);
  }
});

test('la boucle du circuit est fermée et de longueur plausible', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(TRACKS[id]);
    assert.ok(t.length > 300, `${id} : boucle trop courte (${t.length.toFixed(0)} m)`);
    assert.ok(t.length < 3000, `${id} : boucle trop longue`);
    assert.equal(t.N, t.pts.length);

    // Le dernier point doit rejoindre le premier.
    const first = t.pts[0];
    const last = t.pts[t.N - 1];
    const gap = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
    assert.ok(gap < t.spacing * 3, `${id} : boucle non fermée (écart ${gap.toFixed(2)} m)`);
  }
});

test('les points sont régulièrement espacés', () => {
  const t = buildTrack(TRACKS.genets);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < t.N; i++) {
    const a = t.pts[i];
    const b = t.pts[(i + 1) % t.N];
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  assert.ok(max - min < t.spacing * 0.35, 'espacement irrégulier');
});

test('les tangentes sont unitaires', () => {
  const t = buildTrack(TRACKS.cigogne);
  for (const p of t.pts) {
    const l = Math.hypot(p.tx, p.ty, p.tz);
    assert.ok(Math.abs(l - 1) < 1e-6, `tangente non normalisée (${l})`);
  }
});

test('l’axe « droite » est perpendiculaire à la tangente', () => {
  const t = buildTrack(TRACKS.aiguille);
  for (const p of t.pts) {
    const dot = p.tx * p.rx + p.ty * p.ry + p.tz * p.rz;
    assert.ok(Math.abs(dot) < 1e-6, `axe non perpendiculaire (${dot})`);
  }
});

test('la normale de la route pointe vers le haut', () => {
  const t = buildTrack(TRACKS.saut);
  for (const p of t.pts) {
    assert.ok(p.ny > 0.9, `normale non verticale (${p.ny.toFixed(3)})`);
    // La normale est perpendiculaire à la route.
    const d1 = p.tx * p.nx + p.ty * p.ny + p.tz * p.nz;
    const d2 = p.rx * p.nx + p.ry * p.ny + p.rz * p.nz;
    assert.ok(Math.abs(d1) < 1e-6, 'normale non perpendiculaire à la tangente');
    assert.ok(Math.abs(d2) < 1e-6, 'normale non perpendiculaire à l’axe droite');
  }
});

test('l’altitude varie sur les circuits qui le demandent', () => {
  const plat = buildTrack(TRACKS.genets);
  const relief = buildTrack(TRACKS.saut);
  const etendue = (t) => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of t.pts) {
      min = Math.min(min, p.y);
      max = Math.max(max, p.y);
    }
    return max - min;
  };
  assert.ok(etendue(relief) > 10, 'circuit « Saut » sans relief');
  assert.ok(etendue(plat) > 3, 'circuit « Genêts » sans relief');
});

test('le dévers est borné et présente le bon signe', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(TRACKS[id]);
    const maxDeg = TRACKS[id].maxBank ?? 9;
    for (const p of t.pts) {
      const deg = (p.bank * 180) / Math.PI;
      assert.ok(Math.abs(deg) <= maxDeg + 1e-6, `${id} : dévers hors bornes (${deg.toFixed(1)}°)`);
    }
  }
});

test('le dévers abaisse le côté droit dans un virage à droite', () => {
  const t = buildTrack(TRACKS.aiguille);
  // On cherche le virage le plus serré à droite.
  let best = null;
  for (const p of t.pts) {
    if (!best || p.curvS > best.curvS) best = p;
  }
  assert.ok(best.curvS > 0, 'aucun virage à droite trouvé');
  assert.ok(best.bank > 0, 'dévers de signe incorrect dans un virage à droite');

  // L'axe « droite » de la route doit pencher vers le bas (r.y < 0).
  assert.ok(best.ry < 0, 'le côté droit n’est pas plus bas dans un virage à droite');
});

test('locate retrouve la progression et l’écart latéral', () => {
  const t = buildTrack(TRACKS.genets);
  for (let k = 0; k < 20; k++) {
    const s = k / 20;
    const p = t.pointAtS(s);
    const loc = t.locate(p.x, p.z, -1);
    assert.ok(Math.abs(loc.lateral) < 0.5, `écart latéral inattendu (${loc.lateral})`);
    // La progression peut sauter 1 -> 0 à la fermeture de la boucle.
    const d = Math.abs(loc.progress - s);
    assert.ok(d < 0.02 || d > 0.98, `progression inattendue (${loc.progress} vs ${s})`);
  }
});

test('un point décalé à droite a un écart latéral positif', () => {
  const t = buildTrack(TRACKS.escargot);
  const p = t.pointAtS(0.25);
  // L'axe « droite » du point échantillonné.
  const idx = Math.round(0.25 * t.N) % t.N;
  const q = t.pts[idx];
  const lat = 3;
  const loc = t.locate(q.x + q.rx * lat, q.z + q.rz * lat, -1);
  assert.ok(loc.lateral > 2.5, `écart latéral attendu > 2.5, obtenu ${loc.lateral}`);
  assert.ok(loc.onTrack, 'le point décalé devrait être sur la route');
});

test('la ligne de course reste dans la largeur de la route', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(TRACKS[id]);
    const line = t.racingLine(0.45);
    for (let i = 0; i < t.N; i++) {
      assert.ok(
        Math.abs(line[i].offset) <= t.pts[i].half + 1e-6,
        `${id} : la ligne de course sort de la route`
      );
    }
  }
});

test('le rayon minimal reste franchissable', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(TRACKS[id]);
    assert.ok(t.minRadius > 12, `${id} : virage trop serré (${t.minRadius.toFixed(1)} m)`);
  }
});

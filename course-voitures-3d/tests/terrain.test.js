/**
 * Cohérence entre le terrain et la chaussée.
 *
 * Ces tests sont headless : `terrainHeight.js` est un module pur (ni DOM,
 * ni Three.js), et la géométrie de la piste vient de `src/core/`.
 *
 * Ils figent un défaut qui n'apparaissait à l'écran qu'à la capture : le
 * terrain, calculé depuis l'axe seul de la piste, restait **au-dessus** de
 * la chaussée inclinée par le dévers, et la perçait d'un escalier de
 * triangles. Sous la neige, ces triangles sont éclatants ; sous l'herbe,
 * presque invisibles — et aucune erreur en console.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, TRACK_IDS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { hauteurTerrain, niveauEau } from '../src/render/terrainHeight.js';

/** Point de la chaussée au bord, du côté demandé (+1 ou -1). */
function bordRoute(p, side) {
  const d = p.half;
  return {
    x: p.x + p.rx * d * side,
    z: p.z + p.rz * d * side,
    // Altitude de la chaussée : l'axe plus le dévers (convention du
    // maillage de route, `trackMesh.js`).
    y: p.y + p.ry * d * side,
  };
}

/** Hauteur du terrain au point (x, z), comme le fait le maillage. */
function solDuTerrain(track, x, z) {
  const loc = track.locate(x, z, -1);
  return {
    loc,
    sol: hauteurTerrain(
      { x: loc.px, y: loc.py, z: loc.pz, rx: loc.rx, ry: loc.ry, rz: loc.rz },
      loc.dist,
      loc.half,
      x,
      z
    ),
  };
}

/** Échantillonne les points de piste tous les ~4 m (résolution du terrain). */
function echantillons(track) {
  const pas = Math.max(1, Math.round(4 / track.spacing));
  const pts = [];
  for (let i = 0; i < track.N; i += pas) pts.push(track.pts[i]);
  return pts;
}

test('le terrain reste sous la chaussée, des deux côtés', () => {
  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    for (const p of echantillons(track)) {
      for (const side of [1, -1]) {
        const bord = bordRoute(p, side);
        const { sol } = solDuTerrain(track, bord.x, bord.z);
        assert.ok(
          sol <= bord.y + 0.02,
          `${id} : le terrain (${sol.toFixed(2)} m) perce la chaussée (${bord.y.toFixed(2)} m)`
        );
      }
    }
  }
});

test('le terrain reste sous la chaussée entre deux points de piste', () => {
  // Le terrain est une grille de 4 m : un sommet peut tomber entre deux
  // points de piste. La coupe de la route, elle, est tracée point par point.
  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    const pas = Math.max(1, Math.round(4 / track.spacing));
    for (let i = 0; i < track.N; i += pas) {
      const p = track.pts[i];
      const q = track.pts[(i + 1) % track.N];
      for (const side of [1, -1]) {
        const a = bordRoute(p, side);
        const b = bordRoute(q, side);
        const x = (a.x + b.x) / 2;
        const z = (a.z + b.z) / 2;
        const yRoute = (a.y + b.y) / 2;
        const { sol } = solDuTerrain(track, x, z);
        assert.ok(
          sol <= yRoute + 0.02,
          `${id} : le terrain (${sol.toFixed(2)} m) perce la chaussée entre deux points (${yRoute.toFixed(2)} m)`
        );
      }
    }
  }
});

test('le terrain épouse la chaussée déversée', () => {
  // À quelques centimètres de la route, le sol doit suivre la chaussée
  // inclinée : c'est ce qui évite le « trottoir » de terrain d'un côté.
  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    for (const p of echantillons(track)) {
      for (const side of [1, -1]) {
        const d = p.half + 2;
        const x = p.x + p.rx * d * side;
        const z = p.z + p.rz * d * side;
        const { loc, sol } = solDuTerrain(track, x, z);
        const lateral = (x - loc.px) * loc.rx + (z - loc.pz) * loc.rz;
        const yRouteProjetee = loc.py + loc.ry * lateral;
        // Le sol suit la chaussée, puis s'en éloigne de 8 cm par mètre.
        const attendu = yRouteProjetee - 0.18 - Math.max(0, loc.dist - loc.half) * 0.08;
        assert.ok(
          Math.abs(sol - attendu) < 0.01,
          `${id} : le sol (${sol.toFixed(2)} m) s'écarte de la chaussée (${attendu.toFixed(2)} m)`
        );
      }
    }
  }
});

test('le terrain retombe vers le profil libre au loin', () => {
  // Le plan de la chaussée ne doit pas être prolongé indéfiniment :
  // sinon le terrain grimpe en murée du côté surélevé du dévers (et le
  // versant d'en face passe à l'ombre). Le relief du lointain (bruit de
  // ±2,4 m) reste autorisé.
  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    for (const p of echantillons(track)) {
      // Référence : le point de piste lui-même, prolongé latéralement.
      const ref = { x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz };
      const cotes = [1, -1].map((side) => {
        const x = p.x + p.rx * 80 * side;
        const z = p.z + p.rz * 80 * side;
        return hauteurTerrain(ref, 80, p.half, x, z);
      });
      const ecart = Math.abs(cotes[0] - cotes[1]);
      assert.ok(
        ecart < 12,
        `${id} : le terrain est disproportionné d'un côté à 80 m (${ecart.toFixed(1)} m)`
      );
      for (const h of cotes) {
        assert.ok(
          h < p.y + 3,
          `${id} : le terrain grimpe à ${h.toFixed(1)} m (axe à ${p.y.toFixed(1)} m) à 80 m`
        );
      }
    }
  }
});

test('le niveau d’eau est sous le point le plus bas de la piste', () => {
  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    const niveau = niveauEau(track, TRACKS[id].theme);
    if (niveau === null) continue;
    let plusBas = Infinity;
    for (const p of track.pts) if (p.y < plusBas) plusBas = p.y;
    assert.ok(
      niveau < plusBas,
      `${id} : le niveau d'eau (${niveau.toFixed(1)} m) est au-dessus de la piste`
    );
  }
});

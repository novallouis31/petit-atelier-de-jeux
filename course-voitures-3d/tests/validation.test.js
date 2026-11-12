/**
 * Validation du rendu : aucun objet du décor (ou des voitures) ne doit être
 * sans texture.
 *
 * Le faux DOM est minimal : le validateur n'a besoin que de `canvas` (les
 * textures procédurales) et d'un élément image pour les textures Poly Haven.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/* --------------------------------------------------------------------------
   Environnement navigateur simulé (minimal)
   -------------------------------------------------------------------------- */

class FakeContext2D {
  fillRect() {}
  strokeRect() {}
  clearRect() {}
  fillText() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  fill() {}
  stroke() {}
  measureText() { return { width: 10 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.width = 300;
    this.height = 150;
  }
  getContext() { return (this._ctx ||= new FakeContext2D()); }
  addEventListener() {}
  removeEventListener() {}
}

globalThis.document = {
  getElementById: () => new FakeElement('div'),
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (_ns, tag) => new FakeElement(tag),
};
globalThis.Image = class {
  set src(v) { this._src = v; }
  get src() { return this._src; }
  addEventListener() {}
  removeEventListener() {}
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

test('materiauTexte : les cas limites sont couverts', async () => {
  const { materiauTexte } = await import('../src/render/validation.js');

  // Sans texture : refusé.
  assert.equal(materiauTexte(null), false);
  assert.equal(materiauTexte({ color: 0xff0000 }), false);

  // Avec carte : accepté.
  assert.equal(materiauTexte({ map: {} }), true);

  // Exonérations : shader (ciel), vitres, phares.
  assert.equal(materiauTexte({ isShaderMaterial: true }), true);
  assert.equal(materiauTexte({ transparent: true }), true);
  assert.equal(
    materiauTexte({ emissive: { r: 1, g: 1 }, emissiveIntensity: 0.5 }),
    true
  );
  // Une émissive à intensité nulle n'est pas exonérée.
  assert.equal(
    materiauTexte({ emissive: { r: 1, g: 1 }, emissiveIntensity: 0 }),
    false
  );
});

test('le décor des dix circuits est entièrement texturé', async () => {
  const { TRACKS, TRACK_IDS } = await import('../src/core/tracks.js');
  const { buildTrack } = await import('../src/core/track.js');
  const { buildTrackScene } = await import('../src/render/trackMesh.js');
  const { validerScene } = await import('../src/render/validation.js');

  assert.equal(TRACK_IDS.length, 10);

  for (const id of TRACK_IDS) {
    const track = buildTrack(TRACKS[id]);
    const decor = buildTrackScene(track);
    const rapport = validerScene(decor);

    assert.ok(
      rapport.ok,
      `${id} : ${rapport.nonTextures.length} objet(s) sans texture ` +
        `(${JSON.stringify(rapport.nonTextures.slice(0, 5))})`
    );
    assert.ok(rapport.meshes > 5, `${id} : décor trop pauvre (${rapport.meshes} meshes)`);
    assert.ok(rapport.triangles > 10000, `${id} : ${rapport.triangles} triangles ?`);
    // Le décor doit être instancié : les arbres ne peuvent pas être des
    // meshes individuels sans casser les performances.
    assert.ok(rapport.instanced > 0, `${id} : aucun objet instancié`);
  }
});

test('la voiture est entièrement texturée (hors vitres et phares)', async () => {
  const { buildCar } = await import('../src/render/carMesh.js');
  const { validerScene } = await import('../src/render/validation.js');

  const voiture = buildCar({ couleur: 0x42a9ff, numero: 3 });
  const rapport = validerScene(voiture);

  assert.ok(
    rapport.ok,
    `objets sans texture : ${JSON.stringify(rapport.nonTextures)}`
  );
  assert.ok(rapport.meshes > 10, `trop peu de pièces (${rapport.meshes})`);
});

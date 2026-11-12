/*
 * Tests du score final (conversions, monuments).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const scoring = require('../js/scoring.js');
const D = require('../js/data.js');

function fakeState(players) {
  return {
    players,
    board: {
      gears: { palenque: [], yaxchilan: [], tikal: [], uxmal: [], chichenItza: [] },
      startSpace: null,
      skulls: { chichenItza: new Array(9).fill(false) },
    },
  };
}

test('score final : maïs, ressources et crânes', () => {
  const state = fakeState([{
    id: 0,
    name: 'A',
    points: 10,
    resources: { corn: 8, wood: 2, stone: 1, gold: 1, skull: 2 },
    buildings: [],
    monuments: [],
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
    workers: { available: 3, inBank: 0 },
  }]);
  const result = scoring.finalScore(state, state.players[0]);
  // maïs : 8 + 2×2 + 3 + 4 = 19 → 4,75 points
  assert.equal(result.corn, 19);
  assert.equal(result.cornPoints, 4.75);
  assert.equal(result.skullPoints, 6);
  assert.equal(result.points, 10 + 4.75 + 6);
});

test('score final : monument des tombeaux', () => {
  const player = {
    id: 0,
    name: 'A',
    points: 0,
    resources: {},
    buildings: ['b06', 'b07'], // 2 tombeaux
    monuments: ['m01'],
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
    workers: { available: 3, inBank: 0 },
  };
  const state = fakeState([player]);
  const result = scoring.finalScore(state, player);
  // 4 × (2 tombeaux + 1 monument) = 12
  assert.equal(result.monumentPoints, 12);
});

test('score final : monument des crânes (tous les joueurs)', () => {
  const player = {
    id: 0,
    name: 'A',
    points: 0,
    resources: {},
    buildings: [],
    monuments: ['m13'],
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
    workers: { available: 3, inBank: 0 },
  };
  const state = fakeState([player]);
  state.board.skulls.chichenItza = [true, true, true, false, false, false, false, false, false];
  const result = scoring.finalScore(state, player);
  assert.equal(result.monumentPoints, 9); // 3 crânes × 3 points
});

test('score final : monument du sommet technologique', () => {
  const player = {
    id: 0,
    name: 'A',
    points: 0,
    resources: {},
    buildings: [],
    monuments: ['m07'],
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 3, extraction: 3, architecture: 1, theology: 0 },
    workers: { available: 3, inBank: 0 },
  };
  const state = fakeState([player]);
  const result = scoring.finalScore(state, player);
  assert.equal(result.monumentPoints, 20); // 2 technologies au niveau 3
});

test('score final : monument des travailleurs', () => {
  const make = (available, monuments) => ({
    id: 0,
    name: 'A',
    points: 0,
    resources: {},
    buildings: [],
    monuments,
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
    workers: { available, inBank: 0 },
  });
  const m09 = ['m09'];
  assert.equal(scoring.finalScore(fakeState([make(3, m09)]), make(3, m09)).monumentPoints, 0);
  assert.equal(scoring.finalScore(fakeState([make(4, m09)]), make(4, m09)).monumentPoints, 6);
  assert.equal(scoring.finalScore(fakeState([make(5, m09)]), make(5, m09)).monumentPoints, 12);
  assert.equal(scoring.finalScore(fakeState([make(6, m09)]), make(6, m09)).monumentPoints, 18);
});

test('score final : détermination du gagnant (égalité → plus de travailleurs sur les engrenages)', () => {
  const base = () => ({
    points: 10,
    resources: {},
    buildings: [],
    monuments: [],
    cornTiles: 0,
    woodTiles: 0,
    temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
    tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
    workers: { available: 2, inBank: 0 },
  });
  const a = { ...base(), id: 0, name: 'A' };
  const b = { ...base(), id: 1, name: 'B', workers: { available: 0, inBank: 0 } };
  const state = fakeState([a, b]);
  state.board.gears.palenque = [null, { playerId: 1, color: 'x' }];
  const results = scoring.computeResults(state);
  assert.equal(results[0].name, 'B', 'B a plus de travailleurs sur les engrenages');
  assert.equal(results[0].winner, true);
});

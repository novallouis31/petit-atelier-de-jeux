/*
 * Tests de la mise en place : tuiles de richesse initiale, travailleurs
 * factices, tribus, monuments.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { engine, D, drain, createRng } = require('./helpers.js');

/* Partie prête à jouer (richesses et tribus choisies automatiquement). */
function startTurnPhase(options = {}) {
  let state = engine.createGame(options);
  const rng = createRng(options.seed || 1);
  for (let i = 0; i < 200 && engine.currentDecision(state); i++) {
    state = drain(state, rng);
  }
  return state;
}

test('mise en place : chaque joueur choisit 2 tuiles parmi 4', () => {
  const state = engine.createGame({ players: 3, seed: 42 });
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].kind, 'wealth');
  assert.equal(state.pending[0].options.length, 4);
  // Deux choix successifs pour le joueur 1.
  let next = engine.dispatch(state, { type: 'chooseWealth', tileId: state.players[0].wealthOffer[0].id });
  assert.equal(engine.currentDecision(next).kind, 'wealth');
  assert.equal(engine.currentDecision(next).options.length, 3);
  next = engine.dispatch(next, { type: 'chooseWealth', tileId: next.players[0].wealthOffer[1].id });
  // Au tour du joueur 2.
  assert.equal(engine.currentDecision(next).context.playerId, 1);
});

test('mise en place : une tuile déjà choisie ne peut pas être re-choisie', () => {
  const state = engine.createGame({ players: 2, seed: 7 });
  const tileId = state.players[0].wealthOffer[0].id;
  let next = engine.dispatch(state, { type: 'chooseWealth', tileId });
  // Le second choix ignore la tuile déjà prise.
  const again = engine.dispatch(next, { type: 'chooseWealth', tileId });
  assert.equal(again.players[0].wealth.length, 1);
  // Une tuile hors de l'offre est refusée.
  const rejected = engine.dispatch(next, { type: 'chooseWealth', tileId: 'w21' });
  assert.equal(rejected.players[0].wealth.length, 1);
});

test('mise en place : les effets des tuiles de richesse sont appliqués', () => {
  let state = engine.createGame({ players: 2, seed: 1 });
  const offer = state.players[0].wealthOffer;
  let next = engine.dispatch(state, { type: 'chooseWealth', tileId: offer[0].id });
  next = engine.dispatch(next, { type: 'chooseWealth', tileId: offer[1].id });
  const player = next.players[0];
  const expected = { corn: 0, wood: 0, stone: 0, gold: 0, skull: 0 };
  for (const tile of [offer[0], offer[1]]) {
    for (const key of Object.keys(expected)) expected[key] += tile.resources[key] || 0;
  }
  for (const key of Object.keys(expected)) {
    assert.equal(player.resources[key], expected[key], `ressource ${key}`);
  }
  // Effets de technologie éventuels.
  const techSteps = {};
  for (const tile of [offer[0], offer[1]]) {
    for (const effect of tile.effects) {
      if (effect.type === 'technology') {
        techSteps[effect.technology] = (techSteps[effect.technology] || 0) + effect.steps;
      }
    }
  }
  for (const [tech, steps] of Object.entries(techSteps)) {
    assert.equal(player.tech[tech], steps, `technologie ${tech}`);
  }
});

test('mise en place : travailleurs factices (12 en partie à 2, 6 à 3)', () => {
  for (const [players, expected] of [[2, 12], [3, 6], [4, 0]]) {
    const state = startTurnPhase({ players, seed: 3 });
    let count = 0;
    for (const gearId of D.GEAR_ORDER) {
      count += state.board.gears[gearId].filter((w) => w && w.dummy).length;
    }
    assert.equal(count, expected, `${players} joueurs : ${expected} factices`);
  }
});

test('mise en place : 4 monuments à 2 joueurs, 5 à 3, 6 à 4', () => {
  for (const [players, expected] of [[2, 4], [3, 5], [4, 6]]) {
    const state = startTurnPhase({ players, seed: 5 });
    assert.equal(state.board.monuments.filter(Boolean).length, expected);
  }
});

test('mise en place : champs de la jungle (4 par groupe, 3 à 3 joueurs, 2 à 2 joueurs)', () => {
  assert.equal(startTurnPhase({ players: 4, seed: 9 }).board.jungle[0].length, 4);
  assert.equal(startTurnPhase({ players: 3, seed: 9 }).board.jungle[0].length, 3);
  assert.equal(startTurnPhase({ players: 2, seed: 9 }).board.jungle[0].length, 2);
});

test('mise en place : extension Tribes & Prophecies (choix de tribu)', () => {
  let state = engine.createGame({
    players: 2,
    seed: 11,
    expansion: { tribes: true, prophecies: true, quickActions: true },
  });
  const rng = createRng(11);
  let guard = 0;
  while (engine.currentDecision(state) && guard++ < 200) {
    state = drain(state, rng);
  }
  assert.equal(state.phase, 'turn');
  // Tribu choisie pour tous.
  for (const player of state.players) assert.ok(player.tribe);
  // 3 prophéties en réserve.
  assert.equal(state.expansion.prophecies.length, 3);
  // Actions rapides actives.
  assert.ok(state.expansion.quickActions);
});

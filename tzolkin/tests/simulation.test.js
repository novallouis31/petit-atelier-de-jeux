/*
 * Tests de simulation : parties complètes jouées par un bot déterministe.
 * Vérifie que la partie se termine proprement, que les invariants tiennent
 * et que le score est calculé.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { engine, D, playGame } = require('./helpers.js');

function checkInvariants(state, players) {
  assert.equal(state.phase, 'finished', 'la partie est terminée');
  assert.equal(state.calendar.foodDaysDone.length, 4, '4 jours de famine joués');
  assert.equal(state.calendar.round, 27, 'la partie dure 27 rondes au plus');
  for (const player of state.players) {
    assert.ok(player.workers.available >= 0 && player.workers.available <= 6, 'travailleurs valides');
    assert.ok(player.workers.inBank >= 0, 'banque de travailleurs valide');
    // Conservation des travailleurs factices.
    let dummies = 0;
    for (const gearId of D.GEAR_ORDER) {
      dummies += state.board.gears[gearId].filter((w) => w && w.dummy).length;
    }
    if (players < 4) assert.equal(dummies, players === 2 ? 12 : 6, 'les factices restent en jeu');
    // Pas de ressources négatives.
    for (const key of ['corn', 'wood', 'stone', 'gold', 'skull']) {
      assert.ok((player.resources[key] || 0) >= 0, `ressource ${key} positive`);
    }
    for (const tech of D.TECHNOLOGY_ORDER) {
      assert.ok(player.tech[tech] >= 0 && player.tech[tech] <= 3, `technologie ${tech} valide`);
    }
    assert.ok(player.temples.chaac >= 0 && player.temples.chaac <= 6, 'Chaac valide');
    assert.ok(player.temples.quetzalcoatl >= 0 && player.temples.quetzalcoatl <= 8, 'Quetzalcoatl valide');
    assert.ok(player.temples.kukulkan >= 0 && player.temples.kukulkan <= 7, 'Kukulcan valide');
  }
  // Les crânes placés ne dépassent pas la banque.
  const placed = state.board.skulls.chichenItza.filter(Boolean).length;
  assert.ok(placed + state.board.skullsInBank <= 13, 'crânes conservés');
  // Le score peut être calculé.
  const results = require('../js/scoring.js').computeResults(state);
  assert.equal(results.length, state.players.length);
  for (const result of results) {
    assert.ok(typeof result.points === 'number' && Number.isFinite(result.points), 'score fini');
  }
}

test('simulation : partie à 2 joueurs', () => {
  const state = playGame({ players: 2, seed: 1 });
  checkInvariants(state, 2);
});

test('simulation : partie à 3 joueurs', () => {
  const state = playGame({ players: 3, seed: 2 });
  checkInvariants(state, 3);
});

test('simulation : partie à 4 joueurs', () => {
  const state = playGame({ players: 4, seed: 3 });
  checkInvariants(state, 4);
});

test('simulation : partie à 5 joueurs', () => {
  const state = playGame({ players: 5, seed: 4 });
  checkInvariants(state, 5);
});

test('simulation : plusieurs parties à 2 joueurs (graines différentes)', () => {
  for (const seed of [10, 11, 12, 13, 14]) {
    const state = playGame({ players: 2, seed });
    checkInvariants(state, 2);
  }
});

test('simulation : parties avec l’extension (tribus, prophéties, actions rapides)', () => {
  const expansion = { tribes: true, prophecies: true, quickActions: true };
  const state2 = playGame({ players: 2, seed: 20, expansion });
  checkInvariants(state2, 2);
  const state4 = playGame({ players: 4, seed: 21, expansion });
  checkInvariants(state4, 4);
});

test('simulation : parties agressives (le bot agit plus souvent)', () => {
  const state = playGame({ players: 2, seed: 30, greediness: 0.6 });
  checkInvariants(state, 2);
});

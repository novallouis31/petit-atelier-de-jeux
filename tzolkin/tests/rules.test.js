/*
 * Tests ciblés des règles du jeu de base.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { engine, D, drain, createRng } = require('./helpers.js');

/* Partie prête à jouer (richesses choisies), sans extension. */
function readyState(options = {}) {
  let state = engine.createGame({ players: 4, ...options });
  const rng = createRng(options.seed || 1);
  let guard = 0;
  while (engine.currentDecision(state) && guard++ < 200) state = drain(state, rng);
  assert.ok(state.phase === 'turn', 'la partie doit être en phase de jeu');
  return state;
}

/* Trouve l'index d'une option correspondant au prédicat. */
function optionIndex(decision, predicate) {
  return decision.options.findIndex(predicate);
}

/* Force la fin du tour du joueur courant. */
function endTurnAlone(state, playerId, options = {}) {
  if (!options.keepOrder) state.board.order = [playerId];
  state.turn.playerId = playerId;
  state.turn.mode = state.turn.mode || 'place';
  state.turn.placed = Math.max(state.turn.placed, 1);
  return engine.dispatch(state, { type: 'endTurn' });
}

/* Joue un tour normal pour le joueur courant et passe au suivant. */
function endTurnInOrder(state, playerId) {
  state.turn.playerId = playerId;
  state.turn.mode = state.turn.mode || 'place';
  state.turn.placed = Math.max(state.turn.placed, 1);
  return engine.dispatch(state, { type: 'endTurn' });
}

test('coûts de placement : numéro de case + 1 maïs par travailleur déjà placé', () => {
  const state = readyState({ seed: 20 });
  const pid = state.turn.playerId;
  state.players[pid].resources.corn = 20;
  // Les cases 0 et 1 de Tikal sont occupées par un autre joueur.
  state.board.gears.tikal[0] = { playerId: (pid + 1) % 4, color: 'x' };
  state.board.gears.tikal[1] = { playerId: (pid + 1) % 4, color: 'x' };
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', gear: 'tikal', space: 2 });
  assert.equal(next.players[pid].resources.corn, 18, 'case 2 : coût 2');
  next = engine.dispatch(next, { type: 'place', gear: 'yaxchilan', space: 0 });
  assert.equal(next.players[pid].resources.corn, 17, 'case 0 : coût 0 + 1 (2e placement)');
  next = engine.dispatch(next, { type: 'place', start: true });
  assert.equal(next.players[pid].resources.corn, 15, 'joueur de départ : coût 0 + 2 (3e placement)');
  assert.equal(next.turn.placed, 3);
});

test('reprise : action de numéro inférieur payée 1 maïs par case reculée', () => {
  let state = readyState({ seed: 21 });
  const pid = state.turn.playerId;
  state.players[pid].resources.corn = 10;
  // On neutralise les technologies (elles dépendent des tuiles de richesse).
  for (const tech of D.TECHNOLOGY_ORDER) state.players[pid].tech[tech] = 0;
  // Les cases 0 et 1 de Palenque sont occupées : le placement va sur la case 2
  // (récolte du groupe 0 : 4 maïs).
  state.board.gears.palenque[0] = { playerId: (pid + 1) % 4, color: 'x' };
  state.board.gears.palenque[1] = { playerId: (pid + 2) % 4, color: 'x' };
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', gear: 'palenque', space: 2 });
  assert.equal(next.players[pid].resources.corn, 8);
  // Fin de tour puis rotation : le travailleur passe sur Palenque 3.
  next = endTurnAlone(next, pid);
  const worker = next.board.gears.palenque[3];
  assert.ok(worker && worker.playerId === pid, 'le travailleur avance avec la rotation');
  // Reprise : action de la case 2 au lieu de la case 3 → 1 maïs.
  next = engine.dispatch(next, { type: 'mode', mode: 'pickup' });
  next = engine.dispatch(next, { type: 'pickup', gear: 'palenque', space: 3 });
  const decision = engine.currentDecision(next);
  assert.equal(decision.kind, 'workerAction');
  const lower = optionIndex(decision, (o) => o.data.space === 2 && o.data.price === 1);
  assert.ok(lower >= 0, 'l’action inférieure est proposée pour 1 maïs');
  next = engine.dispatch(next, { type: 'resolve', index: lower });
  // Décision de récolte : maïs uniquement (groupe 0 sans bois).
  const harvest = engine.currentDecision(next);
  assert.equal(harvest.kind, 'harvest');
  next = engine.dispatch(next, { type: 'resolve', index: 0 });
  assert.equal(next.players[pid].resources.corn, 8 - 1 + 4, '−1 maïs de recul, +4 de récolte');
  assert.equal(next.players[pid].cornTiles, 1);
});

test('nourrissage : fermes et pénalité de points', () => {
  let state = readyState({ seed: 30 });
  const p0 = state.players[0];
  p0.resources.corn = 3;
  p0.workers = { available: 3, inBank: 0 };
  p0.feedBonus = 1; // une petite ferme
  state.calendar.round = 8; // jour de famine (matériaux)
  state.calendar.day = 7;
  const before = p0.points;
  const next = endTurnAlone(state, 0);
  const player = next.players[0];
  // Coûts [0, 2, 2] : 2 travailleurs nourris, 1 non → −3 points, 1 maïs restant.
  assert.equal(player.points, before - 3);
  assert.equal(player.resources.corn, 1);
  assert.equal(player.fedWorkers, 2);
  // La rotation a bien eu lieu après le jour de famine.
  assert.equal(next.calendar.round, 9);
});

test('nourrissage : tout le monde est nourri quand le maïs suffit', () => {
  let state = readyState({ seed: 31 });
  const p0 = state.players[0];
  p0.resources.corn = 6;
  p0.workers = { available: 3, inBank: 0 };
  state.calendar.round = 8;
  state.calendar.day = 7;
  const next = endTurnAlone(state, 0);
  assert.equal(next.players[0].fedWorkers, 3);
  assert.equal(next.players[0].resources.corn, 0);
});

test('rotation : les travailleurs réels sont éjectés, les factices reviennent en case 0', () => {
  let state = readyState({ seed: 40 });
  const pid = state.turn.playerId;
  state.board.gears.palenque[7] = { playerId: pid, color: 'x' };
  state.board.gears.tikal[7] = { playerId: -1, dummy: true, color: 'x' };
  const before = state.players[pid].workers.available;
  let next = endTurnAlone(state, pid);
  assert.equal(next.players[pid].workers.available, before + 1, 'travailleur éjecté et rendu');
  assert.equal(next.board.gears.tikal[0].dummy, true, 'le factice revient en case 0');
  let dummies = 0;
  for (const gearId of D.GEAR_ORDER) {
    dummies += next.board.gears[gearId].filter((w) => w && w.dummy).length;
  }
  assert.equal(dummies, 1, 'aucun factice ne disparaît');
});

test('privilège d’accélération : 2 jours si le plateau est clair, bloqué par la case 6/9', () => {
  let state = readyState({ seed: 50 });
  const pid = state.turn.playerId;
  state.players[pid].resources.corn = 10;
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', start: true });
  next = endTurnAlone(next, pid);
  const decision = engine.currentDecision(next);
  assert.equal(decision.kind, 'doubleAdvance', 'le privilège est proposé');
  const round = next.calendar.round;
  next = engine.dispatch(next, { type: 'doubleAdvance', double: true });
  assert.equal(next.calendar.round, round + 2, 'le calendrier avance de 2 jours');
  assert.equal(next.players[pid].boardLight, false, 'le plateau passe côté sombre');
  assert.equal(next.phase, 'turn', 'la ronde suivante commence');
});

test('privilège d’accélération : un travailleur en case 6 (ou 9) bloque l’avance de 2 jours', () => {
  let state = readyState({ seed: 51 });
  const pid = state.turn.playerId;
  state.players[pid].resources.corn = 10;
  // Un autre joueur occupe la case 6 de Tikal ; un factice aussi (sans effet).
  state.board.gears.tikal[6] = { playerId: (pid + 1) % 4, color: 'x' };
  state.board.gears.uxmal[6] = { playerId: -1, dummy: true, color: 'x' };
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', start: true });
  next = endTurnAlone(next, pid);
  assert.equal(engine.currentDecision(next), null, 'pas de décision de double avancée');
  assert.equal(next.calendar.round, state.calendar.round + 1, 'avance d’un seul jour');
});

test('privilège d’accélération : un factice en case 6 ne bloque pas', () => {
  let state = readyState({ seed: 52 });
  const pid = state.turn.playerId;
  state.board.gears.tikal[6] = { playerId: -1, dummy: true, color: 'x' };
  state.players[pid].resources.corn = 10;
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', start: true });
  next = endTurnAlone(next, pid);
  assert.equal(engine.currentDecision(next)?.kind, 'doubleAdvance');
});

test('maïs accumulé : récupéré à la fin du tour du joueur de la case de départ', () => {
  let state = readyState({ seed: 60 });
  const pid = state.turn.playerId;
  state.calendar.cornOnGear = 5;
  state.players[pid].resources.corn = 10;
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', start: true });
  assert.equal(next.players[pid].resources.corn, 10, 'le maïs n’est pas pris avant la fin du tour');
  next = engine.dispatch(next, { type: 'endTurn' });
  assert.equal(next.players[pid].resources.corn, 15);
  assert.equal(next.calendar.cornOnGear, 0);
});

test('sommet de temple : une seule personne par marche', () => {
  let state = readyState({ seed: 70 });
  state.players[0].temples.chaac = 4;
  state.players[1].temples.chaac = 5; // occupe la marche 5
  // Le joueur 0 tente de monter sur Chaac 5, occupé par le joueur 1.
  state.pending = [{
    kind: 'temple',
    prompt: 'test',
    context: { playerId: 0, steps: 1 },
    options: [{ label: 'Chaac', data: { temple: 'chaac' } }],
  }];
  let next = engine.dispatch(state, { type: 'resolve', index: 0 });
  assert.equal(next.players[0].temples.chaac, 4, 'montée refusée');
  // Le joueur 1 descend : la marche 5 est libre.
  next.players[1].temples.chaac = 2;
  next.pending = [{
    kind: 'temple',
    prompt: 'test',
    context: { playerId: 0, steps: 1 },
    options: [{ label: 'Chaac', data: { temple: 'chaac' } }],
  }];
  next = engine.dispatch(next, { type: 'resolve', index: 0 });
  assert.equal(next.players[0].temples.chaac, 5);
});

test('monter au sommet d’un temple rend le plateau clair', () => {
  let state = readyState({ seed: 71 });
  state.players[0].temples.kukulkan = 6; // sommet = 7
  state.players[0].boardLight = false;
  state.pending = [{
    kind: 'temple',
    prompt: 'test',
    context: { playerId: 0, steps: 1 },
    options: [{ label: 'Kukulcan', data: { temple: 'kukulkan' } }],
  }];
  const next = engine.dispatch(state, { type: 'resolve', index: 0 });
  assert.equal(next.players[0].temples.kukulkan, 7);
  assert.equal(next.players[0].boardLight, true);
});

test('Chichen Itza : dépôt de crâne, points et marche de temple', () => {
  let state = readyState({ seed: 80 });
  const pid = state.turn.playerId;
  // On repart des marches de départ pour que la montée de Chaac soit libre.
  for (const p of state.players) {
    for (const temple of D.TEMPLE_ORDER) p.temples[temple] = 1;
  }
  state.players[pid].resources.skull = 1;
  state.players[pid].resources.corn = 10;
  // La case 0 est occupée : le placement va sur la case 1 (crâne 4 pts).
  state.board.gears.chichenItza[0] = { playerId: (pid + 1) % 4, color: 'x' };
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', gear: 'chichenItza', space: 1 });
  next = endTurnAlone(next, pid);
  // Rotation : le travailleur est maintenant sur la case 2 (crâne 5 pts).
  next = engine.dispatch(next, { type: 'mode', mode: 'pickup' });
  next = engine.dispatch(next, { type: 'pickup', gear: 'chichenItza', space: 2 });
  const decision = engine.currentDecision(next);
  const actionIdx = optionIndex(decision, (o) => o.data.mode === 'action' && o.data.space === 2);
  next = engine.dispatch(next, { type: 'resolve', index: actionIdx });
  const player = next.players[pid];
  assert.equal(player.resources.skull, 0);
  assert.equal(player.points, 5);
  assert.equal(next.board.skulls.chichenItza[1], true, 'le crâne occupe la case 2');
  assert.equal(player.temples.chaac, 2, '1 marche de Chaac');
});

test('Chichen Itza : une action de crâne déjà utilisée est interdite', () => {
  let state = readyState({ seed: 81 });
  const pid = state.turn.playerId;
  const player = state.players[pid];
  player.resources.skull = 1;
  state.board.skulls.chichenItza[1] = true; // case 2 déjà occupée
  state.board.gears.chichenItza[0] = { playerId: pid, color: 'x' };
  state.board.gears.chichenItza[1] = { playerId: (pid + 1) % 4, color: 'x' };
  // Le travailleur du joueur est sur la case 0 ; il tente d’aller sur la case 2 (bloquée).
  // La reprise depuis la case 0 ne propose aucune action → seulement « ne rien faire ».
  let next = engine.dispatch(state, { type: 'mode', mode: 'pickup' });
  next = engine.dispatch(next, { type: 'pickup', gear: 'chichenItza', space: 0 });
  const decision = engine.currentDecision(next);
  const skullAction = decision.options.filter((o) => o.data.mode === 'action');
  assert.equal(skullAction.length, 0, 'aucune action de crâne disponible');
});

test('fin de tour : les bâtiments construits sont remplacés', () => {
  let state = readyState({ seed: 90 });
  const drawn = state.board.buildingStack[0].id;
  state.board.buildings[2] = null; // comme si un bâtiment venait d’être construit
  const next = endTurnAlone(state, state.turn.playerId);
  assert.equal(next.board.buildings[2].id, drawn);
});

test('changement d’âge : les bâtiments de l’âge 2 arrivent au jour de famine 13', () => {
  let state = readyState({ seed: 91 });
  state.calendar.round = 14;
  state.calendar.day = 13;
  const age2 = state.board.buildingStack2.slice(0, 6);
  let next = endTurnAlone(state, state.turn.playerId);
  assert.deepEqual(next.board.buildings, age2);
  assert.equal(next.board.buildingStack.length, 0);
});

test('quémandage : obligatoire si le joueur ne peut ni placer ni reprendre', () => {
  let state = readyState({ seed: 100 });
  const first = state.turn.playerId;
  state.board.order = [first, (first + 1) % 4];
  const other = state.board.order[1];
  state.players[other].resources.corn = 0;
  state.players[other].workers = { available: 2, inBank: 1 };
  // La case du joueur de départ et la case 0 de chaque engrenage sont occupées.
  state.board.startSpace = { playerId: first };
  for (const gearId of D.GEAR_ORDER) {
    state.board.gears[gearId][0] = { playerId: (other + 1) % 4, color: 'x' };
  }
  let next = endTurnInOrder(state, first);
  // Le tour du joueur other commence : quémandage facultatif (0 maïs).
  let decision = engine.currentDecision(next);
  assert.equal(decision.kind, 'beg');
  const refuse = optionIndex(decision, (o) => o.data.beg === false);
  next = engine.dispatch(next, { type: 'beg', beg: false });
  // ... mais le placement est impossible → quémandage obligatoire.
  assert.equal(next.players[other].resources.corn, 3);
  decision = engine.currentDecision(next);
  assert.equal(decision.kind, 'angerTemple', 'les dieux se fâchent');
  const chaac = optionIndex(decision, (o) => o.data.temple === 'chaac');
  next = engine.dispatch(next, { type: 'resolve', index: chaac });
  assert.equal(next.players[other].temples.chaac, 0, 'une marche de temple est perdue');
});

test('marché : vente au taux du marché', () => {
  let state = readyState({ seed: 110 });
  const pid = state.turn.playerId;
  state.players[pid].resources.wood = 2;
  state.pending = [{
    kind: 'trade',
    prompt: 'test',
    context: { playerId: pid },
    options: [
      { label: 'Vendre 1 bois', data: { type: 'sell', key: 'wood' } },
      { label: 'Terminer', data: { stop: true } },
    ],
  }];
  let next = engine.dispatch(state, { type: 'resolve', index: 0 });
  assert.equal(next.players[pid].resources.wood, 1);
  assert.equal(next.players[pid].resources.corn, state.players[pid].resources.corn + 2);
  // Le marché propose de continuer, puis on termine.
  assert.equal(engine.currentDecision(next).kind, 'trade');
  const stop = engine.currentDecision(next).options.length - 1;
  next = engine.dispatch(next, { type: 'resolve', index: stop });
  assert.equal(engine.currentDecision(next), null);
});

test('invariant : le maïs sur la dent s’accumule quand personne ne prend la case de départ', () => {
  let state = readyState({ seed: 120 });
  const pid = state.turn.playerId;
  state.players[pid].resources.corn = 10;
  let next = engine.dispatch(state, { type: 'mode', mode: 'place' });
  next = engine.dispatch(next, { type: 'place', gear: 'palenque', space: 0 });
  next = endTurnAlone(next, pid);
  assert.equal(next.calendar.cornOnGear, 1, '1 maïs par ronde sans prise de la case');
});

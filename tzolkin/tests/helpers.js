/*
 * Aide au test : un « bot » qui joue une partie complète en répondant
 * automatiquement à toutes les décisions du moteur. Sert aux simulations
 * (partie entière sans plantage) et aux tests ciblés.
 */
'use strict';

const path = require('node:path');
const engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const D = engine.D;

/* Générateur pseudo-aléatoire déterministe (xorshift), comme le moteur. */
function createRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  next.int = (max) => Math.floor(next() * max);
  return next;
}

/*
 * Répond automatiquement à la décision courante.
 * `pick` : (state, decision) => index de l'option choisie.
 * Certaines décisions ont une action dédiée plutôt que « resolve ».
 */
function resolvePending(state, pick) {
  const decision = engine.currentDecision(state);
  if (!decision) return state;
  if (!decision.options.length) {
    // Décision sans option : le moteur l'a déjà vidée, on ne devrait pas
    // y arriver ; on échoue explicitement pour le repérer.
    throw new Error(`Décision ${decision.kind} sans option`);
  }
  const index = pick(state, decision);
  const option = decision.options[index];
  switch (decision.kind) {
    case 'wealth':
      return engine.dispatch(state, { type: 'chooseWealth', tileId: option.data.id });
    case 'tribe':
      return engine.dispatch(state, { type: 'chooseTribe', tribeId: option.data.id });
    case 'beg':
      return engine.dispatch(state, { type: 'beg', beg: !!option.data.beg, topUp: !!option.data.topUp });
    case 'doubleAdvance':
      return engine.dispatch(state, { type: 'doubleAdvance', double: !!option.data.double });
    default:
      return engine.dispatch(state, { type: 'resolve', index });
  }
}

/* Stratégie : premier choix, ou aléatoire pondéré. */
function defaultPick(rng, greediness) {
  return (state, decision) => {
    if (decision.kind === 'beg') {
      // Quémander seulement si les dieux l'exigent (option forcée = dernière).
      return decision.options.findIndex((o) => o.data && o.data.beg === false);
    }
    if (decision.kind === 'doubleAdvance') return 1; // avancer d'un seul jour
    if (decision.kind === 'trade') return decision.options.length - 1; // Terminer
    if (decision.kind === 'workerAction') {
      // Le plus souvent « ne rien faire », parfois une action.
      const none = decision.options.findIndex((o) => o.data && o.data.mode === 'none');
      if (none >= 0 && rng() > greediness) return none;
      return rng.int(decision.options.length);
    }
    if (rng && rng() > 0.8) return rng.int(decision.options.length);
    return 0;
  };
}

/* Coût du placement le moins cher possible (case du joueur de départ incluse). */
function cheapestPlacementCost(state, playerId) {
  const player = state.players[playerId];
  if (state.board.startSpace === null) return 0;
  let best = Infinity;
  for (const gearId of D.GEAR_ORDER) {
    const space = engine.lowestFreeSpace(state, gearId);
    if (space >= 0 && space < best) best = space;
  }
  const surcharge = state.turn.placed;
  return best === Infinity ? Infinity : best + (player.tribe === 'citBolonTum' ? Math.max(0, surcharge - 2) : surcharge);
}

function workersOnGears(state, playerId) {
  return engine.workerCount(state, state.players[playerId]) - state.players[playerId].workers.available;
}

/*
 * Joue un tour complet pour le joueur courant (mode placement ou reprise).
 */
function playTurn(state, rng, greediness) {
  const playerId = state.turn.playerId;
  const player = state.players[playerId];
  const onGears = workersOnGears(state, playerId);
  const canPlace = player.workers.available > 0 && cheapestPlacementCost(state, playerId) <= (player.resources.corn || 0);
  const wantsPickup = onGears > 0 && (!canPlace || rng() < 0.35);

  if (wantsPickup) {
    state = engine.dispatch(state, { type: 'mode', mode: 'pickup' });
    if (state.errors.length) return state;
    while (!engine.currentDecision(state) && state.phase === 'turn' && state.turn.mode === 'pickup' && state.turn.playerId === playerId) {
      const gearId = D.GEAR_ORDER[rng.int(D.GEAR_ORDER.length)];
      const gear = state.board.gears[gearId];
      const candidates = [];
      for (let space = 0; space < gear.length; space++) {
        const worker = gear[space];
        if (worker && !worker.dummy && worker.playerId === playerId) candidates.push(space);
      }
      if (!candidates.length) break;
      const space = candidates[rng.int(candidates.length)];
      const next = engine.dispatch(state, { type: 'pickup', gear: gearId, space });
      if (next === state) break; // reprise refusée
      state = next;
      state = drain(state, rng, greediness);
    }
  } else {
    state = engine.dispatch(state, { type: 'mode', mode: 'place' });
    if (state.errors.length) return state;
    while (!engine.currentDecision(state) && state.phase === 'turn' && state.turn.mode === 'place' && state.turn.playerId === playerId) {
      const playerNow = state.players[playerId];
      const cost = cheapestPlacementCost(state, playerId);
      if (playerNow.workers.available <= 0 || cost > (playerNow.resources.corn || 0)) break;
      let action;
      if (state.board.startSpace === null && rng() < 0.15) {
        action = { type: 'place', start: true };
      } else {
        const gears = D.GEAR_ORDER.filter((id) => engine.lowestFreeSpace(state, id) >= 0
          && engine.lowestFreeSpace(state, id) <= (playerNow.resources.corn || 0));
        if (!gears.length) break;
        const gearId = gears[rng.int(gears.length)];
        action = { type: 'place', gear: gearId, space: engine.lowestFreeSpace(state, gearId) };
      }
      const next = engine.dispatch(state, action);
      if (next === state) break; // placement refusé
      state = next;
      state = drain(state, rng, greediness);
    }
  }
  return state;
}

/* Vidange des décisions en attente. */
function drain(state, rng, greediness) {
  const pick = defaultPick(rng, greediness);
  for (let i = 0; i < 5000 && engine.currentDecision(state); i++) {
    state = resolvePending(state, pick);
  }
  return state;
}

/*
 * Simule la partie jusqu'à la fin. `options` : { seed, players, expansion }.
 * Renvoie l'état final. Échoue (throw) si la partie ne se termine pas.
 */
function playGame(options = {}) {
  const seed = options.seed || 1;
  const rng = createRng(seed);
  let state = engine.createGame({ ...options, seed });
  const maxSteps = options.maxSteps || 400000;
  for (let step = 0; step < maxSteps; step++) {
    state = drain(state, rng, options.greediness ?? 0.25);
    if (state.phase === 'finished') return state;
    if (state.pending.length) continue;
    if (state.phase !== 'turn') throw new Error(`Phase inattendue : ${state.phase}`);
    state = playTurn(state, rng, options.greediness ?? 0.25);
    if (engine.currentDecision(state)) continue;
    const next = engine.dispatch(state, { type: 'endTurn' });
    if (next === state && !state.errors.length) {
      throw new Error(`endTurn refusé sans raison (joueur ${state.turn.playerId + 1}, ronde ${state.calendar.round})`);
    }
    state = next;
  }
  throw new Error(`Partie non terminée après ${maxSteps} pas (ronde ${state.calendar.round}, phase ${state.phase})`);
}

module.exports = {
  engine,
  D,
  createRng,
  playGame,
  playTurn,
  drain,
  resolvePending,
  cheapestPlacementCost,
  workersOnGears,
};

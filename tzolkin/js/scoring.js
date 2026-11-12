/*
 * Tzolk'in : score final.
 *
 * 1. Les ressources sont converties en maïs au taux du marché (2 maïs par bois,
 *    3 par pierre, 4 par or) ;
 * 2. chaque maïs vaut 1/4 de point de victoire ;
 * 3. chaque crâne de cristal conservé vaut 3 points ;
 * 4. les monuments rapportent des points selon leur effet.
 */
(function (root, factory) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.TzolkinData;
  const api = factory(D);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TzolkinScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  function buildingById(id) {
    return D.BUILDINGS.find((b) => b.id === id) || D.EXPANSION_BUILDINGS.find((b) => b.id === id);
  }

  function monumentById(id) {
    return D.MONUMENTS.find((m) => m.id === id);
  }

  function countCategory(player, category) {
    return player.buildings.filter((id) => buildingById(id).category === category).length;
  }

  function monumentScore(player, monument, state) {
    switch (monument.scoreKey) {
      case 'graveyards':
        return 4 * (countCategory(player, 'graveyard') + 1);
      case 'shrines':
        return 4 * (countCategory(player, 'shrine') + 1);
      case 'municipals':
        return 4 * (countCategory(player, 'municipal') + 1);
      case 'constructions':
        return 2 * (player.buildings.length + player.monuments.length);
      case 'cornTiles':
        return 4 * player.cornTiles;
      case 'woodTiles':
        return 4 * player.woodTiles;
      case 'allMonuments': {
        const total = state.players.reduce((sum, p) => sum + p.monuments.length, 0);
        const rate = D.MONUMENT_RATE[state.players.length] || D.MONUMENT_RATE[4];
        return rate * total;
      }
      case 'maxTechnologies': {
        const maxed = D.TECHNOLOGY_ORDER.filter((tech) => player.tech[tech] >= 3).length;
        if (maxed >= 3) return 33;
        if (maxed === 2) return 20;
        if (maxed === 1) return 9;
        return 0;
      }
      case 'technologyLevels': {
        const levels = D.TECHNOLOGY_ORDER.reduce((sum, tech) => sum + player.tech[tech], 0);
        return 3 * levels;
      }
      case 'workers': {
        const inPlay = workerInPlay(state, player);
        if (inPlay <= 3) return 0;
        if (inPlay === 4) return 6;
        if (inPlay === 5) return 12;
        return 18;
      }
      case 'templePoints': {
        return D.TEMPLE_ORDER.reduce((sum, temple) => sum + D.TEMPLES[temple].steps[player.temples[temple]], 0);
      }
      case 'highestTemple': {
        const best = Math.max(...D.TEMPLE_ORDER.map((temple) => player.temples[temple]));
        return 3 * Math.max(0, best - 1);
      }
      case 'allSkulls': {
        const placed = state.board.skulls.chichenItza.filter(Boolean).length;
        return 3 * placed;
      }
      default:
        return 0;
    }
  }

  function workerInPlay(state, player) {
    let count = player.workers.available;
    for (const gearId of D.GEAR_ORDER) {
      for (const worker of state.board.gears[gearId]) {
        if (worker && worker.playerId === player.id) count++;
      }
    }
    if (state.board.startSpace && state.board.startSpace.playerId === player.id) count++;
    return count;
  }

  function workersOnGears(state, player) {
    let count = 0;
    for (const gearId of D.GEAR_ORDER) {
      for (const worker of state.board.gears[gearId]) {
        if (worker && worker.playerId === player.id) count++;
      }
    }
    return count;
  }

  function finalScore(state, player) {
    const cornFromResources =
      (player.resources.wood || 0) * D.RATES.wood +
      (player.resources.stone || 0) * D.RATES.stone +
      (player.resources.gold || 0) * D.RATES.gold;
    const corn = (player.resources.corn || 0) + cornFromResources;
    const cornPoints = corn * D.CORN_PER_POINT;
    const skullPoints = (player.resources.skull || 0) * D.SKULL_POINTS;
    let monumentPoints = 0;
    const details = [];
    for (const id of player.monuments) {
      const monument = monumentById(id);
      if (!monument) continue;
      const points = monumentScore(player, monument, state);
      monumentPoints += points;
      details.push({ name: monument.name, points });
    }
    return {
      playerId: player.id,
      name: player.name,
      points: player.points + cornPoints + skullPoints + monumentPoints,
      markerPoints: player.points,
      corn,
      cornPoints,
      skullPoints,
      monumentPoints,
      monuments: details,
      workersOnGears: workersOnGears(state, player),
    };
  }

  function computeResults(state) {
    const results = state.players.map((player) => finalScore(state, player));
    results.sort((a, b) => b.points - a.points || b.workersOnGears - a.workersOnGears);
    const best = results[0];
    results.forEach((result) => {
      result.winner = result === best && (results.filter((r) => r.points === best.points).length === 1
        || result.workersOnGears === best.workersOnGears);
    });
    return results;
  }

  return { computeResults, finalScore, monumentScore, workerInPlay, workersOnGears };
});

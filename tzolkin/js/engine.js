/*
 * Tzolk'in : moteur de jeu.
 *
 * Le moteur est un automate à états : `dispatch(state, action)` renvoie un
 * nouvel état. Les choix qui demandent une décision du joueur sont empilés
 * dans `state.pending` (pile) ; l'interface les présente une par une.
 */
(function (root, factory) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.TzolkinData;
  const api = factory(D);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TzolkinEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  const clone = (value) => structuredClone(value);
  const RESOURCES = ['corn', 'wood', 'stone', 'gold', 'skull'];
  const RESOURCE_NAMES = { corn: 'maïs', wood: 'bois', stone: 'pierre', gold: 'or', skull: 'crâne' };

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                        */
  /* ------------------------------------------------------------------ */

  function addResources(resources, delta) {
    const out = { ...resources };
    for (const key of RESOURCES) {
      if (delta[key]) out[key] = (out[key] || 0) + delta[key];
    }
    return out;
  }

  function countResourceBlocks(resources) {
    return (resources.wood || 0) + (resources.stone || 0) + (resources.gold || 0);
  }

  function canPay(resources, cost) {
    if (cost.anyResource) return countResourceBlocks(resources) >= (cost.anyResource || 1);
    for (const key of RESOURCES) {
      if ((cost[key] || 0) > (resources[key] || 0)) return false;
    }
    return true;
  }

  function payCost(resources, cost) {
    const out = { ...resources };
    for (const key of RESOURCES) {
      if (cost[key]) out[key] = (out[key] || 0) - cost[key];
    }
    return out;
  }

  function formatCost(cost) {
    const parts = [];
    if (cost.corn) parts.push(`${cost.corn} maïs`);
    if (cost.wood) parts.push(`${cost.wood} bois`);
    if (cost.stone) parts.push(`${cost.stone} pierre`);
    if (cost.gold) parts.push(`${cost.gold} or`);
    if (cost.skull) parts.push(`${cost.skull} crâne`);
    if (cost.anyResource) parts.push(`${cost.anyResource} ressource`);
    return parts.join(', ');
  }

  function describeResources(resources) {
    const parts = [];
    for (const key of RESOURCES) {
      if (resources[key]) parts.push(`${resources[key]} ${RESOURCE_NAMES[key]}`);
    }
    return parts.join(', ') || 'rien';
  }

  /* ------------------------------------------------------------------ */
  /* Générateur pseudo-aléatoire déterministe                          */
  /* ------------------------------------------------------------------ */

  function createRng(seed) {
    let state = (seed >>> 0) || 1;
    const next = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0x100000000;
    };
    next.int = (max) => Math.floor(next() * max);
    next.shuffle = (array) => {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = next.int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return next;
  }

  /* ------------------------------------------------------------------ */
  /* Création de la partie                                              */
  /* ------------------------------------------------------------------ */

  function createGame(options = {}) {
    const playerCount = Math.min(5, Math.max(2, options.players || 2));
    const seed = options.seed || 20240101;
    const rng = createRng(seed);
    const expansion = {
      tribes: !!options.expansion?.tribes,
      prophecies: !!options.expansion?.prophecies,
      quickActions: !!options.expansion?.quickActions,
    };

    const players = [];
    for (let i = 0; i < playerCount; i++) {
      players.push({
        id: i,
        name: (options.names && options.names[i]) || `Joueur ${i + 1}`,
        colorId: D.PLAYER_COLORS[i].id,
        color: D.PLAYER_COLORS[i].color,
        isAI: !!(options.ai && options.ai[i]),
        resources: { corn: 0, wood: 0, stone: 0, gold: 0, skull: 0 },
        workers: { available: 3, inBank: 3 },
        temples: { chaac: 1, quetzalcoatl: 1, kukulkan: 1 },
        tech: { agriculture: 0, extraction: 0, architecture: 0, theology: 0 },
        buildings: [],
        monuments: [],
        wealth: [],
        cornTiles: 0,
        woodTiles: 0,
        skullsPlaced: 0,
        points: 0,
        boardLight: true,
        tribe: null,
        feedBonus: 0, // nombre de travailleurs nourris gratuitement (fermes)
        feedDiscount: 0, // réduction globale du coût de nourriture
        fedWorkers: 0,
        builtThisTurn: 0,
      });
    }

    const age1 = D.BUILDINGS.filter((b) => b.age === 1);
    const age2 = D.BUILDINGS.filter((b) => b.age === 2);
    const useExpansion = expansion.tribes || expansion.prophecies || expansion.quickActions;
    const expansionBuildings = useExpansion ? D.EXPANSION_BUILDINGS : [];
    const age1Pool = rng.shuffle(age1.concat(expansionBuildings.filter((b) => b.age === 1)));
    const age2Pool = rng.shuffle(age2.concat(expansionBuildings.filter((b) => b.age === 2)));

    const state = {
      version: 1,
      options: { players: playerCount, seed, expansion },
      phase: 'setup',
      turn: { number: 1, playerId: 0, mode: null, placed: 0, picked: 0 },
      calendar: { day: 0, round: 1, cornOnGear: 0, advance: 1, foodDaysDone: [] },
      players,
      board: {
        gears: {},
        startSpace: null,
        buildings: age1Pool.slice(0, 6),
        buildingStack: age1Pool.slice(6),
        buildingStack2: age2Pool,
        monuments: rng.shuffle(D.MONUMENTS).slice(0, playerCount + 2),
        jungle: [],
        skulls: { chichenItza: new Array(9).fill(false) },
        skullsInBank: 13,
        order: players.map((p) => p.id),
        startingPlayerMarker: 0,
        dummyWorkers: 0,
        extraActions: {},
      },
      pending: [],
      effects: [],
      log: [],
      expansion: {
        prophecies: [],
        activeProphecy: null,
        tribes: expansion.tribes ? rng.shuffle(D.TRIBES) : [],
        tribeOffer: {},
        quickActions: null,
      },
      result: null,
      errors: [],
    };

    for (const gearId of D.GEAR_ORDER) {
      state.board.gears[gearId] = new Array(D.GEARS[gearId].spaces).fill(null);
    }

    // Jungle : un champ par joueur dans chaque groupe.
    state.board.jungle = [];
    for (let group = 0; group < D.JUNGLE_GROUPS; group++) {
      const fields = [];
      for (let i = 0; i < playerCount; i++) fields.push({ corn: true, wood: group !== 0 });
      state.board.jungle.push(fields);
    }

    // Tuiles de richesse initiale : 4 par joueur.
    const wealthPool = rng.shuffle(D.STARTING_WEALTH);
    let cursor = 0;
    for (const player of players) {
      player.wealthOffer = wealthPool.slice(cursor, cursor + 4);
      cursor += 4;
    }

    // Travailleurs factices (parties à 2 ou 3 joueurs).
    if (playerCount < 4) {
      const dummyCount = playerCount === 2 ? 12 : 6;
      const dummyColor = D.PLAYER_COLORS[playerCount].color;
      const seenGears = new Set();
      let placed = 0;
      while (placed < dummyCount && cursor < wealthPool.length) {
        const tile = wealthPool[cursor++];
        const gearId = tile.gear;
        const space = tile.position;
        if (state.board.gears[gearId][space] === null) {
          state.board.gears[gearId][space] = { playerId: -1, dummy: true, color: dummyColor };
          placed++;
        }
        if (!seenGears.has(gearId)) {
          seenGears.add(gearId);
          if (gearId !== 'chichenItza') {
            const gear = D.GEARS[gearId];
            const opposite = (space + gear.teeth / 2) % gear.teeth;
            if (opposite < gear.spaces && state.board.gears[gearId][opposite] === null && placed < dummyCount) {
              state.board.gears[gearId][opposite] = { playerId: -1, dummy: true, color: dummyColor };
              placed++;
            }
          }
        }
      }
      state.board.dummyWorkers = dummyCount;
    }

    if (expansion.prophecies) {
      state.expansion.prophecies = rng.shuffle(D.PROPHECIES).slice(0, 3).map((p) => p.id);
    }
    if (expansion.quickActions) {
      const age1 = rng.shuffle(D.QUICK_ACTION_AGE1);
      state.expansion.quickActions = {
        age1,
        age2: rng.shuffle(D.QUICK_ACTION_AGE2),
        current: age1[0],
        spaces: [null, null],
      };
    }

    state.pending.push({
      kind: 'wealth',
      prompt: `${players[0].name} : choisissez 2 tuiles de richesse initiale`,
      context: { playerId: 0, chosen: [] },
      options: players[0].wealthOffer.map((tile) => ({ label: describeWealth(tile), data: { id: tile.id } })),
    });
    return state;
  }

  function describeWealth(tile) {
    const parts = [];
    if (tile.resources.corn) parts.push(`${tile.resources.corn} maïs`);
    if (tile.resources.wood) parts.push(`${tile.resources.wood} bois`);
    if (tile.resources.stone) parts.push(`${tile.resources.stone} pierre`);
    if (tile.resources.gold) parts.push(`${tile.resources.gold} or`);
    if (tile.resources.skull) parts.push(`${tile.resources.skull} crâne`);
    for (const effect of tile.effects) {
      if (effect.type === 'temple') parts.push(`+1 marche ${D.TEMPLES[effect.temple].name}`);
      if (effect.type === 'technology') parts.push(`+1 niveau ${D.TECHNOLOGIES[effect.technology].name}`);
      if (effect.type === 'feed') parts.push('1 travailleur nourri gratuitement');
      if (effect.type === 'worker') parts.push('+1 travailleur');
    }
    return parts.length ? parts.join(', ') : 'Aucun effet';
  }

  /* ------------------------------------------------------------------ */
  /* Journal                                                            */
  /* ------------------------------------------------------------------ */

  function log(state, text) {
    state.log.push(text);
    if (state.log.length > 500) state.log.shift();
  }

  /* ------------------------------------------------------------------ */
  /* Décisions et effets                                                */
  /* ------------------------------------------------------------------ */

  function pushDecision(state, decision) {
    state.pending.push(decision);
    return state;
  }

  function currentDecision(state) {
    return state.pending.length ? state.pending[state.pending.length - 1] : null;
  }

  function pushEffect(state, effect) {
    state.effects.push(effect);
    return state;
  }

  function flushEffects(state) {
    while (state.effects.length && !state.pending.length) {
      const effect = state.effects.shift();
      const outcome = applyEffect(state, effect);
      state = outcome.state;
      if (outcome.stop) break;
    }
    return state;
  }

  function refuse(state, message) {
    state.errors.push(message);
    return state;
  }

  function buildingById(id) {
    return D.BUILDINGS.find((b) => b.id === id) || D.EXPANSION_BUILDINGS.find((b) => b.id === id);
  }

  function monumentById(id) {
    return D.MONUMENTS.find((m) => m.id === id);
  }

  /* ------------------------------------------------------------------ */
  /* Extension : prophéties                                             */
  /* ------------------------------------------------------------------ */

  /*
   * La prophétie active est déterminée par le nombre de jours de famine
   * joués : la première s'active après le jour de famine du milieu du premier
   * âge, et chacune marque ses points au jour de famine suivant.
   */
  function activeProphecy(state) {
    if (!state.options.expansion.prophecies) return null;
    return state.expansion.activeProphecy;
  }

  function activateProphecy(state) {
    if (!state.options.expansion.prophecies) return;
    const index = state.calendar.foodDaysDone.length - 1;
    state.expansion.activeProphecy = index >= 0 ? state.expansion.prophecies[index] : null;
  }

  /* Les effets de technologie de niveau 2 sont désactivés par le savoir oublié. */
  function techOn(state, player, tech, level) {
    if (activeProphecy(state) === 'forgottenLore' && level === 2) return false;
    return player.tech[tech] >= level;
  }

  function prophecyMetric(state, player, id, fedWorkers) {
    switch (id) {
      case 'wrathfulGods': return D.TEMPLE_ORDER.reduce((sum, t) => sum + player.temples[t], 0);
      case 'angryGodChaac': return player.temples.chaac;
      case 'angryGodQuetzalcoatl': return player.temples.quetzalcoatl;
      case 'angryGodKukulkan': return player.temples.kukulkan;
      case 'forestFires': return player.woodTiles;
      case 'drought': return player.cornTiles;
      case 'goldShortage': return player.resources.gold || 0;
      case 'desecration': return player.resources.skull || 0;
      case 'teacherShortage': return D.TECHNOLOGY_ORDER.reduce((sum, t) => sum + player.tech[t], 0);
      case 'forgottenLore': return D.TECHNOLOGY_ORDER.filter((t) => player.tech[t] >= 2).length;
      case 'crowdedCities': return player.buildings.length;
      case 'hunger': return fedWorkers;
      case 'highFloodwaters': {
        let count = 0;
        for (const worker of state.board.gears.chichenItza) {
          if (worker && !worker.dummy && worker.playerId === player.id) count++;
        }
        return count;
      }
      default: return 0;
    }
  }

  function prophecyBandScore(id, value) {
    const prophecy = D.PROPHECIES.find((p) => p.id === id);
    const [a, b, c] = prophecy.bands;
    if (value <= a) return D.PROPHECY_BAND_POINTS[0];
    if (value <= b) return D.PROPHECY_BAND_POINTS[1];
    if (value <= c) return D.PROPHECY_BAND_POINTS[2];
    return D.PROPHECY_BAND_POINTS[3];
  }

  /*
   * Taxe de montée de temple (prophétie active) : 1 maïs pour la colère des
   * dieux, 1 bloc de ressource pour le dieu fâché du temple concerné.
   */
  function climbTax(state, templeId) {
    const active = activeProphecy(state);
    if (active === 'wrathfulGods') return { corn: 1 };
    if (active === 'angryGodChaac' && templeId === 'chaac') return { anyResource: 1 };
    if (active === 'angryGodQuetzalcoatl' && templeId === 'quetzalcoatl') return { anyResource: 1 };
    if (active === 'angryGodKukulkan' && templeId === 'kukulkan') return { anyResource: 1 };
    return null;
  }

  /*
   * Applique un gain en tenant compte des taxes de prophétie : la pénurie d'or
   * (1 maïs par or) et la profanation (1 marche de temple par crâne). Le
   * joueur peut toujours refuser la ressource taxée.
   */
  function taxedGain(state, player, resources) {
    const gold = resources.gold || 0;
    const skull = resources.skull || 0;
    const active = activeProphecy(state);
    if (active === 'goldShortage' && gold) {
      const payable = (player.resources.corn || 0) + (resources.corn || 0) >= gold;
      state.pending.push({
        kind: 'prophecyGain',
        prompt: `Prophétie (pénurie d'or) : chaque or gagné coûte 1 maïs`,
        context: { playerId: player.id, resources, taxed: 'gold', count: gold },
        options: [
          ...(payable ? [{ label: `Tout prendre (−${gold} maïs)`, data: { take: 'all' } }] : []),
          { label: 'Ne pas prendre l’or', data: { take: 'rest' } },
        ],
      });
      return { state, stop: true };
    }
    if (active === 'desecration' && skull) {
      const steps = D.TEMPLE_ORDER.reduce((sum, t) => sum + player.temples[t], 0);
      if (steps === 0) return { state: applyGain(state, player, resources), stop: false };
      state.pending.push({
        kind: 'prophecyGain',
        prompt: `Prophétie (profanation) : chaque crâne pris coûte 1 marche de temple`,
        context: { playerId: player.id, resources, taxed: 'skull', count: skull },
        options: [
          { label: `Tout prendre (descendre ${skull} marche(s))`, data: { take: 'all' } },
          { label: 'Ne pas prendre les crânes', data: { take: 'rest' } },
        ],
      });
      return { state, stop: true };
    }
    return { state: applyGain(state, player, resources), stop: false };
  }

  function applyGain(state, player, resources) {
    player.resources = addResources(player.resources, resources);
    if (resources.skull) {
      state.board.skullsInBank = Math.max(0, state.board.skullsInBank - resources.skull);
    }
    if (Object.values(resources).some((n) => n > 0)) {
      log(state, `${player.name} gagne ${describeResources(resources)}.`);
    }
    return state;
  }

  /* Surcharge de construction (villes bondées) : +1 bloc ou +2 maïs. */
  function buildingSurcharge(state, withCorn) {
    if (activeProphecy(state) !== 'crowdedCities') return null;
    return withCorn ? { corn: 2 } : { anyResource: 1 };
  }

  /* Récompenses de nourrissage des bâtiments (accordées avant le nourrissage). */
  function buildingFoodRewards(player, day) {
    const rewards = { corn: 0, wood: 0, stone: 0, gold: 0, skull: 0 };
    let any = false;
    for (const id of player.buildings) {
      const building = buildingById(id);
      if (!building) continue;
      for (const effect of building.effects) {
        if (effect.type === 'foodReward') {
          for (const key of RESOURCES) {
            if (effect.resources[key]) {
              rewards[key] += effect.resources[key];
              any = true;
            }
          }
        }
        if (effect.type === 'foodRewardSwitch') {
          if (day <= 14) rewards.wood += 1;
          else rewards.skull += 1;
          any = true;
        }
      }
    }
    return any ? rewards : null;
  }

  /* Récompenses de temple du milieu d'âge, crânes selon la banque. */
  function templeMaterialRewards(state, player) {
    const rewards = { corn: 0, wood: 0, stone: 0, gold: 0, skull: 0 };
    let skulls = 0;
    for (const templeId of D.TEMPLE_ORDER) {
      const track = D.TEMPLES[templeId];
      for (let step = 0; step <= player.temples[templeId]; step++) {
        const reward = track.resources[step];
        if (!reward) continue;
        if (reward === 'skull') skulls += 1;
        else rewards[reward] += 1;
      }
    }
    if (skulls === 0) return Object.values(rewards).some((n) => n > 0) ? rewards : null;
    // Règle officielle : pas assez de crânes pour tout le monde → personne.
    if (state.board.skullsInBank < skulls) return null;
    rewards.skull = skulls;
    return rewards;
  }

  /* ------------------------------------------------------------------ */
  /* Extension : actions rapides                                        */
  /* ------------------------------------------------------------------ */

  /* La tuile d'action rapide correspondant au jour courant. */
  function updateQuickActions(state) {
    const qa = state.expansion.quickActions;
    if (!qa) return;
    const day = state.calendar.day;
    qa.current = day < 14
      ? qa.age1[Math.min(qa.age1.length - 1, Math.floor(day / 2))]
      : qa.age2[Math.min(qa.age2.length - 1, Math.floor((day - 14) / 2))];
  }

  /* L'action rapide courante est-elle exécutable par ce joueur ? */
  function canPerformQuickAction(state, player) {
    const qa = state.expansion.quickActions;
    if (!qa) return false;
    switch (qa.current) {
      case 'technology':
        return D.TECHNOLOGY_ORDER.some((tech) => canAdvance(player, tech));
      case 'trade':
        return tradeOptions(player).length > 0;
      case 'build':
        return state.board.buildings.some((id) => id
          && canBuildWith(state, player, buildingById(id), { withCorn: true, quick: true }));
      default:
        return true;
    }
  }

  function applyEffect(state, effect) {
    const player = state.players[effect.playerId];
    switch (effect.type) {
      case 'gain':
        return taxedGain(state, player, effect.resources);

      case 'pay':
        if (!canPay(player.resources, effect.cost)) return { state: refuse(state, 'Paiement impossible') };
        player.resources = payCost(player.resources, effect.cost);
        return { state };

      case 'payAnyResource': {
        const options = ['wood', 'stone', 'gold']
          .filter((key) => (player.resources[key] || 0) > 0)
          .map((key) => ({ label: `1 ${RESOURCE_NAMES[key]}`, data: { key } }));
        if (!options.length) return { state: refuse(state, 'Aucune ressource disponible') };
        return {
          state: pushDecision(state, {
            kind: 'payAnyResource',
            prompt: 'Choisissez la ressource à payer',
            context: { playerId: player.id, count: effect.count || 1 },
            options,
          }),
          stop: true,
        };
      }

      case 'climbTemple': {
        const steps = effect.steps || 1;
        const candidates = (effect.temple === 'any' ? D.TEMPLE_ORDER : [effect.temple])
          .filter((id) => canClimb(state, player, id));
        if (!candidates.length) return { state };
        if (effect.temple === 'any' && candidates.length > 1) {
          return {
            state: pushDecision(state, {
              kind: 'temple',
              prompt: 'Choisissez le temple à monter',
              context: { playerId: player.id, steps },
              options: candidates.map((id) => ({ label: D.TEMPLES[id].name, data: { temple: id } })),
            }),
            stop: true,
          };
        }
        const stopped = climbTemple(state, player, candidates[0], false);
        if (!stopped && steps > 1) {
          pushEffect(state, { type: 'climbTemple', playerId: player.id, temple: candidates[0], steps: steps - 1 });
        }
        return { state, stop: stopped };
      }

      case 'angerTemple': {
        const options = D.TEMPLE_ORDER
          .filter((temple) => player.temples[temple] > 0)
          .map((temple) => ({ label: D.TEMPLES[temple].name, data: { temple } }));
        if (!options.length) return { state };
        return {
          state: pushDecision(state, {
            kind: 'angerTemple',
            prompt: 'Choisissez le temple où descendre 1 marche',
            context: { playerId: player.id },
            options,
          }),
          stop: true,
        };
      }

      case 'advanceTech': {
        const options = D.TECHNOLOGY_ORDER
          .filter((tech) => effect.free || canAdvance(player, tech))
          .map((tech) => ({ label: D.TECHNOLOGIES[tech].name, data: { technology: tech } }));
        if (!options.length) return { state };
        return {
          state: pushDecision(state, {
            kind: 'tech',
            prompt: 'Choisissez la technologie à avancer',
            context: { playerId: player.id, steps: effect.steps || 1, free: !!effect.free },
            options,
          }),
          stop: true,
        };
      }

      case 'build': {
        const options = state.board.buildings
          .map((id, index) => ({ id, index }))
          .filter(({ id }) => id)
          .filter(({ id }) => canBuildWith(state, player, buildingById(id), effect))
          .map(({ id, index }) => ({
            label: `${buildingById(id).name} — ${formatCost(buildingById(id).cost)}`,
            data: { index, id },
          }));
        if (!options.length) return { state: refuse(state, 'Aucun bâtiment constructible') };
        return {
          state: pushDecision(state, {
            kind: 'build',
            prompt: effect.count > 1 ? 'Choisissez le premier bâtiment' : 'Choisissez le bâtiment à construire',
            context: {
              playerId: player.id,
              count: effect.count || 1,
              withCorn: !!effect.withCorn,
              architecture: !!effect.architecture,
              first: effect.first !== false,
            },
            options,
          }),
          stop: true,
        };
      }

      case 'buildOrMonument': {
        const options = [];
        const monumentOptions = state.board.monuments
          .map((id, index) => ({ id, index }))
          .filter(({ id }) => id && canPay(player.resources, monumentById(id).cost))
          .map(({ id, index }) => ({ label: `Monument : ${monumentById(id).name}`, data: { index, id } }));
        options.push(...monumentOptions);
        const buildingOptions = state.board.buildings
          .map((id, index) => ({ id, index }))
          .filter(({ id }) => id && canBuildWith(state, player, buildingById(id), effect))
          .map(({ id, index }) => ({ label: `Bâtiment : ${buildingById(id).name}`, data: { index, id } }));
        options.push(...buildingOptions);
        if (!options.length) return { state: refuse(state, 'Rien à construire') };
        return {
          state: pushDecision(state, {
            kind: 'buildOrMonument',
            prompt: 'Construisez 2 bâtiments ou 1 monument',
            context: { playerId: player.id, count: effect.count || 2, withCorn: !!effect.withCorn, architecture: !!effect.architecture },
            options,
          }),
          stop: true,
        };
      }

      case 'buildMonument': {
        const options = state.board.monuments
          .map((id, index) => ({ id, index }))
          .filter(({ id }) => id && canPay(player.resources, monumentById(id).cost))
          .map(({ id, index }) => ({ label: `${monumentById(id).name} — ${formatCost(monumentById(id).cost)}`, data: { index, id } }));
        if (!options.length) return { state: refuse(state, 'Aucun monument constructible') };
        return {
          state: pushDecision(state, {
            kind: 'buildMonument',
            prompt: 'Choisissez le monument à construire',
            context: { playerId: player.id },
            options,
          }),
          stop: true,
        };
      }

      case 'performAction':
        return performGearAction(state, effect.playerId, effect.gear, effect.space, effect.context || {});

      case 'trade': {
        return {
          state: pushDecision(state, {
            kind: 'trade',
            prompt: 'Marché : échangez autant de fois que vous voulez',
            context: { playerId: player.id },
            options: tradeOptions(player).concat([{ label: 'Terminer', data: { stop: true } }]),
          }),
          stop: true,
        };
      }

      case 'harvest': {
        const group = effect.group;
        const fields = state.board.jungle[group];
        const action = D.GEARS.palenque.actions[group + 2];
        const exposedCorn = fields.filter((f) => f.corn && !f.wood).length;
        const woodCount = fields.filter((f) => f.wood).length;
        const canBurn = woodCount > 0 && fields.some((f) => f.wood && f.corn);
        const options = [];
        if (exposedCorn > 0 || techOn(state, player, 'agriculture', 2)) {
          options.push({
            label: `Récolter ${harvestCorn(player, action.corn)} maïs${exposedCorn > 0 ? '' : ' (sans tuile)'}`,
            data: { kind: 'corn' },
          });
        }
        if (woodCount > 0) {
          options.push({ label: `Récolter ${harvestWood(player, action.wood)} bois`, data: { kind: 'wood' } });
        }
        if (canBurn) {
          options.push({
            label: `Brûler la forêt : ${harvestCorn(player, action.corn)} maïs (les dieux se fâchent)`,
            data: { kind: 'burn' },
          });
        }
        if (!options.length) return { state: refuse(state, 'Plus de tuiles de récolte') };
        return {
          state: pushDecision(state, {
            kind: 'harvest',
            prompt: 'Choisissez ce que vous récoltez',
            context: { playerId: player.id, group },
            options,
          }),
          stop: true,
        };
      }

      case 'placeSkull': {
        const slot = effect.slot;
        const action = D.GEARS.chichenItza.actions[slot];
        state.board.skulls.chichenItza[slot - 1] = true;
        player.skullsPlaced++;
        player.points += action.points;
        if (action.resource) {
          return {
            state: pushDecision(state, {
              kind: 'gainResource',
              prompt: 'Choisissez le bloc de ressource',
              context: { playerId: player.id, count: 1 },
              options: [
                { label: '1 bois', data: { key: 'wood' } },
                { label: '1 pierre', data: { key: 'stone' } },
                { label: '1 or', data: { key: 'gold' } },
              ],
            }),
            stop: true,
          };
        }
        return { state };
      }

      case 'gainResource': {
        return {
          state: pushDecision(state, {
            kind: 'gainResource',
            prompt: effect.prompt || 'Choisissez le bloc de ressource',
            context: { playerId: player.id, count: effect.count || 1 },
            options: [
              { label: '1 bois', data: { key: 'wood' } },
              { label: '1 pierre', data: { key: 'stone' } },
              { label: '1 or', data: { key: 'gold' } },
            ],
          }),
          stop: true,
        };
      }

      case 'gainResourceChoice': {
        // Suite d'un choix multiple de ressources (décision repoussée).
        return {
          state: pushDecision(state, {
            kind: 'gainResource',
            prompt: effect.prompt || 'Choisissez un autre bloc de ressource',
            context: { playerId: player.id, count: effect.count || 1 },
            options: [
              { label: '1 bois', data: { key: 'wood' } },
              { label: '1 pierre', data: { key: 'stone' } },
              { label: '1 or', data: { key: 'gold' } },
            ],
          }),
          stop: true,
        };
      }

      case 'technologyExchange': {
        const options = D.TECHNOLOGY_ORDER
          .filter((tech) => player.tech[tech] > 0)
          .map((tech) => ({ label: `${D.TECHNOLOGIES[tech].name} (-1)`, data: { technology: tech } }));
        if (!options.length) return { state };
        return {
          state: pushDecision(state, {
            kind: 'techDown',
            prompt: 'Choisissez la technologie à déclasser',
            context: { playerId: player.id },
            options,
          }),
          stop: true,
        };
      }

      case 'foodDay': {
        const foodDay = effect.foodDay;
        const index = effect.playerIndex || 0;
        if (effect.stage === 'buildings') {
          // Récompenses de nourrissage des bâtiments, joueur par joueur.
          if (index < state.players.length) {
            pushEffect(state, { type: 'foodDay', foodDay, stage: 'buildings', playerIndex: index + 1 });
            const rewards = buildingFoodRewards(state.players[index], foodDay.day);
            if (rewards) {
              const outcome = taxedGain(state, state.players[index], rewards);
              return { state: outcome.state, stop: outcome.stop };
            }
            return { state };
          }
          pushEffect(state, { type: 'foodDay', foodDay, stage: 'feeding' });
          return { state };
        }
        if (effect.stage === 'feeding') {
          const hunger = activeProphecy(state) === 'hunger' ? 1 : 0;
          for (const player of state.players) {
            const costs = workerFeedCosts(state, player, hunger);
            let corn = player.resources.corn || 0;
            let fed = 0;
            for (const cost of costs) {
              if (corn < cost) break;
              corn -= cost;
              fed++;
            }
            player.resources.corn = corn;
            const unfed = costs.length - fed;
            if (unfed > 0) {
              const penalty = player.tribe === 'yaluk' ? 5 : D.UNFED_PENALTY;
              player.points -= unfed * penalty;
              log(state, `${player.name} ne peut pas nourrir ${unfed} travailleur(s) (−${unfed * penalty} points).`);
            }
            player.fedWorkers = fed;
          }
          pushEffect(state, { type: 'foodDay', foodDay, stage: 'temples' });
          return { state };
        }
        if (effect.stage === 'temples') {
          // Récompenses des temples, joueur par joueur (gains taxés).
          if (index < state.players.length) {
            pushEffect(state, { type: 'foodDay', foodDay, stage: 'temples', playerIndex: index + 1 });
            const player = state.players[index];
            if (foodDay.type === 'materials') {
              const rewards = templeMaterialRewards(state, player);
              if (rewards) {
                const outcome = taxedGain(state, player, rewards);
                return { state: outcome.state, stop: outcome.stop };
              }
            } else {
              const age = foodDay.day >= 14 ? 2 : 1;
              for (const templeId of D.TEMPLE_ORDER) {
                player.points += D.TEMPLES[templeId].steps[player.temples[templeId]];
              }
              for (const templeId of D.TEMPLE_ORDER) {
                const track = D.TEMPLES[templeId];
                const best = Math.max(...state.players.map((p) => p.temples[templeId]));
                if (player.temples[templeId] === best) {
                  const winners = state.players.filter((p) => p.temples[templeId] === best);
                  player.points += track.ageBonus[age] / winners.length;
                }
              }
              log(state, `${player.name} reçoit les récompenses de fin d’âge.`);
            }
            return { state };
          }
          pushEffect(state, { type: 'foodDay', foodDay, stage: 'scoring' });
          return { state };
        }
        // Marquage des prophéties (prophétie active de ce jour de famine).
        const active = activeProphecy(state);
        if (active) {
          for (const player of state.players) {
            const value = prophecyMetric(state, player, active, player.fedWorkers || 0);
            const points = prophecyBandScore(active, value);
            const label = D.PROPHECIES.find((p) => p.id === active).name;
            if (points !== 0) {
              player.points += points;
              log(state, `${player.name} : prophétie ${label} (${value}) → ${points > 0 ? '+' : ''}${points} points.`);
            } else {
              log(state, `${player.name} : prophétie ${label} (${value}) → 0 point.`);
            }
          }
        }
        // Changement d'âge : les bâtiments de l'âge 1 sont remplacés.
        if (foodDay.day === 13) {
          state.board.buildings = state.board.buildingStack2.slice(0, 6);
          state.board.buildingStack2 = state.board.buildingStack2.slice(6);
          state.board.buildingStack = [];
          log(state, 'Les bâtiments de l’âge 2 remplacent ceux de l’âge 1.');
        }
        return { state };
      }

      case 'passTurn':
        return { state: passTurn(state) };

      case 'advanceCalendar':
        return { state: advanceCalendar(state) };

      case 'quickAction': {
        const qa = state.expansion.quickActions;
        const player = state.players[effect.playerId];
        const tile = D.QUICK_ACTIONS[qa.current];
        log(state, `${player.name} effectue l’action rapide : ${tile.name}.`);
        switch (qa.current) {
          case 'corn':
            player.resources.corn += 3;
            return { state };
          case 'woodCorn':
            player.resources.corn += 1;
            player.resources.wood += 1;
            return { state };
          case 'stone':
            player.resources.stone += 1;
            return { state };
          case 'gold':
            return taxedGain(state, player, { gold: 1 });
          case 'technology':
            return { state: pushEffect(state, { type: 'advanceTech', playerId: player.id, steps: 1 }) };
          case 'trade':
            return { state: pushEffect(state, { type: 'trade', playerId: player.id }) };
          case 'build':
            return { state: pushEffect(state, { type: 'build', playerId: player.id, count: 1, withCorn: true, quick: true }) };
          default:
            return { state };
        }
      }

      case 'ahChuyKak': {
        const player = state.players[effect.playerId];
        const options = [];
        for (const gearId of D.GEAR_ORDER) {
          const gear = state.board.gears[gearId];
          for (let space = 0; space < gear.length; space++) {
            const worker = gear[space];
            if (worker && !worker.dummy && worker.playerId === player.id) {
              options.push({ label: `Reprendre ${D.GEARS[gearId].name} ${space}`, data: { gear: gearId, space } });
            }
          }
        }
        options.push({ label: 'Passer', data: { skip: true } });
        return {
          state: pushDecision(state, {
            kind: 'ahChuyKak',
            prompt: 'Ah Chuy Kak : reprenez un travailleur et effectuez son action',
            context: { playerId: player.id },
            options,
          }),
          stop: true,
        };
      }

      default:
        return { state };
    }
  }

  function harvestCorn(player, base) {
    const agri = player.tech.agriculture;
    return base + (agri >= 1 ? 1 : 0) + (agri >= 3 ? 2 : 0);
  }

  function harvestWood(player, base) {
    return base + (player.tech.extraction >= 1 ? 1 : 0);
  }

  function templeOptions(state, player, temple) {
    const list = temple === 'any' ? D.TEMPLE_ORDER : [temple];
    return list.filter((id) => canClimb(state, player, id)).map((id) => ({ label: D.TEMPLES[id].name, data: { temple: id } }));
  }

  function canClimb(state, player, templeId) {
    const track = D.TEMPLES[templeId];
    const step = player.temples[templeId];
    if (step >= track.steps.length - 1) return false;
    const target = step + 1;
    return !state.players.some((p) => p.id !== player.id && p.temples[templeId] === target);
  }

  function canAdvance(player, technology) {
    const level = player.tech[technology];
    if (level >= 3) return countResourceBlocks(player.resources) >= 1;
    return countResourceBlocks(player.resources) >= level + 1;
  }

  function tradeOptions(player) {
    const options = [];
    for (const [key, rate] of Object.entries(D.RATES)) {
      if ((player.resources[key] || 0) > 0) {
        options.push({ label: `Vendre 1 ${RESOURCE_NAMES[key]} (+${rate} maïs)`, data: { type: 'sell', key } });
      }
      if ((player.resources.corn || 0) >= rate) {
        options.push({ label: `Acheter 1 ${RESOURCE_NAMES[key]} (−${rate} maïs)`, data: { type: 'buy', key } });
      }
    }
    return options;
  }

  function canBuildWith(state, player, building, effect) {
    if (!building) return false;
    const surcharge = buildingSurcharge(state, !!effect.withCorn);
    if (effect.withCorn) {
      const cornCost = cornPrice(building.cost, player, !!effect.quick) + (surcharge ? surcharge.corn : 0);
      return (player.resources.corn || 0) >= cornCost && (building.cost.skull || 0) <= (player.resources.skull || 0);
    }
    const cost = { ...building.cost };
    if (effect.architecture && player.tech.architecture >= 3) {
      // Un bloc de ressources peut être considéré comme gratuit (au choix).
      for (const key of ['wood', 'stone', 'gold']) {
        if (cost[key]) { cost[key] -= 1; break; }
      }
    }
    if (!canPay(player.resources, cost)) return false;
    if (surcharge) {
      // Il faut encore pouvoir payer le bloc de la surtaxe.
      if (countResourceBlocks(payCost(player.resources, cost)) < 1) return false;
    }
    return true;
  }

  function cornPrice(cost, player, noDiscount) {
    let price = countResourceBlocks(cost) * 2;
    if (!noDiscount && player.tech.architecture >= 3) price = Math.max(0, price - 2);
    return price;
  }

  /*
   * Rénovation (bâtiments d'extension b33-b36) : démolir un bâtiment possédant
   * l'icône pour payer les blocs de ressources communs aux deux coûts. Au plus
   * une rénovation par construction. Renvoie true si une décision est en
   * attente.
   */
  function maybeRenovate(state, player, cost, context) {
    if (context.renovationChecked) return false;
    const options = [];
    for (const oldId of player.buildings) {
      const oldBuilding = buildingById(oldId);
      if (!oldBuilding || !oldBuilding.effects.some((e) => e.type === 'renovation')) continue;
      const discount = {};
      for (const key of ['wood', 'stone', 'gold']) {
        const common = Math.min(oldBuilding.cost[key] || 0, cost[key] || 0);
        if (common) discount[key] = common;
      }
      if (discount.wood || discount.stone || discount.gold) {
        options.push({ label: `Rénover ${oldBuilding.name} (−${formatCost(discount)})`, data: { renovate: oldId, discount } });
      }
    }
    if (!options.length) return false;
    options.push({ label: 'Ne pas rénover', data: {} });
    state.pending.push({
      kind: 'renovation',
      prompt: 'Voulez-vous rénover (démolir un bâtiment pour payer moins) ?',
      context: { ...context, playerId: player.id, cost: { ...cost }, renovationChecked: true },
      options,
    });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Actions de jeu                                                     */
  /* ------------------------------------------------------------------ */

  function performGearAction(state, playerId, gearId, space, context = {}) {
    const player = state.players[playerId];
    const gear = D.GEARS[gearId];
    const action = gear.actions[space];
    if (!action) return { state };

    switch (action.kind) {
      case 'wait':
        return { state };

      case 'fish': {
        const bonus = techOn(state, player, 'agriculture', 2) ? 1 : 0;
        player.resources.corn += action.corn + bonus;
        log(state, `${player.name} pêche et gagne ${action.corn + bonus} maïs.`);
        return { state };
      }

      case 'gain': {
        const resources = { ...action.resources };
        if (action.source === 'yaxchilan') {
          if (resources.wood && techOn(state, player, 'extraction', 1)) resources.wood += 1;
          if (resources.stone && techOn(state, player, 'extraction', 2)) resources.stone += 1;
          if (resources.gold && player.tech.extraction >= 3) resources.gold += 1;
          if (resources.skull && player.tech.theology >= 3) resources.skull += 1;
        }
        return taxedGain(state, player, resources);
      }

      case 'harvest':
        return { state: pushEffect(state, { type: 'harvest', playerId, group: action.jungle }) };

      case 'tech':
        return { state: pushEffect(state, { type: 'advanceTech', playerId, steps: action.steps }) };

      case 'build': {
        if (action.withCorn) {
          return { state: pushEffect(state, { type: 'build', playerId, count: action.count, withCorn: true }) };
        }
        if (action.count >= 2) {
          return { state: pushEffect(state, { type: 'buildOrMonument', playerId, count: action.count, architecture: true }) };
        }
        return { state: pushEffect(state, { type: 'build', playerId, count: action.count, architecture: true }) };
      }

      case 'temple': {
        if (action.cost.anyResource) {
          if (!canPay(player.resources, action.cost)) return { state: refuse(state, 'Pas assez de ressources') };
          state = pushEffect(state, { type: 'payAnyResource', playerId, count: action.cost.anyResource });
        } else if (action.cost.corn) {
          if ((player.resources.corn || 0) < action.cost.corn) return { state: refuse(state, 'Pas assez de maïs') };
          player.resources.corn -= action.cost.corn;
        }
        if (action.distinct === 2) {
          const options = [];
          for (const first of D.TEMPLE_ORDER) {
            for (const second of D.TEMPLE_ORDER) {
              if (first === second) continue;
              if (!canClimb(state, player, first) || !canClimb(state, player, second)) continue;
              options.push({ label: `${D.TEMPLES[first].name} + ${D.TEMPLES[second].name}`, data: { temples: [first, second] } });
            }
          }
          if (!options.length) return { state };
          state = pushDecision(state, {
            kind: 'templeTwo',
            prompt: 'Choisissez les deux temples à monter',
            context: { playerId: player.id },
            options,
          });
          return { state, stop: true };
        }
        // Temple au choix (distinct: 1 sans champ temple) : décision ou effet direct.
        const targetTemple = action.temple || 'any';
        const climbOptions = templeOptions(state, player, targetTemple);
        if (climbOptions.length > 1) {
          state = pushDecision(state, {
            kind: 'temple',
            prompt: 'Choisissez le temple à monter',
            context: { playerId: player.id, steps: 1 },
            options: climbOptions,
          });
          return { state, stop: true };
        }
        if (climbOptions.length === 1) {
          state = pushEffect(state, { type: 'climbTemple', playerId, temple: climbOptions[0].data.temple, steps: 1 });
        }
        return { state };
      }

      case 'trade':
        return { state: pushEffect(state, { type: 'trade', playerId }) };

      case 'worker': {
        if (player.workers.inBank <= 0) return { state: refuse(state, 'Aucun travailleur en banque') };
        player.workers.inBank--;
        player.workers.available++;
        log(state, `${player.name} prend un travailleur dans la banque.`);
        return { state };
      }

      case 'skull': {
        if ((player.resources.skull || 0) <= 0) return { state: refuse(state, 'Pas de crâne de cristal') };
        if (state.board.skulls.chichenItza[space - 1]) return { state: refuse(state, 'Ce poste est déjà occupé') };
        player.resources.skull -= 1;
        log(state, `${player.name} dépose un crâne à Chichen Itza (${action.points} points).`);
        state = pushEffect(state, { type: 'climbTemple', playerId, temple: action.temple, steps: 1 });
        state = pushEffect(state, { type: 'placeSkull', playerId, slot: space });
        return { state };
      }

      case 'anyAction': {
        if (action.cost && action.cost.corn) {
          if ((player.resources.corn || 0) < action.cost.corn) return { state: refuse(state, 'Pas assez de maïs') };
          player.resources.corn -= action.cost.corn;
        }
        const gears = action.gears || [gearId];
        const options = [];
        for (const target of gears) {
          for (let s = action.from; s <= action.to; s++) {
            const targetAction = D.GEARS[target].actions[s];
            if (!targetAction || targetAction.kind === 'wait') continue;
            if (!actionAllowed(state, player, target, s)) continue;
            options.push({
              label: `${D.GEARS[target].name} ${s} — ${describeAction(targetAction)}`,
              data: { gear: target, space: s },
            });
          }
        }
        if (!options.length) return { state: refuse(state, 'Aucune action disponible') };
        state = pushDecision(state, {
          kind: 'action',
          prompt: 'Choisissez l’action à effectuer',
          context: { playerId: player.id },
          options,
        });
        return { state, stop: true };
      }

      default:
        return { state };
    }
  }

  function actionAllowed(state, player, gearId, space) {
    const action = D.GEARS[gearId].actions[space];
    if (!action) return false;
    switch (action.kind) {
      case 'skull':
        return (player.resources.skull || 0) > 0 && !state.board.skulls.chichenItza[space - 1];
      case 'temple':
        if (action.cost.corn) return (player.resources.corn || 0) >= action.cost.corn;
        if (action.cost.anyResource) return countResourceBlocks(player.resources) >= action.cost.anyResource;
        return true;
      case 'build':
        return state.board.buildings.some((id) => id && canBuildWith(state, player, buildingById(id), { architecture: true }));
      case 'tech':
        return D.TECHNOLOGY_ORDER.some((tech) => canAdvance(player, tech));
      case 'worker':
        return player.workers.inBank > 0;
      case 'harvest': {
        const fields = state.board.jungle[action.jungle];
        return fields.some((f) => (f.corn && !f.wood) || f.wood) || techOn(state, player, 'agriculture', 2);
      }
      case 'trade':
      case 'fish':
      case 'gain':
        return true;
      default:
        return true;
    }
  }

  function describeAction(action) {
    switch (action.kind) {
      case 'fish': return `${action.corn} maïs`;
      case 'gain': return describeResources(action.resources);
      case 'harvest': return action.wood ? `${action.corn} maïs ou ${action.wood} bois` : `${action.corn} maïs`;
      case 'tech': return action.steps === 1 ? 'avancer 1 technologie' : 'avancer 2 technologies';
      case 'build': return 'construire';
      case 'temple': return 'monter sur un temple';
      case 'trade': return 'échanger au marché';
      case 'worker': return 'prendre un travailleur';
      case 'skull': return `${action.points} points + 1 marche`;
      case 'anyAction': return 'action au choix';
      default: return action.kind;
    }
  }

  /*
   * Monte d'une marche. Renvoie true si une décision est en attente (taxe de
   * prophétie : payer ou renoncer). `force` court-circuite la taxe (déjà payée).
   */
  function climbTemple(state, player, templeId, force) {
    const track = D.TEMPLES[templeId];
    const step = player.temples[templeId];
    if (step + 1 >= track.steps.length) return false;
    if (!force) {
      const tax = climbTax(state, templeId);
      if (tax) {
        const payable = tax.corn
          ? (player.resources.corn || 0) >= tax.corn
          : countResourceBlocks(player.resources) >= 1;
        if (!payable) {
          log(state, `${player.name} renonce à monter sur ${track.name} (prophétie).`);
          return false;
        }
        state.pending.push({
          kind: 'prophecyClimb',
          prompt: `Prophétie : monter sur ${track.name} coûte ${formatCost(tax)}`,
          context: { playerId: player.id, temple: templeId, remaining: 0 },
          options: [
            { label: `Payer ${formatCost(tax)} et monter`, data: { pay: true } },
            { label: 'Renoncer à la montée', data: { pay: false } },
          ],
        });
        return true;
      }
    }
    player.temples[templeId] = step + 1;
    if (player.temples[templeId] === track.steps.length - 1) player.boardLight = true;
    log(state, `${player.name} monte sur ${track.name} (marche ${player.temples[templeId]}).`);
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Dispatch                                                           */
  /* ------------------------------------------------------------------ */

  function dispatch(state, action) {
    let s = clone(state);
    s.errors = [];
    let result = s;
    switch (action.type) {
      case 'chooseWealth': {
        const decision = currentDecision(s);
        if (!decision || decision.kind !== 'wealth') return state;
        const player = s.players[decision.context.playerId];
        const chosen = decision.context.chosen || [];
        const tile = player.wealthOffer.find((t) => t.id === action.tileId && !chosen.includes(t.id));
        if (!tile) return state;
        player.wealth.push(tile.id);
        decision.context.chosen.push(tile.id);
        s.pending.pop();
        applyWealth(s, player, tile);
        if (decision.context.ixtabThird) {
          // Ixtab : après les effets de la 3e tuile, descendre d'une marche.
          s = pushEffect(s, { type: 'angerTemple', playerId: player.id });
          nextTribeSelection(s);
          result = flushEffects(s);
          break;
        }
        if (decision.context.chosen.length < 2) {
          s.pending.push({
            kind: 'wealth',
            prompt: `${player.name} : choisissez 2 tuiles de richesse initiale`,
            context: { playerId: player.id, chosen: decision.context.chosen },
            options: player.wealthOffer
              .filter((t) => !decision.context.chosen.includes(t.id))
              .map((t) => ({ label: describeWealth(t), data: { id: t.id } })),
          });
        } else {
          startGame(s);
        }
        result = flushEffects(s);
        break;
      }

      case 'chooseTribe': {
        const decision = currentDecision(s);
        if (!decision || decision.kind !== 'tribe') return state;
        const player = s.players[decision.context.playerId];
        player.tribe = action.tribeId;
        s.pending.pop();
        if (player.tribe === 'yaluk') {
          player.workers.available += 2;
          player.workers.inBank = Math.max(0, player.workers.inBank - 2);
        }
        if (player.tribe === 'ixtab') {
          // Ixtab : une 3e tuile de richesse, puis une descente de temple.
          const remaining = player.wealthOffer.filter((t) => !player.wealth.includes(t.id));
          if (remaining.length) {
            s.pending.push({
              kind: 'wealth',
              prompt: `${player.name} (Ixtab) : choisissez une 3e tuile de richesse`,
              context: { playerId: player.id, chosen: [], ixtabThird: true },
              options: remaining.map((t) => ({ label: describeWealth(t), data: { id: t.id } })),
            });
            result = s;
            break;
          }
        }
        nextTribeSelection(s);
        result = flushEffects(s);
        break;
      }

      case 'beg': {
        const decision = currentDecision(s);
        if (!decision || decision.kind !== 'beg') return state;
        s.pending.pop();
        const player = s.players[decision.context.playerId];
        if (action.beg) {
          applyBeg(s, player, false);
        } else if (action.topUp) {
          player.resources.corn = Math.max(player.resources.corn || 0, 2);
          if (mustBeg(s, player)) applyBeg(s, player, true);
        } else if (mustBeg(s, player)) {
          // Quémandage obligatoire : le joueur refuse le facultatif mais ne
          // peut ni placer ni reprendre de travailleur.
          applyBeg(s, player, true);
        }
        result = flushEffects(s);
        break;
      }

      case 'mode':
        if (s.turn.mode || s.pending.length) return state;
        s.turn.mode = action.mode;
        // Vacub-Caquix : une fois par tour, traiter une case libre comme occupée.
        {
          const player = s.players[s.turn.playerId];
          if (action.mode === 'place' && player.tribe === 'vacubCaquix' && !s.turn.skipUsed) {
            const options = [{ label: 'Ne pas sauter de case', data: {} }];
            for (const gearId of D.GEAR_ORDER) {
              const gear = s.board.gears[gearId];
              for (let space = 0; space < gear.length; space++) {
                if (gear[space] === null) {
                  options.push({
                    label: `Sauter la case ${space} de ${D.GEARS[gearId].name} (coûterait ${space + placementSurcharge(s, player, s.turn.placed)} maïs)`,
                    data: { gear: gearId, space },
                  });
                  break; // une seule case par engrenage (la plus basse libre)
                }
              }
            }
            s.pending.push({
              kind: 'vacubCaquix',
              prompt: 'Vacub-Caquix : choisissez une case libre à traiter comme occupée',
              context: { playerId: player.id },
              options,
            });
          }
        }
        result = s;
        break;

      case 'place': {
        if (s.turn.mode !== 'place' || s.pending.length) return state;
        const player = s.players[s.turn.playerId];
        const outcome = placeWorker(s, player, action);
        if (!outcome.ok) return state;
        result = flushEffects(outcome.state);
        break;
      }

      case 'pickup': {
        if (s.turn.mode !== 'pickup' || s.pending.length) return state;
        const player = s.players[s.turn.playerId];
        const outcome = pickupWorker(s, player, action);
        if (!outcome.ok) return state;
        result = flushEffects(outcome.state);
        break;
      }

      case 'endTurn': {
        if (s.pending.length) return state;
        result = endTurn(s);
        break;
      }

      case 'resolve': {
        const decision = currentDecision(s);
        if (!decision) return state;
        const option = decision.options[action.index];
        if (!option) return state;
        result = resolveDecision(s, decision, option);
        break;
      }

      case 'doubleAdvance': {
        const decision = currentDecision(s);
        if (!decision || decision.kind !== 'doubleAdvance') return state;
        s.pending.pop();
        s.calendar.advance = action.double ? 2 : 1;
        if (action.double) s.players[decision.context.playerId].boardLight = false;
        result = finishCalendarAdvance(s);
        break;
      }

      default:
        return state;
    }
    result.errors = result.errors || [];
    return result;
  }

  function applyWealth(state, player, tile) {
    player.resources = addResources(player.resources, tile.resources);
    // Le crâne de cristal de la tuile vient de la banque.
    if (tile.resources.skull) {
      state.board.skullsInBank = Math.max(0, state.board.skullsInBank - tile.resources.skull);
    }
    for (const effect of tile.effects) {
      if (effect.type === 'temple') {
        if (canClimb(state, player, effect.temple)) climbTemple(state, player, effect.temple);
      } else if (effect.type === 'technology') {
        player.tech[effect.technology] = Math.min(3, player.tech[effect.technology] + effect.steps);
      } else if (effect.type === 'feed') {
        player.feedBonus += effect.workers;
      } else if (effect.type === 'worker') {
        player.workers.inBank = Math.max(0, player.workers.inBank - 1);
        player.workers.available++;
      }
    }
    log(state, `${player.name} prend la tuile ${tile.name}.`);
  }

  function startGame(state) {
    const next = state.players.find((p) => p.wealth.length < 2);
    if (next) {
      state.pending.push({
        kind: 'wealth',
        prompt: `${next.name} : choisissez 2 tuiles de richesse initiale`,
        context: { playerId: next.id, chosen: [] },
        options: next.wealthOffer.map((tile) => ({ label: describeWealth(tile), data: { id: tile.id } })),
      });
      return;
    }
    if (state.options.expansion.tribes && state.expansion.tribes.length) {
      for (const player of state.players) {
        state.expansion.tribeOffer[player.id] = state.expansion.tribes.splice(0, 2);
      }
      const first = state.players[0];
      state.pending.push({
        kind: 'tribe',
        prompt: `${first.name} : choisissez votre tribu`,
        context: { playerId: first.id },
        options: (state.expansion.tribeOffer[first.id] || []).map((tribe) => ({ label: tribe.name, data: { id: tribe.id } })),
      });
      return;
    }
    beginRound(state);
  }

  function nextTribeSelection(state) {
    const next = state.players.find((p) => !p.tribe);
    if (!next) {
      beginRound(state);
      return;
    }
    const offer = state.expansion.tribeOffer[next.id] || [];
    state.pending.push({
      kind: 'tribe',
      prompt: `${next.name} : choisissez votre tribu`,
      context: { playerId: next.id },
      options: offer.map((tribe) => ({ label: tribe.name, data: { id: tribe.id } })),
    });
  }

  function beginRound(state) {
    state.phase = 'turn';
    state.calendar.round = Math.min(27, state.calendar.round);
    state.turn = { number: state.calendar.round, playerId: state.board.order[0], mode: null, placed: 0, picked: 0 };
    // Actions rapides : les travailleurs reviennent et la tuile du jour
    // courant est mise en place.
    const qa = state.expansion.quickActions;
    if (qa) {
      for (const occupant of qa.spaces) {
        if (occupant) state.players[occupant.playerId].workers.available++;
      }
      qa.spaces = [null, null];
      updateQuickActions(state);
    }
    const player = state.players[state.turn.playerId];
    if (player.tribe === 'bacab' && (player.resources.corn || 0) < 2) player.resources.corn = 2;
    turnStartChecks(state, player);
    return state;
  }

  /*
   * Début de tour :
   * - 2 maïs ou moins : le joueur PEUT quémander (décision facultative) ;
   * - s'il ne peut ni payer le moindre placement ni reprendre de travailleur,
   *   il DOIT quémander (règle officielle, p. 4).
   */
  function turnStartChecks(state, player) {
    // Xaman Ek : une fois par tour, vendre 1 ressource au prix du marché.
    if (player.tribe === 'xamanEk' && countResourceBlocks(player.resources) > 0) {
      state.pending.push({
        kind: 'xamanEk',
        prompt: 'Xaman Ek : voulez-vous vendre une ressource ?',
        context: { playerId: player.id },
        options: ['wood', 'stone', 'gold']
          .filter((key) => (player.resources[key] || 0) > 0)
          .map((key) => ({ label: `Vendre 1 ${RESOURCE_NAMES[key]} (+${D.RATES[key]} maïs)`, data: { key } }))
          .concat([{ label: 'Passer', data: {} }]),
      });
    }
    if ((player.resources.corn || 0) <= 2) {
      state.pending.push(begDecision(player));
      return;
    }
    if (mustBeg(state, player)) applyBeg(state, player, true);
  }

  function mustBeg(state, player) {
    if (workerCount(state, player) !== player.workers.available) return false; // travailleurs sur les engrenages : reprise possible
    // La case du joueur de départ est gratuite : si elle est libre, on peut
    // toujours placer.
    if (state.board.startSpace === null) return false;
    for (const gearId of D.GEAR_ORDER) {
      const target = lowestFreeSpace(state, gearId, player);
      if (target >= 0 && target <= (player.resources.corn || 0)) return false;
    }
    return true;
  }

  function applyBeg(state, player, forced) {
    player.resources.corn = player.tribe === 'bacab' ? 4 : 3;
    log(state, `${player.name} quémande du maïs${forced ? ' (obligé, faute de pouvoir jouer)' : ''} (les dieux se fâchent).`);
    pushEffect(state, { type: 'angerTemple', playerId: player.id });
  }

  /* Le joueur peut-il encore placer au moins un travailleur ce tour-ci ? */
  function canStillPlace(state, player) {
    if (player.workers.available <= 0) return false;
    if (state.board.startSpace === null) return true;
    for (const gearId of D.GEAR_ORDER) {
      const space = lowestFreeSpace(state, gearId, player);
      if (space >= 0 && placementCost(state, player, space, gearId) <= (player.resources.corn || 0)) return true;
    }
    return false;
  }

  function begDecision(player) {
    const options = [];
    if (player.tribe === 'bacab') {
      options.push({ label: 'Quémander (4 maïs, les dieux se fâchent)', data: { beg: true } });
    } else {
      options.push({ label: 'Quémander (3 maïs, les dieux se fâchent)', data: { beg: true } });
    }
    options.push({ label: 'Ne pas quémander', data: { beg: false } });
    return {
      kind: 'beg',
      prompt: 'Vous avez 2 maïs ou moins : voulez-vous quémander ?',
      context: { playerId: player.id },
      options,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Placement et reprise des travailleurs                              */
  /* ------------------------------------------------------------------ */

  function placementSurcharge(state, player, already) {
    if (player.tribe === 'yumkaax') {
      const table = [0, 0, 2, 5, 9, 13];
      const index = Math.min(already, 5);
      return table[index + 1] - table[index];
    }
    if (player.tribe === 'citBolonTum') return Math.max(0, already - 2);
    return already;
  }

  function placementCost(state, player, space, gearId) {
    let cost = space + placementSurcharge(state, player, state.turn.placed);
    // Prophétie (hautes eaux) : 2 maïs de plus sur Chichen Itza.
    if (gearId === 'chichenItza' && activeProphecy(state) === 'highFloodwaters') cost += 2;
    return cost;
  }

  /*
   * La plus basse case libre d'un engrenage. Le joueur Cit-Bolon-Tum dispose
   * d'une case « au choix » supplémentaire au bout de chaque engrenage (à
   * condition qu'elle soit vide) ; Vacub-Caquix peut traiter une case libre
   * comme occupée (une fois par tour).
   */
  function lowestFreeSpace(state, gearId, player) {
    const gear = state.board.gears[gearId];
    const skip = player && player.tribe === 'vacubCaquix' && state.turn && state.turn.skip
      && state.turn.skip.gear === gearId ? state.turn.skip.space : -1;
    for (let space = 0; space < gear.length; space++) {
      if (gear[space] === null && space !== skip) return space;
    }
    if (player && player.tribe === 'citBolonTum' && state.board.extraActions
      && state.board.extraActions[gearId] === null) {
      return gear.length;
    }
    return -1;
  }

  function placeWorker(state, player, action) {
    if (player.workers.available <= 0) return { ok: false };

    // Espace d'action rapide : coût forfaitaire de 1 maïs, un seul par tour,
    // et seulement si l'action est exécutable.
    if (action.quick !== undefined) {
      const qa = state.expansion.quickActions;
      if (!qa || (action.quick !== 0 && action.quick !== 1)) return { ok: false };
      if (qa.spaces[action.quick] !== null || state.turn.quickPlaced) return { ok: false };
      if (!canPerformQuickAction(state, player)) return { ok: false };
      if ((player.resources.corn || 0) < 1) return { ok: false };
      player.resources.corn -= 1;
      qa.spaces[action.quick] = { playerId: player.id };
      state.turn.quickPlaced = true;
      state.turn.quick = action.quick;
      log(state, `${player.name} place un travailleur sur un espace d’action rapide (−1 maïs).`);
      return { ok: true, state };
    }

    let space;
    let gearId = action.gear;
    if (action.start) {
      if (state.board.startSpace !== null) return { ok: false };
      space = 0;
    } else {
      if (!gearId) return { ok: false };
      if (action.extra || action.space === D.GEARS[gearId].spaces) {
        // Case supplémentaire de Cit-Bolon-Tum (au bout de l'engrenage).
        if (player.tribe !== 'citBolonTum' || state.board.extraActions[gearId] !== null) return { ok: false };
        space = D.GEARS[gearId].spaces;
      } else {
        const target = lowestFreeSpace(state, gearId, player);
        if (target < 0) return { ok: false };
        if (action.space !== undefined && action.space !== target) return { ok: false };
        space = target;
      }
    }
    const cost = placementCost(state, player, space, gearId);
    if ((player.resources.corn || 0) < cost) return { ok: false };

    player.resources.corn -= cost;
    player.workers.available--;
    state.turn.placed++;
    if (action.start) {
      state.board.startSpace = { playerId: player.id };
    } else if (space === D.GEARS[gearId].spaces) {
      state.board.extraActions[gearId] = { playerId: player.id, dummy: false, color: player.color };
    } else {
      state.board.gears[gearId][space] = { playerId: player.id, dummy: false, color: player.color };
    }
    const placeLabel = action.start
      ? 'la case du joueur de départ'
      : space === D.GEARS[gearId].spaces
        ? `la case spéciale de ${D.GEARS[gearId].name}`
        : `${D.GEARS[gearId].name} ${space}`;
    log(state, `${player.name} place un travailleur sur ${placeLabel} (−${cost} maïs).`);
    return { ok: true, state };
  }

  function pickupWorker(state, player, action) {
    const gearId = action.gear;
    const isExtra = action.extra || action.space === D.GEARS[gearId].spaces;
    const worker = isExtra ? state.board.extraActions[gearId] : state.board.gears[gearId][action.space];
    if (!worker || worker.playerId !== player.id) return { ok: false };
    if (isExtra) state.board.extraActions[gearId] = null;
    else state.board.gears[gearId][action.space] = null;
    player.workers.available++;
    state.turn.picked++;

    const options = [];
    const space = action.space;
    const current = D.GEARS[gearId].actions[space];

    if (isExtra) {
      // Case spéciale de Cit-Bolon-Tum : n'importe quelle action de l'engrenage.
      for (let s = 1; s < D.GEARS[gearId].spaces; s++) {
        const targetAction = D.GEARS[gearId].actions[s];
        if (!targetAction || targetAction.kind === 'wait') continue;
        if (!actionAllowed(state, player, gearId, s)) continue;
        options.push({ label: `${describeAction(targetAction)} (${D.GEARS[gearId].name} ${s})`, data: { mode: 'action', space: s } });
      }
    } else if (current && current.kind !== 'wait' && current.kind !== 'anyAction' && actionAllowed(state, player, gearId, space)) {
      options.push({ label: `${describeAction(current)} (case ${space})`, data: { mode: 'action', space } });
    }
    if (current && current.kind === 'anyAction') {
      const ownCost = current.cost && current.cost.corn ? current.cost.corn : 0;
      const priceLabel = ownCost ? ` (payer ${ownCost} maïs)` : ' (gratuit)';
      options.push({ label: `Choisir une action sur ${D.GEARS[gearId].name}${priceLabel}`, data: { mode: 'any', space, price: ownCost } });
    }
    // Théologie de niveau 1 : une case plus loin, gratuitement.
    if (player.tech.theology >= 1 && gearId === 'chichenItza' && space + 1 <= 9) {
      const ahead = D.GEARS.chichenItza.actions[space + 1];
      if (ahead && ahead.kind !== 'wait' && ahead.kind !== 'anyAction' && actionAllowed(state, player, 'chichenItza', space + 1)) {
        options.push({ label: `${describeAction(ahead)} (case ${space + 1}, théologie)`, data: { mode: 'action', space: space + 1 } });
      }
    }
    // Tribu Ahau Chamahez : une case plus loin en payant 1 maïs.
    if (player.tribe === 'ahauChamahez' && gearId === 'chichenItza' && space + 1 <= 9) {
      const ahead = D.GEARS.chichenItza.actions[space + 1];
      if (ahead && ahead.kind !== 'wait' && ahead.kind !== 'anyAction' && actionAllowed(state, player, 'chichenItza', space + 1)) {
        options.push({ label: `${describeAction(ahead)} (case ${space + 1}, Ahau Chamahez, 1 maïs)`, data: { mode: 'action', space: space + 1, price: 1 } });
      }
    }
    // Cases inférieures : 1 maïs par case reculée.
    for (let back = 1; back <= space; back++) {
      const target = space - back;
      const targetAction = D.GEARS[gearId].actions[target];
      if (!targetAction || targetAction.kind === 'wait') continue;
      const price = player.tribe === 'balam' ? 0 : back;
      if (price > 0 && (player.resources.corn || 0) < price) continue;
      if (!actionAllowed(state, player, gearId, target)) continue;
      const label = targetAction.kind === 'anyAction'
        ? `Choisir une action sur ${D.GEARS[gearId].name} (payer ${price} maïs)`
        : `${describeAction(targetAction)} (case ${target}, payer ${price} maïs)`;
      options.push({ label, data: { mode: targetAction.kind === 'anyAction' ? 'any' : 'action', space: target, price } });
    }
    // Tribu Huracan : action de même numéro sur l'engrenage apparié.
    if (player.tribe === 'huracan') {
      const paired = { palenque: 'yaxchilan', yaxchilan: 'palenque', tikal: 'uxmal', uxmal: 'tikal' }[gearId];
      if (paired) {
        const targetAction = D.GEARS[paired].actions[space];
        if (targetAction && targetAction.kind !== 'wait' && targetAction.kind !== 'anyAction' && actionAllowed(state, player, paired, space)) {
          options.push({ label: `${describeAction(targetAction)} (${D.GEARS[paired].name} ${space}, Huracan)`, data: { mode: 'action', gear: paired, space, price: 0 } });
        }
      }
    }
    options.push({ label: 'Ne rien faire', data: { mode: 'none' } });

    state.pending.push({
      kind: 'workerAction',
      prompt: `Que faites-vous de ce travailleur (${D.GEARS[gearId].name} ${space}) ?`,
      context: { playerId: player.id, gear: gearId, space },
      options,
    });
    return { ok: true, state };
  }

  /* ------------------------------------------------------------------ */
  /* Résolution des décisions                                           */
  /* ------------------------------------------------------------------ */

  function resolveDecision(state, decision, option) {
    const data = option.data || {};
    const player = state.players[decision.context.playerId];

    switch (decision.kind) {
      case 'temple': {
        state.pending.pop();
        const temple = data.temple;
        if (canClimb(state, player, temple)) {
          state = pushEffect(state, {
            type: 'climbTemple',
            playerId: player.id,
            temple,
            steps: decision.context.steps || 1,
          });
        }
        return flushEffects(state);
      }

      case 'templeTwo': {
        state.pending.pop();
        for (const temple of data.temples) {
          if (canClimb(state, player, temple)) {
            state = pushEffect(state, { type: 'climbTemple', playerId: player.id, temple, steps: 1 });
          }
        }
        return flushEffects(state);
      }

      case 'angerTemple': {
        state.pending.pop();
        const temple = data.temple;
        if (player.temples[temple] > 0) {
          player.temples[temple] -= 1;
          log(state, `${player.name} descend sur ${D.TEMPLES[temple].name}.`);
        }
        return flushEffects(state);
      }

      case 'payAnyResource': {
        state.pending.pop();
        player.resources[data.key] = (player.resources[data.key] || 0) - 1;
        return flushEffects(state);
      }

      case 'gainResource': {
        state.pending.pop();
        // Le choix de ressource peut être taxé par la prophétie active.
        const outcome = taxedGain(state, player, { [data.key]: 1 });
        state = outcome.state;
        const remaining = (decision.context.count || 1) - 1;
        if (remaining > 0) {
          state = pushEffect(state, {
            type: 'gainResourceChoice',
            playerId: player.id,
            count: remaining,
            prompt: decision.context.prompt,
          });
        }
        return flushEffects(state);
      }

      case 'prophecyClimb': {
        state.pending.pop();
        const templeId = decision.context.temple;
        if (data.pay) {
          const tax = climbTax(state, templeId);
          if (tax.corn) player.resources.corn -= tax.corn;
          else payAnyBlocks(player, 1);
          climbTemple(state, player, templeId, true);
        }
        return flushEffects(state);
      }

      case 'prophecyGain': {
        state.pending.pop();
        const context = decision.context;
        if (data.take === 'all') {
          if (context.taxed === 'gold') player.resources.corn -= context.count;
          state = applyGain(state, player, context.resources);
          if (context.taxed === 'skull') {
            for (let i = 0; i < context.count; i++) {
              state = pushEffect(state, { type: 'angerTemple', playerId: player.id });
            }
          }
        } else {
          const rest = { ...context.resources };
          if (context.taxed === 'gold') delete rest.gold;
          if (context.taxed === 'skull') delete rest.skull;
          state = applyGain(state, player, rest);
        }
        return flushEffects(state);
      }

      case 'renovation': {
        state.pending.pop();
        const context = decision.context;
        if (data.renovate) {
          // Le bâtiment démoli quitte définitivement la partie.
          const index = player.buildings.indexOf(data.renovate);
          if (index >= 0) player.buildings.splice(index, 1);
          log(state, `${player.name} rénove : ${buildingById(data.renovate).name} est démoli.`);
          for (const key of ['wood', 'stone', 'gold']) {
            context.cost[key] = Math.max(0, (context.cost[key] || 0) - (data.discount[key] || 0));
          }
          player.builtThisTurn = Math.max(0, player.builtThisTurn); // (aucun effet)
        }
        if (context.monumentId) {
          const monument = monumentById(context.monumentId);
          if (!monument || !canPay(player.resources, context.cost)) return flushEffects(state);
          player.resources = payCost(player.resources, context.cost);
          state.board.monuments[context.index] = null;
          player.monuments.push(monument.id);
          log(state, `${player.name} construit ${monument.name}.`);
          return flushEffects(state);
        }
        const building = buildingById(context.buildingId);
        if (!building) return flushEffects(state);
        const paid = completeBuild(state, player, building, context.index, context.cost, context);
        if (!paid) return flushEffects(state);
        if ((context.count || 1) > 1) {
          state = pushEffect(state, {
            type: 'build',
            playerId: player.id,
            count: context.count - 1,
            architecture: context.architecture,
            first: false,
          });
        }
        return flushEffects(state);
      }

      case 'xamanEk': {
        state.pending.pop();
        if (data.key) {
          const rate = D.RATES[data.key];
          player.resources[data.key] = (player.resources[data.key] || 0) - 1;
          player.resources.corn = (player.resources.corn || 0) + rate;
          log(state, `${player.name} (Xaman Ek) vend 1 ${RESOURCE_NAMES[data.key]} (+${rate} maïs).`);
        }
        return flushEffects(state);
      }

      case 'ahChuyKak': {
        state.pending.pop();
        if (data.skip) return flushEffects(state);
        const outcome = pickupWorker(state, player, data);
        return flushEffects(outcome.state);
      }

      case 'vacubCaquix': {
        state.pending.pop();
        state.turn.skipUsed = true;
        if (data.gear) state.turn.skip = { gear: data.gear, space: data.space };
        return flushEffects(state);
      }

      case 'techBonus': {
        state.pending.pop();
        applyTechnologyBonus(state, player, data.technology);
        return flushEffects(state);
      }

      case 'tech': {
        state.pending.pop();
        const tech = data.technology;
        const steps = decision.context.steps || 1;
        for (let i = 0; i < steps; i++) advanceTechnology(state, player, tech, decision.context.free);
        return flushEffects(state);
      }

      case 'techDown': {
        state.pending.pop();
        player.tech[data.technology] = Math.max(0, player.tech[data.technology] - 1);
        state = pushEffect(state, { type: 'advanceTech', playerId: player.id, steps: 1, free: true });
        return flushEffects(state);
      }

      case 'build': {
        state.pending.pop();
        const building = buildingById(data.id);
        if (!building) return flushEffects(state);
        const context = decision.context;
        const cost = { ...building.cost };
        if (!context.withCorn && context.architecture && player.tech.architecture >= 3) {
          // Un bloc de ressources est considéré comme gratuit (au choix du joueur).
          const options = ['wood', 'stone', 'gold']
            .filter((key) => cost[key] > 0)
            .map((key) => ({ label: `${RESOURCE_NAMES[key]} (1 bloc offert)`, data: { key } }));
          if (options.length > 1) {
            state.pending.push({
              kind: 'waiveBlock',
              prompt: 'Choisissez le bloc de ressource considéré comme gratuit',
              context: {
                playerId: player.id,
                cost,
                buildingId: building.id,
                index: data.index,
                count: context.count || 1,
                architecture: context.architecture,
                first: context.first !== false,
              },
              options,
            });
            return state;
          }
          if (options.length === 1) cost[options[0].data.key] -= 1;
        }
        if (maybeRenovate(state, player, cost, {
          buildingId: building.id,
          index: data.index,
          count: context.count || 1,
          architecture: context.architecture,
          withCorn: context.withCorn,
          quick: context.quick,
          first: context.first,
        })) return state;
        const paid = completeBuild(state, player, building, data.index, cost, context);
        if (!paid) return flushEffects(state);
        if ((context.count || 1) > 1) {
          state = pushEffect(state, {
            type: 'build',
            playerId: player.id,
            count: context.count - 1,
            architecture: context.architecture,
            first: false,
          });
        }
        return flushEffects(state);
      }

      case 'waiveBlock': {
        state.pending.pop();
        const ctx = decision.context;
        const player2 = state.players[ctx.playerId];
        const building = buildingById(ctx.buildingId);
        if (!building) return flushEffects(state);
        const cost = { ...ctx.cost };
        cost[data.key] -= 1;
        if (maybeRenovate(state, player2, cost, {
          buildingId: building.id,
          index: ctx.index,
          count: ctx.count || 1,
          architecture: ctx.architecture,
          first: ctx.first,
        })) return state;
        const paid = completeBuild(state, player2, building, ctx.index, cost, ctx);
        if (!paid) return flushEffects(state);
        if ((ctx.count || 1) > 1) {
          state = pushEffect(state, {
            type: 'build',
            playerId: player.id,
            count: ctx.count - 1,
            architecture: ctx.architecture,
            first: false,
          });
        }
        return flushEffects(state);
      }

      case 'buildOrMonument': {
        state.pending.pop();
        if (data.id && data.id.startsWith('m')) {
          const monument = monumentById(data.id);
          if (!monument || !canPay(player.resources, monument.cost)) return flushEffects(state);
          const cost = { ...monument.cost };
          if (maybeRenovate(state, player, cost, { monumentId: monument.id, index: data.index, count: 0 })) return state;
          player.resources = payCost(player.resources, cost);
          state.board.monuments[data.index] = null;
          player.monuments.push(monument.id);
          log(state, `${player.name} construit ${monument.name}.`);
          return flushEffects(state);
        }
        const building = buildingById(data.id);
        if (!building) return flushEffects(state);
        const cost = { ...building.cost };
        if (decision.context.architecture && player.tech.architecture >= 3) {
          const options = ['wood', 'stone', 'gold']
            .filter((key) => cost[key] > 0)
            .map((key) => ({ label: `${RESOURCE_NAMES[key]} (1 bloc offert)`, data: { key } }));
          if (options.length === 1) cost[options[0].data.key] -= 1;
        }
        const paid = completeBuild(state, player, building, data.index, cost, { architecture: decision.context.architecture, first: true });
        if (!paid) return flushEffects(state);
        if ((decision.context.count || 2) > 1) {
          state = pushEffect(state, {
            type: 'build',
            playerId: player.id,
            count: decision.context.count - 1,
            architecture: false,
            first: false,
          });
        }
        return flushEffects(state);
      }

      case 'buildMonument': {
        state.pending.pop();
        const monument = monumentById(data.id);
        if (!monument || !canPay(player.resources, monument.cost)) return flushEffects(state);
        const cost = { ...monument.cost };
        if (maybeRenovate(state, player, cost, { monumentId: monument.id, index: data.index, count: 0 })) return state;
        player.resources = payCost(player.resources, cost);
        state.board.monuments[data.index] = null;
        player.monuments.push(monument.id);
        log(state, `${player.name} construit ${monument.name}.`);
        return flushEffects(state);
      }

      case 'action': {
        state.pending.pop();
        const outcome = performGearAction(state, decision.context.playerId, data.gear, data.space);
        state = outcome.state;
        return flushEffects(state);
      }

      case 'workerAction': {
        state.pending.pop();
        if (data.mode === 'none') return flushEffects(state);
        if (data.price) {
          if ((player.resources.corn || 0) < data.price) return flushEffects(state);
          player.resources.corn -= data.price;
          if (player.tribe === 'balam') player.resources.corn += 1;
        }
        const gear = data.gear || decision.context.gear;
        if (data.mode === 'any') {
          const anyAction = D.GEARS[gear].actions[data.space];
          const gears = anyAction.gears || [gear];
          const options = [];
          for (const target of gears) {
            for (let s = anyAction.from; s <= anyAction.to; s++) {
              const targetAction = D.GEARS[target].actions[s];
              if (!targetAction || targetAction.kind === 'wait') continue;
              if (!actionAllowed(state, player, target, s)) continue;
              options.push({ label: `${D.GEARS[target].name} ${s} — ${describeAction(targetAction)}`, data: { gear: target, space: s } });
            }
          }
          if (!options.length) return flushEffects(state);
          state.pending.push({
            kind: 'action',
            prompt: 'Choisissez l’action à effectuer',
            context: { playerId: player.id },
            options,
          });
          return state;
        }
        const outcome = performGearAction(state, player.id, gear, data.space);
        return flushEffects(outcome.state);
      }

      case 'harvest': {
        state.pending.pop();
        const group = decision.context.group;
        const fields = state.board.jungle[group];
        const action = D.GEARS.palenque.actions[group + 2];
        // Ajustements de prophétie : sécheresse (maïs) et incendies (bois).
        const active = activeProphecy(state);
        if (data.kind === 'corn') {
          const field = fields.find((f) => f.corn && !f.wood);
          if (field) field.corn = false;
          const amount = Math.max(0, harvestCorn(player, action.corn) - (active === 'drought' ? 1 : 0));
          player.resources.corn += amount;
          if (field) player.cornTiles += 1;
          log(state, `${player.name} récolte ${amount} maïs.`);
        } else if (data.kind === 'wood') {
          const field = fields.find((f) => f.wood);
          if (field) field.wood = false;
          const amount = Math.max(0, harvestWood(player, action.wood) - (active === 'forestFires' ? 1 : 0));
          player.resources.wood += amount;
          if (field) player.woodTiles += 1;
          log(state, `${player.name} récolte ${amount} bois.`);
        } else if (data.kind === 'burn') {
          const field = fields.find((f) => f.wood && f.corn);
          if (field) { field.wood = false; field.corn = false; }
          const amount = Math.max(0, harvestCorn(player, action.corn) - (active === 'drought' ? 1 : 0));
          player.resources.corn += amount;
          player.cornTiles += 1;
          log(state, `${player.name} brûle la forêt et récolte ${amount} maïs (les dieux se fâchent).`);
          state = pushEffect(state, { type: 'angerTemple', playerId: player.id });
        }
        return flushEffects(state);
      }

      case 'trade': {
        if (data.stop) {
          state.pending.pop();
          return flushEffects(state);
        }
        const rate = D.RATES[data.key];
        if (data.type === 'sell') {
          player.resources[data.key] -= 1;
          player.resources.corn += rate;
        } else {
          if ((player.resources.corn || 0) < rate) return state;
          player.resources.corn -= rate;
          player.resources[data.key] = (player.resources[data.key] || 0) + 1;
        }
        log(state, `${player.name} échange au marché (${data.type === 'sell' ? 'vend' : 'achète'} 1 ${RESOURCE_NAMES[data.key]}).`);
        state.pending.pop();
        state.pending.push({
          kind: 'trade',
          prompt: 'Marché : échangez autant de fois que vous voulez',
          context: { playerId: player.id },
          options: tradeOptions(player).concat([{ label: 'Terminer', data: { stop: true } }]),
        });
        return state;
      }

      default:
        state.pending.pop();
        return flushEffects(state);
    }
  }

  function completeBuild(state, player, building, index, cost, context) {
    if (context.withCorn) {
      const cornCost = cornPrice(cost, player, !!context.quick)
        + (buildingSurcharge(state, true) ? 2 : 0);
      if ((player.resources.corn || 0) < cornCost) return false;
      player.resources.corn -= cornCost;
    } else {
      if (!canPay(player.resources, cost)) return false;
      player.resources = payCost(player.resources, cost);
    }
    if (cost.skull) player.resources.skull = Math.max(0, (player.resources.skull || 0) - cost.skull);
    state.board.buildings[index] = null;
    player.buildings.push(building.id);
    player.builtThisTurn++;
    log(state, `${player.name} construit ${building.name}.`);
    if (context.first !== false) applyArchitectureBonus(state, player, building);
    // Villes bondées : 1 bloc de ressource supplémentaire (au choix).
    if (!context.withCorn && buildingSurcharge(state, false)) {
      state = pushEffect(state, { type: 'payAnyResource', playerId: player.id, count: 1 });
    }
    applyBuildingEffects(state, player, building);
    return true;
  }

  function applyArchitectureBonus(state, player, building) {
    if (techOn(state, player, 'architecture', 1)) player.resources.corn += 1;
    if (techOn(state, player, 'architecture', 2)) player.points += 2;
  }

  function advanceTechnology(state, player, technology, free) {
    const level = player.tech[technology];
    const surcharge = activeProphecy(state) === 'teacherShortage' ? 1 : 0;
    // Itzamná : les avancées vers les niveaux 1 à 3 coûtent 1 ressource de moins.
    const itzamna = player.tribe === 'itzamna' && level < 3 ? 1 : 0;
    if (!free || surcharge) {
      const base = level >= 3 ? 1 : level + 1;
      const cost = Math.max(0, (free ? 0 : Math.max(0, base - itzamna)) + surcharge);
      if (countResourceBlocks(player.resources) < cost) return;
      payAnyBlocks(player, cost);
    }
    if (level >= 3) {
      // Itzamná : le bonus de niveau 3 peut être pris sur n'importe quelle
      // technologie.
      if (player.tribe === 'itzamna') {
        state.pending.push({
          kind: 'techBonus',
          prompt: 'Itzamná : choisissez le bonus de technologie à activer',
          context: { playerId: player.id },
          options: D.TECHNOLOGY_ORDER.map((tech) => ({
            label: D.TECHNOLOGIES[tech].name,
            data: { technology: tech },
          })),
        });
        return;
      }
      applyTechnologyBonus(state, player, technology);
      return;
    }
    player.tech[technology] = level + 1;
    log(state, `${player.name} avance en ${D.TECHNOLOGIES[technology].name} (niveau ${player.tech[technology]}).`);
  }

  function payAnyBlocks(player, count) {
    for (const key of ['wood', 'stone', 'gold']) {
      while (count > 0 && (player.resources[key] || 0) > 0) {
        player.resources[key] -= 1;
        count--;
      }
    }
  }

  function applyTechnologyBonus(state, player, technology) {
    switch (technology) {
      case 'agriculture':
        return pushEffect(state, { type: 'climbTemple', playerId: player.id, temple: 'any' });
      case 'extraction':
        return pushEffect(state, { type: 'gainResource', playerId: player.id, count: 2, prompt: 'Prenez 2 blocs de ressources de votre choix' });
      case 'architecture':
        player.points += 3;
        return state;
      case 'theology':
        if (state.board.skullsInBank > 0) {
          return taxedGain(state, player, { skull: 1 }).state;
        }
        return state;
      default:
        return state;
    }
  }

  function applyBuildingEffects(state, player, building) {
    for (const effect of building.effects) {
      switch (effect.type) {
        case 'temple':
          state = pushEffect(state, {
            type: 'climbTemple',
            playerId: player.id,
            temple: effect.temple,
            steps: effect.steps || 1,
          });
          break;
        case 'technology':
          player.tech[effect.technology] = Math.min(3, player.tech[effect.technology] + effect.steps);
          break;
        case 'technologyAny':
          state = pushEffect(state, { type: 'advanceTech', playerId: player.id, steps: effect.steps, free: true });
          break;
        case 'technologyExchange':
          state = pushEffect(state, { type: 'technologyExchange', playerId: player.id });
          break;
        case 'resources':
          state = taxedGain(state, player, effect.resources).state;
          break;
        case 'points':
          player.points += effect.amount;
          break;
        case 'worker':
          if (player.workers.inBank > 0) {
            player.workers.inBank--;
            player.workers.available++;
          }
          break;
        case 'feed':
          player.feedBonus += effect.workers;
          break;
        case 'feedDiscount':
          player.feedDiscount += effect.amount;
          break;
        case 'build':
          state = pushEffect(state, { type: 'build', playerId: player.id, count: 1, architecture: false });
          break;
        case 'buildMonument':
          state = pushEffect(state, { type: 'buildMonument', playerId: player.id });
          break;
        case 'skullBuilding':
          player.points += effect.points;
          log(state, `${player.name} gagne ${effect.points} points (sanctuaire des crânes).`);
          state = pushEffect(state, { type: 'climbTemple', playerId: player.id, temple: effect.temple, steps: 1 });
          break;
        case 'trade':
          state = pushEffect(state, { type: 'trade', playerId: player.id });
          break;
        default:
          break;
      }
    }
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Fin de tour, fin de ronde, jours de famine                        */
  /* ------------------------------------------------------------------ */

  function endTurn(state) {
    const player = state.players[state.turn.playerId];
    // Règle générale : on doit placer ou reprendre des travailleurs (la tribu
    // Ahmakiq autorise à passer son tour). Exception : un joueur qui ne peut
    // ni placer (faute de maïs) ni reprendre (aucun travailleur sur les
    // engrenages) est autorisé à terminer son tour sans rien faire.
    if (player.tribe !== 'ahmakiq') {
      if (state.turn.mode === 'place' && state.turn.placed === 0 && canStillPlace(state, player)) return state;
      if (state.turn.mode === 'pickup' && state.turn.picked === 0) return state;
      if (!state.turn.mode) return state;
    }

    // Les bâtiments construits sont remplacés à la fin du tour.
    for (let index = 0; index < state.board.buildings.length; index++) {
      if (state.board.buildings[index] === null && state.board.buildingStack.length) {
        state.board.buildings[index] = state.board.buildingStack.shift();
      }
    }
    player.builtThisTurn = 0;

    // Le maïs accumulé sur l’engrenage est récupéré par le joueur de la case
    // du joueur de départ, dès la fin de son tour.
    if (state.board.startSpace && state.board.startSpace.playerId === player.id) {
      player.resources.corn += state.calendar.cornOnGear;
      if (state.calendar.cornOnGear > 0) {
        log(state, `${player.name} récupère ${state.calendar.cornOnGear} maïs accumulés sur l’engrenage.`);
      }
      state.calendar.cornOnGear = 0;
    }

    // Fin de tour : capacité de tribu, action rapide, puis passage au joueur
    // suivant (via la file d'effets, pour que les décisions se résolvent).
    if (player.tribe === 'ahChuyKak' && state.turn.placed >= 2) {
      pushEffect(state, { type: 'ahChuyKak', playerId: player.id });
    }
    if (state.turn.quick !== undefined && state.turn.quick !== null) {
      pushEffect(state, { type: 'quickAction', playerId: player.id, space: state.turn.quick });
    }
    pushEffect(state, { type: 'passTurn' });
    return flushEffects(state);
  }

  /* Passage au joueur suivant, ou fin de ronde. */
  function passTurn(state) {
    const order = state.board.order;
    const index = order.indexOf(state.turn.playerId);
    if (index < order.length - 1) {
      state.turn = { number: state.turn.number, playerId: order[index + 1], mode: null, placed: 0, picked: 0 };
      const next = state.players[state.turn.playerId];
      if (next.tribe === 'bacab' && (next.resources.corn || 0) < 2) next.resources.corn = 2;
      turnStartChecks(state, next);
      return state;
    }
    return finishRound(state);
  }

  /*
   * Jours de famine : les rondes 8, 14, 21 et 27 (dents 7, 13, 20 et 26 du
   * calendrier). Ils sont déclenchés à la fin de la ronde qui les atteint ou
   * les dépasse : un privilège d'accélération qui saute par-dessus un jour de
   * famine ne peut donc pas l'éviter (règle officielle, p. 10).
   */
  const FOOD_DAY_SCHEDULE = [
    { round: 8, day: 7, type: 'materials' },
    { round: 14, day: 13, type: 'points' },
    { round: 21, day: 20, type: 'materials' },
    { round: 27, day: 26, type: 'points' },
  ];

  function finishRound(state) {
    // Un jour de famine sauté (double avancée) est joué à la fin de la ronde
    // suivante : on déclenche tous les jours de famine dus.
    for (;;) {
      const next = FOOD_DAY_SCHEDULE.find(
        (foodDay) => state.calendar.round >= foodDay.round && !state.calendar.foodDaysDone.includes(foodDay.round)
      );
      if (!next) break;
      state.calendar.foodDaysDone.push(next.round);
      pushEffect(state, { type: 'foodDay', foodDay: next, stage: 'buildings' });
    }
    pushEffect(state, { type: 'advanceCalendar' });
    return flushEffects(state);
  }

  function workerCount(state, player) {
    let count = player.workers.available;
    for (const gearId of D.GEAR_ORDER) {
      for (const worker of state.board.gears[gearId]) {
        if (worker && worker.playerId === player.id) count++;
      }
      // La case spéciale de Cit-Bolon-Tum compte aussi.
      const extra = state.board.extraActions && state.board.extraActions[gearId];
      if (extra && extra.playerId === player.id) count++;
    }
    if (state.board.startSpace && state.board.startSpace.playerId === player.id) count++;
    return count;
  }

  function workerFeedCosts(state, player, hungerBonus) {
    let base = D.FEED_COST;
    if (player.tribe === 'yaluk') base += 1;
    // Prophétie (famine) : chaque travailleur nécessite 1 maïs de plus.
    base += hungerBonus || 0;
    base = Math.max(0, base - (player.feedDiscount || 0));
    const count = workerCount(state, player);
    const costs = new Array(count).fill(base);
    // Les fermes « 1 travailleur nourri gratuitement » s’appliquent aux
    // travailleurs les plus coûteux.
    const freebies = Math.min(player.feedBonus || 0, count);
    const sorted = costs.slice().sort((a, b) => b - a);
    // Les fermes rendent le travailleur totalement gratuit (même si un autre
    // effet a augmenté le coût de base).
    for (let i = 0; i < freebies; i++) sorted[i] = 0;
    return sorted.sort((a, b) => a - b);
  }

  function feedCost(state, player) {
    const costs = workerFeedCosts(state, player);
    return costs.length ? costs[costs.length - 1] : D.FEED_COST;
  }

  function advanceCalendar(state) {
    const startSpace = state.board.startSpace;
    state.board.startSpace = null;

    if (startSpace) {
      const player = state.players[startSpace.playerId];
      // Le travailleur revient à son joueur.
      player.workers.available++;
      // Le marqueur change de mains.
      const order = state.board.order;
      if (state.board.startingPlayerMarker === startSpace.playerId) {
        const index = order.indexOf(startSpace.playerId);
        state.board.startingPlayerMarker = order[(index + 1) % order.length];
      } else {
        state.board.startingPlayerMarker = startSpace.playerId;
      }
      // L’ordre de jeu commence avec le détenteur du marqueur.
      const markerIndex = state.board.order.indexOf(state.board.startingPlayerMarker);
      state.board.order = state.board.order.slice(markerIndex).concat(state.board.order.slice(0, markerIndex));

      // Privilège d’accélération : le plateau doit être du côté clair et
      // l’avancée supplémentaire ne doit éjecter personne.
      if (player.boardLight && canDoubleAdvance(state)) {
        state.pending.push({
          kind: 'doubleAdvance',
          prompt: 'Votre plateau est clair : avancez-vous le calendrier de 2 jours ?',
          context: { playerId: player.id },
          options: [
            { label: 'Avancer de 2 jours', data: { double: true } },
            { label: 'Avancer d’un seul jour', data: { double: false } },
          ],
        });
        state.calendar.advance = 1;
        return state;
      }
    } else {
      // Personne n'a utilisé la case du joueur de départ : 1 maïs sur la dent.
      state.calendar.cornOnGear += 1;
    }

    return finishCalendarAdvance(state);
  }

  function finishCalendarAdvance(state) {
    const days = state.calendar.advance || 1;
    state.calendar.advance = 1;
    state = rotateCalendar(state, days);
    // La prophétie suivante s'active après la rotation du calendrier.
    activateProphecy(state);
    // La partie se termine une fois le dernier jour de famine joué.
    if (state.calendar.foodDaysDone.includes(27)) return endGame(state);
    return beginRound(state);
  }

  /*
   * Un joueur bloque le privilège d'accélération s'il occupe la case 6 des
   * petits engrenages ou la case 9 de Chichen Itza : la journée
   * supplémentaire l'éjecterait. Les travailleurs factices ne comptent pas
   * (ils ne sont jamais éjectés).
   */
  function canDoubleAdvance(state) {
    for (const gearId of D.GEAR_ORDER) {
      const gear = state.board.gears[gearId];
      const blocked = gear.length - 2;
      for (let space = 0; space < gear.length; space++) {
        const worker = gear[space];
        if (!worker || worker.dummy) continue;
        if (space === blocked) return false;
      }
    }
    return true;
  }

  function rotateCalendar(state, days) {
    for (let i = 0; i < days && state.calendar.round < 27; i++) {
      state.calendar.day = (state.calendar.day + 1) % D.CALENDAR_DAYS;
      state.calendar.round += 1;
      for (const gearId of D.GEAR_ORDER) {
        const gear = state.board.gears[gearId];
        const last = gear.length - 1;
        const pushed = gear[last];
        gear[last] = null;
        for (let space = last - 1; space >= 0; space--) gear[space + 1] = gear[space];
        gear[0] = null;
        // Le travailleur de la case spéciale Cit-Bolon-Tum est éjecté.
        const extra = state.board.extraActions ? state.board.extraActions[gearId] : null;
        if (extra) {
          state.board.extraActions[gearId] = null;
          state.players[extra.playerId].workers.available++;
          log(state, `Un travailleur de ${state.players[extra.playerId].name} est repoussé hors de l’engrenage.`);
        }
        if (!pushed) continue;
        if (pushed.dummy) {
          // Les travailleurs factices ne sont jamais éjectés : ils reviennent
          // sur la première case de l'engrenage.
          gear[0] = pushed;
        } else if (
          state.players[pushed.playerId].tribe === 'citBolonTum'
          && state.board.extraActions[gearId] === null
        ) {
          // Cit-Bolon-Tum : le travailleur glisse sur la case spéciale.
          state.board.extraActions[gearId] = pushed;
        } else {
          state.players[pushed.playerId].workers.available++;
          log(state, `Un travailleur de ${state.players[pushed.playerId].name} est repoussé hors de l’engrenage.`);
        }
      }
    }
    return state;
  }

  function endGame(state) {
    state.phase = 'finished';
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* API publique                                                        */
  /* ------------------------------------------------------------------ */

  return {
    createGame,
    dispatch,
    currentDecision,
    lowestFreeSpace,
    placementCost,
    workerCount,
    workerFeedCosts,
    feedCost,
    canPay,
    countResourceBlocks,
    canBuildWith,
    createRng,
    clone,
    buildingById,
    monumentById,
    maybeRenovate,
    buildingFoodRewards,
    prophecyBandScore,
    D,
  };
});

'use strict';
const D = window.TzolkinData;
const E = window.TzolkinEngine;

let state = null;
let currentMode = 'place';
let humanCount = 1;
let aiLevel = 'medium';
let aiRunning = false;

function $(id) { return document.getElementById(id); }
function isHuman(pid) { return pid < humanCount; }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $(name).classList.remove('hidden');
}

function aiStrategyPhase(state) {
  if (state.calendar.round <= 7) return 'resources';
  if (state.calendar.round <= 14) return 'tech';
  return 'temples';
}

function preferredGears(state) {
  const phase = aiStrategyPhase(state);
  if (phase === 'resources') return ['palenque', 'yaxchilan', 'tikal', 'uxmal', 'chichenItza'];
  if (phase === 'tech') return ['tikal', 'uxmal', 'palenque', 'yaxchilan', 'chichenItza'];
  return ['chichenItza', 'tikal', 'uxmal', 'palenque', 'yaxchilan'];
}

function aiPick(decision) {
  if (decision.kind === 'wealth') {
    let best = 0, bestIdx = 0;
    decision.options.forEach((o, i) => {
      const t = D.STARTING_WEALTH.find((w) => w.id === o.data.id);
      const score = t ? (t.resources.corn || 0) + (t.resources.wood || 0) * 2 + (t.resources.stone || 0) * 3 + (t.resources.gold || 0) * 4 + (t.resources.skull || 0) * 3 + (t.effects ? t.effects.length : 0) : 0;
      if (score > best) { best = score; bestIdx = i; }
    });
    return (aiLevel === 'easy') ? 0 : bestIdx;
  }
  if (decision.kind === 'beg') {
    const idx = decision.options.findIndex((o) => o.data && o.data.beg === false);
    return idx >= 0 ? idx : 0;
  }
  if (decision.kind === 'doubleAdvance') return (aiLevel === 'hard') ? 0 : 1;
  if (decision.kind === 'workerAction') {
    const none = decision.options.findIndex((o) => o.data && o.data.mode === 'none');
    if (aiLevel === 'easy') return Math.floor(Math.random() * decision.options.length);
    let bestIdx = none >= 0 ? none : 0;
    let bestScore = none >= 0 ? 0 : -1;
    decision.options.forEach((o, i) => {
      if (o.data && o.data.mode === 'none') return;
      let score = 1;
      const space = o.data && o.data.space;
      if (typeof space === 'number') score += space;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    if (aiLevel === 'medium' && Math.random() < 0.3) return none >= 0 ? none : 0;
    return bestIdx;
  }
  if (decision.kind === 'trade') return decision.options.length - 1;
  if (decision.kind === 'temple') {
    if (aiLevel === 'easy') return 0;
    let bestIdx = 0, bestProgress = Infinity;
    decision.options.forEach((o, i) => {
      const t = o.data && o.data.temple;
      if (t && state.players[state.turn.playerId].temples[t] < bestProgress) {
        bestProgress = state.players[state.turn.playerId].temples[t];
        bestIdx = i;
      }
    });
    return bestIdx;
  }
  return 0;
}

function resolveAll() {
  let guard = 0;
  while (E.currentDecision(state) && guard++ < 2000) {
    const dec = E.currentDecision(state);
    const idx = aiPick(dec);
    if (dec.kind === 'wealth') state = E.dispatch(state, { type: 'chooseWealth', tileId: dec.options[idx].data.id });
    else if (dec.kind === 'tribe') state = E.dispatch(state, { type: 'chooseTribe', tribeId: dec.options[idx].data.id });
    else if (dec.kind === 'beg') state = E.dispatch(state, { type: 'beg', beg: !!dec.options[idx].data.beg, topUp: !!dec.options[idx].data.topUp });
    else if (dec.kind === 'doubleAdvance') state = E.dispatch(state, { type: 'doubleAdvance', double: !!dec.options[idx].data.double });
    else state = E.dispatch(state, { type: 'resolve', index: idx });
  }
}

function runAIStep() {
  if (!state || state.phase === 'finished') { aiRunning = false; render(); return; }

  resolveAll();
  render();
  if (state.phase === 'finished') { aiRunning = false; render(); return; }

  if (state.phase !== 'turn') {
    setTimeout(runAIStep, 200);
    return;
  }
  if (isHuman(state.turn.playerId)) { aiRunning = false; render(); return; }

  if (!state.turn.mode) {
    const m = E.dispatch(state, { type: 'mode', mode: 'place' });
    if (m !== state) state = m;
  }

  const player = state.players[state.turn.playerId];
  let progress = false;

  if (player.workers.available > 0) {
    const freeGears = preferredGears(state).filter((g) => E.lowestFreeSpace(state, g) >= 0);
    const greed = aiLevel === 'easy' ? 0.4 : aiLevel === 'medium' ? 0.75 : 0.95;
    if (freeGears.length && Math.random() < greed) {
      const g = freeGears[0];
      const next = E.dispatch(state, { type: 'place', gear: g });
      if (next !== state) { state = next; progress = true; }
    }
  }

  if (!progress && E.workerCount(state, player) - player.workers.available > 0) {
    const pickChance = aiLevel === 'easy' ? 0.2 : aiLevel === 'medium' ? 0.45 : 0.65;
    if (Math.random() < pickChance) {
      let bestGear = null, bestSpace = -1;
      for (const g of D.GEAR_ORDER) {
        const arr = state.board.gears[g];
        for (let s = 0; s < arr.length; s++) {
          if (arr[s] && !arr[s].dummy && arr[s].playerId === state.turn.playerId && s > bestSpace) {
            bestSpace = s; bestGear = g;
          }
        }
      }
      if (bestGear) {
        const next = E.dispatch(state, { type: 'pickup', gear: bestGear, space: bestSpace });
        if (next !== state) { state = next; progress = true; }
      }
    }
  }

  resolveAll();
  render();
  if (state.phase === 'finished') { aiRunning = false; render(); return; }

  const canPlace = player.workers.available > 0 && D.GEAR_ORDER.some((g) => E.lowestFreeSpace(state, g) >= 0);
  const endChance = aiLevel === 'easy' ? 0.15 : aiLevel === 'medium' ? 0.25 : 0.4;
  if (!progress || !canPlace || Math.random() < endChance) {
    state = E.dispatch(state, { type: 'endTurn' });
    resolveAll();
    render();
    if (state.phase === 'finished') { aiRunning = false; render(); return; }
    if (isHuman(state.turn.playerId)) { aiRunning = false; render(); return; }
    setTimeout(runAIStep, 400);
  } else {
    setTimeout(runAIStep, 300);
  }
}

function scheduleAI() {
  if (aiRunning) return;
  if (!state) return;
  if (state.phase === 'finished') return;
  if (state.phase === 'turn' && isHuman(state.turn.playerId)) return;
  if (state.phase !== 'turn' && state.phase !== 'setup') return;
  aiRunning = true;
  setTimeout(runAIStep, 400);
}

function startGame() {
  const players = Number($('player-count').value);
  humanCount = Math.min(players, Number($('human-count').value));
  aiLevel = $('ai-level').value;
  const expansion = {
    tribes: $('ext-tribes').checked,
    prophecies: $('ext-prophecies').checked,
    quickActions: $('ext-quick').checked,
  };
  state = E.createGame({ players, seed: Date.now(), expansion });
  currentMode = 'place';
  showScreen('game-screen');
  render();
  scheduleAI();
}

function dispatch(action) {
  const before = state;
  state = E.dispatch(state, action);
  render();
  scheduleAI();
}

function resolveDecision(index) {
  const dec = E.currentDecision(state);
  if (!dec) return;
  if (dec.kind === 'wealth') dispatch({ type: 'chooseWealth', tileId: dec.options[index].data.id });
  else if (dec.kind === 'tribe') dispatch({ type: 'chooseTribe', tribeId: dec.options[index].data.id });
  else if (dec.kind === 'beg') dispatch({ type: 'beg', beg: !!dec.options[index].data.beg, topUp: !!dec.options[index].data.topUp });
  else if (dec.kind === 'doubleAdvance') dispatch({ type: 'doubleAdvance', double: !!dec.options[index].data.double });
  else dispatch({ type: 'resolve', index });
}

function render() {
  if (!state) return;
  if (state.phase === 'finished') { showEnd(); return; }

  $('round-info').textContent = `Ronde ${state.calendar.round} · Jour ${state.calendar.day + 1}`;
  const pid = state.turn.playerId;
  const player = state.players[pid];
  $('turn-info').textContent = `Tour : ${player.name}${isHuman(pid) ? '' : ' (IA)'}${state.turn.mode ? ' · ' + state.turn.mode : ''}`;

  renderPlayers();
  renderGears();
  renderCalendar();
  renderTemples();
  renderTech();
  renderBuildings();
  renderQuick();
  renderLog();
  renderDecision();
}

function renderPlayers() {
  const container = $('players-panel');
  container.innerHTML = '';
  state.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-card' + (i === state.turn.playerId ? ' active' : '');
    const res = p.resources;
    div.innerHTML = `
      <div class="pname" style="color:${p.color}">${p.name}${isHuman(i) ? '' : ' (IA)'}${p.tribe ? ' · ' + p.tribe : ''}</div>
      <div class="pres">
        <span>🌽 ${res.corn || 0}</span>
        <span>🪵 ${res.wood || 0}</span>
        <span>🪨 ${res.stone || 0}</span>
        <span>💰 ${res.gold || 0}</span>
        <span>💀 ${res.skull || 0}</span>
        <span>⭐ ${p.points}</span>
      </div>
      <div class="pinfo">travailleurs : ${p.workers.available} dispo · ${p.workers.inBank} banque</div>
    `;
    container.appendChild(div);
  });
}

function renderGears() {
  const container = $('gears-panel');
  if (!container) return;
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
  container.style.gap = '1.5rem';
  container.style.justifyItems = 'center';
  container.style.padding = '1rem';
  container.innerHTML = '';
  const size = 140;
  const r = 50;
  D.GEAR_ORDER.forEach((gearId) => {
    const gear = D.GEARS[gearId];
    const arr = state.board.gears[gearId];
    const box = document.createElement('div');
    box.className = 'gear-wheel';
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    box.style.display = 'inline-block';
    box.style.verticalAlign = 'top';
    box.style.margin = '1rem';
    box.style.position = 'relative';
    const center = document.createElement('div');
    center.className = 'gear-center';
    center.textContent = gear.name;
    box.appendChild(center);

    for (let space = 0; space < arr.length; space++) {
      const worker = arr[space];
      const angle = (space / arr.length) * Math.PI * 2 - Math.PI / 2;
      const x = size / 2 + r * Math.cos(angle);
      const y = size / 2 + r * Math.sin(angle);
      const slot = document.createElement('div');
      slot.className = 'gear-slot ' + (worker ? 'occupied' : 'empty');
      slot.style.left = x + 'px';
      slot.style.top = y + 'px';
      if (worker) {
        const p = worker.playerId >= 0 ? state.players[worker.playerId] : null;
        const color = worker.dummy ? '#666' : (p ? p.color : '#666');
        const label = worker.dummy ? '·' : (worker.playerId + 1);
        slot.innerHTML = `<span class="worker-dot" style="background:${color}">${label}</span>`;
        slot.onclick = () => {
          if (currentMode === 'pickup' && !worker.dummy && worker.playerId === state.turn.playerId) {
            dispatch({ type: 'pickup', gear: gearId, space });
          }
        };
      } else {
        slot.textContent = space;
        slot.onclick = () => {
          if (currentMode === 'place') dispatch({ type: 'place', gear: gearId });
        };
      }
      box.appendChild(slot);
    }
    const extra = state.board.extraActions[gearId];
    const exAngle = Math.PI / 4;
    const ex = document.createElement('div');
    ex.className = 'gear-slot extra ' + (extra ? 'occupied' : 'empty');
    ex.style.left = (size / 2 + (r + 12) * Math.cos(exAngle)) + 'px';
    ex.style.top = (size / 2 + (r + 12) * Math.sin(exAngle)) + 'px';
    if (extra) {
      const p = state.players[extra.playerId];
      ex.innerHTML = `<span class="worker-dot" style="background:${p.color}">${extra.playerId + 1}</span>`;
      ex.onclick = () => {
        if (currentMode === 'pickup' && !extra.dummy && extra.playerId === state.turn.playerId) {
          dispatch({ type: 'pickup', gear: gearId, space: gear.spaces, extra: true });
        }
      };
    } else {
      ex.textContent = '★';
      ex.onclick = () => {
        if (currentMode === 'place') dispatch({ type: 'place', gear: gearId, extra: true, space: gear.spaces });
      };
    }
    box.appendChild(ex);
    container.appendChild(box);
  });

  const startBox = document.createElement('div');
  startBox.className = 'gear-wheel';
  startBox.style.width = size + 'px';
  startBox.style.height = size + 'px';
  startBox.style.display = 'inline-block';
  startBox.style.verticalAlign = 'top';
  startBox.style.margin = '1rem';
  startBox.style.position = 'relative';
  const sc = document.createElement('div');
  sc.className = 'gear-center';
  sc.textContent = 'Départ';
  startBox.appendChild(sc);
  const ss = document.createElement('div');
  ss.className = 'gear-slot empty';
  ss.style.left = (size / 2) + 'px';
  ss.style.top = (size / 2 + r) + 'px';
  const startSpace = state.board.startSpace;
  if (startSpace) {
    const p = state.players[startSpace.playerId];
    ss.className = 'gear-slot occupied';
    ss.innerHTML = `<span class="worker-dot" style="background:${p.color}">${startSpace.playerId + 1}</span>`;
    ss.onclick = () => {
      if (currentMode === 'pickup' && startSpace.playerId === state.turn.playerId) {
        dispatch({ type: 'pickup', gear: null, space: 0, start: true });
      }
    };
  } else {
    ss.textContent = 'libre';
    ss.onclick = () => {
      if (currentMode === 'place') dispatch({ type: 'place', start: true });
    };
  }
  startBox.appendChild(ss);
  container.appendChild(startBox);
}

function renderCalendar() {
  let container = $('calendar-card');
  if (!container) {
    container = document.createElement('div');
    container.id = 'calendar-card';
    container.className = 'card';
    const side = document.querySelector('.side-panel');
    side.insertBefore(container, side.firstChild);
  }
  container.innerHTML = '<h3>Calendrier (roue principale)</h3>';
  const size = 180;
  const r = 70;
  const wheel = document.createElement('div');
  wheel.className = 'calendar-wheel';
  wheel.style.width = size + 'px';
  wheel.style.height = size + 'px';
  wheel.style.position = 'relative';
  wheel.style.margin = '.5rem auto';
  const center = document.createElement('div');
  center.className = 'gear-center';
  center.textContent = `Ronde ${state.calendar.round}`;
  wheel.appendChild(center);

  const foodDays = [7, 13, 20, 26];
  for (let d = 0; d < D.CALENDAR_DAYS; d++) {
    const dayNum = d + 1;
    const angle = (d / D.CALENDAR_DAYS) * Math.PI * 2 - Math.PI / 2;
    const x = size / 2 + r * Math.cos(angle);
    const y = size / 2 + r * Math.sin(angle);
    const slot = document.createElement('div');
    slot.className = 'cal-day';
    if (d === state.calendar.day) slot.classList.add('current');
    if (foodDays.includes(dayNum)) slot.classList.add('food');
    if (state.calendar.foodDaysDone.includes(dayNum === 7 ? 8 : dayNum === 13 ? 14 : dayNum === 20 ? 21 : 27)) slot.classList.add('done');
    slot.style.left = x + 'px';
    slot.style.top = y + 'px';
    slot.style.position = 'absolute';
    slot.textContent = dayNum;
    wheel.appendChild(slot);
  }
  container.appendChild(wheel);

  const leg = document.createElement('div');
  leg.style.fontSize = '.75rem';
  leg.style.color = 'var(--muted)';
  leg.style.marginTop = '.4rem';
  leg.innerHTML = '<span style="color:var(--accent)">■</span> jour courant · <span style="color:var(--danger)">■</span> jour de famine';
  container.appendChild(leg);
}

function renderTemples() {
  const container = $('temples-card');
  container.innerHTML = '<h3>Temples</h3>';
  D.TEMPLE_ORDER.forEach((tid) => {
    const track = D.TEMPLES[tid];
    const row = document.createElement('div');
    row.className = 'temple-row';
    row.innerHTML = `<div class="temple-name">${track.name}</div>`;
    const t = document.createElement('div');
    t.className = 'temple-track';
    for (let step = 0; step < track.steps.length; step++) {
      const cell = document.createElement('div');
      cell.className = 'temple-step';
      const occupants = state.players.filter((p) => p.temples[tid] === step);
      if (occupants.length) {
        cell.classList.add('filled');
        cell.textContent = occupants.map((p) => p.id + 1).join('');
      }
      t.appendChild(cell);
    }
    row.appendChild(t);
    container.appendChild(row);
  });
}

function renderTech() {
  const container = $('tech-card');
  container.innerHTML = '<h3>Technologies</h3>';
  const pid = state.turn.playerId;
  const p = state.players[pid];
  const div = document.createElement('div');
  div.className = 'tech-list';
  D.TECHNOLOGY_ORDER.forEach((tech) => {
    const row = document.createElement('div');
    row.className = 'tech';
    row.innerHTML = `<span>${D.TECHNOLOGIES[tech].name}</span><span>${p.tech[tech]}</span>`;
    div.appendChild(row);
  });
  container.appendChild(div);
}

function renderBuildings() {
  const container = $('buildings-card');
  container.innerHTML = '<h3>Bâtiments disponibles</h3>';
  const list = document.createElement('div');
  list.className = 'buildings-list';
  state.board.buildings.forEach((id) => {
    if (!id) return;
    const b = D.BUILDINGS.find((x) => x.id === id) || D.EXPANSION_BUILDINGS.find((x) => x.id === id);
    if (!b) return;
    const span = document.createElement('span');
    span.className = 'bldg';
    span.textContent = b.name;
    list.appendChild(span);
  });
  container.appendChild(list);
  const m = document.createElement('div');
  m.style.marginTop = '.5rem';
  m.innerHTML = '<strong style="color:var(--muted);font-size:.8rem">Monuments :</strong> ';
  state.board.monuments.forEach((id) => {
    if (!id) return;
    const mon = D.MONUMENTS.find((x) => x.id === id);
    if (mon) {
      const s = document.createElement('span');
      s.className = 'bldg';
      s.textContent = mon.name;
      m.appendChild(s);
    }
  });
  container.appendChild(m);
}

function renderQuick() {
  const container = $('quick-card');
  container.innerHTML = '<h3>Actions rapides</h3>';
  const qa = state.expansion.quickActions;
  if (!qa) { container.innerHTML += '<p style="color:var(--muted);font-size:.8rem">désactivées</p>'; return; }
  const cur = D.QUICK_ACTIONS[qa.current];
  const p = document.createElement('p');
  p.style.fontSize = '.85rem';
  p.textContent = cur ? `${cur.name} — ${cur.text}` : '—';
  container.appendChild(p);
  const slots = document.createElement('div');
  slots.className = 'slots';
  for (let i = 0; i < qa.spaces.length; i++) {
    const occ = qa.spaces[i];
    const slot = document.createElement('div');
    slot.className = 'slot ' + (occ ? 'occupied' : 'empty');
    if (occ) {
      const pl = state.players[occ.playerId];
      slot.innerHTML = `<span class="worker-dot" style="background:${pl.color}">${occ.playerId + 1}</span>`;
    } else {
      slot.textContent = `espace ${i}`;
      slot.onclick = () => {
        if (currentMode === 'place') dispatch({ type: 'place', quick: i });
      };
    }
    slots.appendChild(slot);
  }
  container.appendChild(slots);
}

function renderLog() {
  const container = $('log-card');
  container.innerHTML = '<h3>Journal</h3>';
  state.log.slice(-18).reverse().forEach((line) => {
    const d = document.createElement('div');
    d.textContent = line;
    container.appendChild(d);
  });
}

function renderDecision() {
  const dec = E.currentDecision(state);
  const modal = $('decision-modal');
  if (!dec) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');
  $('decision-prompt').textContent = dec.prompt;
  const opts = $('decision-options');
  opts.innerHTML = '';
  dec.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.onclick = () => resolveDecision(idx);
    opts.appendChild(btn);
  });
}

function showEnd() {
  showScreen('end-screen');
  const container = $('scores');
  container.innerHTML = '';
  const sorted = [...state.players].sort((a, b) => b.points - a.points);
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>Joueur</th><th>Points</th></tr>';
  sorted.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="${i === 0 ? 'winner' : ''}">${p.name}${isHuman(p.id) ? '' : ' (IA)'}</td><td class="${i === 0 ? 'winner' : ''}">${p.points}</td>`;
    table.appendChild(tr);
  });
  container.appendChild(table);
}

window.addEventListener('error', (e) => { console.error('UI error:', e.message, e.filename, e.lineno); });
window.addEventListener('DOMContentLoaded', () => {
  $('start-btn').onclick = startGame;
  $('mode-place').onclick = () => { currentMode = 'place'; dispatch({ type: 'mode', mode: 'place' }); };
  $('mode-pickup').onclick = () => { currentMode = 'pickup'; dispatch({ type: 'mode', mode: 'pickup' }); };
  $('end-turn').onclick = () => { currentMode = 'place'; dispatch({ type: 'endTurn' }); };
  $('new-game').onclick = () => location.reload();
  $('restart-btn').onclick = () => location.reload();
});

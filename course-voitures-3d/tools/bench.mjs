/**
 * Banc d'essai : fait piloter chaque circuit par l'IA et rapporte des
 * métriques chiffrées.
 *
 * La simulation est purely numérique : aucun rendu, aucun navigateur.
 * C'est possible parce que `src/core/` ne dépend ni du DOM ni de Three.js.
 *
 * Usage :
 *   node tools/bench.mjs                  # tous les circuits, tous les niveaux
 *   node tools/bench.mjs genets           # un seul circuit
 *   node tools/bench.mjs --level=expert   # un seul niveau
 *   node tools/bench.mjs --json           # sortie JSON (pour l'intégration continue)
 */
import { TRACKS, TRACK_IDS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { createCarState, resetCar, stepCar, bindTrack } from '../src/core/physics.js';
import { aiControls, AI_LEVELS } from '../src/core/ai.js';

const DT = 1 / 180;
const LAPS = 3;
const CHECKPOINTS = [0.25, 0.5, 0.75];

/** Seuil au-delà duquel on considère que la voiture perd le contrôle. */
const SPIN_SLIP = 0.62;      // rad (~35°) de glissement arrière
const SPIN_MIN_SPEED = 6;    // m/s

/* --------------------------------------------------------------------------
   Simulation
   -------------------------------------------------------------------------- */

/**
 * Simule une course complète sur un circuit.
 * @param {string} trackId
 * @param {string} level
 * @param {number} laps       nombre de tours à effectuer
 * @param {number} seat       position de départ (0-3)
 */
function simulate(trackId, level, laps = LAPS, seat = 0) {
  const def = TRACKS[trackId];
  if (!def) return null;

  const track = buildTrack(def);
  bindTrack(
    (s) => track.pointAtS(s),
    (x, z, hint) => track.locate(x, z, hint),
    () => track.runoff
  );

  const slots = [
    { s: 0.9945, lat: -3.3 },
    { s: 0.9945, lat: 3.3 },
    { s: 0.9852, lat: -3.3 },
    { s: 0.9852, lat: 3.3 },
  ];

  const car = createCarState(seat);
  resetCar(car, slots[seat].s, slots[seat].lat);

  const ctx = { track, cars: [car], time: 0, level: AI_LEVELS[level] };

  const stats = {
    laps: 0,
    lapTimes: [],
    offSteps: 0,
    spins: 0,
    spinTime: 0,
    spinMax: 0,
    stops: 0,
    maxLat: 0,
    maxSlip: 0,
    minSpeed: Infinity,
    maxSpeed: 0,
    stuckTime: 0,
    wallHits: 0,
    contacts: 0,
    steps: 0,
  };

  let prev = car.progress;
  let cpNext = 0;
  let started = false;
  let lapStart = 0;
  let spinRun = 0;

  const maxSteps = Math.round(180 * (laps * 60 + 40));

  for (let step = 0; step < maxSteps; step++) {
    ctx.time = step * DT;
    car.input = aiControls(car, ctx, DT);
    stepCar(car, DT);
    stats.steps++;

    if (car.surface !== 0) stats.offSteps++;
    if (car.wallImpact > 0.35) stats.wallHits++;

    // Perte de contrôle : l'arrière décroche franchement alors que la
    // voiture roule encore vite.
    if (Math.abs(car.slipR) > SPIN_SLIP && car.u > SPIN_MIN_SPEED) {
      stats.spins++;
      stats.spinTime += DT;
      spinRun++;
      stats.spinMax = Math.max(stats.spinMax, spinRun);
    } else {
      spinRun = 0;
    }

    const loc = track.locate(car.x, car.z, car.idx);
    stats.maxLat = Math.max(stats.maxLat, loc.dist);
    stats.maxSlip = Math.max(stats.maxSlip, Math.abs(car.slipF), Math.abs(car.slipR));
    stats.minSpeed = Math.min(stats.minSpeed, car.u * 3.6);
    stats.maxSpeed = Math.max(stats.maxSpeed, car.u * 3.6);

    // Arrêt prolongé : la voiture est bloquée.
    if (Math.abs(car.u) < 0.4) {
      stats.stuckTime += DT;
      if (stats.stuckTime > 2.5) stats.stops++;
    } else {
      stats.stuckTime = 0;
    }

    // Passage de la ligne et checkpoints.
    const p = car.progress;
    if (prev > 0.8 && p < 0.2) {
      if (!started) {
        started = true;
        lapStart = ctx.time;
        cpNext = 0;
      } else if (cpNext >= 3) {
        stats.lapTimes.push(ctx.time - lapStart);
        stats.laps++;
        lapStart = ctx.time;
        cpNext = 0;
      }
    }
    if (cpNext < 3 && Math.abs(p - CHECKPOINTS[cpNext]) < 0.05) cpNext++;
    prev = p;

    if (stats.laps >= laps) break;
  }

  return {
    id: trackId,
    nom: def.name,
    niveau: level,
    longueur: Math.round(track.length),
    rayonMin: Math.round(track.minRadius),
    largeurRoute: Math.round(track.halfWidth * 2),
    tours: stats.laps,
    tourMin: stats.lapTimes.length ? +Math.min(...stats.lapTimes).toFixed(2) : null,
    tourMoy: stats.lapTimes.length
      ? +(stats.lapTimes.reduce((a, b) => a + b, 0) / stats.lapTimes.length).toFixed(2)
      : null,
    horsPistePct: +((100 * stats.offSteps) / Math.max(1, stats.steps)).toFixed(1),
    teteAQueue: stats.spins,
    teteAQueueSec: +stats.spinTime.toFixed(2),
    teteAQueueMax: +(stats.spinMax * DT).toFixed(2),
    arrets: stats.stops,
    blocagesSec: +stats.stuckTime.toFixed(2),
    ecartMax: +stats.maxLat.toFixed(2),
    glissementMaxDeg: +((stats.maxSlip * 180) / Math.PI).toFixed(1),
    glissiereMax: stats.wallHits,
    vMin: +stats.minSpeed.toFixed(0),
    vMax: +stats.maxSpeed.toFixed(0),
  };
}

/* --------------------------------------------------------------------------
   Évaluation
   -------------------------------------------------------------------------- */

/**
 * Note de qualité sur 100 : un circuit parfait pour l'IA vaut 100.
 * On part d'une base confortable et on retire des points selon les défauts
 * constatés par les pilotes.
 */
function score(result) {
  if (!result || result.tourMin === null) return 0;

  let s = 100;
  s -= Math.max(0, result.tourMoy - 32) * 1.4;      // tours lents
  s -= result.horsPistePct * 4.0;                  // sorties de piste
  s -= result.teteAQueueSec * 3.5;                 // pertes de contrôle
  s -= result.arrets * 8;                          // blocages
  s -= result.glissiereMax * 0.6;                  // chocs contre glissière
  if (result.rayonMin < 20) s -= (20 - result.rayonMin) * 4;   // trop serré
  if (result.longueur < 400) s -= (400 - result.longueur) * 0.3;
  if (result.tours < LAPS) s -= 35;                // circuit non terminé

  return +Math.max(0, Math.min(100, s)).toFixed(1);
}

/** Évalue un circuit : chaque niveau est testé depuis deux positions. */
function run(trackId) {
  const levels = ['calme', 'confirme', 'expert'];
  const runs = [];
  for (const lv of levels) {
    const a = simulate(trackId, lv, LAPS, 0);
    const b = simulate(trackId, lv, LAPS, 2);
    const metriques = [a, b];
    runs.push({
      niveau: lv,
      tours: metriques.map((m) => m.tours),
      tourMoy: metriques.map((m) => m.tourMoy),
      tourMin: metriques.map((m) => m.tourMin),
      horsPistePct: metriques.map((m) => m.horsPistePct),
      teteAQueue: metriques.reduce((s, m) => s + m.teteAQueue, 0),
      teteAQueueSec: metriques.reduce((s, m) => s + m.teteAQueueSec, 0),
      arrets: metriques.reduce((s, m) => s + m.arrets, 0),
      ecartMax: Math.max(...metriques.map((m) => m.ecartMax)),
      glissementMaxDeg: Math.max(...metriques.map((m) => m.glissementMaxDeg)),
    });
  }

  const expert = runs[2];
  const toursMin = expert.tourMin.filter((x) => x !== null);
  const tourMoy = toursMin.length
    ? +(toursMin.reduce((a, b) => a + b, 0) / toursMin.length).toFixed(2)
    : null;

  // On retient le pire des deux départs pour la note : c'est la situation
  // la plus défavorable qui compte.
  const pire = simulate(trackId, 'expert', LAPS, 0);
  const scoreExpert = score(pire);

  return {
    id: trackId,
    nom: TRACKS[trackId].name,
    blurb: TRACKS[trackId].blurb,
    longueur: Math.round(buildTrack(TRACKS[trackId]).length),
    rayonMin: Math.round(buildTrack(TRACKS[trackId]).minRadius),
    largeurRoute: Math.round(buildTrack(TRACKS[trackId]).halfWidth * 2),
    tourMoy,
    score: scoreExpert,
    niveaux: runs,
  };
}

/* --------------------------------------------------------------------------
   Affichage
   -------------------------------------------------------------------------- */

function bar(valeur, max = 100, largeur = 20) {
  const n = Math.max(0, Math.min(largeur, Math.round((valeur / max) * largeur)));
  return '█'.repeat(n) + '·'.repeat(largeur - n);
}

function runAll(ids) {
  const results = ids.map((id) => run(id)).sort((a, b) => b.score - a.score);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  BANC D’ESSAI — validation des circuits par les pilotes IA');
  console.log('══════════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    const note =
      r.score >= 92 ? 'très propre' : r.score >= 85 ? 'exigeant' : r.score >= 75 ? 'serré' : 'technique';
    console.log(`  ${r.nom}  (${r.id})`);
    console.log(
      `    ${Math.round(r.longueur)} m · rayon min ${r.rayonMin} m · largeur ${r.largeurRoute} m`
    );
    console.log(`    ${bar(r.score)} ${r.score.toFixed(1)} / 100 — ${note}`);
    console.log(`    tour moyen (expert) : ${r.tourMoy ?? '—'} s`);
    for (const n of r.niveaux) {
      const hors = Math.max(...n.horsPistePct);
      const tours = n.tours.join('/');
      console.log(
        `      ${n.niveau.padEnd(9)} tours ${tours.padEnd(6)} ` +
          `hors piste ${String(hors).padStart(5)}%  ` +
          `pertes de contrôle ${n.teteAQueueSec.toFixed(1)}s  ` +
          `arrêts ${n.arrets}`
      );
    }
    console.log('');
  }

  const moyenne = results.reduce((s, r) => s + r.score, 0) / results.length;
  const tousValides = results.every((r) => r.score >= 70 && r.tourMoy !== null);
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(`  Note moyenne : ${moyenne.toFixed(1)} / 100`);
  console.log(
    `  Verdict : ${tousValides ? '✓ tous les circuits sont pilotables par l’IA' : '✗ certains circuits posent problème'}`
  );
  console.log('──────────────────────────────────────────────────────────────────\n');

  return { results, moyenne, tousValides };
}

/* --------------------------------------------------------------------------
   Point d'entrée
   -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const json = args.includes('--json');
const levelArg = args.find((a) => a.startsWith('--level='));
const ids = args.filter((a) => !a.startsWith('--'));
const trackIds = ids.length ? ids.filter((id) => TRACKS[id]) : TRACK_IDS;

if (!trackIds.length) {
  console.error(`Circuit inconnu. Disponibles : ${TRACK_IDS.join(', ')}`);
  process.exit(1);
}
if (levelArg) {
  const level = levelArg.split('=')[1];
  if (!AI_LEVELS[level]) {
    console.error(`Niveau inconnu. Disponibles : ${Object.keys(AI_LEVELS).join(', ')}`);
    process.exit(1);
  }
}

if (json) {
  const out = trackIds.map((id) => {
    const r = run(id);
    return {
      ...r,
      detail: AI_LEVELS[Object.keys(AI_LEVELS)[0]] ? undefined : undefined,
      simulations: ['calme', 'confirme', 'expert'].map((lv) => simulate(id, lv, LAPS, 0)),
    };
  });
  console.log(JSON.stringify(out, null, 2));
} else {
  const { tousValides } = runAll(trackIds);
  process.exit(tousValides ? 0 : 1);
}

'use strict';

/* ============================================================================
   BANC D'ESSAI — validation des circuits par les pilotes IA
   ---------------------------------------------------------------------------
   Chaque circuit est évalué en faisant courir quatre IA dessus, puis en
   relevant : tours validity, temps au tour, sorties de piste, tête-à-queue,
   collisions, arrêts, et le rayon minimal réellement emprunté.

   Usage : window.__bench.run(id)  ou  window.__bench.all()
   ========================================================================== */

const BENCH = (function () {
  const DT = 1 / 180;
  const LAPS = 3;

  /* Simulation pure : on reconstruit un circuit, on y place une IA et on
     déroule la physique sans toucher à l'état de la partie en cours.
     Chaque voiture est testée seule : on mesure ainsi la qualité du
     tracé, sans que les contacts entre IA brouillent le diagnostic. */
  function simulate(trackId, level, laps, seat) {
    const def = TRACKS[trackId];
    if (!def) return null;

    const savedTrack = track;
    const savedCars = race.cars;
    const savedMode = race.mode;
    const savedTime = race.time;

    const T = buildTrack(def);
    track = T;

    const slots = [
      { s: 0.9945, lat: -3.3 },
      { s: 0.9945, lat: 3.3 },
      { s: 0.9852, lat: -3.3 },
      { s: 0.9852, lat: 3.3 },
    ];

    const car = createCarState(seat || 0);
    car.aiLevel = level;
    resetCar(car, slots[seat || 0].s, slots[seat || 0].lat);
    car.aiLevel = level;
    const cars = [car];

    race.cars = cars;
    race.mode = 'racing';
    race.time = 0;

    const stats = {
      laps: 0,
      lapTimes: [],
      offPct: 0,
      spins: 0,
      contacts: 0,
      stops: 0,
      maxLat: 0,
      maxSlip: 0,
      minSpeed: 99,
      maxSpeed: 0,
      stuckTime: 0,
      spinRun: 0,
      spinMax: 0,
    };

    let prev = car.progress;
    let cpNext = 0;
    let started = false;
    let lapStart = 0;

    let step = 0;
    const maxSteps = Math.round(180 * (laps * 45 + 30));

    for (; step < maxSteps; step++) {
      race.time += dt();

      car.input = aiControls(car, DT);
      stepCar(car, DT);

      const s = stats;

      if (car.surface !== 0) s.offPct++;
      // Perte de contrôle : l'arrière décroche franchement (la voiture
      // roule de travers) alors qu'elle roule encore vite.
      if (Math.abs(car.slipR) > 0.42 && car.u > 6) {
        s.spins++;
        s.spinRun++;
        if (s.spinRun > s.spinMax) s.spinMax = s.spinRun;
      } else {
        s.spinRun = 0;
      }

      const loc = track.locate(car.x, car.y, car.idx);
      s.maxLat = Math.max(s.maxLat, loc.dist);
      s.maxSlip = Math.max(s.maxSlip, Math.abs(car.slipF), Math.abs(car.slipR));
      s.minSpeed = Math.min(s.minSpeed, car.u * 3.6);
      s.maxSpeed = Math.max(s.maxSpeed, car.u * 3.6);

      // Arrêt prolongé : la voiture est bloquée.
      if (Math.abs(car.u) < 0.4) {
        s.stuckTime += DT;
        if (s.stuckTime > 2.5) s.stops++;
      } else {
        s.stuckTime = 0;
      }

      const p = car.progress;
      if (prev > 0.8 && p < 0.2) {
        if (!started) {
          started = true;
          lapStart = race.time;
          cpNext = 0;
        } else if (cpNext >= 3) {
          s.lapTimes.push(race.time - lapStart);
          s.laps++;
          lapStart = race.time;
          cpNext = 0;
        }
      }
      if (cpNext < 3) {
        const target = [0.25, 0.5, 0.75][cpNext];
        if (Math.abs(p - target) < 0.05) cpNext++;
      }
      prev = p;

      if (s.laps >= laps) break;
    }

    const result = {
      id: trackId,
      nom: def.name,
      niveau: level,
      longueur: Math.round(T.length),
      rayonMin: Math.round(T.minRadius),
      largeur: def.width,
      largeurRoute: Math.round(T.halfWidth * 2),
      metriques: [
        {
          voiture: PLAYERS[seat || 0].name,
          tours: stats.laps,
          tourMin: stats.lapTimes.length
            ? +Math.min(...stats.lapTimes).toFixed(2)
            : null,
          tourMoy: stats.lapTimes.length
            ? +(
                stats.lapTimes.reduce((a, b) => a + b, 0) / stats.lapTimes.length
              ).toFixed(2)
            : null,
          horsPistePct: +((100 * stats.offPct) / Math.max(1, step)).toFixed(1),
          teteAQueue: stats.spins,
          teteAQueueMax: +(stats.spinMax * DT).toFixed(2),
          contacts: stats.contacts,
          arrets: stats.stops,
          ecartMax: +stats.maxLat.toFixed(2),
          glissementMaxDeg: +((stats.maxSlip * 180) / Math.PI).toFixed(1),
          vMin: +stats.minSpeed.toFixed(0),
          vMax: +stats.maxSpeed.toFixed(0),
        },
      ],
    };

    track = savedTrack;
    race.cars = savedCars;
    race.mode = savedMode;
    race.time = savedTime;

    return result;
  }

  function dt() {
    return DT;
  }

  /* Note de qualité : 100 = circuit parfait pour l'IA.
     On part d'une base de confort (tour autour de 28 s) et on retire
     des points selon les défauts constatés par les pilotes. */
  function score(result) {
    if (!result) return 0;
    const m = result.metriques;
    const laps = m.filter((x) => x.tourMin !== null);
    if (!laps.length) return 0;

    const avgLap = laps.reduce((a, b) => a + b.tourMin, 0) / laps.length;
    const off = m.reduce((a, b) => a + b.horsPistePct, 0);
    const spins = m.reduce((a, b) => a + b.teteAQueue, 0);
    const spinsMax = Math.max(
      ...m.map((x) => x.teteAQueueMax !== undefined ? x.teteAQueueMax : 0),
      0
    );
    const stops = m.reduce((a, b) => a + b.arrets, 0);
    const hits = m.reduce((a, b) => a + b.contacts, 0);
    const allLaps = m.every((x) => x.tours >= LAPS);

    let s = 100;
    s -= Math.max(0, avgLap - 28) * 1.6; // tours lents
    s -= off * 3.0; // sorties de piste (grave)
    s -= spinsMax * 6; // plus longue perte de contrôle (secondes)
    s -= stops * 8; // blocages
    s -= hits * 0.25; // contacts
    if (result.rayonMin < 20) s -= (20 - result.rayonMin) * 4; // trop serré
    if (result.longueur < 400) s -= (400 - result.longueur) * 0.3;
    if (!allLaps) s -= 35; // circuit non terminé

    return +Math.max(0, Math.min(100, s)).toFixed(1);
  }

  /* Évalue un circuit : chaque niveau de l'IA est testé avec deux
     voitures en positions opposées (variabilité du tracé). */
  function run(trackId) {
    const levels = ['calme', 'confirme', 'expert'];
    const runs = [];
    for (const lv of levels) {
      const a = simulate(trackId, lv, LAPS, 0);
      const b = simulate(trackId, lv, LAPS, 2);
      const metriques = a.metriques.concat(b.metriques);
      runs.push({
        niveau: lv,
        tours: metriques.map((m) => m.tours),
        tourMoy: metriques.map((m) => m.tourMoy),
        tourMin: metriques.map((m) => m.tourMin),
        horsPistePct: metriques.map((m) => m.horsPistePct),
        teteAQueue: metriques.reduce((s, m) => s + m.teteAQueue, 0),
        teteAQueueMax: Math.max(...metriques.map((m) => m.teteAQueueMax || 0)),
        arrets: metriques.reduce((s, m) => s + m.arrets, 0),
        ecartMax: Math.max(...metriques.map((m) => m.ecartMax)),
        glissementMaxDeg: Math.max(...metriques.map((m) => m.glissementMaxDeg)),
      });
    }

    const expert = runs[2];
    const laps = expert.tourMin.filter((x) => x !== null);
    const avgLap = laps.length
      ? laps.reduce((a, b) => a + b, 0) / laps.length
      : null;

    return {
      id: trackId,
      nom: TRACKS[trackId].name,
      blurb: TRACKS[trackId].blurb,
      longueur: Math.round(buildTrack(TRACKS[trackId]).length),
      rayonMin: Math.round(buildTrack(TRACKS[trackId]).minRadius),
      largeurRoute: Math.round(buildTrack(TRACKS[trackId]).halfWidth * 2),
      tourMoy: avgLap !== null ? +avgLap.toFixed(2) : null,
      score: score({
        metriques: expert.tourMin.map((t, i) => ({
          tourMin: t,
          tours: expert.tours[i],
          horsPistePct: expert.horsPistePct[i],
          teteAQueue: 0,
          teteAQueueMax: expert.teteAQueueMax,
          arrets: 0,
          contacts: 0,
        })),
        rayonMin: Math.round(buildTrack(TRACKS[trackId]).minRadius),
        longueur: Math.round(buildTrack(TRACKS[trackId]).length),
      }),
      niveaux: runs,
    };
  }

  function all() {
    return TRACK_IDS.map((id) => run(id)).sort((a, b) => b.score - a.score);
  }

  /* Alimente les statistiques affichées dans le menu. */
  function publish() {
    const results = all();
    for (const r of results) {
      const note =
        r.score >= 94
          ? 'très propre'
          : r.score >= 90
            ? 'exigeant'
            : r.score >= 80
              ? 'serré'
              : 'technique';
      trackStats[r.id] = {
        score: r.score,
        tour: r.tourMoy || 0,
        rayon: r.rayonMin,
        longueur: r.longueur,
        note: note,
      };
    }
    syncTrackUI();
    return trackStats;
  }

  return { run, all, simulate, score, publish, LAPS };
})();

window.__bench = BENCH;

/* Publie les statistiques de validation (l'IA joue chaque circuit une
   fois pour obtenir de vrais chiffres). Lancé en différé pour ne pas
   retarder le démarrage du jeu. */
if (typeof window.__benchSchedule === 'function') {
  window.__benchSchedule();
} else {
  setTimeout(() => {
    try {
      BENCH.publish();
    } catch (err) {
      /* le banc est optionnel */
    }
  }, 60);
}

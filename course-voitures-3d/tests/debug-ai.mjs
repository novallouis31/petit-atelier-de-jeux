/** Débogage : vérifie que l'IA suit la piste sur un circuit réel. */
import { TRACKS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { createCarState, resetCar, stepCar, bindTrack } from '../src/core/physics.js';
import { aiControls, AI_LEVELS } from '../src/core/ai.js';

const track = buildTrack(TRACKS.genets);
bindTrack((s) => track.pointAtS(s), (x, z, h) => track.locate(x, z, h), () => track.runoff);

const DT = 1 / 180;
const car = createCarState(0);
resetCar(car, 0.5, 0);
const ctx = { track, cars: [car], time: 0, level: AI_LEVELS.expert };

let prev = car.progress;
let cp = 0, started = false, laps = 0;
let maxLat = 0, off = 0, spins = 0;

for (let i = 0; i < 180 * 90; i++) {
  ctx.time = i * DT;
  car.input = aiControls(car, ctx, DT);
  stepCar(car, DT);
  const loc = track.locate(car.x, car.z, car.idx);
  maxLat = Math.max(maxLat, loc.dist);
  if (car.surface !== 0) off++;
  if (Math.abs(car.slipR) > 0.42 && car.u > 6) spins++;
  if (prev > 0.8 && car.progress < 0.2) {
    if (!started) { started = true; }
    else if (cp >= 3) { laps++; cp = 0; console.log(`tour ${laps} à t=${(i*DT).toFixed(1)}s  u=${(car.u*3.6).toFixed(0)} km/h`); }
  }
  if (cp < 3 && Math.abs(car.progress - [0.25,0.5,0.75][cp]) < 0.05) cp++;
  prev = car.progress;
  if (i % 900 === 0) {
    console.log(`t=${(i*DT).toFixed(0)}s u=${(car.u*3.6).toFixed(0)}km/h lat=${loc.lateral.toFixed(2)} surf=${car.surface} steer=${car.input.steer.toFixed(2)}`);
  }
}
console.log(`\nRESULTAT : ${laps} tours | hors piste ${(100*off/(180*90)).toFixed(1)}% | spins ${spins} | ecart max ${maxLat.toFixed(2)} m`);

/** Débogage : instrumentation interne de l'IA sur les premiers tours. */
import { TRACKS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { createCarState, resetCar, stepCar, bindTrack } from '../src/core/physics.js';
import { aiControls, aiLineOffset, AI_LEVELS } from '../src/core/ai.js';

const track = buildTrack(TRACKS.genets);
bindTrack((s) => track.pointAtS(s), (x, z, h) => track.locate(x, z, h), () => track.runoff);

const DT = 1 / 180;
const car = createCarState(0);
resetCar(car, 0.5, 0);
const ctx = { track, cars: [car], time: 0, level: AI_LEVELS.expert };

console.log('demi-largeur piste :', track.halfWidth, '| espacement :', track.spacing.toFixed(2));
console.log('point de depart : s=', car.progress.toFixed(3), 'heading=', car.heading.toFixed(3));
const p0 = track.pts[Math.round(car.progress * track.N) % track.N];
console.log('tangente au depart :', p0.tx.toFixed(3), p0.ty.toFixed(3), p0.tz.toFixed(3));
console.log('axe droite au depart :', p0.rx.toFixed(3), p0.ry.toFixed(3), p0.rz.toFixed(3));
console.log('courbure au depart :', p0.curvS.toFixed(5));

for (let i = 0; i < 180 * 12; i++) {
  ctx.time = i * DT;
  car.input = aiControls(car, ctx, DT);
  stepCar(car, DT);
  if (i % 30 === 0) {
    const base = car.idx >= 0 ? car.idx : 0;
    const spacing = track.spacing;
    const near = track.pts[(base + Math.round(6 / spacing)) % track.N];
    const lineNear = aiLineOffset(near, ctx.level, track.halfWidth);
    const absU = Math.abs(car.u);
    const look = 7 + absU * ctx.level.lookK;
    const ti = (base + Math.round(look / spacing)) % track.N;
    const tp = track.pts[ti];
    const off = aiLineOffset(tp, ctx.level, track.halfWidth);
    const tx = tp.x + tp.rx * off;
    const tz = tp.z + tp.rz * off;
    let err = Math.atan2(tz - car.z, tx - car.x) - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const latErr = car.lateral - lineNear;
    const corr = Math.max(-0.22, Math.min(0.22, (latErr * ctx.level.line) / Math.max(5, absU)));
    console.log(
      `t=${(i * DT).toFixed(2)} u=${(car.u * 3.6).toFixed(0)}`,
      `err=${err.toFixed(3)} latErr=${latErr.toFixed(2)} corr=${corr.toFixed(3)}`,
      `steer=${car.input.steer.toFixed(2)} r=${car.r.toFixed(3)}`,
      `lat=${car.lateral.toFixed(2)} line=${lineNear.toFixed(2)}`,
      `surf=${car.surface} off=${off.toFixed(2)}`
    );
  }
}

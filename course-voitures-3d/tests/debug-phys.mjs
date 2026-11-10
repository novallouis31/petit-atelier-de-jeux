/** Script de débogage temporaire : trace l'état d'une voiture pas à pas. */
import { TRACKS } from '../src/core/tracks.js';
import { buildTrack } from '../src/core/track.js';
import { createCarState, resetCar, stepCar, bindTrack } from '../src/core/physics.js';

const track = buildTrack(TRACKS.genets);
bindTrack(
  (s) => track.pointAtS(s),
  (x, z, hint) => track.locate(x, z, hint),
  () => track.runoff
);

const car = createCarState(0);
resetCar(car, 0.5, 0);
console.log('après reset : u=', car.u, 'heading=', car.heading.toFixed(3), 'y=', car.y.toFixed(2));

const DT = 1 / 180;
for (let i = 0; i < 180 * 6; i++) {
  Object.assign(car.input, { throttle: 1, brake: 0, steer: 0, hand: false });
  stepCar(car, DT);
  if (i % 90 === 0) {
    const loc = track.locate(car.x, car.z, car.idx);
    console.log(
      `t=${(i * DT).toFixed(1)} u=${car.u.toFixed(2)} v=${car.v.toFixed(2)} r=${car.r.toFixed(3)}`,
      `ax=${car.ax.toFixed(2)} ay=${car.ay.toFixed(2)}`,
      `slipF=${car.slipF.toFixed(3)} slipR=${car.slipR.toFixed(3)}`,
      `surf=${car.surface} lat=${loc.lateral.toFixed(2)} half=${loc.half.toFixed(1)}`,
      `fzF=${car.fzF.toFixed(0)} fzR=${car.fzR.toFixed(0)}`
    );
  }
}

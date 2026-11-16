import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { analyzeShot } from "./shot-analysis";

// A quick read on what the current setup will do, shown while the golfer is
// still adjusting: the name of the shape and a top-down sketch of the flight.
// It deliberately gives no distance, so game mode still has to be judged.
const PREVIEW_DT = 0.01;
const SKETCH_POINTS = 24;

export function previewShot({ aim = 0, side = "Right", ...setup }) {
  const shot = new Shot({
    dt: PREVIEW_DT,
    ...launchConditions({ side, ...setup }),
  });
  const { shape } = analyzeShot(shot, side);
  shot.aim(aim);

  const last = shot.points.length - 1;
  const carry = shot.points[last].position.z || 1;
  const sketch = [];
  for (let i = 0; i < SKETCH_POINTS; i++) {
    const { position } =
      shot.points[Math.round((i / (SKETCH_POINTS - 1)) * last)];
    // across: fraction of the carry, right positive; along: 0 at the tee, 1
    // where it lands
    sketch.push({
      across: -position.x / carry || 0,
      along: position.z / carry,
    });
  }
  return { shape, sketch };
}

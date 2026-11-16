// Game mode: a target ring somewhere downrange that the ball has to touch.
// Positions are scene units: yards, tee at the origin, downrange is +z and -x
// is the right-hand side.

const NEAREST = 140;
const FARTHEST = 330;
const MAX_OFFLINE = 40;
// Anything this close to the ground counts as touching it.
const GROUND_CONTACT_YARDS = 0.06;

// Farther targets are bigger: 13 yd radius at 140 yd, about 20 at 330.
const radiusAt = (z) => 8 + 0.035 * z;

// `random` returns [0, 1). Pass the previous target to avoid a near repeat,
// and `reach` ({ nearest, farthest } in yards) for a club other than the
// driver, so its targets are ones it can get to.
export function randomTarget(
  random = Math.random,
  previous = null,
  { nearest = NEAREST, farthest = FARTHEST } = {},
) {
  let z = 0;
  let x = 0;
  // A new target should be a real change, but short clubs have little room.
  const apart = Math.min(35, (farthest - nearest) / 3);
  for (let attempt = 0; attempt < 6; attempt++) {
    z = nearest + random() * (farthest - nearest);
    // Targets nearer than the driver's sit nearer the centre line: 40 yd
    // offline at 70 yd out would be half the shot.
    x = (random() * 2 - 1) * Math.min(MAX_OFFLINE, (z * MAX_OFFLINE) / NEAREST);
    if (!previous || Math.hypot(z - previous.z, x - previous.x) > apart) break;
  }
  return {
    x,
    z,
    radius: radiusAt(z),
    distanceYards: Math.round(Math.hypot(x, z)),
    // positive is right of the centre line
    offlineYards: Math.round(-x),
  };
}

// Did the ball touch the target? `path` is everything after touchdown as
// {x, y, z} points; landing in the ring, bouncing in it, rolling through it
// and stopping in it all count.
export function evaluateTarget(target, path) {
  let closest = Infinity;
  for (const point of path) {
    if (point.y > GROUND_CONTACT_YARDS) continue;
    closest = Math.min(
      closest,
      Math.hypot(point.x - target.x, point.z - target.z),
    );
  }
  const rest = path[path.length - 1];
  return {
    hit: closest <= target.radius,
    // how far the ball finished from the middle of the target
    restYards: Math.hypot(rest.x - target.x, rest.z - target.z),
    // positive is past the target / right of it
    longYards: rest.z - target.z,
    rightYards: -(rest.x - target.x),
  };
}

// "9 yd short, 4 yd left" for a miss.
export function describeMiss({ longYards, rightYards }) {
  const parts = [];
  const along = Math.round(Math.abs(longYards));
  const across = Math.round(Math.abs(rightYards));
  if (along > 0) parts.push(`${along} yd ${longYards > 0 ? "long" : "short"}`);
  if (across > 0)
    parts.push(`${across} yd ${rightYards > 0 ? "right" : "left"}`);
  return parts.join(", ") || "dead centre";
}

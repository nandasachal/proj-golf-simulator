// Game mode: a target somewhere downrange. Normal targets are circles on the
// ground that the ball has to touch; advanced targets are small spheres in the
// air that it has to fly through. Positions are scene units: yards, tee at the
// origin, downrange is +z and -x is the right-hand side.
import { getClub, swingSpeedRange, DEFAULT_CLUB_ID } from "./clubs";
import { launchConditions } from "./launch-conditions";
import { Shot } from "./shot";
import { toYards } from "./conversions-lib";

// A round is this many targets, one shot at each; hit `toWin` of them to win.
export const ROUND_TARGETS = 5;
export const GOALS = {
  normal: { targets: ROUND_TARGETS, toWin: 3 },
  advanced: { targets: ROUND_TARGETS, toWin: 4 },
};

const NEAREST = 140;
const FARTHEST = 330;
const MAX_OFFLINE = 40;
// Anything this close to the ground counts as touching it.
const GROUND_CONTACT_YARDS = 0.06;

// Farther targets are bigger: about 12 yd radius at 140 yd, 18 at 330.
const radiusAt = (z) => 7.2 + 0.0315 * z;

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

// Air targets are small, and a little bigger the farther out they are: 2.2 yd
// radius at 100 yd, 2.9 at 200.
const airRadiusAt = (z) => 1.6 + 0.0064 * z;
const AIR_DT = 0.01;
// How hard a face or path (degrees) the shot a target is taken from may have.
const AIR_MAX_ANGLE = 3;

// A target in the air that the club in hand can reach: a random swing is
// flown and the target is put somewhere along its flight, so targets turn up
// low and early, at the top, and late on the way down, either side of the
// centre line.
export function randomAirTarget(
  random = Math.random,
  previous = null,
  clubId = DEFAULT_CLUB_ID,
) {
  const speeds = swingSpeedRange(getClub(clubId));
  let target = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const shot = new Shot({
      dt: AIR_DT,
      ...launchConditions({
        swingSpeedMPH:
          speeds.MIN + (0.25 + 0.75 * random()) * (speeds.MAX - speeds.MIN),
        faceAngle: (random() * 2 - 1) * AIR_MAX_ANGLE,
        pathAngle: (random() * 2 - 1) * AIR_MAX_ANGLE,
        side: "Right",
        club: clubId,
      }),
    });
    const along = 0.3 + 0.55 * random();
    const { position } =
      shot.points[Math.floor(along * (shot.points.length - 1))];
    const x = toYards(position.x);
    const z = toYards(position.z);
    const radius = airRadiusAt(z);
    // Clear of the turf, so it reads as floating.
    const y = Math.max(toYards(position.y), radius + 1);
    target = {
      air: true,
      x,
      y,
      z,
      radius,
      distanceYards: Math.round(Math.hypot(x, z)),
      offlineYards: Math.round(-x),
      heightYards: Math.round(y),
    };
    if (
      !previous ||
      Math.hypot(z - previous.z, x - previous.x, y - (previous.y || 0)) > 20
    )
      break;
  }
  return target;
}

const distanceToSegment = (target, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t = length
    ? Math.min(
        1,
        Math.max(
          0,
          ((target.x - a.x) * dx +
            (target.y - a.y) * dy +
            (target.z - a.z) * dz) /
            length,
        ),
      )
    : 0;
  return Math.hypot(
    a.x + t * dx - target.x,
    a.y + t * dy - target.y,
    a.z + t * dz - target.z,
  );
};

// Did the ball pass through the sphere? `path` is the whole shot, flight then
// bounces and roll. A miss is described where the ball passed the target's
// distance, or by how far short it stopped if it never got there.
function evaluateAirTarget(target, path) {
  let closest = Infinity;
  let crossing = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    closest = Math.min(closest, distanceToSegment(target, a, b));
    if (!crossing && a.z < target.z && b.z >= target.z) {
      const t = (target.z - a.z) / (b.z - a.z);
      crossing = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
  }
  const rest = path[path.length - 1];
  return {
    air: true,
    hit: closest <= target.radius,
    closestYards: closest,
    // positive is above the target / right of it
    highYards: crossing ? crossing.y - target.y : null,
    rightYards: crossing ? -(crossing.x - target.x) : null,
    shortYards: crossing ? null : target.z - rest.z,
  };
}

// Did the ball touch the target? `path` is everything after touchdown as
// {x, y, z} points; landing in the ring, bouncing in it, rolling through it
// and stopping in it all count. An air target is judged against the flight
// (`flight`, the points before touchdown) as well.
export function evaluateTarget(target, path, flight = []) {
  if (target.air) return evaluateAirTarget(target, [...flight, ...path]);
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
// For an air target: "5 yd low, 3 yd right", or "fell 40 yd short".
export function describeMiss(outcome) {
  const { longYards, rightYards } = outcome;
  const parts = [];
  if (outcome.air) {
    if (outcome.shortYards != null)
      return `fell ${Math.round(outcome.shortYards)} yd short`;
    const up = Math.round(Math.abs(outcome.highYards));
    const side = Math.round(Math.abs(rightYards));
    if (up > 0)
      parts.push(`${up} yd ${outcome.highYards > 0 ? "high" : "low"}`);
    if (side > 0) parts.push(`${side} yd ${rightYards > 0 ? "right" : "left"}`);
    return parts.join(", ") || "just outside";
  }
  const along = Math.round(Math.abs(longYards));
  const across = Math.round(Math.abs(rightYards));
  if (along > 0) parts.push(`${along} yd ${longYards > 0 ? "long" : "short"}`);
  if (across > 0)
    parts.push(`${across} yd ${rightYards > 0 ? "right" : "left"}`);
  return parts.join(", ") || "dead centre";
}

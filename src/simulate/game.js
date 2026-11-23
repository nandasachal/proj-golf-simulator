// Game mode: a target somewhere downrange. The modes are stored and sent
// under the names they were first given: "normal" is Easy on screen, and
// "advanced" is Hard.
//   Easy (normal): a small circle on the ground, under a beam, that the ball
//     has to touch, with any club and any shot.
//   Medium: the same circle, but the target names the club and the shape
//     (draw, fade or straight) it has to be hit with.
//   Hard (advanced): club and shape are named too, and the target is a small
//     sphere in the air that the ball has to fly through.
// Positions are scene units: yards, tee at the origin, downrange is +z and -x
// is the right-hand side.
import { CLUBS, getClub, swingSpeedRange, DEFAULT_CLUB_ID } from "./clubs";
import { launchConditions } from "./launch-conditions";
import { Shot } from "./shot";
import { toYards } from "./conversions-lib";
import { groundRun, turfParameters, TURF_PRESETS } from "./ground";
import { analyzeShot } from "./shot-analysis";

// A round is this many targets, one shot at each; hit `toWin` of them to win.
export const ROUND_TARGETS = 5;
export const GOALS = {
  normal: { targets: ROUND_TARGETS, toWin: 3 },
  medium: { targets: ROUND_TARGETS, toWin: 3 },
  advanced: { targets: ROUND_TARGETS, toWin: 4 },
};

const NEAREST = 140;
const FARTHEST = 330;
const MAX_OFFLINE = 40;
// Anything this close to the ground counts as touching it.
const GROUND_CONTACT_YARDS = 0.06;

// A ground target is the foot of its beam, the same size at any distance.
const GROUND_RADIUS = 7.2;

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
    radius: GROUND_RADIUS,
    distanceYards: Math.round(Math.hypot(x, z)),
    // positive is right of the centre line
    offlineYards: Math.round(-x),
  };
}

// A visitor's very first target: on the centre line where a straight shot
// with the club's stock swing comes to rest, so pressing Hit without touching
// anything scores. `speed` is the stock swing speed (it can be changed in
// Settings); `turf` decides how far the ball runs.
export function easyTarget({ clubId = DEFAULT_CLUB_ID, speed, turf }) {
  const shot = new Shot({
    dt: AIR_DT,
    ...launchConditions({
      swingSpeedMPH: speed,
      faceAngle: 0,
      pathAngle: 0,
      side: "Right",
      club: clubId,
    }),
  });
  const touchdown = shot.points[shot.points.length - 1];
  const run = groundRun(touchdown, turfParameters(turf));
  const z = toYards(run.points[run.points.length - 1].position.z);
  return {
    x: 0,
    z,
    radius: GROUND_RADIUS,
    distanceYards: Math.round(z),
    offlineYards: 0,
    easy: true,
  };
}

// Air targets are small, and a little bigger the farther out they are: 2.2 yd
// radius at 100 yd, 2.9 at 200.
const airRadiusAt = (z) => 1.6 + 0.0064 * z;
const AIR_DT = 0.01;

// The three shapes a target can ask for, and which of them a shot was: the
// way it curved, whatever line it started on ("Push Draw" is a draw, a hook
// is a big one).
export const SHAPES = ["Draw", "Fade", "Straight"];
export const curveOf = (shape) => {
  if (/Draw|Hook/.test(shape)) return "Draw";
  if (/Fade|Slice/.test(shape)) return "Fade";
  return "Straight";
};

// A target that names its club and shape is taken from a real swing, so the
// combination can always be played: any club in the bag, swung anywhere from
// a part swing to its fullest, with a path, a face and an aim the controls
// can be set to exactly (whole degrees and whole mph, everything else left
// alone). A driver bumped 80 yd and a flat-out 7 iron both turn up.
const SHAPED_MAX_PATH = 3;
const SHAPED_MAX_FACE = 6;
const SHAPED_MAX_BEND = 5;
const SHAPED_MAX_AIM = 4;
// How much the swing a target is taken from curves, as a share of its carry.
// A draw or fade is clear of straight (which ends at 1.2%) and short of a
// hook or slice (10%), so a wedge only gets one where it can bend that much.
const SHAPED_CURVE = { min: 0.02, max: 0.09 };
const SHAPED_STRAIGHT = 0.006;
const SHAPED_APART = 20;
// Nearer than this is no target at all: the softest lob wedge stops about
// 23 yd out.
const SHAPED_NEAREST = 30;
const SHAPED_ATTEMPTS = 60;

function fly({ clubId, shape, speed, face, path, aim }, side) {
  const shot = new Shot({
    dt: AIR_DT,
    ...launchConditions({
      swingSpeedMPH: speed,
      faceAngle: face,
      pathAngle: path,
      side,
      club: clubId,
    }),
  });
  // Shape is judged against the line aimed down, so before turning the shot.
  const { curveYards, carryYards } = analyzeShot(shot, side);
  shot.aim(aim);
  return {
    clubId,
    shape,
    shot,
    curve: Math.abs(curveYards) / carryYards,
    // One way to play it, kept on the target so the tests can check every
    // target can be hit. Nothing on screen shows it.
    solution: { speed, face, path, aim },
  };
}

// A random swing of that kind, or null if it does not come out as a clean
// example of its shape.
function shapedSwing(random, side) {
  const club = CLUBS[Math.floor(random() * CLUBS.length)];
  const roll = random();
  const shape = SHAPES[roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2];
  const speeds = swingSpeedRange(club);
  const speed = Math.round(speeds.MIN + random() * (speeds.MAX - speeds.MIN));
  // (+ 0: a rounded -0 would show as "-0" on a control.)
  const path = Math.round((random() * 2 - 1) * SHAPED_MAX_PATH) + 0;
  // A face closed to the path draws, open to it fades, for either hand.
  const bend =
    shape === "Straight" ? 0 : 1 + Math.floor(random() * SHAPED_MAX_BEND);
  const face = path + (shape === "Draw" ? -bend : bend);
  const aim = Math.round((random() * 2 - 1) * SHAPED_MAX_AIM) + 0;
  if (Math.abs(face) > SHAPED_MAX_FACE) return null;
  const swing = fly({ clubId: club.id, shape, speed, face, path, aim }, side);
  const clean =
    shape === "Straight"
      ? swing.curve <= SHAPED_STRAIGHT
      : swing.curve >= SHAPED_CURVE.min && swing.curve <= SHAPED_CURVE.max;
  return clean ? swing : null;
}

// Tries swings until `place` makes a target of one: a different club from the
// last target's, somewhere else on the range.
function shapedFrom(random, previous, side, place) {
  for (let attempt = 0; attempt < SHAPED_ATTEMPTS; attempt++) {
    const swing = shapedSwing(random, side);
    if (!swing || swing.clubId === previous?.need?.clubId) continue;
    const target = place(swing);
    if (
      target &&
      (!previous ||
        Math.hypot(target.z - previous.z, target.x - previous.x) > SHAPED_APART)
    )
      return target;
  }
  // Next to never: a stock 7 iron, straight down the middle.
  const club = getClub("7i");
  return place(
    fly(
      {
        clubId: club.id,
        shape: "Straight",
        speed: swingSpeedRange(club).DEFAULT,
        face: 0,
        path: 0,
        aim: 0,
      },
      side,
    ),
  );
}

// A medium target: on the ground where that swing's ball comes to rest.
// `side` is the golfer's hand, since a draw bends the other way left-handed;
// `turf` decides how far the ball runs.
export function shapedTarget(
  random = Math.random,
  previous = null,
  { side = "Right", turf = TURF_PRESETS.normal } = {},
) {
  return shapedFrom(random, previous, side, (swing) => {
    const { clubId, shape, shot, solution } = swing;
    const run = groundRun(
      shot.points[shot.points.length - 1],
      turfParameters(turf),
    );
    const rest = run.points[run.points.length - 1].position;
    const x = toYards(rest.x);
    const z = toYards(rest.z);
    if (z < SHAPED_NEAREST || z > FARTHEST) return null;
    if (Math.abs(x) > Math.min(MAX_OFFLINE, (z * MAX_OFFLINE) / NEAREST))
      return null;
    return {
      x,
      z,
      radius: GROUND_RADIUS,
      distanceYards: Math.round(Math.hypot(x, z)),
      offlineYards: Math.round(-x),
      need: { clubId, shape },
      solution,
    };
  });
}

// A hard target: in the air somewhere along that swing's flight, so targets
// turn up low and early, at the top, and late on the way down, either side
// of the centre line.
export function shapedAirTarget(
  random = Math.random,
  previous = null,
  { side = "Right" } = {},
) {
  return shapedFrom(random, previous, side, (swing) => {
    const { clubId, shape, shot, solution } = swing;
    const along = 0.3 + 0.55 * random();
    const { position } =
      shot.points[Math.floor(along * (shot.points.length - 1))];
    const x = toYards(position.x);
    const z = toYards(position.z);
    const radius = airRadiusAt(z);
    const y = toYards(position.y);
    // It has to float clear of the turf, on the flight itself: a part swing
    // that never gets that high gives no air target.
    if (z < SHAPED_NEAREST || y < radius + 1) return null;
    return {
      air: true,
      x,
      y,
      z,
      radius,
      distanceYards: Math.round(Math.hypot(x, z)),
      offlineYards: Math.round(-x),
      heightYards: Math.round(y),
      need: { clubId, shape },
      solution,
    };
  });
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
// (`flight`, the points before touchdown) as well. A target that names its
// club and shape is only hit by a ball that reaches it (`reached`) with that
// club and that shape; `played` is { clubId, shape } for the shot.
export function evaluateTarget(target, path, flight = [], played = {}) {
  const outcome = touches(target, path, flight);
  if (!target.need) return outcome;
  const shape = curveOf(played.shape);
  const wrongClub = played.clubId !== target.need.clubId;
  const wrongShape = shape !== target.need.shape;
  return {
    ...outcome,
    reached: outcome.hit,
    hit: outcome.hit && !wrongClub && !wrongShape,
    need: target.need,
    shape,
    wrongClub,
    wrongShape,
  };
}

function touches(target, path, flight) {
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

export const SHAPE_NOUN = {
  Draw: "a draw",
  Fade: "a fade",
  Straight: "straight",
};

// "9 yd short, 4 yd left" for a miss.
// For an air target: "5 yd low, 3 yd right", or "fell 40 yd short".
// A ball that got there with the wrong club or shape: "wrong club", or
// "a fade, not a draw".
export function describeMiss(outcome) {
  const { longYards, rightYards } = outcome;
  const parts = [];
  if (outcome.reached) {
    if (outcome.wrongClub) return "wrong club";
    return `${SHAPE_NOUN[outcome.shape]}, not ${SHAPE_NOUN[outcome.need.shape]}`;
  }
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

// Auto club: the club that suits a game target, so a new target can be hit
// without opening the bag. Each club is judged by its stock shot: straight,
// at its stock swing speed (`speeds` holds the ones changed in Settings).
import { CLUBS, swingSpeedRange } from "./clubs";
import { launchConditions } from "./launch-conditions";
import { Shot } from "./shot";
import { toYards } from "./conversions-lib";
import { easyTarget } from "./game";

const FLIGHT_DT = 0.01;

const stockSpeed = (club, speeds) =>
  speeds[club.id] ?? swingSpeedRange(club).DEFAULT;

// Where a club's stock shot comes to rest on this turf, yards from the tee.
const stockRestYards = (club, speeds, turf) =>
  easyTarget({ clubId: club.id, speed: stockSpeed(club, speeds), turf }).z;

// A straight flight with this club swung at `speed`, as [yards out, yards
// up] pairs. The flights the picker tries for every target (each club's
// stock swing and an even spread of speeds) are kept: flying them is most of
// the work, and it would otherwise be done again for every new target.
const kept = new Map();
function flight(club, speed, keep = false) {
  const key = `${club.id}:${speed}`;
  if (kept.has(key)) return kept.get(key);
  const { points } = new Shot({
    dt: FLIGHT_DT,
    ...launchConditions({
      swingSpeedMPH: speed,
      faceAngle: 0,
      pathAngle: 0,
      side: "Right",
      club: club.id,
    }),
  });
  const path = points.map(({ position }) => [
    toYards(position.z),
    toYards(position.y),
  ]);
  if (keep) kept.set(key, path);
  return path;
}

// How near that flight passes to a point `along` yards out and `up` high.
function flightMiss(club, speed, along, up, keep) {
  let nearest = Infinity;
  for (const [z, y] of flight(club, speed, keep)) {
    nearest = Math.min(nearest, Math.hypot(z - along, y - up));
  }
  return nearest;
}

// A flight this near the middle of a sphere goes through it (the smallest
// sphere is 1.6 yd in radius).
const THROUGH_YARDS = 1;
const SPREAD_SPEEDS = 9;
// Flights at neighbouring speeds in the spread are less than twice this far
// apart, so a club whose best one misses by more cannot get through.
const WORTH_REFINING_YARDS = 18;
const REFINE_STEPS = 7;

// Of a club's stock swing and its spread of speeds, the one that passes
// nearest the point. `change` is how far that speed is from stock, as a share
// of the club's swing-speed range.
function nearestOfSpread(club, speeds, along, up) {
  const stock = stockSpeed(club, speeds);
  const stockMiss = flightMiss(club, stock, along, up, true);
  const { MIN, MAX } = swingSpeedRange(club);
  const step = (MAX - MIN) / (SPREAD_SPEEDS - 1);
  let speed = stock;
  let miss = stockMiss;
  for (let i = 0; i < SPREAD_SPEEDS; i++) {
    const tried = MIN + i * step;
    const triedMiss = flightMiss(club, tried, along, up, true);
    if (triedMiss < miss) {
      speed = tried;
      miss = triedMiss;
    }
  }
  const change = Math.abs(speed - stock) / (MAX - MIN);
  return { club, stock, stockMiss, speed, miss, change, step, MIN, MAX };
}

// Closes in on the nearest pass between the spread speeds either side.
function refined(swing, along, up) {
  const { club, stock, step, MIN, MAX } = swing;
  let { speed, miss } = swing;
  let low = Math.max(MIN, speed - step);
  let high = Math.min(MAX, speed + step);
  for (let i = 0; i < REFINE_STEPS; i++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    const missA = flightMiss(club, a, along, up);
    const missB = flightMiss(club, b, along, up);
    if (missA < missB) high = b;
    else low = a;
    if (Math.min(missA, missB) < miss) {
      miss = Math.min(missA, missB);
      speed = missA < missB ? a : b;
    }
  }
  return { miss, change: Math.abs(speed - stock) / (MAX - MIN) };
}

const nearest = (swings, by) =>
  swings.reduce((best, swing) => (by(swing) < by(best) ? swing : best));

function pickAirClub(target, speeds) {
  const along = Math.hypot(target.x, target.z);
  const swings = CLUBS.map((club) =>
    nearestOfSpread(club, speeds, along, target.y),
  );
  // A stock swing that goes through needs no change at all.
  const stock = swings.filter((swing) => swing.stockMiss <= THROUGH_YARDS);
  if (stock.length) return nearest(stock, (swing) => swing.stockMiss).club.id;
  // Otherwise the least change of speed that gets through. Closing in can
  // move a club's speed by one step of the spread at most, so clubs are taken
  // nearest stock first, until the rest could not do better.
  const slack = 1 / (SPREAD_SPEEDS - 1);
  const close = swings
    .filter((swing) => swing.miss <= WORTH_REFINING_YARDS)
    .sort((a, b) => a.change - b.change);
  let best = null;
  for (const swing of close) {
    if (best && swing.change - slack > best.change) break;
    Object.assign(swing, refined(swing, along, target.y));
    if (swing.miss <= THROUGH_YARDS && (!best || swing.change < best.change))
      best = swing;
  }
  // No club gets through: the one that passes nearest.
  return (best || nearest(swings, (swing) => swing.miss)).club.id;
}

// The id of the club for `target`.
//
// A ground target goes to the club whose stock shot stops nearest its
// distance along the ground. A target shorter or longer than any club reaches
// gets the club that comes nearest: the lob wedge, or the driver.
//
// An air target is judged by where the sphere is, its distance out and its
// height, not by where a ball through it would land. It goes to the club
// whose stock swing flies a straight shot through it; failing that, to the
// club that gets through with the least change to its stock swing speed; and
// if no club can, to the one that passes nearest.
//
// Of two equally good clubs the one earlier in the bag wins.
export function pickClub(target, { speeds = {}, turf } = {}) {
  if (target.air) return pickAirClub(target, speeds);
  const along = Math.hypot(target.x, target.z);
  return nearest(CLUBS, (club) =>
    Math.abs(stockRestYards(club, speeds, turf) - along),
  ).id;
}

// Ground targets for the whole bag: from where the shortest club's stock shot
// stops out to the driver's usual farthest.
export function bagReach({ speeds = {}, turf } = {}) {
  return {
    nearest: Math.min(
      ...CLUBS.map((club) => stockRestYards(club, speeds, turf)),
    ),
  };
}

import {
  randomTarget,
  randomAirTarget,
  evaluateTarget,
  describeMiss,
  GOALS,
} from "./game";
import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { toYards } from "./conversions-lib";

// A repeatable stand-in for Math.random.
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("randomTarget", () => {
  test("stays on the range, within reach of the swing-speed slider", () => {
    for (let i = 0; i < 500; i++) {
      const target = randomTarget();
      expect(target.z).toBeGreaterThanOrEqual(140);
      expect(target.z).toBeLessThanOrEqual(330);
      expect(Math.abs(target.x)).toBeLessThanOrEqual(40);
      expect(target.radius).toBe(3.6);
    }
  });

  test("a club's reach moves the targets in, and nearer the centre line", () => {
    const reach = { nearest: 62, farthest: 114 };
    for (let i = 0; i < 300; i++) {
      const target = randomTarget(Math.random, null, reach);
      expect(target.z).toBeGreaterThanOrEqual(62);
      expect(target.z).toBeLessThanOrEqual(114);
      expect(Math.abs(target.x)).toBeLessThanOrEqual((target.z * 40) / 140);
    }
  });

  test("targets are the same size near and far", () => {
    const near = randomTarget(sequence(0, 0.5));
    const far = randomTarget(sequence(0.999, 0.5));
    expect(near.z).toBeCloseTo(140);
    expect(far.radius).toBe(near.radius);
  });

  test("reports distance from the tee and which side of the line it is on", () => {
    const right = randomTarget(sequence(0.5, 0));
    expect(right.x).toBeCloseTo(-40);
    expect(right.offlineYards).toBe(40);
    expect(right.distanceYards).toBe(Math.round(Math.hypot(40, 235)));

    const left = randomTarget(sequence(0.5, 1));
    expect(left.offlineYards).toBe(-40);
  });

  test("does not put the next target on top of the last one", () => {
    const previous = randomTarget(sequence(0.5, 0.5));
    // first draw repeats the old spot, second draw is somewhere else
    const next = randomTarget(sequence(0.5, 0.5, 0.9, 0.1), previous);
    expect(
      Math.hypot(next.z - previous.z, next.x - previous.x),
    ).toBeGreaterThan(35);
  });
});

describe("evaluateTarget", () => {
  const target = { x: 10, z: 200, radius: 15 };
  const ground = (x, z) => ({ x, y: 0.02, z });
  const air = (x, z) => ({ x, y: 1.5, z });

  test("stopping inside the ring is a hit", () => {
    const result = evaluateTarget(target, [ground(0, 150), ground(12, 205)]);
    expect(result.hit).toBe(true);
    expect(result.restYards).toBeCloseTo(Math.hypot(2, 5));
  });

  test("landing in the ring counts even if the ball runs out of it", () => {
    const result = evaluateTarget(target, [
      ground(10, 198),
      air(10, 210),
      ground(10, 230),
    ]);
    expect(result.hit).toBe(true);
    expect(result.longYards).toBeCloseTo(30);
  });

  test("rolling through the ring counts", () => {
    const path = [];
    for (let z = 170; z <= 240; z += 2) path.push(ground(10, z));
    expect(evaluateTarget(target, path).hit).toBe(true);
  });

  test("flying over the ring without touching down in it is a miss", () => {
    const result = evaluateTarget(target, [
      ground(10, 170),
      air(10, 200),
      ground(10, 240),
    ]);
    expect(result.hit).toBe(false);
  });

  test("a miss says how far and which way, with right of the target positive", () => {
    const result = evaluateTarget(target, [ground(30, 180)]);
    expect(result.hit).toBe(false);
    expect(result.longYards).toBeCloseTo(-20);
    expect(result.rightYards).toBeCloseTo(-20);
    expect(describeMiss(result)).toBe("20 yd short, 20 yd left");

    expect(describeMiss({ longYards: 12.4, rightYards: 3.6 })).toBe(
      "12 yd long, 4 yd right",
    );
    expect(describeMiss({ longYards: 0.2, rightYards: -7 })).toBe("7 yd left");
    expect(describeMiss({ longYards: 0, rightYards: 0 })).toBe("dead centre");
  });
});

describe("air targets", () => {
  const flightOf = (swing) =>
    new Shot({
      dt: 0.01,
      ...launchConditions({ side: "Right", ...swing }),
    }).points.map(({ position }) => ({
      x: toYards(position.x),
      y: toYards(position.y),
      z: toYards(position.z),
    }));

  test("float clear of the ground, downrange, in different parts of the air", () => {
    const heights = [];
    const sides = new Set();
    for (let i = 0; i < 80; i++) {
      const target = randomAirTarget();
      expect(target.air).toBe(true);
      expect(target.y - target.radius).toBeGreaterThanOrEqual(1);
      expect(target.z).toBeGreaterThan(30);
      expect(target.z).toBeLessThan(330);
      expect(target.radius).toBeGreaterThan(1.7);
      expect(target.radius).toBeLessThan(4);
      expect(target.heightYards).toBe(Math.round(target.y));
      heights.push(target.y);
      sides.add(Math.sign(Math.round(target.x)));
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(15);
    expect(sides.has(1) && sides.has(-1)).toBe(true);
  });

  test("can be reached: the swing a target was taken from flies through it", () => {
    // speed 0.6 of the way up the usable range, 1.5 deg open face, square path
    const random = sequence(0.6, 0.75, 0.5, 0.5);
    const target = randomAirTarget(random);
    const flight = flightOf({
      swingSpeedMPH: 80 + (0.25 + 0.75 * 0.6) * 60,
      faceAngle: 1.5,
      pathAngle: 0,
    });
    const outcome = evaluateTarget(target, [flight.at(-1)], flight);
    expect(outcome.hit).toBe(true);
    expect(outcome.closestYards).toBeLessThan(1);
  });

  test("a short club gets targets it can reach", () => {
    for (let i = 0; i < 40; i++) {
      expect(randomAirTarget(Math.random, null, "lw").z).toBeLessThan(120);
    }
  });

  const target = { air: true, x: 0, y: 20, z: 150, radius: 8 };
  const line = (y, x = 0, endZ = 300) => [
    { x, y, z: 0 },
    { x, y, z: endZ },
  ];

  test("flying through the sphere is a hit, between sampled points too", () => {
    expect(evaluateTarget(target, [], line(24)).hit).toBe(true);
    expect(evaluateTarget(target, [], line(20, 7.9)).hit).toBe(true);
  });

  test("passing under it is a miss, described by height and side", () => {
    const outcome = evaluateTarget(target, [], line(8, -5));
    expect(outcome.hit).toBe(false);
    expect(describeMiss(outcome)).toBe("12 yd low, 5 yd right");
    expect(describeMiss(evaluateTarget(target, [], line(31, 2)))).toBe(
      "11 yd high, 2 yd left",
    );
  });

  test("a ball that never gets there fell short", () => {
    const outcome = evaluateTarget(target, [], line(1, 0, 110));
    expect(outcome.hit).toBe(false);
    expect(describeMiss(outcome)).toBe("fell 40 yd short");
  });

  test("a ball rolling along the ground under it does not count", () => {
    const outcome = evaluateTarget(target, line(0.02), line(30, 0, 100));
    expect(outcome.hit).toBe(false);
  });
});

test("the goal is 3 of 5 in normal and 4 of 5 in advanced", () => {
  expect(GOALS.normal).toEqual({ targets: 5, toWin: 3 });
  expect(GOALS.advanced).toEqual({ targets: 5, toWin: 4 });
});

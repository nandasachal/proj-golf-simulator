import { randomTarget, evaluateTarget, describeMiss } from "./game";

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
      expect(target.radius).toBeGreaterThan(10);
      expect(target.radius).toBeLessThan(21);
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

  test("farther targets are bigger", () => {
    const near = randomTarget(sequence(0, 0.5));
    const far = randomTarget(sequence(0.999, 0.5));
    expect(near.z).toBeCloseTo(140);
    expect(far.radius).toBeGreaterThan(near.radius);
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

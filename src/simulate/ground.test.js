import { Vector3 } from "three";
import {
  TURF_PRESETS,
  turfParameters,
  restitution,
  bounce,
  groundRun,
} from "./ground";

const YARDS = 1.09361;
const DEGREES = Math.PI / 180;
const NORMAL = turfParameters(TURF_PRESETS.normal);
const SOFT = turfParameters(TURF_PRESETS.soft);
const FIRM = turfParameters(TURF_PRESETS.firm);

// A ball arriving at `speed` m/s, `descent` degrees below horizontal, heading
// `heading` degrees right of the target line (-x is right), with backspin.
const landing = ({ speed, descent, rpm, heading = 0 }) => {
  const horizontal = speed * Math.cos(descent * DEGREES);
  const backspin = (rpm * 2 * Math.PI) / 60;
  return {
    position: new Vector3(-12, -0.002, 240),
    velocity: new Vector3(
      -horizontal * Math.sin(heading * DEGREES),
      -speed * Math.sin(descent * DEGREES),
      horizontal * Math.cos(heading * DEGREES),
    ),
    angularVelocity: new Vector3(
      -backspin * Math.cos(heading * DEGREES),
      0,
      backspin * Math.sin(heading * DEGREES),
    ),
  };
};
const run = (state, turf = NORMAL) => groundRun(landing(state), turf);
const runYards = (state, turf) => run(state, turf).runDistance * YARDS;

const TOUR_DRIVE = { speed: 29.1, descent: 38.4, rpm: 2055 };

describe("turfParameters", () => {
  test("normal ryegrass fairway matches the documented numbers", () => {
    expect(NORMAL.rollFriction).toBeCloseTo(0.133, 3);
    expect(NORMAL.tiltScale).toBeCloseTo(1.1);
    expect(NORMAL.restitutionScale).toBeCloseTo(0.7);
  });

  test("soft, wet, longer turf is slower, deader and digs in more than firm", () => {
    expect(SOFT.rollFriction).toBeGreaterThan(NORMAL.rollFriction);
    expect(NORMAL.rollFriction).toBeGreaterThan(FIRM.rollFriction);
    expect(SOFT.tiltScale).toBeGreaterThan(FIRM.tiltScale);
    expect(SOFT.restitutionScale).toBeLessThan(FIRM.restitutionScale);
  });

  test("wet leaf alone adds rolling resistance", () => {
    const dry = turfParameters({ ...TURF_PRESETS.normal, leafWetness: 0 });
    const wet = turfParameters({ ...TURF_PRESETS.normal, leafWetness: 1 });
    expect(wet.rollFriction).toBeCloseTo(dry.rollFriction * 1.3);
  });
});

describe("bounce", () => {
  test("harder impacts rebound with a smaller share of their speed", () => {
    expect(restitution(5)).toBeGreaterThan(restitution(15));
    expect(restitution(25)).toBe(0.12);
  });

  test("the ball comes off the ground slower, going up, still heading downrange", () => {
    const before = landing(TOUR_DRIVE);
    const after = bounce(before.velocity, before.angularVelocity, NORMAL);
    expect(after.velocity.y).toBeGreaterThan(0);
    expect(after.velocity.z).toBeGreaterThan(0);
    expect(after.velocity.length()).toBeLessThan(before.velocity.length());
    expect(after.velocity.x).toBeCloseTo(0);
  });

  test("friction at impact takes backspin off the ball", () => {
    const before = landing(TOUR_DRIVE);
    const after = bounce(before.velocity, before.angularVelocity, NORMAL);
    expect(after.spin.x).toBeGreaterThan(before.angularVelocity.x);
  });
});

describe("groundRun", () => {
  test("a tour drive runs out about as far as tour carry-to-total gaps", () => {
    // PGA Tour 2023: carry 282, driving distance ~300.
    const result = run(TOUR_DRIVE);
    expect(result.runDistance * YARDS).toBeGreaterThan(14);
    expect(result.runDistance * YARDS).toBeLessThan(21);
    expect(result.hops).toBeGreaterThanOrEqual(1);
    expect(result.bounceDistance + result.rollDistance).toBeCloseTo(
      result.runDistance,
      6,
    );
  });

  test("a shallower landing runs farther (TrackMan sample: 31° lands, 28 yd of run)", () => {
    const shallow = runYards({ speed: 28.3, descent: 31.7, rpm: 2252 });
    expect(shallow).toBeGreaterThan(23);
    expect(shallow).toBeLessThan(32);

    const runs = [32, 38, 44, 50].map((descent) =>
      runYards({ speed: 29, descent, rpm: 1800 }),
    );
    expect(runs[0]).toBeGreaterThan(runs[1]);
    expect(runs[1]).toBeGreaterThan(runs[2]);
    expect(runs[2]).toBeGreaterThan(runs[3]);
  });

  test("firm turf runs farther than normal, which runs farther than soft", () => {
    const soft = runYards(TOUR_DRIVE, SOFT);
    const normal = runYards(TOUR_DRIVE, NORMAL);
    const firm = runYards(TOUR_DRIVE, FIRM);
    expect(soft).toBeLessThan(normal);
    expect(normal).toBeLessThan(firm);
    // USGA 2007: tour drives that found the fairway ran 30.1 ± 3.5 yd.
    expect(firm).toBeGreaterThan(26);
    expect(firm).toBeLessThan(37);
    expect(soft).toBeLessThan(12);
  });

  test("high-spin, steep shots stop quickly", () => {
    expect(runYards({ speed: 24.1, descent: 43.8, rpm: 5590 })).toBeLessThan(8);
    expect(runYards({ speed: 22.6, descent: 50.3, rpm: 7393 })).toBeLessThan(2);
  });

  test("more backspin never adds run", () => {
    const low = runYards({ ...TOUR_DRIVE, rpm: 1500 });
    const high = runYards({ ...TOUR_DRIVE, rpm: 4500 });
    expect(high).toBeLessThanOrEqual(low);
  });

  test("a ball landing straight stays on its line; one moving sideways keeps drifting that way", () => {
    const straight = run(TOUR_DRIVE);
    expect(straight.rest.x).toBeCloseTo(-12, 6);

    const drifting = run({ ...TOUR_DRIVE, heading: 15 });
    expect(drifting.rest.x).toBeLessThan(-12.5);
    expect(drifting.rest.z).toBeGreaterThan(240);
  });

  test("the path starts at touchdown, stays on or above the ground, and ends at rest", () => {
    const result = run(TOUR_DRIVE);
    const { points } = result;
    expect(points[0].t).toBe(0);
    expect(points[0].position.toArray()).toEqual([-12, 0, 240]);
    expect(points.every((p) => p.position.y >= -1e-9)).toBe(true);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].t).toBeGreaterThan(points[i - 1].t);
    }
    const last = points[points.length - 1];
    expect(last.position.distanceTo(result.rest)).toBeLessThan(1e-9);
    expect(last.t).toBeCloseTo(result.seconds);
    expect(result.seconds).toBeLessThan(15);
  });
});

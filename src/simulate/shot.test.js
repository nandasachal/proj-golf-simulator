import { Vector3 } from "three";
import { Shot } from "./shot";
import { toMPS } from "./conversions-lib";

const shoot = (overrides = {}) =>
  new Shot({
    dt: 0.001,
    initSpeedMPH: 100,
    initVerticalAngleDegrees: 12,
    initHorizontalAngleDegrees: 0,
    initBackspinRPM: 2700,
    initSpinAngle: 0,
    ...overrides,
  });

const landing = (shot) => shot.points[shot.points.length - 1].position;
const apex = (shot) => Math.max(...shot.points.map((p) => p.position.y));

describe("Shot launch conditions", () => {
  test("positions and velocities are three Vector3s", () => {
    const shot = shoot();
    expect(shot.points[0].position).toBeInstanceOf(Vector3);
    expect(shot.points[0].velocity).toBeInstanceOf(Vector3);
  });

  test("initial ball speed is club speed times smash factor", () => {
    const shot = shoot({ initSpeedMPH: 100, smashFactor: 1.5 });
    expect(shot.points[0].velocity.length()).toBeCloseTo(toMPS(150), 6);
  });

  test("positive horizontal angle launches toward -x, mirrored for negative", () => {
    const right = shoot({ initHorizontalAngleDegrees: 5 }).points[0].velocity;
    const left = shoot({ initHorizontalAngleDegrees: -5 }).points[0].velocity;
    expect(right.x).toBeLessThan(0);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.z).toBeCloseTo(right.z, 9);
  });

  test("initial spin is mostly backspin with the requested rate", () => {
    const spin = shoot({ initBackspinRPM: 3000, initSpinAngle: 10 }).points[0]
      .angularVelocity;
    expect(spin.length()).toBeCloseTo((3000 * 2 * Math.PI) / 60, 6);
    expect(spin.x).toBeLessThan(0);
    expect(spin.y).toBeGreaterThan(0);
    expect(spin.z).toBe(0);
  });
});

describe("Shot trajectory", () => {
  test("starts at the origin, rises, and ends at the first point at or below ground", () => {
    const shot = shoot();
    expect(shot.points[0].position.toArray()).toEqual([0, 0, 0]);
    expect(apex(shot)).toBeGreaterThan(5);
    expect(landing(shot).y).toBeLessThanOrEqual(0);
    const airborne = shot.points.slice(1, -1);
    expect(airborne.every((p) => p.position.y > 0)).toBe(true);
  });

  test("a straight shot stays on the target line", () => {
    const shot = shoot();
    expect(shot.points.every((p) => p.position.x === 0)).toBe(true);
    expect(landing(shot).z).toBeGreaterThan(100);
  });

  test("more club speed carries farther and flies higher", () => {
    const slow = shoot({ initSpeedMPH: 85 });
    const fast = shoot({ initSpeedMPH: 115 });
    expect(landing(fast).z).toBeGreaterThan(landing(slow).z);
    expect(apex(fast)).toBeGreaterThan(apex(slow));
  });

  test("backspin lift carries farther than a spinless shot", () => {
    const spinning = shoot();
    const dead = shoot({ initBackspinRPM: 0 });
    expect(landing(spinning).z).toBeGreaterThan(landing(dead).z);
  });

  test("positive spin angle curves toward +x and mirrors for negative", () => {
    const pos = landing(shoot({ initSpinAngle: 20 }));
    const neg = landing(shoot({ initSpinAngle: -20 }));
    expect(pos.x).toBeGreaterThan(2);
    expect(neg.x).toBeCloseTo(-pos.x, 6);
    expect(neg.z).toBeCloseTo(pos.z, 6);
  });

  test("curve keeps growing through the flight (not a straight push)", () => {
    const shot = shoot({ initSpinAngle: 20 });
    const mid = shot.points[Math.floor(shot.points.length / 2)].position;
    const end = landing(shot);
    expect(end.x / end.z).toBeGreaterThan(mid.x / mid.z);
  });

  test("spin decays during flight", () => {
    const shot = shoot();
    const first = shot.points[0].angularVelocity.length();
    const last = shot.points[shot.points.length - 1].angularVelocity.length();
    expect(last).toBeLessThan(first);
    expect(last).toBeGreaterThan(0);
  });
});

// Published launch-monitor tour averages (TrackMan): club speed, smash factor,
// launch angle and spin in; carry and apex out. The aerodynamic coefficients in
// shot.js are fitted to these, so a drift here means the ball flight changed.
describe("Shot matches real-world ball flight", () => {
  const toYards = (m) => m * 1.09361;
  test.each([
    ["PGA Tour driver", 113, 1.48, 10.9, 2686, 275, 32],
    ["LPGA Tour driver", 94, 1.48, 13.2, 2611, 218, 25],
    ["PGA Tour 7 iron", 90, 1.33, 16.3, 7097, 172, 32],
    ["LPGA Tour 7 iron", 76, 1.37, 19.0, 6699, 141, 26],
    ["PGA Tour pitching wedge", 83, 1.23, 24.2, 9304, 136, 30],
  ])("%s", (_name, speed, smash, launch, rpm, carryYards, apexYards) => {
    const shot = shoot({
      initSpeedMPH: speed,
      smashFactor: smash,
      initVerticalAngleDegrees: launch,
      initBackspinRPM: rpm,
    });
    const carry = toYards(landing(shot).z);
    const height = toYards(apex(shot));
    expect(Math.abs(carry - carryYards) / carryYards).toBeLessThan(0.07);
    expect(Math.abs(height - apexYards) / apexYards).toBeLessThan(0.2);
  });
});

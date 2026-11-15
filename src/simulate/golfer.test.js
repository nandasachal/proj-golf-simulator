import {
  swingPose,
  clubheadPosition,
  CONTACT_TIME,
  SWING_DURATION,
  CLUBHEAD_ADDRESS,
} from "./golfer";

describe("swingPose", () => {
  test("starts at address", () => {
    expect(swingPose(0)).toEqual({
      arm: 0,
      hinge: 0,
      shoulders: 0,
      hips: 0,
      shift: 0,
    });
  });

  test("winds up well past horizontal with the wrists cocked before coming down", () => {
    const top = swingPose(0.9);
    expect(top.arm).toBeGreaterThan(2);
    expect(top.hinge).toBeGreaterThan(1);
    expect(top.shoulders).toBeGreaterThan(1);
    expect(top.hips).toBeGreaterThan(0);
    expect(top.hips).toBeLessThan(top.shoulders);
  });

  test("arms and club are back in line at impact, with the body already turning through", () => {
    const impact = swingPose(CONTACT_TIME);
    expect(impact.arm).toBeCloseTo(0, 6);
    expect(impact.hinge).toBeCloseTo(0, 6);
    expect(impact.hips).toBeLessThan(0);
    expect(impact.shoulders).toBeLessThan(0);
  });

  test("finishes wrapped around toward the target and holds", () => {
    const finish = swingPose(SWING_DURATION);
    expect(finish.arm).toBeLessThan(-2);
    expect(finish.shoulders).toBeLessThan(-1);
    expect(swingPose(SWING_DURATION + 5)).toEqual(finish);
  });

  test("moves continuously, with no jump between phases", () => {
    const step = 1 / 120;
    let previous = swingPose(0);
    for (let t = step; t <= SWING_DURATION + 0.1; t += step) {
      const pose = swingPose(t);
      for (const key of Object.keys(pose)) {
        expect(Math.abs(pose[key] - previous[key])).toBeLessThan(0.3);
      }
      previous = pose;
    }
  });

  test("the downswing is much quicker than the backswing", () => {
    expect(CONTACT_TIME - 0.9).toBeLessThan((0.9 - 0.15) / 2);
  });
});

describe("clubheadPosition", () => {
  test("rests behind the ball at address and returns there at impact", () => {
    const address = clubheadPosition(swingPose(0));
    expect(address.distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(1e-6);

    // Only the small weight shift toward the target separates the two.
    const impact = clubheadPosition(swingPose(CONTACT_TIME));
    expect(impact.distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(0.06);
    expect(Math.abs(impact.x)).toBeLessThan(1e-6);
  });

  test("is up behind the golfer at the top and high on the target side at the finish", () => {
    const top = clubheadPosition(swingPose(0.9));
    expect(top.y).toBeGreaterThan(1.5);

    const finish = clubheadPosition(swingPose(SWING_DURATION));
    expect(finish.y).toBeGreaterThan(1.2);
  });

  test("approaches the ball from behind it, travelling toward the target", () => {
    const before = clubheadPosition(swingPose(CONTACT_TIME - 0.01));
    const after = clubheadPosition(swingPose(CONTACT_TIME + 0.01));
    expect(before.z).toBeLessThan(CLUBHEAD_ADDRESS.z);
    expect(after.z).toBeGreaterThan(CLUBHEAD_ADDRESS.z);
  });

  test("a left-hander's club is mirrored across the target line", () => {
    const pose = swingPose(0.6);
    const right = clubheadPosition(pose, "Right");
    const left = clubheadPosition(pose, "Left");
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.z).toBeCloseTo(right.z);
  });
});

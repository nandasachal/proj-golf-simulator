import { Vector3 } from "three";
import {
  swingPose,
  clubheadPosition,
  bodyPose,
  createGolfer,
  CONTACT_TIME,
  SWING_DURATION,
  CLUBHEAD_ADDRESS,
} from "./golfer";
import { BONE, BONE_COUNT, THIGH, SHIN } from "./golfer-body-figure";

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

describe("bodyPose", () => {
  const times = [];
  for (let t = 0; t <= SWING_DURATION + 0.05; t += 1 / 60) times.push(t);

  test("places every bone, with a proper rotation, all through the swing", () => {
    for (const t of times) {
      const { bones } = bodyPose(t);
      expect(bones).toHaveLength(BONE_COUNT);
      for (const { position, quaternion } of bones) {
        expect(position.toArray().every(Number.isFinite)).toBe(true);
        expect(quaternion.length()).toBeCloseTo(1, 6);
      }
    }
  });

  test("both arms reach their hand on the grip throughout", () => {
    for (const t of times) expect(bodyPose(t).reached).toBe(true);
  });

  test("the grip is at the hands, which lead the club back to the ball", () => {
    const { handPoint, mount } = bodyPose(CONTACT_TIME);
    const shaft = new Vector3(0, -1, 0).applyQuaternion(mount);
    const clubhead = clubheadPosition(swingPose(CONTACT_TIME));
    expect(clubhead.clone().sub(handPoint).normalize().dot(shaft)).toBeCloseTo(
      1,
      6,
    );
  });

  test("the lead foot stays planted and the trail heel comes up in the finish", () => {
    const address = bodyPose(0).bones;
    const finish = bodyPose(SWING_DURATION).bones;
    expect(
      finish[BONE.leadFoot].position.distanceTo(
        address[BONE.leadFoot].position,
      ),
    ).toBeLessThan(1e-9);
    expect(finish[BONE.trailFoot].position.y).toBeGreaterThan(
      address[BONE.trailFoot].position.y + 0.08,
    );
    expect(bodyPose(CONTACT_TIME - 0.3).bones[BONE.trailFoot].position.y).toBe(
      address[BONE.trailFoot].position.y,
    );
  });

  test("the legs never have to stretch past straight", () => {
    for (const t of times) {
      const { bones } = bodyPose(t);
      for (const [thigh, foot] of [
        [BONE.leadThigh, BONE.leadFoot],
        [BONE.trailThigh, BONE.trailFoot],
      ]) {
        expect(
          bones[thigh].position.distanceTo(bones[foot].position),
        ).toBeLessThan(THIGH + SHIN);
      }
    }
  });
});

describe("createGolfer", () => {
  test("builds a figure that holds the club and swings either way round", () => {
    const golfer = createGolfer();
    const mount = golfer.group.children.find(
      (child) => child.getObjectByName("clubhead") && !child.isBone,
    );
    for (const side of ["Right", "Left"]) {
      golfer.setSide(side);
      for (const t of [0, 0.9, CONTACT_TIME, SWING_DURATION]) {
        golfer.setTime(t);
        golfer.group.updateMatrixWorld(true);
        const head = mount
          .getObjectByName("clubhead")
          .getWorldPosition(new Vector3());
        const expected = clubheadPosition(swingPose(t), side);
        expect(head.distanceTo(expected)).toBeLessThan(0.02);
      }
    }
  });
});

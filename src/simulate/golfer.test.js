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
import { TOP_TIME, createSwing, setupFor } from "./swing-keys";
import { solveRig } from "./swing-rig";
import { CLUBS, getClub } from "./clubs";
import {
  BONE,
  BONE_COUNT,
  THIGH,
  SHIN,
  UPPER_ARM,
  FOREARM,
  SHOULDER_JOINT,
  CLAVICLE_JOINT,
} from "./golfer-body-figure";

const up = (bone) => new Vector3(0, 1, 0).applyQuaternion(bone.quaternion);
const lead = (bone) => new Vector3(0, 0, 1).applyQuaternion(bone.quaternion);
const front = (bone) => new Vector3(-1, 0, 0).applyQuaternion(bone.quaternion);
const degrees = (radians) => (radians * 180) / Math.PI;
// How far a limb is bent at its middle joint: 0 is straight.
const flex = (from, middle, to) =>
  180 - degrees(from.clone().sub(middle).angleTo(to.clone().sub(middle)));

describe("swingPose", () => {
  test("holds address until the swing starts", () => {
    expect(swingPose(0.1)).toEqual(swingPose(0));
    expect(swingPose(0).pelvisTurn).toBe(0);
    expect(swingPose(0).chestTurn).toBe(0);
  });

  test("coils the chest about twice as far as the hips at the top", () => {
    const top = swingPose(TOP_TIME);
    expect(top.chestTurn).toBeLessThan(-85);
    expect(top.pelvisTurn).toBeLessThan(-35);
    expect(top.pelvisTurn).toBeGreaterThan(-55);
    // the shaft has swung round to about parallel with the ground
    expect(top.theta).toBeGreaterThan(250);
    expect(top.theta).toBeLessThan(280);
  });

  test("unwinds from the ground up: hips first, then chest, then club", () => {
    const turnsBack = (key) => {
      let at = 0;
      let lowest = Infinity;
      for (let t = 0.5; t < CONTACT_TIME; t += 1 / 240) {
        const value = swingPose(t)[key];
        if (value < lowest) {
          lowest = value;
          at = t;
        }
      }
      return at;
    };
    const hips = turnsBack("pelvisTurn");
    const chest = turnsBack("chestTurn");
    expect(hips).toBeLessThan(chest);
    expect(chest).toBeLessThanOrEqual(TOP_TIME + 1e-9);
    // at impact the hips are more open than the chest, both past square
    const impact = swingPose(CONTACT_TIME);
    expect(impact.pelvisTurn).toBeGreaterThan(impact.chestTurn);
    expect(impact.chestTurn).toBeGreaterThan(15);
  });

  test("keeps the wrists cocked late and releases through the ball", () => {
    const speed = (t) =>
      Math.abs(swingPose(t + 0.005).theta - swingPose(t - 0.005).theta) / 0.01;
    // the club is turning fastest around impact, far faster than early down
    expect(speed(CONTACT_TIME)).toBeGreaterThan(3 * speed(TOP_TIME + 0.08));
    expect(speed(CONTACT_TIME)).toBeGreaterThan(speed(CONTACT_TIME - 0.1));
    expect(speed(CONTACT_TIME)).toBeGreaterThan(speed(CONTACT_TIME + 0.15));
  });

  test("the downswing is about a third as long as the backswing", () => {
    const ratio = (TOP_TIME - 0.15) / (CONTACT_TIME - TOP_TIME);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  test("holds the finish", () => {
    expect(swingPose(SWING_DURATION + 5)).toEqual(swingPose(SWING_DURATION));
    const finish = swingPose(SWING_DURATION);
    expect(finish.chestTurn).toBeGreaterThan(100);
    expect(finish.pelvisTurn).toBeGreaterThan(80);
  });
});

describe("clubheadPosition", () => {
  test("rests behind the ball at address and is back there at impact", () => {
    const address = clubheadPosition(swingPose(0));
    expect(address.distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(1e-6);
    const impact = clubheadPosition(swingPose(CONTACT_TIME));
    expect(impact.distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(1e-6);
  });

  test("is up behind the golfer at the top and round behind them at the finish", () => {
    const top = clubheadPosition(swingPose(TOP_TIME));
    expect(top.y).toBeGreaterThan(1.5);
    const finish = clubheadPosition(swingPose(SWING_DURATION));
    expect(finish.y).toBeGreaterThan(1.2);
  });

  test("approaches the ball from behind and inside, travelling toward the target", () => {
    const before = clubheadPosition(swingPose(CONTACT_TIME - 0.01));
    const after = clubheadPosition(swingPose(CONTACT_TIME + 0.01));
    expect(before.z).toBeLessThan(CLUBHEAD_ADDRESS.z);
    expect(after.z).toBeGreaterThan(CLUBHEAD_ADDRESS.z);
    expect(before.x).toBeGreaterThan(0);
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

  test("moves smoothly: no joint or the clubhead ever jumps", () => {
    const step = 1 / 240;
    const points = (t) => {
      const body = bodyPose(t);
      return [
        ...body.bones.map((bone) => bone.position),
        body.handPoint,
        body.headCenter,
        body.clubhead,
      ];
    };
    let before = points(0);
    let now = points(step);
    for (let t = 2 * step; t <= SWING_DURATION + 0.1; t += step) {
      const next = points(t);
      next.forEach((point, i) => {
        const clubhead = i === next.length - 1;
        // yards in 1/240 s: hands under ~15 yd/s, clubhead under ~60
        expect(point.distanceTo(now[i])).toBeLessThan(clubhead ? 0.25 : 0.065);
        // and no sudden change of velocity either
        const kink = point
          .clone()
          .sub(now[i])
          .sub(now[i].clone().sub(before[i]))
          .length();
        expect(kink).toBeLessThan(clubhead ? 0.05 : 0.02);
      });
      before = now;
      now = next;
    }
  });

  test("stands to the ball like a golfer", () => {
    const { bones, handPoint, wrists, headCenter } = bodyPose(0);
    const flexed = (thigh, shin, foot) =>
      flex(bones[thigh].position, bones[shin].position, bones[foot].position);
    for (const knee of [
      flexed(BONE.leadThigh, BONE.leadShin, BONE.leadFoot),
      flexed(BONE.trailThigh, BONE.trailShin, BONE.trailFoot),
    ]) {
      expect(knee).toBeGreaterThan(15);
      expect(knee).toBeLessThan(30);
    }
    // knees ahead of the ankles; hips hinged back behind them
    expect(bones[BONE.leadShin].position.x).toBeLessThan(
      bones[BONE.leadFoot].position.x - 0.02,
    );
    const hinge =
      bones[BONE.leadThigh].position.x - bones[BONE.leadFoot].position.x;
    expect(hinge).toBeGreaterThan(0.03);
    expect(hinge).toBeLessThan(0.16);
    // spine tipped toward the ball from the hips, and a little away from the
    // target, which sets the lead shoulder above the trail one
    const tip = degrees(up(bones[BONE.chest]).angleTo(new Vector3(0, 1, 0)));
    expect(tip).toBeGreaterThan(30);
    expect(tip).toBeLessThan(45);
    expect(up(bones[BONE.chest]).z).toBeLessThan(0);
    expect(bones[BONE.leadUpperArm].position.y).toBeGreaterThan(
      bones[BONE.trailUpperArm].position.y + 0.03,
    );
    // arms hanging nearly straight down from the shoulders
    const hang = wrists[0].clone().sub(bones[BONE.leadUpperArm].position);
    expect(degrees(hang.angleTo(new Vector3(0, -1, 0)))).toBeLessThan(12);
    // hands clear of the thighs but not reaching for the ball
    const thighFront = bones[BONE.leadShin].position.x;
    expect(handPoint.x).toBeLessThan(thighFront - 0.1);
    expect(handPoint.x).toBeGreaterThan(thighFront - 0.4);
    // head carried on the line of the spine, not craned out in front of it
    const neck = headCenter.clone().sub(bones[BONE.chest].position);
    expect(neck.length()).toBeLessThan(0.24);
    expect(degrees(neck.angleTo(up(bones[BONE.chest])))).toBeLessThan(20);
  });

  test("turns the back to the target at the top, the lead shoulder under the chin", () => {
    const { bones, handPoint, headCenter } = bodyPose(TOP_TIME);
    expect(front(bones[BONE.chest]).z).toBeLessThan(-0.7);
    expect(bones[BONE.leadUpperArm].position.y).toBeLessThan(
      bones[BONE.trailUpperArm].position.y,
    );
    expect(handPoint.y).toBeGreaterThan(headCenter.y - 0.05);
    // the lead arm is still straight
    expect(
      flex(
        bones[BONE.leadUpperArm].position,
        bones[BONE.leadForearm].position,
        bodyPose(TOP_TIME).wrists[0],
      ),
    ).toBeLessThan(25);
  });

  test("is open, on the lead side and behind the ball at impact", () => {
    const { bones, headCenter, handPoint, clubhead } = bodyPose(CONTACT_TIME);
    const address = bodyPose(0);
    expect(front(bones[BONE.pelvis]).z).toBeGreaterThan(0.5);
    expect(lead(bones[BONE.chest]).y).toBeGreaterThan(0.2); // trail shoulder low
    expect(bones[BONE.pelvis].position.z).toBeGreaterThan(
      address.bones[BONE.pelvis].position.z + 0.1,
    );
    expect(headCenter.z).toBeLessThan(CLUBHEAD_ADDRESS.z);
    expect(headCenter.distanceTo(address.headCenter)).toBeLessThan(0.12);
    expect(handPoint.z).toBeGreaterThan(clubhead.z); // hands lead the clubhead
    expect(bones[BONE.trailFoot].position.y).toBeGreaterThan(
      address.bones[BONE.trailFoot].position.y + 0.01,
    );
  });

  test("the club is in the hands, its shaft running to the clubhead", () => {
    for (const t of [
      0,
      0.5,
      TOP_TIME,
      1.05,
      CONTACT_TIME,
      1.3,
      SWING_DURATION,
    ]) {
      const { handPoint, mount, clubhead } = bodyPose(t);
      const shaft = new Vector3(0, -1, 0).applyQuaternion(mount);
      expect(
        clubhead.clone().sub(handPoint).normalize().dot(shaft),
      ).toBeCloseTo(1, 6);
    }
  });

  test("the face is square to the target at address and at impact", () => {
    for (const t of [0, CONTACT_TIME]) {
      const face = new Vector3(0, 0, 1).applyQuaternion(bodyPose(t).mount);
      expect(Math.abs(face.x)).toBeLessThan(0.02);
      expect(face.z).toBeGreaterThan(0.99);
    }
  });

  test("both arms reach their hand on the grip throughout", () => {
    for (const t of times) {
      const { bones, wrists, reached } = bodyPose(t);
      expect(reached).toBe(true);
      for (const [arm, wrist] of [
        [BONE.leadUpperArm, wrists[0]],
        [BONE.trailUpperArm, wrists[1]],
      ]) {
        expect(bones[arm].position.distanceTo(wrist)).toBeLessThan(
          UPPER_ARM + FOREARM + 0.005,
        );
      }
    }
  });

  test("the lead foot stays put and the trail foot comes up onto its toe", () => {
    const address = bodyPose(0).bones;
    const finish = bodyPose(SWING_DURATION).bones;
    for (const t of times) {
      expect(
        bodyPose(t).bones[BONE.leadFoot].position.distanceTo(
          address[BONE.leadFoot].position,
        ),
      ).toBeLessThan(0.05);
    }
    expect(finish[BONE.trailFoot].position.y).toBeGreaterThan(
      address[BONE.trailFoot].position.y + 0.08,
    );
    expect(bodyPose(TOP_TIME).bones[BONE.trailFoot].position.y).toBe(
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

  test("finishes tall on the lead leg, facing the target", () => {
    const { bones, headCenter } = bodyPose(SWING_DURATION);
    expect(front(bones[BONE.pelvis]).z).toBeGreaterThan(0.95);
    expect(up(bones[BONE.chest]).y).toBeGreaterThan(0.97);
    expect(
      Math.abs(bones[BONE.pelvis].position.z - bones[BONE.leadFoot].position.z),
    ).toBeLessThan(0.12);
    expect(headCenter.y).toBeGreaterThan(bodyPose(0).headCenter.y + 0.1);
  });
});

describe("collar bones and toes", () => {
  test("a collar bone runs from the breastbone to its shoulder joint", () => {
    for (const t of [0, TOP_TIME, CONTACT_TIME, SWING_DURATION]) {
      const { bones } = bodyPose(t);
      for (const [clavicle, arm, side] of [
        [BONE.leadClavicle, BONE.leadUpperArm, 1],
        [BONE.trailClavicle, BONE.trailUpperArm, -1],
      ]) {
        const rest = new Vector3(
          -CLAVICLE_JOINT.x,
          SHOULDER_JOINT.y - CLAVICLE_JOINT.y,
          side * (SHOULDER_JOINT.z - CLAVICLE_JOINT.z),
        );
        const reach = rest.length();
        const along = rest
          .normalize()
          .applyQuaternion(bones[clavicle].quaternion);
        const toShoulder = bones[arm].position
          .clone()
          .sub(bones[clavicle].position);
        expect(toShoulder.clone().normalize().dot(along)).toBeCloseTo(1, 5);
        // the shoulder blade lets the joint slide a little, no more
        expect(Math.abs(toShoulder.length() - reach)).toBeLessThan(0.1);
      }
    }
  });

  test("the toes stay down as the trail heel comes up, then break", () => {
    const flat = (bone) => up(bone).y;
    const address = bodyPose(0).bones;
    expect(flat(address[BONE.trailToe])).toBeCloseTo(1, 6);
    expect(
      address[BONE.trailToe].quaternion.angleTo(
        address[BONE.trailFoot].quaternion,
      ),
    ).toBeCloseTo(0, 6);
    const impact = bodyPose(CONTACT_TIME).bones;
    expect(flat(impact[BONE.trailFoot])).toBeLessThan(0.95);
    expect(flat(impact[BONE.trailToe])).toBeGreaterThan(0.995);
    // the toes of both feet stay on the mat
    const finish = bodyPose(SWING_DURATION).bones;
    for (const body of [address, impact, finish]) {
      expect(body[BONE.trailToe].position.y).toBeCloseTo(
        address[BONE.trailToe].position.y,
        6,
      );
    }
    expect(flat(finish[BONE.trailToe])).toBeGreaterThan(
      flat(finish[BONE.trailFoot]),
    );
  });
});

describe("club setups", () => {
  const attackDegrees = (swing) => {
    const before = solveRig(swing.pose(CONTACT_TIME - 0.002)).clubhead.clone();
    const after = solveRig(swing.pose(CONTACT_TIME + 0.002)).clubhead;
    return degrees(Math.atan2(after.y - before.y, after.z - before.z));
  };

  test("every club starts at the ball and is back there at impact", () => {
    for (const club of CLUBS) {
      const swing = createSwing(setupFor(club));
      for (const t of [0, CONTACT_TIME]) {
        expect(
          solveRig(swing.pose(t)).clubhead.distanceTo(CLUBHEAD_ADDRESS),
        ).toBeLessThan(1e-6);
      }
    }
  });

  test("every club can be swung: arms reach, legs are long enough", () => {
    for (const club of CLUBS) {
      const swing = createSwing(setupFor(club));
      for (let t = 0; t <= SWING_DURATION; t += 1 / 60) {
        const { bones, reached } = solveRig(swing.pose(t));
        expect(reached).toBe(true);
        for (const [thigh, foot] of [
          [BONE.leadThigh, BONE.leadFoot],
          [BONE.trailThigh, BONE.trailFoot],
        ]) {
          expect(
            bones[thigh].position.distanceTo(bones[foot].position),
          ).toBeLessThan(THIGH + SHIN);
        }
      }
    }
  });

  test("the driver sweeps the ball away; shorter clubs hit down more", () => {
    const attack = (id) => attackDegrees(createSwing(setupFor(getClub(id))));
    expect(attack("driver")).toBeGreaterThan(0);
    expect(attack("driver")).toBeLessThan(4);
    expect(attack("3w")).toBeLessThan(0);
    expect(attack("7i")).toBeLessThan(attack("3w") - 1);
    expect(attack("sw")).toBeLessThan(attack("7i") - 1);
    expect(attack("sw")).toBeGreaterThan(-8);
  });

  test("shorter clubs: narrower stance, ball further back, hands ahead, less tilt", () => {
    const at = (id) => {
      const swing = createSwing(setupFor(getClub(id)));
      const { bones, handPoint } = solveRig(swing.pose(0));
      const up = new Vector3(0, 1, 0).applyQuaternion(
        bones[BONE.chest].quaternion,
      );
      return {
        width:
          bones[BONE.leadFoot].position.z - bones[BONE.trailFoot].position.z,
        middle:
          (bones[BONE.leadFoot].position.z + bones[BONE.trailFoot].position.z) /
          2,
        hands: handPoint,
        feet: bones[BONE.leadFoot].position.x,
        tilt: -up.z,
      };
    };
    const [driver, iron, wedge] = ["driver", "7i", "sw"].map(at);
    expect(driver.width).toBeGreaterThan(iron.width + 0.05);
    expect(iron.width).toBeGreaterThan(wedge.width + 0.03);
    // the ball is at z = 0: forward of the driver's stance, middle of a wedge's
    expect(driver.middle).toBeLessThan(iron.middle - 0.03);
    expect(Math.abs(wedge.middle)).toBeLessThan(0.02);
    expect(driver.hands.z).toBeLessThan(CLUBHEAD_ADDRESS.z);
    expect(wedge.hands.z).toBeGreaterThan(0);
    // and the golfer stands closer to it
    expect(wedge.feet).toBeLessThan(iron.feet);
    expect(iron.feet).toBeLessThan(driver.feet - 0.05);
    expect(driver.tilt).toBeGreaterThan(iron.tilt);
    expect(iron.tilt).toBeGreaterThan(wedge.tilt);
  });
});

describe("createGolfer", () => {
  const clubheadOf = (golfer) => {
    golfer.group.updateMatrixWorld(true);
    return golfer.group
      .getObjectByName("clubhead")
      .getWorldPosition(new Vector3());
  };

  test("takes up each club and brings it back to the ball", () => {
    const golfer = createGolfer();
    for (const id of ["driver", "5w", "4h", "7i", "sw"]) {
      golfer.setClub(getClub(id));
      for (const t of [0, CONTACT_TIME]) {
        golfer.setTime(t);
        expect(clubheadOf(golfer).distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(
          0.02,
        );
      }
    }
  });

  test("is never quite still at address, but the club does not move", () => {
    const golfer = createGolfer();
    const chest = () =>
      golfer.group.children.filter((c) => c.isBone)[BONE.chest];
    golfer.setIdle(0);
    const before = chest().position.clone();
    golfer.setIdle(1.7);
    expect(chest().position.distanceTo(before)).toBeGreaterThan(1e-4);
    expect(chest().position.distanceTo(before)).toBeLessThan(0.02);
    expect(clubheadOf(golfer).distanceTo(CLUBHEAD_ADDRESS)).toBeLessThan(0.02);
    // and none of it is left once the swing is under way
    golfer.setTime(0.5);
    expect(
      chest().position.distanceTo(bodyPose(0.5).bones[BONE.chest].position),
    ).toBeLessThan(1e-9);
  });

  test("builds a figure that holds the club and swings either way round", () => {
    const golfer = createGolfer();
    const mount = golfer.group.children.find(
      (child) => child.getObjectByName("clubhead") && !child.isBone,
    );
    for (const side of ["Right", "Left"]) {
      golfer.setSide(side);
      for (const t of [0, TOP_TIME, CONTACT_TIME, SWING_DURATION]) {
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

import fs from "fs";
import path from "path";
import { Object3D, Vector3 } from "three";
import { createRetarget, jointsFromGltf } from "./golfer-retarget";
import { createGolfer } from "./golfer";
import { createRig, solveRig, FIGURE_BODY } from "./swing-rig";
import {
  createSwing,
  setupFor,
  CONTACT_TIME,
  SWING_DURATION,
} from "./swing-keys";
import { CLUBS, getClub } from "./clubs";
import { BONE } from "./golfer-body-figure";

// The skeleton the simulator ships, read straight from the model file.
const glb = fs.readFileSync(
  path.join(__dirname, "../../public/models/golfer.glb"),
);
const json = JSON.parse(
  glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"),
);
const joints = jointsFromGltf(json);
const retarget = createRetarget(joints);
const { body, index } = retarget;

const KEYED = [0, 0.3, 0.5, 0.7, 0.88, 1.0, 1.08, CONTACT_TIME, 1.3, 1.6, 1.9];
const posed = (club, t) => {
  const rig = createRig(body);
  solveRig(createSwing(setupFor(club)).pose(t, {}), rig);
  retarget.solve(rig);
  return rig;
};
const at = (name) => retarget.worldP[index[name]].clone();

describe("the model's measurements", () => {
  test("are those of a grown golfer, near the figure the swing was keyed on", () => {
    for (const key of ["upperArm", "forearm", "thigh", "shin"]) {
      expect(body[key] / FIGURE_BODY[key]).toBeGreaterThan(0.88);
      expect(body[key] / FIGURE_BODY[key]).toBeLessThan(1.2);
    }
    expect(body.shoulder.z).toBeGreaterThan(0.17);
    expect(body.hip.z).toBeGreaterThan(0.08);
    expect(body.ankleHeight).toBeGreaterThan(0.05);
  });
});

describe("the rig with the model's measurements", () => {
  test("still meets the ball with every club, both hands on the grip", () => {
    for (const club of CLUBS) {
      const rig = posed(club, CONTACT_TIME);
      expect(rig.clubhead.x).toBeCloseTo(0, 1);
      expect(rig.clubhead.z).toBeCloseTo(0, 1);
      expect(rig.clubhead.y).toBeLessThan(0.2);
      for (let t = 0; t <= SWING_DURATION; t += 0.05) {
        expect(posed(club, t).reached).toBe(true);
      }
    }
  });
});

describe("retargeting onto the model", () => {
  // Each limb joint, and the joint its bone should end on.
  const CHAIN = [
    ["upperarm_l", "lowerarm_l"],
    ["lowerarm_l", "hand_l"],
    ["upperarm_r", "lowerarm_r"],
    ["lowerarm_r", "hand_r"],
    ["thigh_l", "calf_l"],
    ["calf_l", "foot_l"],
    ["thigh_r", "calf_r"],
    ["calf_r", "foot_r"],
  ];

  test("every limb bone ends on the next joint, through the swing", () => {
    for (const id of ["driver", "7i", "lw"]) {
      const club = getClub(id);
      for (const t of KEYED) {
        posed(club, t);
        for (const [from, to] of CHAIN) {
          const i = index[from];
          const child = index[to];
          const end = new Vector3(...joints[child].position)
            .multiplyScalar(retarget.scale)
            .applyQuaternion(retarget.worldQ[i])
            .add(retarget.worldP[i]);
          // within half a centimetre
          expect(end.distanceTo(retarget.worldP[child])).toBeLessThan(0.0055);
        }
      }
    }
  });

  test("puts the model's joints where the rig has them", () => {
    const rig = posed(getClub("driver"), 0.7);
    expect(at("pelvis").distanceTo(rig.bones[BONE.pelvis].position)).toBe(0);
    expect(at("hand_l").distanceTo(rig.wrists[0])).toBe(0);
    expect(at("hand_r").distanceTo(rig.wrists[1])).toBe(0);
    expect(at("foot_l").distanceTo(rig.bones[BONE.leadFoot].position)).toBe(0);
  });

  test("stands the model up at address: head over feet, facing the ball", () => {
    posed(getClub("driver"), 0);
    expect(at("head").y).toBeGreaterThan(at("pelvis").y + 0.45);
    expect(at("head").x).toBeLessThan(at("pelvis").x);
    expect(at("foot_l").z).toBeGreaterThan(at("foot_r").z);
    expect(at("ball_l").x).toBeLessThan(at("foot_l").x);
  });

  test("closes the hands on the grip", () => {
    const rig = posed(getClub("driver"), 0);
    for (const [tag, side] of [
      ["_l", 0],
      ["_r", 1],
    ]) {
      // fingertips come back round toward the shaft, not out past it
      const tip = at(`middle_03${tag}`);
      const knuckle = at(`middle_01${tag}`);
      const shaft = new Vector3(0, 1, 0).applyQuaternion(rig.mount);
      const off = (p) => {
        const d = p.clone().sub(rig.handPoint);
        return d.addScaledVector(shaft, -d.dot(shaft)).length();
      };
      expect(off(knuckle)).toBeLessThan(0.07);
      expect(off(tip)).toBeLessThan(0.07);
      expect(at(`hand${tag}`).distanceTo(rig.wrists[side])).toBe(0);
    }
  });

  test("moves smoothly: no joint flips between frames", () => {
    const club = getClub("driver");
    const swing = createSwing(setupFor(club));
    const rig = createRig(body);
    let before = null;
    for (let t = 0; t <= SWING_DURATION; t += 1 / 120) {
      solveRig(swing.pose(t, {}), rig);
      retarget.solve(rig);
      const now = retarget.localQ.map((q) => q.clone());
      if (before) {
        now.forEach((q, i) => {
          // The wrists let the club go through impact, far faster than
          // anything else turns; everything else moves a few degrees a frame.
          const wrist = /^(hand|lowerarm)_/.test(joints[i].name);
          expect(Math.abs(q.dot(before[i]))).toBeGreaterThan(
            wrist ? 0.88 : 0.985,
          );
        });
      }
      before = now;
    }
  });
});

describe("swapping the model in", () => {
  // The model's node tree as the loader would hand it over, without meshes.
  const loadedScene = () => {
    const scene = new Object3D();
    const nodes = joints.map((joint) => {
      const node = new Object3D();
      node.name = joint.name;
      node.position.fromArray(joint.position);
      node.quaternion.fromArray(joint.quaternion);
      return node;
    });
    joints.forEach((joint, i) =>
      (joint.parent < 0 ? scene : nodes[joint.parent]).add(nodes[i]),
    );
    return scene;
  };

  test("hides the built figure and shows the model in one step", () => {
    const golfer = createGolfer();
    const before = golfer.group.children.filter((part) => part.visible);
    expect(before.length).toBeGreaterThan(10);
    golfer.setModel(loadedScene());
    const shown = golfer.group.children.filter((part) => part.visible);
    // only the club and the model are left showing
    expect(shown.map((part) => part.name)).toContain("golfer-model");
    expect(shown.length).toBe(2);
  });

  test("the model then follows the swing, hands on the club", () => {
    const golfer = createGolfer();
    golfer.setModel(loadedScene());
    const hand = golfer.group.getObjectByName("hand_l");
    const where = () => {
      golfer.group.updateMatrixWorld(true);
      return hand.getWorldPosition(new Vector3());
    };
    golfer.setTime(0);
    const address = where();
    golfer.setTime(0.7);
    const top = where();
    expect(top.y).toBeGreaterThan(address.y + 0.4);
    golfer.setTime(CONTACT_TIME);
    expect(where().distanceTo(address)).toBeLessThan(0.35);
  });
});

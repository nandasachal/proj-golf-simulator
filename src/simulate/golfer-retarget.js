import * as THREE from "three";
import { BONE } from "./golfer-body-figure";
import { FIGURE_BODY } from "./swing-rig";

// Drives a modelled character's skeleton (public/models/golfer.glb, built by
// tools/blender) from the swing rig. The rig poses 17 loose bones in the
// golfer's own space: yards, standing at +x facing -x, lead side +z. The
// model has a parented skeleton in metres, facing +z, its left side +x, with
// its own rest frames. Pure maths: nothing here needs WebGL.

// Yards per metre of model: a golfer a little over six foot.
export const MODEL_SCALE = 1.137;

// Model joint names: the MakeHuman "game engine" rig. Lead is the left side.
const SIDES = [
  { tag: "_l", sign: 1 },
  { tag: "_r", sign: -1 },
];
const FINGERS = ["index", "middle", "ring", "pinky"];
// How far each finger joint closes round the grip, knuckle to tip, degrees.
const CURL = [62, 78, 48];
// How far the thumb comes from its rest line to the line of the shaft.
const THUMB_IN = 1;
// The thumb's line on the grip, from the fingers' line toward its own side.
const THUMB_ACROSS = (48 * Math.PI) / 180;
// How far the thumb presses in toward the palm side, where the shaft is.
const THUMB_PRESS = 0.45;
// How each hand takes the club, lead then trail: the angle of the shaft
// across the fingers (0 would be along them), how far the palm is turned
// down onto the top of the grip, how far from the wrist toward the knuckles
// the shaft crosses, and how far toward the thumb side.
const HOLD = [
  { across: 58, palm: 25, reach: 0.72, shift: 0 },
  { across: 74, palm: 20, reach: 0.76, shift: 0 },
];
// How much nearer the end of the grip these hands sit than the rig's hold
// points, so a straight lead arm still reaches with the shortest club.
const HOLD_UP = 0.022;
// From the palm's skin line to the middle of the grip, yards.
const PALM_DEPTH = 0.026;
// How much of the hand's turn about the forearm the forearm itself takes up,
// so the wrist is not wrung like a cloth.
const FOREARM_TWIST = 0.55;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const m1 = new THREE.Matrix4();

// A frame from its y axis and roughly where its x should point (as the rig's).
function frameYX(y, xToward) {
  const ay = v1.copy(y).normalize();
  const az = v2.crossVectors(xToward, ay).normalize();
  const ax = v3.crossVectors(ay, az);
  return new THREE.Quaternion().setFromRotationMatrix(m1.makeBasis(ax, ay, az));
}

// A frame whose x is `along` and whose y is as near `toward` as it can be.
function frameXY(along, toward) {
  const ax = new THREE.Vector3().copy(along).normalize();
  const az = new THREE.Vector3().crossVectors(ax, toward).normalize();
  const ay = new THREE.Vector3().crossVectors(az, ax);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(ax, ay, az),
  );
}

// The joints of a glTF file's node tree, parents before children:
// [{ name, parent, position, quaternion }], parent an index or -1.
export function jointsFromGltf(json) {
  const joints = [];
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const at = joints.length;
    joints.push({
      name: node.name,
      parent,
      position: node.translation || [0, 0, 0],
      quaternion: node.rotation || [0, 0, 0, 1],
    });
    for (const child of node.children || []) visit(child, at);
  };
  for (const root of json.scenes[json.scene || 0].nodes) visit(root, -1);
  return joints;
}

// The same from a loaded scene, keeping each node so it can be posed.
export function jointsFromScene(scene) {
  const joints = [];
  const visit = (node, parent) => {
    const at = joints.length;
    joints.push({
      name: node.name,
      parent,
      node,
      position: node.position.toArray(),
      quaternion: node.quaternion.toArray(),
    });
    for (const child of node.children) {
      if (!child.isMesh) visit(child, at);
    }
  };
  for (const child of scene.children) {
    if (!child.isMesh) visit(child, -1);
  }
  return joints;
}

export function createRetarget(joints, scale = MODEL_SCALE) {
  const count = joints.length;
  const index = {};
  joints.forEach((joint, i) => {
    index[joint.name] = i;
  });
  const need = (name) => {
    if (index[name] === undefined) throw new Error(`Model has no ${name}`);
    return index[name];
  };

  // Rest pose, in the golfer's space: the model turned to face -x and scaled
  // to yards.
  const stand = new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2);
  const restLocalP = joints.map((j) => new THREE.Vector3(...j.position));
  const restLocalQ = joints.map((j) => new THREE.Quaternion(...j.quaternion));
  const restP = [];
  const restQ = [];
  for (let i = 0; i < count; i++) {
    const parent = joints[i].parent;
    const parentP = parent < 0 ? new THREE.Vector3() : restP[parent];
    const parentQ = parent < 0 ? stand : restQ[parent];
    restP.push(
      restLocalP[i]
        .clone()
        .multiplyScalar(scale)
        .applyQuaternion(parentQ)
        .add(parentP),
    );
    restQ.push(parentQ.clone().multiply(restLocalQ[i]));
  }
  // The model stands on y = 0; so does the figure, before the mat lifts it.
  const at = (name) => restP[need(name)];

  // --- the body's measurements, as the rig wants them ---
  const pelvis = at("pelvis");
  const shoulder = at("upperarm_l");
  const elbow = at("lowerarm_l");
  const wrist = at("hand_l");
  const hip = at("thigh_l");
  const knee = at("calf_l");
  const ankle = at("foot_l");
  const ball = at("ball_l");
  const clavicle = at("clavicle_l");
  const neck = at("neck_01");
  const head = at("head");
  // The rig's chest sits on the spine a little above the shoulder joints.
  const chest = new THREE.Vector3(shoulder.x, shoulder.y + 0.04, 0);
  const thigh = hip.distanceTo(knee);
  const shin = knee.distanceTo(ankle);
  const figureLeg = FIGURE_BODY.thigh + FIGURE_BODY.shin;
  const body = {
    ...FIGURE_BODY,
    grips: [],
    upperArm: shoulder.distanceTo(elbow),
    forearm: elbow.distanceTo(wrist),
    thigh,
    shin,
    hip: { y: hip.y - pelvis.y, z: hip.z },
    shoulder: { y: shoulder.y - chest.y, z: shoulder.z },
    clavicle: {
      x: clavicle.x - chest.x,
      y: clavicle.y - chest.y,
      z: clavicle.z,
    },
    spineJoint: at("spine_02").y - pelvis.y,
    spineLength: chest.y - pelvis.y,
    toe: { x: ball.x - ankle.x, y: ball.y - ankle.y },
    ankleHeight: ankle.y,
    neckBase: neck.y - chest.y,
    neckRise: head.y - neck.y,
    // Longer legs stand taller for the same bend at the knee.
    pelvisHeight:
      FIGURE_BODY.pelvisHeight +
      0.93 * (thigh + shin - figureLeg) +
      (ankle.y - FIGURE_BODY.ankleHeight) -
      (hip.y - pelvis.y - FIGURE_BODY.hip.y),
  };

  // --- what drives each joint ---
  // offset[i] takes the rig's orientation for a bone to the model joint's:
  // the joint's rest orientation, seen from the frame the rig would give the
  // bone in that same rest pose.
  const offset = new Array(count).fill(null);
  const drive = new Array(count).fill(null);
  const follow = (name, rigBone, frame, placed = true) => {
    const i = need(name);
    offset[i] = frame.clone().invert().multiply(restQ[i]);
    drive[i] = { bone: rigBone, placed };
  };
  const upright = new THREE.Quaternion();
  const back = X;

  follow("pelvis", BONE.pelvis, upright);
  follow("spine_02", BONE.spine, upright, false);
  follow("spine_03", BONE.chest, upright);
  // Where the model's chest joint is from the rig's chest.
  const chestJoint = at("spine_03").clone().sub(chest);
  const spine01 = need("spine_01");
  const neck01 = need("neck_01");
  const headJoint = need("head");

  const arms = SIDES.map(({ tag, sign }, side) => {
    const s = at(`upperarm${tag}`);
    const e = at(`lowerarm${tag}`);
    const w = at(`hand${tag}`);
    // The way the elbow sticks out from the line of shoulder to wrist.
    const line = v1.subVectors(w, s);
    const pole = new THREE.Vector3()
      .subVectors(e, s)
      .addScaledVector(line, -v2.subVectors(e, s).dot(line) / line.lengthSq());
    const lead = side === 0;
    follow(
      `clavicle${tag}`,
      lead ? BONE.leadClavicle : BONE.trailClavicle,
      upright,
      false,
    );
    const upperFrame = frameYX(new THREE.Vector3().subVectors(s, e), pole);
    follow(
      `upperarm${tag}`,
      lead ? BONE.leadUpperArm : BONE.trailUpperArm,
      upperFrame,
    );
    const forearmFrame = frameYX(new THREE.Vector3().subVectors(e, w), pole);
    follow(
      `lowerarm${tag}`,
      lead ? BONE.leadForearm : BONE.trailForearm,
      forearmFrame,
    );

    // The hand on the grip. A club is not held along the fingers but across
    // them: it runs from the heel pad under the little finger to the base
    // of the forefinger, so the fingers wrap it and the thumb lies down the
    // top. The lead palm faces away from the target and a little down onto
    // the grip; the trail palm faces the target.
    const hand = need(`hand${tag}`);
    const knuckle = at(`middle_01${tag}`);
    const fingersRest = new THREE.Vector3().subVectors(knuckle, w);
    const palmRest = new THREE.Vector3()
      .subVectors(at(`index_01${tag}`), w)
      .cross(v1.subVectors(at(`pinky_01${tag}`), w))
      .multiplyScalar(-sign)
      .normalize();
    const along = fingersRest.clone().normalize();
    const thumbSide = new THREE.Vector3().subVectors(at(`thumb_01${tag}`), w);
    thumbSide
      .addScaledVector(along, -thumbSide.dot(along))
      .addScaledVector(palmRest, -thumbSide.dot(palmRest))
      .normalize();
    const hold = HOLD[side];
    const across = (hold.across * Math.PI) / 180;
    // The line of the shaft through the open hand, toward the clubhead.
    const shaftRest = along
      .clone()
      .multiplyScalar(Math.cos(across))
      .addScaledVector(thumbSide, Math.sin(across));
    const turn = (hold.palm * Math.PI) / 180;
    const palmHeld = new THREE.Vector3(
      -Math.sin(turn),
      0,
      -sign * Math.cos(turn),
    );
    const grip = frameXY(new THREE.Vector3(0, -1, 0), palmHeld).multiply(
      frameXY(shaftRest, palmRest).invert(),
    );
    const handOffset = grip.clone().multiply(restQ[hand]);
    // Where the shaft's middle passes the palm, from the wrist; the rig
    // puts the wrist that far the other way from where the hand holds.
    const shaftInPalm = fingersRest
      .clone()
      .multiplyScalar(hold.reach)
      .addScaledVector(thumbSide, hold.shift)
      .addScaledVector(palmRest, PALM_DEPTH);
    body.grips[side] = shaftInPalm.clone().applyQuaternion(grip).negate();
    body.grips[side].y += HOLD_UP;

    // Fingers closed round the grip: each joint turned toward the palm.
    const curls = [];
    const curl = (name, degrees, toward) => {
      const i = need(name);
      const child = joints.findIndex((j) => j.parent === i);
      const along =
        child < 0
          ? v1.subVectors(restP[i], restP[joints[i].parent])
          : v1.subVectors(restP[child], restP[i]);
      const axis = new THREE.Vector3()
        .crossVectors(along, toward)
        .normalize()
        .applyQuaternion(q1.copy(restQ[i]).invert());
      curls.push({
        i,
        quaternion: restLocalQ[i]
          .clone()
          .multiply(q2.setFromAxisAngle(axis, (degrees * Math.PI) / 180)),
      });
    };
    for (const finger of FINGERS) {
      CURL.forEach((degrees, joint) =>
        curl(`${finger}_0${joint + 1}${tag}`, degrees, palmRest),
      );
    }
    // The thumb comes round to lie down the shaft.
    const thumbTip = joints.findIndex(
      (j) => j.parent === need(`thumb_03${tag}`),
    );
    const thumbRest = new THREE.Vector3().subVectors(
      thumbTip < 0 ? at(`thumb_03${tag}`) : restP[thumbTip],
      at(`thumb_01${tag}`),
    );
    // The thumb's base sits back from the shaft, so the thumb does not lie
    // along it: it reaches forward and across to rest its pad on top.
    const thumbHeld = along
      .clone()
      .multiplyScalar(Math.cos(THUMB_ACROSS))
      .addScaledVector(thumbSide, Math.sin(THUMB_ACROSS))
      .addScaledVector(palmRest, THUMB_PRESS);
    curl(
      `thumb_01${tag}`,
      THUMB_IN * ((thumbRest.angleTo(thumbHeld) * 180) / Math.PI),
      thumbHeld,
    );
    curl(`thumb_02${tag}`, 10, palmRest);
    curl(`thumb_03${tag}`, 12, palmRest);

    return {
      hand,
      grip,
      palmRest: palmRest.clone(),
      handOffset,
      angle: 0,
      upperOut: new THREE.Vector3(),
      forearmOut: new THREE.Vector3(),
      upper: need(`upperarm${tag}`),
      upperFrameInverse: upperFrame.clone().invert(),
      forearm: need(`lowerarm${tag}`),
      forearmFrameInverse: forearmFrame.clone().invert(),
      forearmAxis: new THREE.Vector3().subVectors(w, e).normalize(),
      curls,
    };
  });

  SIDES.forEach(({ tag }, side) => {
    const lead = side === 0;
    const h = at(`thigh${tag}`);
    const k = at(`calf${tag}`);
    const a = at(`foot${tag}`);
    follow(
      `thigh${tag}`,
      lead ? BONE.leadThigh : BONE.trailThigh,
      frameYX(new THREE.Vector3().subVectors(h, k), back),
    );
    follow(
      `calf${tag}`,
      lead ? BONE.leadShin : BONE.trailShin,
      frameYX(new THREE.Vector3().subVectors(k, a), back),
    );
    follow(`foot${tag}`, lead ? BONE.leadFoot : BONE.trailFoot, upright);
    follow(`ball${tag}`, lead ? BONE.leadToe : BONE.trailToe, upright);
  });

  // --- posing ---
  const worldP = restP.map((p) => p.clone());
  const worldQ = restQ.map((q) => q.clone());
  const localP = restLocalP.map((p) => p.clone());
  const localQ = restLocalQ.map((q) => q.clone());
  // What a joint nothing drives keeps: its rest, or a finger's curl.
  const heldQ = restLocalQ.map((q) => q.clone().normalize());
  for (const arm of arms) {
    for (const { i, quaternion } of arm.curls) {
      heldQ[i].copy(quaternion).normalize();
    }
  }
  const turned = new THREE.Quaternion();
  const origin = new THREE.Vector3();

  // Pose every joint for a solved rig. Fills local positions (model units)
  // and orientations, and the same in the golfer's space.
  function solve(rig) {
    const { bones } = rig;
    for (let i = 0; i < count; i++) {
      const parent = joints[i].parent;
      const parentP = parent < 0 ? origin : worldP[parent];
      const parentQ = parent < 0 ? stand : worldQ[parent];
      const p = worldP[i];
      const q = worldQ[i];
      let placed = false;

      const driven = drive[i];
      if (driven) {
        q.copy(bones[driven.bone].quaternion).multiply(offset[i]);
        if (driven.placed) {
          p.copy(bones[driven.bone].position);
          placed = true;
        }
        if (i === index.spine_03) {
          p.copy(chestJoint)
            .applyQuaternion(bones[BONE.chest].quaternion)
            .add(bones[BONE.chest].position);
        }
      } else if (i === spine01) {
        q.copy(bones[BONE.pelvis].quaternion)
          .slerp(bones[BONE.spine].quaternion, 0.5)
          .multiply(restQ[i]);
      } else if (i === neck01) {
        q.copy(bones[BONE.chest].quaternion)
          .slerp(rig.head, 0.5)
          .multiply(restQ[i]);
      } else if (i === headJoint) {
        q.copy(rig.head).multiply(restQ[i]);
      } else {
        q.copy(parentQ).multiply(heldQ[i]);
      }
      for (let side = 0; side < 2; side++) {
        const arm = arms[side];
        if (i === arm.hand) {
          q.copy(rig.mount).multiply(arm.handOffset);
          p.copy(rig.wrists[side]);
          placed = true;
        } else if (i === arm.upper || i === arm.forearm) {
          // The arm's own frames, from where its joints are: the rig's lose
          // their bearings when an upper arm hangs along its elbow's pole.
          const s = bones[drive[arm.upper].bone].position;
          const e = bones[drive[arm.forearm].bone].position;
          const w = rig.wrists[side];
          const upper = v1.subVectors(e, s);
          const lower = v2.subVectors(w, e);
          // How bent the elbow is decides how far to trust the bend's plane.
          const bent = Math.min(
            1,
            v3.crossVectors(upper, lower).length() /
              (upper.length() * lower.length() * 0.35),
          );
          const isUpper = i === arm.upper;
          const y = isUpper ? upper.negate() : lower.negate();
          // The elbow sticks out away from the other half of the arm.
          const out = isUpper ? v2.negate() : v1;
          out.addScaledVector(y, -out.dot(y) / y.lengthSq()).normalize();
          // With the arm straight there is no bend to read: carry on from
          // where the elbow pointed a moment ago.
          const last = isUpper ? arm.upperOut : arm.forearmOut;
          if (last.lengthSq() === 0) {
            last.set(1, 0, 0).applyQuaternion(bones[drive[i].bone].quaternion);
          }
          out.multiplyScalar(bent).addScaledVector(last, 1 - bent);
          out.addScaledVector(y, -out.dot(y) / y.lengthSq()).normalize();
          last.copy(out);
          y.normalize();
          const z = v3.crossVectors(out, y).normalize();
          const x = v4.crossVectors(y, z);
          turned
            .setFromRotationMatrix(m1.makeBasis(x, y, z))
            .multiply(
              isUpper ? arm.upperFrameInverse : arm.forearmFrameInverse,
            );
          if (isUpper) {
            q.copy(turned).multiply(restQ[i]);
            continue;
          }
          // Turn the forearm about its own length part of the way to where
          // the palm faces, as the two forearm bones do.
          const along = v1.copy(arm.forearmAxis).applyQuaternion(turned);
          const was = v2.copy(arm.palmRest).applyQuaternion(turned);
          const now = v3
            .copy(arm.palmRest)
            .applyQuaternion(q2.copy(rig.mount).multiply(arm.grip));
          was.addScaledVector(along, -was.dot(along));
          now.addScaledVector(along, -now.dot(along));
          let angle = Math.atan2(
            along.dot(v4.crossVectors(was, now)),
            was.dot(now),
          );
          // Carry on from the last frame rather than snap round at a half turn.
          angle +=
            2 * Math.PI * Math.round((arm.angle - angle) / (2 * Math.PI));
          arm.angle = angle;
          q.setFromAxisAngle(along, FOREARM_TWIST * angle)
            .multiply(turned)
            .multiply(restQ[i]);
        }
      }

      q.normalize();
      if (!placed) {
        p.copy(restLocalP[i])
          .multiplyScalar(scale)
          .applyQuaternion(parentQ)
          .add(parentP);
      }
      q1.copy(parentQ).invert();
      localQ[i].copy(q1).multiply(q);
      localP[i].subVectors(p, parentP).applyQuaternion(q1).divideScalar(scale);
    }
  }

  // Write the last solved pose onto the nodes the joints were read from.
  function apply() {
    for (let i = 0; i < count; i++) {
      const { node } = joints[i];
      node.position.copy(localP[i]);
      node.quaternion.copy(localQ[i]);
    }
  }

  return {
    body,
    scale,
    stand,
    index,
    arms,
    restP,
    worldP,
    worldQ,
    localP,
    localQ,
    solve,
    apply,
  };
}

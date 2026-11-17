import * as THREE from "three";
import {
  BONE,
  BONE_COUNT,
  UPPER_ARM,
  FOREARM,
  THIGH,
  SHIN,
  HIP_JOINT,
  SHOULDER_JOINT,
  SPINE_JOINT,
  CLAVICLE_JOINT,
  TOE_JOINT,
} from "./golfer-body-figure";
import { WRIST, ANKLE_HEIGHT } from "./golfer-body-kit";
import { DRIVER_SETUP, shaftDirection } from "./swing-keys";

// The golfer's skeleton for a keyed pose (swing-keys.js): the spine built up
// from the pelvis, the legs reached down to the feet, the club placed in the
// hands and the arms reached out to it. Right-hander: stands at +x facing
// -x, target down +z. Every bone's frame at rest is +x the golfer's back,
// +y up, +z the lead side. Yards.

const MAT_TOP = 0.06;
// Where the driver is played from; other clubs move the stance (their setup).
const FEET_X = 0.97;
const LEAD_FLARE = 22;
const TRAIL_FLARE = -6;
// A shoe only bends so far at the ball: past this the toes come up too.
const TOE_BREAK = 55;

// Where each hand holds the grip, along the mount's y from the hand point.
export const LEAD_HAND = 0.055;
export const TRAIL_HAND = -0.02;
export const HAND_SCALE = 1.12;

// The measurements of the body being posed. The figure built in code
// (golfer-body-figure.js) has these; a modelled character brings its own
// (golfer-retarget.js), so its arms and legs close on its own joints.
export const FIGURE_BODY = {
  upperArm: UPPER_ARM,
  forearm: FOREARM,
  thigh: THIGH,
  shin: SHIN,
  hip: HIP_JOINT,
  shoulder: SHOULDER_JOINT,
  clavicle: CLAVICLE_JOINT,
  spineJoint: SPINE_JOINT,
  spineLength: 0.622,
  toe: TOE_JOINT,
  ankleHeight: ANKLE_HEIGHT,
  // Wrist from the point on the grip a hand holds, in the grip's frame.
  wrist: {
    x: WRIST.x * HAND_SCALE,
    y: WRIST.y * HAND_SCALE,
    z: WRIST.z * HAND_SCALE,
  },
  // The base of the neck in the chest's frame, and how far up it the skull's
  // centre sits: part of the way along the chest's line, the rest the head's.
  neckBase: 0.045,
  neckRise: 0.045,
  skullRise: 0.115,
  // Hips hinged back: the hip joints just behind the heels, the seat well
  // behind them.
  pelvisHeight: 1.083,
};

// Everything the solver wants worked out once from a body's measurements.
function fitBody(body) {
  const wristOn = (holdAt, side) =>
    new THREE.Vector3(body.wrist.x, holdAt + body.wrist.y, side * body.wrist.z);
  const arm = body.upperArm + body.forearm;
  return {
    ...body,
    pelvisAddress: new THREE.Vector3(1.03, body.pelvisHeight, 0),
    ankleY: MAT_TOP + body.ankleHeight,
    // A modelled hand says for itself where its wrist is from its hold.
    leadWrist: body.grips
      ? new THREE.Vector3(0, LEAD_HAND, 0).add(body.grips[0])
      : wristOn(LEAD_HAND, 1),
    trailWrist: body.grips
      ? new THREE.Vector3(0, TRAIL_HAND, 0).add(body.grips[1])
      : wristOn(TRAIL_HAND, -1),
    arm,
    straightArm: arm * 0.985,
    // The points the feet turn about: the ball of the trail foot, and the
    // outside edge of the lead one.
    ballOfFoot: new THREE.Vector3(body.toe.x, body.toe.y, 0),
    outsideEdge: new THREE.Vector3(-0.06, -body.ankleHeight, 0.05),
  };
}

// The shoulder blades let a shoulder reach toward its hand or draw back.
const LEAD_GIVE = [-0.03, 0.09];
const TRAIL_GIVE = [0, 0.085];

const RADIANS = Math.PI / 180;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const q1 = new THREE.Quaternion();
const m1 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

// A segment's orientation: turned about its own long axis, that axis tipped
// forward (bend, toward the ball) and then sideways (lean, away from the
// target).
function orient(out, turn, bend, lean) {
  out.setFromAxisAngle(X_AXIS, -lean * RADIANS);
  out.multiply(q1.setFromAxisAngle(Z_AXIS, bend * RADIANS));
  return out.multiply(q1.setFromAxisAngle(Y_AXIS, turn * RADIANS));
}

// A bone's frame from its y axis and roughly where its x should point.
function frameYX(out, y, xToward) {
  v1.copy(y).normalize();
  v2.crossVectors(xToward, v1).normalize();
  v3.crossVectors(v1, v2);
  return out.setFromRotationMatrix(m1.makeBasis(v3, v1, v2));
}

const axis = new THREE.Vector3();
const sideways = new THREE.Vector3();

// Middle joint of a two-bone limb that bends toward `bend`.
function midJoint(out, from, to, upper, lower, bend) {
  axis.subVectors(to, from);
  // Never quite locked out: a joint that snaps straight snaps back as hard.
  const full = (upper + lower) * 0.996;
  const gap = axis.length() - full;
  const distance = full + 0.5 * (gap - Math.sqrt(gap * gap + 2.5e-5));
  axis.normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  sideways.copy(bend).addScaledVector(axis, -bend.dot(axis));
  if (sideways.lengthSq() > 1e-8) sideways.normalize();
  return out
    .copy(from)
    .addScaledVector(axis, along)
    .addScaledVector(sideways, height);
}

// min and max with the corner rounded off, so a limit is met without a jolt.
// How far (degrees) the toes are bent up once the heel has lifted past the
// most the shoe will bend at the ball.
const pastBreak = (lift) => {
  const over = lift - TOE_BREAK;
  return 0.5 * (over + Math.sqrt(over * over + 36));
};
const softMax = (a, b) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + 4e-4));
const softMin = (a, b) => 0.5 * (a + b - Math.sqrt((a - b) * (a - b) + 4e-4));

export function createRig(body = FIGURE_BODY) {
  const V = () => new THREE.Vector3();
  const Q = () => new THREE.Quaternion();
  return {
    body: fitBody(body),
    bones: Array.from({ length: BONE_COUNT }, () => ({
      position: V(),
      quaternion: Q(),
    })),
    // The middle of the grip, and the club there: -y down the shaft, +z the
    // way the face looks. The hands sit on the grip in the same frame, the
    // back of the lead hand facing the way the clubface does.
    handPoint: V(),
    mount: Q(),
    clubhead: V(),
    wrists: [V(), V()],
    neckBase: V(),
    headCenter: V(),
    head: Q(),
    // Whether both arms are long enough to hold the grip where it is.
    reached: true,
  };
}

const pelvisQ = new THREE.Quaternion();
const spineQ = new THREE.Quaternion();
const chestQ = new THREE.Quaternion();
const chestBack = new THREE.Vector3();
const chestUp = new THREE.Vector3();
const chestLead = new THREE.Vector3();
const pelvisFront = new THREE.Vector3();
const shaft = new THREE.Vector3();
const butt = new THREE.Vector3();
const face = new THREE.Vector3();
const square = new THREE.Vector3();
const toe = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const elbow = new THREE.Vector3();
const reach = new THREE.Vector3();
const pole = new THREE.Vector3();
const hip = new THREE.Vector3();
const knee = new THREE.Vector3();
const ankle = new THREE.Vector3();
const footQ = new THREE.Quaternion();
const plantedQ = new THREE.Quaternion();
const toes = new THREE.Vector3();
const point = new THREE.Vector3();

export function solveRig(pose, rig = createRig()) {
  const { bones, body } = rig;
  const setup = pose.setup || DRIVER_SETUP;
  // The whole stance moves in toward the ball for a shorter club.
  const closer = setup.hands.x - DRIVER_SETUP.hands.x;

  // Spine: pelvis, a middle bone turned and tipped half way, chest.
  const pelvis = bones[BONE.pelvis];
  pelvis.position
    .set(
      pose.pelvisBack + closer,
      pose.pelvisUp,
      pose.pelvisToward + setup.stanceZ,
    )
    .add(body.pelvisAddress);
  orient(pelvisQ, pose.pelvisTurn, pose.pelvisBend, pose.pelvisLean);
  pelvis.quaternion.copy(pelvisQ);
  orient(chestQ, pose.chestTurn, pose.chestBend, pose.chestLean);
  spineQ.copy(pelvisQ).slerp(chestQ, 0.5);
  const spine = bones[BONE.spine];
  spine.position
    .set(0, body.spineJoint, 0)
    .applyQuaternion(pelvisQ)
    .add(pelvis.position);
  spine.quaternion.copy(spineQ);
  const chest = bones[BONE.chest];
  chest.position
    .set(0, body.spineLength - body.spineJoint, 0)
    .applyQuaternion(spineQ)
    .add(spine.position);
  chest.quaternion.copy(chestQ);
  chestBack.copy(X_AXIS).applyQuaternion(chestQ);
  chestUp.copy(Y_AXIS).applyQuaternion(chestQ);
  chestLead.copy(Z_AXIS).applyQuaternion(chestQ);
  pelvisFront.set(-1, 0, 0).applyQuaternion(pelvisQ);

  // Club. The face is in line with the back of the lead hand, and a flat
  // lead wrist has the lead arm, the shaft and the back of that hand all in
  // one plane: the face looks square out of the plane of arm and shaft.
  const hands = rig.handPoint.set(pose.handsX, pose.handsY, pose.handsZ);
  shaftDirection(pose.theta, pose.phi, shaft, setup);
  butt.copy(shaft).negate();
  shoulder
    .set(0, body.shoulder.y, body.shoulder.z)
    .applyQuaternion(chestQ)
    .add(chest.position);
  reach.subVectors(hands, shoulder).normalize();
  face.crossVectors(reach, butt).normalize();
  face.applyAxisAngle(butt, pose.roll * RADIANS);
  square.set(0, -butt.z, butt.y).normalize();
  face.lerp(square, pose.square).normalize();
  toe.crossVectors(butt, face);
  rig.mount.setFromRotationMatrix(m1.makeBasis(toe, butt, face));
  // Hold the lead arm straight: push the hands out along it.
  if (pose.straight > 0) {
    point
      .copy(body.leadWrist)
      .applyQuaternion(rig.mount)
      .add(hands)
      .sub(shoulder);
    const length = point.length();
    hands.addScaledVector(
      point,
      (pose.straight * (body.straightArm + 0.03 - length)) / length,
    );
  }
  rig.clubhead.copy(hands).addScaledVector(shaft, setup.length);

  // Arms, from each shoulder to its wrist on the grip, the elbows hanging
  // down and a little behind.
  // Past impact they fold in front of the chest instead.
  const u = Math.min(1, Math.max(0, (pose.chestTurn - 35) / 70));
  const through = u * u * (3 - 2 * u);
  rig.reached = true;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const wrist = rig.wrists[i]
      .copy(i === 0 ? body.leadWrist : body.trailWrist)
      .applyQuaternion(rig.mount)
      .add(hands);
    shoulder
      .set(0, body.shoulder.y, side * body.shoulder.z)
      .applyQuaternion(chestQ)
      .add(chest.position);
    reach.subVectors(wrist, shoulder);
    const [draw, stretch] = i === 0 ? LEAD_GIVE : TRAIL_GIVE;
    const give = softMin(
      stretch,
      softMax(draw, reach.length() - body.straightArm),
    );
    shoulder.addScaledVector(reach.normalize(), give);
    if (shoulder.distanceTo(wrist) > body.arm + 0.004) rig.reached = false;
    pole
      .set(0, -1, 0)
      .addScaledVector(chestBack, i === 0 ? 0.3 - 0.5 * through : 0.4 - through)
      .addScaledVector(chestLead, side * 0.25);
    midJoint(elbow, shoulder, wrist, body.upperArm, body.forearm, pole);
    // The collar bone swings from the breastbone to wherever the shoulder is.
    const clavicle = bones[i === 0 ? BONE.leadClavicle : BONE.trailClavicle];
    v1.set(body.clavicle.x, body.clavicle.y, side * body.clavicle.z);
    v2.set(0, body.shoulder.y, side * body.shoulder.z)
      .sub(v1)
      .normalize();
    clavicle.position.copy(v1).applyQuaternion(chestQ).add(chest.position);
    v3.subVectors(shoulder, clavicle.position)
      .applyQuaternion(q1.copy(chestQ).invert())
      .normalize();
    clavicle.quaternion.copy(chestQ).multiply(q1.setFromUnitVectors(v2, v3));
    const upperArm = bones[i === 0 ? BONE.leadUpperArm : BONE.trailUpperArm];
    upperArm.position.copy(shoulder);
    frameYX(upperArm.quaternion, point.subVectors(shoulder, elbow), pole);
    const forearm = bones[i === 0 ? BONE.leadForearm : BONE.trailForearm];
    forearm.position.copy(elbow);
    frameYX(forearm.quaternion, point.subVectors(elbow, wrist), pole);
  }

  // Legs, from the hips down to feet that stay where they were planted.
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    ankle.set(
      FEET_X + closer,
      body.ankleY,
      setup.stanceZ + side * setup.halfWidth,
    );
    let yaw;
    if (i === 0) {
      yaw = LEAD_FLARE + pose.leadSpin;
      plantedQ.setFromAxisAngle(Y_AXIS, LEAD_FLARE * RADIANS);
      footQ
        .setFromAxisAngle(Y_AXIS, yaw * RADIANS)
        .multiply(q1.setFromAxisAngle(X_AXIS, pose.leadRoll * RADIANS));
      point.copy(body.outsideEdge);
    } else {
      yaw = TRAIL_FLARE + pose.trailTurn;
      plantedQ.setFromAxisAngle(Y_AXIS, TRAIL_FLARE * RADIANS);
      footQ
        .setFromAxisAngle(Y_AXIS, yaw * RADIANS)
        .multiply(q1.setFromAxisAngle(Z_AXIS, pose.trailLift * RADIANS));
      point.copy(body.ballOfFoot);
      ankle.z += pose.trailSlide;
    }
    ankle.add(v1.copy(point).applyQuaternion(plantedQ));
    ankle.sub(v1.copy(point).applyQuaternion(footQ));
    hip
      .set(0, body.hip.y, side * body.hip.z)
      .applyQuaternion(pelvisQ)
      .add(pelvis.position);
    // The knee points between where the toes and the hips do.
    toes.set(-Math.cos(yaw * RADIANS), 0, Math.sin(yaw * RADIANS));
    pole.copy(toes).addScaledVector(pelvisFront, 0.6);
    pole.y = 0;
    pole.z -= side * (i === 0 ? pose.leadKneeIn : pose.trailKneeIn);
    pole.normalize();
    midJoint(knee, hip, ankle, body.thigh, body.shin, pole);
    const thigh = bones[i === 0 ? BONE.leadThigh : BONE.trailThigh];
    thigh.position.copy(hip);
    frameYX(
      thigh.quaternion,
      point.subVectors(hip, knee),
      v3.copy(pole).addScaledVector(pelvisFront, 1).negate(),
    );
    const shin = bones[i === 0 ? BONE.leadShin : BONE.trailShin];
    shin.position.copy(knee);
    frameYX(
      shin.quaternion,
      point.subVectors(knee, ankle),
      v3.copy(pole).negate(),
    );
    const foot = bones[i === 0 ? BONE.leadFoot : BONE.trailFoot];
    foot.position.copy(ankle);
    foot.quaternion.copy(footQ);
    // The toes stay down while the heel comes up, until the shoe can bend
    // no further; they roll less than the rest of the foot does.
    const toeBone = bones[i === 0 ? BONE.leadToe : BONE.trailToe];
    toeBone.position.copy(body.ballOfFoot).applyQuaternion(footQ).add(ankle);
    toeBone.quaternion.setFromAxisAngle(Y_AXIS, yaw * RADIANS);
    if (i === 0) {
      toeBone.quaternion.multiply(
        q1.setFromAxisAngle(X_AXIS, 0.4 * pose.leadRoll * RADIANS),
      );
    } else {
      toeBone.quaternion.multiply(
        q1.setFromAxisAngle(
          Z_AXIS,
          (pastBreak(pose.trailLift) - pastBreak(0)) * RADIANS,
        ),
      );
    }
  }

  // Head: a short neck carrying on up the spine, the skull over the top of it.
  orient(rig.head, pose.headTurn, pose.headPitch, pose.headLean);
  rig.neckBase
    .set(0, body.neckBase, 0)
    .applyQuaternion(chestQ)
    .add(chest.position);
  rig.headCenter
    .copy(rig.neckBase)
    .addScaledVector(chestUp, body.neckRise)
    .addScaledVector(v1.copy(Y_AXIS).applyQuaternion(rig.head), body.skullRise);
  return rig;
}

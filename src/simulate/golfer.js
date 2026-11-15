import * as THREE from "three";

// A golfer built from simple shapes and animated by hand (no imported model or
// rig). Everything is laid out for a right-hander, who stands on the +x side
// of the ball facing -x with the target down +z; a left-hander is the same
// figure mirrored across the target line. Units are yards.

export const CONTACT_TIME = 1.15; // seconds from the start of the swing to impact
export const SWING_DURATION = 1.65;

const BACKSWING_START = 0.15;
const TOP_OF_BACKSWING = 0.9;

// Where the clubhead rests at address: on the mat, just behind the teed ball.
export const CLUBHEAD_ADDRESS = new THREE.Vector3(0, 0.12, -0.045);

const FEET_X = 0.97;
const STANCE_HALF_WIDTH = 0.24;
const HIP_CENTER = new THREE.Vector3(1.05, 1.06, 0);
const SHOULDER_CENTER = new THREE.Vector3(0.68, 1.56, 0);
const SHOULDER_HALF_WIDTH = 0.22;
const HIP_HALF_WIDTH = 0.13;
const UPPER_ARM = 0.36;
const FOREARM = 0.34;
const THIGH = 0.47;
const SHIN = 0.47;

const TARGET = new THREE.Vector3(0, 0, 1);
// From the shoulders straight down the arms and shaft to the clubhead.
const ADDRESS_LINE = CLUBHEAD_ADDRESS.clone().sub(SHOULDER_CENTER);
const ADDRESS_REACH = ADDRESS_LINE.length();
const ARM_LENGTH = 0.66;
const CLUB_LENGTH = ADDRESS_REACH - ARM_LENGTH;
ADDRESS_LINE.normalize();
const SPINE = SHOULDER_CENTER.clone().sub(HIP_CENTER).normalize();
// Perpendicular to the spine, toward the ball: where the lead shoulder goes
// as the shoulders turn back.
const SHOULDER_TURN = TARGET.clone().cross(SPINE).normalize();

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.min(1, Math.max(0, u));

// Joint angles (radians) for a moment of the swing. Positive arm, hinge,
// shoulder and hip angles are all "back", away from the target; at impact the
// arms and club are back in a straight line to the ball.
export function swingPose(t) {
  if (t <= BACKSWING_START) {
    return { arm: 0, hinge: 0, shoulders: 0, hips: 0, shift: 0 };
  }
  if (t <= TOP_OF_BACKSWING) {
    const u = smooth(
      (t - BACKSWING_START) / (TOP_OF_BACKSWING - BACKSWING_START),
    );
    return {
      arm: 2.4 * u,
      hinge: 1.45 * u,
      shoulders: 1.4 * u,
      hips: 0.6 * u,
      shift: -0.04 * u,
    };
  }
  if (t <= CONTACT_TIME) {
    // Downswing: accelerate all the way to the ball, keeping the wrists
    // cocked until late.
    const u = (t - TOP_OF_BACKSWING) / (CONTACT_TIME - TOP_OF_BACKSWING);
    return {
      arm: 2.4 * (1 - u * u),
      hinge: 1.45 * (1 - u * u * u),
      shoulders: 1.4 - 1.75 * u * u,
      hips: 0.6 - 1.2 * smooth(u),
      shift: -0.04 + 0.12 * u,
    };
  }
  // Follow-through: decelerate into the finish and hold it.
  const u = clamp01((t - CONTACT_TIME) / (SWING_DURATION - CONTACT_TIME));
  const out = 1 - (1 - u) * (1 - u);
  return {
    arm: -2.55 * out,
    hinge: -1.35 * out,
    shoulders: -0.35 - 1.3 * out,
    hips: -0.6 - 0.75 * out,
    shift: 0.08 + 0.05 * out,
  };
}

// Direction of the arms (or shaft) after swinging `angle` back from address,
// within the plane that contains the target line and the address line.
function swingDirection(angle) {
  return ADDRESS_LINE.clone()
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(TARGET, -Math.sin(angle));
}

function joints(pose) {
  const shoulderCenter = SHOULDER_CENTER.clone().addScaledVector(
    TARGET,
    pose.shift * 0.6,
  );
  const hands = shoulderCenter
    .clone()
    .addScaledVector(swingDirection(pose.arm), ARM_LENGTH);
  const clubhead = hands
    .clone()
    .addScaledVector(swingDirection(pose.arm + pose.hinge), CLUB_LENGTH);
  return { shoulderCenter, hands, clubhead };
}

// Where the clubhead is for a pose, in scene coordinates.
export function clubheadPosition(pose, side = "Right") {
  const position = joints(pose).clubhead;
  if (side === "Left") position.x = -position.x;
  return position;
}

// --- meshes ---

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function limb(radius, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.85, 1, 10),
    material,
  );
  mesh.castShadow = true;
  return mesh;
}

function joint(radius, material) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    material,
  );
  mesh.castShadow = true;
  return mesh;
}

// Stretch a unit-height limb between two points.
function place(mesh, from, to) {
  const axis = to.clone().sub(from);
  const length = axis.length();
  mesh.position.copy(from).addScaledVector(axis, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.divideScalar(length));
  mesh.scale.set(1, length, 1);
}

// Middle joint of a two-bone limb that bends toward `bend`; if the limb is
// at full stretch the joint sits on the straight line.
function midJoint(from, to, upper, lower, bend) {
  const axis = to.clone().sub(from);
  const distance = Math.min(axis.length(), upper + lower - 1e-4);
  axis.normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const sideways = bend.clone().addScaledVector(axis, -bend.dot(axis));
  if (sideways.lengthSq() > 1e-8) sideways.normalize();
  return from
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(sideways, out);
}

export function createGolfer() {
  const group = new THREE.Group();
  group.name = "golfer";

  const skin = new THREE.MeshStandardMaterial({
    color: 0xd9a47c,
    roughness: 0.7,
  });
  const shirt = new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    roughness: 0.8,
  });
  const trousers = new THREE.MeshStandardMaterial({
    color: 0x1f2a44,
    roughness: 0.85,
  });
  const shoe = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    roughness: 0.6,
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8102e,
    roughness: 0.7,
  });
  const glove = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xc9ced6,
    metalness: 0.8,
    roughness: 0.3,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    metalness: 0.5,
    roughness: 0.35,
  });

  const add = (mesh) => {
    group.add(mesh);
    return mesh;
  };

  // Legs and feet (feet stay planted).
  const legs = [-1, 1].map((sideZ) => {
    const foot = add(
      new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.12), shoe),
    );
    foot.position.set(FEET_X - 0.05, 0.105, sideZ * STANCE_HALF_WIDTH);
    foot.castShadow = true;
    return {
      sideZ,
      ankle: new THREE.Vector3(FEET_X, 0.16, sideZ * STANCE_HALF_WIDTH),
      thigh: add(limb(0.085, trousers)),
      shin: add(limb(0.065, trousers)),
      knee: add(joint(0.07, trousers)),
    };
  });

  const pelvis = add(
    new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.36), trousers),
  );
  pelvis.castShadow = true;

  const torso = add(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 14), shirt),
  );
  torso.scale.set(1, 1, 1.4);
  torso.castShadow = true;

  const head = new THREE.Group();
  const skull = joint(0.115, skin);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capMaterial,
  );
  cap.position.y = 0.02;
  cap.castShadow = true;
  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.012, 0.16),
    capMaterial,
  );
  brim.position.set(-0.15, 0.035, 0);
  head.add(skull, cap, brim);
  add(head);
  const neck = add(limb(0.05, skin));

  const arms = [-1, 1].map((sideZ) => ({
    sideZ,
    shoulder: add(joint(0.075, shirt)),
    upper: add(limb(0.058, shirt)),
    elbow: add(joint(0.05, skin)),
    fore: add(limb(0.047, skin)),
  }));
  const hands = add(joint(0.062, glove));

  const shaft = add(limb(0.011, steel));
  const clubhead = add(
    new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.07), headMaterial),
  );
  clubhead.castShadow = true;
  clubhead.name = "clubhead";

  function setTime(t) {
    const pose = swingPose(t);
    const {
      shoulderCenter,
      hands: handPoint,
      clubhead: clubPoint,
    } = joints(pose);
    const hipCenter = HIP_CENTER.clone().addScaledVector(TARGET, pose.shift);

    // Pelvis turns about the vertical axis; the legs follow its two ends.
    pelvis.position.copy(hipCenter);
    pelvis.rotation.set(0, pose.hips, 0);
    const hipLine = new THREE.Vector3(
      -Math.sin(pose.hips),
      0,
      Math.cos(pose.hips),
    );
    for (const leg of legs) {
      const hip = hipCenter
        .clone()
        .addScaledVector(hipLine, leg.sideZ * HIP_HALF_WIDTH)
        .add(new THREE.Vector3(0, -0.06, 0));
      const knee = midJoint(
        hip,
        leg.ankle,
        THIGH,
        SHIN,
        new THREE.Vector3(-1, 0, 0),
      );
      place(leg.thigh, hip, knee);
      place(leg.shin, knee, leg.ankle);
      leg.knee.position.copy(knee);
    }

    // Torso runs up the spine and turns about it with the shoulders.
    const spine = shoulderCenter.clone().sub(hipCenter);
    const spineLength = spine.length();
    spine.normalize();
    torso.position.copy(hipCenter).addScaledVector(spine, spineLength * 0.52);
    torso.quaternion
      .setFromUnitVectors(Y_AXIS, spine)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -pose.shoulders),
      );

    const neckBase = shoulderCenter.clone().addScaledVector(spine, 0.06);
    const headCenter = shoulderCenter
      .clone()
      .addScaledVector(spine, 0.25)
      .add(new THREE.Vector3(-0.03, 0, 0));
    place(neck, neckBase, headCenter);
    head.position.copy(headCenter);
    // Eyes on the ball until impact, then the head comes up toward the target.
    const lift = clamp01((t - CONTACT_TIME) / 0.4);
    head.rotation.set(0, -lift * 1.1, -0.55 + lift * 0.45);

    const shoulderLine = TARGET.clone()
      .multiplyScalar(Math.cos(pose.shoulders))
      .addScaledVector(SHOULDER_TURN, Math.sin(pose.shoulders));
    for (const arm of arms) {
      const shoulder = shoulderCenter
        .clone()
        .addScaledVector(shoulderLine, arm.sideZ * SHOULDER_HALF_WIDTH);
      const elbow = midJoint(
        shoulder,
        handPoint,
        UPPER_ARM,
        FOREARM,
        new THREE.Vector3(0.4, -1, -arm.sideZ * 0.6),
      );
      arm.shoulder.position.copy(shoulder);
      arm.elbow.position.copy(elbow);
      place(arm.upper, shoulder, elbow);
      place(arm.fore, elbow, handPoint);
    }
    hands.position.copy(handPoint);

    place(shaft, handPoint, clubPoint);
    clubhead.position.copy(clubPoint);
    clubhead.quaternion.copy(shaft.quaternion);
  }

  function setSide(side) {
    group.scale.x = side === "Left" ? -1 : 1;
  }

  setTime(0);
  return { group, setTime, setSide };
}

import * as THREE from "three";
import { buildGolferHead, SKIN_COLOR } from "./golfer-head";
import { buildSwingClub } from "./golfer-club";
import { getClub, DEFAULT_CLUB_ID } from "./clubs";
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
  buildTorso,
  buildSleeve,
  buildArm,
  buildTrouserLeg,
  buildSock,
} from "./golfer-body-figure";
import {
  WRIST,
  ANKLE_HEIGHT,
  buildHand,
  buildShoe,
  buildBelt,
  buildCollar,
  buildChain,
} from "./golfer-body-kit";
import {
  canPaint,
  shirtMaps,
  sleeveMaps,
  trouserMaps,
  shoeMaps,
  leatherNormals,
  surroundings,
} from "./golfer-body-textures";

// A golfer modelled and animated by hand (no imported model or rig): a
// skinned body on a handful of bones that are placed, every frame, from the
// joint positions worked out below. Everything is laid out for a
// right-hander, who stands on the +x side of the ball facing -x with the
// target down +z; a left-hander is the same figure mirrored across the
// target line. Units are yards.

export const CONTACT_TIME = 1.15; // seconds from the start of the swing to impact
export const SWING_DURATION = 1.65;

const BACKSWING_START = 0.15;
const TOP_OF_BACKSWING = 0.9;

// Where the clubhead rests at address: on the mat, just behind the teed ball.
export const CLUBHEAD_ADDRESS = new THREE.Vector3(0, 0.12, -0.045);

const MAT_TOP = 0.06;
const FEET_X = 0.97;
const STANCE_HALF_WIDTH = 0.24;
const HIP_CENTER = new THREE.Vector3(1.05, 1.06, 0);
const SHOULDER_CENTER = new THREE.Vector3(0.68, 1.56, 0);
// Through the finish the golfer stands up out of their address posture.
const STAND_UP = new THREE.Vector3(0.12, 0.09, 0.05);

const TARGET = new THREE.Vector3(0, 0, 1);
// From the shoulders straight down the arms and shaft to the clubhead.
const ADDRESS_LINE = CLUBHEAD_ADDRESS.clone().sub(SHOULDER_CENTER);
const ADDRESS_REACH = ADDRESS_LINE.length();
const ARM_LENGTH = 0.66;
const CLUB_LENGTH = ADDRESS_REACH - ARM_LENGTH;
ADDRESS_LINE.normalize();

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

// How far into the follow-through a pose is: 0 up to impact, 1 at the finish.
const followThrough = (pose) => clamp01((-pose.shoulders - 0.35) / 1.3);

function joints(pose) {
  const shoulderCenter = SHOULDER_CENTER.clone()
    .addScaledVector(TARGET, pose.shift * 0.6)
    .addScaledVector(STAND_UP, followThrough(pose));
  // The hands swing in closer as the arms fold, going back and going through:
  // at full stretch they would be out of reach of the far shoulder.
  const reach =
    ARM_LENGTH * (1 - 0.22 * smooth(clamp01(Math.abs(pose.arm) / 2.2)));
  const hands = shoulderCenter
    .clone()
    .addScaledVector(swingDirection(pose.arm), reach);
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

// --- skeleton ---

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The chest turns further than the shoulder line the swing is timed by, and
// sits tilted, trail shoulder low, as the lower hand on the grip needs.
const CHEST_TURN = 1.25;
const SHOULDER_TILT = 0.17;
// Where each hand holds the grip, along the mount's y from the hand point,
// and how far the shoulder blades let an arm reach or draw back.
const LEAD_HAND = 0.055;
const TRAIL_HAND = -0.02;
const HAND_SCALE = 1.12;
const STRAIGHT_ARM = (UPPER_ARM + FOREARM) * 0.985;
const ANKLE_Y = MAT_TOP + ANKLE_HEIGHT;
// The ball of the foot, which the trail foot rolls up onto, in the foot's frame.
const BALL_OF_FOOT = V(-0.165, -0.085, 0);

const basis = (x, y, z) =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
// A bone's frame from its y axis and roughly where its z (or x) should point.
function frameYZ(y, zToward) {
  const up = y.clone().normalize();
  const x = up.clone().cross(zToward).normalize();
  return basis(x, up, x.clone().cross(up));
}
function frameYX(y, xToward) {
  const up = y.clone().normalize();
  const z = xToward.clone().cross(up).normalize();
  return basis(up.clone().cross(z), up, z);
}
const turnY = (angle) => new THREE.Quaternion().setFromAxisAngle(Y_AXIS, angle);

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

// Everything the figure needs for a moment of the swing: a position and
// orientation for each bone (indexed by BONE), the grip, and the head.
export function bodyPose(t) {
  const pose = swingPose(t);
  const { shoulderCenter, hands: handPoint, clubhead } = joints(pose);
  const through = followThrough(pose);
  const bones = new Array(BONE_COUNT);
  const set = (bone, position, quaternion) => {
    bones[bone] = { position, quaternion };
    return new THREE.Matrix4().compose(position, quaternion, V(1, 1, 1));
  };

  // Hips: they slide toward the target, turn - sitting a little as they do,
  // so the far leg keeps its flex - and come forward under the shoulders as
  // the golfer stands up into the finish.
  const sit = 0.02 * smooth(clamp01(Math.abs(pose.hips) / 0.6));
  const hipCenter = HIP_CENTER.clone()
    .addScaledVector(TARGET, pose.shift + 0.07 * through)
    .add(V(-0.1 * through, 0.01 * through - sit, 0));
  const spine = shoulderCenter.clone().sub(hipCenter).normalize();
  const forward = TARGET.clone().cross(spine).normalize();
  const across = spine.clone().cross(forward);
  const hipLine = V(-Math.sin(pose.hips), 0, Math.cos(pose.hips));
  const turn = pose.shoulders * CHEST_TURN;
  const shoulderLine = across
    .clone()
    .multiplyScalar(Math.cos(turn))
    .addScaledVector(forward, Math.sin(turn));

  const pelvis = set(BONE.pelvis, hipCenter, frameYZ(spine, hipLine));
  set(
    BONE.spine,
    hipCenter.clone().addScaledVector(spine, SPINE_JOINT),
    frameYZ(spine, hipLine.clone().add(shoulderLine)),
  );
  const chest = set(
    BONE.chest,
    shoulderCenter,
    frameYZ(
      spine
        .clone()
        .multiplyScalar(Math.cos(SHOULDER_TILT))
        .addScaledVector(shoulderLine, -Math.sin(SHOULDER_TILT)),
      shoulderLine
        .clone()
        .multiplyScalar(Math.cos(SHOULDER_TILT))
        .addScaledVector(spine, Math.sin(SHOULDER_TILT)),
    ),
  );

  // The club: origin at the hands, -y down the shaft, +z the way the face
  // looks. The hands roll round the grip as the wrists cock, so that they
  // hinge toward the thumbs.
  const swung = pose.arm + pose.hinge;
  const up = handPoint.clone().sub(clubhead).normalize();
  const facing = TARGET.clone()
    .multiplyScalar(Math.cos(swung))
    .addScaledVector(ADDRESS_LINE, Math.sin(swung));
  const toe = up.clone().cross(facing).normalize();
  const mount = basis(toe, up, toe.clone().cross(up));
  const grip = mount.clone().multiply(turnY(-pose.hinge * 1.08));

  // Arms, from each shoulder to its wrist on the grip.
  const arms = [
    [1, BONE.leadUpperArm, BONE.leadForearm, LEAD_HAND],
    [-1, BONE.trailUpperArm, BONE.trailForearm, TRAIL_HAND],
  ];
  let reached = true;
  for (const [side, upperArm, forearm, holdAt] of arms) {
    const wrist = V(WRIST.x, WRIST.y, side * WRIST.z)
      .multiplyScalar(HAND_SCALE)
      .setComponent(1, holdAt + WRIST.y * HAND_SCALE)
      .applyQuaternion(grip)
      .add(handPoint);
    const shoulder = V(
      0,
      SHOULDER_JOINT.y,
      side * SHOULDER_JOINT.z,
    ).applyMatrix4(chest);
    const toWrist = wrist.clone().sub(shoulder);
    const stretch = toWrist.length() - STRAIGHT_ARM;
    shoulder.addScaledVector(
      toWrist.normalize(),
      Math.min(0.05, Math.max(side > 0 ? -0.04 : 0, stretch)),
    );
    if (shoulder.distanceTo(wrist) > UPPER_ARM + FOREARM + 0.004)
      reached = false;
    const bend = V(0.45, -1, side * 0.25);
    const elbow = midJoint(shoulder, wrist, UPPER_ARM, FOREARM, bend);
    set(upperArm, shoulder, frameYX(shoulder.clone().sub(elbow), bend));
    set(forearm, elbow, frameYX(elbow.clone().sub(wrist), bend));
  }

  // Legs. The lead foot stays planted; the trail foot rolls up onto its toe
  // and turns toward the target as the hips come through.
  const heelUp = smooth(clamp01((-pose.hips - 0.25) / 0.9));
  const pelvisFront = V(-1, 0, 0).transformDirection(pelvis);
  const legs = [
    [1, BONE.leadThigh, BONE.leadShin, BONE.leadFoot, 0.36, 0],
    [-1, BONE.trailThigh, BONE.trailShin, BONE.trailFoot, 0.14, heelUp],
  ];
  for (const [side, thigh, shin, foot, flare, lift] of legs) {
    const planted = turnY(side * flare);
    const turned = turnY(side * flare + lift * 0.95).multiply(
      new THREE.Quaternion().setFromAxisAngle(Z_AXIS, lift * 1.2),
    );
    const ankle = V(FEET_X, ANKLE_Y, side * STANCE_HALF_WIDTH)
      .add(BALL_OF_FOOT.clone().applyQuaternion(planted))
      .sub(BALL_OF_FOOT.clone().applyQuaternion(turned));
    const hip = V(0, HIP_JOINT.y, side * HIP_JOINT.z).applyMatrix4(pelvis);
    const toe = V(-1, 0, 0).applyQuaternion(turned);
    const bend = V(toe.x, 0, toe.z + side * 0.12).normalize();
    const knee = midJoint(hip, ankle, THIGH, SHIN, bend);
    set(
      thigh,
      hip,
      frameYX(hip.clone().sub(knee), pelvisFront.clone().add(bend).negate()),
    );
    set(shin, knee, frameYX(knee.clone().sub(ankle), bend.clone().negate()));
    set(foot, ankle, turned);
  }

  // Eyes on the ball until impact, then the head comes up to watch it go.
  const lift = smooth(clamp01((t - CONTACT_TIME) / 0.4));
  const headCenter = shoulderCenter
    .clone()
    .addScaledVector(spine, 0.25)
    .add(V(-0.03, 0, 0));
  return {
    bones,
    handPoint,
    mount,
    grip,
    reached,
    neckBase: V(0.004, 0.03, 0).applyMatrix4(chest),
    headCenter,
    headTurn: lift * 1.2,
    headPitch: 0.95 - lift * 0.9,
  };
}

// --- meshes ---

function materials() {
  const paint = canPaint();
  const leather = paint ? leatherNormals() : null;
  const reflection = paint ? surroundings() : null;
  const cloth = (maps, roughness) =>
    new THREE.MeshStandardMaterial({ ...maps, roughness });
  const shirt = paint ? shirtMaps(SKIN_COLOR) : { color: 0xcbd0d8 };
  const sleeve = paint ? sleeveMaps() : { color: 0xcbd0d8 };
  const trousers = paint ? trouserMaps() : { color: 0x1b243e };
  const shoe = paint ? shoeMaps() : { color: 0xf4f4f0 };
  const metal = (color, roughness) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 1,
      envMap: reflection,
      envMapIntensity: 1.2,
    });
  return {
    skin: new THREE.MeshStandardMaterial({
      color: SKIN_COLOR,
      roughness: 0.62,
    }),
    shirt: cloth(shirt, 0.92),
    sleeve: cloth(sleeve, 0.92),
    collar: new THREE.MeshStandardMaterial({
      ...sleeve,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
    trousers: cloth(trousers, 0.86),
    shoe: cloth(shoe, 0.42),
    sole: new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.85 }),
    lace: new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.9 }),
    sock: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.95 }),
    belt: new THREE.MeshStandardMaterial({
      color: 0x2a1a11,
      roughness: 0.48,
      normalMap: leather,
    }),
    buckle: metal(0xdfe3e8, 0.22),
    gold: metal(0xf0c14a, 0.3),
    glove: new THREE.MeshStandardMaterial({
      color: 0xf8f7f2,
      roughness: 0.5,
      normalMap: leather,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    gloveTab: new THREE.MeshStandardMaterial({
      color: 0xe4e4df,
      roughness: 0.75,
    }),
    gloveTrim: new THREE.MeshStandardMaterial({
      color: 0xa9adb3,
      roughness: 0.7,
    }),
  };
}

export function createGolfer() {
  const group = new THREE.Group();
  group.name = "golfer";
  const look = materials();

  // The body is modelled at address: the bones' places then are the bind pose.
  const bind = bodyPose(0);
  const bones = bind.bones.map(({ position, quaternion }) => {
    const bone = new THREE.Bone();
    bone.position.copy(position);
    bone.quaternion.copy(quaternion);
    bone.updateMatrix();
    group.add(bone);
    return bone;
  });
  const binds = bones.map((bone) => bone.matrix.clone());
  const skeleton = new THREE.Skeleton(
    bones,
    binds.map((matrix) => matrix.clone().invert()),
  );
  const skinned = (geometry, material) => {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.castShadow = true;
    // Bounds are of the bind pose only, and the figure is always in view.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  const spineLength = bind.bones[BONE.chest].position.distanceTo(
    bind.bones[BONE.pelvis].position,
  );
  skinned(buildTorso(binds, spineLength), look.shirt);
  const limbs = [
    [false, BONE.leadUpperArm, BONE.leadForearm, BONE.leadThigh, BONE.leadShin],
    [
      true,
      BONE.trailUpperArm,
      BONE.trailForearm,
      BONE.trailThigh,
      BONE.trailShin,
    ],
  ];
  for (const [mirror, upperArm, forearm, thigh, shin] of limbs) {
    skinned(buildSleeve(binds, upperArm, mirror), look.sleeve);
    skinned(buildArm(binds, upperArm, forearm, mirror), look.skin);
    skinned(buildTrouserLeg(binds, { thigh, shin }, mirror), look.trousers);
    skinned(buildSock(binds, shin), look.sock);
  }
  for (const foot of [BONE.leadFoot, BONE.trailFoot]) {
    bones[foot].add(
      buildShoe({ upper: look.shoe, sole: look.sole, lace: look.lace }),
    );
  }
  bones[BONE.pelvis].add(
    buildBelt({ leather: look.belt, metal: look.buckle, cloth: look.trousers }),
  );
  bones[BONE.chest].add(buildCollar(look.collar), buildChain(look.gold));

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.054, 1, 20, 1, true),
    look.skin,
  );
  neck.castShadow = true;
  const head = buildGolferHead();
  group.add(neck, head);

  // The hands hold the grip in an overlapping grip: the lead hand, gloved,
  // nearer the butt, the trail hand below with its little finger riding on
  // the lead forefinger.
  const grip = new THREE.Group();
  const leadHand = buildHand(look.glove, {
    glove: { tab: look.gloveTab, trim: look.gloveTrim },
  });
  leadHand.position.y = LEAD_HAND;
  leadHand.scale.setScalar(HAND_SCALE);
  const trailHand = buildHand(look.skin, { overlap: true });
  trailHand.position.y = TRAIL_HAND;
  trailHand.scale.set(HAND_SCALE, HAND_SCALE, -HAND_SCALE);
  grip.add(leadHand, trailHand);
  group.add(grip);

  // Origin at the hands, -y down the shaft, +z the way the face looks.
  const clubMount = new THREE.Group();
  group.add(clubMount);
  let time = 0;

  function setClub(club) {
    clubMount.clear();
    clubMount.add(buildSwingClub(club, CLUB_LENGTH));
  }

  function setTime(t) {
    time = t;
    const body = bodyPose(t);
    body.bones.forEach(({ position, quaternion }, i) => {
      bones[i].position.copy(position);
      bones[i].quaternion.copy(quaternion);
    });

    clubMount.position.copy(body.handPoint);
    clubMount.quaternion.copy(body.mount);
    grip.position.copy(body.handPoint);
    grip.quaternion.copy(body.grip);

    const neckAxis = body.headCenter.clone().sub(body.neckBase);
    const neckLength = neckAxis.length();
    neck.position.copy(body.neckBase).addScaledVector(neckAxis, 0.5);
    neck.quaternion.setFromUnitVectors(
      Y_AXIS,
      neckAxis.divideScalar(neckLength),
    );
    neck.scale.set(1, neckLength, 1);
    head.position.copy(body.headCenter);
    head.rotation.set(0, body.headTurn, body.headPitch);
  }

  function setSide(side) {
    group.scale.x = side === "Left" ? -1 : 1;
  }

  // Turn the stance about the ball so the golfer sets up aimed right (+) or
  // left (-) of the centre line.
  function setAim(degreesRight) {
    group.rotation.y = (-degreesRight * Math.PI) / 180;
  }

  setClub(getClub(DEFAULT_CLUB_ID));
  setTime(time);
  // For posing the figure by hand when checking it in the browser.
  group.userData.setTime = setTime;
  return { group, setTime, setSide, setAim, setClub };
}

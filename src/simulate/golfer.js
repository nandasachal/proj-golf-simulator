import * as THREE from "three";
import { buildGolferHead, SKIN_COLOR } from "./golfer-head";
import { buildSwingClub } from "./golfer-club";
import { getClub, DEFAULT_CLUB_ID } from "./clubs";
import {
  BONE,
  buildTorso,
  buildSleeve,
  buildArm,
  buildTrouserLeg,
  buildSock,
} from "./golfer-body-figure";
import {
  buildHand,
  buildShoe,
  buildBelt,
  buildCollar,
  buildChain,
} from "./golfer-body-kit";
import { golferLook } from "./golfer-body-look";
import {
  CONTACT_TIME,
  SWING_DURATION,
  CLUBHEAD_ADDRESS,
  CLUB_LENGTH,
  SHAFT_DEGREES,
  swingPose,
} from "./swing-keys";
import {
  LEAD_HAND,
  TRAIL_HAND,
  HAND_SCALE,
  createRig,
  solveRig,
} from "./swing-rig";
import { buildNeck } from "./golfer-body-neck";

// A golfer modelled and animated by hand (no imported model or rig): a
// skinned body on a handful of bones. swing-keys.js holds the swing as keyed
// positions, swing-rig.js turns a moment of it into bone placements, and
// this file hangs the meshes on them. Everything is laid out for a
// right-hander, who stands on the +x side of the ball facing -x with the
// target down +z; a left-hander is the same figure mirrored across the
// target line. Units are yards.

export { CONTACT_TIME, SWING_DURATION, CLUBHEAD_ADDRESS, swingPose };

// Everything the figure needs for a moment of the swing: a position and
// orientation for each bone (indexed by BONE), the club, and the head.
export function bodyPose(t) {
  return solveRig(swingPose(t));
}

// Where the clubhead is for a pose, in scene coordinates.
export function clubheadPosition(pose, side = "Right") {
  const position = solveRig(pose).clubhead;
  if (side === "Left") position.x = -position.x;
  return position;
}

// --- meshes ---

export function createGolfer() {
  const group = new THREE.Group();
  group.name = "golfer";
  const look = golferLook(SKIN_COLOR);

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
    mesh.receiveShadow = true;
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
      buildShoe({
        upper: look.shoe,
        sole: look.sole,
        lace: look.lace,
        tread: look.tread,
      }),
    );
  }
  bones[BONE.pelvis].add(
    buildBelt({ leather: look.belt, metal: look.buckle, cloth: look.trousers }),
  );
  bones[BONE.chest].add(buildCollar(look.collar), buildChain(look.gold));

  const head = buildGolferHead();
  group.add(head, buildNeck(look.skin, bones[BONE.chest], head));

  // The hands hold the grip in an overlapping grip: the lead hand, gloved,
  // nearer the butt, the trail hand below with its little finger riding on
  // the lead forefinger.
  const grip = new THREE.Group();
  const leadHand = buildHand(look.glove, {
    glove: { tab: look.gloveTab, trim: look.gloveTrim },
  });
  leadHand.position.y = LEAD_HAND;
  leadHand.scale.setScalar(HAND_SCALE);
  const trailHand = buildHand(look.skin, { overlap: true, nail: look.nail });
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
    clubMount.add(
      buildSwingClub(club, CLUB_LENGTH, { shaftDegrees: SHAFT_DEGREES }),
    );
  }

  const pose = {};
  const rig = createRig();

  function setTime(t) {
    time = t;
    solveRig(swingPose(t, pose), rig);
    for (let i = 0; i < bones.length; i++) {
      bones[i].position.copy(rig.bones[i].position);
      bones[i].quaternion.copy(rig.bones[i].quaternion);
    }

    clubMount.position.copy(rig.handPoint);
    clubMount.quaternion.copy(rig.mount);
    grip.position.copy(rig.handPoint);
    grip.quaternion.copy(rig.mount);

    head.position.copy(rig.headCenter);
    head.quaternion.copy(rig.head);
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

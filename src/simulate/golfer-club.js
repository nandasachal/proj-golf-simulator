import * as THREE from "three";
import { buildClubHead } from "./club-heads";

// The club the golfer swings, for a club from clubs.js: the same head model
// the shot controls show, on a shaft fitted to the golfer. Yards; origin where
// the hands hold the grip, the shaft running down local -y, and a child named
// "clubhead" at the middle of the face. The face looks down local +z (the
// target at address) and the toe points to local -x.
//
// The golfer's reach is the same for every club, so the head is kept at its
// true size and the shaft is cut to fit. The head is turned on the shaft so
// that, with the shaft at the golfer's address angle, its sole is level and
// its face is square at the club's own loft.

const CM_PER_YARD = 91.44;
const CM_PER_INCH = 2.54;
const RADIANS = Math.PI / 180;

// How steeply the line from the hands to the clubhead rises at address
// (golfer.js: shoulders to CLUBHEAD_ADDRESS).
export const ADDRESS_SHAFT_DEGREES = 64.7;
// How far above the mat the golfer's clubhead point is at address
// (golfer.js CLUBHEAD_ADDRESS.y less main.js MAT_TOP). A teed club hovers
// there; any other is let down from it until its sole is on the mat.
export const ADDRESS_HEIGHT = 0.06;
// The grip carries on past the middle of the hands to its butt end.
const BUTT_ABOVE_HANDS = 12;

// Where the hands go for a head whose shaft axis passes through `point` and
// whose sole reaches down to `ground` (centimetres, in the head's own frame:
// origin at the middle of the face, heel on +x, up +y), and the lie the shaft
// needs to get there. `length` is from the hands to the golfer's clubhead
// point; `lift` is how far above the ground that point is.
export function fitShaft({ point, ground, length, shaftDegrees, lift }) {
  const angle = shaftDegrees * RADIANS;
  const drop = Math.max(0, lift + ground);
  const hands = {
    x: length * Math.cos(angle),
    y: length * Math.sin(angle) + drop,
  };
  const dx = hands.x - point.x;
  const dy = hands.y - point.y;
  return {
    hands,
    drop,
    lieDegrees: Math.atan2(dy, dx) / RADIANS,
    reach: Math.hypot(dx, dy),
  };
}

// jsdom has no canvas to paint the heads' textures on.
const canPaint = () =>
  typeof document !== "undefined" &&
  !(typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent));

// The range has no environment map, and polished metal with nothing to
// reflect renders black: give the club a sky, a horizon and turf to mirror.
let surroundings = null;
function reflections() {
  if (surroundings) return surroundings;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, "#5f93d6");
  sky.addColorStop(0.3, "#9cc0ea");
  sky.addColorStop(0.47, "#e6eef6");
  sky.addColorStop(0.5, "#b9c7b0");
  sky.addColorStop(0.53, "#4f7a3a");
  sky.addColorStop(1, "#2c4a22");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 128);
  // the sun, and a few clouds for the chrome to pick up
  const glow = ctx.createRadialGradient(60, 26, 0, 60, 26, 22);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.35, "rgba(255,250,235,0.9)");
  glow.addColorStop(1, "rgba(255,250,235,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(30, 0, 60, 56);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (const [x, y, w, h] of [
    [130, 30, 30, 5],
    [190, 22, 38, 6],
    [215, 44, 26, 4],
    [10, 46, 24, 4],
    [100, 50, 20, 3],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  surroundings = new THREE.CanvasTexture(canvas);
  surroundings.mapping = THREE.EquirectangularReflectionMapping;
  surroundings.colorSpace = THREE.SRGBColorSpace;
  return surroundings;
}

const materialsOf = (mesh) =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

function dispose(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of materialsOf(object)) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture && value !== surroundings) value.dispose();
      }
      material.dispose();
    }
  });
}

// What fitting needs to know about each head, measured once from the model.
const measurements = new Map();
function measure(club) {
  if (!measurements.has(club.id)) {
    const head = buildClubHead(club);
    const { shaft, solePoints } = head.userData;
    measurements.set(club.id, {
      point: { x: shaft.point.x, y: shaft.point.y },
      length: shaft.length,
      ground: Math.min(...solePoints.map((point) => point.y)),
    });
    dispose(head);
  }
  return measurements.get(club.id);
}

function buildFittedClub(club, length, { shaftDegrees, addressHeight }) {
  const measured = measure(club);
  const fit = fitShaft({
    point: measured.point,
    ground: measured.ground,
    length: length * CM_PER_YARD,
    shaftDegrees,
    lift: club.teed ? -measured.ground : addressHeight * CM_PER_YARD,
  });
  const head = buildClubHead({
    ...club,
    lieDegrees: fit.lieDegrees,
    lengthInches:
      club.lengthInches +
      (fit.reach + BUTT_ABOVE_HANDS - measured.length) / CM_PER_INCH,
  });

  // The hands hold the shaft itself: the point of its axis nearest to where
  // the fit put them.
  const { point, direction } = head.userData.shaft;
  const along =
    (fit.hands.x - point.x) * direction.x +
    (fit.hands.y - point.y) * direction.y;
  const hands = point.clone().addScaledVector(direction, along);

  const marker = new THREE.Object3D();
  marker.name = "clubhead";
  head.add(marker);
  head.position.copy(hands).negate();

  const reflection = reflections();
  head.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of materialsOf(object)) {
      if (!material.transparent) object.castShadow = true;
      if (material.isMeshStandardMaterial) {
        material.envMap = reflection;
        material.envMapIntensity = 1.15;
      }
    }
  });

  // Centimetres to yards, and the head's level sole to the angle of the shaft.
  const fitted = new THREE.Group();
  fitted.scale.setScalar(1 / CM_PER_YARD);
  fitted.rotation.z = (90 - shaftDegrees) * RADIANS;
  fitted.add(head);
  // The shaft enters the head a little ahead of or behind the middle of the
  // face. Lean it that fraction of a degree, so that it is the face that
  // comes back to the ball.
  const face = head.position
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), fitted.rotation.z);
  const leaned = new THREE.Group();
  leaned.rotation.x = Math.atan(-face.z / face.y);
  leaned.add(fitted);
  return leaned;
}

// Stands in where the heads cannot be painted (tests).
function buildPlainClub(length) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.005, length + 0.13, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8 }),
  );
  shaft.position.y = 0.065 - length / 2;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.05, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x16181d, metalness: 0.5 }),
  );
  head.name = "clubhead";
  head.position.y = -length;
  shaft.castShadow = head.castShadow = true;
  group.add(shaft, head);
  return group;
}

let latest = null;

export function buildSwingClub(
  club,
  length,
  { shaftDegrees = ADDRESS_SHAFT_DEGREES, addressHeight = ADDRESS_HEIGHT } = {},
) {
  // The golfer drops the old club without a word: clear up after it.
  if (latest && !latest.parent) latest.userData.dispose();

  const group = canPaint()
    ? buildFittedClub(club, length, { shaftDegrees, addressHeight })
    : buildPlainClub(length);
  group.name = "club";
  group.userData.dispose = () => dispose(group);
  latest = group;
  return group;
}

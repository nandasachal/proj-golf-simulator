import * as THREE from "three";
import { gauss, smoothstep, table } from "./golfer-body-tube";
import { NECK_STUMP } from "./golfer-head";

// The neck: a tube that grows out of the collar on the chest bone and runs up
// into the stump under the skull, wherever the head has been put. It is not
// skinned - there is no pose in which chest and head are both at rest - but
// redrawn before each frame as a curve between the two, so it bends along its
// whole length and never opens a gap behind the jaw.

const RINGS = 16;
const SEGMENTS = 28;
const PI = Math.PI;

// Where it leaves the shirt, in the chest bone's frame (+x back, +y up), and
// which way it is heading.
const ROOT = new THREE.Vector3(-0.016, 0.05, 0);
const ROOT_HEADING = new THREE.Vector3(-0.3, 1, 0).normalize();
// Where it ends inside the head, in the head's frame.
const TOP_Y = -0.122;
const TOP = new THREE.Vector3(-NECK_STUMP.centre(TOP_Y), TOP_Y, 0);
const TOP_HEADING = new THREE.Vector3(-0.2, 1, 0).normalize();

// share of the way up, half width, half depth behind and in front
const outline = table([
  [0, 0.064, 0.056, 0.056],
  [0.25, 0.062, 0.058, 0.056],
  [0.55, 0.059, 0.059, 0.056],
  [0.8, NECK_STUMP.rz - 0.0005, NECK_STUMP.rf - 0.0005, NECK_STUMP.rf - 0.0005],
  [1, NECK_STUMP.rz - 0.001, NECK_STUMP.rf - 0.001, NECK_STUMP.rf - 0.001],
]);

function relief(t, theta) {
  const a = Math.abs(theta > PI ? theta - 2 * PI : theta);
  const f = PI - a;
  return (
    // trapezius running up into the back of the neck
    0.005 * gauss(a - 0.75, 0.45) * gauss(t - 0.4, 0.2) +
    // the furrow between its two halves
    -0.003 * gauss(a, 0.2) * smoothstep(0.2, 0.7, t) +
    // the strap muscles from behind the ear to the collar bone, the larynx
    0.003 * gauss(f - (1.25 - 0.85 * (1 - t)), 0.22) * gauss(t - 0.45, 0.45) +
    0.0035 * gauss(f, 0.24) * gauss(t - 0.52, 0.16) -
    // the hollow at the base of the throat
    0.004 * gauss(f, 0.3) * gauss(t - 0.08, 0.12)
  );
}

export function buildNeck(material, chest, head) {
  const count = RINGS * SEGMENTS;
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  const index = [];
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * SEGMENTS + j;
      const b = i * SEGMENTS + ((j + 1) % SEGMENTS);
      index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
    }
  }
  geometry.setIndex(index);

  // Each ring's outline in its own plane, worked out once.
  const rim = new Float32Array(count * 2);
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const [rz, back, front] = outline(t);
    for (let j = 0; j < SEGMENTS; j++) {
      const theta = (j / SEGMENTS) * 2 * PI;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const x = c * (c >= 0 ? back : front);
      const z = s * rz;
      const grow = 1 + relief(t, theta) / Math.hypot(x, z);
      rim[(i * SEGMENTS + j) * 2] = x * grow;
      rim[(i * SEGMENTS + j) * 2 + 1] = z * grow;
    }
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "neck";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const toLocal = new THREE.Matrix4();
  const chestMatrix = new THREE.Matrix4();
  const headMatrix = new THREE.Matrix4();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const leave = new THREE.Vector3();
  const arrive = new THREE.Vector3();
  const chestTurn = new THREE.Quaternion();
  const headTurn = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const centre = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  let drawn = "";

  function update() {
    // The chest and head, in the space this mesh is drawn in.
    toLocal.copy(mesh.matrixWorld).invert();
    chestMatrix.multiplyMatrices(toLocal, chest.matrixWorld);
    headMatrix.multiplyMatrices(toLocal, head.matrixWorld);
    const key = chestMatrix.elements.join() + headMatrix.elements.join();
    if (key === drawn) return;
    drawn = key;

    from.copy(ROOT).applyMatrix4(chestMatrix);
    to.copy(TOP).applyMatrix4(headMatrix);
    const reach = from.distanceTo(to);
    leave.copy(ROOT_HEADING).transformDirection(chestMatrix);
    arrive.copy(TOP_HEADING).transformDirection(headMatrix);
    chestMatrix.decompose(scratch, chestTurn, offset);
    headMatrix.decompose(scratch, headTurn, offset);

    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1);
      const t2 = t * t;
      const t3 = t2 * t;
      centre
        .copy(from)
        .multiplyScalar(2 * t3 - 3 * t2 + 1)
        .addScaledVector(leave, (t3 - 2 * t2 + t) * reach)
        .addScaledVector(to, -2 * t3 + 3 * t2)
        .addScaledVector(arrive, (t3 - t2) * reach);
      turn.slerpQuaternions(chestTurn, headTurn, smoothstep(0, 1, t));
      for (let j = 0; j < SEGMENTS; j++) {
        const k = i * SEGMENTS + j;
        offset
          .set(rim[k * 2], 0, rim[k * 2 + 1])
          .applyQuaternion(turn)
          .add(centre);
        positions[k * 3] = offset.x;
        positions[k * 3 + 1] = offset.y;
        positions[k * 3 + 2] = offset.z;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  mesh.onBeforeShadow = update;
  mesh.onBeforeRender = update;
  mesh.userData.update = update;
  update();
  return mesh;
}

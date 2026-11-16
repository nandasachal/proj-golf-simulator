import * as THREE from "three";
import { buildTube, ringOffset } from "./golfer-body-tube";

// The rigid parts of the golfer: hands, shoes, belt, collar and chain. Each
// is built in the frame of the bone (or grip) that carries it. Yards.

const shadowed = (mesh) => {
  mesh.castShadow = true;
  return mesh;
};

// --- hands ---

// A hand closed round the grip, in its own frame: the grip runs along y
// through the origin, the back of the hand faces +z, the thumb lies along
// the -x side pointing down the shaft (-y), and the fingers wrap the other
// way round. The forearm joins at WRIST. This is a lead (left) hand; the
// trail hand is its mirror image in z.
const GRIP_RADIUS = 0.0125;
export const WRIST = new THREE.Vector3(-0.012, 0.078, 0.021);
const FINGERS = [
  { y: -0.033, radius: 0.0092 },
  { y: -0.011, radius: 0.0096 },
  { y: 0.011, radius: 0.0092 },
  { y: 0.033, radius: 0.0082 },
];
const FINGER_FROM = 1.95; // angle round the grip, from +x toward +z
const FINGER_SWEEP = 4.45;

const roundGrip = (radius, angle, y) =>
  new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle));

export function buildHand(material, { glove = null, overlap = false } = {}) {
  const hand = new THREE.Group();
  const add = (geometry, mat = material) => {
    const mesh = shadowed(new THREE.Mesh(geometry, mat));
    hand.add(mesh);
    return mesh;
  };
  const ball = (radius, position, scale = [1, 1, 1], mat = material) => {
    const mesh = add(new THREE.SphereGeometry(radius, 18, 14), mat);
    mesh.position.copy(position);
    mesh.scale.set(...scale);
    return mesh;
  };

  FINGERS.forEach(({ y, radius }, i) => {
    // The trail hand's little finger rides on top of the lead forefinger.
    const riding = overlap && i === 3;
    const reach = GRIP_RADIUS + radius + (riding ? 0.012 : 0.0008);
    const sweep = riding ? 2.3 : FINGER_SWEEP;
    const finger = add(new THREE.TorusGeometry(reach, radius, 10, 30, sweep));
    finger.geometry.rotateX(-Math.PI / 2);
    finger.rotation.y = -FINGER_FROM;
    finger.position.y = y;
    ball(radius, roundGrip(reach, FINGER_FROM - sweep, y));
    // knuckle
    ball(radius * 1.06, roundGrip(reach + 0.001, FINGER_FROM - 0.35, y));
  });

  // back of the hand and palm
  ball(1, new THREE.Vector3(-0.008, 0.026, 0.021), [0.031, 0.056, 0.0185]);
  // heel pad, closing over the top of the grip
  ball(1, new THREE.Vector3(-0.004, 0.05, 0.005), [0.024, 0.027, 0.022]);
  // thumb, down the top of the grip
  const thumbFrom = new THREE.Vector3(-0.02, 0.03, 0.008);
  const thumbTo = new THREE.Vector3(-GRIP_RADIUS - 0.008, -0.04, -0.001);
  const thumb = add(
    new THREE.CapsuleGeometry(0.0088, thumbFrom.distanceTo(thumbTo), 6, 12),
  );
  thumb.position.copy(thumbFrom).lerp(thumbTo, 0.5);
  thumb.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    thumbTo.clone().sub(thumbFrom).normalize(),
  );
  ball(1, new THREE.Vector3(-0.017, 0.036, 0.005), [0.014, 0.03, 0.016]);
  // wrist
  ball(1, WRIST, [0.0245, 0.0245, 0.022]);

  if (glove) {
    // cuff, closing tab and the seams between the fingers
    ball(1, WRIST, [0.0265, 0.019, 0.024]);
    const tab = add(new THREE.BoxGeometry(0.03, 0.02, 0.004), glove.tab);
    tab.position.set(-0.01, 0.052, 0.0385);
    tab.rotation.x = -0.12;
    const patch = add(new THREE.BoxGeometry(0.014, 0.014, 0.003), glove.trim);
    patch.position.set(-0.012, 0.052, 0.0405);
    patch.rotation.x = -0.12;
    for (const y of [-0.022, 0, 0.022]) {
      const stitch = add(
        new THREE.BoxGeometry(0.026, 0.0014, 0.002),
        glove.trim,
      );
      stitch.position.set(-0.004, y + 0.004, 0.0385 - Math.abs(y) * 0.12);
      stitch.rotation.z = 0.12;
    }
  }
  return hand;
}

// --- shoes ---

// A shoe in the foot's frame: origin at the ankle, toe toward -x, sole on
// the ground ANKLE_HEIGHT below.
export const ANKLE_HEIGHT = 0.1;
const SOLE = 0.022;
const HEEL_X = 0.075;
// distance from the heel, height of the upper above the sole, half width
const LAST = [
  [0, 0.03, 0.004],
  [0.004, 0.07, 0.026],
  [0.02, 0.09, 0.038],
  [0.06, 0.094, 0.044],
  [0.1, 0.088, 0.047],
  [0.15, 0.068, 0.052],
  [0.21, 0.048, 0.055],
  [0.255, 0.041, 0.051],
  [0.283, 0.036, 0.043],
  [0.3, 0.029, 0.031],
  [0.309, 0.02, 0.018],
  [0.313, 0.006, 0.003],
];
const SHOE_LENGTH = 0.313;

function topOfShoe(s) {
  for (let i = 1; i < LAST.length; i++) {
    if (s <= LAST[i][0]) {
      const [s0, h0] = LAST[i - 1];
      const [s1, h1] = LAST[i];
      return h0 + ((h1 - h0) * (s - s0)) / (s1 - s0);
    }
  }
  return 0;
}

export function buildShoe({ upper, sole, lace }) {
  const shoe = new THREE.Group();
  // The tubes run heel to toe along their own y, with x up.
  const lay = (geometry, material) => {
    const mesh = shadowed(new THREE.Mesh(geometry, material));
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(HEEL_X, SOLE - ANKLE_HEIGHT, 0);
    shoe.add(mesh);
  };
  lay(
    buildTube(
      LAST.map(([s, top, half]) => ({
        v: 1 - s / SHOE_LENGTH,
        parts: [
          {
            y: s,
            shape: {
              cx: top / 2,
              back: top / 2,
              front: top * 0.62,
              rz: half,
              n: 2.6,
              floor: -0.002,
            },
          },
        ],
      })),
      { segments: 24 },
    ),
    upper,
  );
  const soleRing = (y, half, thick) => ({
    parts: [{ y, shape: { cx: -SOLE / 2, rx: thick, rz: half, n: 5 } }],
  });
  lay(
    buildTube(
      [
        soleRing(-0.004, 0.001, 0.001),
        ...LAST.map(([s, , half]) => soleRing(s, half + 0.005, SOLE / 2)),
        soleRing(SHOE_LENGTH + 0.004, 0.001, 0.001),
      ],
      { segments: 20 },
    ),
    sole,
  );
  [0.092, 0.112, 0.132, 0.152, 0.172].forEach((s, i) => {
    const bar = shadowed(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.0026, 0.0026, 0.046, 6),
        lace,
      ),
    );
    bar.rotation.set(Math.PI / 2, 0, 0);
    bar.rotation.order = "YXZ";
    bar.rotation.y = i % 2 ? 0.3 : -0.3;
    bar.position.set(HEEL_X - s, SOLE - ANKLE_HEIGHT + topOfShoe(s) - 0.001, 0);
    shoe.add(bar);
  });
  return shoe;
}

// --- belt ---

// Round the waist of the trousers, in the pelvis frame.
export const WAIST = { rz: 0.172, back: 0.122, front: 0.119, n: 2.3 };
const BELT_Y = 0.085;

export function buildBelt({ leather, metal, cloth }) {
  const belt = new THREE.Group();
  const grow = (by) => ({
    ...WAIST,
    rz: WAIST.rz + by,
    back: WAIST.back + by,
    front: WAIST.front + by,
  });
  const strap = shadowed(
    new THREE.Mesh(
      buildTube(
        [
          [-0.017, -0.004],
          [-0.015, 0.005],
          [0.015, 0.005],
          [0.017, -0.004],
        ].map(([y, by]) => ({ parts: [{ y: BELT_Y + y, shape: grow(by) }] })),
        { segments: 40 },
      ),
      leather,
    ),
  );
  belt.add(strap);

  const front = -WAIST.front - 0.005;
  const frame = shadowed(
    new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.042, 0.05), metal),
  );
  frame.position.set(front - 0.003, BELT_Y, 0.004);
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(0.007, 0.028, 0.034),
    leather,
  );
  window.position.set(front - 0.0035, BELT_Y, 0.004);
  const prong = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.005, 0.04),
    metal,
  );
  prong.position.set(front - 0.006, BELT_Y, 0.004);
  belt.add(frame, window, prong);

  for (const angle of [Math.PI - 0.75, Math.PI + 0.75, 1.15, -1.15, 0]) {
    const [x, z] = ringOffset(grow(0.006), angle);
    const loop = shadowed(
      new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.046, 0.014), cloth),
    );
    loop.position.set(x, BELT_Y, z);
    loop.rotation.y = -angle;
    belt.add(loop);
  }
  return belt;
}

// --- collar and chain ---

// Both sit on the chest bone, whose origin is the middle of the shoulders.
const smoothstep = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

export function buildCollar(material) {
  const fold = { y: 0.097, rz: 0.064, back: 0.062, front: 0.06 };
  // How far round from the open front of the neck (0 at the middle).
  const fromFront = (theta) => Math.abs(theta - Math.PI);
  const leaf = (y, rz, back, front) => ({
    parts: [{ y, shape: { rz, back, front, n: 2.2 } }],
    // The leaf closes up to nothing at the front and runs to a point
    // either side of the opening.
    lift: (theta) => {
      const open = 1 - smoothstep(0.16, 0.5, fromFront(theta));
      const point = Math.exp(-(((fromFront(theta) - 0.62) / 0.2) ** 2));
      return open * (fold.y - y) - point * 0.3 * (fold.y - y);
    },
    scale: (theta) => {
      const open = 1 - smoothstep(0.16, 0.5, fromFront(theta));
      return 1 - open * (1 - fold.front / front);
    },
  });
  return shadowed(
    new THREE.Mesh(
      buildTube(
        [
          { parts: [{ y: 0.078, shape: { rz: 0.06, rx: 0.058 } }] },
          { parts: [{ y: 0.094, shape: { rz: 0.061, rx: 0.059 } }] },
          { parts: [{ y: fold.y, shape: fold }] },
          leaf(0.08, 0.08, 0.074, 0.072),
          leaf(0.055, 0.1, 0.086, 0.086),
        ],
        { segments: 48 },
      ),
      material,
    ),
  );
}

export function buildChain(material) {
  const path = new THREE.CatmullRomCurve3(
    [
      [0.046, 0.082, 0],
      [0.02, 0.082, 0.045],
      [-0.03, 0.078, 0.047],
      [-0.057, 0.064, 0.033],
      [-0.071, 0.044, 0.02],
      [-0.0855, 0.024, 0],
      [-0.071, 0.044, -0.02],
      [-0.057, 0.064, -0.033],
      [-0.03, 0.078, -0.047],
      [0.02, 0.082, -0.045],
    ].map((p) => new THREE.Vector3(...p)),
    true,
  );
  return shadowed(
    new THREE.Mesh(new THREE.TubeGeometry(path, 96, 0.0021, 6, true), material),
  );
}

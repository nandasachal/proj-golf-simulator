import * as THREE from "three";
import {
  buildTube,
  buildLoft,
  ringOffset,
  smoothstep,
  gauss,
  table,
} from "./golfer-body-tube";

// The rigid parts of the golfer: hands, shoes, belt, collar and chain. Each
// is built in the frame of the bone (or grip) that carries it. Yards.

const shadowed = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// --- hands ---

// A hand closed round the grip, in its own frame: the grip runs along y
// through the origin, the back of the hand faces +z, the thumb lies along
// the -x side pointing down the shaft (-y), and the fingers wrap the other
// way round. The forearm joins at WRIST. This is a lead (left) hand; the
// trail hand is its mirror image in z.
//
// The club lies across the hand on a slant, from the heel pad to the crook of
// the forefinger, so the knuckles are not in a row along the grip: the little
// finger's sits on it and the forefinger's stands well off, toward the thumb.
const GRIP_RADIUS = 0.0125;
export const WRIST = new THREE.Vector3(-0.012, 0.078, 0.021);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// knuckle, where along the grip the finger lies, its radius, and the angle
// round the grip (from +x toward +z) its tip reaches
const FINGERS = [
  { knuckle: V(-0.026, -0.026, 0.027), y: -0.04, radius: 0.0094, end: -2.65 },
  { knuckle: V(-0.016, -0.006, 0.03), y: -0.017, radius: 0.0098, end: -2.75 },
  { knuckle: V(-0.006, 0.014, 0.029), y: 0.006, radius: 0.0093, end: -2.65 },
  { knuckle: V(0.003, 0.032, 0.025), y: 0.028, radius: 0.0082, end: -2.45 },
];
const WRAP_FROM = 1.2;

const Y_UP = V(0, 1, 0);
const Z_UP = V(0, 0, 1);

// A round tube along a path, `radius(t)` thick at each share t of its length.
function sweep(path, radius, { rings = 26, segments = 12, up = Y_UP } = {}) {
  const curve = new THREE.CatmullRomCurve3(path, false, "centripetal");
  const frames = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const tangent = curve.getTangentAt(t);
    const side = up.clone().cross(tangent).normalize();
    frames.push({
      centre: curve.getPointAt(t),
      side,
      over: tangent.clone().cross(side),
      radius: radius(t),
    });
  }
  return buildLoft(rings, segments, (i, j, out) => {
    const { centre, side, over, radius: r } = frames[i];
    const phi = (j / segments) * Math.PI * 2;
    out
      .copy(centre)
      .addScaledVector(side, r * Math.cos(phi))
      .addScaledVector(over, r * Math.sin(phi));
  });
}

// Rounded off over the last `share` of the length.
const tip = (t, share) =>
  t < 1 - share
    ? 1
    : Math.sqrt(Math.max(0.02, 1 - ((t - 1 + share) / share) ** 2));

function buildFinger({ knuckle, y, radius, end }, riding) {
  // The trail hand's little finger rides on top of the lead forefinger.
  const reach = GRIP_RADIUS + radius + (riding ? 0.012 : 0.0008);
  const to = riding ? -0.4 : end;
  const path = [knuckle];
  const count = Math.ceil((WRAP_FROM - to) / 0.35);
  for (let i = 0; i <= count; i++) {
    const angle = WRAP_FROM + ((to - WRAP_FROM) * i) / count;
    const settled = smoothstep(0, 0.9, WRAP_FROM - angle);
    path.push(
      V(
        reach * Math.cos(angle),
        knuckle.y + (y - knuckle.y) * (0.45 + 0.55 * settled),
        reach * Math.sin(angle),
      ),
    );
  }
  return sweep(
    path,
    (t) =>
      radius *
      (1.08 -
        0.14 * t +
        0.08 * gauss(t - 0.4, 0.05) +
        0.07 * gauss(t - 0.72, 0.045)) *
      tip(t, 0.08),
  );
}

// The slab of the hand - the back, the palm under it - lofted from the wrist
// to the row of knuckles.
function buildPalm() {
  const first = FINGERS[0].knuckle;
  const last = FINGERS[3].knuckle;
  const wristThumbSide = WRIST.clone().add(V(-0.024, 0.004, -0.002));
  const wristFarSide = WRIST.clone().add(V(0.022, -0.008, -0.002));
  const rowThumbSide = first.clone().add(V(-0.007, -0.012, -0.011));
  const rowFarSide = last.clone().add(V(0.006, 0.011, -0.009));
  const rings = 12;
  const a = V(0, 0, 0);
  const b = V(0, 0, 0);
  const centre = V(0, 0, 0);
  return buildLoft(rings, 20, (i, j, out) => {
    const v = Math.min(1, Math.max(0, (i - 1) / (rings - 3)));
    const closed = i === 0 || i === rings - 1 ? 0.3 : 1;
    a.lerpVectors(wristThumbSide, rowThumbSide, v);
    b.lerpVectors(wristFarSide, rowFarSide, v);
    centre.addVectors(a, b).multiplyScalar(0.5);
    centre.z += 0.004 * Math.sin(Math.PI * v);
    centre.y += i === 0 ? 0.004 : 0;
    const thick = (0.013 - 0.003 * v) * closed;
    const phi = (j / 20) * Math.PI * 2;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const across = Math.sign(c) * Math.abs(c) ** 0.7 * closed;
    out
      .copy(centre)
      .addScaledVector(b.sub(centre), across)
      .add(
        Z_UP.clone().multiplyScalar(Math.sign(s) * Math.abs(s) ** 0.7 * thick),
      );
  });
}

function buildThumb() {
  return sweep(
    [
      V(-0.02, 0.064, 0.013),
      V(-0.034, 0.032, 0.009),
      V(-0.032, -0.004, 0.004),
      V(-GRIP_RADIUS - 0.0115, -0.034, 0.0005),
      V(-GRIP_RADIUS - 0.0098, -0.058, -0.001),
    ],
    (t) =>
      (0.0155 -
        0.0045 * smoothstep(0.05, 0.45, t) -
        0.0018 * smoothstep(0.5, 1, t)) *
      (1 + 0.07 * gauss(t - 0.43, 0.05) + 0.06 * gauss(t - 0.74, 0.045)) *
      tip(t, 0.07) *
      (t < 0.06 ? 0.5 + t / 0.12 : 1),
    { up: Z_UP, segments: 14 },
  );
}

export function buildHand(
  material,
  { glove = null, overlap = false, nail = material } = {},
) {
  const hand = new THREE.Group();
  const add = (geometry, mat = material) => {
    const mesh = shadowed(new THREE.Mesh(geometry, mat));
    hand.add(mesh);
    return mesh;
  };
  const ball = (position, scale, mat = material) => {
    const mesh = add(new THREE.SphereGeometry(1, 18, 14), mat);
    mesh.position.copy(position);
    mesh.scale.set(...scale);
    return mesh;
  };

  FINGERS.forEach((finger, i) => {
    add(buildFinger(finger, overlap && i === 3));
    const r = finger.radius;
    ball(finger.knuckle, [r * 1.3, r * 1.18, r * 1.05]);
    if (!glove && !(overlap && i === 3)) {
      // fingernail, on the outside of the last joint
      const angle = finger.end + 0.3;
      const out = GRIP_RADIUS + r * 1.78;
      const fingerNail = ball(
        V(out * Math.cos(angle), finger.y, out * Math.sin(angle)),
        [0.0016, r * 0.6, r * 0.66],
        nail,
      );
      fingerNail.rotation.y = -angle;
    }
  });
  add(buildPalm());
  add(buildThumb());
  // heel pad, closing over the top of the grip
  ball(V(-0.006, 0.05, 0.006), [0.023, 0.027, 0.02]);
  // wrist
  ball(WRIST, [0.0255, 0.0245, 0.0225]);

  if (glove) {
    // cuff and closing tab
    ball(WRIST, [0.0275, 0.019, 0.0245]);
    const tab = add(new THREE.BoxGeometry(0.03, 0.02, 0.004), glove.tab);
    tab.position.set(-0.013, 0.05, 0.0365);
    tab.rotation.x = -0.1;
    const patch = add(new THREE.BoxGeometry(0.014, 0.014, 0.003), glove.trim);
    patch.position.set(-0.015, 0.05, 0.0385);
    patch.rotation.x = -0.1;
  } else {
    const thumbNail = ball(
      V(-GRIP_RADIUS - 0.0182, -0.05, -0.001),
      [0.0022, 0.0075, 0.0062],
      nail,
    );
    thumbNail.rotation.z = -0.05;
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

const lastAt = table(LAST);

// The sole turns up toward the toe, as a shoe's does so it can roll.
const toeSpring = (s) => 0.014 * smoothstep(0.19, SHOE_LENGTH, s) ** 1.5;

// How far from the heel the shoe breaks, and over what length it bends.
const BALL = 0.24;
const BEND = 0.035;

// With `bend` - { binds, foot, toe } - the upper and sole are skinned to the
// foot and toe bones instead of being fixed to the foot: they come back as
// shoe.userData.skins ([geometry, material] pairs, in the skeleton's space)
// and the spikes under the toes as shoe.userData.toes, for the toe bone.
export function buildShoe({ upper, sole, lace, tread = sole }, bend = null) {
  const shoe = new THREE.Group();
  const toes = new THREE.Group();
  const skins = [];
  shoe.userData.toes = toes;
  shoe.userData.skins = skins;
  // The tubes run heel to toe along their own y, with x up.
  const placing = new THREE.Matrix4()
    .makeRotationZ(Math.PI / 2)
    .setPosition(HEEL_X, SOLE - ANKLE_HEIGHT, 0);
  const lay = (geometry, material) => {
    if (!bend) {
      const mesh = shadowed(new THREE.Mesh(geometry, material));
      mesh.applyMatrix4(placing);
      shoe.add(mesh);
      return;
    }
    const { count } = geometry.attributes.position;
    const index = new Uint16Array(count * 4);
    const weight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const w = smoothstep(
        BALL - BEND,
        BALL + BEND,
        geometry.attributes.position.getY(i),
      );
      index.set([bend.foot, bend.toe], i * 4);
      weight.set([1 - w, w], i * 4);
    }
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
    geometry.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(bend.binds[bend.foot], placing),
    );
    skins.push([geometry, material]);
  };
  const fine = [];
  for (let s = 0; s <= SHOE_LENGTH; s += SHOE_LENGTH / 28) fine.push(s);
  lay(
    buildTube(
      fine.map((s) => {
        const [top, half] = lastAt(s);
        return {
          v: 1 - s / SHOE_LENGTH,
          parts: [
            {
              y: s,
              shape: {
                cx: top / 2 + toeSpring(s),
                back: top / 2,
                front: top * 0.62,
                rz: half,
                n: 2.5,
                floor: -0.002 + toeSpring(s),
                // the heel counter and the bulge of the toes
                push: (theta) =>
                  0.002 * gauss(s - 0.235, 0.05) * Math.cos(theta) ** 2 -
                  0.003 * gauss(s - 0.13, 0.04) * Math.abs(Math.sin(theta)),
              },
            },
          ],
        };
      }),
      { segments: 28 },
    ),
    upper,
  );
  // welted sole, with a heel, then the dark tread under it
  const slab = (grow, thick, drop) => (s) => {
    const [, half] = lastAt(Math.min(SHOE_LENGTH, Math.max(0, s)));
    const edge = s < 0 || s > SHOE_LENGTH ? 0.02 : 1;
    const heel = 0.004 * (1 - smoothstep(0.085, 0.1, s));
    return {
      parts: [
        {
          y: s,
          shape: {
            cx: -SOLE / 2 - drop - heel / 2 + toeSpring(s),
            rx: (thick + heel / 2) * edge,
            rz: (half + grow) * edge,
            n: 5,
          },
        },
      ],
    };
  };
  const along = [-0.005, ...fine, SHOE_LENGTH + 0.005];
  lay(
    buildTube(along.map(slab(0.006, SOLE / 2 - 0.003, -0.003)), {
      segments: 20,
    }),
    sole,
  );
  lay(
    buildTube(along.map(slab(0.003, 0.004, SOLE / 2 - 0.002)), {
      segments: 20,
    }),
    tread,
  );
  // soft spikes
  for (const [s, z] of [
    [0.03, 0.017],
    [0.03, -0.017],
    [0.07, 0],
    [0.19, 0.03],
    [0.19, -0.03],
    [0.235, 0],
    [0.27, 0.022],
    [0.27, -0.022],
  ]) {
    const spike = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.0065, 0.006, 8),
      tread,
    );
    spike.position.set(HEEL_X - s, -ANKLE_HEIGHT + 0.002 + toeSpring(s), z);
    if (bend && s > BALL) {
      spike.applyMatrix4(
        new THREE.Matrix4()
          .copy(bend.binds[bend.toe])
          .invert()
          .multiply(bend.binds[bend.foot]),
      );
      toes.add(spike);
    } else shoe.add(spike);
  }
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
    bar.position.set(HEEL_X - s, SOLE - ANKLE_HEIGHT + lastAt(s)[0] - 0.001, 0);
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
export function buildCollar(material) {
  const cx = -0.02;
  const fold = { y: 0.1, rz: 0.072, back: 0.067, front: 0.066, cx };
  // How far round from the open front of the neck (0 at the middle).
  const fromFront = (theta) => Math.abs(theta - Math.PI);
  // The stand is tallest at the back of the neck.
  const rise = (theta) => -0.01 * smoothstep(1.9, 0.4, fromFront(theta));
  const stand = (y, rz, back, front) => ({
    parts: [{ y, shape: { rz, back, front, cx } }],
    lift: rise,
  });
  const leaf = (y, rz, back, front) => ({
    parts: [{ y, shape: { rz, back, front, cx, n: 2.2 } }],
    // The leaf closes up to nothing at the front and runs to a point
    // either side of the opening.
    lift: (theta) => {
      const open = 1 - smoothstep(0.16, 0.5, fromFront(theta));
      const point = Math.exp(-(((fromFront(theta) - 0.62) / 0.2) ** 2));
      return (
        rise(theta) * (1 - open) +
        open * (fold.y + rise(theta) - y) -
        point * 0.3 * (fold.y - y)
      );
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
          stand(0.07, 0.073, 0.066, 0.066),
          stand(0.094, 0.069, 0.064, 0.063),
          { parts: [{ y: fold.y, shape: fold }], lift: rise },
          leaf(0.09, 0.084, 0.078, 0.076),
          leaf(0.076, 0.094, 0.09, 0.084),
          leaf(0.06, 0.103, 0.1, 0.092),
        ],
        { segments: 56 },
      ),
      material,
    ),
  );
}

export function buildChain(material) {
  const path = new THREE.CatmullRomCurve3(
    [
      [0.047, 0.09, 0],
      [0.028, 0.088, 0.066],
      [-0.034, 0.084, 0.068],
      [-0.07, 0.064, 0.036],
      [-0.079, 0.044, 0.02],
      [-0.0885, 0.024, 0],
      [-0.079, 0.044, -0.02],
      [-0.07, 0.064, -0.036],
      [-0.034, 0.084, -0.068],
      [0.028, 0.088, -0.066],
    ].map((p) => new THREE.Vector3(...p)),
    true,
  );
  return shadowed(
    new THREE.Mesh(new THREE.TubeGeometry(path, 96, 0.0021, 6, true), material),
  );
}

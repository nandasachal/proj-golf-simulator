import {
  buildTube,
  ringOffset,
  smoothstep,
  gauss,
  band,
  table,
} from "./golfer-body-tube";
import { WAIST } from "./golfer-body-kit";

// The golfer's skinned surfaces - polo, bare arms, trousers - as tubes of
// rings hung on the bones golfer.js poses. Every bone's frame looks the same
// way at rest: +x the golfer's back, +y up toward the body, +z the lead side.
// Lengths are yards.

export const BONE = {
  pelvis: 0,
  spine: 1,
  chest: 2,
  leadUpperArm: 3,
  leadForearm: 4,
  trailUpperArm: 5,
  trailForearm: 6,
  leadThigh: 7,
  leadShin: 8,
  leadFoot: 9,
  trailThigh: 10,
  trailShin: 11,
  trailFoot: 12,
  // collar bones, from the breastbone out to each shoulder joint
  leadClavicle: 13,
  trailClavicle: 14,
  // the front of each foot, from the ball forward
  leadToe: 15,
  trailToe: 16,
};
export const BONE_COUNT = 17;

export const UPPER_ARM = 0.33;
export const FOREARM = 0.3;
export const THIGH = 0.455;
export const SHIN = 0.445;
// Where the legs and arms join the pelvis and chest, in those bones' frames
// (z is for the lead side).
export const HIP_JOINT = { y: -0.06, z: 0.105 };
export const SHOULDER_JOINT = { y: -0.04, z: 0.192 };
// The breastbone end of a collar bone, in the chest's frame: the clavicle
// bones sit there, in the chest's own frame while the shoulder is at rest,
// and swing about it as the shoulder joint is raised or drawn forward.
export const CLAVICLE_JOINT = { x: -0.06, y: 0.01, z: 0.02 };
// Where a foot breaks, at the ball, in the foot bone's frame (origin at the
// ankle, toes toward -x): the toe bones sit there, in the foot's own frame
// while the foot is flat.
export const TOE_JOINT = { x: -0.165, y: -0.085 };
// How far up the spine (from the hips) the middle spine bone sits.
export const SPINE_JOINT = 0.19;

const PI = Math.PI;
// Angle round a ring from the middle of the back (0) to the middle of the
// front (PI), the same on both sides.
const fromBack = (theta) => Math.abs(theta > PI ? theta - 2 * PI : theta);
// Rows packed where the surface turns quickest: [from, to, count] spans, each
// starting where the last ended.
function spans(...list) {
  const out = [];
  for (const [a, b, count] of list) {
    for (let i = out.length ? 1 : 0; i < count; i++) {
      out.push(a + ((b - a) * i) / (count - 1));
    }
  }
  return out;
}

// --- polo ---

const SHIRT_FROM = 0.06;
// How far above the middle of the shoulders the shirt runs up the neck.
export const SHIRT_NECK = 0.092;

// The trunk under the shirt: height up the spine (the shoulder end measured
// from the chest bone, so the trunk stretches with the spine), half width,
// half depth behind and in front, boxiness, and how far the middle of the
// ring sits behind the line of the spine - the small of the back is hollow,
// the upper back round, and the neck leaves it leaning forward.
const trunk = (L) =>
  table([
    [0.06, 0.16, 0.112, 0.108, 2.3, 0],
    [0.085, 0.166, 0.116, 0.112, 2.3, 0],
    [0.104, 0.187, 0.135, 0.133, 2.3, -0.002],
    [0.135, 0.187, 0.133, 0.134, 2.3, -0.005],
    [0.175, 0.178, 0.123, 0.13, 2.3, -0.009],
    [0.225, 0.171, 0.114, 0.126, 2.3, -0.011],
    [0.3, 0.178, 0.118, 0.127, 2.4, -0.008],
    [0.38, 0.191, 0.127, 0.132, 2.4, -0.001],
    [L - 0.16, 0.204, 0.135, 0.139, 2.4, 0.005],
    [L - 0.1, 0.212, 0.138, 0.139, 2.4, 0.007],
    [L - 0.06, 0.215, 0.133, 0.128, 2.3, 0.006],
    [L - 0.03, 0.213, 0.121, 0.111, 2.2, 0.004],
    [L - 0.005, 0.201, 0.106, 0.094, 2.1, 0.001],
    [L + 0.02, 0.166, 0.093, 0.08, 2.0, -0.003],
    [L + 0.045, 0.119, 0.081, 0.069, 2.0, -0.007],
    [L + 0.065, 0.088, 0.072, 0.064, 2.0, -0.012],
    [L + 0.08, 0.074, 0.066, 0.062, 2.0, -0.017],
    [L + SHIRT_NECK, 0.069, 0.064, 0.06, 2.0, -0.02],
  ]);

// What stands proud of that outline: the muscle the knit lies over, and the
// knit itself gathering where it is tucked into the belt.
function trunkRelief(h, L, theta) {
  const a = fromBack(theta);
  const f = PI - a;
  let d = 0;
  // spine furrow, and the long muscles either side of it
  d -= 0.0045 * gauss(a, 0.17) * band(0.16, L - 0.07, 0.05, h);
  d += 0.003 * gauss(a - 0.34, 0.2) * band(0.1, 0.34, 0.06, h);
  // shoulder blades
  d += 0.007 * gauss(a - 0.78, 0.36) * gauss(h - (L - 0.115), 0.075);
  // chest, and the breastbone between
  d += 0.008 * gauss(f - 0.55, 0.42) * gauss(h - (L - 0.135), 0.06);
  d -= 0.003 * gauss(f, 0.12) * gauss(h - (L - 0.13), 0.06);
  // collar bones, under the placket
  d += 0.003 * gauss(f - 0.5, 0.5) * gauss(h - (L + 0.012), 0.014);
  // gathers above the belt, deepest at the sides and the small of the back
  const gather = band(0.103, 0.17, 0.04, h) * (0.55 + 0.45 * Math.sin(a) ** 2);
  d +=
    gather *
    (0.0042 * Math.sin(theta * 9 + 2.4 * Math.sin(h * 31 + 1)) +
      0.0022 * Math.sin(theta * 17 - h * 60));
  // slack hanging off the chest and shoulder blades
  d +=
    0.0022 *
    band(0.2, L - 0.2, 0.06, h) *
    Math.sin(theta * 5 + 6 * h) *
    Math.sin(a * 0.5) ** 2;
  return d;
}

export function buildTorso(binds, spineLength) {
  const L = spineLength;
  const top = L + SHIRT_NECK;
  const at = trunk(L);
  const heights = spans(
    [SHIRT_FROM, 0.1, 4],
    [0.1, 0.24, 14],
    [0.24, L - 0.14, 10],
    [L - 0.14, L - 0.02, 12],
    [L - 0.02, top, 16],
  );
  return buildTube(
    heights.map((h) => {
      const [rz, back, front, n, cx] = at(h);
      const shape = {
        rz,
        back,
        front,
        n,
        cx,
        push: (theta) => trunkRelief(h, L, theta),
      };
      const pelvis = 1 - smoothstep(0.06, 0.3, h);
      const chest = smoothstep(0.2, L - 0.16, h);
      // The shoulders ride on the collar bones: the further out from the
      // neck, the more they go where the shoulder joint goes.
      const girdle = smoothstep(L - 0.19, L - 0.07, h);
      return {
        v: (h - SHIRT_FROM) / (top - SHIRT_FROM),
        also:
          girdle > 0 && pelvis === 0
            ? (theta) => {
                const z = ringOffset(shape, theta)[1];
                return [
                  {
                    bone: z > 0 ? BONE.leadClavicle : BONE.trailClavicle,
                    weight: 0.9 * girdle * smoothstep(0.07, 0.2, Math.abs(z)),
                  },
                ];
              }
            : undefined,
        parts: [
          { bone: BONE.pelvis, weight: pelvis, y: h, shape },
          {
            bone: BONE.spine,
            weight: 1 - pelvis - chest,
            y: h - SPINE_JOINT,
            shape,
          },
          { bone: BONE.chest, weight: chest, y: h - L, shape },
        ],
      };
    }),
    { segments: 72, binds },
  );
}

// A short sleeve over the deltoid. Its top is capped and turned in under the
// shoulder of the shirt, as a real one is at its seam; the hem stands a
// little off the arm and hangs lower on the inside.
// y along the arm from the shoulder, half depth behind and in front, half
// width, and how far the middle sits outside the bone.
const SLEEVE_HEM = -0.19;
const sleeve = table([
  [0.05, 0.006, 0.006, 0.006, -0.012],
  [0.04, 0.026, 0.025, 0.025, -0.012],
  [0.026, 0.042, 0.041, 0.04, -0.008],
  [0.006, 0.058, 0.056, 0.053, -0.002],
  [-0.03, 0.067, 0.063, 0.06, 0.004],
  [-0.08, 0.066, 0.063, 0.059, 0.004],
  [-0.13, 0.064, 0.062, 0.058, 0.002],
  [-0.172, 0.063, 0.062, 0.058, 0],
  [SLEEVE_HEM, 0.065, 0.064, 0.06, 0],
]);

export function buildSleeve(binds, bone, mirror, clavicle) {
  const ys = spans(
    [0.05, 0.006, 6],
    [0.006, -0.15, 12],
    [-0.15, SLEEVE_HEM, 6],
  );
  // How far round toward the body a point of the ring is: 1 in the armpit.
  const inner = (theta) => 0.5 - 0.5 * Math.sin(theta);
  const rings = ys.map((y) => {
    const [back, front, rz, cz] = sleeve(y);
    return {
      v: (y - SLEEVE_HEM) / (0.05 - SLEEVE_HEM),
      // The cap of the sleeve belongs to the shoulder, not the arm: it stays
      // with the collar bone, most of all on top and toward the body, so
      // the arm lifts out of it instead of carrying a lump up with it.
      also:
        clavicle === undefined
          ? undefined
          : (theta) => {
              const cap = smoothstep(-0.035, 0.035, y);
              return [
                {
                  bone: clavicle,
                  weight:
                    cap * (0.55 + 0.4 * inner(theta)) +
                    (1 - cap) *
                      0.22 *
                      inner(theta) *
                      smoothstep(-0.1, -0.03, y),
                },
              ];
            },
      lift: (theta) => -0.016 * inner(theta) * smoothstep(-0.1, SLEEVE_HEM, y),
      parts: [
        {
          bone,
          y,
          shape: {
            back,
            front,
            rz,
            cz,
            n: 2.1,
            push: (theta) =>
              // the three heads of the deltoid
              0.005 *
                gauss(y + 0.045, 0.06) *
                (gauss(theta - PI / 2, 0.5) +
                  0.6 * gauss(fromBack(theta) - 0.5, 0.4) * (1 - inner(theta)) +
                  0.6 *
                    gauss(PI - fromBack(theta) - 0.5, 0.4) *
                    (1 - inner(theta))) +
              // creases running out of the armpit
              0.003 *
                inner(theta) *
                band(-0.17, -0.02, 0.03, y) *
                Math.sin(y * 150 + 3 * Math.cos(theta)),
          },
        },
      ],
    };
  });
  // the hem, turned back in to the arm
  const [back, front, rz] = sleeve(SLEEVE_HEM);
  rings.push({
    v: 0,
    lift: (theta) => -0.016 * inner(theta),
    parts: [
      {
        bone,
        y: SLEEVE_HEM + 0.004,
        shape: { back: back - 0.012, front: front - 0.012, rz: rz - 0.011 },
      },
    ],
  });
  return buildTube(rings, { segments: 32, binds, mirror });
}

// --- arms ---

// Distance down the arm - the upper arm as a share of its bone, then the
// forearm as a share of its own - half depth behind (triceps, the point of
// the elbow) and in front (biceps), half width.
const arm = table(
  [
    [0.4, 0.044, 0.044, 0.044],
    [0.52, 0.052, 0.053, 0.051],
    [0.66, 0.05, 0.053, 0.049],
    [0.84, 0.044, 0.045, 0.044],
    [0.95, 0.042, 0.039, 0.043],
    [1, 0.043, 0.037, 0.045],
    [1.1, 0.041, 0.04, 0.047],
    [1.24, 0.04, 0.043, 0.047],
    [1.43, 0.037, 0.04, 0.042],
    [1.63, 0.032, 0.034, 0.035],
    [1.82, 0.0285, 0.027, 0.029],
    [1.95, 0.0275, 0.0225, 0.0245],
    [2, 0.0265, 0.0215, 0.024],
    [2.03, 0.02, 0.016, 0.018],
    [2.045, 0.004, 0.004, 0.004],
  ].map(([s, ...row]) => [
    s <= 1 ? s * UPPER_ARM : UPPER_ARM + (s - 1) * FOREARM,
    ...row,
  ]),
);

// Rings along a two-bone limb, `s` down from the first bone's origin: near
// the joint a ring belongs to both bones.
function limbParts(upper, lower, length, s, shape, blend = 0.055) {
  const w = smoothstep(length - blend, length + blend, s);
  return [
    { bone: upper, weight: 1 - w, y: -s, shape },
    { bone: lower, weight: w, y: length - s, shape },
  ];
}

export function buildArm(binds, upper, lower, mirror) {
  const wrist = UPPER_ARM + FOREARM;
  const ss = spans(
    [0.4 * UPPER_ARM, UPPER_ARM - 0.05, 9],
    [UPPER_ARM - 0.05, UPPER_ARM + 0.06, 12],
    [UPPER_ARM + 0.06, wrist - 0.03, 12],
    [wrist - 0.03, wrist + 0.045 * FOREARM, 8],
  );
  return buildTube(
    ss.map((s) => {
      const [back, front, rz] = arm(s);
      const shape = {
        back,
        front,
        rz,
        n: 2.05,
        push: (theta) => {
          const a = fromBack(theta);
          const f = PI - a;
          return (
            // point of the elbow, and the crease inside it
            0.0045 * gauss(a, 0.5) * gauss(s - UPPER_ARM - 0.004, 0.02) -
            0.003 * gauss(f, 0.6) * gauss(s - UPPER_ARM, 0.014) +
            // biceps standing off the bone
            0.003 * gauss(f, 0.7) * gauss(s - 0.66 * UPPER_ARM, 0.05) +
            // the two cords of the wrist, and the knob of the ulna
            0.0013 *
              (gauss(f - 0.28, 0.13) + gauss(f + 0.28, 0.13)) *
              band(wrist - 0.4 * FOREARM, wrist - 0.02, 0.03, s) +
            0.003 * gauss(a - 0.9, 0.35) * gauss(s - wrist + 0.018, 0.012)
          );
        },
      };
      return { parts: limbParts(upper, lower, UPPER_ARM, s, shape) };
    }),
    { segments: 28, binds, mirror },
  );
}

// --- trousers ---

// One leg, from the waistband to the hem. Above the crotch it is half of the
// hips (flat against the other half down the middle); below, the leg. `d` is
// the distance below the hip joint.
const WAIST_D = -0.165;
const HEM_D = THIGH + 0.985 * SHIN;
// d, half width, half depth behind and in front - the hips, round both legs
const hipsAt = table([
  [WAIST_D, WAIST.rz, WAIST.back, WAIST.front],
  [-0.13, 0.176, 0.128, 0.119],
  [-0.08, 0.185, 0.137, 0.118],
  [-0.03, 0.193, 0.143, 0.116],
  [0.02, 0.2, 0.144, 0.113],
  [0.06, 0.203, 0.139, 0.11],
  [0.1, 0.206, 0.128, 0.106],
  [0.14, 0.208, 0.12, 0.105],
]);
// d, half width, half depth behind and in front - one leg
const legAt = table([
  [-0.03, 0.104, 0.104, 0.102],
  [0.06, 0.106, 0.106, 0.103],
  [0.1, 0.107, 0.105, 0.104],
  [0.14, 0.107, 0.104, 0.106],
  [0.22, 0.104, 0.101, 0.107],
  [0.32, 0.097, 0.094, 0.101],
  [0.4, 0.09, 0.086, 0.093],
  [THIGH, 0.084, 0.08, 0.088],
  [THIGH + 0.05, 0.081, 0.081, 0.083],
  [THIGH + 0.25 * SHIN, 0.079, 0.086, 0.076],
  [THIGH + 0.43 * SHIN, 0.077, 0.083, 0.073],
  [THIGH + 0.63 * SHIN, 0.075, 0.077, 0.072],
  [THIGH + 0.81 * SHIN, 0.074, 0.075, 0.073],
  [THIGH + 0.94 * SHIN, 0.074, 0.075, 0.076],
  [HEM_D, 0.075, 0.076, 0.078],
]);

// What the cloth does over that: the seat, the knee, and the hem breaking
// over the shoe.
function legRelief(d, theta) {
  const a = fromBack(theta);
  const f = PI - a;
  const knee = THIGH;
  return (
    // seat, and the fold under it
    0.004 * gauss(a - 0.55, 0.5) * gauss(d - 0.02, 0.07) -
    0.004 * gauss(a - 0.45, 0.55) * gauss(d - 0.125, 0.022) +
    // kneecap in front, the crease behind
    0.004 * gauss(f, 0.55) * gauss(d - knee + 0.005, 0.03) -
    0.005 * gauss(a, 0.7) * gauss(d - knee - 0.012, 0.02) +
    // calf
    0.003 * gauss(a, 0.6) * gauss(d - knee - 0.27 * SHIN, 0.06) +
    // the break: cloth stacked up on the instep, slack round the ankle
    0.007 * gauss(f, 1.0) * gauss(d - (HEM_D - 0.058), 0.02) -
    0.005 * gauss(f, 0.9) * gauss(d - (HEM_D - 0.03), 0.012) +
    0.0025 *
      band(HEM_D - 0.16, HEM_D - 0.01, 0.03, d) *
      Math.sin(d * 120 + 2.2 * Math.cos(theta - 0.6))
  );
}

export function buildTrouserLeg(binds, { thigh, shin }, mirror) {
  const v = (d) => 1 - (d - WAIST_D) / (HEM_D - WAIST_D);
  const rings = [
    // turned in under the shirt, then the waistband
    {
      v: 1,
      parts: [
        {
          bone: BONE.pelvis,
          y: HIP_JOINT.y - WAIST_D,
          shape: { rz: 0.15, rx: 0.1, n: WAIST.n, half: true },
        },
      ],
    },
  ];
  for (const d of spans([WAIST_D, -0.02, 8], [-0.02, 0.14, 12])) {
    const m = smoothstep(-0.02, 0.14, d);
    const [rz, back, front] = hipsAt(d);
    const push = (theta) => legRelief(d, theta);
    const parts = [
      {
        bone: BONE.pelvis,
        weight: 1 - m,
        y: HIP_JOINT.y - d,
        shape: { rz, back, front, n: WAIST.n, half: true, push },
      },
    ];
    if (m > 0) {
      const [legZ, legBack, legFront] = legAt(d);
      parts.push({
        bone: thigh,
        weight: m,
        y: -d,
        shape: { rz: legZ, back: legBack, front: legFront, push },
      });
    }
    rings.push({ v: v(d), parts });
  }
  const below = spans(
    [0.14, THIGH - 0.07, 9],
    [THIGH - 0.07, THIGH + 0.08, 12],
    [THIGH + 0.08, HEM_D - 0.14, 8],
    [HEM_D - 0.14, HEM_D, 16],
  );
  // The hem hangs lower over the heel than over the laces.
  const drop = (d) => (theta) =>
    -0.02 * Math.cos(theta) * smoothstep(HEM_D - 0.1, HEM_D, d);
  for (const d of below.slice(1)) {
    const [rz, back, front] = legAt(d);
    rings.push({
      v: v(d),
      lift: drop(d),
      parts: limbParts(
        thigh,
        shin,
        THIGH,
        d,
        { rz, back, front, n: 2.15, push: (theta) => legRelief(d, theta) },
        0.06,
      ),
    });
  }
  const [rz, back, front] = legAt(HEM_D);
  rings.push({
    v: 0,
    lift: drop(HEM_D),
    parts: limbParts(thigh, shin, THIGH, HEM_D - 0.004, {
      rz: rz - 0.014,
      back: back - 0.014,
      front: front - 0.014,
    }),
  });
  return buildTube(rings, { segments: 40, binds, mirror });
}

// A sock, on the shin, showing between the hem and the shoe when the heel
// comes up.
export function buildSock(binds, shin) {
  return buildTube(
    [
      [-0.78, 0.04],
      [-0.9, 0.039],
      [-1.04, 0.04],
    ].map(([y, r]) => ({
      parts: [{ bone: shin, y: y * SHIN, shape: { rx: r } }],
    })),
    { segments: 16, binds },
  );
}

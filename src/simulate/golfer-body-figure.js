import { buildTube } from "./golfer-body-tube";
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
};
export const BONE_COUNT = 13;

export const UPPER_ARM = 0.33;
export const FOREARM = 0.3;
export const THIGH = 0.455;
export const SHIN = 0.445;
// Where the legs and arms join the pelvis and chest, in those bones' frames
// (z is for the lead side).
export const HIP_JOINT = { y: -0.06, z: 0.105 };
export const SHOULDER_JOINT = { y: -0.04, z: 0.192 };
// How far up the spine (from the hips) the middle spine bone sits.
export const SPINE_JOINT = 0.19;

const smoothstep = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// --- polo ---

const SHIRT_FROM = 0.055;
const SHIRT_TO = 0.705;
// height up the spine, half width, half depth behind and in front
const TORSO = [
  [0.055, 0.15, 0.1, 0.1],
  [0.1, 0.158, 0.106, 0.106],
  [0.125, 0.169, 0.113, 0.117],
  [0.2, 0.171, 0.113, 0.119],
  [0.3, 0.177, 0.117, 0.123],
  [0.4, 0.187, 0.123, 0.127],
  [0.48, 0.194, 0.127, 0.129],
  [0.54, 0.195, 0.125, 0.124],
  [0.585, 0.188, 0.115, 0.113],
  [0.615, 0.176, 0.101, 0.097],
  [0.645, 0.142, 0.087, 0.081],
  [0.67, 0.098, 0.073, 0.067],
  [0.69, 0.068, 0.063, 0.059],
  [0.705, 0.058, 0.057, 0.055],
];

export function buildTorso(binds, spineLength) {
  return buildTube(
    TORSO.map(([h, rz, back, front]) => {
      const shape = { rz, back, front, n: h > 0.63 ? 2.1 : 2.5 };
      const pelvis = 1 - smoothstep(0.06, 0.3, h);
      const chest = smoothstep(0.2, 0.46, h);
      return {
        v: (h - SHIRT_FROM) / (SHIRT_TO - SHIRT_FROM),
        parts: [
          { bone: BONE.pelvis, weight: pelvis, y: h, shape },
          {
            bone: BONE.spine,
            weight: 1 - pelvis - chest,
            y: h - SPINE_JOINT,
            shape,
          },
          { bone: BONE.chest, weight: chest, y: h - spineLength, shape },
        ],
      };
    }),
    { segments: 48, binds },
  );
}

// A short sleeve, capped over the shoulder so it turns inside the body of
// the shirt like a real one does at its seam.
const SLEEVE = [
  [0.044, 0.008],
  [0.039, 0.027],
  [0.026, 0.044],
  [0.006, 0.055],
  [-0.03, 0.058],
  [-0.08, 0.056],
  [-0.13, 0.053],
  [-0.168, 0.052],
  [-0.176, 0.053],
  [-0.173, 0.045],
];

export function buildSleeve(binds, bone, mirror) {
  return buildTube(
    SLEEVE.map(([y, r], i) => ({
      v: i >= SLEEVE.length - 2 ? 0 : (y + 0.176) / 0.22,
      parts: [{ bone, y, shape: { rx: r, rz: r * 0.97, cz: 0.004 } }],
    })),
    { segments: 24, binds, mirror },
  );
}

// --- arms ---

// distance down the arm from the shoulder, half depth, half width
const ARM = [
  [0.1, 0.046, 0.045],
  [0.16, 0.048, 0.046],
  [0.23, 0.046, 0.043],
  [0.285, 0.042, 0.04],
  [0.31, 0.04, 0.039],
  [UPPER_ARM, 0.04, 0.039],
  [0.35, 0.041, 0.041],
  [0.385, 0.043, 0.044],
  [0.44, 0.04, 0.042],
  [0.5, 0.034, 0.036],
  [0.56, 0.027, 0.03],
  [0.6, 0.023, 0.026],
  [UPPER_ARM + FOREARM - 0.004, 0.022, 0.025],
  [UPPER_ARM + FOREARM + 0.008, 0.017, 0.019],
  [UPPER_ARM + FOREARM + 0.014, 0.004, 0.004],
];

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
  return buildTube(
    ARM.map(([s, rx, rz]) => ({
      parts: limbParts(upper, lower, UPPER_ARM, s, { rx, rz }),
    })),
    { segments: 20, binds, mirror },
  );
}

// --- trousers ---

// One leg, from the waistband to the hem. Above the crotch it is half of the
// hips (flat against the other half down the middle); below, the leg. `d` is
// the distance below the hip joint.
const WAIST_D = -0.165;
const HEM_D = THIGH + 0.405;
// d, half width, half depth behind and in front - the hips, round both legs
const HIPS = [
  [-0.13, 0.175, 0.126, 0.119],
  [-0.08, 0.184, 0.139, 0.118],
  [-0.03, 0.193, 0.148, 0.116],
  [0.02, 0.196, 0.147, 0.113],
  [0.05, 0.195, 0.14, 0.11],
  [0.08, 0.192, 0.128, 0.107],
  [0.1, 0.19, 0.12, 0.105],
];
// d, half width, half depth behind and in front - one leg
const LEG = [
  [0.02, 0.099, 0.104, 0.097],
  [0.05, 0.099, 0.104, 0.097],
  [0.08, 0.1, 0.104, 0.097],
  [0.1, 0.1, 0.103, 0.097],
  [0.13, 0.099, 0.101, 0.096],
  [0.2, 0.094, 0.095, 0.092],
  [0.3, 0.083, 0.084, 0.082],
  [0.38, 0.073, 0.073, 0.072],
  [0.42, 0.069, 0.067, 0.069],
  [THIGH, 0.066, 0.064, 0.068],
  [0.49, 0.063, 0.063, 0.064],
  [THIGH + 0.09, 0.06, 0.066, 0.058],
  [THIGH + 0.16, 0.058, 0.065, 0.055],
  [THIGH + 0.25, 0.053, 0.056, 0.051],
  [THIGH + 0.33, 0.05, 0.051, 0.05],
  [THIGH + 0.4, 0.05, 0.051, 0.05],
  [HEM_D, 0.051, 0.052, 0.051],
  [HEM_D - 0.003, 0.04, 0.04, 0.04],
];

export function buildTrouserLeg(binds, { thigh, shin }, mirror) {
  const v = (d) => 1 - (d - WAIST_D) / (HEM_D - WAIST_D);
  const hips = (d, [, rz, back, front]) => ({
    bone: BONE.pelvis,
    y: HIP_JOINT.y - d,
    shape: { rz, back, front, n: WAIST.n, half: true },
  });
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
    {
      v: 1,
      parts: [
        {
          bone: BONE.pelvis,
          y: HIP_JOINT.y - WAIST_D,
          shape: { ...WAIST, half: true },
        },
      ],
    },
  ];
  for (const row of HIPS) {
    const [d] = row;
    const m = smoothstep(-0.02, 0.12, d);
    const parts = [{ ...hips(d, row), weight: 1 - m }];
    if (m > 0) {
      const [, rz, back, front] = LEG.find(([legD]) => legD === d);
      parts.push({
        bone: thigh,
        weight: m,
        y: -d,
        shape: { rz, back, front, cz: 0 },
      });
    }
    rings.push({ v: v(d), parts });
  }
  for (const [d, rz, back, front] of LEG) {
    if (d < 0.12) continue;
    rings.push({
      v: d === HEM_D - 0.003 ? 0 : v(d),
      parts: limbParts(thigh, shin, THIGH, d, { rz, back, front }, 0.06),
    });
  }
  return buildTube(rings, { segments: 32, binds, mirror });
}

// A sock, on the shin, showing between the hem and the shoe.
export function buildSock(binds, shin) {
  return buildTube(
    [
      [-0.36, 0.036],
      [-0.42, 0.036],
      [-0.47, 0.038],
    ].map(([y, r]) => ({ parts: [{ bone: shin, y, shape: { rx: r } }] })),
    { segments: 16, binds },
  );
}

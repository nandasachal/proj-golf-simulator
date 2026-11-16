import * as THREE from "three";

// The swing as keyed positions: what the pelvis, chest, head, feet, hands
// and club are doing at each of the standard checkpoints of a tour driver
// swing (P1 address ... P10 finish), and a smooth curve through them in time.
// swing-rig.js turns a sampled pose into bones. Right-hander: stands at +x
// facing -x, target down +z. Yards, seconds, degrees.

export const CONTACT_TIME = 1.15;
export const SWING_DURATION = 1.9;

// Checkpoints. The backswing takes three times as long as the downswing.
const START = 0.15;
const P2 = 0.42; // shaft parallel to the ground, going back
const P3 = 0.63; // lead arm parallel
const P4 = 0.9; // top
const DROP = 0.965; // transition: the lower body has already started down
const P5 = 1.035; // lead arm parallel, coming down
const P6 = 1.105; // shaft parallel
const P7 = CONTACT_TIME; // impact
const P8 = 1.195; // shaft parallel, through
const P9 = 1.25; // trail arm parallel
const WRAP = 1.4; // club coming over the lead shoulder
const P10 = 1.64; // finish
const END = SWING_DURATION;
export const TOP_TIME = P4;

// Where the clubhead rests at address: on the mat, just behind the teed ball.
export const CLUBHEAD_ADDRESS = new THREE.Vector3(0, 0.12, -0.045);
// The middle of the grip at address: under the shoulders, a couple of fists
// off the thighs.
const HANDS_ADDRESS = new THREE.Vector3(0.6, 0.9, -0.05);
export const CLUB_LENGTH = HANDS_ADDRESS.distanceTo(CLUBHEAD_ADDRESS);
// How steeply the shaft rises at address, seen down the line.
export const SHAFT_DEGREES =
  (Math.atan2(
    HANDS_ADDRESS.y - CLUBHEAD_ADDRESS.y,
    HANDS_ADDRESS.x - CLUBHEAD_ADDRESS.x,
  ) *
    180) /
  Math.PI;

// The shaft's direction (hands to clubhead) is keyed as an angle round the
// plane the shaft lies in at address (theta: 0 at address, positive going
// back, so about 90 at P2, 270 at the top and -90 at P8) and an angle off
// that plane (phi: positive is above it, steeper).
export const PLANE_DOWN = CLUBHEAD_ADDRESS.clone()
  .sub(HANDS_ADDRESS)
  .normalize();
export const PLANE_TARGET = new THREE.Vector3(0, 0, 1)
  .addScaledVector(PLANE_DOWN, -PLANE_DOWN.z)
  .normalize();
export const PLANE_NORMAL = PLANE_DOWN.clone().cross(PLANE_TARGET);

const RADIANS = Math.PI / 180;

export function shaftDirection(theta, phi, out = new THREE.Vector3()) {
  const t = theta * RADIANS;
  const p = phi * RADIANS;
  return out
    .copy(PLANE_DOWN)
    .multiplyScalar(Math.cos(p) * Math.cos(t))
    .addScaledVector(PLANE_TARGET, -Math.cos(p) * Math.sin(t))
    .addScaledVector(PLANE_NORMAL, Math.sin(p));
}

// At impact the hands lead the clubhead a touch and are higher than they
// were at address, so the shaft is steeper.
const IMPACT_THETA = 4;
const IMPACT_PHI = -4;
const HANDS_IMPACT = CLUBHEAD_ADDRESS.clone().addScaledVector(
  shaftDirection(IMPACT_THETA, IMPACT_PHI),
  -CLUB_LENGTH,
);

// --- the keys ---

// Pelvis: turn about its own axis (negative is away from the target), how
// far that axis is tipped toward the ball (bend) and away from the target
// (lean: lead hip high), and where the hips are relative to address (back,
// up, toward the target).
//   time, turn, bend, lean, back, up, toward
const PELVIS = [
  [0, 0, 24, 1, 0, 0, 0],
  [START, 0, 24, 1, 0, 0, 0],
  [P2, -11, 24, -1, 0.008, 0, -0.02],
  [P3, -29, 23, -2, 0.018, -0.015, -0.03],
  [0.83, -43, 22, -3, 0.024, -0.03, -0.022],
  [P4, -41, 22, -3, 0.024, -0.032, -0.005],
  [DROP, -27, 23, -2, 0.02, -0.045, 0.03],
  [P5, -6, 23, 1, 0.012, -0.06, 0.07],
  [P6, 24, 21, 5, 0.004, -0.045, 0.115],
  [P7, 42, 20, 8, 0, -0.018, 0.145],
  [P8, 54, 18, 8, -0.015, -0.022, 0.16],
  [P9, 68, 13, 6, -0.03, -0.005, 0.172],
  [WRAP, 86, 6, 4, -0.06, 0.015, 0.18],
  [P10, 96, 1, 2, -0.08, 0.03, 0.185],
  [END, 96, 1, 2, -0.08, 0.028, 0.185],
];

// Chest, the same three angles. The shoulders turn about a spine that stays
// tipped toward the ball, so the lead shoulder goes down going back and the
// trail shoulder goes down coming through.
//   time, turn, bend, lean
const CHEST = [
  [0, 0, 36, 9],
  [START, 0, 36, 9],
  [P2, -30, 36, 7],
  [P3, -66, 36, 4],
  [0.86, -96, 35, 3],
  [P4, -98, 35, 3],
  [DROP, -88, 36, 6],
  [P5, -62, 38, 11],
  [P6, -20, 39, 15],
  [P7, 28, 38, 18],
  [P8, 54, 38, 19],
  [P9, 86, 24, 17],
  [WRAP, 112, 11, 12],
  [P10, 128, 3, 8],
  [END, 126, 3, 7],
];

// Head: which way it is turned, how far the face is tipped down, and its
// tilt away from the target. It stays on the ball, behind it, until the
// trail shoulder brings it up.
//   time, turn, pitch, lean
const HEAD = [
  [0, -2, 44, 6],
  [START, -2, 44, 6],
  [P2, -6, 44, 5],
  [P3, -12, 44, 3],
  [P4, -18, 44, 2],
  [P5, -16, 47, 7],
  [P6, -12, 49, 12],
  [P7, -9, 50, 17],
  [P8, -3, 48, 19],
  [P9, 22, 40, 18],
  [WRAP, 58, 18, 12],
  [P10, 82, 4, 6],
  [END, 84, 2, 5],
];

// Feet and knees. The lead foot rolls onto its outside edge and spins out a
// little; the trail heel peels up until the foot stands on its toe, turned
// to face the target, and is dragged toward it. A knee is pushed toward the
// other one (in) from where its foot and hip would point it.
//   time, leadRoll, leadSpin, trailLift, trailTurn, trailSlide, leadKneeIn, trailKneeIn
const FEET = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [START, 0, 0, 0, 0, 0, 0, 0],
  [P3, 0, 0, 0, 0, 0, 0.2, -0.05],
  [P4, -3, 0, 0, 0, 0, 0.35, -0.1],
  [P5, 0, 0, 0, 0, 0, 0.1, 0.1],
  [P6, 0, 0, 6, 3, 0, -0.05, 0.3],
  [P7, 3, 0, 22, 10, 0, -0.1, 0.45],
  [P8, 6, 2, 38, 22, 0.005, -0.1, 0.5],
  [P9, 10, 5, 55, 42, 0.015, -0.1, 0.5],
  [WRAP, 14, 8, 72, 68, 0.035, -0.05, 0.4],
  [P10, 16, 10, 80, 82, 0.05, 0, 0.3],
  [END, 16, 10, 80, 82, 0.05, 0, 0.3],
];

// Hands and club: where the middle of the grip is, which way the shaft
// points from it (a vector, or [theta, phi]), the lead wrist (roll: 0 is
// flat, the clubface in line with the back of the lead hand; positive is
// cupped, the face more open), how firmly the lead arm is held straight
// (the hands are pushed out along the arm to its full length), and how far
// the face is squared to the target line regardless.
//   time, hands, shaft, roll, straight, square
const CLUB = [
  [0, HANDS_ADDRESS, [0, 0], 0, 0, 1],
  [START, HANDS_ADDRESS, [0, 0], 0, 0, 1],
  [P2, [0.68, 0.97, -0.44], [-0.05, -0.02, -1], 6, 1, 0],
  [P3, [0.78, 1.45, -0.74], [0.47, 0.86, -0.18], 4, 1, 0],
  [P4, [1.05, 1.88, -0.5], [-0.03, 0.1, 1], 0, 1, 0],
  [DROP, [1.03, 1.77, -0.52], [0.1, 0, 1], -2, 1, 0],
  [P5, [0.82, 1.37, -0.68], [0.6, 0.72, 0.28], -4, 1, 0],
  [P6, [0.66, 0.98, -0.36], [0.1, 0.03, -1], -4, 1, 0],
  [P7, HANDS_IMPACT, [IMPACT_THETA, IMPACT_PHI], 0, 0, 1],
  [P8, [0.78, 1.08, 0.44], [0.24, 0.03, 0.97], 0, 0, 0],
  [P9, [0.93, 1.52, 0.62], [0.45, 0.86, 0.2], 0, 0, 0],
  [WRAP, [0.98, 1.82, 0.42], [0.25, 0.3, -0.92], 0, 0, 0],
  [P10, [1.1, 1.9, -0.12], [-0.886, -0.35, 0.248], 0, 0, 0],
  [END, [1.1, 1.87, -0.12], [-0.85, -0.45, 0.25], 0, 0, 0],
];

// --- curves ---

// A table of rows [time, ...values] as a curve through every row, smooth
// (continuous velocity) and with no overshoot: a monotone cubic, which rests
// wherever a value turns round and holds flat between equal rows.
function curve(rows) {
  const times = rows.map((row) => row[0]);
  const width = rows[0].length - 1;
  const values = [];
  const slopes = [];
  for (let k = 0; k < width; k++) {
    const v = rows.map((row) => row[k + 1]);
    const m = v.map((_, i) => {
      if (i === 0 || i === v.length - 1) return 0;
      const h0 = times[i] - times[i - 1];
      const h1 = times[i + 1] - times[i];
      const d0 = (v[i] - v[i - 1]) / h0;
      const d1 = (v[i + 1] - v[i]) / h1;
      if (d0 * d1 <= 0) return 0;
      const w0 = 2 * h1 + h0;
      const w1 = h1 + 2 * h0;
      return (w0 + w1) / (w0 / d0 + w1 / d1);
    });
    values.push(v);
    slopes.push(m);
  }
  const last = times.length - 1;
  return (t, out) => {
    let i = 0;
    if (t >= times[last]) i = last;
    else while (t > times[i + 1]) i++;
    if (t <= times[0] || i === last) {
      for (let k = 0; k < width; k++) out[k] = values[k][i];
      return out;
    }
    const h = times[i + 1] - times[i];
    const u = (t - times[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    const a = 2 * u3 - 3 * u2 + 1;
    const b = (u3 - 2 * u2 + u) * h;
    const c = -2 * u3 + 3 * u2;
    const d = (u3 - u2) * h;
    for (let k = 0; k < width; k++) {
      out[k] =
        a * values[k][i] +
        b * slopes[k][i] +
        c * values[k][i + 1] +
        d * slopes[k][i + 1];
    }
    return out;
  };
}

// The club rows with their shaft directions as (theta, phi), theta carried
// on round past a full turn rather than wrapped.
function clubRows() {
  let previous = 0;
  return CLUB.map(([time, hands, shaft, roll, straight, square]) => {
    const [x, y, z] = hands.isVector3 ? hands.toArray() : hands;
    let theta;
    let phi;
    if (shaft.length === 2) [theta, phi] = shaft;
    else {
      const d = new THREE.Vector3(...shaft).normalize();
      phi = Math.asin(d.dot(PLANE_NORMAL)) / RADIANS;
      theta = Math.atan2(-d.dot(PLANE_TARGET), d.dot(PLANE_DOWN)) / RADIANS;
      theta += 360 * Math.round((previous - theta) / 360);
    }
    previous = theta;
    return [time, x, y, z, theta, phi, roll, straight, square];
  });
}

const CURVES = [
  [
    curve(PELVIS),
    [
      "pelvisTurn",
      "pelvisBend",
      "pelvisLean",
      "pelvisBack",
      "pelvisUp",
      "pelvisToward",
    ],
  ],
  [curve(CHEST), ["chestTurn", "chestBend", "chestLean"]],
  [curve(HEAD), ["headTurn", "headPitch", "headLean"]],
  [
    curve(FEET),
    [
      "leadRoll",
      "leadSpin",
      "trailLift",
      "trailTurn",
      "trailSlide",
      "leadKneeIn",
      "trailKneeIn",
    ],
  ],
  [
    curve(clubRows()),
    [
      "handsX",
      "handsY",
      "handsZ",
      "theta",
      "phi",
      "roll",
      "straight",
      "square",
    ],
  ],
];

const scratch = new Array(8);

// Everything keyed, for a moment of the swing. Pass `out` to reuse an object.
export function swingPose(t, out = {}) {
  for (const [sample, names] of CURVES) {
    sample(t, scratch);
    for (let k = 0; k < names.length; k++) out[names[k]] = scratch[k];
  }
  return out;
}

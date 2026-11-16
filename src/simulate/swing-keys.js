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

// Where the clubhead rests at address: on the mat, just behind the ball.
export const CLUBHEAD_ADDRESS = new THREE.Vector3(0, 0.12, -0.045);

const RADIANS = Math.PI / 180;

// How the golfer sets up to each kind of club. The ball never moves: the
// stance does, round it.
//   handsY      height of the middle of the grip at address
//   handsZ      how far the hands are ahead of the ball (shaft lean)
//   halfWidth   half the distance between the ankles
//   stanceZ     where the middle of the stance is: behind the ball for the
//               longer clubs, which are played forward
//   lean        how much of the driver's tilt away from the target is kept
//   bend        degrees further the chest is bent over the ball
//   impact      shaft lean at impact, degrees round the swing plane: the
//               driver meets the ball level to rising, the irons going down
const CATEGORY = {
  driver: {
    handsY: 0.9,
    handsZ: -0.05,
    halfWidth: 0.25,
    stanceZ: -0.09,
    lean: 1,
    bend: 0,
    impact: 0.5,
  },
  wood: {
    handsY: 0.895,
    handsZ: -0.03,
    halfWidth: 0.235,
    stanceZ: -0.065,
    lean: 0.85,
    bend: 0.5,
    impact: 3,
  },
  hybrid: {
    handsY: 0.89,
    handsZ: -0.015,
    halfWidth: 0.225,
    stanceZ: -0.05,
    lean: 0.75,
    bend: 1,
    impact: 4,
  },
  iron: {
    handsY: 0.88,
    handsZ: 0,
    halfWidth: 0.205,
    stanceZ: -0.03,
    lean: 0.55,
    bend: 2,
    impact: 5,
  },
  wedge: {
    handsY: 0.865,
    handsZ: 0.03,
    halfWidth: 0.175,
    stanceZ: 0,
    lean: 0.35,
    bend: 3,
    impact: 5.5,
  },
};
// The hands sit lower than a club's lie angle would have them, so the shaft
// is that much flatter than its lie; this is the driver's (58 degree lie).
const DRIVER_SHAFT_DEGREES = 52.4;
const DRIVER_LIE_DEGREES = 58;

// Everything about a setup that the keys and the rig work from. The shaft's
// direction (hands to clubhead) is keyed as an angle round the plane the
// shaft lies in at address (theta: 0 at address, positive going back, so
// about 90 at P2, 270 at the top and -90 at P8) and an angle off that plane
// (phi: positive is above it, steeper), so a shorter club, which sits more
// upright, is swung on a more upright plane.
export function setupFor(club) {
  const category = CATEGORY[club.category] || CATEGORY.driver;
  const rise = category.handsY - CLUBHEAD_ADDRESS.y;
  const ahead = category.handsZ - CLUBHEAD_ADDRESS.z;
  // The golfer's reach is fitted to the club's lie; golfer-club.js cuts the
  // shaft to suit.
  const shaftDegrees =
    DRIVER_SHAFT_DEGREES + club.lieDegrees - DRIVER_LIE_DEGREES;
  const length = Math.hypot(rise / Math.sin(shaftDegrees * RADIANS), ahead);
  const hands = new THREE.Vector3(
    Math.sqrt(length * length - rise * rise - ahead * ahead),
    category.handsY,
    category.handsZ,
  );
  const down = CLUBHEAD_ADDRESS.clone().sub(hands).normalize();
  const target = new THREE.Vector3(0, 0, 1)
    .addScaledVector(down, -down.z)
    .normalize();
  return {
    ...category,
    length,
    hands,
    // How steeply the shaft rises at address, seen down the line.
    shaftDegrees,
    planeDown: down,
    planeTarget: target,
    planeNormal: down.clone().cross(target),
  };
}

export const DRIVER_SETUP = setupFor({
  category: "driver",
  lieDegrees: DRIVER_LIE_DEGREES,
});
export const CLUB_LENGTH = DRIVER_SETUP.length;

export function shaftDirection(
  theta,
  phi,
  out = new THREE.Vector3(),
  setup = DRIVER_SETUP,
) {
  const t = theta * RADIANS;
  const p = phi * RADIANS;
  return out
    .copy(setup.planeDown)
    .multiplyScalar(Math.cos(p) * Math.cos(t))
    .addScaledVector(setup.planeTarget, -Math.cos(p) * Math.sin(t))
    .addScaledVector(setup.planeNormal, Math.sin(p));
}

// At impact the hands are higher than they were at address, so the shaft is
// steeper.
const IMPACT_PHI = -4;
// The hands bottom out just before the ball and are rising through it.
const LOW = CONTACT_TIME - 0.016;
const LOW_DROP = 0.012;

// --- the keys ---

// Pelvis: turn about its own axis (negative is away from the target), how
// far that axis is tipped toward the ball (bend) and away from the target
// (lean: lead hip high), and where the hips are relative to address (back,
// up, toward the target).
//   time, turn, bend, lean, back, up, toward
const PELVIS = [
  [0, 0, 28, 1, 0, 0, 0],
  [START, 0, 28, 1, 0, 0, 0],
  [P2, -11, 28, -1, 0.008, 0, -0.02],
  [P3, -29, 27, -1, 0.01, -0.022, -0.03],
  [0.83, -43, 26, -1, 0.012, -0.036, -0.022],
  [P4, -41, 26, -1, 0.012, -0.04, -0.005],
  [DROP, -27, 27, -1, 0.012, -0.06, 0.03],
  [P5, -6, 27, 1, 0.012, -0.08, 0.07],
  [P6, 24, 24, 5, 0.004, -0.065, 0.115],
  [P7, 42, 22, 8, 0, -0.028, 0.145],
  [P8, 54, 19, 8, -0.015, -0.022, 0.16],
  [P9, 68, 13, 6, -0.03, -0.012, 0.172],
  [WRAP, 86, 6, 4, -0.06, 0.012, 0.18],
  [P10, 96, 1, 2, -0.08, 0.028, 0.185],
  [END, 96, 1, 2, -0.08, 0.026, 0.185],
];

// Chest, the same three angles. The shoulders turn about a spine that stays
// tipped toward the ball, so the lead shoulder goes down going back and the
// trail shoulder goes down coming through.
//   time, turn, bend, lean
const CHEST = [
  [0, 0, 39, 9],
  [START, 0, 39, 9],
  [P2, -30, 39, 7],
  [P3, -66, 39, 4],
  [0.86, -96, 38, 3],
  [P4, -98, 38, 3],
  [DROP, -88, 39, 6],
  [P5, -62, 40, 11],
  [P6, -20, 41, 15],
  [P7, 28, 40, 18],
  [P8, 54, 40, 19],
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
  [WRAP, 14, 8, 72, 68, 0.06, -0.05, 0.6],
  [P10, 16, 10, 80, 82, 0.1, 0, 0.8],
  [END, 16, 10, 80, 82, 0.1, 0, 0.8],
];

// Hands and club: where the middle of the grip is, which way the shaft
// points from it (a vector, or [theta, phi]), the lead wrist (roll: 0 is
// flat, the clubface in line with the back of the lead hand; positive is
// cupped, the face more open), how firmly the lead arm is held straight
// (the hands are pushed out along the arm to its full length), and how far
// the face is squared to the target line regardless.
//   time, hands, shaft, roll, straight, square
const ADDRESS = "address";
const IMPACT = "impact";
const CLUB = [
  [0, ADDRESS, [0, 0], 0, 0, 1],
  [START, ADDRESS, [0, 0], 0, 0, 1],
  [P2, [0.68, 0.97, -0.44], [-0.05, -0.02, -1], 6, 1, 0],
  [P3, [0.78, 1.45, -0.74], [0.2, 0.95, -0.2], 4, 1, 0],
  [P4, [0.84, 2.02, -0.42], [-0.03, 0.1, 1], 0, 1, 0],
  [DROP, [0.86, 1.9, -0.46], [0.12, 0, 1], -2, 1, 0],
  [P5, [0.82, 1.35, -0.68], [0.68, 0.68, 0.27], -4, 1, 0],
  [P6, [0.66, 0.98, -0.36], [0.1, 0.03, -1], -4, 1, 0],
  [P7, IMPACT, null, 0, 0, 1],
  [P8, [0.84, 1.08, 0.42], [0.24, 0.03, 0.97], 0, 0, 0],
  [P9, [0.93, 1.5, 0.62], [0.45, 0.86, 0.2], 0, 0, 0],
  [WRAP, [0.98, 1.8, 0.42], [0.25, 0.3, -0.92], 0, 0, 0],
  [P10, [1.08, 1.85, -0.1], [-0.82, -0.5, 0.22], 0, 0, 0],
  [END, [1.08, 1.83, -0.1], [-0.79, -0.56, 0.22], 0, 0, 0],
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

// The club rows for a setup: the keyed hand positions moved with the stance,
// the address and impact hands worked back from the clubhead at the ball, and
// the shaft directions as (theta, phi), theta carried on round past a full
// turn rather than wrapped.
function clubRows(setup) {
  const shift = setup.hands.clone().sub(DRIVER_SETUP.hands);
  shift.z = setup.stanceZ - DRIVER_SETUP.stanceZ;
  const impact = CLUBHEAD_ADDRESS.clone().addScaledVector(
    shaftDirection(setup.impact, IMPACT_PHI, undefined, setup),
    -setup.length,
  );
  let previous = 0;
  const rows = CLUB.map(([time, hands, shaft, roll, straight, square]) => {
    let at;
    if (hands === ADDRESS) at = setup.hands;
    else if (hands === IMPACT) at = impact;
    else at = new THREE.Vector3(...hands).add(shift);
    let theta;
    let phi;
    if (hands === IMPACT) [theta, phi] = [setup.impact, IMPACT_PHI];
    else if (shaft.length === 2) [theta, phi] = shaft;
    else {
      // keyed for the driver's plane; the same angles on this club's
      const d = new THREE.Vector3(...shaft).normalize();
      phi = Math.asin(d.dot(DRIVER_SETUP.planeNormal)) / RADIANS;
      theta =
        Math.atan2(
          -d.dot(DRIVER_SETUP.planeTarget),
          d.dot(DRIVER_SETUP.planeDown),
        ) / RADIANS;
      theta += 360 * Math.round((previous - theta) / 360);
    }
    previous = theta;
    return [time, at.x, at.y, at.z, theta, phi, roll, straight, square];
  });
  // The hands' low point, just before impact: on the way in from P6, a
  // touch lower than they will be at the ball.
  const low = curve(rows)(LOW, []);
  low[1] = impact.y - LOW_DROP;
  rows.splice(
    rows.findIndex((row) => row[0] === P7),
    0,
    [LOW, ...low],
  );
  return rows;
}

const scaled = (rows, column, by) =>
  rows.map((row) => row.map((value, i) => (i === column ? value * by : value)));

const scratch = new Array(8);

// The swing for a setup: swing.pose(t) is everything keyed for a moment of
// it. Pass `out` to reuse an object.
export function createSwing(setup = DRIVER_SETUP) {
  const curves = [
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
    [
      curve(
        scaled(CHEST, 3, setup.lean).map(([t, turn, bend, lean]) => [
          t,
          turn,
          // a shorter club is bent over further, until the finish
          bend + setup.bend * Math.min(1, bend / 30),
          lean,
        ]),
      ),
      ["chestTurn", "chestBend", "chestLean"],
    ],
    [curve(scaled(HEAD, 3, setup.lean)), ["headTurn", "headPitch", "headLean"]],
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
      curve(clubRows(setup)),
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
  return {
    setup,
    pose(t, out = {}) {
      for (const [sample, names] of curves) {
        sample(t, scratch);
        for (let k = 0; k < names.length; k++) out[names[k]] = scratch[k];
      }
      out.setup = setup;
      return out;
    },
  };
}

const DRIVER_SWING = createSwing();

// The driver swing at a moment.
export const swingPose = (t, out) => DRIVER_SWING.pose(t, out);

// Where each drag handle sits in the 3D club views, and what value a point
// in the scene means. Pure geometry in the club scene's own space:
// centimetres, ball on its tee above the origin, target down +z, -x is the
// right-hand side, +y up.
//
// The pads draw small angles several times their real size so a one-degree
// change is a visible, grabbable movement. `mirror` is 1 for a right-hander
// and -1 for a left-hander, whose open face and in-to-out path point left.

const DEGREES = Math.PI / 180;
const CM_PER_INCH = 2.54;

// How many times bigger than life each control is drawn.
export const GAIN = {
  face: 5,
  path: 5,
  aim: 2.5,
  attack: 4,
  loft: 4,
  strike: 2,
};

export const BALL = { height: 4.6, radius: 2.135 };

// How far from the ball each handle sits.
export const REACH = {
  aim: 19,
  face: 12.5,
  path: 19,
  attack: 26,
  loft: 20,
  // the grab point on the club head: behind the face, on top of the crown
  headBehind: 5.5,
  headHeight: 6.5,
};

// Unit vector along the ground, `degrees` right of the centre line.
const along = (degrees) => ({
  x: -Math.sin(degrees * DEGREES),
  z: Math.cos(degrees * DEGREES),
});
// Degrees right of the centre line that a ground offset points.
const bearing = (x, z) => Math.atan2(-x, z) / DEGREES;

// The angles as drawn (degrees right of the centre line), from the values
// the golfer set.
export function shownAngles(
  { clubFaceAngle, clubPathAngle, aim, attackAngle, loftChange, strike },
  mirror,
  { standardLoft = 0, start = 0 } = {},
) {
  const aimDegrees = aim * GAIN.aim;
  return {
    aimDegrees,
    faceDegrees: aimDegrees + mirror * clubFaceAngle * GAIN.face,
    pathDegrees: aimDegrees + mirror * clubPathAngle * GAIN.path,
    startDegrees: aimDegrees + mirror * start * GAIN.face,
    attackDegrees: attackAngle * GAIN.attack,
    // how far the plane of the face leans back from upright
    loftDegrees: standardLoft + loftChange * GAIN.loft,
    // toward the toe (+) or heel (-)
    strikeCm: strike * CM_PER_INCH * GAIN.strike,
  };
}

// --- the view from above: aim, face, path, strike ---

// The face meets the back of the ball.
const contactPoint = (faceDegrees) => {
  const face = along(faceDegrees);
  return { x: -face.x * BALL.radius, z: -face.z * BALL.radius };
};
// The club's heel-side axis on the ground (where its shaft is, for a
// right-hander).
const heelAxis = (faceDegrees) => ({
  x: Math.cos(faceDegrees * DEGREES),
  z: Math.sin(faceDegrees * DEGREES),
});

export function topHandles(shown, mirror) {
  const aim = along(shown.aimDegrees);
  const face = along(shown.faceDegrees);
  const path = along(shown.pathDegrees);
  const contact = contactPoint(shown.faceDegrees);
  const heel = heelAxis(shown.faceDegrees);
  // A toe strike slides the head toward the golfer, who is on the heel side.
  const slide = mirror * shown.strikeCm;
  return {
    aim: { x: aim.x * REACH.aim, y: 0.3, z: aim.z * REACH.aim },
    clubFaceAngle: { x: face.x * REACH.face, y: 0.3, z: face.z * REACH.face },
    // the tail of the path line, behind the ball
    clubPathAngle: { x: -path.x * REACH.path, y: 0.3, z: -path.z * REACH.path },
    strike: {
      x: contact.x + heel.x * slide - face.x * REACH.headBehind,
      y: REACH.headHeight,
      z: contact.z + heel.z * slide - face.z * REACH.headBehind,
    },
  };
}

// What a point on the ground means for each control (not yet snapped).
export const fromGround = {
  aim: (point) => bearing(point.x, point.z) / GAIN.aim,
  clubFaceAngle: (point, shown, mirror) =>
    (bearing(point.x, point.z) - shown.aimDegrees) / (mirror * GAIN.face),
  clubPathAngle: (point, shown, mirror) =>
    (bearing(-point.x, -point.z) - shown.aimDegrees) / (mirror * GAIN.path),
  strike: (point, shown, mirror) => {
    const contact = contactPoint(shown.faceDegrees);
    const heel = heelAxis(shown.faceDegrees);
    const slide =
      (point.x - contact.x) * heel.x + (point.z - contact.z) * heel.z;
    return (mirror * slide) / (CM_PER_INCH * GAIN.strike);
  },
};

// --- the view from the toe: attack angle and loft, on the upright plane
// through the ball and the target ---

const facePivot = { y: BALL.height, z: -BALL.radius };

export function sideHandles(shown) {
  const attack = shown.attackDegrees * DEGREES;
  const lean = shown.loftDegrees * DEGREES;
  return {
    // the tail of the arriving arrow: lower when hitting up
    attackAngle: {
      x: 0,
      y: BALL.height - REACH.attack * Math.sin(attack),
      z: -REACH.attack * Math.cos(attack),
    },
    // the top of the line up the face: further back with more loft
    loftChange: {
      x: 0,
      y: facePivot.y + REACH.loft * Math.cos(lean),
      z: facePivot.z - REACH.loft * Math.sin(lean),
    },
  };
}

export const fromSide = {
  attackAngle: (point) =>
    Math.atan2(BALL.height - point.y, -point.z) / DEGREES / GAIN.attack,
  loftChange: (point, { standardLoft }) =>
    (Math.atan2(facePivot.z - point.z, point.y - facePivot.y) / DEGREES -
      standardLoft) /
    GAIN.loft,
};

// --- shared ---

// Clamp to the control's range and snap to its step.
export function snap(value, range) {
  if (!Number.isFinite(value)) return range.DEFAULT;
  const stepped = Math.round(value / range.STEP) * range.STEP;
  const clamped = Math.min(range.MAX, Math.max(range.MIN, stepped));
  // avoid -0 and float dust from the step multiply
  return Math.round(clamped * 1000) / 1000 || 0;
}

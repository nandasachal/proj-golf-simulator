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

// `height` is the centre of a ball on a tee; off the turf it is the radius.
export const BALL = { height: 4.6, radius: 2.135 };

// Where the ball sits and where the head is grabbed, by the kind of club.
// `behind` and `height` place the grab point on top of the head: behind the
// face, and above the turf.
const HEAD_GRAB = {
  driver: { behind: 5.5, height: 6.5 },
  wood: { behind: 4.2, height: 4.4 },
  hybrid: { behind: 3.2, height: 4.4 },
  iron: { behind: 1.2, height: 5 },
  wedge: { behind: 1.2, height: 5.4 },
};
export function clubGeometry(club) {
  return {
    ballHeight: club && !club.teed ? BALL.radius : BALL.height,
    grab: HEAD_GRAB[club ? club.category : "driver"],
  };
}
const DRIVER_GEOMETRY = clubGeometry(null);

// How far from the ball each handle sits.
export const REACH = {
  aim: 19,
  face: 12.5,
  path: 19,
  attack: 26,
  loft: 20,
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
  { standardLoft = 0, start = 0, club = null } = {},
) {
  const aimDegrees = aim * GAIN.aim;
  return {
    ...clubGeometry(club),
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

const grabOf = (shown) => shown.grab || DRIVER_GEOMETRY.grab;
const ballHeightOf = (shown) => shown?.ballHeight ?? BALL.height;

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
      x: contact.x + heel.x * slide - face.x * grabOf(shown).behind,
      y: grabOf(shown).height,
      z: contact.z + heel.z * slide - face.z * grabOf(shown).behind,
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

// Where a face leaning back `loftDegrees` touches the ball: the point the
// loft line rises from. Lower and further round the ball the more loft.
export function facePivot(loftDegrees, ballHeight = BALL.height) {
  const lean = loftDegrees * DEGREES;
  return {
    y: ballHeight - BALL.radius * Math.sin(lean),
    z: -BALL.radius * Math.cos(lean),
  };
}

// The lowest the attack handle is drawn, relative to the turf.
const ATTACK_FLOOR = -3.5;

export function sideHandles(shown) {
  const attack = shown.attackDegrees * DEGREES;
  const lean = shown.loftDegrees * DEGREES;
  const ballHeight = ballHeightOf(shown);
  const pivot = facePivot(shown.loftDegrees, ballHeight);
  const attackReach =
    attack > 0
      ? Math.min(REACH.attack, (ballHeight - ATTACK_FLOOR) / Math.sin(attack))
      : REACH.attack;
  return {
    // the tail of the arriving arrow: lower when hitting up. Hitting up at a
    // ball on the turf it would go under the grass and out of the picture,
    // so it comes in along its line until it is back in view.
    attackAngle: {
      x: 0,
      y: ballHeight - attackReach * Math.sin(attack),
      z: -attackReach * Math.cos(attack),
    },
    // the top of the line up the face: further back with more loft
    loftChange: {
      x: 0,
      y: pivot.y + REACH.loft * Math.cos(lean),
      z: pivot.z - REACH.loft * Math.sin(lean),
    },
  };
}

// The loft line's top is REACH.loft from a pivot that itself moves round the
// ball with loft, so the lean is read from the ball's centre instead: the
// top sits at (REACH.loft, -radius) in the face's own frame.
const LEVER_OFFSET = Math.atan2(BALL.radius, REACH.loft) / DEGREES;

export const fromSide = {
  attackAngle: (point, shown) =>
    Math.atan2(ballHeightOf(shown) - point.y, -point.z) / DEGREES / GAIN.attack,
  loftChange: (point, { standardLoft, ballHeight = BALL.height }) =>
    (Math.atan2(-point.z, point.y - ballHeight) / DEGREES -
      LEVER_OFFSET -
      standardLoft) /
    GAIN.loft,
};

// --- shared ---

// Clamp to the control's range and snap to its step.
// A typed value, kept to two decimals and held to the range.
export function exact(value, range) {
  if (!Number.isFinite(value)) return range.DEFAULT;
  const clamped = Math.min(range.MAX, Math.max(range.MIN, value));
  return Math.round(clamped * 100) / 100 || 0;
}

// One step up or down from wherever the value is, typed decimals and all.
export const nudge = (value, direction, range) =>
  exact(value + direction * range.STEP, range);

export function snap(value, range) {
  if (!Number.isFinite(value)) return range.DEFAULT;
  const stepped = Math.round(value / range.STEP) * range.STEP;
  const clamped = Math.min(range.MAX, Math.max(range.MIN, stepped));
  // avoid -0 and float dust from the step multiply
  return Math.round(clamped * 1000) / 1000 || 0;
}

// Geometry for the two club pads: where each drag handle sits for a value,
// and what value a pointer position means. Pure functions in the pads' own
// SVG units, so the feel of a drag can be tested without a browser.
//
// Angles are drawn larger than life so a one-degree change is a visible,
// grabbable movement. `mirror` is 1 for a right-hander and -1 for a
// left-hander, whose open face and in-to-out path point the other way.

const DEGREES = Math.PI / 180;

export const TOP = {
  width: 308,
  height: 206,
  ball: { x: 154, y: 106 },
  // screen degrees per degree of face or path, and per degree of aim
  anglePerDegree: 5,
  aimPerDegree: 2.5,
  faceRadius: 66,
  pathRadius: 88,
  aimRadius: 94,
  // how far the head slides per inch of strike offset
  pixelsPerInch: 24,
};

export const SIDE = {
  width: 308,
  height: 100,
  ground: 86,
  // the sole end of the face line, which leans back by the loft
  facePivot: { x: 160, y: 85 },
  faceLength: 42,
  loftPerDegree: 1.5,
  // the tip of the "head arriving" arrow; its tail swings with attack angle
  attackTip: { x: 104, y: 64 },
  attackLength: 56,
  attackPerDegree: 4,
};

// Degrees clockwise from straight up the page.
const fromUp = (dx, dy) => Math.atan2(dx, -dy) / DEGREES;

const onCircle = (centre, radius, degreesFromUp) => ({
  x: centre.x + radius * Math.sin(degreesFromUp * DEGREES),
  y: centre.y - radius * Math.cos(degreesFromUp * DEGREES),
});

// --- how far each thing is turned on the page ---

export const aimTurn = (aim) => aim * TOP.aimPerDegree;
export const faceTurn = ({ face, aim, mirror }) =>
  aimTurn(aim) + mirror * face * TOP.anglePerDegree;
export const pathTurn = ({ path, aim, mirror }) =>
  aimTurn(aim) + mirror * path * TOP.anglePerDegree;

// --- top pad: handle positions ---

export const aimHandle = (aim) =>
  onCircle(TOP.ball, TOP.aimRadius, aimTurn(aim));

export const faceHandle = (setup) =>
  onCircle(TOP.ball, TOP.faceRadius, faceTurn(setup));

// The path handle is the tail of the arrow, behind the ball.
export const pathHandle = (setup) =>
  onCircle(TOP.ball, TOP.pathRadius, pathTurn(setup) + 180);

// The head slides along the face: a toe strike moves it toward the golfer,
// who stands on the left of the pad if right-handed.
export const headShift = ({ strike, mirror }) =>
  -mirror * strike * TOP.pixelsPerInch;

// --- top pad: pointer position → value (not yet snapped or clamped) ---

export const aimFromPointer = (point) =>
  fromUp(point.x - TOP.ball.x, point.y - TOP.ball.y) / TOP.aimPerDegree;

export const faceFromPointer = (point, { aim, mirror }) =>
  (fromUp(point.x - TOP.ball.x, point.y - TOP.ball.y) - aimTurn(aim)) /
  (mirror * TOP.anglePerDegree);

export const pathFromPointer = (point, { aim, mirror }) =>
  (fromUp(TOP.ball.x - point.x, TOP.ball.y - point.y) - aimTurn(aim)) /
  (mirror * TOP.anglePerDegree);

// How far along the face the pointer is from the ball, in inches toward the
// toe.
export function strikeFromPointer(point, setup) {
  const turn = faceTurn(setup) * DEGREES;
  const dx = point.x - TOP.ball.x;
  const dy = point.y - TOP.ball.y;
  const alongFace = dx * Math.cos(turn) + dy * Math.sin(turn);
  return (-setup.mirror * alongFace) / TOP.pixelsPerInch;
}

// --- side pad (drawn with the target to the right; mirrored for a
// left-hander) ---

const unmirror = (point, mirror) =>
  mirror < 0 ? { x: SIDE.width - point.x, y: point.y } : point;

export const sideX = (x, mirror) => (mirror < 0 ? SIDE.width - x : x);

export function loftHandle({ loft, mirror }) {
  const lean = loft * SIDE.loftPerDegree * DEGREES;
  return {
    x: sideX(SIDE.facePivot.x - SIDE.faceLength * Math.sin(lean), mirror),
    y: SIDE.facePivot.y - SIDE.faceLength * Math.cos(lean),
  };
}

export function attackHandle({ attack, mirror }) {
  const tilt = attack * SIDE.attackPerDegree * DEGREES;
  return {
    x: sideX(SIDE.attackTip.x - SIDE.attackLength * Math.cos(tilt), mirror),
    y: SIDE.attackTip.y + SIDE.attackLength * Math.sin(tilt),
  };
}

// Degrees of dynamic loft the pointer is asking for.
export function loftFromPointer(point, { mirror }) {
  const p = unmirror(point, mirror);
  return (
    fromUp(SIDE.facePivot.x - p.x, p.y - SIDE.facePivot.y) / SIDE.loftPerDegree
  );
}

export function attackFromPointer(point, { mirror }) {
  const p = unmirror(point, mirror);
  const tilt =
    Math.atan2(p.y - SIDE.attackTip.y, SIDE.attackTip.x - p.x) / DEGREES;
  return tilt / SIDE.attackPerDegree;
}

// --- shared ---

// Clamp to the control's range and snap to its step.
export function snap(value, range) {
  if (!Number.isFinite(value)) return range.DEFAULT;
  const stepped = Math.round(value / range.STEP) * range.STEP;
  const clamped = Math.min(range.MAX, Math.max(range.MIN, stepped));
  // avoid -0 and float dust from the step multiply
  return Math.round(clamped * 1000) / 1000 || 0;
}

// Where the pointer is in the pad's own units, whatever size it is drawn at.
export function toPadPoint(event, rect, pad) {
  return {
    x: ((event.clientX - rect.left) / rect.width) * pad.width,
    y: ((event.clientY - rect.top) / rect.height) * pad.height,
  };
}

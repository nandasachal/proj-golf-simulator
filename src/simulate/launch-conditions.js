// Turns what the golfer sets (face angle, path angle, swing speed) into the
// ball's launch conditions for Shot. Angles are degrees; for a right-hander
// positive means right of the target line (open face / in-to-out path), and a
// left-hander is the mirror image.

export const DRIVER = {
  smashFactor: 1.48,
  launchAngleDegrees: 12,
  backspinRPM: 2700,
};

// The ball starts mostly where the face points, nudged toward the path.
export const FACE_START_WEIGHT = 0.85;
// Degrees of spin-axis tilt per degree of face-to-path difference.
export const AXIS_TILT_PER_DEGREE = 3;

export function launchConditions({
  faceAngle,
  pathAngle,
  swingSpeedMPH,
  side,
}) {
  const mirror = side === "Left" ? -1 : 1;
  const startDirection =
    FACE_START_WEIGHT * faceAngle + (1 - FACE_START_WEIGHT) * pathAngle;
  const faceToPath = faceAngle - pathAngle;

  return {
    initSpeedMPH: swingSpeedMPH,
    smashFactor: DRIVER.smashFactor,
    initVerticalAngleDegrees: DRIVER.launchAngleDegrees,
    initBackspinRPM: DRIVER.backspinRPM,
    // Shot launches toward -x for a positive horizontal angle, and -x is the
    // right-hand side when looking downrange (+z).
    initHorizontalAngleDegrees: mirror * startDirection,
    // Shot curves toward +x (left) for a positive spin angle, so an open face
    // (positive face-to-path) needs a negative one to curve right.
    initSpinAngle: -mirror * AXIS_TILT_PER_DEGREE * faceToPath,
  };
}

// Turns what the golfer sets (face angle, path angle, swing speed, attack
// angle, loft) into the ball's launch conditions for Shot. Angles are
// degrees; for a right-hander positive means right of the target line (open
// face / in-to-out path), and a left-hander is the mirror image.

// The ball starts mostly where the face points, nudged toward the path.
export const FACE_START_WEIGHT = 0.85;
// Vertically it is the same story: the ball launches mostly along the loft
// delivered, nudged toward the direction the head is travelling.
export const LOFT_LAUNCH_WEIGHT = 0.85;
// Loft the ball "sees" for curve with a standard delivery. Face-to-path tilts
// the spin axis by atan(tan(faceToPath) / tan(spinLoft)): about 4.5° per
// degree, in line with TrackMan's driver examples.
export const DRIVER_SPIN_LOFT_DEGREES = 12.5;
// Each extra degree of spin loft is a more glancing blow and costs ball speed.
const SMASH_LOSS_PER_SPIN_LOFT_DEGREE = 0.012;
const MAX_SMASH = 1.5;
// Below this the model's "more loft, more spin" proportionality stops meaning
// anything (the ball would be struck almost dead flat).
const MIN_SPIN_LOFT_DEGREES = 6;

const radians = (degrees) => (degrees * Math.PI) / 180;

// A solidly struck driver delivered the standard way for this swing speed: a
// level attack angle. Faster swings launch lower with less spin and a
// slightly better strike.
function standardDelivery(swingSpeedMPH) {
  const fromMid = swingSpeedMPH - 105;
  const launchAngleDegrees = 12 - 0.07 * fromMid;
  return {
    smashFactor: Math.min(MAX_SMASH, 1.47 + 0.001 * fromMid),
    launchAngleDegrees,
    backspinRPM: 2750 - 13 * fromMid,
    // with a level attack, launch = LOFT_LAUNCH_WEIGHT * dynamic loft
    dynamicLoftDegrees: launchAngleDegrees / LOFT_LAUNCH_WEIGHT,
  };
}

// Launch numbers for a driver.
//   attackAngle: degrees the head is travelling up (+) or down (-) at impact
//   loftChange: degrees of loft added to (+) or taken off (-) the standard
//     delivery for this swing speed
// Spin loft is dynamic loft minus attack angle. Backspin scales with it,
// ball speed falls as it grows, and launch sits between loft and attack
// angle. So hitting up with the same loft launches higher with less spin.
export function driverLaunch(
  swingSpeedMPH,
  { attackAngle = 0, loftChange = 0 } = {},
) {
  const standard = standardDelivery(swingSpeedMPH);
  const dynamicLoftDegrees = standard.dynamicLoftDegrees + loftChange;
  const spinLoftDegrees = Math.max(
    MIN_SPIN_LOFT_DEGREES,
    dynamicLoftDegrees - attackAngle,
  );
  const spinLoftRatio = spinLoftDegrees / standard.dynamicLoftDegrees;

  return {
    smashFactor: Math.min(
      MAX_SMASH,
      standard.smashFactor -
        SMASH_LOSS_PER_SPIN_LOFT_DEGREE *
          (spinLoftDegrees - standard.dynamicLoftDegrees),
    ),
    launchAngleDegrees:
      LOFT_LAUNCH_WEIGHT * dynamicLoftDegrees +
      (1 - LOFT_LAUNCH_WEIGHT) * attackAngle,
    backspinRPM: standard.backspinRPM * spinLoftRatio,
    dynamicLoftDegrees,
    spinLoftDegrees,
    // 1 for a standard delivery; more spin loft means less curve per degree
    // of face-to-path
    spinLoftRatio,
  };
}

export function spinAxisTiltDegrees(faceToPath, spinLoftRatio = 1) {
  return (
    (Math.atan(
      Math.tan(radians(faceToPath)) /
        Math.tan(radians(DRIVER_SPIN_LOFT_DEGREES * spinLoftRatio)),
    ) *
      180) /
    Math.PI
  );
}

export function launchConditions({
  faceAngle,
  pathAngle,
  swingSpeedMPH,
  side,
  attackAngle = 0,
  loftChange = 0,
}) {
  const mirror = side === "Left" ? -1 : 1;
  const startDirection =
    FACE_START_WEIGHT * faceAngle + (1 - FACE_START_WEIGHT) * pathAngle;
  const driver = driverLaunch(swingSpeedMPH, { attackAngle, loftChange });

  return {
    initSpeedMPH: swingSpeedMPH,
    smashFactor: driver.smashFactor,
    initVerticalAngleDegrees: driver.launchAngleDegrees,
    initBackspinRPM: driver.backspinRPM,
    // Shot launches toward -x for a positive horizontal angle, and -x is the
    // right-hand side when looking downrange (+z).
    initHorizontalAngleDegrees: mirror * startDirection,
    // Shot curves toward +x (left) for a positive spin angle, so an open face
    // (positive face-to-path) needs a negative one to curve right.
    initSpinAngle:
      -mirror *
      spinAxisTiltDegrees(faceAngle - pathAngle, driver.spinLoftRatio),
  };
}

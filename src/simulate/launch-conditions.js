// Turns what the golfer sets (face angle, path angle, swing speed) into the
// ball's launch conditions for Shot. Angles are degrees; for a right-hander
// positive means right of the target line (open face / in-to-out path), and a
// left-hander is the mirror image.

// The ball starts mostly where the face points, nudged toward the path.
export const FACE_START_WEIGHT = 0.85;
// Loft the ball "sees" at impact with a driver. Face-to-path tilts the spin
// axis by atan(tan(faceToPath) / tan(spinLoft)): about 4.5° per degree.
export const DRIVER_SPIN_LOFT_DEGREES = 12.5;

const radians = (degrees) => (degrees * Math.PI) / 180;

// A solidly struck driver with a level attack angle. Faster swings launch
// lower with less spin and a slightly better strike.
export function driverLaunch(swingSpeedMPH) {
  const fromMid = swingSpeedMPH - 105;
  return {
    smashFactor: Math.min(1.5, 1.47 + 0.001 * fromMid),
    launchAngleDegrees: 12 - 0.07 * fromMid,
    backspinRPM: 2750 - 13 * fromMid,
  };
}

export function spinAxisTiltDegrees(faceToPath) {
  return (
    (Math.atan(
      Math.tan(radians(faceToPath)) /
        Math.tan(radians(DRIVER_SPIN_LOFT_DEGREES)),
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
}) {
  const mirror = side === "Left" ? -1 : 1;
  const startDirection =
    FACE_START_WEIGHT * faceAngle + (1 - FACE_START_WEIGHT) * pathAngle;
  const driver = driverLaunch(swingSpeedMPH);

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
    initSpinAngle: -mirror * spinAxisTiltDegrees(faceAngle - pathAngle),
  };
}

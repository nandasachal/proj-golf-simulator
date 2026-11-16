// Turns what the golfer sets (club, face angle, path angle, swing speed,
// attack angle, loft) into the ball's launch conditions for Shot. Angles are
// degrees; for a right-hander positive means right of the target line (open
// face / in-to-out path), and a left-hander is the mirror image.

import { getClub } from "./clubs";

const DRIVER = getClub("driver");

// The ball starts mostly where the face points, nudged toward the path.
export const FACE_START_WEIGHT = DRIVER.faceStartWeight;
// Vertically it is the same story: the ball launches mostly along the loft
// delivered, nudged toward the direction the head is travelling.
export const LOFT_LAUNCH_WEIGHT = 0.85;
// Loft the ball "sees" for curve with a standard driver delivery. Face-to-path
// tilts the spin axis by atan(tan(faceToPath) / tan(spinLoft)): about 4.5° per
// degree, in line with TrackMan's driver examples. Other clubs use their own
// spin loft, so the more lofted the club the less it curves.
export const DRIVER_SPIN_LOFT_DEGREES = 12.5;
// Each extra degree of spin loft is a more glancing blow and costs ball speed.
const SMASH_LOSS_PER_SPIN_LOFT_DEGREE = 0.012;
const MAX_SMASH = 1.5;
// Below this the model's "more loft, more spin" proportionality stops meaning
// anything (the ball would be struck almost dead flat).
const MIN_SPIN_LOFT_DEGREES = 6;
// Slower swings with the same club launch a touch higher.
const LAUNCH_DEGREES_PER_MPH = 0.03;

// Striking the ball off-centre, toward the toe (+) or heel (-), in inches.
// A driver's face is curved (bulge), so a toe strike meets a face pointing
// further open and the ball starts on that side; the head also twists, and
// that "gear effect" spins the ball back the other way. Off-centre contact
// costs ball speed, more the further out it is. These are the driver's
// rates; clubs.js has every club's.
export const STRIKE_START_DEGREES_PER_INCH = DRIVER.strike.start;
export const STRIKE_TILT_DEGREES_PER_INCH = DRIVER.strike.tilt;
export const STRIKE_SMASH_LOSS_PER_INCH_SQUARED = DRIVER.strike.smashLoss;

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

// Any other club delivered the standard way for this swing speed: the tour's
// launch numbers for it, with backspin in proportion to speed.
function standardClubDelivery(club, swingSpeedMPH) {
  const { tour } = club;
  const launchAngleDegrees =
    tour.launch - LAUNCH_DEGREES_PER_MPH * (swingSpeedMPH - tour.speed);
  return {
    smashFactor: tour.smash,
    launchAngleDegrees,
    backspinRPM: (tour.spin * swingSpeedMPH) / tour.speed,
    dynamicLoftDegrees:
      (launchAngleDegrees - (1 - LOFT_LAUNCH_WEIGHT) * tour.attack) /
      LOFT_LAUNCH_WEIGHT,
  };
}

// The attack angle a club is normally delivered with: level for the teed-up
// driver, downward for everything played off the turf.
export const standardAttackAngle = (club) =>
  club.id === "driver" ? 0 : club.tour.attack;

// Launch numbers for a club.
//   attackAngle: degrees the head is travelling up (+) or down (-) at impact
//     (the club's standard attack angle if left out)
//   loftChange: degrees of loft added to (+) or taken off (-) the standard
//     delivery for this swing speed
// Spin loft is dynamic loft minus attack angle. Backspin scales with it,
// ball speed falls as it grows, and launch sits between loft and attack
// angle. So hitting up with the same loft launches higher with less spin.
export function clubLaunch(
  club,
  swingSpeedMPH,
  { attackAngle = standardAttackAngle(club), loftChange = 0 } = {},
) {
  const isDriver = club.id === "driver";
  const standard = isDriver
    ? standardDelivery(swingSpeedMPH)
    : standardClubDelivery(club, swingSpeedMPH);
  const standardSpinLoft =
    standard.dynamicLoftDegrees - standardAttackAngle(club);
  const dynamicLoftDegrees = standard.dynamicLoftDegrees + loftChange;
  const spinLoftDegrees = Math.max(
    MIN_SPIN_LOFT_DEGREES,
    dynamicLoftDegrees - attackAngle,
  );
  const spinLoftRatio = spinLoftDegrees / standardSpinLoft;

  return {
    smashFactor: Math.min(
      MAX_SMASH,
      standard.smashFactor -
        SMASH_LOSS_PER_SPIN_LOFT_DEGREE * (spinLoftDegrees - standardSpinLoft),
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
    // the spin loft that sets how much face-to-path curves the ball
    curveSpinLoftDegrees:
      (isDriver ? DRIVER_SPIN_LOFT_DEGREES : standardSpinLoft) * spinLoftRatio,
  };
}

export const driverLaunch = (swingSpeedMPH, delivery) =>
  clubLaunch(DRIVER, swingSpeedMPH, delivery);

// `spinLoft` is either the ratio to a standard driver delivery (as before) or,
// with `absolute`, the spin loft itself in degrees.
export function spinAxisTiltDegrees(
  faceToPath,
  spinLoft = 1,
  { absolute = false } = {},
) {
  const spinLoftDegrees = absolute
    ? spinLoft
    : DRIVER_SPIN_LOFT_DEGREES * spinLoft;
  return (
    (Math.atan(
      Math.tan(radians(faceToPath)) / Math.tan(radians(spinLoftDegrees)),
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
  club: clubId = "driver",
  attackAngle,
  loftChange = 0,
  strikeInches = 0,
}) {
  const club = getClub(clubId);
  const mirror = side === "Left" ? -1 : 1;
  // The toe is on the far side of the ball from the golfer, which is the
  // "open" side, so a toe strike starts the ball that way.
  const startDirection =
    club.faceStartWeight * faceAngle +
    (1 - club.faceStartWeight) * pathAngle +
    club.strike.start * strikeInches;
  const launch = clubLaunch(club, swingSpeedMPH, { attackAngle, loftChange });
  // Tilt toward the open side from face-to-path, less the gear effect, which
  // on a toe strike curves the ball back the other way (a draw).
  const axisTilt =
    spinAxisTiltDegrees(faceAngle - pathAngle, launch.curveSpinLoftDegrees, {
      absolute: true,
    }) -
    club.strike.tilt * strikeInches;

  return {
    initSpeedMPH: swingSpeedMPH,
    smashFactor:
      launch.smashFactor - club.strike.smashLoss * strikeInches * strikeInches,
    initVerticalAngleDegrees: launch.launchAngleDegrees,
    initBackspinRPM: launch.backspinRPM,
    // Shot launches toward -x for a positive horizontal angle, and -x is the
    // right-hand side when looking downrange (+z).
    initHorizontalAngleDegrees: mirror * startDirection,
    // Shot curves toward +x (left) for a positive spin angle, so tilt toward
    // the open side (right, for a right-hander) needs a negative one.
    initSpinAngle: -mirror * axisTilt,
  };
}

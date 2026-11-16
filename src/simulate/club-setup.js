import {
  driverLaunch,
  FACE_START_WEIGHT,
  STRIKE_START_DEGREES_PER_INCH,
} from "./launch-conditions";

// Everything the close-up club view needs to pose the driver and draw its
// guide lines, worked out from the shot controls. Horizontal angles here are
// absolute: degrees right (+) or left (-) of the range's centre line, looking
// at the target, whichever hand the golfer plays. All at true size.

const CM_PER_INCH = 2.54;
// Loft built into the driver head; the rest of the delivered loft comes from
// how the shaft presents it.
export const DRIVER_STATIC_LOFT_DEGREES = 10.5;

const round = (value) => Math.round(value * 10) / 10;

const describe = (value, positive, negative, zero) => {
  // Round the size, not the signed value, so left and right read the same.
  const size = round(Math.abs(value));
  if (size === 0) return zero;
  return `${size}° ${value > 0 ? positive : negative}`;
};

export function clubSetup({
  faceAngle,
  pathAngle,
  swingSpeed,
  aim = 0,
  attackAngle = 0,
  loftChange = 0,
  strike = 0,
  side = "Right",
}) {
  // A left-hander's "open" and "in-to-out" point left.
  const mirror = side === "Left" ? -1 : 1;
  const launch = driverLaunch(swingSpeed, { attackAngle, loftChange });
  const start =
    FACE_START_WEIGHT * faceAngle +
    (1 - FACE_START_WEIGHT) * pathAngle +
    STRIKE_START_DEGREES_PER_INCH * strike;

  return {
    mirror,
    aimDegrees: aim,
    faceDegrees: aim + mirror * faceAngle,
    pathDegrees: aim + mirror * pathAngle,
    startDegrees: aim + mirror * start,
    attackDegrees: attackAngle,
    launchDegrees: launch.launchAngleDegrees,
    dynamicLoftDegrees: launch.dynamicLoftDegrees,
    // how far the head is tipped back from its built-in loft
    loftTiltDegrees: launch.dynamicLoftDegrees - DRIVER_STATIC_LOFT_DEGREES,
    backspinRPM: launch.backspinRPM,
    // toward the toe (+) or heel (-)
    strikeCm: strike * CM_PER_INCH,
    swingSpeed,
    labels: {
      face: describe(faceAngle, "open", "closed", "square"),
      path: describe(pathAngle, "in-to-out", "out-to-in", "square"),
      start: describe(aim + mirror * start, "right", "left", "straight"),
      aim: describe(aim, "right", "left", "straight"),
      attack: describe(attackAngle, "up", "down", "level"),
      loft: `${round(launch.dynamicLoftDegrees)}°`,
      launch: `${round(launch.launchAngleDegrees)}°`,
      spin: `${Math.round(launch.backspinRPM)} rpm`,
      strike:
        strike === 0
          ? "centre"
          : `${Math.abs(strike)} in ${strike > 0 ? "toe" : "heel"}`,
    },
  };
}

// The same setup with its small angles drawn `factor` times bigger, so a 1°
// change is easy to see. Only what is drawn changes: the labels keep the true
// numbers, and loft and launch are left at true size.
export function amplifyAngles(setup, factor) {
  return {
    ...setup,
    aimDegrees: setup.aimDegrees * factor,
    faceDegrees: setup.faceDegrees * factor,
    pathDegrees: setup.pathDegrees * factor,
    startDegrees: setup.startDegrees * factor,
    attackDegrees: setup.attackDegrees * factor,
  };
}

// One sentence for screen readers and tests.
export function describeClubSetup(setup) {
  const { labels } = setup;
  return [
    `face ${labels.face}`,
    `path ${labels.path}`,
    `ball starts ${labels.start}`,
    `aim ${labels.aim}`,
    `attack ${labels.attack}`,
    `${labels.loft} of loft`,
    `launches at ${labels.launch} with ${labels.spin} of backspin`,
    `struck ${labels.strike === "centre" ? "in the centre" : `${labels.strike} side`}`,
  ].join(", ");
}

// Unit vector on the ground for a direction `degrees` right of the centre
// line, in the club scene's axes (+z to the target, -x is right).
export function groundDirection(degrees) {
  const angle = (degrees * Math.PI) / 180;
  return { x: -Math.sin(angle), y: 0, z: Math.cos(angle) };
}

// The same direction tipped up (+) or down (-) by `elevation` degrees.
export function risingDirection(degrees, elevation) {
  const flat = groundDirection(degrees);
  const tilt = (elevation * Math.PI) / 180;
  return {
    x: flat.x * Math.cos(tilt),
    y: Math.sin(tilt),
    z: flat.z * Math.cos(tilt),
  };
}

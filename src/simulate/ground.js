import { Vector3 } from "three";

// What happens after the ball first touches down: a series of bounces, then a
// roll to rest. SI units, +y up, flat ground at y = 0.
//
// Bounce follows Penner's model (Can. J. Phys. 80, 2002): a rigid impact
// against a surface tilted back by the pitch mark the ball digs, with
// speed-dependent restitution and Coulomb friction that either slides or
// grips. Roll is a constant deceleration tied to a Stimpmeter reading. The
// turf scalings below were tuned so driver roll-out matches published tour and
// USGA/R&A figures; see README "Domain context" for what is measured vs tuned.

const GRAVITY = 9.8;
const BALL_RADIUS = 0.021335;
const DEGREES = Math.PI / 180;
const UP = new Vector3(0, 1, 0);

// Penner's pitch-mark calibration point: 15.4° of tilt at 18.6 m/s, 44.4°
// from vertical. The angle dependence is softened to a square root.
const TILT_DEGREES = 15.4;
const TILT_SPEED = 18.6;
const TILT_ANGLE = 44.4 * DEGREES;
// A bounce that would rise less than about 5 cm counts as the start of roll.
const MIN_HOP_SPEED = 1.0;
const MAX_BOUNCES = 40;
const STEP_SECONDS = 0.01;

// All three are perennial ryegrass (upright, no grain), differing in height of
// cut, soil firmness and whether the leaf is wet.
export const TURF_PRESETS = {
  soft: { label: "Soft", mowHeightInches: 0.75, firmness: 0.2, leafWetness: 1 },
  normal: {
    label: "Normal",
    mowHeightInches: 0.6,
    firmness: 0.5,
    leafWetness: 0,
  },
  firm: {
    label: "Firm",
    mowHeightInches: 0.45,
    firmness: 0.75,
    leafWetness: 0,
  },
};

// Turf conditions → the numbers the physics uses.
//   mowHeightInches: height of cut
//   firmness: 0 saturated or thatchy, 0.5 normally irrigated, 1 hard and dry
//   leafWetness: 0 dry leaf, 1 dew or rain on the leaf
export function turfParameters({ mowHeightInches, firmness, leafWetness = 0 }) {
  // Longer grass is slower: about 5.7 ft on the Stimpmeter at 0.4 in.
  const stimpFeet = Math.max(2, 5.7 - 7.5 * (mowHeightInches - 0.4));
  return {
    // rolling deceleration as a fraction of g; wet leaf drags more
    rollFriction: (0.56 / stimpFeet) * (1 + 0.3 * leafWetness),
    // softer ground and longer grass dig a deeper pitch mark
    tiltScale: 1.1 - 0.45 * (firmness - 0.5) + 0.2 * (mowHeightInches - 0.6),
    // firmer ground gives a livelier bounce
    restitutionScale: 0.7 + 0.5 * (firmness - 0.5),
    impactFriction: 0.4,
  };
}

export function restitution(normalSpeed) {
  return normalSpeed >= 20
    ? 0.12
    : 0.51 - 0.0375 * normalSpeed + 0.000903 * normalSpeed * normalSpeed;
}

// One impact: velocity and spin just before → just after.
export function bounce(velocity, spin, turf) {
  const speed = velocity.length();
  const heading = new Vector3(velocity.x, 0, velocity.z);
  if (heading.lengthSq() < 1e-12) heading.set(0, 0, 1);
  else heading.normalize();
  const fromVertical = Math.atan2(
    Math.hypot(velocity.x, velocity.z),
    -velocity.y,
  );

  const tilt = Math.min(
    fromVertical,
    turf.tiltScale *
      TILT_DEGREES *
      DEGREES *
      (speed / TILT_SPEED) *
      Math.sqrt(fromVertical / TILT_ANGLE),
  );
  const normal = UP.clone()
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(heading, -Math.sin(tilt));

  const normalSpeed = -velocity.dot(normal);
  const tangential = velocity.clone().addScaledVector(normal, normalSpeed);
  const e = Math.min(0.9, turf.restitutionScale * restitution(normalSpeed));

  // Velocity of the contact point across the turf; friction acts against it.
  const slip = tangential
    .clone()
    .addScaledVector(spin.clone().cross(normal), -BALL_RADIUS);
  const slipSpeed = slip.length();
  const maxFrictionChange = turf.impactFriction * (1 + e) * normalSpeed;
  const change =
    slipSpeed <= 3.5 * maxFrictionChange
      ? slip.multiplyScalar(-2 / 7) // grips: ball leaves rolling
      : slip.multiplyScalar(-maxFrictionChange / slipSpeed); // slides throughout

  return {
    velocity: tangential.add(change).addScaledVector(normal, e * normalSpeed),
    spin: spin
      .clone()
      .addScaledVector(normal.clone().cross(change), -5 / (2 * BALL_RADIUS)),
  };
}

// Everything after first touchdown. `landing` is the last point of a Shot
// (position, velocity, angularVelocity). Returns the path as timed points
// (t in seconds from touchdown) and where the ball comes to rest.
export function groundRun(landing, turf) {
  const start = landing.position.clone().setY(0);
  const position = start.clone();
  let velocity = landing.velocity.clone();
  let spin = landing.angularVelocity.clone();
  let time = 0;
  let hops = 0;
  const points = [{ t: 0, position: position.clone() }];

  for (let i = 0; i < MAX_BOUNCES; i++) {
    ({ velocity, spin } = bounce(velocity, spin, turf));
    if (velocity.y < MIN_HOP_SPEED) break;

    const airTime = (2 * velocity.y) / GRAVITY;
    for (let s = STEP_SECONDS; s < airTime; s += STEP_SECONDS) {
      points.push({
        t: time + s,
        position: new Vector3(
          position.x + velocity.x * s,
          velocity.y * s - 0.5 * GRAVITY * s * s,
          position.z + velocity.z * s,
        ),
      });
    }
    position.x += velocity.x * airTime;
    position.z += velocity.z * airTime;
    time += airTime;
    points.push({ t: time, position: position.clone() });
    velocity.y = -velocity.y;
    hops++;
  }
  const bounceEnd = position.clone();

  // Settle into rolling (friction removes any remaining slip), then slow at a
  // constant rate in a straight line.
  const rolling = new Vector3(velocity.x, 0, velocity.z);
  const slip = rolling
    .clone()
    .addScaledVector(spin.clone().cross(UP), -BALL_RADIUS);
  rolling.addScaledVector(slip, -2 / 7);
  const rollSpeed = rolling.length();
  const deceleration = turf.rollFriction * GRAVITY;
  const rollTime = rollSpeed / deceleration;
  const rollDistance = (rollSpeed * rollSpeed) / (2 * deceleration);
  if (rollSpeed > 1e-9) rolling.divideScalar(rollSpeed);

  for (let s = STEP_SECONDS; s < rollTime; s += STEP_SECONDS) {
    const distance = rollSpeed * s - 0.5 * deceleration * s * s;
    points.push({
      t: time + s,
      position: bounceEnd.clone().addScaledVector(rolling, distance),
    });
  }
  const rest = bounceEnd.clone().addScaledVector(rolling, rollDistance);
  time += rollTime;
  points.push({ t: time, position: rest.clone() });

  return {
    points,
    rest,
    hops,
    seconds: time,
    bounceDistance: bounceEnd.distanceTo(start),
    rollDistance,
    runDistance: rest.distanceTo(start),
  };
}

import { Vector3 } from "three";
import { toMPS } from "./conversions-lib";

const DRAG = 0.21;
const SPIN_DRAG = 0.3;
const LIFT = 0.43;

export const Shot = function (options) {
  this.points = [];
  var initPoint = new ShotPoint();

  initPoint.position = new Vector3(0, 0, 0);

  options = options || {};

  // golf ball properties
  this.mass = 0.0459; // kg; from 1.62 ounces
  this.radius = 0.021335; // m; from 1.68 inch diameter
  this.crossSectionalArea = Math.PI * this.radius * this.radius; // m^2
  this.smashFactor = options.smashFactor == null ? 1.49 : options.smashFactor; // clubhead-to-ball-initial speed ratio

  // nature
  this.gravityMagnitude = -9.8; // 9.8 m/s^2
  this.airDensity = 1.2041; // kg/m^3

  // golf ball aerodynamics properties. Both coefficients depend on the spin
  // ratio S = (radius * spin rate) / speed: Cd = dragCoefficient +
  // spinDragCoefficient * S, Cl = liftCoefficient * S^0.4. Values are fitted to
  // published launch-monitor tour averages (see shot.test.js).
  this.dragCoefficient =
    options.dragCoefficient == null ? DRAG : options.dragCoefficient;
  this.spinDragCoefficient =
    options.spinDragCoefficient == null
      ? SPIN_DRAG
      : options.spinDragCoefficient;
  this.liftCoefficient =
    options.liftCoefficient == null ? LIFT : options.liftCoefficient;
  this.spinDecayRate =
    options.spinDecayRate == null ? 0.04 : options.spinDecayRate; // fraction of spin lost per second

  // initial shot attributes
  this.initSpeedMPH = options.initSpeedMPH || 0.0;
  this.initVerticalAngleDegrees = options.initVerticalAngleDegrees || 0.0;
  this.initHorizontalAngleDegrees = options.initHorizontalAngleDegrees || 0.0;
  this.initBackspinRPM = options.initBackspinRPM || 0.0;
  this.initSpinAngle = options.initSpinAngle || 0.0;

  // simulation properties
  this.dt = options.dt || 0.001; //seconds

  // initial velocity
  initPoint.velocity = this.getInitialVelocity(
    this.initSpeedMPH,
    this.smashFactor,
    this.initVerticalAngleDegrees,
    this.initHorizontalAngleDegrees,
  );

  // initial angular velocity (spin rate)
  initPoint.angularVelocity = this.getInitialSpin(
    this.initBackspinRPM,
    this.initSpinAngle,
  );

  this.projectShot(initPoint);
};

// Turn the whole shot about the tee, as if the golfer had set up aimed
// `degreesRight` of the centre line (-x is right). Everything about the
// flight is unchanged; it just points somewhere else.
Shot.prototype.aim = function (degreesRight) {
  if (!degreesRight) return this;
  var up = new Vector3(0, 1, 0);
  var angle = (-degreesRight * Math.PI) / 180;
  for (var i = 0; i < this.points.length; i++) {
    this.points[i].position.applyAxisAngle(up, angle);
    this.points[i].velocity.applyAxisAngle(up, angle);
    this.points[i].angularVelocity.applyAxisAngle(up, angle);
  }
  return this;
};

Shot.prototype.getInitialSpin = function (spinRPM, spinAngle) {
  var spin = new Vector3(0, 0, 0);
  // backspin about -x, tilted toward +y by the spin-axis angle
  spin.x = -Math.cos((spinAngle * Math.PI) / 180);
  spin.y = Math.sin((spinAngle * Math.PI) / 180);

  spin.normalize().multiplyScalar((spinRPM * 2 * Math.PI) / 60);

  return spin;
};

Shot.prototype.getInitialVelocity = function (
  speedMPH,
  smashFactor,
  verticalDegrees,
  horizontalDegrees,
) {
  var velocity = new Vector3(0, 0, 0);
  velocity.x = Math.sin((-1 * horizontalDegrees * Math.PI) / 180);
  velocity.y = Math.sin((verticalDegrees * Math.PI) / 180);
  velocity.z = Math.cos((verticalDegrees * Math.PI) / 180);

  var ballSpeed = toMPS(speedMPH * smashFactor);

  return velocity.normalize().multiplyScalar(ballSpeed);
};

Shot.prototype.projectShot = function (initPoint) {
  // initial point
  var lastPoint = initPoint.clone();
  this.points.push(lastPoint);

  while (true) {
    var newPoint = lastPoint.clone();

    // calculate velcoity change
    var accel = this.getAcceleration(lastPoint);
    newPoint.velocity.add(accel.clone().multiplyScalar(this.dt));
    newPoint.position.add(newPoint.velocity.clone().multiplyScalar(this.dt));

    // calculate spin rate decay
    var decayRate = this.angularDecayVector(newPoint);
    newPoint.angularVelocity.add(decayRate);

    if (newPoint.position.y <= 0) {
      // Finish exactly on the ground rather than a fraction of a step below it.
      var fraction =
        lastPoint.position.y / (lastPoint.position.y - newPoint.position.y);
      newPoint.position.lerpVectors(
        lastPoint.position,
        newPoint.position,
        fraction,
      );
      newPoint.velocity.lerpVectors(
        lastPoint.velocity,
        newPoint.velocity,
        fraction,
      );
      this.points.push(newPoint);
      break;
    }

    this.points.push(newPoint);

    lastPoint = newPoint;
  }
};

Shot.prototype.getAcceleration = function (currentPoint) {
  var gravityAcceleration = new Vector3(0, this.gravityMagnitude, 0);

  var velocity = currentPoint.velocity;
  var speed = velocity.length();
  var spin = currentPoint.angularVelocity;
  var spinRatio = (this.radius * spin.length()) / speed;
  // 0.5 * rho * A / m: turns a coefficient times speed^2 into an acceleration
  var k = (0.5 * this.airDensity * this.crossSectionalArea) / this.mass;

  // drag opposes velocity, magnitude k * Cd * speed^2
  var dragCoefficient =
    this.dragCoefficient + this.spinDragCoefficient * spinRatio;
  var dragForceAcceleration = velocity
    .clone()
    .multiplyScalar(-k * dragCoefficient * speed);

  // magnus lift is perpendicular to spin axis and velocity, magnitude
  // k * Cl * speed^2
  var liftCoefficient = this.liftCoefficient * Math.pow(spinRatio, 0.4);
  var magnusForceAcceleration = spin
    .clone()
    .normalize()
    .cross(velocity)
    .multiplyScalar(k * liftCoefficient * speed);

  return new Vector3(0, 0, 0)
    .add(gravityAcceleration)
    .add(dragForceAcceleration)
    .add(magnusForceAcceleration);
};

Shot.prototype.angularDecayVector = function (currentPoint) {
  return currentPoint.angularVelocity
    .clone()
    .multiplyScalar(-this.spinDecayRate * this.dt);
};

export const ShotPoint = function () {
  this.position = new Vector3(0, 0, 0);
  this.velocity = new Vector3(0, 0, 0);
  this.angularVelocity = new Vector3(0, 0, 0);
  this.acceleration = new Vector3(0, 0, 0);
};

ShotPoint.prototype.clone = function () {
  var point = new ShotPoint();
  point.position = this.position.clone();
  point.velocity = this.velocity.clone();
  point.acceleration = this.acceleration.clone();
  point.angularVelocity = this.angularVelocity.clone();
  return point;
};

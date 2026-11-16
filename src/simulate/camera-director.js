import { Vector3 } from "three";

// Decides where the camera should be for each moment of a shot and eases it
// there. Pure math on Vector3s in scene units (yards, tee at the origin,
// downrange is +z) so it can be tested without a renderer.

export const ADDRESS = "address";
export const SWING = "swing";
export const FLIGHT = "flight";
export const LANDED = "landed";

const MIN_HEIGHT = 1.2;
// The treeline starts just outside this; keep the camera on the range side of it.
export const MAX_OFFLINE = 84;
const DOWNRANGE = new Vector3(0, 0, 1);

// How quickly the camera closes on its desired spot, per second.
const EASE = {
  [ADDRESS]: { position: 2.4, target: 3.2 },
  [SWING]: { position: 1.2, target: 2 },
  [FLIGHT]: { position: 3, target: 9 },
  [LANDED]: { position: 1.6, target: 5 },
};
// The follow camera holds back for a beat after impact, then chases.
const FLIGHT_RAMP_SECONDS = 1.1;

// A right-hander stands on the +x side of the ball, a left-hander on -x.
const golferSide = (side) => (side === "Left" ? -1 : 1);

function horizontalDirection(velocity) {
  const direction = new Vector3(velocity.x, 0, velocity.z);
  return direction.lengthSq() < 1e-6
    ? DOWNRANGE.clone()
    : direction.normalize();
}

// Where the golfer stands, across the target line from the ball.
const GOLFER_OFFSET = 0.9;

// Down the line: straight behind the golfer, who is in the middle of the
// picture with the ball beside them, looking parallel to the target line so
// the range runs square away from the camera. High enough that the horizon
// (and any target on the centre line) clears the golfer's head, far enough
// back that their feet and the ball sit above the Hit button.
export function addressView(side) {
  const s = golferSide(side);
  return {
    position: new Vector3(GOLFER_OFFSET * s, 2.1, -6),
    target: new Vector3(GOLFER_OFFSET * s, 1.2, 30),
  };
}

// A slow push-in while the club goes back.
export function swingView(side) {
  const s = golferSide(side);
  return {
    position: new Vector3(GOLFER_OFFSET * s, 2, -5.4),
    target: new Vector3(GOLFER_OFFSET * s, 1.2, 30),
  };
}

// Trail the ball along its line of travel, rising above it as it comes down
// so the landing area is in view.
export function flightView(ball, velocity) {
  const direction = horizontalDirection(velocity);
  const descent = Math.max(0, -velocity.y);
  const position = ball
    .clone()
    .addScaledVector(direction, -10)
    .add(new Vector3(0, 2.2 + Math.min(descent * 0.12, 5), 0));
  position.y = Math.max(MIN_HEIGHT, position.y);
  const target = ball.clone().addScaledVector(direction, 4);
  target.y = Math.max(0, ball.y);
  return { position, target };
}

// Hold short of the ball, off to the golfer's side, looking at where it lies.
export function landedView(landing, direction, side) {
  const along = horizontalDirection(direction);
  const across = new Vector3(along.z, 0, -along.x);
  const position = landing
    .clone()
    .addScaledVector(along, -13)
    .addScaledVector(across, 4.5 * golferSide(side))
    .add(new Vector3(0, 5, 0));
  const target = landing.clone().add(new Vector3(0, 0.6, 0));
  return { position, target };
}

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export class CameraDirector {
  constructor(side = "Right") {
    this.position = new Vector3();
    this.target = new Vector3();
    this.reset(side);
  }

  // Cut straight to the address view (no easing).
  reset(side) {
    const view = addressView(side);
    this.position.copy(view.position);
    this.target.copy(view.target);
    this.state = ADDRESS;
    this.stateSeconds = 0;
  }

  desiredView({ state, side, ball, velocity, landing }) {
    if (state === FLIGHT) return flightView(ball, velocity);
    if (state === LANDED) return landedView(landing, velocity, side);
    if (state === SWING) return swingView(side);
    return addressView(side);
  }

  update(dt, shot) {
    if (shot.state !== this.state) {
      this.state = shot.state;
      this.stateSeconds = 0;
    }
    this.stateSeconds += dt;

    const view = this.desiredView(shot);
    const ease = EASE[this.state];
    const ramp =
      this.state === FLIGHT
        ? Math.min(1, this.stateSeconds / FLIGHT_RAMP_SECONDS) ** 2
        : 1;
    this.position.lerp(view.position, damp(ease.position * ramp, dt));
    this.target.lerp(view.target, damp(ease.target, dt));
    this.position.y = Math.max(MIN_HEIGHT, this.position.y);
    this.position.x = Math.min(
      MAX_OFFLINE,
      Math.max(-MAX_OFFLINE, this.position.x),
    );
    return this;
  }
}

import { Vector3 } from "three";
import {
  CameraDirector,
  addressView,
  flightView,
  landedView,
  ADDRESS,
  SWING,
  FLIGHT,
  LANDED,
  MAX_OFFLINE,
} from "./camera-director";

const DT = 1 / 60;

// A simple arcing flight in yards: 60 yd/s downrange, drifting right (-x).
const ballAt = (t) =>
  new Vector3(-2 * t, Math.max(0, 22 * t - 4 * t * t), 60 * t);
const velocityAt = (t) => new Vector3(-2, 22 - 8 * t, 60);

describe("address view", () => {
  test("sits behind the ball looking downrange, on the golfer's side", () => {
    const right = addressView("Right");
    expect(right.position.z).toBeLessThan(-3);
    expect(right.position.y).toBeGreaterThan(1);
    expect(right.target.z).toBeGreaterThan(10);
    expect(right.position.x).toBeGreaterThan(0);

    const left = addressView("Left");
    expect(left.position.x).toBeCloseTo(-right.position.x);
    expect(left.position.z).toBeCloseTo(right.position.z);
  });

  test("a new director starts there", () => {
    const director = new CameraDirector("Right");
    expect(director.state).toBe(ADDRESS);
    expect(director.position.equals(addressView("Right").position)).toBe(true);
  });
});

describe("flight view", () => {
  test("trails the ball along its line of travel and looks ahead of it", () => {
    const ball = new Vector3(5, 20, 100);
    const view = flightView(ball, new Vector3(0, 5, 50));
    expect(view.position.z).toBeCloseTo(90);
    expect(view.position.x).toBeCloseTo(5);
    expect(view.position.y).toBeGreaterThan(ball.y);
    expect(view.target.z).toBeGreaterThan(ball.z);
  });

  test("rises higher above the ball on the way down", () => {
    const ball = new Vector3(0, 20, 150);
    const rising = flightView(ball, new Vector3(0, 10, 40));
    const falling = flightView(ball, new Vector3(0, -25, 30));
    expect(falling.position.y).toBeGreaterThan(rising.position.y);
  });

  test("never goes underground and copes with a ball that has no velocity", () => {
    const view = flightView(new Vector3(0, 0, 0), new Vector3(0, 0, 0));
    expect(view.position.y).toBeGreaterThanOrEqual(1.2);
    expect(Number.isFinite(view.position.z)).toBe(true);
    expect(view.position.z).toBeLessThan(0);
  });
});

describe("landed view", () => {
  test("stops short of the ball and looks at it", () => {
    const landing = new Vector3(-20, 0, 220);
    const view = landedView(landing, new Vector3(-3, -20, 30), "Right");
    expect(view.position.z).toBeLessThan(landing.z);
    expect(view.position.y).toBeGreaterThan(2);
    expect(view.target.distanceTo(landing)).toBeLessThan(1);
    expect(view.position.distanceTo(landing)).toBeLessThan(20);
  });
});

describe("CameraDirector through a whole shot", () => {
  test("stays at address through the swing, then follows the ball, then settles on the landing spot", () => {
    const director = new CameraDirector("Right");
    const start = director.position.clone();

    for (let i = 0; i < 60; i++)
      director.update(DT, { state: SWING, side: "Right" });
    expect(director.state).toBe(SWING);
    expect(director.position.distanceTo(start)).toBeLessThan(1.5);

    const flightSeconds = 5.5;
    let previous = director.position.clone();
    let maxStep = 0;
    for (let t = 0; t < flightSeconds; t += DT) {
      const ball = ballAt(t);
      director.update(DT, {
        state: FLIGHT,
        side: "Right",
        ball,
        velocity: velocityAt(t),
      });
      // Always behind the ball, above ground, and moving without jumps.
      expect(director.position.z).toBeLessThan(ball.z);
      expect(director.position.y).toBeGreaterThanOrEqual(1.2);
      maxStep = Math.max(maxStep, director.position.distanceTo(previous));
      previous = director.position.clone();
    }
    expect(director.state).toBe(FLIGHT);
    expect(maxStep).toBeLessThan(1.5);

    // By the end of the flight it has travelled downrange with the ball and
    // is looking right at it.
    const lastBall = ballAt(flightSeconds);
    expect(director.position.z).toBeGreaterThan(lastBall.z - 60);
    expect(director.target.distanceTo(lastBall)).toBeLessThan(12);

    const landing = lastBall.clone().setY(0);
    for (let i = 0; i < 240; i++) {
      director.update(DT, {
        state: LANDED,
        side: "Right",
        landing,
        velocity: velocityAt(flightSeconds),
      });
    }
    expect(director.target.distanceTo(landing)).toBeLessThan(1.5);
    expect(director.position.distanceTo(landing)).toBeLessThan(20);
  });

  test("holds back for a beat after impact before chasing", () => {
    const director = new CameraDirector("Right");
    const start = director.position.clone();
    for (let t = 0; t < 0.25; t += DT) {
      director.update(DT, {
        state: FLIGHT,
        side: "Right",
        ball: ballAt(t),
        velocity: velocityAt(t),
      });
    }
    expect(director.position.distanceTo(start)).toBeLessThan(1);
  });

  test("stays out of the treeline when a wild shot lands in it", () => {
    const director = new CameraDirector("Right");
    const landing = new Vector3(110, 0, 300);
    for (let i = 0; i < 600; i++) {
      director.update(DT, {
        state: LANDED,
        side: "Right",
        landing,
        velocity: new Vector3(20, -20, 30),
      });
    }
    expect(Math.abs(director.position.x)).toBeLessThanOrEqual(MAX_OFFLINE);
    expect(director.target.distanceTo(landing)).toBeLessThan(1.5);
  });

  test("reset cuts back to the address view for the given side", () => {
    const director = new CameraDirector("Right");
    director.update(DT, {
      state: FLIGHT,
      side: "Right",
      ball: new Vector3(0, 30, 200),
      velocity: new Vector3(0, 0, 40),
    });
    director.reset("Left");
    expect(director.state).toBe(ADDRESS);
    expect(director.position.equals(addressView("Left").position)).toBe(true);
  });
});

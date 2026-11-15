import {
  launchConditions,
  driverLaunch,
  spinAxisTiltDegrees,
  FACE_START_WEIGHT,
} from "./launch-conditions";

const setup = (overrides = {}) =>
  launchConditions({
    faceAngle: 0,
    pathAngle: 0,
    swingSpeedMPH: 95,
    side: "Right",
    ...overrides,
  });

describe("driverLaunch", () => {
  test("faster swings launch lower with less spin and a better strike", () => {
    const slow = driverLaunch(80);
    const tour = driverLaunch(113);
    const fast = driverLaunch(140);
    expect(slow.launchAngleDegrees).toBeGreaterThan(tour.launchAngleDegrees);
    expect(tour.launchAngleDegrees).toBeGreaterThan(fast.launchAngleDegrees);
    expect(slow.backspinRPM).toBeGreaterThan(fast.backspinRPM);
    expect(slow.smashFactor).toBeLessThan(fast.smashFactor);
    expect(fast.smashFactor).toBeLessThanOrEqual(1.5);
  });

  test("is close to PGA Tour averages at tour speed (10.9°, 2686 rpm)", () => {
    const tour = driverLaunch(113);
    expect(tour.launchAngleDegrees).toBeCloseTo(11.4, 1);
    expect(Math.abs(tour.backspinRPM - 2686)).toBeLessThan(100);
  });
});

describe("spinAxisTiltDegrees", () => {
  test("each degree of face-to-path tilts the axis about four and a half degrees", () => {
    expect(spinAxisTiltDegrees(0)).toBeCloseTo(0);
    expect(spinAxisTiltDegrees(1)).toBeGreaterThan(4);
    expect(spinAxisTiltDegrees(1)).toBeLessThan(5);
    expect(spinAxisTiltDegrees(-3)).toBeCloseTo(-spinAxisTiltDegrees(3));
    expect(spinAxisTiltDegrees(12)).toBeLessThan(60);
  });
});

describe("launchConditions", () => {
  test("passes swing speed through and uses the driver numbers for that speed", () => {
    const driver = driverLaunch(120);
    expect(setup({ swingSpeedMPH: 120 })).toMatchObject({
      initSpeedMPH: 120,
      smashFactor: driver.smashFactor,
      initVerticalAngleDegrees: driver.launchAngleDegrees,
      initBackspinRPM: driver.backspinRPM,
    });
  });

  test("square face and path launch straight with no axis tilt", () => {
    const launch = setup();
    expect(launch.initHorizontalAngleDegrees).toBeCloseTo(0);
    expect(launch.initSpinAngle).toBeCloseTo(0);
  });

  test("start direction is mostly the face, partly the path", () => {
    expect(
      setup({ faceAngle: 4, pathAngle: 0 }).initHorizontalAngleDegrees,
    ).toBeCloseTo(4 * FACE_START_WEIGHT);
    expect(
      setup({ faceAngle: 0, pathAngle: 4 }).initHorizontalAngleDegrees,
    ).toBeCloseTo(4 * (1 - FACE_START_WEIGHT));
  });

  test("curve comes from face-to-path, not face alone", () => {
    expect(setup({ faceAngle: 5, pathAngle: 5 }).initSpinAngle).toBeCloseTo(0);
    expect(setup({ faceAngle: 4, pathAngle: 1 }).initSpinAngle).toBeCloseTo(
      -spinAxisTiltDegrees(3),
    );
    expect(setup({ faceAngle: 1, pathAngle: 4 }).initSpinAngle).toBeCloseTo(
      spinAxisTiltDegrees(3),
    );
  });

  test("a left-hander is the mirror image", () => {
    const right = setup({ faceAngle: 3, pathAngle: -2 });
    const left = setup({ faceAngle: 3, pathAngle: -2, side: "Left" });
    expect(left.initHorizontalAngleDegrees).toBeCloseTo(
      -right.initHorizontalAngleDegrees,
    );
    expect(left.initSpinAngle).toBeCloseTo(-right.initSpinAngle);
  });
});

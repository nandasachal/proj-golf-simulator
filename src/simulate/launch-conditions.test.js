import {
  launchConditions,
  DRIVER,
  FACE_START_WEIGHT,
  AXIS_TILT_PER_DEGREE,
} from "./launch-conditions";

const setup = (overrides = {}) =>
  launchConditions({
    faceAngle: 0,
    pathAngle: 0,
    swingSpeedMPH: 95,
    side: "Right",
    ...overrides,
  });

describe("launchConditions", () => {
  test("passes swing speed through and uses driver launch numbers", () => {
    expect(setup({ swingSpeedMPH: 120 })).toMatchObject({
      initSpeedMPH: 120,
      smashFactor: DRIVER.smashFactor,
      initVerticalAngleDegrees: DRIVER.launchAngleDegrees,
      initBackspinRPM: DRIVER.backspinRPM,
    });
  });

  test("square face and path launch straight with no axis tilt", () => {
    const launch = setup();
    expect(launch.initHorizontalAngleDegrees).toBeCloseTo(0);
    expect(launch.initSpinAngle).toBeCloseTo(0);
  });

  test("start direction is mostly the face, partly the path", () => {
    expect(
      setup({ faceAngle: 4, pathAngle: 0 }).initHorizontalAngleDegrees
    ).toBeCloseTo(4 * FACE_START_WEIGHT);
    expect(
      setup({ faceAngle: 0, pathAngle: 4 }).initHorizontalAngleDegrees
    ).toBeCloseTo(4 * (1 - FACE_START_WEIGHT));
  });

  test("curve comes from face-to-path, not face alone", () => {
    expect(setup({ faceAngle: 5, pathAngle: 5 }).initSpinAngle).toBeCloseTo(0);
    expect(setup({ faceAngle: 4, pathAngle: 1 }).initSpinAngle).toBeCloseTo(
      -3 * AXIS_TILT_PER_DEGREE
    );
    expect(setup({ faceAngle: 1, pathAngle: 4 }).initSpinAngle).toBeCloseTo(
      3 * AXIS_TILT_PER_DEGREE
    );
  });

  test("a left-hander is the mirror image", () => {
    const right = setup({ faceAngle: 3, pathAngle: -2 });
    const left = setup({ faceAngle: 3, pathAngle: -2, side: "Left" });
    expect(left.initHorizontalAngleDegrees).toBeCloseTo(
      -right.initHorizontalAngleDegrees
    );
    expect(left.initSpinAngle).toBeCloseTo(-right.initSpinAngle);
  });
});

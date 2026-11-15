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

describe("driverLaunch with attack angle and loft", () => {
  test("a level attack with standard loft is the baseline for that speed", () => {
    for (const speed of [80, 105, 140]) {
      const base = driverLaunch(speed);
      expect(driverLaunch(speed, { attackAngle: 0, loftChange: 0 })).toEqual(
        base,
      );
      expect(base.spinLoftRatio).toBeCloseTo(1);
      expect(base.spinLoftDegrees).toBeCloseTo(base.dynamicLoftDegrees);
      // launch is 85% of the loft delivered when the attack is level
      expect(base.launchAngleDegrees).toBeCloseTo(
        0.85 * base.dynamicLoftDegrees,
      );
    }
    expect(driverLaunch(105).dynamicLoftDegrees).toBeCloseTo(14.1, 1);
  });

  test("hitting up with the same loft launches higher, spins less and strikes better", () => {
    const level = driverLaunch(105);
    const up = driverLaunch(105, { attackAngle: 5 });
    const down = driverLaunch(105, { attackAngle: -5 });

    expect(up.dynamicLoftDegrees).toBeCloseTo(level.dynamicLoftDegrees);
    expect(up.launchAngleDegrees).toBeCloseTo(level.launchAngleDegrees + 0.75);
    expect(up.backspinRPM).toBeLessThan(level.backspinRPM - 500);
    expect(up.smashFactor).toBeGreaterThan(level.smashFactor);
    expect(up.smashFactor).toBeLessThanOrEqual(1.5);

    expect(down.launchAngleDegrees).toBeLessThan(level.launchAngleDegrees);
    expect(down.backspinRPM).toBeGreaterThan(level.backspinRPM + 500);
    expect(down.smashFactor).toBeLessThan(level.smashFactor);
  });

  test("adding loft launches higher with more spin and a weaker strike", () => {
    const standard = driverLaunch(105);
    const more = driverLaunch(105, { loftChange: 4 });
    const less = driverLaunch(105, { loftChange: -4 });

    expect(more.launchAngleDegrees).toBeCloseTo(
      standard.launchAngleDegrees + 3.4,
    );
    expect(more.backspinRPM).toBeGreaterThan(standard.backspinRPM);
    expect(more.smashFactor).toBeLessThan(standard.smashFactor);
    expect(less.launchAngleDegrees).toBeLessThan(standard.launchAngleDegrees);
    expect(less.backspinRPM).toBeLessThan(standard.backspinRPM);
  });

  test("backspin is proportional to spin loft", () => {
    const standard = driverLaunch(105);
    const up = driverLaunch(105, { attackAngle: 3 });
    expect(up.backspinRPM / standard.backspinRPM).toBeCloseTo(
      up.spinLoftDegrees / standard.spinLoftDegrees,
    );
  });

  test("the extremes of every control still give a playable launch", () => {
    for (const speed of [80, 140]) {
      for (const attackAngle of [-5, 5]) {
        for (const loftChange of [-4, 4]) {
          const launch = driverLaunch(speed, { attackAngle, loftChange });
          expect(launch.spinLoftDegrees).toBeGreaterThanOrEqual(6);
          expect(launch.backspinRPM).toBeGreaterThan(900);
          expect(launch.backspinRPM).toBeLessThan(6000);
          expect(launch.launchAngleDegrees).toBeGreaterThan(4);
          expect(launch.launchAngleDegrees).toBeLessThan(20);
          expect(launch.smashFactor).toBeGreaterThan(1.3);
          expect(launch.smashFactor).toBeLessThanOrEqual(1.5);
        }
      }
    }
  });
});

describe("spinAxisTiltDegrees", () => {
  test("more spin loft means less tilt for the same face-to-path", () => {
    expect(spinAxisTiltDegrees(3, 1.3)).toBeLessThan(spinAxisTiltDegrees(3, 1));
    expect(spinAxisTiltDegrees(3, 0.7)).toBeGreaterThan(
      spinAxisTiltDegrees(3, 1),
    );
    expect(spinAxisTiltDegrees(3)).toBeCloseTo(spinAxisTiltDegrees(3, 1));
  });

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

  test("attack angle and loft reach the launch numbers and the curve", () => {
    const level = setup({ faceAngle: 3 });
    const up = setup({ faceAngle: 3, attackAngle: 5 });
    expect(up.initVerticalAngleDegrees).toBeGreaterThan(
      level.initVerticalAngleDegrees,
    );
    expect(up.initBackspinRPM).toBeLessThan(level.initBackspinRPM);
    expect(up.smashFactor).toBeGreaterThan(level.smashFactor);
    // less spin loft: the same open face tilts the axis more
    expect(Math.abs(up.initSpinAngle)).toBeGreaterThan(
      Math.abs(level.initSpinAngle),
    );
    // start direction is not affected
    expect(up.initHorizontalAngleDegrees).toBeCloseTo(
      level.initHorizontalAngleDegrees,
    );

    const lofted = setup({ loftChange: 4 });
    expect(lofted.initVerticalAngleDegrees).toBeGreaterThan(
      setup().initVerticalAngleDegrees,
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

import {
  clubSetup,
  describeClubSetup,
  groundDirection,
  risingDirection,
  DRIVER_STATIC_LOFT_DEGREES,
} from "./club-setup";
import { driverLaunch } from "./launch-conditions";

const setup = (overrides = {}) =>
  clubSetup({
    faceAngle: 0,
    pathAngle: 0,
    swingSpeed: 105,
    side: "Right",
    ...overrides,
  });

describe("clubSetup", () => {
  test("a square, centred, level driver points everything down the line", () => {
    const s = setup();
    expect(s.faceDegrees).toBe(0);
    expect(s.pathDegrees).toBe(0);
    expect(s.startDegrees).toBe(0);
    expect(s.attackDegrees).toBe(0);
    expect(s.strikeCm).toBe(0);
    expect(s.mirror).toBe(1);
    expect(s.launchDegrees).toBeCloseTo(driverLaunch(105).launchAngleDegrees);
    expect(s.labels).toMatchObject({
      face: "square",
      path: "square",
      start: "straight",
      aim: "straight",
      attack: "level",
      strike: "centre",
    });
  });

  test("angles are true size and absolute: right of the centre line is positive", () => {
    const s = setup({ faceAngle: 3, pathAngle: -2 });
    expect(s.faceDegrees).toBe(3);
    expect(s.pathDegrees).toBe(-2);
    expect(s.startDegrees).toBeCloseTo(0.85 * 3 + 0.15 * -2);
    expect(s.labels.face).toBe("3° open");
    expect(s.labels.path).toBe("2° out-to-in");
    expect(s.labels.start).toBe("2.3° right");
  });

  test("a left-hander's open face points left on the page, with the same words", () => {
    const s = setup({ faceAngle: 3, pathAngle: -2, side: "Left" });
    expect(s.mirror).toBe(-1);
    expect(s.faceDegrees).toBe(-3);
    expect(s.pathDegrees).toBe(2);
    expect(s.labels.face).toBe("3° open");
    expect(s.labels.start).toBe("2.3° left");
  });

  test("aim turns face, path and start together, for either hand", () => {
    const right = setup({ faceAngle: 2, aim: 5 });
    expect(right.aimDegrees).toBe(5);
    expect(right.faceDegrees).toBe(7);
    expect(right.pathDegrees).toBe(5);
    expect(right.labels.aim).toBe("5° right");

    const left = setup({ faceAngle: 2, aim: 5, side: "Left" });
    expect(left.faceDegrees).toBe(3);
    expect(left.pathDegrees).toBe(5);
  });

  test("loft and attack angle carry through, and the head tips by the loft beyond its own", () => {
    const s = setup({ attackAngle: 4, loftChange: 2 });
    const launch = driverLaunch(105, { attackAngle: 4, loftChange: 2 });
    expect(s.attackDegrees).toBe(4);
    expect(s.dynamicLoftDegrees).toBeCloseTo(launch.dynamicLoftDegrees);
    expect(s.loftTiltDegrees).toBeCloseTo(
      launch.dynamicLoftDegrees - DRIVER_STATIC_LOFT_DEGREES,
    );
    expect(s.launchDegrees).toBeCloseTo(launch.launchAngleDegrees);
    expect(s.labels.attack).toBe("4° up");
    expect(s.labels.loft).toBe("16.1°");
  });

  test("strike is in centimetres toward the toe, and shifts where the ball starts", () => {
    const toe = setup({ strike: 0.5 });
    expect(toe.strikeCm).toBeCloseTo(1.27);
    expect(toe.startDegrees).toBeGreaterThan(1);
    expect(toe.labels.strike).toBe("0.5 in toe");
    expect(setup({ strike: -0.75 }).labels.strike).toBe("0.75 in heel");
  });

  test("describeClubSetup reads as one sentence", () => {
    expect(
      describeClubSetup(
        setup({ faceAngle: 2, pathAngle: -1, swingSpeed: 100 }),
      ),
    ).toBe(
      "face 2° open, path 1° out-to-in, ball starts 1.5° right, aim straight, attack level, 14.5° of loft, launches at 12.4° with 2815 rpm of backspin, struck in the centre",
    );
    expect(describeClubSetup(setup({ strike: 0.5 }))).toMatch(
      /struck 0\.5 in toe side$/,
    );
  });
});

describe("directions in the club scene", () => {
  test("straight is +z, right is -x", () => {
    expect(groundDirection(0)).toEqual({ x: -0, y: 0, z: 1 });
    const right = groundDirection(90);
    expect(right.x).toBeCloseTo(-1);
    expect(right.z).toBeCloseTo(0);
    expect(groundDirection(-10).x).toBeGreaterThan(0);
  });

  test("a rising direction keeps its heading and unit length", () => {
    const d = risingDirection(5, 12);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(Math.sin((12 * Math.PI) / 180));
    const flat = groundDirection(5);
    expect(d.x / d.z).toBeCloseTo(flat.x / flat.z);
    expect(risingDirection(0, -3).y).toBeLessThan(0);
  });
});

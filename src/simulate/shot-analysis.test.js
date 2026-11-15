import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { analyzeShot, shotShape } from "./shot-analysis";
import { groundRun, turfParameters, TURF_PRESETS } from "./ground";

const shoot = (faceAngle, pathAngle, side, swingSpeedMPH) =>
  new Shot(launchConditions({ faceAngle, pathAngle, swingSpeedMPH, side }));

const hit = (faceAngle, pathAngle, side = "Right", swingSpeedMPH = 95) =>
  analyzeShot(shoot(faceAngle, pathAngle, side, swingSpeedMPH), side);

const hitWithRun = (
  faceAngle,
  pathAngle,
  swingSpeedMPH = 95,
  turf = "normal",
) => {
  const shot = shoot(faceAngle, pathAngle, "Right", swingSpeedMPH);
  const run = groundRun(
    shot.points[shot.points.length - 1],
    turfParameters(TURF_PRESETS[turf]),
  );
  return analyzeShot(shot, "Right", run);
};

describe("analyzeShot", () => {
  test("a square 95 mph driver swing carries a realistic distance, dead straight", () => {
    const result = hit(0, 0);
    expect(result.carryYards).toBeGreaterThan(200);
    expect(result.carryYards).toBeLessThan(235);
    expect(result.apexYards).toBeGreaterThan(15);
    expect(result.apexYards).toBeLessThan(35);
    expect(result.flightSeconds).toBeGreaterThan(4);
    expect(result.flightSeconds).toBeLessThan(7.5);
    expect(result.offlineYards).toBeCloseTo(0);
    expect(result.shape).toBe("Straight");
  });

  test("the whole swing-speed slider stays on a 350 yard range", () => {
    expect(hit(0, 0, "Right", 80).carryYards).toBeGreaterThan(150);
    expect(hit(0, 0, "Right", 140).carryYards).toBeLessThan(350);
  });

  test.each([
    [0, 0, "Straight"],
    [3, 3, "Push"],
    [-3, -3, "Pull"],
    [1, -1, "Fade"],
    [-1, 1, "Draw"],
    [6, 0, "Push Slice"],
    [-6, 0, "Pull Hook"],
    [0, 6, "Hook"],
    [0, -6, "Slice"],
    [3, 6, "Push Draw"],
    [-3, -6, "Pull Fade"],
  ])("right-hander face %i path %i is a %s", (face, path, shape) => {
    expect(hit(face, path).shape).toBe(shape);
  });

  test("an open face sends a right-hander's ball right and a left-hander's left, same shape name", () => {
    const right = hit(4, 0, "Right");
    const left = hit(4, 0, "Left");
    expect(right.offlineYards).toBeGreaterThan(10);
    expect(right.curveYards).toBeGreaterThan(5);
    expect(left.carryOfflineYards).toBeCloseTo(-right.carryOfflineYards);
    expect(left.offlineYards).toBeCloseTo(-right.offlineYards);
    expect(left.curveYards).toBeCloseTo(-right.curveYards);
    expect(left.shape).toBe(right.shape);
  });

  test("bigger face-to-path gap curves more", () => {
    expect(Math.abs(hit(4, 0).curveYards)).toBeGreaterThan(
      Math.abs(hit(2, 0).curveYards),
    );
  });
});

describe("analyzeShot with bounce and roll", () => {
  test("without a run the ball stops where it lands", () => {
    const result = hit(2, 0);
    expect(result.runYards).toBe(0);
    expect(result.totalYards).toBeCloseTo(result.carryYards);
    expect(result.offlineYards).toBeCloseTo(result.carryOfflineYards);
  });

  test("total is carry plus run for a straight drive on normal turf", () => {
    const result = hitWithRun(0, 0);
    expect(result.runYards).toBeGreaterThan(15);
    expect(result.runYards).toBeLessThan(32);
    expect(result.totalYards).toBeCloseTo(
      result.carryYards + result.runYards,
      1,
    );
    expect(result.hops).toBeGreaterThan(0);
    expect(result.runSeconds).toBeGreaterThan(1);
  });

  test("slower swings land shallower and run farther; the fastest still fits the range", () => {
    expect(hitWithRun(0, 0, 80).runYards).toBeGreaterThan(
      hitWithRun(0, 0, 140).runYards,
    );
    expect(hitWithRun(0, 0, 140, "firm").totalYards).toBeLessThan(385);
  });

  test("firm turf adds distance, soft turf takes it away, carry is unchanged", () => {
    const soft = hitWithRun(0, 0, 110, "soft");
    const normal = hitWithRun(0, 0, 110, "normal");
    const firm = hitWithRun(0, 0, 110, "firm");
    expect(soft.totalYards).toBeLessThan(normal.totalYards);
    expect(normal.totalYards).toBeLessThan(firm.totalYards);
    expect(soft.carryYards).toBeCloseTo(firm.carryYards);
  });

  test("a slice keeps running away from the target after it lands", () => {
    const result = hitWithRun(4, 0);
    expect(result.carryOfflineYards).toBeGreaterThan(20);
    expect(result.offlineYards).toBeGreaterThan(result.carryOfflineYards + 2);
    expect(result.shape).toBe("Push Slice");
  });
});

describe("shotShape", () => {
  test("zero carry does not divide by zero", () => {
    expect(
      shotShape({
        startDirectionDegrees: 0,
        curveYards: 0,
        carryYards: 0,
        side: "Right",
      }),
    ).toBe("Straight");
  });
});

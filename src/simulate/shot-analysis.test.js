import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { analyzeShot, shotShape } from "./shot-analysis";

const hit = (faceAngle, pathAngle, side = "Right", swingSpeedMPH = 95) =>
  analyzeShot(
    new Shot(launchConditions({ faceAngle, pathAngle, swingSpeedMPH, side })),
    side,
  );

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

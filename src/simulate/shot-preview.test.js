import { previewShot } from "./shot-preview";

const base = {
  faceAngle: 0,
  pathAngle: 0,
  swingSpeedMPH: 100,
  attackAngle: 0,
  loftChange: 0,
  strikeInches: 0,
  aim: 0,
  side: "Right",
};
const end = (preview) => preview.sketch[preview.sketch.length - 1];

describe("previewShot", () => {
  test("a square setup is straight: the sketch runs up the centre line", () => {
    const preview = previewShot(base);
    expect(preview.shape).toBe("Straight");
    expect(preview.sketch[0]).toEqual({ across: 0, along: 0 });
    expect(end(preview).along).toBeCloseTo(1);
    expect(preview.sketch.every((p) => Math.abs(p.across) < 1e-9)).toBe(true);
  });

  test("names the shape and bends the sketch the same way", () => {
    const fade = previewShot({ ...base, faceAngle: 3, pathAngle: -2 });
    expect(fade.shape).toBe("Push Slice");
    expect(end(fade).across).toBeGreaterThan(0.05);

    const draw = previewShot({ ...base, faceAngle: -1, pathAngle: 2 });
    expect(draw.shape).toMatch(/Draw|Hook/);
    expect(end(draw).across).toBeLessThan(0);
  });

  test("aim turns the sketch but not the name of the shape", () => {
    const aimed = previewShot({ ...base, aim: 8 });
    expect(aimed.shape).toBe("Straight");
    expect(end(aimed).across).toBeCloseTo(Math.tan((8 * Math.PI) / 180), 2);
  });

  test("a left-hander's open face goes left under the same name", () => {
    const right = previewShot({ ...base, faceAngle: 3 });
    const left = previewShot({ ...base, faceAngle: 3, side: "Left" });
    expect(left.shape).toBe(right.shape);
    expect(end(left).across).toBeCloseTo(-end(right).across, 6);
  });

  test("gives no distance, so it cannot be used to read off the carry", () => {
    expect(Object.keys(previewShot(base)).sort()).toEqual(["shape", "sketch"]);
  });
});

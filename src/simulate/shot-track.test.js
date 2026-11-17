import { shotTrack, mapLength } from "./shot-track";

const line = (count, step) =>
  Array.from({ length: count }, (_, i) => ({ x: -i * step.x, z: i * step.z }));

describe("shotTrack", () => {
  test("keeps the first and last points and thins the rest", () => {
    const air = line(501, { x: 0.02, z: 0.5 });
    const track = shotTrack(air, [], 1);
    expect(track.air.length).toBeLessThanOrEqual(41);
    expect(track.air[0]).toEqual([0, 0]);
    expect(track.air[track.air.length - 1]).toEqual([10, 250]);
    expect(track.run).toEqual([]);
  });

  test("right of the centre line is positive, and units are scaled to yards", () => {
    const track = shotTrack(
      [
        { x: 0, z: 0 },
        { x: -10, z: 100 },
      ],
      [
        { x: -10, z: 100 },
        { x: -12, z: 120 },
      ],
      1.1,
    );
    expect(track.air[1]).toEqual([11, 110]);
    expect(track.run[1]).toEqual([13.2, 132]);
  });

  test("carries the target the shot was hit at", () => {
    const track = shotTrack([{ x: 0, z: 0 }], [], 1, {
      x: 20,
      z: 180,
      radius: 14,
    });
    expect(track.target).toEqual({
      right: -20,
      downrange: 180,
      radius: 14,
      air: false,
    });
  });
});

describe("mapLength", () => {
  test("shows to the next 50 yd past the ball, at least 150", () => {
    const short = shotTrack(line(3, { x: 0, z: 30 }), [], 1);
    expect(mapLength(short)).toBe(150);
    const long = shotTrack(line(3, { x: 0, z: 124 }), [], 1);
    expect(mapLength(long)).toBe(300);
  });

  test("makes room for a target beyond the ball", () => {
    const track = shotTrack(line(3, { x: 0, z: 50 }), [], 1, {
      x: 0,
      z: 290,
      radius: 18,
    });
    expect(mapLength(track)).toBe(350);
  });
});

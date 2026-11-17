import { SHIPS, shipPlace } from "./fleet";

describe("the hidden fleet", () => {
  test("ships fly toward -x at a steady, slow pace", () => {
    const before = shipPlace(0, 0);
    const after = shipPlace(0, 10);
    expect(after.x).toBeLessThan(before.x);
    expect(before.x - after.x).toBeCloseTo(140);
  });

  test("a ship stays inside the crossing and wraps while invisible", () => {
    let last = shipPlace(SHIPS[0].start, 0);
    for (let seconds = 1; seconds < 900; seconds += 1) {
      const place = shipPlace(SHIPS[0].start, seconds);
      expect(Math.abs(place.x)).toBeLessThanOrEqual(3000);
      expect(place.opacity).toBeGreaterThanOrEqual(0);
      expect(place.opacity).toBeLessThanOrEqual(1);
      // the jump back to the start happens only when nothing can be seen
      const jumped = place.x > last.x;
      expect(jumped ? place.opacity : 0).toBeLessThan(0.05);
      last = place;
    }
  });

  test("ships are solid over the range", () => {
    expect(shipPlace(0, 0).opacity).toBe(1);
  });
});

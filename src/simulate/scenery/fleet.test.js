import { PATROLS, SHIPS, escortPlace, patrolPlace, shipPlace } from "./fleet";

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

  test("patrols fly level circles over the range, far above any ball", () => {
    for (const patrol of PATROLS) {
      for (const seconds of [0, 17, 240]) {
        const place = patrolPlace(patrol, seconds);
        expect(
          Math.hypot(place.x - patrol.centreX, place.z - patrol.centreZ),
        ).toBeCloseTo(patrol.radius);
        expect(place.y).toBeGreaterThan(120);
      }
    }
    expect(PATROLS.some((patrol) => patrol.direction < 0)).toBe(true);
    expect(PATROLS.some((patrol) => patrol.direction > 0)).toBe(true);
  });

  test("escorts stay with their ship as it crosses", () => {
    const spec = SHIPS[0];
    for (const seconds of [0, 30, 200]) {
      const ship = { spec, x: shipPlace(spec.start, seconds).x };
      for (let flight = 0; flight < 5; flight++) {
        const place = escortPlace(flight, seconds, ship);
        expect(Math.abs(place.x - ship.x)).toBeLessThan(spec.length);
        expect(Math.abs(place.z - spec.z)).toBeLessThan(spec.length);
        expect(place.y).toBeGreaterThan(spec.y - spec.length * 0.1);
      }
    }
  });
});

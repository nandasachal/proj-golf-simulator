import { PerspectiveCamera } from "three";
import {
  FLEET_FAR,
  STRIKE_COVERED,
  STRIKE_RESTART,
  STRIKE_SECONDS,
  TRIBUTARIES,
  tributaryReach,
  newStrike,
  stationInSight,
  stepStrike,
  strikeAt,
  PATROLS,
  SHIPS,
  STATION,
  escortPlace,
  patrolPlace,
  shipPlace,
} from "./fleet";

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

  test("one ship passes over the range itself, above every patrol", () => {
    const overhead = SHIPS.filter((ship) => ship.z < 400);
    expect(overhead).toHaveLength(1);
    for (const patrol of PATROLS) {
      expect(overhead[0].y).toBeGreaterThan(patrol.height + 200);
    }
  });

  test("the station is high in the sky and near enough to be drawn", () => {
    const { x, y, z, radius } = STATION;
    expect(Math.hypot(x, y, z) + radius).toBeLessThan(FLEET_FAR);
    const elevation = Math.atan2(y, Math.hypot(x, z));
    expect(elevation).toBeGreaterThan(0.6);
  });
});

describe("the station's strike", () => {
  const cameraLookingAt = (x, y, z) => {
    const camera = new PerspectiveCamera(48, 4 / 3, 0.5, FLEET_FAR);
    camera.position.set(0, 2.1, -6);
    camera.lookAt(x, y, z);
    camera.updateMatrixWorld();
    return camera;
  };

  test("the station is in sight only when the camera is turned up to it", () => {
    expect(stationInSight(cameraLookingAt(0, 1, 100))).toBe(false);
    expect(
      stationInSight(cameraLookingAt(STATION.x, STATION.y, STATION.z)),
    ).toBe(true);
    // straight away from it: behind the camera, not in the picture
    expect(
      stationInSight(cameraLookingAt(-STATION.x, -STATION.y, -STATION.z)),
    ).toBe(false);
  });

  test("charges, fires, then blasts over the view inside half a second", () => {
    expect(strikeAt(1.2)).toMatchObject({ beam: false, blast: 0 });
    expect(strikeAt(1.2).charge).toBeCloseTo(0.5);
    const firing = strikeAt(STRIKE_COVERED - 0.6);
    expect(firing).toMatchObject({ charge: 1, beam: true, blast: 0 });
    expect(strikeAt(STRIKE_COVERED - 0.5).blast).toBeCloseTo(0);
    const covered = strikeAt(STRIKE_COVERED + 0.01);
    expect(covered).toMatchObject({
      blast: 1,
      beam: false,
      charge: 0,
      cover: 1,
    });
    // it burns, fully covering the view, until the game restarts; then clears
    expect(strikeAt(STRIKE_RESTART - 0.01).cover).toBe(1);
    expect(strikeAt(STRIKE_RESTART + 0.3).cover).toBeLessThan(1);
    expect(strikeAt(STRIKE_SECONDS).cover).toBeCloseTo(0);
    // and cools all the way through
    expect(strikeAt(STRIKE_COVERED - 0.5).heat).toBeCloseTo(1);
    expect(strikeAt(STRIKE_RESTART).heat).toBeLessThan(
      strikeAt(STRIKE_COVERED).heat,
    );
  });

  test("the dish's beams light one after another, all in before it fires", () => {
    for (let i = 1; i < TRIBUTARIES; i++) {
      expect(tributaryReach(0.3, i)).toBeLessThanOrEqual(
        tributaryReach(0.3, i - 1),
      );
    }
    expect(tributaryReach(0.05, 0)).toBeGreaterThan(0);
    expect(tributaryReach(0.05, TRIBUTARIES - 1)).toBe(0);
    expect(tributaryReach(0.7, TRIBUTARIES - 1)).toBe(1);
  });

  test("a look sets off one strike, which restarts the game once", () => {
    const strike = newStrike();
    let restarts = 0;
    const run = (seconds, inSight) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        if (stepStrike(strike, 1 / 60, inSight)) restarts += 1;
      }
    };
    // a glance is not enough
    run(0.2, true);
    run(0.2, false);
    expect(strike.seconds).toBeNull();
    run(0.5, true);
    expect(strike.seconds).not.toBeNull();
    // it runs to the end even if the view moves off it
    run(STRIKE_RESTART, false);
    expect(restarts).toBe(1);
    run(2, false);
    expect(strike.seconds).toBeNull();
    // still looking at it afterwards does not fire again; looking away and
    // back does
    const again = newStrike();
    let fired = 0;
    for (let t = 0; t < 20; t += 1 / 60) {
      if (stepStrike(again, 1 / 60, true)) fired += 1;
    }
    expect(fired).toBe(1);
    stepStrike(again, 1 / 60, false);
    for (let t = 0; t < 5; t += 1 / 60) {
      if (stepStrike(again, 1 / 60, true)) fired += 1;
    }
    expect(fired).toBe(2);
  });
});

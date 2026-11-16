import * as THREE from "three";
import { buildSwingClub, fitShaft, ADDRESS_SHAFT_DEGREES } from "./golfer-club";
import { getClub, DEFAULT_CLUB_ID } from "./clubs";

describe("fitShaft", () => {
  const fit = (overrides = {}) =>
    fitShaft({
      point: { x: 3.65, y: -2 },
      ground: -2,
      length: 85,
      shaftDegrees: ADDRESS_SHAFT_DEGREES,
      lift: 5.5,
      ...overrides,
    });

  test("lets the head down until its sole is on the ground", () => {
    // The golfer's clubhead point is 5.5 above the ground and the sole 2
    // below the middle of the face.
    const { drop, hands } = fit();
    expect(drop).toBeCloseTo(3.5);
    expect(hands.y).toBeCloseTo(
      85 * Math.sin((ADDRESS_SHAFT_DEGREES * Math.PI) / 180) + 3.5,
    );
  });

  test("never lifts a head that already reaches the ground", () => {
    expect(fit({ lift: 1 }).drop).toBe(0);
    expect(fit({ lift: 2 }).drop).toBe(0);
  });

  test("aims the shaft from its foot at the hands", () => {
    const { hands, lieDegrees, reach } = fit();
    const lie = (lieDegrees * Math.PI) / 180;
    expect(3.65 + reach * Math.cos(lie)).toBeCloseTo(hands.x);
    expect(-2 + reach * Math.sin(lie)).toBeCloseTo(hands.y);
    // More upright than the address line: the face sits toe-side of the shaft.
    expect(lieDegrees).toBeGreaterThan(ADDRESS_SHAFT_DEGREES);
    expect(lieDegrees).toBeLessThan(75);
  });
});

describe("buildSwingClub", () => {
  test("builds without a canvas, with the clubhead a club's length down", () => {
    const club = buildSwingClub(getClub(DEFAULT_CLUB_ID), 0.93);
    expect(club.name).toBe("club");
    const head = club.getObjectByName("clubhead");
    club.updateMatrixWorld(true);
    const at = head.getWorldPosition(new THREE.Vector3());
    expect(at.x).toBeCloseTo(0);
    expect(at.y).toBeCloseTo(-0.93);
    expect(at.z).toBeCloseTo(0);
    expect(() => club.userData.dispose()).not.toThrow();
  });
});

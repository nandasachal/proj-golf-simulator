import { Vector3 } from "three";
import { startOrbit, dragOrbit, zoomOrbit, orbitPosition } from "./orbit-view";

const center = new Vector3(0.6, 1, 0);
const camera = new Vector3(1, 2.1, -6);

describe("orbit view", () => {
  test("starts from where the camera already is", () => {
    const at = orbitPosition(startOrbit(camera, center));
    expect(at.distanceTo(camera)).toBeLessThan(1e-9);
  });

  test("a full turn of dragging comes back round to the start", () => {
    const orbit = startOrbit(camera, center);
    const radius = orbit.radius;
    const pixels = (2 * Math.PI) / 0.006;
    const half = orbitPosition(dragOrbit(orbit, pixels / 2, 0)).clone();
    // half way round: the far side of the golfer, same height and distance
    expect(half.z).toBeGreaterThan(center.z);
    expect(half.y).toBeCloseTo(camera.y, 6);
    expect(half.distanceTo(center)).toBeCloseTo(radius, 6);
    const full = orbitPosition(dragOrbit(orbit, pixels / 2, 0));
    expect(full.distanceTo(camera)).toBeLessThan(1e-6);
  });

  test("never goes under the ground or over the top", () => {
    const orbit = startOrbit(camera, center);
    expect(orbitPosition(dragOrbit(orbit, 0, -5000)).y).toBeGreaterThanOrEqual(
      0.25,
    );
    const top = orbitPosition(dragOrbit(orbit, 0, 10000));
    expect(top.y).toBeLessThan(center.y + orbit.radius);
    expect(Math.hypot(top.x - center.x, top.z - center.z)).toBeGreaterThan(0.5);
  });

  test("zooms within limits", () => {
    const orbit = startOrbit(camera, center);
    expect(zoomOrbit(orbit, 0.01).radius).toBeCloseTo(2.2);
    expect(zoomOrbit(orbit, 1000).radius).toBeCloseTo(16);
  });
});

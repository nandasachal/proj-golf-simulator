import { Vector3 } from "three";
import {
  startOrbit,
  dragOrbit,
  zoomOrbit,
  orbitPosition,
  orbitTarget,
} from "./orbit-view";

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

  test("looks at the golfer until the camera is down at the turf", () => {
    const orbit = startOrbit(camera, center);
    const at = orbitPosition(dragOrbit(orbit, 40, 30)).clone();
    expect(orbitTarget(orbit, at).distanceTo(center)).toBeLessThan(1e-9);
  });

  test("dragging up past the turf tips the view up at the sky", () => {
    const orbit = startOrbit(camera, center);
    const at = orbitPosition(dragOrbit(orbit, 0, -5000)).clone();
    const look = orbitTarget(orbit, at).sub(at).normalize();
    // nearly straight up, but never over the top
    expect(look.y).toBeGreaterThan(0.9);
    expect(look.y).toBeLessThan(1);
    // still facing the way it was: downrange, from behind the golfer
    expect(look.z).toBeGreaterThan(0);
  });

  test("dragging back down brings the view to the golfer before lifting", () => {
    const orbit = startOrbit(camera, center);
    dragOrbit(orbit, 0, -5000);
    dragOrbit(orbit, 0, 100);
    expect(orbit.tilt).toBeGreaterThan(0);
    const low = orbitPosition(orbit).y;
    dragOrbit(orbit, 0, 5000);
    expect(orbit.tilt).toBe(0);
    const at = orbitPosition(orbit).clone();
    expect(at.y).toBeGreaterThan(low);
    expect(orbitTarget(orbit, at).distanceTo(center)).toBeLessThan(1e-9);
  });
});

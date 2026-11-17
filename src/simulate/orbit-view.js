import { Vector3 } from "three";

// Looking round the golfer by dragging: a camera on a sphere about a point at
// the golfer's middle. Pure maths; main.js feeds it pointer movement.

const MIN_PITCH = -0.08;
const MAX_PITCH = 1.35;
const MIN_RADIUS = 2.2;
const MAX_RADIUS = 16;
// Radians of turn per pixel dragged.
const DRAG_SPEED = 0.006;
// Never under the turf.
const MIN_HEIGHT = 0.25;

// Start from where the camera is, so the first drag carries on from the view
// on screen instead of jumping.
export function startOrbit(cameraPosition, center) {
  const offset = new Vector3().subVectors(cameraPosition, center);
  const radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, offset.length()));
  return {
    center: center.clone(),
    radius,
    yaw: Math.atan2(offset.x, offset.z),
    pitch: Math.min(
      MAX_PITCH,
      Math.max(MIN_PITCH, Math.asin(offset.y / offset.length())),
    ),
  };
}

// Dragging right swings the camera round to the left, as if turning the
// scene by hand; dragging down lifts it.
export function dragOrbit(orbit, dx, dy) {
  orbit.yaw -= dx * DRAG_SPEED;
  orbit.pitch = Math.min(
    MAX_PITCH,
    Math.max(MIN_PITCH, orbit.pitch + dy * DRAG_SPEED),
  );
  return orbit;
}

export function zoomOrbit(orbit, factor) {
  orbit.radius = Math.min(
    MAX_RADIUS,
    Math.max(MIN_RADIUS, orbit.radius * factor),
  );
  return orbit;
}

export function orbitPosition(orbit, out = new Vector3()) {
  const flat = Math.cos(orbit.pitch) * orbit.radius;
  out.set(
    orbit.center.x + Math.sin(orbit.yaw) * flat,
    orbit.center.y + Math.sin(orbit.pitch) * orbit.radius,
    orbit.center.z + Math.cos(orbit.yaw) * flat,
  );
  out.y = Math.max(MIN_HEIGHT, out.y);
  return out;
}

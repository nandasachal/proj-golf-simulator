import * as THREE from "three";

// Scene units are yards. The tee is at the origin and the range runs down +z;
// -x is the right-hand side when looking downrange.

export const RANGE_LENGTH = 400;
export const FAIRWAY_HALF_WIDTH = 60;
export const MARKER_INTERVAL = 50;
export const LAST_MARKER = 350;

// The ball's physics assumes level ground, so everything inside this rectangle
// stays at y = 0. Scenery may only rise and fall outside it.
export const FLAT = { halfWidth: 100, zMin: -45, zMax: 470 };
// Nothing tall (trees, fences, structures) inside this half-width: the camera
// follows the ball out to 84 yd offline.
export const CLEAR_HALF_WIDTH = 94;

// Unit vector from the scene toward the sun: a warm late-afternoon sun, 33°
// up, downrange and to the right. Sky, lights, cloud shading and any baked
// shading all read this so they agree.
export const SUN_DIRECTION = new THREE.Vector3(-0.7, 0.5, 0.3).normalize();
export const SUN_COLOR = 0xffe2b0;
// Colour the far distance fades to. The sky's horizon band and the scene fog
// both use it, so distant scenery melts into the sky.
export const HORIZON_COLOR = 0xd3e2ec;

// Deterministic so the range looks the same on every load.
export function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Flat things painted on the ground (fairway, greens, lines) sit only a
// hundredth of a yard above the turf, far closer than the depth buffer can
// tell apart a few hundred yards out, so left alone they flicker against it as
// the camera moves. Each overlay is drawn after the layer beneath it, is
// nudged toward the camera in depth, and leaves the depth buffer alone.
export function groundOverlay(mesh, layer) {
  mesh.renderOrder = layer;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = -layer;
  mesh.material.polygonOffsetUnits = -8 * layer;
  mesh.material.depthWrite = false;
  return mesh;
}

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1].
export function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, z) * amplitude;
    total += amplitude;
    x = x * 2.03 + 17.1;
    z = z * 2.03 - 9.7;
    amplitude *= 0.5;
  }
  return sum / total;
}

// Height of the ground at (x, z) in yards. Exactly 0 inside FLAT; outside it
// the land eases into rolling ground that climbs gently away from the range.
// Terrain, trees and props all place themselves with this.
export function terrainHeight(x, z) {
  const dx = Math.max(0, Math.abs(x) - FLAT.halfWidth);
  const dz = Math.max(0, FLAT.zMin - z, z - FLAT.zMax);
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return 0;
  const ease = Math.min(1, distance / 90);
  const blend = ease * ease * (3 - 2 * ease);
  const rolling = (fbm(x / 130, z / 130, 3) - 0.35) * 26;
  const rise = Math.min(distance, 900) * 0.035;
  return blend * (rolling + rise);
}

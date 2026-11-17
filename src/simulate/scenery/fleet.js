import * as THREE from "three";
import { HORIZON_COLOR, canvasTexture, seededRandom } from "./shared";

// A hidden extra (?empire in the URL): a fleet of wedge-shaped capital ships
// crossing the sky left to right. They are the size of towns and fly beyond
// the mountains, so they move slowly and sit deep in the haze.

const SPAN = 3000; // yards either side of the centre line before a ship wraps
const FADE = 700; // yards over which a ship fades in and out at the ends
const SPEED = 14; // yards a second: a full crossing takes about seven minutes

// The camera has to see this far for the whole fleet to be drawn.
export const FLEET_FAR = 4600;

// start: where along the crossing it begins; z downrange, y up; length in yards
export const SHIPS = [
  { start: 500, z: 1900, y: 450, length: 1700 },
  { start: -900, z: 1450, y: 350, length: 800 },
  { start: 1500, z: 1550, y: 300, length: 750 },
  { start: -2100, z: 2250, y: 560, length: 1000 },
  { start: 2600, z: 2100, y: 420, length: 900 },
];

// How far a ship has sunk into the haze, 0 to 1, by how far downrange it is:
// lighter than the mountains at the same distance, so the hulls stay solid.
export const hazeAt = (z) => Math.min(0.5, 0.0002 * z);

// Where a ship is across the range after `seconds`, and how solid it is: it
// flies toward -x, wraps from one end of the crossing to the other, and is
// faded out at both ends so the wrap is never seen.
export function shipPlace(start, seconds) {
  const travelled =
    (((start - seconds * SPEED + SPAN) % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN);
  const x = travelled - SPAN;
  return { x, opacity: Math.min(1, (SPAN - Math.abs(x)) / FADE) };
}

// Hull plating: panels a shade lighter or darker than the hull, and seams.
function platingTexture() {
  const random = seededRandom(77);
  const texture = canvasTexture(512, 1024, (context, width, height) => {
    context.fillStyle = "#b9bdc2";
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 2600; i++) {
      const shade = 150 + Math.floor(random() * 75);
      context.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
      const w = 4 + random() * 34;
      const h = 4 + random() * 22;
      context.fillRect(random() * width, random() * height, w, h);
    }
    context.strokeStyle = "rgba(60,64,70,0.45)";
    context.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const y = random() * height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  });
  texture.anisotropy = 4;
  return texture;
}

// A unit-length hull with its nose at +z: a flat dagger with a ridge above
// and a shallower keel below.
function hullGeometry() {
  const nose = [0, 0, 0.5];
  const left = [0.29, 0, -0.5];
  const right = [-0.29, 0, -0.5];
  const ridge = [0, 0.055, -0.5];
  const keel = [0, -0.04, -0.5];
  const faces = [
    [nose, ridge, left],
    [nose, right, ridge],
    [nose, left, keel],
    [nose, keel, right],
    [left, ridge, keel],
    [ridge, right, keel],
  ];
  const points = faces.flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  // Plating is laid flat over the hull, seen from above.
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      points.flatMap(([x, , z]) => [x / 0.58 + 0.5, z + 0.5]),
      2,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function buildShip(length, haze, plating) {
  const horizon = new THREE.Color(HORIZON_COLOR);
  // Haze by hand, since scene fog would wipe out anything this far away: the
  // hull keeps (1 - haze) of its own light and takes the rest from the sky.
  const hazed = (color, map) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(1 - haze),
      map,
      emissive: horizon.clone().multiplyScalar(haze * 0.8),
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
      fog: false,
      side: THREE.DoubleSide,
    });
  const hull = hazed(0xc9cdd2, plating);
  const dark = hazed(0x5c626a, plating);
  const glow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x9fd4ff).lerp(horizon, haze * 0.7),
    fog: false,
  });
  const ship = new THREE.Group();
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    ship.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  add(hullGeometry(), hull, 0, 0, 0);
  // A dark trench round the edge, where the two halves of the hull meet.
  add(hullGeometry(), dark, 0, -0.001, -0.004).scale.set(1.012, 0.12, 1.004);
  // A raised wedge down the middle of the upper hull.
  add(hullGeometry(), hull, 0, 0.012, -0.2).scale.set(0.5, 1.1, 0.6);
  // The superstructure: stepped decks on the after third, then the bridge
  // tower with its two domes.
  add(box(0.2, 0.02, 0.3), hull, 0, 0.047, -0.33);
  add(box(0.14, 0.02, 0.22), hull, 0, 0.065, -0.35);
  add(box(0.09, 0.018, 0.15), dark, 0, 0.083, -0.37);
  add(box(0.07, 0.03, 0.05), dark, 0, 0.1, -0.4);
  add(box(0.16, 0.022, 0.045), hull, 0, 0.122, -0.4);
  const dome = new THREE.SphereGeometry(0.011, 10, 8);
  add(dome, hull, 0.055, 0.141, -0.4);
  add(dome, hull, -0.055, 0.141, -0.4);
  // Underneath: the hangar bay and the reactor dome.
  add(box(0.07, 0.006, 0.13), dark, 0, -0.019, -0.08);
  add(new THREE.SphereGeometry(0.035, 16, 8), hull, 0, -0.03, -0.3).scale.y =
    0.45;
  // Engines: three large bells and their glow.
  const bell = new THREE.CylinderGeometry(0.028, 0.036, 0.03, 16, 1, true);
  const flame = new THREE.CircleGeometry(0.03, 16);
  for (const x of [-0.085, 0, 0.085]) {
    add(bell, dark, x, 0.004, -0.512).rotation.x = Math.PI / 2;
    add(flame, glow, x, 0.004, -0.52).rotation.y = Math.PI;
  }

  ship.scale.setScalar(length);
  // Level flight, nose toward -x, the way the fleet is heading, swung a
  // little toward the tee.
  ship.rotation.order = "YXZ";
  ship.rotation.set(0.01, -(Math.PI * 108) / 180, -0.06);
  ship.userData.materials = [hull, dark, glow];
  return ship;
}

export function buildFleet() {
  const object = new THREE.Group();
  object.name = "fleet";
  const plating = platingTexture();
  const ships = SHIPS.map((spec) => {
    const ship = buildShip(spec.length, hazeAt(spec.z), plating);
    ship.position.set(0, spec.y, spec.z);
    object.add(ship);
    return { spec, ship };
  });
  function update(seconds) {
    for (const { spec, ship } of ships) {
      const { x, opacity } = shipPlace(spec.start, seconds);
      ship.position.x = x;
      ship.visible = opacity > 0;
      for (const material of ship.userData.materials) {
        // Only see-through while fading at the ends of the crossing.
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
    }
  }
  update(0);
  return { object, update };
}

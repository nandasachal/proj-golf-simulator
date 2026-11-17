import * as THREE from "three";

// A hidden extra (?empire in the URL): a fleet of wedge-shaped capital ships
// crossing the sky downrange, left to right, far above the trees.

const SPAN = 1300; // yards either side of the centre line before a ship wraps
const FADE = 250; // yards over which a ship fades in and out at the ends
const SPEED = 7; // yards a second: a full crossing takes about six minutes

// start: where along the crossing it begins; z downrange, y up; length in yards
export const SHIPS = [
  { start: 120, z: 640, y: 150, length: 230 },
  { start: -230, z: 500, y: 85, length: 110 },
  { start: 430, z: 540, y: 110, length: 120 },
  { start: -560, z: 820, y: 190, length: 150 },
  { start: 800, z: 760, y: 150, length: 135 },
  { start: -900, z: 960, y: 215, length: 170 },
  { start: 1120, z: 1020, y: 200, length: 160 },
];

// Where a ship is across the range after `seconds`, and how solid it is: it
// flies toward -x, wraps from one end of the crossing to the other, and is
// faded out at both ends so the wrap is never seen.
export function shipPlace(start, seconds) {
  const travelled =
    (((start - seconds * SPEED + SPAN) % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN);
  const x = travelled - SPAN;
  return { x, opacity: Math.min(1, (SPAN - Math.abs(x)) / FADE) };
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(faces.flat(2), 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function buildShip(length) {
  const hull = new THREE.MeshStandardMaterial({
    color: 0x9aa1aa,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
    // Kept out of the haze: a pale hull against pale cloud is lost.
    fog: false,
    side: THREE.DoubleSide,
  });
  const dark = hull.clone();
  dark.color.set(0x626972);
  const glow = new THREE.MeshBasicMaterial({
    color: 0x9fd4ff,
    fog: false,
  });
  const ship = new THREE.Group();
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    ship.add(mesh);
    return mesh;
  };

  add(hullGeometry(), hull, 0, 0, 0);
  // A dark trench round the edge, where the two halves of the hull meet.
  const trench = add(hullGeometry(), dark, 0, -0.001, -0.004);
  trench.scale.set(1.012, 0.12, 1.004);
  // The superstructure: stepped decks on the after third, then the bridge
  // tower with its two domes.
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  add(box(0.2, 0.02, 0.3), hull, 0, 0.047, -0.33);
  add(box(0.14, 0.02, 0.22), hull, 0, 0.065, -0.35);
  add(box(0.09, 0.018, 0.15), dark, 0, 0.083, -0.37);
  add(box(0.07, 0.03, 0.05), dark, 0, 0.1, -0.4);
  add(box(0.16, 0.022, 0.045), hull, 0, 0.122, -0.4);
  const dome = new THREE.SphereGeometry(0.011, 10, 8);
  add(dome, hull, 0.055, 0.141, -0.4);
  add(dome, hull, -0.055, 0.141, -0.4);
  // Engines: three large bells and their glow.
  const bell = new THREE.CylinderGeometry(0.028, 0.036, 0.03, 16, 1, true);
  const flame = new THREE.CircleGeometry(0.03, 16);
  for (const x of [-0.085, 0, 0.085]) {
    add(bell, dark, x, 0.004, -0.512).rotation.x = Math.PI / 2;
    add(flame, glow, x, 0.004, -0.52).rotation.y = Math.PI;
  }

  ship.scale.setScalar(length);
  // Nose toward -x, the way the fleet is heading, swung a little toward the
  // tee and banked so the decks, not just the edge of the hull, face it.
  ship.rotation.order = "YXZ";
  ship.rotation.set(0.03, -(Math.PI * 115) / 180, 0.5);
  ship.userData.materials = [hull, dark, glow];
  return ship;
}

export function buildFleet() {
  const object = new THREE.Group();
  object.name = "fleet";
  const ships = SHIPS.map((spec) => {
    const ship = buildShip(spec.length);
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

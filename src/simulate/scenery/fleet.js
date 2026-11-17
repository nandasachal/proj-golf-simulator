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
  { start: -2500, z: 1500, y: 350, length: 900 },
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

// --- fighters ---
// Small twin-panel fighters, drawn a little over their real size so they can
// be seen at all: flights of three circle each capital ship, and more patrol the
// sky all round the range.

const ESCORT_FLIGHTS = 5; // per capital ship
// Yards, panel tip to panel tip: small against the hulls they fly beside.
const ESCORT_SIZE = 12;
const FLIGHT = [
  [0, 0],
  [1.7, -1.6],
  [-1.7, -1.6],
]; // [right, ahead] of the leader, in fighter sizes

// Patrols: flights flying level circles over the range, some far out and
// some nearly overhead, in both directions. The circles are centred off the
// tee so the fighters are seen from every side, not always panel-on. All are
// well above any ball flight.
export const PATROLS = (() => {
  const random = seededRandom(4077);
  return Array.from({ length: 14 }, (_, i) => {
    const overhead = i % 4 === 3;
    return {
      radius: overhead ? 160 + random() * 260 : 480 + random() * 820,
      height: overhead ? 300 + random() * 220 : 150 + random() * 380,
      centreX: (random() - 0.5) * 700,
      centreZ: (random() - 0.5) * 700,
      phase: random() * Math.PI * 2,
      direction: random() < 0.5 ? -1 : 1,
      speed: 55 + random() * 30, // yards a second
      // Full size overhead, where they are close; smaller the farther out.
      size: overhead ? 20 + random() * 12 : 9 + random() * 6,
    };
  });
})();

// Where a patrol's leader is after `seconds`.
export function patrolPlace(patrol, seconds) {
  const angle =
    patrol.phase + (patrol.direction * patrol.speed * seconds) / patrol.radius;
  return {
    x: patrol.centreX + Math.cos(angle) * patrol.radius,
    y: patrol.height,
    z: patrol.centreZ + Math.sin(angle) * patrol.radius,
  };
}

// Where an escort flight's leader is: a long loop round its ship, out past
// the nose and stern and wide of the hull, rising and falling as it goes.
export function escortPlace(flight, seconds, ship) {
  const { length } = ship.spec;
  const angle = flight * 1.9 + (seconds * 70) / (length * 0.5);
  const lift = Math.sin(angle * 0.6 + flight) * 0.09 + 0.06 * (flight % 3);
  return {
    x: ship.x + Math.cos(angle) * length * (0.62 + 0.05 * (flight % 2)),
    y: ship.spec.y + lift * length,
    z: ship.spec.z + Math.sin(angle) * length * (0.4 + 0.04 * flight),
  };
}

// One fighter, one yard across, flying toward +z: a ball cockpit between two
// upright six-sided panels.
function fighterGeometry() {
  const parts = [];
  const part = (geometry, shade, place) => {
    place(geometry);
    const flat = geometry.toNonIndexed();
    const count = flat.getAttribute("position").count;
    parts.push({ flat, colors: new Array(count * 3).fill(shade) });
  };
  part(new THREE.SphereGeometry(0.17, 10, 8), 0.72, () => {});
  part(new THREE.BoxGeometry(0.9, 0.06, 0.1), 0.6, () => {});
  for (const side of [-1, 1]) {
    const onPanel = (geometry) => geometry.translate(side * 0.47, 0, 0);
    part(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 6), 0.1, (geometry) => {
      geometry.rotateZ(Math.PI / 2);
      onPanel(geometry);
    });
    // The frame on each panel: a hub and six spokes out to the corners.
    part(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 6), 0.62, (geometry) => {
      geometry.rotateZ(Math.PI / 2);
      onPanel(geometry);
    });
    for (let spoke = 0; spoke < 3; spoke++) {
      part(new THREE.BoxGeometry(0.05, 0.035, 0.98), 0.62, (geometry) => {
        geometry.rotateX((spoke * Math.PI) / 3);
        onPanel(geometry);
      });
    }
  }
  const join = (name) =>
    parts.flatMap(({ flat }) => Array.from(flat.getAttribute(name).array));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(join("position"), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(join("normal"), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      parts.flatMap(({ colors }) => colors),
      3,
    ),
  );
  return geometry;
}

// `count` fighters drawn as one mesh, hazed like the hulls.
function fighterSwarm(geometry, count, haze) {
  const horizon = new THREE.Color(HORIZON_COLOR);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff).multiplyScalar(1 - haze),
    emissive: horizon.multiplyScalar(haze * 0.8),
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    flatShading: true,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  return mesh;
}

const pose = new THREE.Object3D();
const ahead = new THREE.Vector3();
// Put a flight of three in a swarm, starting at `index`: the leader at
// `place(seconds)`, heading where it will be a moment later, wingmen behind
// and to either side, all banked by `bank`.
function setFlight(swarm, index, place, seconds, size, bank) {
  const here = place(seconds);
  const next = place(seconds + 0.4);
  pose.position.set(here.x, here.y, here.z);
  pose.lookAt(ahead.set(next.x, next.y, next.z));
  pose.rotateZ(bank);
  pose.scale.setScalar(size);
  pose.updateMatrix();
  const leader = pose.matrix.clone();
  FLIGHT.forEach(([right, forward], member) => {
    pose.matrix.copy(leader);
    // Offsets are in the leader's own frame, in fighter sizes.
    pose.matrix.multiply(
      new THREE.Matrix4().makeTranslation(-right, 0.3 * member, forward),
    );
    swarm.setMatrixAt(index + member, pose.matrix);
  });
  swarm.instanceMatrix.needsUpdate = true;
}

export function buildFleet() {
  const object = new THREE.Group();
  object.name = "fleet";
  const plating = platingTexture();
  const fighter = fighterGeometry();
  const ships = SHIPS.map((spec) => {
    const ship = buildShip(spec.length, hazeAt(spec.z), plating);
    ship.position.set(0, spec.y, spec.z);
    const escorts = fighterSwarm(
      fighter,
      ESCORT_FLIGHTS * FLIGHT.length,
      hazeAt(spec.z) * 0.8,
    );
    object.add(ship, escorts);
    return { spec, ship, escorts, x: 0 };
  });
  const patrols = fighterSwarm(fighter, PATROLS.length * FLIGHT.length, 0.12);
  object.add(patrols);

  function update(seconds) {
    for (const entry of ships) {
      const { spec, ship, escorts } = entry;
      const { x, opacity } = shipPlace(spec.start, seconds);
      entry.x = x;
      ship.position.x = x;
      ship.visible = escorts.visible = opacity > 0;
      for (const material of [...ship.userData.materials, escorts.material]) {
        // Only see-through while fading at the ends of the crossing.
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
      for (let flight = 0; flight < ESCORT_FLIGHTS; flight++) {
        setFlight(
          escorts,
          flight * FLIGHT.length,
          (at) => escortPlace(flight, at, entry),
          seconds,
          ESCORT_SIZE,
          0.25,
        );
      }
    }
    PATROLS.forEach((patrol, i) =>
      setFlight(
        patrols,
        i * FLIGHT.length,
        (at) => patrolPlace(patrol, at),
        seconds,
        patrol.size,
        patrol.direction * 0.45,
      ),
    );
  }
  update(0);
  return { object, update };
}

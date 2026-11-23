import * as THREE from "three";
import { HORIZON_COLOR, canvasTexture, seededRandom } from "./shared";

// Star Wars Mode (a switch in Settings): a fleet of wedge-shaped capital ships
// crossing the sky left to right. They are the size of towns and most fly
// beyond the mountains, so they move slowly and sit deep in the haze.

const SPAN = 3000; // yards either side of the centre line before a ship wraps
const FADE = 700; // yards over which a ship fades in and out at the ends
const SPEED = 14; // yards a second: a full crossing takes about seven minutes

// The camera has to see this far for the whole fleet to be drawn.
export const FLEET_FAR = 4600;

// start: where along the crossing it begins; z downrange, y up; length in yards
// The last one passes right over the range, high above the patrols, to be
// found by looking up.
export const SHIPS = [
  { start: 500, z: 1900, y: 450, length: 1700 },
  { start: -2500, z: 1500, y: 350, length: 900 },
  { start: 700, z: 260, y: 1000, length: 800 },
];

// A battle station hanging high in the sky like a daytime moon, up and to the
// left of the range, away from the sun.
export const STATION = { x: 1500, y: 2600, z: 2400, radius: 330 };

// How far a ship has sunk into the haze, 0 to 1, by how far from the tee it
// is: lighter than the mountains at the same distance, so the hulls stay solid.
export const hazeAt = ({ y, z }) => Math.min(0.5, 0.0002 * Math.hypot(y, z));

// Where a ship is across the range after `seconds`, and how solid it is: it
// flies toward -x, wraps from one end of the crossing to the other, and is
// faded out at both ends so the wrap is never seen.
export function shipPlace(start, seconds) {
  const travelled =
    (((start - seconds * SPEED + SPAN) % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN);
  const x = travelled - SPAN;
  return { x, opacity: Math.min(1, (SPAN - Math.abs(x)) / FADE) };
}

// --- the station's strike ---
// Look at the station and it answers: beams leave the rim of the dish one by
// one and meet in front of it, the joined beam comes down on the 300 yard
// marker, and a fireball swallows the view inside half a second. The game
// starts again behind the fire, which then clears.

export const STRIKE_TARGET = { x: 0, y: 0, z: 300 };
const DWELL = 0.4; // seconds in view before it starts charging
const CHARGE = 2.4;
const BEAM = 0.4;
const BLAST = 0.5;
const BURN = 0.7;
const CLEAR = 0.9;
// Seconds into a strike at which the blast has covered the view.
export const STRIKE_COVERED = CHARGE + BEAM + BLAST;
// The view burns for a moment, then the game restarts behind the fire.
export const STRIKE_RESTART = STRIKE_COVERED + BURN;
export const STRIKE_SECONDS = STRIKE_RESTART + CLEAR;
// The blast reaches this far, in yards: well past the tee from the marker.
const BLAST_RADIUS = 420;
// The beams that leave the rim of the dish and meet in front of it.
export const TRIBUTARIES = 8;

const unit = (value) => Math.min(1, Math.max(0, value));

// What is showing `seconds` into a strike: how charged the dish is, whether
// the main beam is on, how far the blast has spread (0 to 1), how hot the
// fire is and how solid.
export function strikeAt(seconds) {
  const blasting = seconds - CHARGE - BEAM;
  const burning = seconds - STRIKE_RESTART;
  return {
    charge: blasting < BLAST ? unit(seconds / CHARGE) : 0,
    beam: seconds >= CHARGE && blasting < BLAST,
    blast: unit(blasting / BLAST),
    heat: 1 - 0.75 * unit(blasting / (BLAST + BURN + CLEAR)),
    cover: burning < 0 ? 1 : unit(1 - burning / CLEAR),
  };
}

// How far tributary `index` has reached toward the meeting point, 0 to 1, at
// a given charge: they light one after another round the dish over the first
// two thirds of the charge, and the last third is all of them feeding the
// glow where they meet.
export function tributaryReach(charge, index) {
  return unit((charge - (index / TRIBUTARIES) * 0.45) / 0.2);
}

const sight = new THREE.Vector3();
// Whether the station is in the picture: in front of the camera and inside
// the frame, clear of its edges.
export function stationInSight(camera) {
  sight
    .set(STATION.x, STATION.y, STATION.z)
    .applyMatrix4(camera.matrixWorldInverse);
  if (sight.z >= 0) return false;
  sight.applyMatrix4(camera.projectionMatrix);
  return Math.abs(sight.x) < 0.8 && Math.abs(sight.y) < 0.8;
}

// `seconds` is how far into a strike it is, or null when there is none. One
// look sets off one strike: it has to leave the picture before it fires again.
export const newStrike = () => ({
  seconds: null,
  seen: 0,
  armed: true,
  covered: false,
});

// Move a strike on by `dt`. True on the one step the game is to restart,
// with the view full of fire.
export function stepStrike(strike, dt, inSight) {
  if (strike.seconds === null) {
    if (!inSight) {
      strike.seen = 0;
      strike.armed = true;
      return false;
    }
    if (!strike.armed) return false;
    strike.seen += dt;
    if (strike.seen >= DWELL) {
      strike.seconds = 0;
      strike.seen = 0;
      strike.armed = false;
      strike.covered = false;
    }
    return false;
  }
  strike.seconds += dt;
  const covers = !strike.covered && strike.seconds >= STRIKE_RESTART;
  if (covers) strike.covered = true;
  if (strike.seconds >= STRIKE_SECONDS) strike.seconds = null;
  return covers;
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

// The station's surface, wrapped round the sphere: bands of plating, the
// trench round the equator and the dish in the northern half. The dish is at
// the middle of the picture, which is the sphere's +x side.
function stationTexture() {
  const random = seededRandom(1977);
  const texture = canvasTexture(1024, 512, (context, width, height) => {
    context.fillStyle = "#a9adb3";
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 3200; i++) {
      const shade = 140 + Math.floor(random() * 60);
      context.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
      context.fillRect(
        random() * width,
        random() * height,
        6 + random() * 50,
        2 + random() * 7,
      );
    }
    context.fillStyle = "#4d5259";
    context.fillRect(0, height / 2 - 4, width, 8);
    const x = width / 2;
    const y = height * 0.34;
    const dish = context.createRadialGradient(x, y, 4, x, y, 60);
    dish.addColorStop(0, "#5a5f66");
    dish.addColorStop(0.75, "#868b92");
    dish.addColorStop(1, "#70757c");
    context.fillStyle = dish;
    context.beginPath();
    // Wider than tall, so it comes out round on the sphere at this latitude.
    context.ellipse(x, y, 68, 58, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#3c4046";
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
  });
  texture.anisotropy = 4;
  return texture;
}

function buildStation() {
  const haze = 0.45;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff).multiplyScalar(1 - haze),
    map: stationTexture(),
    emissive: new THREE.Color(HORIZON_COLOR).multiplyScalar(haze * 0.8),
    roughness: 1,
    metalness: 0,
    fog: false,
  });
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(STATION.radius, 48, 32),
    material,
  );
  // Turn the dish from +x to +z, then point +z a little wide of the tee.
  sphere.rotation.y = -Math.PI / 2;
  const station = new THREE.Group();
  station.add(sphere);
  station.position.set(STATION.x, STATION.y, STATION.z);
  station.lookAt(700, 0, -900);
  station.updateMatrixWorld(true);
  // The dish is 29 degrees north on the sphere's +x side. The beams leave
  // its rim and meet out in front of its middle.
  const middle = new THREE.Vector3(Math.cos(0.5), Math.sin(0.5), 0);
  const across = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(-Math.sin(0.5), Math.cos(0.5), 0);
  const world = (point) =>
    sphere.localToWorld(point.multiplyScalar(STATION.radius));
  const rim = Array.from({ length: TRIBUTARIES }, (_, i) => {
    const turn = (i / TRIBUTARIES) * Math.PI * 2;
    return world(
      middle
        .clone()
        .multiplyScalar(Math.cos(0.33))
        .addScaledVector(across, Math.sin(0.33) * Math.cos(turn))
        .addScaledVector(up, Math.sin(0.33) * Math.sin(turn)),
    );
  });
  const focus = world(middle.clone().multiplyScalar(1.5));
  return { station, rim, focus };
}

const FIRE_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Rolling fire over the blast: two layers of noise, the second dragged about
// by the first, read through a ramp from soot to white heat.
const FIRE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uOpacity;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float sum = 0.0;
    float size = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += size * noise(p);
      p *= 2.03;
      size *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 p = vDirection * 4.0;
    float billow = fbm(p + vec3(0.0, -uTime * 2.2, uTime * 0.9));
    float flame = fbm(p * 2.6 + billow * 2.4 - vec3(uTime * 1.6, uTime * 3.0, 0.0));
    float heat = clamp((billow * 0.9 + flame * 1.1 - 0.75) * 2.2 + uHeat * 0.5 - 0.1, 0.0, 1.0);
    vec3 color = mix(vec3(0.05, 0.02, 0.015), vec3(0.55, 0.05, 0.01), smoothstep(0.0, 0.3, heat));
    color = mix(color, vec3(1.0, 0.36, 0.03), smoothstep(0.25, 0.55, heat));
    color = mix(color, vec3(1.0, 0.8, 0.25), smoothstep(0.5, 0.8, heat));
    color = mix(color, vec3(1.0, 0.97, 0.85), smoothstep(0.82, 1.0, heat));
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
  }`;

// The strike's light: the beams off the rim of the dish, the glow where they
// meet, the joined beam, and the fireball at the marker. `show(seconds)`
// draws it that far in; `show(null)` puts it away.
function buildStrike({ rim, focus }) {
  const light = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
  const object = new THREE.Group();
  object.visible = false;
  const shaft = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const upright = new THREE.Vector3(0, 1, 0);
  // A beam from one point to another that can be drawn part of the way.
  const beamBetween = (from, to, layers) => {
    const beam = new THREE.Group();
    const length = from.distanceTo(to);
    const heading = to.clone().sub(from).normalize();
    beam.quaternion.setFromUnitVectors(upright, heading);
    for (const [radius, material] of layers) {
      const mesh = new THREE.Mesh(shaft, material);
      mesh.scale.set(radius, 1, radius);
      beam.add(mesh);
    }
    beam.userData.reach = (fraction) => {
      beam.visible = fraction > 0;
      beam.scale.y = Math.max(1e-3, length * fraction);
      beam.position
        .copy(from)
        .addScaledVector(heading, (length * fraction) / 2);
    };
    object.add(beam);
    return beam;
  };
  const core = light(0xeaffe0, 1);
  const sheath = light(0x55ff3a, 0.45);
  const tributaries = rim.map((from) =>
    beamBetween(from, focus, [
      [3, light(0x9dff7a, 1)],
      [8, sheath],
    ]),
  );
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    light(0x8dff70, 0.9),
  );
  glow.position.copy(focus);
  const hot = new THREE.Mesh(glow.geometry, light(0xf4ffea, 1));
  hot.position.copy(focus);
  const target = new THREE.Vector3(
    STRIKE_TARGET.x,
    STRIKE_TARGET.y,
    STRIKE_TARGET.z,
  );
  const beam = beamBetween(focus, target, [
    [5, core],
    [15, sheath],
  ]);
  // Drawn over everything, from inside as well as out, so that once it has
  // passed the camera it is all there is to see.
  const fire = {
    uTime: { value: 0 },
    uHeat: { value: 1 },
    uOpacity: { value: 1 },
  };
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.ShaderMaterial({
      name: "blast",
      uniforms: fire,
      vertexShader: FIRE_VERTEX,
      fragmentShader: FIRE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  blast.position.copy(target);
  blast.renderOrder = 1000;
  object.add(glow, hot, blast);

  function show(seconds) {
    object.visible = seconds !== null;
    if (seconds === null) return;
    const at = strikeAt(seconds);
    tributaries.forEach((tributary, i) =>
      tributary.userData.reach(tributaryReach(at.charge, i)),
    );
    // The glow starts when the first beam arrives and swells as the rest
    // join it, flickering.
    const fed = Math.min(1, Math.max(0, (at.charge - 0.2) / 0.8));
    const flicker = 1 + 0.1 * Math.sin(seconds * 46);
    glow.visible = hot.visible = fed > 0;
    glow.scale.setScalar((10 + 60 * fed) * flicker);
    hot.scale.setScalar((4 + 22 * fed) * flicker);
    beam.userData.reach(at.beam ? 1 : 0);
    blast.visible = at.blast > 0;
    blast.scale.setScalar(Math.max(1, at.blast * BLAST_RADIUS));
    fire.uTime.value = seconds;
    fire.uHeat.value = at.heat;
    fire.uOpacity.value = at.cover;
  }
  return { object, show };
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
    const ship = buildShip(spec.length, hazeAt(spec), plating);
    ship.position.set(0, spec.y, spec.z);
    const escorts = fighterSwarm(
      fighter,
      ESCORT_FLIGHTS * FLIGHT.length,
      hazeAt(spec) * 0.8,
    );
    object.add(ship, escorts);
    return { spec, ship, escorts, x: 0 };
  });
  const patrols = fighterSwarm(fighter, PATROLS.length * FLIGHT.length, 0.12);
  const { station, rim, focus } = buildStation();
  const strike = buildStrike({ rim, focus });
  object.add(patrols, station, strike.object);

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
  return { object, update, showStrike: strike.show };
}

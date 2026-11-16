import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  DRIVER_STATIC_LOFT_DEGREES,
  groundDirection,
  risingDirection,
} from "./club-setup";

// A close-up of the driver meeting the ball, posed from the shot controls.
// Units are centimetres. The ball sits on its tee at the origin's x/z, the
// target is down +z and -x is the right-hand side. The head is modelled for a
// right-hander (heel and shaft on +x) and mirrored for a left-hander.

const BALL_RADIUS = 2.135;
const BALL_HEIGHT = 4.6; // centre of a teed-up ball above the turf
const RADIANS = Math.PI / 180;

export const FACE_COLOR = 0xffffff;
export const PATH_COLOR = 0xa3e635;
export const START_COLOR = 0xfb923c;

// Camera positions for a right-hander; x flips for a left-hander.
const LOOK_AT = new THREE.Vector3(0, 4, -3.5);
export const VIEWS = {
  behind: { label: "Behind", position: [20, 42, -60] },
  toe: { label: "Toe", position: [-70, 9, -4] },
  above: { label: "Above", position: [0, 92, -6.5] },
  face: { label: "Face", position: [-20, 13, 58] },
};

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// --- driver head ---

// The face: tilted back by the head's loft, and gently curved both ways
// (bulge heel-to-toe, roll top-to-bottom). Origin at the middle of the face.
const faceSurface = (x, y) =>
  -y * Math.tan(DRIVER_STATIC_LOFT_DEGREES * RADIANS) -
  (x * x) / 60 -
  (y * y) / 60;

// Where the crown meets the sole. It sits below the middle of the face, so
// the crown is a tall dome and the sole a shallow dish, as on a real driver.
const RIM_HEIGHT = -0.85;
const SOLE_HEIGHT = -2.55;

const power = (value, exponent) =>
  Math.sign(value) * Math.pow(Math.abs(value), exponent);

// Map a point on the unit sphere onto the driver head: wide and deep, a
// rounded-off triangle from above, tallest just behind the face and falling
// away to a blunt back, shallow underneath, cut off flat at the face.
function headPoint(point) {
  // Squaring-off exponents fill the shape out toward a rounded box.
  const across = power(point.x, 0.88);
  const depth = power(point.z, 0.88);
  // 0 at the rim, 1 at the top of the crown or the bottom of the sole.
  const rise = Math.pow(Math.abs(point.y), 0.55);

  // Narrower at the face, widest a third of the way back, easing in again
  // toward the tail.
  const width =
    6.25 *
    (0.9 + 0.1 * smoothstep(0.45, 0.05, depth)) *
    (1 - 0.14 * smoothstep(-0.25, -1, depth));
  const x = across * width;

  let y;
  if (point.y >= 0) {
    // The crown peaks a little behind the face and slopes down to the tail.
    const crown =
      3.35 * (0.36 + 0.64 * smoothstep(-1.1, 0.15, depth)) -
      0.25 * smoothstep(0.15, 0.5, depth);
    y = RIM_HEIGHT + rise * (crown - RIM_HEIGHT);
  } else {
    // The sole is nearly flat and sweeps up toward the tail.
    const sole = SOLE_HEIGHT + 1.1 * smoothstep(-0.35, -1.05, depth);
    y = RIM_HEIGHT - rise * (RIM_HEIGHT - sole);
  }

  const z = Math.min(depth * 7.7 - 2.75, faceSurface(x, y));
  return point.set(x, y, z);
}

function shapeHead(geometry) {
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    headPoint(point.fromBufferAttribute(position, i));
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A point on the head's surface, by where it is on the unit sphere.
const onHead = (x, y, z) => headPoint(new THREE.Vector3(x, y, z).normalize());

// Woven carbon for the crown: a fine twill that only shows under the gloss.
function carbonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#040506";
  ctx.fillRect(0, 0, 64, 64);
  const cell = 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // 2/2 twill: the lit tow steps one cell each row
      const over = (col + row) % 4 < 2;
      const gradient = over
        ? ctx.createLinearGradient(col * cell, 0, (col + 1) * cell, 0)
        : ctx.createLinearGradient(0, row * cell, 0, (row + 1) * cell);
      gradient.addColorStop(0, "#050608");
      gradient.addColorStop(0.5, over ? "#15171c" : "#0c0d11");
      gradient.addColorStop(1, "#050608");
      ctx.fillStyle = gradient;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(44, 11);
  texture.anisotropy = 8;
  return texture;
}

// Brushed metal for the sole, with two plain accent panels.
function soleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3a3e46";
  ctx.fillRect(0, 0, 512, 256);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // brush marks running round the head
  for (let i = 0; i < 900; i++) {
    const shade = 46 + Math.floor(random() * 34);
    ctx.strokeStyle = `rgba(${shade},${shade + 3},${shade + 9},0.5)`;
    ctx.lineWidth = 1;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function faceTextures() {
  const size = 512;
  const paint = (draw) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size / 2;
    draw(canvas.getContext("2d"), canvas.width, canvas.height);
    return canvas;
  };
  const outline = (ctx, w, h) => {
    // a driver face: broad, shallower at the heel and toe
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.52);
    ctx.bezierCurveTo(w * 0.06, h * 0.1, w * 0.3, h * 0.04, w * 0.5, h * 0.04);
    ctx.bezierCurveTo(
      w * 0.72,
      h * 0.04,
      w * 0.95,
      h * 0.12,
      w * 0.95,
      h * 0.5,
    );
    ctx.bezierCurveTo(
      w * 0.95,
      h * 0.86,
      w * 0.72,
      h * 0.96,
      w * 0.5,
      h * 0.96,
    );
    ctx.bezierCurveTo(w * 0.3, h * 0.96, w * 0.06, h * 0.9, w * 0.06, h * 0.52);
    ctx.closePath();
  };

  const colour = paint((ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#c9ced6");
    gradient.addColorStop(1, "#8d949f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // score lines either side of a clean hitting area
    ctx.strokeStyle = "rgba(30,34,40,0.75)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = h * (0.2 + i * 0.075);
      for (const [from, to] of [
        [0.1, 0.36],
        [0.64, 0.9],
      ]) {
        ctx.beginPath();
        ctx.moveTo(w * from, y);
        ctx.lineTo(w * to, y);
        ctx.stroke();
      }
    }
    // sweet-spot marks
    ctx.strokeStyle = "rgba(30,34,40,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.44, h * 0.34, w * 0.12, h * 0.32);
  });
  const alpha = paint((ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    outline(ctx, w, h);
    ctx.fill();
  });

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { map, alphaMap: new THREE.CanvasTexture(alpha) };
}

function buildDriver() {
  const club = new THREE.Group();
  club.name = "driver";

  const crownMaterial = new THREE.MeshPhysicalMaterial({
    map: carbonTexture(),
    metalness: 0.1,
    roughness: 0.6,
    // Keep the weave dark: the shine comes from the clear coat on top.
    specularIntensity: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  // Painted parts that join the crown (hosel) without the weave.
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0c0d11,
    metalness: 0.3,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const soleMaterial = new THREE.MeshPhysicalMaterial({
    map: soleTexture(),
    metalness: 0.9,
    roughness: 0.36,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dde3,
    metalness: 1,
    roughness: 0.18,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8102e,
    metalness: 0.6,
    roughness: 0.35,
  });

  const crown = new THREE.Mesh(
    shapeHead(
      new THREE.SphereGeometry(1, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2),
    ),
    crownMaterial,
  );
  const sole = new THREE.Mesh(
    shapeHead(
      new THREE.SphereGeometry(
        1,
        72,
        28,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2,
      ),
    ),
    soleMaterial,
  );
  crown.castShadow = sole.castShadow = true;
  club.add(crown, sole);

  // The hitting face sits a hair proud of the cut-off front of the head.
  const faceGeometry = new THREE.PlaneGeometry(11.4, 5.7, 40, 20);
  const facePosition = faceGeometry.attributes.position;
  for (let i = 0; i < facePosition.count; i++) {
    const x = facePosition.getX(i);
    const y = facePosition.getY(i) + 0.15;
    facePosition.setXYZ(i, x, y, faceSurface(x, y) + 0.05);
  }
  faceGeometry.computeVertexNormals();
  const face = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshStandardMaterial({
      ...faceTextures(),
      alphaTest: 0.5,
      metalness: 0.9,
      roughness: 0.38,
    }),
  );
  face.name = "face";
  club.add(face);

  // Alignment mark on the crown, just behind the top of the face.
  const mark = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const markSpot = onHead(0, 1, 0.3);
  const markAhead = onHead(0, 1, 0.34);
  mark.position.copy(markSpot).add(new THREE.Vector3(0, 0.03, 0));
  // lie it on the crown's slope
  mark.rotation.x =
    -Math.PI / 2 -
    Math.atan2(markAhead.y - markSpot.y, markAhead.z - markSpot.z);
  club.add(mark);

  // A weight port set into the back of the sole, with a chrome surround.
  const weightSpot = onHead(0, -1, -0.62);
  const weightBehind = onHead(0, -1, -0.7);
  const weightSlope = Math.atan2(
    weightBehind.y - weightSpot.y,
    weightSpot.z - weightBehind.z,
  );
  const weight = new THREE.Group();
  weight.position.copy(weightSpot);
  weight.rotation.x = weightSlope;
  const plug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.2, 32),
    accentMaterial,
  );
  const surround = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.09, 12, 40),
    chromeMaterial,
  );
  surround.rotation.x = Math.PI / 2;
  surround.position.y = -0.08;
  weight.add(plug, surround);
  club.add(weight);

  // Hosel and shaft rise from the heel toward the golfer's hands.
  const lie = 58 * RADIANS;
  const shaftDirection = new THREE.Vector3(Math.cos(lie), Math.sin(lie), 0);
  const upright = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    shaftDirection,
  );
  // Start a little inside the crown at the heel so the neck grows out of it.
  const hoselBase = onHead(0.8, 0.5, 0.22).addScaledVector(shaftDirection, -1);
  const along = (distance) =>
    hoselBase.clone().addScaledVector(shaftDirection, distance);

  // A swelling where the neck leaves the head, then the neck itself.
  const shoulder = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 28, 20),
    paintMaterial,
  );
  shoulder.position.copy(along(0.6));
  shoulder.scale.set(1, 1.25, 1.1);
  shoulder.quaternion.copy(upright);
  const hosel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.86, 4.6, 28),
    paintMaterial,
  );
  hosel.position.copy(along(2.6));
  hosel.quaternion.copy(upright);
  shoulder.castShadow = hosel.castShadow = true;
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.63, 0.63, 0.16, 28),
    chromeMaterial,
  );
  collar.position.copy(along(4.95));
  collar.quaternion.copy(upright);
  club.add(shoulder, collar);

  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.62, 1.6, 24),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
  );
  ferrule.position.copy(along(5.8));
  ferrule.quaternion.copy(upright);

  const shaftLength = 86;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.44, shaftLength, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xb3122b,
      metalness: 0.3,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
  );
  shaft.position.copy(along(6.5 + shaftLength / 2));
  shaft.quaternion.copy(upright);
  shaft.castShadow = true;

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 0.95, 27, 24),
    new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }),
  );
  grip.position.copy(along(6.5 + shaftLength + 13.5));
  grip.quaternion.copy(upright);
  grip.castShadow = true;

  club.add(hosel, ferrule, shaft, grip);
  return club;
}

// --- ball, tee, turf ---

function dimpleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rows = 22;
  for (let row = 1; row < rows; row++) {
    const v = row / rows;
    const y = v * canvas.height;
    // fewer dimples toward the poles, where the map is stretched
    const count = Math.max(6, Math.round(44 * Math.sin(v * Math.PI)));
    for (let i = 0; i < count; i++) {
      const x = ((i + (row % 2) * 0.5) / count) * canvas.width;
      const rx = (canvas.width / count) * 0.36;
      const ry = (canvas.height / rows) * 0.36;
      const gradient = ctx.createRadialGradient(
        x,
        y,
        0,
        x,
        y,
        Math.max(rx, ry),
      );
      gradient.addColorStop(0, "#2b2b2b");
      gradient.addColorStop(0.75, "#5a5a5a");
      gradient.addColorStop(1, "#808080");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function buildBall() {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 64, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      bumpMap: dimpleTexture(),
      bumpScale: 2.2,
    }),
  );
  ball.name = "ball";
  ball.position.set(0, BALL_HEIGHT, 0);
  ball.castShadow = true;
  return ball;
}

function buildTee() {
  const tee = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf3ead2,
    roughness: 0.6,
  });
  const top = BALL_HEIGHT - BALL_RADIUS + 0.25;
  const peg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.12, top - 0.5, 16),
    material,
  );
  peg.position.y = (top - 0.5) / 2;
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.28, 0.6, 20),
    material,
  );
  cup.position.y = top - 0.3;
  peg.castShadow = cup.castShadow = true;
  tee.add(peg, cup);
  return tee;
}

function buildTurf() {
  const size = 512;
  const paint = (draw) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    draw(canvas.getContext("2d"));
    return canvas;
  };
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const colour = paint((ctx) => {
    ctx.fillStyle = "#3f8a2f";
    ctx.fillRect(0, 0, size, size);
    const blades = ["#4f9e3a", "#2f7426", "#479334", "#39802c", "#5aab42"];
    for (let i = 0; i < 26000; i++) {
      ctx.strokeStyle = blades[Math.floor(random() * blades.length)];
      ctx.lineWidth = 1;
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 3, y + 2 + random() * 4);
      ctx.stroke();
    }
  });
  // fade the patch of turf out to nothing at its edge
  const fade = paint((ctx) => {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.3,
      size / 2,
      size / 2,
      size * 0.5,
    );
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(1, "#000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  map.anisotropy = 8;

  // The fade must not tile with the grass, so it uses its own UVs.
  const geometry = new THREE.CircleGeometry(95, 64);
  const turf = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map,
      alphaMap: new THREE.CanvasTexture(fade),
      transparent: true,
      roughness: 1,
    }),
  );
  turf.material.alphaMap.channel = 1;
  geometry.setAttribute("uv1", geometry.attributes.uv.clone());
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  turf.name = "turf";
  return turf;
}

// --- guide lines ---

// A flat strip on the turf starting at the origin and running along +z, with
// an arrowhead at the far end. Rotate it about y to point it.
function ribbon({ color, width, from, to, opacity, height }) {
  const shape = new THREE.Shape();
  const half = width / 2;
  const head = width * 1.6;
  shape.moveTo(-half, from);
  shape.lineTo(half, from);
  shape.lineTo(half, to - head);
  shape.lineTo(half * 2.1, to - head);
  shape.lineTo(0, to);
  shape.lineTo(-half * 2.1, to - head);
  shape.lineTo(-half, to - head);
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  // Shape lies in x/y; lay it down so its y runs along +z.
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.y = 1;
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.position.y = height;
  holder.renderOrder = Math.round(height * 10);
  mesh.renderOrder = holder.renderOrder;
  return holder;
}

// A rod with a cone tip pointing along +z from the origin.
function rod({ color, length, radius }) {
  const group = new THREE.Group();
  // Unlit and outside tone mapping so it matches the legend colour exactly.
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const tip = radius * 5;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length - tip, 12),
    material,
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = (length - tip) / 2;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 2.6, tip, 16),
    material,
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = length - tip / 2;
  group.add(shaft, head);
  return group;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const pointAlong = (object, direction) =>
  object.quaternion.setFromUnitVectors(
    Z_AXIS,
    new THREE.Vector3(direction.x, direction.y, direction.z).normalize(),
  );

export function createClubScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Soft studio reflections so the crown and shaft read as glossy.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.9;

  const sun = new THREE.DirectionalLight(0xfff4de, 2.4);
  sun.position.set(-38, 80, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  // A cool light from the far side picks out the edge of the crown.
  const rim = new THREE.DirectionalLight(0xcfe3ff, 1.1);
  rim.position.set(50, 35, 40);
  scene.add(sun, rim, new THREE.AmbientLight(0xffffff, 0.25));

  scene.add(buildTurf(), buildTee(), buildBall());

  // Everything that turns with the golfer's aim.
  const aimed = new THREE.Group();
  scene.add(aimed);

  // Centre line of the range: fixed, so aiming shows against it.
  const centreLine = ribbon({
    color: 0xffffff,
    width: 0.35,
    from: -70,
    to: 80,
    opacity: 0.22,
    height: 0.06,
  });
  scene.add(centreLine);
  const aimLine = ribbon({
    color: 0xffffff,
    width: 0.5,
    from: -70,
    to: 80,
    opacity: 0.4,
    height: 0.08,
  });
  const pathRibbon = ribbon({
    color: PATH_COLOR,
    width: 5.2,
    from: -58,
    to: 34,
    opacity: 0.5,
    height: 0.1,
  });
  const startRibbon = ribbon({
    color: START_COLOR,
    width: 1.5,
    from: 3,
    to: 62,
    opacity: 0.6,
    height: 0.14,
  });
  const faceRibbon = ribbon({
    color: FACE_COLOR,
    width: 1.1,
    from: 3,
    to: 44,
    opacity: 0.8,
    height: 0.18,
  });
  scene.add(aimLine, pathRibbon, startRibbon, faceRibbon);

  // In the air: how the head arrives and how the ball leaves.
  const attackRod = rod({ color: PATH_COLOR, length: 20, radius: 0.2 });
  const launchRod = rod({ color: START_COLOR, length: 46, radius: 0.24 });
  scene.add(attackRod, launchRod);

  // The driver. `club` turns with the face; `tilt` tips it back for loft;
  // the head inside slides for the strike point.
  const club = new THREE.Group();
  const tilt = new THREE.Group();
  const driver = buildDriver();
  tilt.add(driver);
  club.add(tilt);
  scene.add(club);

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(LOOK_AT);
  controls.enablePan = false;
  controls.minDistance = 28;
  controls.maxDistance = 170;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.enableDamping = false;

  let mirror = 1;
  let view = "behind";
  let tween = null;
  let frameId = null;

  function render() {
    renderer.render(scene, camera);
  }

  function viewPosition(name) {
    const [x, y, z] = VIEWS[name].position;
    return new THREE.Vector3(x * mirror, y, z);
  }

  // Glide the camera to a named angle; `instant` cuts straight there.
  function setView(name, { instant = false } = {}) {
    if (!VIEWS[name]) return;
    view = name;
    const to = viewPosition(name);
    if (instant) {
      tween = null;
      camera.position.copy(to);
      controls.target.copy(LOOK_AT);
      controls.update();
      render();
      return;
    }
    tween = { from: camera.position.clone(), to, start: performance.now() };
    if (frameId === null) frameId = requestAnimationFrame(step);
  }

  function step(now) {
    frameId = null;
    if (!tween) return;
    const t = Math.min(1, (now - tween.start) / 450);
    const eased = t * t * (3 - 2 * t);
    // Swing round the look-at point rather than cutting through the club.
    const from = tween.from.clone().sub(LOOK_AT);
    const to = tween.to.clone().sub(LOOK_AT);
    const distance = from.length() + (to.length() - from.length()) * eased;
    const direction = from.normalize().lerp(to.normalize(), eased);
    if (direction.lengthSq() < 1e-6) direction.set(0, 1, 0);
    camera.position
      .copy(LOOK_AT)
      .addScaledVector(direction.normalize(), distance);
    controls.update();
    render();
    if (t < 1) frameId = requestAnimationFrame(step);
    else tween = null;
  }

  // Pose the club and guide lines for a clubSetup() result.
  function update(setup) {
    const flipped = setup.mirror !== mirror;
    mirror = setup.mirror;

    const turn = (degrees) => -degrees * RADIANS;
    aimLine.rotation.y = turn(setup.aimDegrees);
    pathRibbon.rotation.y = turn(setup.pathDegrees);
    faceRibbon.rotation.y = turn(setup.faceDegrees);
    startRibbon.rotation.y = turn(setup.startDegrees);
    centreLine.visible = setup.aimDegrees !== 0;

    // The face meets the back of the ball.
    const contact = new THREE.Vector3(0, BALL_HEIGHT, 0).addScaledVector(
      new THREE.Vector3().copy(groundDirection(setup.faceDegrees)),
      -BALL_RADIUS,
    );
    club.position.copy(contact);
    club.rotation.y = turn(setup.faceDegrees);
    club.scale.x = mirror;
    // Tip the head back for loft beyond what is built into it.
    tilt.rotation.x = -setup.loftTiltDegrees * RADIANS;
    // The toe is the end away from the golfer (-x before mirroring), so a
    // toe strike slides the head toward the golfer.
    driver.position.x = setup.strikeCm;

    const arriving = risingDirection(setup.pathDegrees, setup.attackDegrees);
    pointAlong(attackRod, arriving);
    attackRod.position
      .set(0, BALL_HEIGHT, 0)
      .addScaledVector(new THREE.Vector3().copy(arriving), -36);

    const leaving = risingDirection(setup.startDegrees, setup.launchDegrees);
    pointAlong(launchRod, leaving);
    launchRod.position
      .set(0, BALL_HEIGHT, 0)
      .addScaledVector(new THREE.Vector3().copy(leaving), BALL_RADIUS + 2);

    // Keep the same named angle when the golfer switches sides.
    if (flipped) setView(view, { instant: true });
    else render();
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  controls.addEventListener("change", render);

  camera.position.copy(viewPosition(view));
  controls.update();
  resize();

  function dispose() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    controls.dispose();
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      for (const material of [].concat(object.material || [])) {
        for (const key of ["map", "alphaMap", "bumpMap"]) {
          if (material[key]) material[key].dispose();
        }
        material.dispose();
      }
    });
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  const api = { update, setView, dispose, render, scene, camera };
  if (process.env.NODE_ENV !== "production") window.__clubScene = api;
  return api;
}

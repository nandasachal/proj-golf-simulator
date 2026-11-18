import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { groundDirection, risingDirection } from "./club-setup";
import { getClub } from "./clubs";
import { buildClubHead } from "./club-heads";

// A close-up of the club meeting the ball, posed from the shot controls.
// Units are centimetres. The ball sits at the origin's x/z (on a tee for the
// driver, on the turf for everything else), the target is down +z and -x is
// the right-hand side. Heads are modelled for a right-hander (heel and shaft
// on +x) and mirrored for a left-hander.

const BALL_RADIUS = 2.135;
const BALL_HEIGHT = 4.6; // centre of a teed-up ball above the turf
// How far the sole of a club played off the turf sits above it.
const SOLE_CLEARANCE = 0.03;
const RADIANS = Math.PI / 180;

export const FACE_COLOR = 0xffffff;
export const PATH_COLOR = 0xa3e635;
export const START_COLOR = 0xfb923c;
export const ATTACK_COLOR = 0xc4b5fd;
export const LOFT_COLOR = 0xf9a8d4;
// How far the loft lever reaches up from the middle of the face.
export const LOFT_LEVER_LENGTH = 20;

// Camera positions for a right-hander; x flips for a left-hander.
const LOOK_AT = new THREE.Vector3(0, 4, -3.5);
export const VIEWS = {
  behind: { label: "Behind", position: [20, 42, -60] },
  toe: { label: "Toe", position: [-70, 9, -4] },
  above: { label: "Above", position: [0, 118, -7] },
  face: { label: "Face", position: [-20, 13, 58] },
};

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

function buildBall(height) {
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
  ball.position.set(0, height, 0);
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

// `radius` is how far the patch of turf reaches before it has faded away.
function buildTurf(radius = 95) {
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
  // the same size of grass however big the patch
  map.repeat.set(radius / 19, radius / 19);
  map.anisotropy = 8;

  // The fade must not tile with the grass, so it uses its own UVs.
  const geometry = new THREE.CircleGeometry(radius, 64);
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

const cssColor = (color) => `#${new THREE.Color(color).getHexString()}`;

// A flat strip on the turf running along +z from `from` to `to` (measured
// from the ball), fading in from its tail and ending in an arrowhead. With
// `chevrons` it carries direction marks along its length, like a swing-path
// strip. Rotate it about y to point it.
function ribbon({ color, width, from, to, opacity, height, chevrons }) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  // The top of the canvas is the far (arrow) end of the strip.
  const headLength = Math.min(h * 0.22, ((width * 1.5) / (to - from)) * h);

  const fade = ctx.createLinearGradient(0, h, 0, 0);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(0.25, "rgba(255,255,255,0.75)");
  fade.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = fade;
  // shaft
  ctx.fillRect(w * 0.22, headLength, w * 0.56, h - headLength);
  // arrowhead
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w, headLength);
  ctx.lineTo(0, headLength);
  ctx.closePath();
  ctx.fill();

  // Tint it; what is drawn so far only sets the shape.
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = cssColor(color);
  ctx.fillRect(0, 0, w, h);

  if (chevrons) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    const spacing = h / 9;
    for (let y = headLength + spacing; y < h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(w * 0.26, y + 9);
      ctx.lineTo(w / 2, y - 9);
      ctx.lineTo(w * 0.74, y + 9);
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  // The drawn shaft is 56% of the canvas width, so widen the strip to match.
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width / 0.56, to - from),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  // Lie it flat with the top of the texture toward +z.
  mesh.rotation.x = Math.PI / 2;
  mesh.rotation.z = Math.PI;
  mesh.position.z = (from + to) / 2;
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.position.y = height;
  mesh.renderOrder = Math.round(height * 100);
  return holder;
}

// A plain bar on the turf across the origin, along x. Used for the line of
// the club face, which makes a small face angle much easier to read.
function bar({ color, length, thickness, opacity, height }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, thickness),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = Math.round(height * 100);
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.position.y = height;
  return holder;
}

// A small text tag that always faces the camera and draws over everything.
function label(color) {
  const canvas = document.createElement("canvas");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      // Hidden when the club or ball is in front of it, so a tag behind the
      // head never covers the face.
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      // Same size on screen wherever it sits, so near tags don't balloon.
      sizeAttenuation: false,
    }),
  );
  sprite.renderOrder = 1000;
  let shown = null;

  sprite.setText = (text) => {
    if (text === shown) return;
    shown = text;
    const fontSize = 44;
    const font = `600 ${fontSize}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    const padding = 22;
    canvas.width = Math.ceil(ctx.measureText(text).width) + padding * 2;
    canvas.height = 72;
    // resizing the canvas clears it and resets its state
    ctx.font = font;
    ctx.fillStyle = "rgba(8, 20, 14, 0.82)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 18);
    ctx.fill();
    ctx.fillStyle = cssColor(color);
    ctx.textBaseline = "middle";
    ctx.fillText(text, padding, canvas.height / 2 + 2);
    texture.needsUpdate = true;
    // Texture storage is sized on first upload; a new size needs a new one.
    texture.dispose();
    sprite.userData.aspect = canvas.width / canvas.height;
    sprite.fit();
  };

  // Tags are a fixed number of pixels tall, whatever size the view is.
  // `unitsPerPixel` converts pixels to the sprite's distance-1 units.
  let unitsPerPixel = 0.001;
  let pixelsTall = 22;
  sprite.fit = (perPixel = unitsPerPixel, pixels = pixelsTall) => {
    unitsPerPixel = perPixel;
    pixelsTall = pixels;
    const tall = pixelsTall * unitsPerPixel;
    sprite.scale.set((sprite.userData.aspect || 1) * tall, tall, 1);
  };
  return sprite;
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

// Options, all optional:
//   club         the club to show, from clubs.js (the driver if left out)
//   orbit        let the viewer drag to look around (default true)
//   camera       { position: [x, y, z], lookAt: [x, y, z], fov } for one
//                fixed angle instead of the named views; x flips for a
//                left-hander
//   labels       draw the value tags (default true)
//   groundGuides draw the aim, path, face and start lines on the turf
//   airGuides    draw the attack and launch arrows
//   loftLever    draw a line up the plane of the face, so its lean is easy
//                to see and to grab
//   attackRodLength, launchRodLength  how long the arriving and leaving
//                arrows are drawn
//   turfRadius   how far the turf reaches (bigger for a view along the ground)
export function createClubScene(container, options = {}) {
  const {
    club: clubSpec = getClub("driver"),
    orbit = true,
    camera: fixedCamera = null,
    labels: showLabels = true,
    groundGuides = true,
    airGuides = true,
    loftLever = false,
    attackRodLength = 20,
    launchRodLength = 46,
    turfRadius = 95,
  } = options;
  // Centre of the ball above the turf.
  const ballHeight = clubSpec.teed ? BALL_HEIGHT : BALL_RADIUS;
  const lookAt = fixedCamera
    ? new THREE.Vector3(...fixedCamera.lookAt)
    : LOOK_AT;

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

  scene.add(buildTurf(turfRadius), buildBall(ballHeight));
  if (clubSpec.teed) scene.add(buildTee());

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
    from: -62,
    to: 40,
    opacity: 0.62,
    height: 0.1,
    chevrons: true,
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
  // The line of the club face, square to where it points.
  const faceLine = bar({
    color: FACE_COLOR,
    length: 28,
    thickness: 0.45,
    opacity: 0.9,
    height: 0.2,
  });
  scene.add(aimLine, pathRibbon, startRibbon, faceRibbon, faceLine);

  const labels = {
    path: label(PATH_COLOR),
    face: label(FACE_COLOR),
    start: label(START_COLOR),
    launch: label(START_COLOR),
    attack: label(PATH_COLOR),
  };
  scene.add(...Object.values(labels));

  // In the air: how the head arrives and how the ball leaves.
  const attackRod = rod({
    color: ATTACK_COLOR,
    length: attackRodLength,
    radius: 0.2,
  });
  const launchRod = rod({
    color: START_COLOR,
    length: launchRodLength,
    radius: 0.24,
  });
  scene.add(attackRod, launchRod);

  // The club. `club` sits where the face touches the ball and turns with the
  // face; `tilt` tips it about that point for the loft delivered; the head
  // inside slides heel-to-toe for the strike point and, off the turf, up or
  // down the face until its sole rests on the ground.
  const club = new THREE.Group();
  const tilt = new THREE.Group();
  const head = buildClubHead(clubSpec);
  tilt.add(head);
  club.add(tilt);
  scene.add(club);
  const staticLoft = clubSpec.loftDegrees * RADIANS;
  // Up the face, in the head's own frame.
  const upFace = new THREE.Vector3(
    0,
    Math.cos(staticLoft),
    -Math.sin(staticLoft),
  );
  const solePoints = head.userData.solePoints || [];

  if (loftLever) {
    // Rises from the middle of the face along the face's own plane, so it
    // leans exactly as far as the loft.
    const lever = rod({
      color: LOFT_COLOR,
      length: LOFT_LEVER_LENGTH,
      radius: 0.16,
    });
    pointAlong(lever, upFace);
    tilt.add(lever);
  }

  for (const guide of [
    aimLine,
    pathRibbon,
    startRibbon,
    faceRibbon,
    faceLine,
  ]) {
    guide.visible = groundGuides;
  }
  attackRod.visible = airGuides;
  launchRod.visible = airGuides;
  for (const tag of Object.values(labels)) tag.visible = showLabels;

  const camera = new THREE.PerspectiveCamera(fixedCamera?.fov ?? 30, 1, 1, 800);
  // Without orbiting the camera just looks at its target.
  const controls = orbit
    ? new OrbitControls(camera, renderer.domElement)
    : {
        target: new THREE.Vector3(),
        update() {
          camera.lookAt(this.target);
        },
        addEventListener() {},
        dispose() {},
      };
  controls.target.copy(lookAt);
  if (orbit) {
    controls.enablePan = false;
    controls.minDistance = 28;
    controls.maxDistance = 170;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.enableDamping = false;
  }

  let mirror = 1;
  let view = "behind";
  let tween = null;
  let frameId = null;

  function render() {
    renderer.render(scene, camera);
  }

  function viewPosition(name) {
    const [x, y, z] = fixedCamera ? fixedCamera.position : VIEWS[name].position;
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
      controls.target.copy(lookAt);
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
    const from = tween.from.clone().sub(lookAt);
    const to = tween.to.clone().sub(lookAt);
    const distance = from.length() + (to.length() - from.length()) * eased;
    const direction = from.normalize().lerp(to.normalize(), eased);
    if (direction.lengthSq() < 1e-6) direction.set(0, 1, 0);
    camera.position
      .copy(lookAt)
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
    centreLine.visible = groundGuides && setup.aimDegrees !== 0;

    // The face leans back by the loft delivered and touches the ball where
    // its plane is tangent: low on the back of the ball, lower with more
    // loft.
    const loft = staticLoft + setup.loftTiltDegrees * RADIANS;
    const facing = groundDirection(setup.faceDegrees);
    const contact = new THREE.Vector3(
      -facing.x * BALL_RADIUS * Math.cos(loft),
      ballHeight - BALL_RADIUS * Math.sin(loft),
      -facing.z * BALL_RADIUS * Math.cos(loft),
    );
    club.position.copy(contact);
    club.rotation.y = turn(setup.faceDegrees);
    club.scale.x = mirror;
    // Tip the head back (or, with shaft lean, forward) from its built-in
    // loft.
    const tip = -setup.loftTiltDegrees * RADIANS;
    tilt.rotation.x = tip;
    // The toe is the end away from the golfer (-x before mirroring), so a
    // toe strike slides the head toward the golfer.
    head.position.set(setup.strikeCm, 0, 0);
    if (!clubSpec.teed && solePoints.length) {
      // Slide the head along its face until the lowest part of the sole is
      // just on the turf, so the ball is met low on the face as it is off
      // the ground.
      let lowest = Infinity;
      for (const point of solePoints) {
        lowest = Math.min(
          lowest,
          point.y * Math.cos(tip) - point.z * Math.sin(tip),
        );
      }
      const slide = (SOLE_CLEARANCE - contact.y - lowest) / Math.cos(loft);
      head.position.addScaledVector(upFace, slide);
    }

    const arriving = risingDirection(setup.pathDegrees, setup.attackDegrees);
    pointAlong(attackRod, arriving);
    attackRod.position
      .set(0, ballHeight, 0)
      .addScaledVector(
        new THREE.Vector3().copy(arriving),
        -(16 + attackRodLength),
      );

    const leaving = risingDirection(setup.startDegrees, setup.launchDegrees);
    pointAlong(launchRod, leaving);
    launchRod.position
      .set(0, ballHeight, 0)
      .addScaledVector(new THREE.Vector3().copy(leaving), BALL_RADIUS + 2);

    // Name each guide where it ends. Face and start often point almost the
    // same way, so they sit at different distances and heights.
    // `aside` shifts a tag to the right (+) or left (-) of its line so the
    // tags don't sit on top of each other when seen from above.
    const at = (direction, distance, height, aside = 0) =>
      new THREE.Vector3(
        direction.x * distance - direction.z * aside,
        height,
        direction.z * distance + direction.x * aside,
      );
    faceLine.position.set(contact.x, faceLine.position.y, contact.z);
    faceLine.rotation.y = turn(setup.faceDegrees);
    labels.path.setText(`Path ${setup.labels.path}`);
    labels.path.position.copy(
      at(groundDirection(setup.pathDegrees), -25, 2.6, -10),
    );
    labels.face.setText(`Face ${setup.labels.face}`);
    labels.face.position.copy(
      at(groundDirection(setup.faceDegrees), 15, 2.6, 11),
    );
    labels.start.setText(`Start ${setup.labels.start}`);
    labels.start.position.copy(
      at(groundDirection(setup.startDegrees), 26, 2.6, -11),
    );
    labels.launch.setText(`Launch ${setup.labels.launch}`);
    labels.launch.position
      .set(0, ballHeight + 2.6, 0)
      .addScaledVector(new THREE.Vector3().copy(leaving), BALL_RADIUS + 16);
    labels.attack.setText(`Attack ${setup.labels.attack}`);
    labels.attack.position
      .copy(at(groundDirection(setup.pathDegrees), -22, 0, 9))
      .setY(ballHeight + 3.2);

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
    // At distance 1 the view is 2 * tan(fov / 2) units tall.
    const unitsPerPixel = (2 * Math.tan((camera.fov * RADIANS) / 2)) / height;
    // Smaller tags in the small view so five of them still fit.
    const pixelsTall = Math.min(22, Math.max(13, height * 0.06));
    for (const tag of Object.values(labels)) {
      tag.fit(unitsPerPixel, pixelsTall);
    }
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
        for (const value of Object.values(material)) {
          if (value && value.isTexture && value !== environment) {
            value.dispose();
          }
        }
        material.dispose();
      }
    });
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  // Where a point in the scene is drawn, in pixels from the view's top left.
  function project(point) {
    camera.updateMatrixWorld();
    const ndc = new THREE.Vector3(point.x, point.y, point.z).project(camera);
    return {
      x: ((ndc.x + 1) / 2) * container.clientWidth,
      y: ((1 - ndc.y) / 2) * container.clientHeight,
    };
  }

  // The point in the scene under a screen position, on the turf (or a level
  // plane `height` above it) for `plane: "ground"`, or on the upright plane
  // through the ball and the target for `plane: "side"`. Null if the view
  // never meets that plane there.
  const raycaster = new THREE.Raycaster();
  function pick(clientX, clientY, { plane = "ground", height = 0 } = {}) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    const surface =
      plane === "side"
        ? new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
        : new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const hit = raycaster.ray.intersectPlane(surface, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }

  // The view's size on the page, in pixels.
  const size = () => ({
    width: container.clientWidth,
    height: container.clientHeight,
  });

  const api = {
    update,
    setView,
    dispose,
    render,
    project,
    pick,
    size,
    scene,
    camera,
  };
  if (process.env.NODE_ENV !== "production") window.__clubScene = api;
  return api;
}

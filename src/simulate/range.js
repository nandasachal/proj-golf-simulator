import * as THREE from "three";

// Scene units are yards. The tee is at the origin and the range runs down +z;
// -x is the right-hand side when looking downrange.

export const RANGE_LENGTH = 400;
export const FAIRWAY_HALF_WIDTH = 60;
export const MARKER_INTERVAL = 50;
export const LAST_MARKER = 350;

const SKY_TOP = 0x2f7fd8;
const SKY_HORIZON = 0xcfe6f5;
const FLAG_COLORS = [
  0xe63946, 0xffffff, 0x2a6fdb, 0xffd23f, 0xe63946, 0xffffff, 0x2a6fdb,
];

// Deterministic so the range looks the same on every load.
function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, width, height, random, count, colors) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    const size = 1 + random() * 1.5;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
}

function roughTexture(random) {
  const texture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#3f6f2c";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, random, 26000, [
      "#35622a",
      "#4a7a33",
      "#2f5825",
      "#55833a",
    ]);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Two mowing bands per tile, so one tile spans 2 * bandYards down the range.
function fairwayTexture(random) {
  const texture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#66ab40";
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#4b8a31";
    ctx.fillRect(0, h / 2, w, h / 2);
    speckle(ctx, w, h, random, 14000, ["#6fb548", "#447f2d", "#5a9a3b"]);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function signTexture(yards) {
  return canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = "#0f2a1c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f4f1e4";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = "#f4f1e4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 112px Helvetica, Arial, sans-serif";
    ctx.fillText(String(yards), w / 2, h / 2 + 6);
  });
}

function buildSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      horizon: { value: new THREE.Color(SKY_HORIZON) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDirection;
      void main() {
        float t = pow(clamp(vDirection.y, 0.0, 1.0), 0.45);
        gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), material);
  sky.name = "sky";
  return sky;
}

function buildClouds(random) {
  const texture = canvasTexture(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 9; i++) {
      const x = w * (0.2 + random() * 0.6);
      const y = h * (0.45 + random() * 0.2);
      const r = 22 + random() * 26;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const group = new THREE.Group();
  group.name = "clouds";
  for (let i = 0; i < 14; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      fog: false,
      depthWrite: false,
      opacity: 0.45 + random() * 0.3,
    });
    const cloud = new THREE.Sprite(material);
    const angle = (random() - 0.5) * Math.PI * 1.3;
    const distance = 1100 + random() * 400;
    cloud.position.set(
      Math.sin(angle) * distance,
      190 + random() * 330,
      Math.cos(angle) * distance,
    );
    const size = 320 + random() * 380;
    cloud.scale.set(size, size * 0.42, 1);
    group.add(cloud);
  }
  return group;
}

function buildGround(random, anisotropy) {
  const group = new THREE.Group();
  group.name = "ground";

  const rough = roughTexture(random);
  rough.repeat.set(500, 500);
  rough.anisotropy = anisotropy;
  const roughMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ map: rough, roughness: 1 }),
  );
  roughMesh.rotation.x = -Math.PI / 2;
  roughMesh.receiveShadow = true;
  group.add(roughMesh);

  const bandYards = 12.5;
  const fairwayLength = RANGE_LENGTH + 30;
  const fairway = fairwayTexture(random);
  fairway.repeat.set(24, fairwayLength / (2 * bandYards));
  fairway.anisotropy = anisotropy;
  const fairwayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FAIRWAY_HALF_WIDTH * 2, fairwayLength),
    new THREE.MeshStandardMaterial({ map: fairway, roughness: 1 }),
  );
  fairwayMesh.rotation.x = -Math.PI / 2;
  fairwayMesh.position.set(0, 0.01, fairwayLength / 2 - 10);
  fairwayMesh.receiveShadow = true;
  fairwayMesh.name = "fairway";
  group.add(fairwayMesh);

  return group;
}

function buildMarkers() {
  const group = new THREE.Group();
  group.name = "markers";

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
  });
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e6da });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
  // Near signs sit closer to the centre line (and are smaller) so they are
  // still in view from the tee.
  const signLayout = { 50: [30, 0.5], 100: [48, 0.75] };

  for (
    let yards = MARKER_INTERVAL;
    yards <= LAST_MARKER;
    yards += MARKER_INTERVAL
  ) {
    const marker = new THREE.Group();
    marker.name = `marker-${yards}`;
    marker.position.z = yards;

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(FAIRWAY_HALF_WIDTH * 2, 0.5),
      lineMaterial,
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    marker.add(line);

    const [signX, signScale] = signLayout[yards] || [
      FAIRWAY_HALF_WIDTH + 6,
      1 + (yards - 150) / 400,
    ];
    const boardWidth = 9 * signScale;
    const boardHeight = 5.6 * signScale;
    const postHeight = 1.4;
    const boardMaterial = new THREE.MeshBasicMaterial({
      map: signTexture(yards),
    });
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(boardWidth, boardHeight),
        boardMaterial,
      );
      // Boards face back toward the tee and angle slightly inward.
      board.position.set(side * signX, postHeight + boardHeight / 2, 0);
      board.rotation.y = Math.PI + side * 0.25;
      marker.add(board);
      for (const offset of [-boardWidth / 2 + 0.4, boardWidth / 2 - 0.4]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, postHeight),
          postMaterial,
        );
        post.position.set(
          board.position.x + offset * Math.cos(board.rotation.y),
          postHeight / 2,
          -offset * Math.sin(board.rotation.y),
        );
        marker.add(post);
      }
    }

    // A target flag on the centre line, alternating sides so they don't stack.
    const flagX = ((yards / MARKER_INTERVAL) % 2 === 0 ? 1 : -1) * 14;
    const green = new THREE.Mesh(
      new THREE.CircleGeometry(9, 40),
      new THREE.MeshStandardMaterial({ color: 0x79c257, roughness: 1 }),
    );
    green.rotation.x = -Math.PI / 2;
    green.position.set(flagX, 0.02, 0);
    green.receiveShadow = true;
    marker.add(green);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 5),
      poleMaterial,
    );
    pole.position.set(flagX, 2.5, 0);
    marker.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.3),
      new THREE.MeshBasicMaterial({
        color: FLAG_COLORS[yards / MARKER_INTERVAL - 1],
        side: THREE.DoubleSide,
      }),
    );
    flag.position.set(flagX - 1.15, 4.3, 0);
    marker.add(flag);

    group.add(marker);
  }
  return group;
}

function buildTrees(random) {
  const positions = [];
  const add = (x, z) => positions.push({ x, z, scale: 1 + random() * 0.9 });
  for (let z = -50; z <= RANGE_LENGTH + 80; z += 9) {
    for (const side of [-1, 1]) {
      add(side * (92 + random() * 12), z + random() * 6);
      add(side * (112 + random() * 22), z + random() * 6);
      add(side * (142 + random() * 40), z + random() * 6);
    }
  }
  for (let x = -90; x <= 90; x += 9) {
    add(x + random() * 6, RANGE_LENGTH + 62 + random() * 14);
    add(x + random() * 6, RANGE_LENGTH + 84 + random() * 24);
  }

  const group = new THREE.Group();
  group.name = "trees";
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.75, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }),
    positions.length,
  );
  const conifers = new THREE.InstancedMesh(
    new THREE.ConeGeometry(4.6, 17, 7),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    positions.length,
  );
  const broadleaves = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(6.2, 1),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    positions.length,
  );

  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const color = new THREE.Color();
  positions.forEach(({ x, z, scale }, i) => {
    matrix.makeScale(scale, scale, scale).setPosition(x, 3 * scale, z);
    trunks.setMatrixAt(i, matrix);

    const conifer = random() > 0.45;
    color.setHSL(
      0.27 + random() * 0.07,
      0.42 + random() * 0.15,
      0.2 + random() * 0.1,
    );
    if (conifer) {
      matrix.makeScale(scale, scale, scale).setPosition(x, 12.5 * scale, z);
      conifers.setMatrixAt(i, matrix);
      conifers.setColorAt(i, color);
      broadleaves.setMatrixAt(i, hidden);
      broadleaves.setColorAt(i, color);
    } else {
      matrix
        .makeScale(scale, scale * (0.85 + random() * 0.3), scale)
        .setPosition(x, 10.5 * scale, z);
      broadleaves.setMatrixAt(i, matrix);
      broadleaves.setColorAt(i, color);
      conifers.setMatrixAt(i, hidden);
      conifers.setColorAt(i, color);
    }
  });
  group.add(trunks, conifers, broadleaves);
  return group;
}

function buildHills() {
  const group = new THREE.Group();
  group.name = "hills";
  const material = new THREE.MeshBasicMaterial({ color: 0x7fa39a, fog: false });
  const far = new THREE.MeshBasicMaterial({ color: 0x9dbcc0, fog: false });
  const hills = [
    [-520, 1150, 620, 120, far],
    [260, 1250, 760, 150, far],
    [-140, 980, 480, 80, material],
    [620, 940, 420, 95, material],
    [-760, 900, 380, 90, material],
  ];
  for (const [x, z, radius, height, hillMaterial] of hills) {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12),
      hillMaterial,
    );
    hill.scale.set(radius, height, radius * 0.5);
    hill.position.set(x, -8, z);
    group.add(hill);
  }
  return group;
}

// The hitting bays: a strip of mats either side of the player's own.
function buildTeeLine(random) {
  const group = new THREE.Group();
  group.name = "tee-line";

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(FAIRWAY_HALF_WIDTH * 2, 9),
    new THREE.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.95 }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.02, -2.2);
  deck.receiveShadow = true;
  group.add(deck);

  const matMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f7d3a,
    roughness: 1,
  });
  const dividerMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3b2a });
  const ballMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f7f2,
    roughness: 0.4,
  });
  const trayMaterial = new THREE.MeshStandardMaterial({
    color: 0x23262b,
    roughness: 0.8,
  });
  const ballGeometry = new THREE.SphereGeometry(0.0234, 10, 8);

  for (let bay = -6; bay <= 6; bay++) {
    const x = bay * 4.4;
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.04, 2.4),
      matMaterial,
    );
    mat.position.set(x, 0.04, 0);
    mat.receiveShadow = true;
    mat.name = bay === 0 ? "player-mat" : "mat";
    group.add(mat);

    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.5, 3.2),
      dividerMaterial,
    );
    divider.position.set(x + 2.2, 0.27, -1.4);
    divider.castShadow = true;
    group.add(divider);

    // A tray of range balls beside each mat.
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.05, 0.42),
      trayMaterial,
    );
    tray.position.set(x - 1.55, 0.05, -0.95);
    group.add(tray);
    for (let i = 0; i < 12; i++) {
      const ball = new THREE.Mesh(ballGeometry, ballMaterial);
      ball.position.set(
        tray.position.x + (random() - 0.5) * 0.3,
        0.1 + (i > 8 ? 0.04 : 0),
        tray.position.z + (random() - 0.5) * 0.3,
      );
      group.add(ball);
    }
  }
  return group;
}

function buildLights() {
  const group = new THREE.Group();
  group.name = "lights";
  group.add(new THREE.HemisphereLight(0xdcebff, 0x4d6b35, 1.15));

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-14, 22, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  group.add(sun, sun.target);
  return group;
}

export function buildRange({ anisotropy = 1 } = {}) {
  const random = seededRandom(20261115);
  const range = new THREE.Group();
  range.name = "range";
  range.add(
    buildSky(),
    buildClouds(random),
    buildHills(),
    buildGround(random, anisotropy),
    buildMarkers(),
    buildTrees(random),
    buildTeeLine(random),
    buildLights(),
  );
  return range;
}

export const FOG = { color: SKY_HORIZON, near: 260, far: 1500 };

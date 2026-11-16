import * as THREE from "three";
import {
  RANGE_LENGTH,
  FAIRWAY_HALF_WIDTH,
  CLEAR_HALF_WIDTH,
  SUN_DIRECTION,
  SUN_COLOR,
  terrainHeight,
  groundOverlay,
  canvasTexture,
  fbm,
} from "./shared";

// Woodland framing the range: four procedural tree species drawn as instanced
// meshes of alpha-tested leaf cards, the shade they throw baked into ground
// overlays (the sun's shadow map only reaches the tee), and rough-line grass.

// --- layout ---
const TREE_LINE = 97; // half-width where trunks may start
const END_LINE = RANGE_LENGTH + 65; // trunks close the far end beyond this z
const TREE_Z_MIN = -72;
const FRONT_DEPTH = 60; // dense, tightly spaced rows this deep behind the line
const WOOD_DEPTH = 165; // continuous canopy out to here (|x| ≈ 260)
const SLOPE_DEPTH = 420; // sparse trees thin out to nothing by here
const FRONT_SPACING = 7.5;
const WOOD_SPACING = 10.5;
const SLOPE_SPACING = 17;
const EDGE_WOBBLE = 7; // yards the tree line bays in and out
const SPECIMEN_CHANCE = 0.04; // front trees grown tall enough to break the skyline
const TREE_SINK = 0.15; // trunks start this far below the ground

// --- level of detail (static, by position) ---
const NEAR_TREES = 96; // full-detail trees, picked closest to the tee line
const NEAR_REACH = 20; // only trees this close to the line can be full detail
const MID_DEPTH = 30; // medium detail for the rest of the front rows

// --- look ---
const ALPHA_TEST = 0.42;
const ALPHA_TO_COVERAGE = true; // smooths leaf edges through MSAA
const ALPHA_DISTANCE_BOOST = 0.9; // keeps crowns from thinning out far away
const TRANSLUCENCY = 0.75; // sunlight glowing through backlit leaves
const WIND_DIRECTION = [0.8, 0.6]; // xz, unit length
const WIND_BEND = 0.012; // crown sway, yards per yard of height
const WIND_FLUTTER = 0.07; // leaf flutter amplitude in yards

// --- baked shade ---
const SHADOW_OPACITY = 0.52;
const SHADOW_COLOR = 0x0b1712;
const SHADOW_LAYER = 5; // groundOverlay layer: above the fairway and lines
const SHADOW_X = -SUN_DIRECTION.x / SUN_DIRECTION.y; // ground offset per yard of height
const SHADOW_Z = -SUN_DIRECTION.z / SUN_DIRECTION.y;

// --- understory and ground cover ---
const SHRUB_SPACING = 3.2;
const GRASS_ATTEMPTS = 15000;
const FLOWER_ATTEMPTS = 1500;
const GRASS_INNER = FAIRWAY_HALF_WIDTH + 6;
const GRASS_OUTER = 112;

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- geometry

function createBuilder(height) {
  return {
    height,
    position: [],
    normal: [],
    uv: [],
    color: [],
    wind: [],
    index: [],
    count: 0,
  };
}

// `flutter` is how much of the leaf flutter this vertex takes; the crown-bend
// weight comes from its height.
function pushVertex(b, p, n, u, v, shade, flutter) {
  b.position.push(p.x, p.y, p.z);
  b.normal.push(n.x, n.y, n.z);
  b.uv.push(u, v);
  b.color.push(shade, shade, shade);
  const t = Math.min(1.2, Math.max(0, p.y) / b.height);
  b.wind.push(Math.pow(t, 1.5) * b.height, flutter);
  return b.count++;
}

function toGeometry(b) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(b.position, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(b.normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(b.color, 3));
  geometry.setAttribute("aWind", new THREE.Float32BufferAttribute(b.wind, 2));
  geometry.setIndex(b.index);
  return geometry;
}

// The foliage atlas is a 2x2 grid; (s, t) run across a cell with t = 0 at the
// top of its picture.
const CELL = { broadleaf: [0, 0], bough: [1, 0], birch: [0, 1], cypress: [1, 1] };
const FULL = [0, 0, 1, 1];
const CELL_INSET = 0.012;

function cellUv(cell, s, t) {
  if (cell === FULL) return [s, t];
  return [
    (cell[0] + CELL_INSET + s * (1 - 2 * CELL_INSET)) / 2,
    (cell[1] + CELL_INSET + t * (1 - 2 * CELL_INSET)) / 2,
  ];
}

function addQuad(b, corners, sts, cell, normalFn, shadeFn, flutters) {
  const first = b.count;
  for (let i = 0; i < 4; i++) {
    const [u, v] = cellUv(cell, sts[i][0], sts[i][1]);
    pushVertex(
      b,
      corners[i],
      normalFn(corners[i]),
      u,
      v,
      shadeFn(corners[i]),
      flutters[i],
    );
  }
  b.index.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

const CARD_ST = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
];
const CARD_FLUTTER = [1, 1, 1, 1];

function addCard(b, centre, right, up, w, h, cell, normalFn, shadeFn) {
  const corner = (sx, sy) =>
    centre
      .clone()
      .addScaledVector(right, (sx * w) / 2)
      .addScaledVector(up, (sy * h) / 2);
  addQuad(
    b,
    [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    CARD_ST,
    cell,
    normalFn,
    shadeFn,
    CARD_FLUTTER,
  );
}

// A tapered tube along `path` ([{ p, r }]), with bark UVs that repeat along
// its length and optional lobed root flare near the ground.
function addTube(b, path, radial, { vScale = 3, shade, flare } = {}) {
  const tangent = new V3();
  const u = new V3();
  const w = new V3();
  const n = new V3();
  const p = new V3();
  const first = b.count;
  let length = 0;
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)].p;
    const next = path[Math.min(path.length - 1, i + 1)].p;
    tangent.subVectors(next, prev).normalize();
    if (i > 0) length += path[i].p.distanceTo(path[i - 1].p);
    u.set(1, 0, 0);
    if (Math.abs(tangent.x) > 0.9) u.set(0, 0, 1);
    u.cross(tangent).normalize();
    w.crossVectors(tangent, u);
    const centre = path[i].p;
    const tone = shade ? shade(centre) : 1;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      let r = path[i].r;
      if (flare && centre.y < flare.height) {
        const f = 1 - Math.max(0, centre.y) / flare.height;
        r *=
          1 +
          flare.amount *
            f *
            f *
            (1 + 0.4 * Math.sin(a * flare.lobes + flare.phase));
      }
      p.copy(centre).addScaledVector(n, r);
      pushVertex(b, p, n, j / radial, length / vScale, tone, 0);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = first + i * (radial + 1) + j;
      const c = a + radial + 1;
      b.index.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
}

// Shading for a rounded crown: dark in its heart and underneath, bright at
// the tips. Stands in for the self-shadowing the scene cannot afford.
function crownShade(centre, radii, floor) {
  return (p) => {
    const dx = (p.x - centre.x) / radii.x;
    const dy = (p.y - centre.y) / radii.y;
    const dz = (p.z - centre.z) / radii.z;
    const rel = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const upness = clamp01(0.5 + 0.5 * dy);
    return (
      (floor + (1 - floor) * smoothstep(0.3, 1, rel)) * (0.72 + 0.28 * upness)
    );
  };
}

// Evenly spread points over a lumpy ellipsoid shell (golden-angle spiral).
function shellPoint(i, n, crown, rnd, yMin) {
  const y = lerp(yMin, 0.97, (i + 0.5) / n);
  const az = i * 2.39996 + rnd(-0.3, 0.3);
  const h = Math.sqrt(1 - y * y);
  const lobe = 0.88 + 0.12 * Math.sin(az * 3 + crown.phase) * h;
  const k = lobe * rnd(0.74, 0.96) * (y < 0 ? 0.85 : 1);
  return new V3(
    crown.centre.x + h * Math.cos(az) * crown.radii.x * k,
    crown.centre.y + y * crown.radii.y * k,
    crown.centre.z + h * Math.sin(az) * crown.radii.z * k,
  );
}

// One leaf mass: crossed cards around `point`, their normals bent outward
// from the crown centre so the whole crown shades as a soft volume.
function addCluster(b, point, crown, size, cell, cards, hanging, alt, rnd) {
  const out = new V3().subVectors(point, crown.centre).divide(crown.radii);
  if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
  out.normalize();
  const t1 = new V3().crossVectors(UP, out);
  if (t1.lengthSq() < 1e-3) t1.set(1, 0, 0);
  t1.normalize();
  const t2 = new V3().crossVectors(out, t1);
  const flatOut = new V3(out.x, 0, out.z);
  if (flatOut.lengthSq() < 1e-3) flatOut.set(1, 0, 0);
  flatOut.normalize();
  const normalFn = (p) =>
    new V3()
      .subVectors(p, crown.centre)
      .normalize()
      .multiplyScalar(0.75)
      .addScaledVector(out, 0.4)
      .normalize();
  for (let i = 0; i < cards; i++) {
    const kind = i === 0 ? 0 : cards === 2 ? 1 + (alt % 2) : i;
    const right = new V3();
    const up = new V3();
    const centre = point.clone();
    if (kind === 0) {
      const roll = hanging ? rnd(-0.2, 0.2) : rnd(-0.7, 0.7);
      right
        .copy(t1)
        .multiplyScalar(Math.cos(roll))
        .addScaledVector(t2, Math.sin(roll));
      up.copy(t2)
        .multiplyScalar(Math.cos(roll))
        .addScaledVector(t1, -Math.sin(roll));
    } else if (kind === 1) {
      right.copy(out).addScaledVector(t1, rnd(-0.4, 0.4)).normalize();
      if (hanging) up.copy(UP);
      else up.copy(t2).addScaledVector(t1, rnd(-0.3, 0.3)).normalize();
      centre.addScaledVector(out, -size * 0.15);
    } else if (hanging) {
      right.copy(flatOut);
      up.copy(UP);
    } else {
      right.copy(t1);
      up.copy(out).addScaledVector(t2, rnd(-0.3, 0.3)).normalize();
    }
    const mottle = rnd(0.86, 1.08);
    const shadeFn = (p) => crown.shade(p) * mottle;
    addCard(
      b,
      centre,
      right,
      up,
      size * rnd(0.9, 1.1),
      size * rnd(0.9, 1.1),
      cell,
      normalFn,
      shadeFn,
    );
  }
}

// ----------------------------------------------------------------- species
// Each builder returns { foliage, wood, height, radius, trunk } for one shape.
// detail: 2 = front row (with its own trunk and limbs), 1 = mid, 0 = far.

function buildFir(random, detail, variant) {
  const rnd = (a, b) => a + (b - a) * random();
  const H = variant === 0 ? 21 : 23;
  const crownBase = (variant === 0 ? 0.2 : 0.3) * H;
  const maxRadius = (variant === 0 ? 0.21 : 0.24) * H;
  const layers = [7, 12, 22][detail];
  const leaves = createBuilder(H);
  const wood = detail === 2 ? createBuilder(H) : null;
  const crownT = (y) => clamp01((y - crownBase) / (H - crownBase));
  const radiusAt = (y) => maxRadius * Math.pow(1 - crownT(y), 0.8) + 0.6;
  const normalFn = (p) => {
    const r = Math.hypot(p.x, p.z);
    return new V3(p.x, r * 0.45 + 0.25, p.z).normalize();
  };
  const shadeFn = (p) => {
    const r = Math.hypot(p.x, p.z);
    const rel = r / radiusAt(p.y + r * 0.35);
    return (
      (0.36 + 0.64 * smoothstep(0.1, 0.85, rel)) * (0.8 + 0.2 * crownT(p.y))
    );
  };

  for (let k = 0; k < layers; k++) {
    const t = k / (layers - 1);
    const y = crownBase + (H - crownBase - 1.4) * Math.pow(t, 0.92);
    const radius =
      (maxRadius * Math.pow(1 - t, 0.8) + 0.7) *
      (variant === 0 ? rnd(0.84, 1.1) : rnd(0.66, 1.18));
    const boughs =
      detail === 2 ? (t < 0.7 ? 7 : 5) : detail === 1 ? (t < 0.7 ? 5 : 4) : 4;
    const a0 = rnd(0, Math.PI * 2);
    const droop = lerp(0.5, 0.12, t) + rnd(-0.08, 0.08);
    for (let j = 0; j < boughs; j++) {
      const a = a0 + ((j + rnd(-0.25, 0.25)) * Math.PI * 2) / boughs;
      const dir = new V3(Math.cos(a), 0, Math.sin(a));
      const side = new V3(-Math.sin(a), 0, Math.cos(a));
      const len = radius * rnd(0.85, 1.1);
      const p0 = new V3(0, y, 0).addScaledVector(dir, 0.15);
      const p2 = p0
        .clone()
        .addScaledVector(dir, len * Math.cos(droop))
        .addScaledVector(UP, -len * Math.sin(droop));
      const p1 = p0.clone().lerp(p2, 0.5).addScaledVector(UP, len * 0.08);
      const half = len * 0.48;
      const span =
        detail === 2
          ? [
              [p0, p1, 0, 0.5],
              [p1, p2, 0.5, 1],
            ]
          : [[p0, p2, 0, 1]];
      for (const [pa, pb, sa, sb] of span) {
        addQuad(
          leaves,
          [
            pa.clone().addScaledVector(side, -half),
            pb.clone().addScaledVector(side, -half),
            pb.clone().addScaledVector(side, half),
            pa.clone().addScaledVector(side, half),
          ],
          [
            [sa, 1],
            [sb, 1],
            [sb, 0],
            [sa, 0],
          ],
          CELL.bough,
          normalFn,
          shadeFn,
          [sa, sb, sb, sa],
        );
      }
      // A hanging fin along the same bough, so it still reads side-on.
      const drop = len * 0.42;
      addQuad(
        leaves,
        [
          p0.clone().addScaledVector(UP, -drop * 0.75),
          p2.clone().addScaledVector(UP, -drop * 0.75),
          p2.clone().addScaledVector(UP, drop * 0.25),
          p0.clone().addScaledVector(UP, drop * 0.25),
        ],
        CARD_ST,
        CELL.bough,
        normalFn,
        shadeFn,
        [0, 1, 1, 0],
      );
    }
  }
  for (const a of [0.4, 0.4 + Math.PI / 2]) {
    const dir = new V3(Math.cos(a), 0, Math.sin(a));
    const base = new V3(0, H - 3.4, 0);
    const top = new V3(0, H + 0.2, 0);
    addQuad(
      leaves,
      [
        base.clone().addScaledVector(dir, -1.15),
        top.clone().addScaledVector(dir, -1.15),
        top.clone().addScaledVector(dir, 1.15),
        base.clone().addScaledVector(dir, 1.15),
      ],
      CARD_ST,
      CELL.bough,
      normalFn,
      shadeFn,
      [0.3, 1, 1, 0.3],
    );
  }

  const trunkRadius = variant === 0 ? 0.34 : 0.4;
  if (wood) {
    const lean = rnd(-0.25, 0.25);
    const centreAt = (y) =>
      new V3(lean * Math.sin((y / H) * 2.2), y, lean * 0.6 * (y / H));
    const shade = (p) =>
      p.y < 1.2 ? 0.7 + 0.25 * clamp01(p.y / 1.2) : p.y > crownBase ? 0.55 : 0.95;
    const path = [-0.4, 0.5, 1.6, 4, 0.4 * H, 0.68 * H, 0.96 * H].map((y) => ({
      p: centreAt(y),
      r: trunkRadius * (1 - 0.9 * clamp01(y / H)),
    }));
    addTube(wood, path, 8, {
      shade,
      flare: { height: 1.3, amount: 0.55, lobes: 5, phase: rnd(0, 6) },
    });
    if (variant === 1) {
      // Dead stubs on the clear stem below the crown.
      for (let i = 0; i < 6; i++) {
        const y = crownBase * rnd(0.4, 1);
        const a = rnd(0, Math.PI * 2);
        const start = centreAt(y);
        const end = start
          .clone()
          .add(
            new V3(Math.cos(a), rnd(-0.15, 0.25), Math.sin(a)).multiplyScalar(
              rnd(0.9, 2.2),
            ),
          );
        addTube(
          wood,
          [
            { p: start, r: 0.07 },
            { p: end, r: 0.02 },
          ],
          4,
          { shade },
        );
      }
    }
  }
  return {
    foliage: toGeometry(leaves),
    wood: wood && toGeometry(wood),
    height: H,
    radius: maxRadius + 0.6,
    trunk: { radius: trunkRadius, height: H * 0.8 },
  };
}

function buildOak(random, detail, variant) {
  const rnd = (a, b) => a + (b - a) * random();
  const H = variant === 0 ? 15 : 17;
  const spread = variant === 0 ? 1 : 0.78;
  const trunkHeight = H * (variant === 0 ? 0.26 : 0.32);
  const trunkRadius = variant === 0 ? 0.5 : 0.42;
  const leaves = createBuilder(H);
  const wood = detail === 2 ? createBuilder(H) : null;
  const limbShade = (p) =>
    p.y < 1.2
      ? 0.68 + 0.27 * clamp01(p.y / 1.2)
      : p.y > trunkHeight + 1.5
        ? 0.58
        : 0.92;
  const tips = [];

  const grow = (start, dir, len, radius, depth) => {
    const wobble = new V3(rnd(-1, 1), rnd(-0.4, 0.6), rnd(-1, 1)).multiplyScalar(
      len * 0.09,
    );
    const mid = start.clone().addScaledVector(dir, len * 0.5).add(wobble);
    const end = start.clone().addScaledVector(dir, len);
    if (wood) {
      addTube(
        wood,
        [
          { p: start, r: radius },
          { p: mid, r: radius * 0.82 },
          { p: end, r: radius * 0.6 },
        ],
        depth <= 1 ? 6 : depth === 2 ? 5 : 4,
        { shade: limbShade },
      );
    }
    if (depth >= 2) tips.push(end);
    if (depth >= 3) return;
    const e1 = new V3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new V3(1, 0, 0) : UP);
    e1.normalize();
    const e2 = new V3().crossVectors(dir, e1);
    const children = random() < 0.35 ? 3 : 2;
    const phi0 = rnd(0, Math.PI * 2);
    for (let i = 0; i < children; i++) {
      const phi = phi0 + ((i + rnd(-0.2, 0.2)) * Math.PI * 2) / children;
      const tilt = rnd(0.45, 0.8);
      const next = dir
        .clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(e1, Math.cos(phi) * Math.sin(tilt))
        .addScaledVector(e2, Math.sin(phi) * Math.sin(tilt));
      next.y = Math.max(-0.1, next.y + 0.18);
      next.normalize();
      grow(end, next, len * 0.72 * rnd(0.85, 1.1), radius * 0.6, depth + 1);
    }
  };

  const top = new V3(rnd(-0.3, 0.3), trunkHeight, rnd(-0.3, 0.3));
  if (wood) {
    const path = [-0.4, 0.5, 1.5, trunkHeight * 0.6, trunkHeight].map((y) => ({
      p: new V3((top.x * y) / trunkHeight, y, (top.z * y) / trunkHeight),
      r: trunkRadius * (1 - 0.25 * clamp01(y / trunkHeight)),
    }));
    addTube(wood, path, 9, {
      shade: limbShade,
      flare: { height: 1.5, amount: 0.7, lobes: 6, phase: rnd(0, 6) },
    });
  }
  const mains = variant === 0 ? 5 : 4;
  const a0 = rnd(0, Math.PI * 2);
  for (let i = 0; i < mains; i++) {
    const a = a0 + ((i + rnd(-0.25, 0.25)) * Math.PI * 2) / mains;
    const tilt = rnd(0.55, 0.95) * spread;
    const dir = new V3(
      Math.cos(a) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt),
    );
    grow(top, dir, H * 0.3 * rnd(0.85, 1.1), trunkRadius * 0.52, 1);
  }
  grow(
    top,
    new V3(rnd(-0.15, 0.15), 1, rnd(-0.15, 0.15)).normalize(),
    H * 0.3,
    trunkRadius * 0.55,
    1,
  );

  const centre = new V3();
  for (const tip of tips) centre.add(tip);
  centre.multiplyScalar(1 / tips.length);
  const radii = new V3(1, 1, 1);
  for (const tip of tips) {
    radii.x = Math.max(radii.x, Math.abs(tip.x - centre.x) + 1.2);
    radii.y = Math.max(radii.y, Math.abs(tip.y - centre.y) + 1.2);
    radii.z = Math.max(radii.z, Math.abs(tip.z - centre.z) + 1.2);
  }
  const crown = {
    centre,
    radii,
    phase: rnd(0, 6),
    shade: crownShade(centre, radii, 0.4),
  };
  const [shell, cards, sizeMin, sizeMax] = [
    [16, 2, 6.2, 7.8],
    [24, 2, 4.6, 6],
    [64, 3, 3.3, 4.6],
  ][detail];
  const points = [];
  if (detail > 0) {
    tips.forEach((tip, i) => {
      if (detail === 2 || i % 2 === 0) points.push(tip);
    });
  }
  for (let i = 0; i < shell; i++) {
    points.push(shellPoint(i, shell, crown, rnd, -0.45));
  }
  if (detail === 2) {
    for (let i = 0; i < 10; i++) {
      points.push(
        new V3(
          centre.x + rnd(-0.4, 0.4) * radii.x,
          centre.y + rnd(-0.2, 0.5) * radii.y,
          centre.z + rnd(-0.4, 0.4) * radii.z,
        ),
      );
    }
  }
  points.forEach((point, i) => {
    addCluster(
      leaves,
      point,
      crown,
      rnd(sizeMin, sizeMax),
      CELL.broadleaf,
      cards,
      false,
      i,
      rnd,
    );
  });
  return {
    foliage: toGeometry(leaves),
    wood: wood && toGeometry(wood),
    height: centre.y + radii.y,
    radius: Math.max(radii.x, radii.z),
    trunk: { radius: trunkRadius, height: trunkHeight + 2.5 },
  };
}

function buildBirch(random, detail, variant) {
  const rnd = (a, b) => a + (b - a) * random();
  const H = variant === 0 ? 14 : 18;
  const width = (variant === 0 ? 0.2 : 0.13) * H;
  const trunkRadius = variant === 0 ? 0.19 : 0.23;
  const leaves = createBuilder(H);
  const wood = detail === 2 ? createBuilder(H) : null;
  const sway = rnd(0.25, 0.6);
  const phase = rnd(0, 6);
  const stemAt = (y) =>
    new V3(
      sway * Math.sin((y / H) * 3.6 + phase) - sway * Math.sin(phase),
      y,
      sway * 0.5 * Math.sin((y / H) * 2.4),
    );
  const shade = (p) => (p.y < 1 ? 0.72 + 0.26 * clamp01(p.y) : 0.98);
  if (wood) {
    const path = [-0.3, 0.6, 2, 0.25 * H, 0.45 * H, 0.65 * H, 0.8 * H, 0.93 * H].map(
      (y) => ({ p: stemAt(y), r: trunkRadius * (1 - 0.88 * clamp01(y / H)) }),
    );
    addTube(wood, path, 7, {
      vScale: 2.2,
      shade,
      flare: { height: 0.9, amount: 0.35, lobes: 4, phase },
    });
  }
  const centre = stemAt(0.62 * H);
  const radii = new V3(width, 0.37 * H, width);
  const crown = {
    centre,
    radii,
    phase,
    shade: crownShade(centre, radii, 0.46),
  };
  const points = [];
  const branches = 14;
  for (let i = 0; i < branches; i++) {
    const y = H * lerp(0.32, 0.9, (i + rnd(0, 1)) / branches);
    const a = i * 2.39996 + rnd(-0.4, 0.4);
    const tilt = rnd(0.5, 0.95);
    const dir = new V3(
      Math.cos(a) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt),
    );
    const len = width * rnd(0.75, 1.15) * (1 - 0.4 * (y / H));
    const start = stemAt(y);
    const end = start.clone().addScaledVector(dir, len);
    if (wood) {
      const mid = start.clone().lerp(end, 0.5).addScaledVector(UP, -len * 0.06);
      addTube(
        wood,
        [
          { p: start, r: 0.055 },
          { p: mid, r: 0.035 },
          { p: end, r: 0.012 },
        ],
        3,
        { vScale: 2.2, shade },
      );
    }
    if (detail === 2 || (detail === 1 && i % 2 === 0)) points.push(end);
  }
  const [shell, cards, sizeMin, sizeMax] = [
    [11, 2, 4.6, 5.6],
    [20, 2, 3.4, 4.2],
    [44, 3, 2.3, 3.1],
  ][detail];
  for (let i = 0; i < shell; i++) {
    points.push(shellPoint(i, shell, crown, rnd, -0.8));
  }
  points.forEach((point, i) => {
    addCluster(
      leaves,
      point,
      crown,
      rnd(sizeMin, sizeMax),
      CELL.birch,
      cards,
      true,
      i,
      rnd,
    );
  });
  return {
    foliage: toGeometry(leaves),
    wood: wood && toGeometry(wood),
    height: H,
    radius: width,
    trunk: { radius: trunkRadius, height: H * 0.85 },
  };
}

function buildCypress(random, detail, variant) {
  const rnd = (a, b) => a + (b - a) * random();
  const H = variant === 0 ? 13 : 15;
  const maxRadius = (variant === 0 ? 0.13 : 0.2) * H;
  const y0 = (variant === 0 ? 0.05 : 0.1) * H;
  const power = variant === 0 ? 0.8 : 0.62;
  const leaves = createBuilder(H);
  const wood = detail === 2 ? createBuilder(H) : null;
  const profile = (t) =>
    maxRadius *
    Math.pow(
      Math.max(0, Math.sin(Math.PI * Math.pow(0.1 + 0.9 * clamp01(t), power))),
      0.7,
    );
  const crownT = (y) => clamp01((y - y0) / (H - y0));
  const normalFn = (p) => {
    const r = Math.hypot(p.x, p.z);
    return new V3(p.x, r * 0.3 + 0.1, p.z).normalize();
  };
  const shadeFn = (p) => {
    const t = crownT(p.y);
    const rel = Math.hypot(p.x, p.z) / (profile(t) + 0.3);
    return (0.42 + 0.58 * smoothstep(0.25, 0.95, rel)) * (0.8 + 0.2 * t);
  };
  const layers = [5, 9, 15][detail];
  const around = [4, 5, 7][detail];
  const layerHeight = (H - y0) / layers;
  for (let k = 0; k < layers; k++) {
    const t = (k + 0.5) / layers;
    const y = y0 + (H - y0) * t;
    const r = profile(t);
    const slope = (profile(t + 0.05) - profile(t - 0.05)) / (0.1 * (H - y0));
    const a0 = rnd(0, Math.PI * 2);
    for (let j = 0; j < around; j++) {
      const a = a0 + ((j + rnd(-0.2, 0.2)) * Math.PI * 2) / around;
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const side = new V3(-Math.sin(a), 0, Math.cos(a));
      const up = new V3(0, 1, 0)
        .addScaledVector(out, slope)
        .addScaledVector(side, rnd(-0.2, 0.2))
        .normalize();
      addCard(
        leaves,
        new V3(0, y, 0).addScaledVector(out, r * 0.72),
        side,
        up,
        Math.max(1.3, ((Math.PI * 2 * r) / around) * 1.5),
        layerHeight * rnd(2.3, 2.8),
        CELL.cypress,
        normalFn,
        shadeFn,
      );
    }
    const fins = detail === 2 ? k % 2 === 0 : detail === 1 && k % 3 === 0;
    if (fins) {
      for (let j = 0; j < 3; j++) {
        const a = a0 + 0.5 + (j * Math.PI * 2) / 3;
        const out = new V3(Math.cos(a), 0, Math.sin(a));
        addCard(
          leaves,
          new V3(0, y, 0).addScaledVector(out, r * 0.5),
          out,
          UP,
          Math.max(1, r * 1.25),
          layerHeight * 2.6,
          CELL.cypress,
          normalFn,
          shadeFn,
        );
      }
    }
  }
  if (detail === 0) {
    for (const a of [0.3, 0.3 + Math.PI / 2]) {
      addCard(
        leaves,
        new V3(0, y0 + (H - y0) / 2, 0),
        new V3(Math.cos(a), 0, Math.sin(a)),
        UP,
        maxRadius * 2.3,
        (H - y0) * 1.04,
        CELL.cypress,
        normalFn,
        shadeFn,
      );
    }
  }
  const trunkRadius = 0.26;
  if (wood) {
    const path = [-0.3, 0.5, 1.5, 0.45 * H].map((y) => ({
      p: new V3(0, y, 0),
      r: trunkRadius * (1 - 0.6 * clamp01(y / (0.45 * H))),
    }));
    addTube(wood, path, 6, {
      shade: (p) => (p.y < 1 ? 0.65 + 0.3 * clamp01(p.y) : 0.6),
      flare: { height: 1, amount: 0.45, lobes: 5, phase: rnd(0, 6) },
    });
  }
  return {
    foliage: toGeometry(leaves),
    wood: wood && toGeometry(wood),
    height: H,
    radius: maxRadius,
    trunk: { radius: trunkRadius, height: H * 0.4 },
  };
}

function buildShrub(random, variant) {
  const rnd = (a, b) => a + (b - a) * random();
  const H = variant === 0 ? 2.2 : 3.2;
  const leaves = createBuilder(H);
  const centre = new V3(0, variant === 0 ? 0.8 : 1.3, 0);
  const radii = variant === 0 ? new V3(1.5, 1.25, 1.5) : new V3(1.1, 1.9, 1.1);
  const crown = {
    centre,
    radii,
    phase: rnd(0, 6),
    shade: crownShade(centre, radii, 0.5),
  };
  const count = 10;
  for (let i = 0; i < count; i++) {
    addCluster(
      leaves,
      shellPoint(i, count, crown, rnd, -0.1),
      crown,
      rnd(1.7, 2.3),
      variant === 0 ? CELL.broadleaf : CELL.birch,
      2,
      variant === 1,
      i,
      rnd,
    );
  }
  return { foliage: toGeometry(leaves), height: H, radius: radii.x };
}

// One generic stem for every mid and far tree: unit radius and height,
// scaled per instance.
function buildUnitTrunk() {
  const b = createBuilder(1);
  addTube(
    b,
    [
      { p: new V3(0, -0.03, 0), r: 1 },
      { p: new V3(0, 0.1, 0), r: 0.95 },
      { p: new V3(0, 1, 0), r: 0.45 },
    ],
    5,
    { vScale: 0.25, flare: { height: 0.1, amount: 0.6, lobes: 5, phase: 1 } },
  );
  const geometry = toGeometry(b);
  geometry.getAttribute("aWind").array.fill(0);
  return geometry;
}

// Three crossed blades-of-grass cards, one yard wide and tall.
function buildTuft(cards) {
  const b = createBuilder(1);
  const normalFn = () => UP;
  const shadeFn = (p) => 0.5 + 0.5 * p.y;
  for (let i = 0; i < cards; i++) {
    const a = (i * Math.PI) / cards;
    addCard(
      b,
      new V3(0, 0.5, 0),
      new V3(Math.cos(a), 0, Math.sin(a)),
      UP,
      1,
      1,
      FULL,
      normalFn,
      shadeFn,
    );
  }
  const geometry = toGeometry(b);
  const wind = geometry.getAttribute("aWind").array;
  const position = geometry.getAttribute("position").array;
  for (let i = 0; i < wind.length / 2; i++) {
    const top = position[i * 3 + 1] > 0.5 ? 1 : 0;
    wind[i * 2] = top * 2.5;
    wind[i * 2 + 1] = top;
  }
  return geometry;
}

const SPECIES = [
  {
    build: buildFir,
    nominalRadius: 4.8,
    bark: 0x8a6650,
    stem: 0x7c5c49,
    profile: (t) => (t < 0.18 ? 0.1 : Math.pow(1 - (t - 0.18) / 0.82, 0.8) + 0.08),
    colour: (c, r) =>
      c.setHSL(lerp(0.33, 0.41, r()), lerp(0.28, 0.4, r()), lerp(0.34, 0.43, r()), THREE.SRGBColorSpace),
  },
  {
    build: buildOak,
    nominalRadius: 9.5,
    bark: 0x7d6a58,
    stem: 0x6d5c4c,
    profile: (t) =>
      t < 0.26 ? 0.08 : Math.sqrt(Math.max(0.03, 1 - ((t - 0.64) / 0.38) ** 2)),
    colour: (c, r) =>
      r() < 0.05
        ? c.setHSL(lerp(0.08, 0.13, r()), 0.58, lerp(0.44, 0.52, r()), THREE.SRGBColorSpace)
        : c.setHSL(lerp(0.22, 0.3, r()), lerp(0.38, 0.52, r()), lerp(0.42, 0.52, r()), THREE.SRGBColorSpace),
  },
  {
    build: buildBirch,
    nominalRadius: 2.8,
    bark: 0xffffff,
    stem: 0xe2ded4,
    profile: (t) =>
      t < 0.25 ? 0.08 : Math.sqrt(Math.max(0.03, 1 - ((t - 0.62) / 0.39) ** 2)),
    colour: (c, r) =>
      r() < 0.1
        ? c.setHSL(lerp(0.13, 0.16, r()), 0.62, lerp(0.5, 0.56, r()), THREE.SRGBColorSpace)
        : c.setHSL(lerp(0.19, 0.25, r()), lerp(0.42, 0.55, r()), lerp(0.48, 0.57, r()), THREE.SRGBColorSpace),
  },
  {
    build: buildCypress,
    nominalRadius: 2.6,
    bark: 0x80604e,
    stem: 0x6e5546,
    profile: (t) =>
      Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(0.1 + 0.9 * t, 0.75))), 0.7),
    colour: (c, r) =>
      c.setHSL(lerp(0.29, 0.36, r()), lerp(0.3, 0.42, r()), lerp(0.33, 0.41, r()), THREE.SRGBColorSpace),
  },
];

// ---------------------------------------------------------------- textures

function tone(l, r, g, b) {
  const v = clamp01(l) * 255;
  return `rgb(${Math.round(v * r)},${Math.round(v * g)},${Math.round(v * b)})`;
}

function drawLeaf(ctx, x, y, length, width, angle, style) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-length / 2, 0);
  ctx.quadraticCurveTo(0, -width, length / 2, 0);
  ctx.quadraticCurveTo(0, width, -length / 2, 0);
  ctx.fillStyle = style;
  ctx.fill();
  ctx.restore();
}

function inCell(ctx, ox, oy, size, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, size, size);
  ctx.clip();
  ctx.translate(ox, oy);
  draw();
  ctx.restore();
}

// A rounded clump of broad leaves, darker ones laid down first for depth.
function drawBroadleaf(ctx, S, random) {
  const phase = random() * 6;
  for (let i = 0; i < 46; i++) {
    const a = random() * Math.PI * 2;
    const r = S * 0.3 * Math.sqrt(random());
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = tone(0.34 + random() * 0.08, 0.9, 1, 0.74);
    ctx.fill();
  }
  const count = 520;
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const reach = 0.82 + 0.18 * Math.sin(a * 3 + phase);
    const r = S * 0.44 * reach * Math.pow(random(), 0.55);
    const light = 0.42 + 0.58 * (i / count) + (random() - 0.5) * 0.2;
    const warm = random();
    drawLeaf(
      ctx,
      S / 2 + Math.cos(a) * r,
      S / 2 + Math.sin(a) * r,
      S * (0.06 + random() * 0.045),
      S * (0.02 + random() * 0.014),
      random() * Math.PI * 2,
      tone(light, 0.86 + 0.14 * warm, 1, 0.78 - 0.1 * warm),
    );
  }
}

// A conifer bough seen flat: stem along the middle from the left edge, side
// twigs raked forward, every twig bristling with needles.
function drawBough(ctx, S, random) {
  const twig = (x0, y0, x1, y1, width) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    ctx.lineCap = "round";
    ctx.strokeStyle = tone(0.36 + random() * 0.06, 0.88, 1, 0.9);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const steps = Math.max(3, Math.round(length / (S * 0.011)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(x0, x1, t);
      const y = lerp(y0, y1, t);
      const needle = S * (0.03 + random() * 0.018) * (1 - 0.4 * t);
      for (const side of [-1, 1]) {
        const a = angle + side * (0.75 + random() * 0.5);
        ctx.strokeStyle = tone(0.55 + random() * 0.45, 0.86, 1, 0.92);
        ctx.lineWidth = S * 0.0055;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * needle, y + Math.sin(a) * needle);
        ctx.stroke();
      }
    }
  };
  const mid = S / 2;
  const sides = 11;
  for (let i = 0; i < sides; i++) {
    const t = lerp(0.04, 0.9, i / (sides - 1));
    const x = S * lerp(0.02, 0.97, t);
    const reach = S * 0.4 * (1 - 0.82 * t) * Math.min(1, 0.55 + t * 4);
    for (const side of [-1, 1]) {
      const a = side * (0.7 + random() * 0.3);
      const len = reach * (0.85 + random() * 0.3);
      twig(x, mid, x + Math.cos(a) * len, mid + Math.sin(a) * len, S * 0.036);
      if (len > S * 0.16) {
        const bx = x + Math.cos(a) * len * 0.45;
        const by = mid + Math.sin(a) * len * 0.45;
        twig(bx, by, bx + len * 0.42, by + side * len * 0.1, S * 0.03);
      }
    }
  }
  twig(S * 0.02, mid, S * 0.97, mid, S * 0.045);
}

// Small hanging leaves on fine twigs: airier than the broadleaf clump.
function drawBirch(ctx, S, random) {
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const x = S * (0.14 + random() * 0.72);
    ctx.strokeStyle = tone(0.3, 0.9, 0.85, 0.7);
    ctx.lineWidth = S * 0.006;
    ctx.beginPath();
    ctx.moveTo(x, S * (0.1 + random() * 0.2));
    ctx.quadraticCurveTo(
      x + S * (random() - 0.5) * 0.2,
      S * 0.5,
      x + S * (random() - 0.5) * 0.25,
      S * (0.7 + random() * 0.2),
    );
    ctx.stroke();
  }
  const count = 420;
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const r = S * 0.44 * Math.pow(random(), 0.6);
    const light = 0.5 + 0.5 * (i / count) + (random() - 0.5) * 0.2;
    drawLeaf(
      ctx,
      S / 2 + Math.cos(a) * r * 0.92,
      S / 2 + Math.sin(a) * r,
      S * (0.038 + random() * 0.022),
      S * (0.02 + random() * 0.01),
      Math.PI / 2 + (random() - 0.5) * 1.3,
      tone(light, 0.92, 1, 0.7),
    );
  }
}

// Dense upswept sprays in a flame-shaped mass.
function drawCypress(ctx, S, random) {
  ctx.beginPath();
  ctx.ellipse(S / 2, S * 0.53, S * 0.27, S * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone(0.36, 0.86, 1, 0.84);
  ctx.fill();
  const count = 520;
  for (let i = 0; i < count; i++) {
    const v = random();
    const y = S * lerp(0.95, 0.06, v);
    const halfWidth = S * 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(1 - v * 0.96, 0.7)), 0.75);
    const x = S / 2 + (random() * 2 - 1) * halfWidth;
    const light = 0.44 + 0.56 * (i / count) + (random() - 0.5) * 0.2;
    drawLeaf(
      ctx,
      x,
      y,
      S * (0.075 + random() * 0.05),
      S * (0.014 + random() * 0.01),
      -Math.PI / 2 + ((x - S / 2) / S) * 1.6 + (random() - 0.5) * 0.5,
      tone(light, 0.86, 1, 0.88),
    );
  }
}

function drawGrass(ctx, S, random) {
  const blades = 90;
  for (let i = 0; i < blades; i++) {
    const x = S * (0.14 + random() * 0.72);
    const height = S * (0.4 + random() * 0.58) * (1 - 1.6 * Math.abs(x / S - 0.5) ** 2);
    const lean = S * (random() - 0.5) * 0.5 + (x - S / 2) * 0.5;
    const width = S * (0.012 + random() * 0.014);
    const light = 0.55 + 0.45 * (i / blades) + (random() - 0.5) * 0.15;
    ctx.beginPath();
    ctx.moveTo(x - width, S);
    ctx.quadraticCurveTo(x - width + lean * 0.3, S - height * 0.6, x + lean, S - height);
    ctx.quadraticCurveTo(x + width + lean * 0.3, S - height * 0.6, x + width, S);
    ctx.closePath();
    ctx.fillStyle = tone(light, 0.92, 1, 0.74);
    ctx.fill();
  }
}

function drawFlowers(ctx, S, random) {
  for (let i = 0; i < 9; i++) {
    const x = S * (0.15 + random() * 0.7);
    const y = S * (0.12 + random() * 0.55);
    const r = S * (0.035 + random() * 0.03);
    ctx.fillStyle = tone(0.85 + random() * 0.15, 1, 1, 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgb(250,225,150)";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Canvas pixels with no coverage come back black, which would bleed a dark
// fringe into every leaf edge once filtered. Give them the foliage colour
// instead and upload the raw pixels.
function alphaTexture(size, fill, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    data[i] = a === 0 ? fill[0] : pixels[i];
    data[i + 1] = a === 0 ? fill[1] : pixels[i + 1];
    data[i + 2] = a === 0 ? fill[2] : pixels[i + 2];
    data[i + 3] = a;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function foliageAtlas(random) {
  const S = 512;
  return alphaTexture(S * 2, [150, 175, 125], (ctx) => {
    inCell(ctx, 0, 0, S, () => drawBroadleaf(ctx, S, random));
    inCell(ctx, S, 0, S, () => drawBough(ctx, S, random));
    inCell(ctx, 0, S, S, () => drawBirch(ctx, S, random));
    inCell(ctx, S, S, S, () => drawCypress(ctx, S, random));
  });
}

// Bark that tiles both ways. `birch` is white with dark lenticels; otherwise
// a pale furrowed bark that materials and instances tint.
function barkTexture(random, birch) {
  const W = 256;
  const H = 512;
  const texture = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = birch ? "rgb(234,230,221)" : "rgb(196,190,184)";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    const wrapped = (x, y, draw) => {
      for (const ox of [-W, 0, W]) {
        for (const oy of [-H, 0, H]) draw(x + ox, y + oy);
      }
    };
    if (birch) {
      for (let i = 0; i < 26; i++) {
        const shade = 205 + Math.round(random() * 30);
        const w = 20 + random() * 60;
        const h = 30 + random() * 90;
        ctx.fillStyle = `rgba(${shade},${shade - 4},${shade - 12},0.5)`;
        wrapped(random() * W, random() * H, (x, y) => ctx.fillRect(x, y, w, h));
      }
      for (let i = 0; i < 110; i++) {
        const length = 5 + random() * 36;
        ctx.strokeStyle = `rgba(42,38,34,${0.5 + random() * 0.5})`;
        ctx.lineWidth = 1 + random() * 2.5;
        wrapped(random() * W, random() * H, (x, y) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + length, y + (random() - 0.5) * 2);
          ctx.stroke();
        });
      }
      for (let i = 0; i < 7; i++) {
        const w = 10 + random() * 16;
        ctx.fillStyle = "rgb(38,34,30)";
        wrapped(random() * W, random() * H, (x, y) => {
          ctx.beginPath();
          ctx.moveTo(x - w, y);
          ctx.quadraticCurveTo(x, y - w * 0.9, x + w, y);
          ctx.quadraticCurveTo(x, y + w * 0.5, x - w, y);
          ctx.fill();
        });
      }
    } else {
      for (let i = 0; i < 420; i++) {
        const dark = i < 260;
        const length = 30 + random() * 130;
        const drift = (random() - 0.5) * 14;
        const shade = dark ? 70 + random() * 40 : 215 + random() * 35;
        ctx.strokeStyle = `rgba(${shade},${shade * 0.97},${shade * 0.94},${dark ? 0.85 : 0.5})`;
        ctx.lineWidth = dark ? 2 + random() * 4 : 1 + random() * 2;
        wrapped(random() * W, random() * H, (x, y) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + drift, y + length / 2, x + drift * 0.3, y + length);
          ctx.stroke();
        });
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// --------------------------------------------------------------- materials

const WIND_PARS = /* glsl */ `
attribute vec2 aWind;
uniform float uTime;
uniform vec4 uWind;
`;

// Sway is worked out in world space (so every tree leans the same way
// whatever its own rotation), then carried back through the instance matrix.
const WIND_VERTEX = /* glsl */ `
{
	#ifdef USE_INSTANCING
		vec3 windOrigin = instanceMatrix[ 3 ].xyz;
	#else
		vec3 windOrigin = vec3( 0.0 );
	#endif
	float windPhase = windOrigin.x * 0.37 + windOrigin.z * 0.23;
	float gust = sin( uTime * 0.83 + windPhase ) * 0.6 + sin( uTime * 0.31 + windPhase * 0.7 ) * 0.4 + 0.35;
	vec3 windOffset = vec3( uWind.x, 0.0, uWind.y ) * ( gust * uWind.z * aWind.x );
	float flutter = uTime * 2.6 + windPhase;
	windOffset += vec3(
		sin( flutter + position.y * 1.9 + position.z * 2.3 ),
		sin( flutter * 1.3 + position.x * 2.1 ) * 0.5,
		cos( flutter * 0.9 + position.x * 1.7 + position.y * 1.3 )
	) * ( uWind.w * aWind.y );
	#ifdef USE_INSTANCING
		mat3 windBasis = mat3( instanceMatrix );
		transformed += ( windOffset * windBasis ) / vec3(
			dot( windBasis[ 0 ], windBasis[ 0 ] ),
			dot( windBasis[ 1 ], windBasis[ 1 ] ),
			dot( windBasis[ 2 ], windBasis[ 2 ] )
		);
	#else
		transformed += windOffset;
	#endif
}
`;

const FOLIAGE_PARS = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uSunGlow;
uniform float uAlphaBoost;
`;

// Mip levels average the leaf texture's alpha down, which would thin crowns
// out with distance; lift it back before the alpha test.
const FOLIAGE_ALPHA = /* glsl */ `
diffuseColor.a *= 1.0 + uAlphaBoost * smoothstep( 25.0, 300.0, length( vViewPosition ) );
`;

// Sunlight carried through the leaves: a little on any leaf facing away from
// the sun, a lot when looking through the crown toward it.
const FOLIAGE_GLOW = /* glsl */ `
{
	vec3 sunView = normalize( ( viewMatrix * vec4( uSunDirection, 0.0 ) ).xyz );
	float through = saturate( dot( - normal, sunView ) );
	float toward = pow( saturate( dot( normalize( vViewPosition ), - sunView ) ), 3.0 );
	reflectedLight.directDiffuse += uSunGlow * diffuseColor.rgb * vec3( 1.12, 1.06, 0.62 ) * ( 0.3 * through + 0.9 * toward );
}
`;

function createMaterials(random) {
  const uniforms = {
    uTime: { value: 0 },
    uWind: {
      value: new THREE.Vector4(
        WIND_DIRECTION[0],
        WIND_DIRECTION[1],
        WIND_BEND,
        WIND_FLUTTER,
      ),
    },
    uSunDirection: { value: SUN_DIRECTION.clone() },
    uSunGlow: {
      value: new THREE.Color(SUN_COLOR).multiplyScalar(TRANSLUCENCY),
    },
    uAlphaBoost: { value: ALPHA_DISTANCE_BOOST },
  };
  const windOnly = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIND_VERTEX}`);
  };
  const foliage = (map, alphaTest) => {
    const material = new THREE.MeshLambertMaterial({
      map,
      alphaTest,
      alphaToCoverage: ALPHA_TO_COVERAGE,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    material.onBeforeCompile = (shader) => {
      windOnly(shader);
      shader.uniforms.uSunDirection = uniforms.uSunDirection;
      shader.uniforms.uSunGlow = uniforms.uSunGlow;
      shader.uniforms.uAlphaBoost = uniforms.uAlphaBoost;
      // Leaf cards carry normals bent outward from the crown, so the back of
      // a card must not flip them the way a true two-sided surface would.
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FOLIAGE_PARS}`)
        .replace(
          "#include <alphatest_fragment>",
          `${FOLIAGE_ALPHA}\n#include <alphatest_fragment>`,
        )
        .replace(
          "#include <normal_fragment_begin>",
          "#include <normal_fragment_begin>\nnormal = normalize( vNormal );",
        )
        .replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>\n${FOLIAGE_GLOW}`,
        );
    };
    material.customProgramCacheKey = () => "range-foliage";
    return material;
  };
  const wood = (map, color) => {
    const material = new THREE.MeshLambertMaterial({
      map,
      color,
      vertexColors: true,
    });
    material.onBeforeCompile = windOnly;
    material.customProgramCacheKey = () => "range-wood";
    return material;
  };

  const bark = barkTexture(random, false);
  const birchBark = barkTexture(random, true);
  return {
    uniforms,
    leaves: foliage(foliageAtlas(random), ALPHA_TEST),
    grass: foliage(
      alphaTexture(256, [150, 175, 115], (ctx) => drawGrass(ctx, 256, random)),
      0.36,
    ),
    flowers: foliage(
      alphaTexture(128, [235, 235, 235], (ctx) => drawFlowers(ctx, 128, random)),
      0.4,
    ),
    wood: SPECIES.map((species, i) =>
      wood(i === 2 ? birchBark : bark, species.bark),
    ),
    stems: wood(bark, 0xffffff),
  };
}

// ------------------------------------------------------------------ layout

// How far (x, z) lies outside the open rectangle of the range; negative inside.
function depthBehindLine(x, z) {
  const dx = Math.abs(x) - TREE_LINE;
  const dz = z - END_LINE;
  if (dx < 0 && dz < 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

function plantTrees(random) {
  const rnd = (a, b) => a + (b - a) * random();
  const trees = [];
  const zones = [
    { from: 0, to: FRONT_DEPTH, spacing: FRONT_SPACING },
    { from: FRONT_DEPTH, to: WOOD_DEPTH, spacing: WOOD_SPACING },
    { from: WOOD_DEPTH, to: SLOPE_DEPTH, spacing: SLOPE_SPACING },
  ];
  for (const zone of zones) {
    const xMax = TREE_LINE + zone.to;
    for (let gz = TREE_Z_MIN; gz < END_LINE + zone.to; gz += zone.spacing) {
      for (let gx = -xMax; gx < xMax; gx += zone.spacing) {
        let x = gx + rnd(0.1, 0.9) * zone.spacing;
        let z = gz + rnd(0.1, 0.9) * zone.spacing;
        const roll = random();
        let depth = depthBehindLine(x, z);
        if (depth < zone.from || depth >= zone.to) continue;
        const bay =
          EDGE_WOBBLE * smoothstep(0.45, 0.7, fbm(x / 70 + 3, z / 70 + 9));
        if (depth < bay) continue;
        const clump = smoothstep(0.3, 0.62, fbm(x / 50 + 11, z / 50 + 5));
        let chance;
        if (depth < 14) chance = 0.93;
        else if (depth < FRONT_DEPTH) chance = 0.62 + 0.36 * clump;
        else if (depth < WOOD_DEPTH) chance = 0.5 + 0.45 * clump;
        else {
          chance =
            0.5 * clump * (1 - (depth - WOOD_DEPTH) / (SLOPE_DEPTH - WOOD_DEPTH));
        }
        if (roll > chance) continue;

        const mix = fbm(x / 120 + 31.7, z / 120 + 4.2);
        const weights =
          depth >= WOOD_DEPTH
            ? [0.6, 0.3, 0.1, 0]
            : mix < 0.47
              ? [0.64, 0.16, 0.1, 0.1]
              : mix > 0.55
                ? [0.12, 0.58, 0.2, 0.1]
                : [0.36, 0.36, 0.18, 0.1];
        if (depth < 14) weights[2] += 0.14;
        let pick = random() * weights.reduce((sum, w) => sum + w, 0);
        let species = 0;
        while (species < 3 && pick > weights[species]) {
          pick -= weights[species];
          species++;
        }

        let scale = rnd(0.74, 1.18);
        const fate = random();
        if (depth < 40 && fate < SPECIMEN_CHANCE) {
          scale = rnd(1.22, 1.32);
          if (species > 1) species = random() < 0.6 ? 0 : 1;
        } else if (depth < 20 && fate > 0.9) {
          scale = rnd(0.5, 0.68);
        }

        // Keep crowns, not just trunks, out of the camera's corridor.
        const reach = SPECIES[species].nominalRadius * scale;
        if (z < END_LINE) {
          const minX = CLEAR_HALF_WIDTH + 1.5 + reach * 0.9;
          if (Math.abs(x) < minX) x = Math.sign(x || 1) * minX;
        } else if (Math.abs(x) < TREE_LINE) {
          z = Math.max(z, END_LINE + reach * 0.5);
        }
        depth = depthBehindLine(x, z);

        trees.push({
          x,
          z,
          depth,
          species,
          scale,
          stretch: rnd(0.92, 1.1),
          yaw: rnd(0, Math.PI * 2),
          lean: [rnd(-0.03, 0.03), rnd(-0.03, 0.03)],
          colour: SPECIES[species].colour(new THREE.Color(), random),
          variant: random() < 0.5 ? 0 : 1,
        });
      }
    }
  }
  trees.sort((a, b) => a.depth - b.depth);

  // Static level of detail: full models for the front trees nearest the tee.
  const front = trees
    .filter((tree) => tree.depth < NEAR_REACH)
    .sort(
      (a, b) =>
        a.depth + Math.abs(a.z - 70) * 0.08 - (b.depth + Math.abs(b.z - 70) * 0.08),
    );
  front.slice(0, NEAR_TREES).forEach((tree) => {
    tree.detail = 2;
  });
  for (const tree of trees) {
    if (tree.detail === 2) continue;
    tree.detail = tree.depth < MID_DEPTH ? 1 : 0;
    tree.variant = tree.detail === 1 ? 0 : 1;
  }
  return trees;
}

function plantShrubs(random) {
  const rnd = (a, b) => a + (b - a) * random();
  const shrubs = [];
  const add = (x, z) => {
    shrubs.push({
      x,
      z,
      variant: random() < 0.65 ? 0 : 1,
      scale: rnd(0.7, 1.5),
      yaw: rnd(0, Math.PI * 2),
      colour: new THREE.Color().setHSL(
        rnd(0.23, 0.31),
        rnd(0.34, 0.46),
        rnd(0.38, 0.48),
        THREE.SRGBColorSpace,
      ),
    });
  };
  for (let z = TREE_Z_MIN; z < END_LINE; z += SHRUB_SPACING) {
    for (const side of [-1, 1]) {
      const clump = fbm(z / 22 + side * 40, 7.3);
      const chance = (z < 160 ? 0.85 : 0.5) * smoothstep(0.32, 0.55, clump);
      if (random() < chance) {
        add(side * (CLEAR_HALF_WIDTH + 2.8 + rnd(0, 9)), z + rnd(0, SHRUB_SPACING));
      }
    }
  }
  for (let x = -TREE_LINE; x < TREE_LINE; x += SHRUB_SPACING * 1.3) {
    if (random() < 0.55) add(x + rnd(0, 4), END_LINE - rnd(0, 6));
  }
  return shrubs;
}

// ------------------------------------------------------------- baked shade

// Paints every caster's shadow, as a chain of soft discs running from its
// foot away from the sun, into one texture laid over the ground. Discs are
// combined with "lighten" so overlapping shadows do not stack up darker.
function bakeShade(casters, rect, width, height, random) {
  const texture = canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighten";
    const sx = width / (rect.x1 - rect.x0);
    const sz = height / (rect.z1 - rect.z0);
    ctx.setTransform(sx, 0, 0, sz, -rect.x0 * sx, -rect.z0 * sz);
    const disc = (x, z, r, strength, core) => {
      if (x + r < rect.x0 || x - r > rect.x1 || z + r < rect.z0 || z - r > rect.z1) {
        return;
      }
      const v = Math.round(255 * strength);
      const gradient = ctx.createRadialGradient(x, z, 0, x, z, r);
      gradient.addColorStop(0, `rgb(${v},${v},${v})`);
      gradient.addColorStop(core, `rgb(${v},${v},${v})`);
      gradient.addColorStop(1, "#000");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, z, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const caster of casters) {
      const reach = caster.height * Math.hypot(SHADOW_X, SHADOW_Z) + caster.radius;
      if (
        caster.x + reach < rect.x0 ||
        caster.x - reach > rect.x1 ||
        caster.z + reach < rect.z0 ||
        caster.z - reach > rect.z1
      ) {
        continue;
      }
      // Contact shade at the foot, a touch darker than the cast shadow.
      disc(caster.x, caster.z, Math.max(1.2, caster.radius * 0.55), 1, 0.35);
      let h = 0;
      while (h < caster.height) {
        const t = h / caster.height;
        const r = Math.max(0.45, caster.profile(t) * caster.radius * 1.1);
        const x = caster.x + SHADOW_X * h;
        const z = caster.z + SHADOW_Z * h;
        disc(x, z, r, 0.84, 0.74 - 0.4 * t);
        if (r > 1.5) {
          const a = random() * Math.PI * 2;
          disc(x + Math.cos(a) * r * 0.65, z + Math.sin(a) * r * 0.65, r * 0.55, 0.84, 0.5);
        }
        h += Math.max(0.35, r * 0.55);
      }
    }
  });
  texture.colorSpace = THREE.NoColorSpace;
  const pixels = texture.image
    .getContext("2d")
    .getImageData(0, 0, width, height).data;
  const sample = (x, z) => {
    const px = Math.floor(((x - rect.x0) / (rect.x1 - rect.x0)) * width);
    const pz = Math.floor(((z - rect.z0) / (rect.z1 - rect.z0)) * height);
    if (px < 0 || px >= width || pz < 0 || pz >= height) return 0;
    return pixels[(pz * width + px) * 4 + 1] / 255;
  };

  // A grid that follows the ground, so the shade carries on under the trees
  // where the land starts to roll.
  const nx = Math.max(2, Math.round((rect.x1 - rect.x0) / 3));
  const nz = Math.max(2, Math.round((rect.z1 - rect.z0) / 4));
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = lerp(rect.x0, rect.x1, i / nx);
      const z = lerp(rect.z0, rect.z1, j / nz);
      const y = terrainHeight(x, z);
      position.push(x, y + (y === 0 ? 0.02 : 0.16), z);
      uv.push(i / nx, 1 - j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      index.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: SHADOW_COLOR,
      alphaMap: texture,
      transparent: true,
      opacity: SHADOW_OPACITY,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "tree-shade";
  return { mesh: groundOverlay(mesh, SHADOW_LAYER), sample };
}

// ---------------------------------------------------------------- assembly

function instanced(geometry, material, items, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  items.forEach((item, i) => {
    mesh.setMatrixAt(i, item.matrix);
    if (item.colour) mesh.setColorAt(i, item.colour);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function buildTrees({ random }) {
  const group = new THREE.Group();
  group.name = "trees";
  const rnd = (a, b) => a + (b - a) * random();
  const materials = createMaterials(random);

  // models[species][detail][variant]; mid and far tiers use one shape each.
  const models = SPECIES.map((species) => [
    [null, species.build(random, 0, 1)],
    [species.build(random, 1, 0), null],
    [species.build(random, 2, 0), species.build(random, 2, 1)],
  ]);
  const shrubModels = [buildShrub(random, 0), buildShrub(random, 1)];

  const trees = plantTrees(random);
  const shrubs = plantShrubs(random);

  const position = new V3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const size = new V3();
  const matrixAt = (x, y, z, yaw, sx, sy, leanX = 0, leanZ = 0) => {
    euler.set(leanX, yaw, leanZ);
    return new THREE.Matrix4().compose(
      position.set(x, y, z),
      quaternion.setFromEuler(euler),
      size.set(sx, sy, sx),
    );
  };

  const casters = [];
  const batches = new Map();
  const stems = [];
  for (const tree of trees) {
    const model = models[tree.species][tree.detail][tree.variant];
    const y = terrainHeight(tree.x, tree.z) - TREE_SINK;
    const sy = tree.scale * tree.stretch;
    const key = `${tree.detail}-${tree.species}-${tree.variant}`;
    if (!batches.has(key)) batches.set(key, { model, tree, items: [] });
    batches.get(key).items.push({
      matrix: matrixAt(tree.x, y, tree.z, tree.yaw, tree.scale, sy, tree.lean[0], tree.lean[1]),
      colour: tree.colour,
    });
    if (tree.detail < 2) {
      stems.push({
        matrix: matrixAt(
          tree.x,
          y,
          tree.z,
          tree.yaw,
          model.trunk.radius * tree.scale,
          model.trunk.height * sy,
        ),
        colour: new THREE.Color(SPECIES[tree.species].stem),
      });
    }
    if (tree.depth < 90) {
      casters.push({
        x: tree.x,
        z: tree.z,
        height: model.height * sy,
        radius: model.radius * tree.scale,
        profile: SPECIES[tree.species].profile,
      });
    }
  }
  for (const shrub of shrubs) {
    const model = shrubModels[shrub.variant];
    casters.push({
      x: shrub.x,
      z: shrub.z,
      height: model.height * shrub.scale,
      radius: model.radius * shrub.scale,
      profile: () => 0.9,
    });
  }

  // Shade first: the sun sits downrange-right, so the right-hand tree line
  // throws long shadows in across the rough, the far end throws them back
  // toward the tee, and the left-hand trees shade only their own feet.
  const zSplit = END_LINE - 27;
  const shades = [
    bakeShade(casters, { x0: -125, x1: -36, z0: TREE_Z_MIN, z1: zSplit }, 384, 2048, random),
    bakeShade(casters, { x0: 92, x1: 150, z0: TREE_Z_MIN, z1: zSplit }, 256, 2048, random),
    bakeShade(casters, { x0: -125, x1: 150, z0: zSplit, z1: END_LINE + 35 }, 1024, 256, random),
  ];
  for (const shade of shades) group.add(shade.mesh);
  const shadeAt = (x, z) => Math.max(...shades.map((shade) => shade.sample(x, z)));
  // Ground cover and shrubs draw over the shade overlay, so shaded ones are
  // darkened to match it.
  const shaded = (colour, x, z) =>
    colour.multiplyScalar(1 - SHADOW_OPACITY * 0.85 * shadeAt(x, z));

  for (const [key, batch] of batches) {
    const { model, tree, items } = batch;
    const foliage = instanced(model.foliage, materials.leaves, items, `foliage-${key}`);
    foliage.renderOrder = 2 - tree.detail;
    group.add(foliage);
    if (model.wood) {
      group.add(
        instanced(
          model.wood,
          materials.wood[tree.species],
          items.map((item) => ({ matrix: item.matrix })),
          `wood-${key}`,
        ),
      );
    }
  }
  if (stems.length) {
    group.add(instanced(buildUnitTrunk(), materials.stems, stems, "stems"));
  }

  shrubModels.forEach((model, variant) => {
    const items = shrubs
      .filter((shrub) => shrub.variant === variant)
      .map((shrub) => ({
        matrix: matrixAt(
          shrub.x,
          terrainHeight(shrub.x, shrub.z) - 0.1,
          shrub.z,
          shrub.yaw,
          shrub.scale,
          shrub.scale * rnd(0.85, 1.15),
        ),
        colour: shaded(shrub.colour, shrub.x, shrub.z),
      }));
    if (items.length) {
      group.add(instanced(model.foliage, materials.leaves, items, `shrubs-${variant}`));
    }
  });

  // Rough-line grass: thickest abreast of the tee, thinning downrange, with
  // tall fescue only where it cannot get between the camera and the ball.
  const grass = [];
  const flowers = [];
  const coverSpot = () => {
    const end = random() < 0.12;
    const x = end
      ? rnd(-GRASS_OUTER, GRASS_OUTER)
      : (random() < 0.5 ? -1 : 1) * rnd(GRASS_INNER, GRASS_OUTER);
    const z = end
      ? RANGE_LENGTH + rnd(52, 76)
      : -44 + 524 * Math.pow(random(), 1.9);
    const density = end ? 0.5 : z < -10 ? 0.6 : z < 80 ? 1 : Math.max(0.3, 1 - (z - 80) / 320);
    const patch = smoothstep(0.3, 0.6, fbm(x / 9 + 50, z / 9 + 20));
    return { x, z, keep: density * (0.35 + 0.65 * patch) };
  };
  for (let i = 0; i < GRASS_ATTEMPTS; i++) {
    const { x, z, keep } = coverSpot();
    const roll = random();
    const kind = random();
    const tint = random();
    const girth = rnd(0.6, 1);
    if (roll > keep) continue;
    const tall = Math.abs(x) > CLEAR_HALF_WIDTH + 1 && kind < 0.6;
    const fescue = tall || kind > 0.85;
    const height = tall ? lerp(0.6, 1.25, tint) : lerp(0.24, 0.46, tint);
    const colour = fescue
      ? new THREE.Color().setHSL(lerp(0.12, 0.2, tint), 0.42, lerp(0.5, 0.62, kind), THREE.SRGBColorSpace)
      : new THREE.Color().setHSL(lerp(0.23, 0.29, tint), 0.44, lerp(0.36, 0.46, kind), THREE.SRGBColorSpace);
    grass.push({
      matrix: matrixAt(x, terrainHeight(x, z) - 0.02, z, roll * 40, girth * (tall ? 1.1 : 0.8), height),
      colour: shaded(colour, x, z),
    });
  }
  for (let i = 0; i < FLOWER_ATTEMPTS; i++) {
    const { x, z, keep } = coverSpot();
    const roll = random();
    const kind = random();
    if (roll > keep * 0.8) continue;
    const colour = new THREE.Color(
      kind < 0.5 ? 0xf4f1e6 : kind < 0.8 ? 0xf2cf45 : 0xa98bd6,
    );
    const scale = lerp(0.45, 0.75, random());
    flowers.push({
      matrix: matrixAt(x, terrainHeight(x, z) + 0.05, z, roll * 40, scale, scale * 0.7),
      colour: shaded(colour, x, z),
    });
  }
  if (grass.length) {
    group.add(instanced(buildTuft(3), materials.grass, grass, "grass"));
  }
  if (flowers.length) {
    group.add(instanced(buildTuft(2), materials.flowers, flowers, "wildflowers"));
  }

  return {
    object: group,
    update(elapsedSeconds) {
      materials.uniforms.uTime.value = elapsedSeconds;
    },
  };
}

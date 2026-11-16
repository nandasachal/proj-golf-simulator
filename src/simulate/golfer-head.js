import * as THREE from "three";
import { skinMaterial } from "./golfer-body-shading";

// The golfer's head, sculpted and painted procedurally. Yards; origin at the
// centre of the skull, face toward local -x, crown toward +y, ears on ±z.
// golfer.js positions and turns the group.
//
// Internally the sculpt works in (f, y, z) with f = -x pointing out of the
// face. The skin is one closed surface swept from crown to neck stump: each
// height has an outline (front depth, back depth, half width) that blends into
// a neck below the jawline, and the features are pushed in and out of the
// front of it. The colour and normal maps are computed texel by texel from the
// same functions, so paint and sculpt cannot drift apart.

export const SKIN_COLOR = 0xa9795d;

// The stump the skin ends in below the jaw, for the body's neck to run up
// into: half depth, half width, and how far behind the middle of the skull
// its centre sits at a height.
export const NECK_STUMP = {
  rf: 0.06,
  rz: 0.058,
  centre: (y) => 0.02 - (-0.13 - y) * 0.2,
};

const PI = Math.PI;
// Jest has no GPU to upload to, so the maps only need to exist there.
const TEXTURE_SIZE = process.env.NODE_ENV === "test" ? 16 : 1024;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const gauss = (x, sigma) => Math.exp(-(x * x) / (sigma * sigma));

// Catmull-Rom through [x, value] keys given in ascending x.
function curve(keys) {
  const n = keys.length;
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const [x0, v0] = keys[i];
    const [x1, v1] = keys[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const m0 =
      i > 0 ? (v1 - keys[i - 1][1]) / (x1 - keys[i - 1][0]) : (v1 - v0) / h;
    const m1 =
      i < n - 2 ? (keys[i + 2][1] - v0) / (keys[i + 2][0] - x0) : (v1 - v0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * v0 +
      (t3 - 2 * t2 + t) * h * m0 +
      (-2 * t3 + 3 * t2) * v1 +
      (t3 - t2) * h * m1
    );
  };
}

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return mix(
    mix(hash(xi, yi), hash(xi + 1, yi), u),
    mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), u),
    v,
  );
}

// ---------------------------------------------------------------- skull ----

const Y_TOP = 0.12;
const Y_MID = 0.015; // brow level: above it the outline closes over the crown
const Y_BOT = -0.17;
const Q_MID = 0.36; // share of the crown-to-neck parameter spent on the crown

const frontAt = curve([
  [-0.17, 0.088],
  [-0.136, 0.088],
  [-0.122, 0.091],
  [-0.1, 0.094],
  [-0.08, 0.098],
  [-0.05, 0.096],
  [-0.01, 0.091],
  [0.015, 0.096],
]);
const backAt = curve([
  [-0.17, 0.06],
  [-0.11, 0.062],
  [-0.08, 0.074],
  [-0.05, 0.095],
  [-0.02, 0.106],
  [0.015, 0.108],
]);
const widthAt = curve([
  [-0.17, 0.05],
  [-0.13, 0.044],
  [-0.1, 0.055],
  [-0.075, 0.0635],
  [-0.045, 0.0695],
  [-0.01, 0.0725],
  [0.015, 0.076],
]);
const taperAt = curve([
  [-0.136, 0.5],
  [-0.1, 0.3],
  [-0.07, 0.1],
  [-0.045, 0],
]);
// Height of the jawline (and, round the back, the base of the skull) by angle
// from straight ahead; below it the surface becomes neck.
const jawAt = curve([
  [0, -0.137],
  [0.5, -0.133],
  [1.0, -0.116],
  [1.45, -0.092],
  [1.75, -0.078],
  [PI, -0.072],
]);

const yOfQ = (q) =>
  q < Q_MID
    ? Y_MID + (Y_TOP - Y_MID) * Math.sin((PI / 2) * (1 - q / Q_MID))
    : Y_MID - ((q - Q_MID) / (1 - Q_MID)) * (Y_MID - Y_BOT);
const qOfY = (y) =>
  y > Y_MID
    ? Q_MID *
      (1 - Math.asin(Math.min(1, (y - Y_MID) / (Y_TOP - Y_MID))) / (PI / 2))
    : Q_MID + ((Y_MID - y) / (Y_MID - Y_BOT)) * (1 - Q_MID);

function skullRow(q) {
  const y = yOfQ(q);
  let kf = 1;
  let kb = 1;
  let kw = 1;
  if (q < Q_MID) {
    const s = (y - Y_MID) / (Y_TOP - Y_MID);
    kf = (1 - s ** 2.3) ** (1 / 2.3);
    kb = Math.sqrt(1 - s * s);
    kw = (1 - s ** 2.2) ** (1 / 2.2);
  }
  return {
    q,
    y,
    front: frontAt(y) * kf,
    back: backAt(y) * kb,
    width: widthAt(y) * kw,
    taper: taperAt(y),
    neckCentre: -NECK_STUMP.centre(y),
  };
}

function skullColumn(a) {
  const abs = Math.abs(a);
  return {
    a,
    abs,
    c: Math.cos(a),
    s: Math.sin(a),
    jaw: jawAt(abs),
    soft: 0.006 + 0.008 * smooth(1.3, 2.2, abs),
  };
}

// The bare skull-and-neck surface. Writes f, y, z and m (1 on the head, 0 on
// the neck) into out.
function skullPoint(row, col, out) {
  const { c, s } = col;
  const e = c >= 0 ? 0.85 : 0.93;
  let f = (c >= 0 ? row.front : -row.back) * Math.abs(c) ** e;
  let z = row.width * Math.sign(s) * Math.abs(s) ** e;
  if (c > 0) z *= 1 - row.taper * c * c;
  const m = smooth(col.jaw - col.soft, col.jaw + col.soft, row.y);
  if (m < 1) {
    f = mix(row.neckCentre + NECK_STUMP.rf * c, f, m);
    z = mix(NECK_STUMP.rz * s, z, m);
  }
  out.f = f;
  out.y = row.y;
  out.z = z;
  out.m = m;
}

// ----------------------------------------------------------------- face ----

const EYE_Y = -0.004;
const EYE_Z = 0.0315;
const EYE_RADIUS = 0.0138;
const LID_RADIUS = 0.0147;
const EYE_HALF_WIDTH = 0.0136;
const EYE_UPPER = 0.0041; // lid edges above and below the pupil: smiling eyes
const EYE_LOWER = 0.0031;

const MOUTH_HALF = 0.031;
const MOUTH_CORNER_Y = -0.064;
const mouthTop = (z) => -0.067 + 0.003 * (z / MOUTH_HALF) ** 2;
const mouthBottom = (z) =>
  MOUTH_CORNER_Y - 0.0085 * (1 - (z / MOUTH_HALF) ** 2) ** 0.75;
// Negative inside the open smile.
function mouthDistance(y, z) {
  if (z >= MOUTH_HALF) return Math.hypot(z - MOUTH_HALF, y - MOUTH_CORNER_Y);
  return Math.max(y - mouthTop(z), mouthBottom(z) - y);
}
const upperLipHeight = (z) =>
  0.001 + 0.0048 * Math.sqrt(Math.max(0, 1 - (z / MOUTH_HALF) ** 2));
const lowerLipHeight = (z) =>
  0.001 + 0.0078 * Math.max(0, 1 - (z / MOUTH_HALF) ** 2) ** 0.6;

const noseRidge = curve([
  [-0.058, 0],
  [-0.052, 0.004],
  [-0.047, 0.014],
  [-0.042, 0.0235],
  [-0.037, 0.028],
  [-0.029, 0.0225],
  [-0.004, 0.0085],
  [0.012, 0.003],
  [0.02, 0],
]);
const noseWidth = curve([
  [-0.05, 0.013],
  [-0.038, 0.015],
  [-0.025, 0.0095],
  [-0.004, 0.008],
  [0.012, 0.011],
]);

function foldDistance(y, z) {
  // Nasolabial fold: from beside the nostril to outside the mouth corner.
  const ay = -0.04;
  const az = 0.0215;
  const by = -0.075;
  const bz = 0.0395;
  const dy = by - ay;
  const dz = bz - az;
  const t = clamp01(((y - ay) * dy + (z - az) * dz) / (dy * dy + dz * dz));
  return Math.hypot(y - ay - t * dy, z - az - t * dz);
}

// How far the face stands proud of the bare skull at (y, |z|).
function faceOffset(y, z) {
  let d = 0;
  // Brow ridge and glabella.
  d +=
    0.0042 *
    gauss(y - 0.0135, 0.0075) *
    smooth(0.004, 0.02, z) *
    smooth(0.07, 0.045, z);
  d += 0.002 * gauss(y - 0.012, 0.01) * gauss(z, 0.012);
  // Eye sockets, wider toward the nose.
  const ez = z - EYE_Z;
  const ey = y - EYE_Y;
  d -=
    0.0115 *
    Math.exp(-(ez * ez) / (ez < 0 ? 0.00045 : 0.0003) - (ey * ey) / 0.0001);
  // Nose: ridge, wings, nostrils.
  if (y < 0.02 && y > -0.056) {
    d += noseRidge(y) * Math.exp(-((z / noseWidth(y)) ** 2.4));
    d += 0.011 * gauss(z - 0.0158, 0.0065) * gauss(y + 0.0415, 0.006);
    d -= 0.003 * gauss(z - 0.0075, 0.004) * gauss(y + 0.0465, 0.0025);
  }
  // Cheeks lifted by the smile, and the fold they make.
  d += 0.0045 * gauss(z - 0.043, 0.017) * gauss(y + 0.03, 0.015);
  d -= 0.0022 * gauss(foldDistance(y, z), 0.0035);
  // Muzzle, mouth and lips.
  d += 0.003 * gauss(z, 0.026) * gauss(y + 0.058, 0.011);
  d -= 0.012 * smooth(0.0006, -0.0018, mouthDistance(y, z));
  if (z < MOUTH_HALF) {
    const edge = 1 - (z / MOUTH_HALF) ** 4;
    const above = y - mouthTop(z);
    if (above > 0) d += 0.0032 * gauss(above - 0.0022, 0.0032) * edge;
    const below = mouthBottom(z) - y;
    if (below > 0) d += 0.0045 * gauss(below - 0.0035, 0.0045) * edge;
  }
  d -= 0.002 * gauss(z - 0.034, 0.004) * gauss(y + 0.064, 0.005);
  // Chin and the dip above it.
  d -= 0.0025 * gauss(y + 0.096, 0.006) * gauss(z, 0.02);
  d += 0.0075 * gauss(y + 0.118, 0.014) * gauss(z, 0.019);
  return d;
}

// 1 inside the almond between the eyelids, fading out just beyond it.
function eyeOpening(dy, dz) {
  const k = 1 - (dz / (EYE_HALF_WIDTH + 0.001)) ** 2;
  if (k <= 0) return 0;
  const edge = dy > 0 ? EYE_UPPER * k : EYE_LOWER * k;
  return smooth(edge + 0.0022, edge + 0.0004, Math.abs(dy));
}

let eyeDepth = null; // f of the eyeball centres, found from the sculpt

function skinPoint(row, col, out) {
  skullPoint(row, col, out);
  if (col.c <= 0.05 || out.m <= 0) return;
  const z = Math.abs(out.z);
  out.f += faceOffset(out.y, z) * smooth(0.05, 0.45, col.c) * out.m;
  if (eyeDepth === null) return;
  // Keep the skin behind the eye wherever the lids are open.
  const dy = out.y - EYE_Y;
  const dz = z - EYE_Z;
  const open = eyeOpening(dy, dz);
  if (open > 0) {
    const behind =
      eyeDepth +
      Math.sqrt(Math.max(0, LID_RADIUS ** 2 - dy * dy - dz * dz)) -
      0.0012;
    out.f = mix(out.f, Math.min(out.f, behind), open);
  }
}

// Bisect for the angle whose skull point sits at |z| on the front of the face.
function frontColumn(row, z) {
  const point = {};
  let lo = 0;
  let hi = PI / 2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    skullPoint(row, skullColumn(mid), point);
    if (point.z < z) lo = mid;
    else hi = mid;
  }
  return skullColumn((lo + hi) / 2);
}

function surfaceDepth(y, z, bare = false) {
  const row = skullRow(qOfY(y));
  const point = {};
  (bare ? skullPoint : skinPoint)(row, frontColumn(row, z), point);
  return point.f;
}

// ----------------------------------------------------------------- hair ----

// Height of the hairline by angle from straight ahead, in degrees: forehead,
// temple corner, sideburn, over the ear, down behind it to the nape.
const hairlineAt = curve([
  [0, 0.06],
  [22, 0.06],
  [36, 0.056],
  [47, 0.043],
  [56, 0.022],
  [64, 0.002],
  [72, -0.012],
  [82, -0.01],
  [88, 0.008],
  [108, 0.01],
  [116, -0.018],
  [126, -0.052],
  [142, -0.072],
  [180, -0.078],
]);

// Strand pattern in head space: 0..1, streaky along the way the hair is
// combed. Top and back are combed front to back (lines of constant z); the
// sides are combed down and back.
function strands(f, y, z, across, along) {
  const r = Math.hypot(f, y + 0.01, z) || 1;
  const side = smooth(0.62, 0.9, Math.abs(z) / r);
  const wobble = 0.007 * (noise(f * 16 + 3, y * 16 + z * 11) - 0.5);
  const layer = (s, t) =>
    0.6 * noise(s * across, t * along) +
    0.3 * noise(s * across * 2.7 + 11, t * along * 1.7) +
    0.1 * noise(s * across * 6.1 + 5, t * along * 3);
  const top = layer(z + 0.1 * f + wobble, f - y);
  if (side <= 0) return top;
  return mix(
    top,
    layer(0.8 * f - 0.6 * y + wobble, 0.6 * f + 0.8 * y + 7),
    side,
  );
}

// Depth of hair over the skull: short at the sides and nape, full on top,
// standing up into a quiff over the forehead.
function hairThickness(col, y, f, z) {
  const degrees = (col.abs * 180) / PI;
  const above = y - hairlineAt(degrees);
  const frontness = gauss(col.abs, 1.0);
  const sides = 0.0012 + 0.0093 * smooth(-0.035, 0.075, y);
  let depth = mix(sides, 0.02, smooth(0.05, 0.105, y));
  depth +=
    0.012 *
    frontness *
    smooth(0.045, 0.08, y) *
    (1 - 0.5 * smooth(0.1, 0.12, y));
  const reach = mix(0.045, 0.009, frontness);
  depth *= 0.1 + 0.9 * smooth(0, reach, above);
  // Clumps, flattened out at the crown where every column meets.
  const clumps = strands(f, y, z, 85, 9) - 0.5;
  return (
    depth +
    clumps *
      (0.0015 + 0.011 * smooth(0.03, 0.09, y)) *
      smooth(0, 0.012, above) *
      smooth(0, 0.03, Math.hypot(f, z))
  );
}

function hairPoint(col, p, out) {
  const row = skullRow(p * qOfY(hairlineAt((col.abs * 180) / PI)));
  skullPoint(row, col, out);
  const depth = hairThickness(col, out.y, out.f, out.z);
  const r = Math.hypot(out.f, out.y + 0.01, out.z) || 1;
  out.f += (out.f / r) * depth;
  out.y += ((out.y + 0.01) / r) * depth;
  out.z += (out.z / r) * depth;
}

// ------------------------------------------------------------- geometry ----

// A (rows x cols) sheet of vertices from point(i, j) -> [x, y, z, u, v],
// wound so that rows-then-columns is outward (or the reverse when flipped).
function sheet(rows, cols, point, { flip = false, seam = false } = {}) {
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const p = point(i, j);
      const k = i * cols + j;
      positions.set([p[0], p[1], p[2]], k * 3);
      uvs.set([p[3], p[4]], k * 2);
    }
  }
  const index = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + cols;
      const c = a + 1;
      const d = b + 1;
      if (flip) index.push(a, c, b, b, c, d);
      else index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  if (seam) {
    // First and last columns coincide: share their normals across the join.
    const normal = geometry.attributes.normal;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < rows; i++) {
      const first = i * cols;
      const last = first + cols - 1;
      a.fromBufferAttribute(normal, first);
      b.fromBufferAttribute(normal, last);
      a.add(b).normalize();
      normal.setXYZ(first, a.x, a.y, a.z);
      normal.setXYZ(last, a.x, a.y, a.z);
    }
  }
  return geometry;
}

// Columns are packed toward the face, where the detail is.
const skinAngle = (t) => PI * (0.55 * t + 0.45 * t * t * t);

function buildSkinGeometry() {
  const qs = [];
  for (let i = 0; i < 20; i++) qs.push((Q_MID * i) / 20);
  for (let y = Y_MID; y > -0.14; y -= 0.00155) qs.push(qOfY(y));
  for (let i = 0; i <= 8; i++) qs.push(qOfY(-0.14 + (i / 8) * (Y_BOT + 0.14)));
  const rows = qs.map(skullRow);
  const segments = 128;
  const cols = [];
  for (let j = 0; j <= segments; j++) {
    cols.push(skullColumn(skinAngle((j / segments) * 2 - 1)));
  }
  const p = {};
  return sheet(
    rows.length,
    cols.length,
    (i, j) => {
      skinPoint(rows[i], cols[j], p);
      return [-p.f, p.y, p.z, j / segments, 1 - rows[i].q];
    },
    { seam: true },
  );
}

const HAIR_ROWS = 40;
const HAIR_SEGMENTS = 104;

// The hair surface as a grid of (f, y, z), crown row first; the mesh is built
// from it and the texture reads positions back out of it.
function buildHairGrid() {
  const grid = new Float32Array(HAIR_ROWS * (HAIR_SEGMENTS + 1) * 3);
  const p = {};
  for (let j = 0; j <= HAIR_SEGMENTS; j++) {
    const col = skullColumn(((j / HAIR_SEGMENTS) * 2 - 1) * PI);
    for (let i = 0; i < HAIR_ROWS; i++) {
      hairPoint(col, i / (HAIR_ROWS - 1), p);
      grid.set([p.f, p.y, p.z], (i * (HAIR_SEGMENTS + 1) + j) * 3);
    }
  }
  return grid;
}

function buildHairGeometry(grid) {
  return sheet(
    HAIR_ROWS,
    HAIR_SEGMENTS + 1,
    (i, j) => {
      const k = (i * (HAIR_SEGMENTS + 1) + j) * 3;
      return [
        -grid[k],
        grid[k + 1],
        grid[k + 2],
        j / HAIR_SEGMENTS,
        1 - i / (HAIR_ROWS - 1),
      ];
    },
    { seam: true },
  );
}

// An ear as a rimmed, dished disc with a plain back, in a local frame of
// u (toward the back of the head), v (up) and w (out from the skull).
function buildEarGeometry(sideZ) {
  const rings = 10;
  const around = 30;
  const angle = 0.44; // how far the ear stands off the skull
  const lean = 0.2;
  const centre = [
    0.014,
    -0.021,
    widthAt(-0.02) + 0.0165 * Math.sin(angle) - 0.003,
  ];
  const skin = new THREE.Color(SKIN_COLOR);
  const colors = [];
  const geometry = sheet(
    rings * 2 + 1,
    around + 1,
    (i, j) => {
      const r = i / rings;
      const front = r <= 1;
      const rho = front ? r : 2 - r;
      const phi = (j / around) * 2 * PI;
      const cu = Math.cos(phi);
      const sv = Math.sin(phi);
      const reach = 0.0155 * (1 + 0.16 * sv) * (sv < 0 ? 1 - 0.3 * sv * sv : 1);
      const u0 = rho * reach * cu;
      const v0 = rho * 0.028 * sv;
      const dome = Math.sqrt(Math.max(0, 1 - rho * rho));
      let w = -0.003 * dome;
      let shade = 0.82;
      if (front) {
        const helix =
          0.0042 *
          gauss(rho - 0.86, 0.11) *
          mix(0.3, 1, smooth(-0.9, -0.3, sv));
        const antihelix =
          0.0022 * gauss(rho - 0.5, 0.09) * smooth(-0.3, 0.3, cu + sv * 0.5);
        const bowl =
          -0.0048 * gauss(Math.hypot(u0 + 0.003, (v0 + 0.004) * 0.7), 0.0078);
        const relief = (helix + antihelix + bowl) * (1 - rho ** 8);
        w = 0.0035 * dome + relief;
        shade = clamp01(0.98 + relief * 110);
      }
      const u = u0 * Math.cos(lean) + v0 * Math.sin(lean);
      const v = -u0 * Math.sin(lean) + v0 * Math.cos(lean);
      colors.push(
        skin.r * shade * 1.04,
        skin.g * shade * 0.94,
        skin.b * shade * 0.92,
      );
      return [
        centre[0] + u * Math.cos(angle) - w * Math.sin(angle),
        centre[1] + v,
        sideZ * (centre[2] + u * Math.sin(angle) + w * Math.cos(angle)),
        0,
        0,
      ];
    },
    { flip: sideZ < 0, seam: true },
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Eyelid: the part of a sphere above (or, for the lower lid, below) a tilted
// plane through both corners of the eye and the lid's edge at the pupil.
function lidFrame(upper) {
  const side = upper ? 1 : -1;
  const edge = Math.asin((upper ? EYE_UPPER : -EYE_LOWER) / LID_RADIUS);
  const cz = EYE_HALF_WIDTH / LID_RADIUS;
  const cf = Math.sqrt(1 - cz * cz);
  const tilt = Math.atan((-side * Math.sin(edge)) / (Math.cos(edge) - cf));
  const polar = Math.acos(Math.sin(tilt) * cf);
  return { side, tilt, polar, cz };
}

function buildLidGeometry(upper) {
  const { side, tilt, polar } = lidFrame(upper);
  const geometry = new THREE.SphereGeometry(
    LID_RADIUS,
    22,
    10,
    0,
    PI * 2,
    0,
    polar,
  );
  if (!upper) geometry.rotateX(PI);
  geometry.rotateZ(side * tilt);
  return geometry;
}

function buildLashGeometry() {
  const { tilt, polar, cz } = lidFrame(true);
  const reach = Math.asin(cz / Math.sin(polar));
  const points = [];
  for (let i = 0; i <= 16; i++) {
    const phi = (i / 16) * 2 * reach - reach;
    // Axis of the lid cap and the forward direction square to it.
    const along = Math.cos(polar);
    const out = Math.sin(polar) * Math.cos(phi);
    const f = along * Math.sin(tilt) + out * Math.cos(tilt);
    const y = along * Math.cos(tilt) - out * Math.sin(tilt);
    const z = Math.sin(polar) * Math.sin(phi);
    points.push(
      new THREE.Vector3(-f, y, z).multiplyScalar(LID_RADIUS + 0.0002),
    );
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    24,
    0.00055,
    5,
  );
}

// A tooth: a sphere squared off toward a rounded tile.
function buildToothGeometry() {
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const position = geometry.attributes.position;
  const square = (v) => Math.sign(v) * Math.abs(v) ** 0.45;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      square(position.getX(i)),
      square(position.getY(i)),
      square(position.getZ(i)),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ------------------------------------------------------------- textures ----

function dataTexture(data, width, tall, colorSpace) {
  const texture = new THREE.DataTexture(data, width, tall, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Tangent-space normals from a height field in yards; texel is the rough
// size of a texel on the surface along u and v.
function normalsFromHeight(height, width, tall, texelU, texelV) {
  const data = new Uint8Array(width * tall * 4);
  for (let j = 0; j < tall; j++) {
    const up = Math.min(tall - 1, j + 1) * width;
    const down = Math.max(0, j - 1) * width;
    for (let i = 0; i < width; i++) {
      const right = (i + 1) % width;
      const left = (i + width - 1) % width;
      const dx =
        (height[j * width + right] - height[j * width + left]) / (2 * texelU);
      const dy = (height[up + i] - height[down + i]) / (2 * texelV);
      const scale = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const k = (j * width + i) * 4;
      data[k] = (-dx * scale * 0.5 + 0.5) * 255;
      data[k + 1] = (-dy * scale * 0.5 + 0.5) * 255;
      data[k + 2] = (scale * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  return dataTexture(data, width, tall, THREE.NoColorSpace);
}

const SKIN_RGB = [
  (SKIN_COLOR >> 16) & 255,
  (SKIN_COLOR >> 8) & 255,
  SKIN_COLOR & 255,
];
const HAIR_RGB = [17, 15, 15];
const STUBBLE_RGB = [36, 28, 25];

// Upper edge of the stubble by angle from straight ahead, in degrees: under
// the nose, out past the mouth corners, up the cheek to the sideburn.
const stubbleTopAt = curve([
  [0, -0.053],
  [22, -0.053],
  [30, -0.06],
  [43, -0.067],
  [55, -0.06],
  [65, -0.042],
  [73, -0.016],
  [80, 0.012],
]);

function browCoverage(y, z) {
  const t = (z - 0.0165) / 0.0415;
  if (t < -0.05 || t > 1.05) return 0;
  const centre =
    0.0098 + 0.003 * Math.sin(PI * (0.15 + 0.75 * t)) - 0.0035 * t * t;
  const half = 0.0033 * (1 - 0.7 * clamp01(t) ** 2.5);
  return (
    smooth(half, half * 0.5, Math.abs(y - centre)) *
    smooth(-0.05, 0.05, t) *
    smooth(1.05, 0.88, t)
  );
}

function buildSkinTextures(size) {
  const color = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  // The face is symmetric, so paint one half and mirror it.
  const half = size / 2;
  const cols = [];
  for (let i = 0; i < half; i++) {
    const col = skullColumn(skinAngle(((i + 0.5) / size) * 2 - 1));
    col.degrees = (col.abs * 180) / PI;
    col.hairline = hairlineAt(col.degrees);
    col.hairFade = mix(0.004, 0.016, smooth(60, 125, col.degrees));
    col.stubbleTop = stubbleTopAt(col.degrees);
    cols.push(col);
  }
  const p = {};
  for (let j = 0; j < size; j++) {
    const row = skullRow(1 - (j + 0.5) / size);
    const y = row.y;
    for (let i = 0; i < half; i++) {
      const col = cols[i];
      const grain = hash(i, j);
      const k = (j * size + i) * 4;
      const mirror = (j * size + size - 1 - i) * 4;
      if (y > col.hairline + col.hairFade) {
        // Well inside the hair: nothing but scalp.
        const cover = 0.8 + 0.2 * grain;
        for (let n = 0; n < 3; n++) {
          color[k + n] = color[mirror + n] = mix(
            SKIN_RGB[n],
            HAIR_RGB[n],
            cover,
          );
        }
        color[k + 3] = color[mirror + 3] = 255;
        height[j * size + i] = height[j * size + size - 1 - i] =
          0.00025 * grain;
        continue;
      }
      skullPoint(row, col, p);
      const z = Math.abs(p.z);
      const patch = noise(i * 0.021 + 9, j * 0.021);
      let tone = 0.95 + 0.07 * patch + 0.03 * (grain - 0.5);
      // Shade under the jaw, fading out to the body's own neck colour.
      tone *= 1 - 0.14 * (1 - p.m) * smooth(-0.165, -0.14, y);
      let r = SKIN_RGB[0];
      let g = SKIN_RGB[1];
      let b = SKIN_RGB[2];
      let bump = 0.00007 * grain + 0.0002 * noise(i * 0.35, j * 0.35);
      let stubble = 0;

      if (col.c > 0 && p.m > 0 && y < 0.035) {
        // Warmth in the cheeks, nose and chin; light on the brow and bridge.
        const flush =
          0.9 * gauss(z - 0.042, 0.02) * gauss(y + 0.032, 0.02) +
          0.7 * gauss(z, 0.014) * gauss(y + 0.04, 0.012) +
          0.4 * gauss(z, 0.02) * gauss(y + 0.12, 0.012);
        r += 12 * flush;
        g -= 5 * flush;
        b -= 6 * flush;
        tone *= 1 + 0.07 * gauss(z, 0.035) * gauss(y - 0.04, 0.025);
        // Deeper tone round the eyes, under the nose and in the smile folds.
        const ez = z - EYE_Z;
        const ey = y - EYE_Y;
        tone *= 1 - 0.2 * Math.exp(-(ez * ez) / 0.0003 - (ey * ey) / 0.00012);
        tone *= 1 - 0.16 * gauss(foldDistance(y, z), 0.004);
        tone *= 1 - 0.13 * gauss(z - 0.0115, 0.004) * gauss(y + 0.025, 0.02);
        tone *= 1 + 0.07 * gauss(z, 0.0045) * gauss(y + 0.03, 0.016);
        const wing = Math.abs(Math.hypot(z - 0.0145, y + 0.0425) - 0.0072);
        tone *= 1 - 0.24 * gauss(wing, 0.0016) * smooth(0.012, 0.018, z);
        tone *= 1 - 0.2 * gauss(z - 0.0075, 0.003) * gauss(y + 0.047, 0.0022);
        tone *= 1 - 0.12 * gauss(y + 0.096, 0.005) * gauss(z, 0.02);

        // Lips and the inside of the mouth.
        const inside = smooth(0.0008, -0.0006, mouthDistance(y, z));
        let lips = 0;
        if (z < MOUTH_HALF + 0.002) {
          const zc = Math.min(z, MOUTH_HALF * 0.999);
          const above = y - mouthTop(zc);
          const below = mouthBottom(zc) - y;
          const upper =
            smooth(-0.0006, 0.0004, above) *
            smooth(upperLipHeight(zc), upperLipHeight(zc) - 0.0018, above);
          const lower =
            smooth(-0.0006, 0.0004, below) *
            smooth(lowerLipHeight(zc), lowerLipHeight(zc) - 0.003, below);
          const fade = smooth(MOUTH_HALF + 0.002, MOUTH_HALF - 0.003, z);
          lips = Math.max(upper, lower) * fade;
          const lipR = upper > lower ? 120 : 154;
          const lipG = upper > lower ? 70 : 94;
          const lipB = upper > lower ? 66 : 90;
          r = mix(r, lipR, lips * 0.85);
          g = mix(g, lipG, lips * 0.85);
          b = mix(b, lipB, lips * 0.85);
          bump += lips * 0.00035 * noise(p.z * 1100, y * 160);
        }
        r = mix(r, 44, inside);
        g = mix(g, 17, inside);
        b = mix(b, 16, inside);

        // Eyebrows: thick, dark, brushed outward.
        const brow = browCoverage(y, z);
        if (brow > 0) {
          const hairs = noise(z * 420 + y * 900, y * 1500 - z * 500);
          const cover = brow * (0.62 + 0.25 * hairs);
          r = mix(r, 26, cover);
          g = mix(g, 20, cover);
          b = mix(b, 18, cover);
          bump += brow * 0.0004 * hairs;
        }

        // Stubble over the jaw, chin and upper lip.
        const sideLimit = mix(82, 102, smooth(-0.03, -0.075, y));
        stubble =
          smooth(col.stubbleTop + 0.008, col.stubbleTop - 0.012, y) *
          smooth(sideLimit, sideLimit - 18, col.degrees) *
          (1 - lips) *
          (1 - inside);
        const dense =
          gauss(z, 0.03) * smooth(-0.05, -0.056, y) * smooth(-0.07, -0.064, y) +
          smooth(-0.084, -0.1, y) * gauss(z, 0.045);
        stubble *= 0.5 + 0.5 * clamp01(dense);
      }
      // Stubble runs a little way under the jaw.
      stubble *= smooth(-0.165, -0.143, y);
      if (stubble > 0) {
        const bristle = grain < stubble * 0.5 ? 1 : 0;
        const cover = stubble * (0.26 + 0.5 * bristle);
        r = mix(r, STUBBLE_RGB[0], cover);
        g = mix(g, STUBBLE_RGB[1], cover);
        b = mix(b, STUBBLE_RGB[2], cover);
        bump += bristle * 0.00022;
      }

      // Scalp under the hair, fading out at the hairline, sideburns and nape.
      if (y > col.hairline - col.hairFade * 1.8) {
        const fringe = (noise(i * 0.9, j * 0.11) - 0.5) * 1.4;
        const scalp = smooth(
          col.hairline - col.hairFade,
          col.hairline + col.hairFade * 0.4,
          y + fringe * col.hairFade,
        );
        const cover = scalp * (0.8 + 0.2 * grain);
        r = mix(r, HAIR_RGB[0], cover);
        g = mix(g, HAIR_RGB[1], cover);
        b = mix(b, HAIR_RGB[2], cover);
        bump += scalp * 0.00025 * grain;
      }

      color[k] = color[mirror] = Math.min(255, r * tone);
      color[k + 1] = color[mirror + 1] = Math.min(255, g * tone);
      color[k + 2] = color[mirror + 2] = Math.min(255, b * tone);
      color[k + 3] = color[mirror + 3] = 255;
      height[j * size + i] = height[j * size + size - 1 - i] = bump;
    }
  }
  return {
    map: dataTexture(color, size, size, THREE.SRGBColorSpace),
    normalMap: normalsFromHeight(height, size, size, 0.0005, 0.0003),
  };
}

function buildHairTextures(size, grid) {
  // Strands run crown to hairline, along v, so few rows are needed.
  const tall = size / 4;
  const color = new Uint8Array(size * tall * 4);
  const height = new Float32Array(size * tall);
  const stride = (HAIR_SEGMENTS + 1) * 3;
  const at = [0, 0, 0];
  for (let j = 0; j < tall; j++) {
    const v = (j + 0.5) / tall; // 1 at the crown, 0 at the hairline
    const gy = (1 - v) * (HAIR_ROWS - 1);
    const row = Math.min(HAIR_ROWS - 2, Math.floor(gy));
    const ty = gy - row;
    for (let i = 0; i < size; i++) {
      const gx = ((i + 0.5) / size) * HAIR_SEGMENTS;
      const column = Math.min(HAIR_SEGMENTS - 1, Math.floor(gx));
      const tx = gx - column;
      const k = row * stride + column * 3;
      for (let n = 0; n < 3; n++) {
        at[n] = mix(
          mix(grid[k + n], grid[k + 3 + n], tx),
          mix(grid[k + stride + n], grid[k + stride + 3 + n], tx),
          ty,
        );
      }
      const strand = strands(at[0], at[1], at[2], 300, 16);
      const fine = hash(i, j);
      const shade = clamp01(strand * 1.25 - 0.12) ** 1.6;
      const o = (j * size + i) * 4;
      color[o] = 16 + 44 * shade + 6 * fine;
      color[o + 1] = 14 + 37 * shade + 5 * fine;
      color[o + 2] = 13 + 34 * shade + 5 * fine;
      // Ragged edge: strands of different lengths at the hairline.
      const reach = 0.012 + 0.035 * noise(i * 0.45, 3) + 0.02 * hash(i, 1);
      color[o + 3] = v > reach ? 255 : 0;
      height[j * size + i] = 0.0011 * strand + 0.00025 * fine;
    }
  }
  return {
    map: dataTexture(color, size, tall, THREE.SRGBColorSpace),
    normalMap: normalsFromHeight(height, size, tall, 0.0007, 0.0014),
  };
}

function buildEyeTexture() {
  const width = 256;
  const tall = 128;
  const data = new Uint8Array(width * tall * 4);
  for (let j = 0; j < tall; j++) {
    const theta = (1 - (j + 0.5) / tall) * PI;
    for (let i = 0; i < width; i++) {
      const phi = ((i + 0.5) / width) * 2 * PI;
      const x = -Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      const off = Math.acos(clamp01(x)); // angle from the line of sight
      const veins = smooth(0.55, 1.4, x > 0 ? off : PI);
      let r = mix(232, 205, veins);
      let g = mix(226, 172, veins);
      let b = mix(220, 162, veins);
      const iris = smooth(0.54, 0.48, off);
      if (iris > 0) {
        const spoke = noise(Math.atan2(y, z) * 9, off * 14);
        const rim = smooth(0.3, 0.5, off);
        const ir = mix(74 + 26 * spoke, 24, rim);
        const ig = mix(42 + 16 * spoke, 14, rim);
        const ib = mix(22 + 8 * spoke, 9, rim);
        const pupil = smooth(0.2, 0.16, off);
        r = mix(r, mix(ir, 5, pupil), iris);
        g = mix(g, mix(ig, 4, pupil), iris);
        b = mix(b, mix(ib, 4, pupil), iris);
        // A catchlight, up and to one side of the pupil.
        const glint = gauss(Math.hypot(y - 0.17, z - 0.15), 0.06);
        r = mix(r, 255, glint);
        g = mix(g, 255, glint);
        b = mix(b, 255, glint);
      }
      const k = (j * width + i) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, tall, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// ----------------------------------------------------------- hair cards ----

// Over the shell lie a few hundred cards - thin strips with strands painted
// on them, each rooted in the scalp and combed the way the hair goes - so the
// outline is broken into locks instead of being a smooth cap.

const HAIR_CENTRE_Y = -0.01;

// How far the shell stands from the middle of the head in any direction, as
// a table over heading (round the head) and elevation.
function shellRadius(grid) {
  const wide = 96;
  const tall = 48;
  const cells = new Float32Array(wide * tall);
  for (let k = 0; k < grid.length; k += 3) {
    const f = grid[k];
    const y = grid[k + 1] - HAIR_CENTRE_Y;
    const z = grid[k + 2];
    const r = Math.hypot(f, y, z);
    const i = Math.floor(((Math.atan2(z, f) + PI) / (2 * PI)) * wide) % wide;
    const j = Math.min(
      tall - 1,
      Math.floor(((Math.asin(y / r) + PI / 2) / PI) * tall),
    );
    cells[j * wide + i] = Math.max(cells[j * wide + i], r);
  }
  // A cell the samples happened to step over takes after its neighbours.
  for (let pass = 0; pass < 2; pass++) {
    const before = cells.slice();
    for (let j = 0; j < tall; j++) {
      for (let i = 0; i < wide; i++) {
        if (before[j * wide + i] > 0) continue;
        const left = before[j * wide + ((i + wide - 1) % wide)];
        const right = before[j * wide + ((i + 1) % wide)];
        if (left && right) cells[j * wide + i] = (left + right) / 2;
      }
    }
  }
  // Below the hairline there is no shell: carry its edge on downward.
  for (let pass = 0; pass < tall; pass++) {
    for (let j = tall - 2; j >= 0; j--) {
      for (let i = 0; i < wide; i++) {
        if (cells[j * wide + i] > 0) continue;
        const above = cells[(j + 1) * wide + i];
        const left = cells[j * wide + ((i + wide - 1) % wide)];
        const right = cells[j * wide + ((i + 1) % wide)];
        cells[j * wide + i] = above || left || right;
      }
    }
  }
  return (f, y, z) => {
    const r = Math.hypot(f, y, z) || 1;
    const u = ((Math.atan2(z, f) + PI) / (2 * PI)) * wide - 0.5;
    const v = clamp01((Math.asin(y / r) + PI / 2) / PI) * tall - 0.5;
    const i = Math.floor(u);
    const j = Math.max(0, Math.min(tall - 2, Math.floor(v)));
    const tu = u - i;
    const tv = clamp01(v - j);
    const at = (di, dj) => cells[(j + dj) * wide + ((i + di + wide) % wide)];
    return mix(mix(at(0, 0), at(1, 0), tu), mix(at(0, 1), at(1, 1), tu), tv);
  };
}

const CARD_STEPS = 6;
const CARD_VARIANTS = 8;

function buildCardGeometry(grid) {
  const radius = shellRadius(grid);
  let seed = 20241;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  const at = new THREE.Vector3();
  const out = new THREE.Vector3();
  const flow = new THREE.Vector3();
  const side = new THREE.Vector3();
  const p = {};

  // Put a point at `lift` above the shell, straight out from the middle.
  const settle = (lift) => {
    out.copy(at).normalize();
    at.copy(out).multiplyScalar(radius(out.x, out.y, out.z) + lift);
  };

  for (let n = 0; n < 1000; n++) {
    const a = (random() * 2 - 1) * PI;
    const col = skullColumn(a);
    const share = Math.sqrt(random());
    hairPoint(col, share, p);
    const y = p.y;
    const top = smooth(0.035, 0.085, y);
    const front =
      gauss(col.abs, 0.9) * smooth(0.03, 0.06, y) * smooth(0, 0.05, p.f);
    const back = smooth(0.02, -0.06, p.f) * (1 - top);
    // Thin the short sides out: the shell carries them.
    if (top < 0.25 && random() > 0.55) continue;
    const length =
      mix(0.02 + 0.016 * random(), 0.05 + 0.03 * random(), top) *
      (1 + 0.25 * front);
    const width = mix(0.008, 0.013, top) * (0.75 + 0.5 * random());
    const stand = mix(0.0015, 0.004 + 0.009 * random(), top);
    const flick = top * (random() < 0.3 ? 0.006 + 0.008 * random() : 0.002);
    const sweep = 0.28 + 0.3 * (random() - 0.5);
    const variant = Math.floor(random() * CARD_VARIANTS);
    const start = positions.length / 3;

    at.set(p.f, y - HAIR_CENTRE_Y, p.z);
    for (let k = 0; k <= CARD_STEPS; k++) {
      const s = k / CARD_STEPS;
      out.copy(at).normalize();
      // Which way the hair is combed here: back over the top and a little
      // across, down and back at the sides, straight down at the nape, and
      // up off the forehead before it turns over.
      const quiff = front * (1 - smooth(0.15, 0.7, s));
      flow.set(
        mix(mix(-0.75, -0.1, back), -1, top),
        mix(mix(-0.55, -1, back), 0.12, top),
        mix(0, sweep, top),
      );
      flow.x = mix(flow.x, -0.35, quiff);
      flow.y = mix(flow.y, 1, quiff);
      flow.addScaledVector(out, -flow.dot(out)).normalize();
      side.crossVectors(out, flow).normalize();
      const lift =
        -0.002 * (1 - s) +
        stand * Math.sin(PI * Math.min(1, s * 1.15)) +
        flick * s * s +
        0.006 * quiff * s;
      const half = (width / 2) * (1 - 0.6 * s * s);
      const centre = at.clone();
      settle(lift);
      const placed = at.clone();
      at.copy(centre);
      for (const edge of [-1, 1]) {
        positions.push(
          -(placed.x + side.x * half * edge),
          placed.y + side.y * half * edge + HAIR_CENTRE_Y,
          placed.z + side.z * half * edge,
        );
        normals.push(-out.x, out.y, out.z);
        uvs.push((variant + (edge + 1) / 2) / CARD_VARIANTS, 1 - s);
      }
      if (k < CARD_STEPS) {
        const i = start + k * 2;
        index.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
        // Short hair stops at the hairline; only the nape runs a little past.
        const edge = hairlineAt((Math.abs(Math.atan2(at.z, at.x)) * 180) / PI);
        const room = at.y + HAIR_CENTRE_Y - edge + mix(0.001, 0.008, back);
        if (top > 0.6 || room > 0) {
          at.addScaledVector(flow, length / CARD_STEPS);
          settle(0);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

// Strands for the cards: v runs root (1) to tip (0); toward the tip more and
// more of them have ended, so a card frays out instead of ending square.
function buildCardTexture(size) {
  const tall = size / 2;
  const data = new Uint8Array(size * tall * 4);
  for (let i = 0; i < size; i++) {
    const across =
      ((i % (size / CARD_VARIANTS)) + 0.5) / (size / CARD_VARIANTS);
    const edge = Math.sin(PI * across) ** 0.5;
    const reach = (0.35 + 0.65 * hash(i, 7)) * (0.45 + 0.55 * edge);
    const lock = noise(i * 0.22, 3);
    const strand = 0.45 * hash(i, 11) + 0.55 * lock;
    for (let j = 0; j < tall; j++) {
      const along = 1 - (j + 0.5) / tall; // 0 at the root, 1 at the tip
      const fine = hash(i, j);
      const shade = clamp01(strand * 1.2 - 0.1) ** 1.5;
      // A band of sheen across the lock, a third of the way along.
      const sheen = 9 * gauss(along - 0.38 - 0.1 * lock, 0.16);
      const o = (j * size + i) * 4;
      data[o] = 20 + 52 * shade + sheen + 6 * fine;
      data[o + 1] = 17 + 44 * shade + sheen * 0.92 + 5 * fine;
      data[o + 2] = 16 + 40 * shade + sheen * 0.88 + 5 * fine;
      data[o + 3] = along < reach && edge > 0.12 ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, tall, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------- build ----

export function buildGolferHead() {
  const head = new THREE.Group();
  head.name = "head";
  const add = (geometry, material, shadow = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    head.add(mesh);
    return mesh;
  };

  // Seat the eyeballs so the lids stand just proud of the sockets.
  eyeDepth = null;
  eyeDepth = surfaceDepth(EYE_Y, EYE_Z) + 0.005 - LID_RADIUS;

  const skin = skinMaterial({
    ...buildSkinTextures(TEXTURE_SIZE),
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  add(buildSkinGeometry(), skin, true).name = "skin";

  const hairGrid = buildHairGrid();
  const hair = new THREE.MeshStandardMaterial({
    ...buildHairTextures(TEXTURE_SIZE, hairGrid),
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.36,
    alphaTest: 0.5,
  });
  add(buildHairGeometry(hairGrid), hair, true).name = "hair";

  const locks = new THREE.MeshStandardMaterial({
    map: buildCardTexture(TEXTURE_SIZE === 16 ? 16 : 512),
    roughness: 0.55,
    alphaTest: 0.5,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
  const cards = add(buildCardGeometry(hairGrid), locks);
  cards.name = "locks";
  cards.receiveShadow = true;

  const earSkin = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
  });
  for (const sideZ of [-1, 1]) add(buildEarGeometry(sideZ), earSkin, true);

  const eyeball = new THREE.MeshPhysicalMaterial({
    map: buildEyeTexture(),
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const lid = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SKIN_COLOR).multiplyScalar(0.9),
    roughness: 0.6,
  });
  const lash = new THREE.MeshStandardMaterial({
    color: 0x120e0c,
    roughness: 0.7,
  });
  const eyeGeometry = new THREE.SphereGeometry(EYE_RADIUS, 28, 20).rotateY(PI);
  const upperLid = buildLidGeometry(true);
  const lowerLid = buildLidGeometry(false);
  const lashes = buildLashGeometry();
  for (const sideZ of [-1, 1]) {
    for (const [geometry, material] of [
      [eyeGeometry, eyeball],
      [upperLid, lid],
      [lowerLid, lid],
      [lashes, lash],
    ]) {
      add(geometry, material).position.set(-eyeDepth, EYE_Y, sideZ * EYE_Z);
    }
  }

  // Upper teeth, set along the arch just behind the lips.
  const enamel = new THREE.MeshStandardMaterial({
    color: 0xece4d2,
    roughness: 0.28,
  });
  const tooth = buildToothGeometry();
  const archDepth = (z) => surfaceDepth(-0.071, Math.abs(z), true) - 0.0032;
  let edge = 0;
  for (const [width, tall] of [
    [0.0086, 0.0104],
    [0.0068, 0.0092],
    [0.0074, 0.0094],
    [0.0066, 0.0078],
  ]) {
    const centre = edge + width / 2;
    edge += width;
    for (const sideZ of [-1, 1]) {
      const z = sideZ * centre;
      const slope = (archDepth(z + 0.001) - archDepth(z - 0.001)) / 0.002;
      const mesh = add(tooth, enamel);
      mesh.scale.set(0.0019, tall / 2, width / 2 + 0.0002);
      mesh.position.set(-archDepth(z), mouthTop(centre) + 0.002 - tall / 2, z);
      mesh.rotation.y = -Math.atan(slope);
    }
  }

  return head;
}

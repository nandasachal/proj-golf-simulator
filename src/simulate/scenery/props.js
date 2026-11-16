import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  FAIRWAY_HALF_WIDTH,
  MARKER_INTERVAL,
  LAST_MARKER,
  CLEAR_HALF_WIDTH,
  SUN_DIRECTION,
  groundOverlay,
  seededRandom,
  canvasTexture,
} from "./shared";

// Everything man-made on the range: yardage signs, yard lines, target greens
// and flags, the hitting bays, and the furniture that makes it a driving range
// (range balls, target nets, boundary netting, the picker cart). Units are
// yards, the tee is at the origin and the range runs down +z.

// --- tunables ---------------------------------------------------------------

const FLAG_COLORS = [
  0xe63946, 0xffffff, 0x2a6fdb, 0xffd23f, 0xe63946, 0xffffff, 0x2a6fdb,
];
// Near signs sit closer to the centre line (and are smaller) so they are
// still in view from the tee: yards -> [distance off the centre line, scale].
const SIGN_LAYOUT = { 50: [30, 0.5], 100: [48, 0.75] };
const SIGN_CLEARANCE = 1.4; // ground to the bottom of the board
const SIGN_EMISSIVE = 0.3; // keeps the numerals readable on the shaded face
const GREEN_RADIUS = 9;
const GREEN_OFFSET = 14; // flags alternate either side of the centre line
const GREENSIDE_BUNKERS = true;
const TURF_NUMERALS = true; // yardage painted on the turf short of each line
const POLE_HEIGHT = 5;

const BAYS_EACH_SIDE = 6;
const BAY_SPACING = 4.4;
const DECK = { halfWidth: 30.5, zMin: -6.9, zMax: 2.4, y: 0.02 };
const MAT_TOP = 0.06; // main.js tees the ball and stands the golfer at this height
const BALL_RADIUS = 0.0234;
const BAG_BAYS = [1, -1, 3, -4];

const SCATTERED_BALLS = 1500;
const SCATTERED_BALL_RADIUS = 0.036; // a touch oversized so they read at range
const TARGET_NETS = [
  { x: -52, z: 75, color: 0xd8343f },
  { x: 52, z: 125, color: 0xf2c230 },
  { x: -53, z: 225, color: 0x2a6fdb },
];
const BOUNDARY_NETTING = false;
const NET_X = CLEAR_HALF_WIDTH + 2;
const NET_HEIGHT = 15;
const NET_POLE_SPACING = 40;
const NET_Z = [-20, 420];
const NET_TILE = 0.5; // yards per texture tile (two mesh cells)
const CART = { x: 78, z: 186, heading: 0.6 };

const SHADOW_OPACITY = 0.4;

// --- helpers ----------------------------------------------------------------

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const QUAD_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// Where a yard of height throws its shadow on the ground.
const SUN_FLAT = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
const SHADOW_PER_YARD = SUN_FLAT / SUN_DIRECTION.y;
const SHADOW_DIR = [-SUN_DIRECTION.x / SUN_FLAT, -SUN_DIRECTION.z / SUN_FLAT];

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const roundedBox = (w, h, d, radius) =>
  new RoundedBoxGeometry(w, h, d, 2, radius);
const cylinder = (top, bottom, height, radial = 10) =>
  new THREE.CylinderGeometry(top, bottom, height, radial);

function place(x, y, z, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    vec(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
    ONE,
  );
}

// Collects static geometry, tinted per piece through vertex colours, and
// merges it into a single mesh so a whole family of props is one draw call.
function createBatch() {
  const parts = [];
  const tint = new THREE.Color();
  return {
    add(source, matrix, color = 0xffffff) {
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") {
          geometry.deleteAttribute(name);
        }
      }
      if (matrix) geometry.applyMatrix4(matrix);
      const count = geometry.attributes.position.count;
      if (!geometry.attributes.uv) {
        geometry.setAttribute(
          "uv",
          new THREE.BufferAttribute(new Float32Array(count * 2), 2),
        );
      }
      tint.set(color);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      parts.push(geometry);
      source.dispose();
    },
    build(material) {
      const merged = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      return new THREE.Mesh(merged, material);
    },
  };
}

// A round bar between two points.
function tube(batch, base, a, b, radius, color, radial = 6) {
  const axis = new THREE.Vector3().subVectors(b, a);
  const length = axis.length();
  const matrix = new THREE.Matrix4().compose(
    a.clone().addScaledVector(axis, 0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, axis.normalize()),
    ONE,
  );
  batch.add(
    cylinder(radius, radius, length, radial),
    base ? base.clone().multiply(matrix) : matrix,
    color,
  );
}

// Builds flat, upward-facing geometry in the ground plane (y = 0): quads,
// blobs and rings, drawn in the order they are added.
function createFlat(uvScale = 1 / 6) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const push = (x, z, color, u = x * uvScale, v = z * uvScale) => {
    positions.push(x, 0, z);
    uvs.push(u, v);
    colors.push(color.r, color.g, color.b);
  };
  const flat = {
    // Corners as [x, z], in order around the quad (either direction).
    quad(corners, hex = 0xffffff, uv = null) {
      const color = new THREE.Color(hex);
      const [a, b, c] = corners;
      const up =
        (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
      for (const i of up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
        const [x, z] = corners[i];
        if (uv) push(x, z, color, uv[i][0], uv[i][1]);
        else push(x, z, color);
      }
      return flat;
    },
    // radius is a function of the angle, so outlines can be organic.
    fan(cx, cz, radius, segments, centerHex, edgeHex = centerHex) {
      const center = new THREE.Color(centerHex);
      const edge = new THREE.Color(edgeHex);
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * TAU;
        const a1 = ((i + 1) / segments) * TAU;
        const r0 = radius(a0);
        const r1 = radius(a1);
        push(cx, cz, center);
        push(cx + Math.cos(a1) * r1, cz + Math.sin(a1) * r1, edge);
        push(cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0, edge);
      }
      return flat;
    },
    ring(cx, cz, inner, outer, segments, hex) {
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * TAU;
        const a1 = ((i + 1) / segments) * TAU;
        const point = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
        flat.quad(
          [
            point(a0, inner(a0)),
            point(a0, outer(a0)),
            point(a1, outer(a1)),
            point(a1, inner(a1)),
          ],
          hex,
        );
      }
      return flat;
    },
    build() {
      const geometry = new THREE.BufferGeometry();
      const count = positions.length / 3;
      const normals = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) normals[i * 3 + 1] = 1;
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      return geometry;
    },
  };
  return flat;
}

// Out past the tee the sun casts no real shadows, so each prop paints a soft
// one on the turf: the strip of ground shaded by a flat panel that spans
// (x ± hx, z ± hz) between heights h0 and h1.
function castShadow(shadows, x, z, hx, hz, h0, h1) {
  const x0 = x + SHADOW_DIR[0] * SHADOW_PER_YARD * h0;
  const z0 = z + SHADOW_DIR[1] * SHADOW_PER_YARD * h0;
  const x1 = x + SHADOW_DIR[0] * SHADOW_PER_YARD * h1;
  const z1 = z + SHADOW_DIR[1] * SHADOW_PER_YARD * h1;
  shadows.quad(
    [
      [x0 - hx, z0 - hz],
      [x0 + hx, z0 + hz],
      [x1 + hx, z1 + hz],
      [x1 - hx, z1 - hz],
    ],
    0xffffff,
    QUAD_UV,
  );
}

// The shadow of something upright and roughly round, standing on the ground.
function poleShadow(shadows, x, z, radius, height) {
  castShadow(
    shadows,
    x,
    z,
    -SHADOW_DIR[1] * radius * 2,
    SHADOW_DIR[0] * radius * 2,
    0,
    height,
  );
}

// --- textures ---------------------------------------------------------------

// For alpha and bump maps, which hold numbers rather than colours.
function dataTexture(width, height, draw) {
  const texture = canvasTexture(width, height, draw);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function repeating(texture, anisotropy, repeatX = 1, repeatY = repeatX) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  return texture;
}

function speckle(ctx, w, h, random, count, colors, minSize = 1, maxSize = 2.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    const size = minSize + random() * (maxSize - minSize);
    ctx.fillRect(random() * w, random() * h, size, size);
  }
}

const SIGN_CELL = [512, 320];
const SIGN_COLUMNS = 4;

// Every yardage board on one sheet.
function signAtlas(yardages, random) {
  const [cw, ch] = SIGN_CELL;
  const rows = Math.ceil(yardages.length / SIGN_COLUMNS);
  return canvasTexture(cw * SIGN_COLUMNS, ch * rows, (ctx) => {
    yardages.forEach((yards, i) => {
      const x = (i % SIGN_COLUMNS) * cw;
      const y = Math.floor(i / SIGN_COLUMNS) * ch;
      const coat = ctx.createLinearGradient(0, y, 0, y + ch);
      coat.addColorStop(0, "#1b4a33");
      coat.addColorStop(1, "#103021");
      ctx.fillStyle = coat;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = "#f1ead2";
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 30, y + 30, cw - 60, ch - 60);
      ctx.fillStyle = "#f6f0da";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 196px Helvetica, Arial, sans-serif";
      ctx.fillText(String(yards), x + cw / 2, y + ch * 0.47);
      ctx.font = "bold 34px Helvetica, Arial, sans-serif";
      ctx.fillText("Y A R D S", x + cw / 2, y + ch * 0.82);
      // Road dust thrown up along the bottom edge.
      const dust = ctx.createLinearGradient(0, y + ch * 0.7, 0, y + ch);
      dust.addColorStop(0, "rgba(120, 104, 70, 0)");
      dust.addColorStop(1, "rgba(120, 104, 70, 0.3)");
      ctx.fillStyle = dust;
      ctx.fillRect(x, y + ch * 0.7, cw, ch * 0.3);
    });
    speckle(
      ctx,
      cw * SIGN_COLUMNS,
      ch * rows,
      random,
      5000,
      ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.08)"],
      1,
      3,
    );
  });
}

// Alpha for a painted line: wobbly edges, thin patches and scuffs. Tiles
// along its length.
function paintLineAlpha(random) {
  return dataTexture(1024, 64, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const p = [0, 1, 2, 3].map(() => random() * TAU);
    for (let x = 0; x < w; x++) {
      const a = (x / w) * TAU;
      const top =
        12 + 4 * Math.sin(a * 3 + p[0]) + 2.5 * Math.sin(a * 11 + p[1]);
      const bottom =
        h - 12 + 4 * Math.sin(a * 2 + p[2]) + 2.5 * Math.sin(a * 13 + p[3]);
      const level = Math.round(255 * (0.8 + 0.2 * Math.sin(a * 5 + p[1])));
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.fillRect(x, top + random() * 2, 1, bottom - top - random() * 2);
    }
    speckle(ctx, w, h, random, 900, ["rgba(0,0,0,0.55)"], 1, 4);
    speckle(ctx, w, h, random, 30, ["rgba(0,0,0,0.3)"], 6, 16);
  });
}

const NUMERAL_CELL = [256, 384];

// Alpha for the yardages painted on the turf, stretched lengthways like road
// markings so they read from a low camera.
function turfNumeralAlpha(yardages, random) {
  const [cw, ch] = NUMERAL_CELL;
  return dataTexture(cw * yardages.length, ch, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 116px Helvetica, Arial, sans-serif";
    yardages.forEach((yards, i) => {
      ctx.save();
      ctx.translate(i * cw + cw / 2, ch / 2);
      ctx.scale(1, 3);
      ctx.fillText(String(yards), 0, 4);
      ctx.restore();
    });
    speckle(ctx, w, h, random, 5000, ["rgba(0,0,0,0.5)"], 1, 4);
  });
}

// Alpha for the stencilled bay numbers, 4 x 4 to a sheet.
function bayNumberAlpha(count, random) {
  return dataTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 7;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 70px Helvetica, Arial, sans-serif";
    for (let n = 1; n <= count; n++) {
      const x = ((n - 1) % 4) * 128 + 64;
      const y = Math.floor((n - 1) / 4) * 128 + 64;
      ctx.beginPath();
      ctx.arc(x, y, 52, 0, TAU);
      ctx.stroke();
      ctx.fillText(String(n), x, y + 5);
    }
    speckle(ctx, w, h, random, 2500, ["rgba(0,0,0,0.5)"], 1, 4);
  });
}

// Poured concrete. One tile is two bays wide and the full depth of the deck,
// with expansion joints on the bay lines and one across.
function concreteTextures(random, crossJoint) {
  const joints = (ctx, w, h, half, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, half, h);
    ctx.fillRect(w - half, 0, half, h);
    ctx.fillRect(w / 2 - half, 0, half * 2, h);
    ctx.fillRect(0, h * crossJoint - half, w, half * 2);
  };
  const map = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#a6a8a1";
    ctx.fillRect(0, 0, w, h);
    // Each pour cured to a slightly different grey.
    for (const [x, y, sw, sh] of [
      [0, 0, w / 2, h * crossJoint],
      [w / 2, 0, w / 2, h * crossJoint],
      [0, h * crossJoint, w / 2, h],
      [w / 2, h * crossJoint, w / 2, h],
    ]) {
      ctx.fillStyle = `rgba(${random() > 0.5 ? "0,0,0" : "255,255,255"},${(random() * 0.07).toFixed(3)})`;
      ctx.fillRect(x, y, sw, sh);
    }
    speckle(ctx, w, h, random, 60000, [
      "#999b94",
      "#b0b2ab",
      "#a0a29b",
      "#b8bab3",
      "#8f918a",
    ]);
    for (let i = 0; i < 28; i++) {
      const x = random() * w;
      const y = random() * h;
      const r = 50 + random() * 170;
      const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = random() > 0.35 ? "58,54,44" : "222,222,212";
      stain.addColorStop(
        0,
        `rgba(${tone},${(0.05 + random() * 0.09).toFixed(3)})`,
      );
      stain.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = stain;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = "rgba(48,48,42,0.4)";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      let x = random() * w;
      let y = random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 9; step++) {
        x += (random() - 0.5) * 70;
        y += (random() - 0.2) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    joints(ctx, w, h, 5, "rgba(255,255,255,0.1)");
    joints(ctx, w, h, 3, "#5c5e58");
  });
  const bump = dataTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, random, 22000, [
      "#777777",
      "#898989",
      "#7c7c7c",
      "#858585",
    ]);
    joints(ctx, w, h, 2, "#2c2c2c");
  });
  return { map, bump };
}

// Dense artificial turf for the hitting mats.
function matTextures(random) {
  const map = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#2d7a39";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, random, 11000, [
      "#256b31",
      "#38904a",
      "#2a7436",
      "#43a055",
      "#1f5c2a",
    ]);
  });
  const bump = dataTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, random, 11000, [
      "#585858",
      "#a8a8a8",
      "#707070",
      "#c2c2c2",
    ]);
  });
  return { map, bump };
}

// A light greyscale grain with diagonal mowing bands; multiplies the vertex
// colours of the greens.
function greenGrain(random) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#f6f6f6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e4e4e4";
    ctx.beginPath();
    for (const offset of [-w, 0, w]) {
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + w / 2, 0);
      ctx.lineTo(offset + w / 2 + w, h);
      ctx.lineTo(offset + w, h);
      ctx.closePath();
    }
    ctx.fill();
    speckle(ctx, w, h, random, 7000, ["#ffffff", "#dcdcdc", "#ececec"]);
  });
}

// Alpha for netting: a regular grid, so every mip level averages to the same
// even haze and the net cannot shimmer at distance.
function netAlpha() {
  return dataTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    for (const at of [0, w / 2]) {
      ctx.fillRect(at, 0, 3, h);
      ctx.fillRect(0, at, w, 3);
    }
  });
}

// Alpha for the painted-on shadows: soft on every edge, fading toward the tip.
function shadowAlpha() {
  return dataTexture(64, 128, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const smooth = (t) => {
      const c = Math.min(1, Math.max(0, t));
      return c * c * (3 - 2 * c);
    };
    for (let y = 0; y < h; y++) {
      // Canvas row 0 is the top of the texture, v = 1, the shadow's tip.
      const v = 1 - (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const across = smooth(Math.min(u, 1 - u) / 0.32);
        const along = smooth(Math.min(v / 0.07, (1 - v) / 0.3));
        const level = Math.round(255 * across * along * (1 - 0.3 * v));
        const i = (y * w + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = level;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

// A range ball's band, wrapped around the equator.
function ballStripe() {
  return canvasTexture(64, 32, (ctx, w, h) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b3202c";
    ctx.fillRect(0, h / 2 - 3, w, 6);
    ctx.fillStyle = "#1d1d1d";
    ctx.fillRect(0, h / 2 - 5, w, 1.5);
    ctx.fillRect(0, h / 2 + 3.5, w, 1.5);
  });
}

// --- yardage markers, lines, greens and flags --------------------------------

function buildSign(context, yards, index, x, z, heading, scale) {
  const { hardware, boards, shadows } = context;
  const base = place(x, 0, z, heading);
  const put = (batch, geometry, local, color) =>
    batch.add(geometry, base.clone().multiply(local), color);

  const width = 9 * scale;
  const height = 5.6 * scale;
  const depth = 0.16 * scale;
  const trim = 0.2 * scale;
  const centre = SIGN_CLEARANCE + height / 2;

  put(
    hardware,
    roundedBox(width + 0.12 * scale, height + 0.12 * scale, depth, depth * 0.4),
    place(0, centre, 0),
    0x12301f,
  );

  // The printed face, mapped to this yardage's cell of the sheet.
  const [cw, ch] = SIGN_CELL;
  const rows = Math.ceil(context.yardages.length / SIGN_COLUMNS);
  const u0 = ((index % SIGN_COLUMNS) * cw + 3) / (cw * SIGN_COLUMNS);
  const u1 = ((index % SIGN_COLUMNS) * cw + cw - 3) / (cw * SIGN_COLUMNS);
  const row = Math.floor(index / SIGN_COLUMNS);
  const v1 = 1 - (row * ch + 3) / (ch * rows);
  const v0 = 1 - (row * ch + ch - 3) / (ch * rows);
  const face = new THREE.PlaneGeometry(width, height);
  const uv = face.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  put(boards, face, place(0, centre, depth / 2 + 0.01 * scale));

  // A raised cream frame around the face.
  const frameZ = depth / 2 + 0.025 * scale;
  const frameDepth = 0.07 * scale;
  for (const side of [-1, 1]) {
    put(
      hardware,
      box(width + 0.12 * scale, trim, frameDepth),
      place(0, centre + side * (height / 2 - trim / 2 + 0.03 * scale), frameZ),
      0xece5cf,
    );
    put(
      hardware,
      box(trim, height - trim * 2 + 0.06 * scale, frameDepth),
      place(side * (width / 2 - trim / 2 + 0.03 * scale), centre, frameZ),
      0xece5cf,
    );
  }

  // Timber posts behind the board, capped, in concrete footings.
  const post = 0.3 * Math.sqrt(scale);
  const postHeight = SIGN_CLEARANCE + height + 0.3 * scale;
  const postZ = -depth / 2 - post / 2;
  for (const side of [-1, 1]) {
    const postX = side * (width / 2 - 0.9 * scale);
    put(
      hardware,
      box(post, postHeight, post),
      place(postX, postHeight / 2, postZ),
      0x7a5a3c,
    );
    put(
      hardware,
      new THREE.ConeGeometry(post * 0.78, post * 0.55, 4),
      place(postX, postHeight + post * 0.27, postZ, Math.PI / 4),
      0x5a412b,
    );
    put(
      hardware,
      cylinder(post * 0.95, post * 1.15, 0.12, 10),
      place(postX, 0.06, postZ),
      0xa9aaa3,
    );
    poleShadow(
      shadows,
      x + postX * Math.cos(heading),
      z - postX * Math.sin(heading),
      post * 0.5,
      SIGN_CLEARANCE,
    );
  }
  castShadow(
    shadows,
    x,
    z,
    (Math.cos(heading) * width) / 2,
    (-Math.sin(heading) * width) / 2,
    SIGN_CLEARANCE,
    SIGN_CLEARANCE + height,
  );
}

// A target green as one flat mesh: bunker, collar, putting surface, a ring of
// target paint and the cup, drawn in that order.
function greenGeometry(random, side) {
  const flat = createFlat();
  const p = [0, 1, 2, 3].map(() => random() * TAU);
  const outline = (a) =>
    GREEN_RADIUS *
    (1 +
      0.09 * Math.sin(2 * a + p[0]) +
      0.06 * Math.sin(3 * a + p[1]) +
      0.03 * Math.sin(5 * a + p[2]));

  if (GREENSIDE_BUNKERS) {
    // Short of the green, on the side away from the centre line.
    const reach = GREEN_RADIUS + 3.2;
    const bx = side * 0.8 * reach;
    const bz = -0.6 * reach;
    const sand = (a) =>
      3.1 * (1 + 0.28 * Math.sin(2 * a + p[3]) + 0.1 * Math.sin(3 * a + p[0]));
    flat.fan(bx, bz, (a) => sand(a) + 0.45, 36, 0x3c7a30);
    flat.fan(bx, bz, sand, 36, 0xeadfb8, 0xd6c794);
  }
  flat.fan(0, 0, (a) => outline(a) + 1.4, 56, 0x4a973a, 0x418a35);
  flat.fan(0, 0, outline, 56, 0x93d36e, 0x7fc35c);
  flat.ring(
    0,
    0,
    (a) => outline(a) * 0.5 - 0.13,
    (a) => outline(a) * 0.5 + 0.13,
    56,
    0xf3f3ea,
  );
  flat.fan(0, 0, () => 0.24, 16, 0xf0f0e8);
  flat.fan(0, 0, () => 0.17, 16, 0x15170f);
  return flat.build();
}

// All the flags as one mesh whose vertices are moved every frame.
function buildFlags(specs) {
  const NX = 12;
  const NY = 6;
  const perFlag = (NX + 1) * (NY + 1);
  const positions = new Float32Array(specs.length * perFlag * 3);
  const colors = new Float32Array(specs.length * perFlag * 3);
  const indices = [];
  const tint = new THREE.Color();
  specs.forEach((flag, f) => {
    tint.set(flag.color);
    for (let i = 0; i < perFlag; i++)
      tint.toArray(colors, (f * perFlag + i) * 3);
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = f * perFlag + j * (NX + 1) + i;
        const b = a + 1;
        const c = a + NX + 1;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.85,
    }),
  );
  mesh.name = "flags";
  // The vertices move, so a bounding sphere would go stale.
  mesh.frustumCulled = false;

  const update = (time) => {
    let o = 0;
    for (const flag of specs) {
      const gust = 0.72 + 0.28 * Math.sin(time * 0.7 + flag.phase * 1.3);
      for (let j = 0; j <= NY; j++) {
        const v = j / NY;
        for (let i = 0; i <= NX; i++) {
          const u = i / NX;
          // Waves travel from the pole to the free edge, growing as they go.
          const ripple =
            Math.sin(u * 6.5 - time * 5.4 + flag.phase + v * 0.9) * 0.2 +
            Math.sin(u * 13 - time * 9.1 + flag.phase * 2.1 - v * 1.7) * 0.06;
          const sway = ripple * gust * u * (1.5 - 0.5 * u) * flag.scale;
          positions[o] = flag.x - flag.pole - flag.width * u * (1 - 0.04 * u);
          positions[o + 1] =
            flag.top -
            flag.height * (1 - v) -
            flag.height * 0.1 * u * u +
            sway * 0.2;
          positions[o + 2] = flag.z + sway;
          o += 3;
        }
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  update(0);
  return { mesh, update };
}

function buildMarkers({ random, anisotropy, paint, shadows }) {
  const group = new THREE.Group();
  group.name = "markers";

  const yardages = [];
  for (let y = MARKER_INTERVAL; y <= LAST_MARKER; y += MARKER_INTERVAL) {
    yardages.push(y);
  }
  const hardware = createBatch();
  const boards = createBatch();
  const numerals = createFlat();
  const flags = [];
  const context = { hardware, boards, shadows, yardages };

  const lineGeometry = createFlat()
    .quad(
      [
        [-FAIRWAY_HALF_WIDTH, -0.38],
        [FAIRWAY_HALF_WIDTH, -0.38],
        [FAIRWAY_HALF_WIDTH, 0.38],
        [-FAIRWAY_HALF_WIDTH, 0.38],
      ],
      0xffffff,
      [
        [0, 0],
        [4, 0],
        [4, 1],
        [0, 1],
      ],
    )
    .build();
  const paintMaterial = (alphaMap) =>
    new THREE.MeshStandardMaterial({
      color: 0xf1f1e8,
      roughness: 1,
      alphaMap,
      transparent: true,
      opacity: 0.86,
    });
  const lineMaterial = paintMaterial(
    repeating(paintLineAlpha(random), anisotropy),
  );
  const greenMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: repeating(greenGrain(random), anisotropy),
    roughness: 1,
  });

  yardages.forEach((yards, index) => {
    const marker = new THREE.Group();
    marker.name = `marker-${yards}`;
    marker.position.z = yards;

    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.name = "yard-line";
    line.position.y = 0.03;
    line.receiveShadow = true;
    groundOverlay(line, 3);
    marker.add(line);

    const [signX, signScale] = SIGN_LAYOUT[yards] || [
      FAIRWAY_HALF_WIDTH + 6,
      1 + (yards - 150) / 400,
    ];
    for (const side of [-1, 1]) {
      // Boards face back toward the tee and angle slightly inward.
      buildSign(
        context,
        yards,
        index,
        side * signX,
        yards,
        Math.PI + side * 0.25,
        signScale,
      );
    }

    // A target flag near the centre line, alternating sides so they don't
    // stack.
    const side = (yards / MARKER_INTERVAL) % 2 === 0 ? 1 : -1;
    const flagX = side * GREEN_OFFSET;
    const green = new THREE.Mesh(greenGeometry(random, side), greenMaterial);
    green.name = "green";
    green.position.set(flagX, 0.02, 0);
    green.receiveShadow = true;
    groundOverlay(green, 2);
    marker.add(green);

    // Poles and flags grow a little with distance so they still read.
    const far = Math.max(0, yards - 150);
    const poleHeight = POLE_HEIGHT + far / 100;
    const poleRadius = 0.06 + yards * 0.0002;
    const flagScale = 1 + far / 300;
    hardware.add(
      cylinder(poleRadius, poleRadius, poleHeight, 8),
      place(flagX, poleHeight / 2, yards),
      0xf4f4ee,
    );
    hardware.add(
      cylinder(poleRadius * 1.7, poleRadius * 1.7, 0.3, 8),
      place(flagX, 0.15, yards),
      0x2b2f33,
    );
    hardware.add(
      new THREE.SphereGeometry(poleRadius * 1.8, 8, 6),
      place(flagX, poleHeight + poleRadius, yards),
      0xd8b24a,
    );
    poleShadow(shadows, flagX, yards, poleRadius * 1.3, poleHeight);
    castShadow(
      shadows,
      flagX - 1.1 * flagScale,
      yards,
      -SHADOW_DIR[1] * 0.45 * flagScale,
      SHADOW_DIR[0] * 0.45 * flagScale,
      poleHeight - 1.3 * flagScale,
      poleHeight,
    );
    flags.push({
      x: flagX,
      z: yards,
      top: poleHeight - 0.05,
      pole: poleRadius,
      width: 2.2 * flagScale,
      height: 1.3 * flagScale,
      scale: flagScale,
      color: FLAG_COLORS[index % FLAG_COLORS.length],
      phase: random() * TAU,
    });

    if (TURF_NUMERALS) {
      // Read from behind, looking downrange: the top of the text is the far
      // end and its left edge is at +x.
      const u0 = index / yardages.length;
      const u1 = (index + 1) / yardages.length;
      numerals.quad(
        [
          [3.5, yards - 15],
          [-3.5, yards - 15],
          [-3.5, yards - 4],
          [3.5, yards - 4],
        ],
        0xffffff,
        [
          [u0, 0],
          [u1, 0],
          [u1, 1],
          [u0, 1],
        ],
      );
    }

    group.add(marker);
  });

  const posts = hardware.build(paint);
  posts.name = "marker-hardware";
  const atlas = signAtlas(yardages, random);
  atlas.anisotropy = anisotropy;
  const faces = boards.build(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: atlas,
      emissive: 0xffffff,
      emissiveMap: atlas,
      emissiveIntensity: SIGN_EMISSIVE,
      roughness: 0.55,
    }),
  );
  faces.name = "marker-boards";
  group.add(posts, faces);

  if (TURF_NUMERALS) {
    const alpha = turfNumeralAlpha(yardages, random);
    alpha.anisotropy = anisotropy;
    const painted = new THREE.Mesh(numerals.build(), paintMaterial(alpha));
    painted.name = "turf-numerals";
    painted.position.y = 0.03;
    groundOverlay(painted, 3);
    group.add(painted);
  }

  const cloth = buildFlags(flags);
  group.add(cloth.mesh);
  return { group, update: cloth.update };
}

// --- the tee line -------------------------------------------------------------

// A stand bag leaning back on its legs, with a few clubs in it.
function addGolfBag(batch, base, color, accent, random) {
  const lean = 0.3;
  const bag = base.clone().multiply(place(0, 0, 0.1, 0, -lean));
  batch.add(
    cylinder(0.13, 0.115, 0.92, 12),
    bag.clone().multiply(place(0, 0.46, 0)),
    color,
  );
  batch.add(
    cylinder(0.14, 0.14, 0.07, 12),
    bag.clone().multiply(place(0, 0.9, 0)),
    accent,
  );
  batch.add(
    cylinder(0.12, 0.125, 0.05, 12),
    bag.clone().multiply(place(0, 0.025, 0)),
    0x1b1c1e,
  );
  batch.add(
    roundedBox(0.16, 0.4, 0.09, 0.03),
    bag.clone().multiply(place(0, 0.4, 0.14)),
    accent,
  );
  batch.add(
    roundedBox(0.13, 0.2, 0.07, 0.025),
    bag.clone().multiply(place(0, 0.72, 0.13)),
    color,
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU + random();
    const cx = Math.cos(angle) * 0.07;
    const cz = Math.sin(angle) * 0.07;
    const top = 1.08 + random() * 0.12;
    tube(
      batch,
      bag,
      vec(cx, 0.85, cz),
      vec(cx * 1.6, top, cz * 1.6),
      0.008,
      0xb9bec6,
      5,
    );
    batch.add(
      box(0.05, 0.04, 0.1),
      bag.clone().multiply(place(cx * 1.6, top + 0.015, cz * 1.6, angle)),
      i % 2 ? 0x2a2c30 : 0xc4c8cf,
    );
  }
  for (const side of [-1, 1]) {
    tube(
      batch,
      base,
      vec(side * 0.05, 0.72, -0.1),
      vec(side * 0.24, 0, -0.56),
      0.011,
      0x9aa0a6,
      5,
    );
  }
}

function addBench(batch, base) {
  const put = (geometry, local, color) =>
    batch.add(geometry, base.clone().multiply(local), color);
  for (const side of [-1, 1]) {
    put(box(0.06, 0.44, 0.44), place(side * 0.75, 0.22, 0), 0x2a2e33);
    put(
      box(0.05, 0.5, 0.05),
      place(side * 0.75, 0.68, -0.25, 0, -0.12),
      0x2a2e33,
    );
  }
  for (const z of [-0.15, 0, 0.15]) {
    put(roundedBox(1.8, 0.04, 0.13, 0.012), place(0, 0.46, z), 0x8a6642);
  }
  for (const y of [0.7, 0.85]) {
    put(
      roundedBox(1.8, 0.11, 0.035, 0.012),
      place(0, y, -0.27, 0, -0.12),
      0x8a6642,
    );
  }
}

function buildTeeLine({ random, anisotropy, paint }) {
  const group = new THREE.Group();
  group.name = "tee-line";
  const batch = createBatch();
  const put = (geometry, local, color) => batch.add(geometry, local, color);

  // The poured deck.
  const depth = DECK.zMax - DECK.zMin;
  const tileWidth = BAY_SPACING * 2;
  const crossJointZ = -3.3;
  const u = (x) => (x - BAY_SPACING / 2) / tileWidth;
  const concrete = concreteTextures(
    random,
    1 - (crossJointZ - DECK.zMin) / depth,
  );
  const deck = new THREE.Mesh(
    createFlat()
      .quad(
        [
          [-DECK.halfWidth, DECK.zMin],
          [DECK.halfWidth, DECK.zMin],
          [DECK.halfWidth, DECK.zMax],
          [-DECK.halfWidth, DECK.zMax],
        ],
        0xffffff,
        [
          [u(-DECK.halfWidth), 0],
          [u(DECK.halfWidth), 0],
          [u(DECK.halfWidth), 1],
          [u(-DECK.halfWidth), 1],
        ],
      )
      .build(),
    new THREE.MeshStandardMaterial({
      map: repeating(concrete.map, anisotropy),
      bumpMap: repeating(concrete.bump, anisotropy),
      bumpScale: 0.6,
      roughness: 0.93,
    }),
  );
  deck.name = "deck";
  deck.position.y = DECK.y;
  deck.receiveShadow = true;
  groundOverlay(deck, 2);
  group.add(deck);

  // A kerb around the deck, a little taller along the back.
  const deckWidth = DECK.halfWidth * 2;
  const middleZ = (DECK.zMin + DECK.zMax) / 2;
  put(
    box(deckWidth + 0.3, 0.045, 0.15),
    place(0, 0.0225, DECK.zMax + 0.075),
    0xb9bab3,
  );
  put(
    box(deckWidth + 0.3, 0.11, 0.2),
    place(0, 0.055, DECK.zMin - 0.1),
    0xb4b5ae,
  );
  for (const side of [-1, 1]) {
    put(
      box(0.15, 0.045, depth),
      place(side * (DECK.halfWidth + 0.075), 0.0225, middleZ),
      0xb9bab3,
    );
  }

  const turf = matTextures(random);
  const matMaterial = new THREE.MeshStandardMaterial({
    map: repeating(turf.map, anisotropy, 5),
    bumpMap: repeating(turf.bump, anisotropy, 5),
    bumpScale: 1,
    roughness: 1,
  });
  const otherMats = [];
  const balls = [];
  const numbers = createFlat();
  const bayCount = BAYS_EACH_SIDE * 2 + 1;

  for (let bay = -BAYS_EACH_SIDE; bay <= BAYS_EACH_SIDE; bay++) {
    const x = bay * BAY_SPACING;

    // The mat: a rubber base with a bevelled edge, turf set into it, and a
    // rubber strip that holds the tee.
    put(
      roundedBox(2.6, 0.036, 2.4, 0.015),
      place(x, DECK.y + 0.018, 0),
      0x1b1c1e,
    );
    put(box(0.12, 0.004, 0.42), place(x, MAT_TOP + 0.001, 0), 0x121314);
    const turfTop = box(2.36, 0.02, 2.16);
    if (bay === 0) {
      const mat = new THREE.Mesh(turfTop, matMaterial);
      mat.position.set(0, MAT_TOP - 0.01, 0);
      mat.receiveShadow = true;
      mat.name = "player-mat";
      group.add(mat);
    } else {
      turfTop.translate(x, MAT_TOP - 0.01, 0);
      otherMats.push(turfTop);
    }

    // A low powder-coated rail between this bay and the next.
    const railX = x + BAY_SPACING / 2;
    const rail = 0x1d3b2a;
    for (const z of [-2.9, 0.1]) {
      put(
        cylinder(0.035, 0.035, 0.55, 8),
        place(railX, DECK.y + 0.275, z),
        rail,
      );
      put(
        new THREE.SphereGeometry(0.036, 8, 6),
        place(railX, DECK.y + 0.55, z),
        rail,
      );
      put(box(0.16, 0.012, 0.16), place(railX, DECK.y + 0.006, z), 0x15291d);
    }
    for (const y of [0.55, 0.28]) {
      const radius = y > 0.5 ? 0.035 : 0.022;
      tube(
        batch,
        null,
        vec(railX, DECK.y + y, -2.9),
        vec(railX, DECK.y + y, 0.1),
        radius,
        rail,
        8,
      );
    }

    // A tray of range balls beside each mat: a full pyramid where the bay is
    // fresh, a scatter where someone has been hitting.
    const trayX = x - 1.55;
    const trayZ = -0.95;
    const floor = DECK.y + 0.02;
    put(box(0.46, 0.02, 0.46), place(trayX, DECK.y + 0.01, trayZ), 0x23262b);
    for (const side of [-1, 1]) {
      put(
        box(0.46, 0.05, 0.03),
        place(trayX, DECK.y + 0.025, trayZ + side * 0.215),
        0x2d3137,
      );
      put(
        box(0.03, 0.05, 0.4),
        place(trayX + side * 0.215, DECK.y + 0.025, trayZ),
        0x2d3137,
      );
    }
    const step = BALL_RADIUS * 2;
    if (Math.abs(bay) <= 1 || random() > 0.55) {
      for (let level = 0; level < 4; level++) {
        const n = 4 - level;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            balls.push([
              trayX + (i - (n - 1) / 2) * step,
              floor + BALL_RADIUS + level * BALL_RADIUS * Math.SQRT2,
              trayZ + (j - (n - 1) / 2) * step,
            ]);
          }
        }
      }
    } else {
      const slots = [];
      for (let i = 0; i < 49; i++) slots.push(i);
      const count = 6 + Math.floor(random() * 11);
      for (let k = 0; k < count; k++) {
        const [slot] = slots.splice(Math.floor(random() * slots.length), 1);
        balls.push([
          trayX + ((slot % 7) - 3) * step * 1.08,
          floor + BALL_RADIUS,
          trayZ + (Math.floor(slot / 7) - 3) * step * 1.08,
        ]);
      }
      // And a couple that never left the mat.
      for (let k = 0; k < 2; k++) {
        balls.push([
          x + (random() - 0.5) * 1.8,
          MAT_TOP + BALL_RADIUS,
          0.2 + random() * 0.7,
        ]);
      }
    }

    // The bay number, stencilled on the deck in front of the mat. Bay 1 is
    // the leftmost as you face downrange.
    const number = BAYS_EACH_SIDE + 1 - bay;
    const nu = ((number - 1) % 4) / 4;
    const nv = 1 - Math.floor((number - 1) / 4) / 4;
    numbers.quad(
      [
        [x + 0.4, 1.42],
        [x - 0.4, 1.42],
        [x - 0.4, 2.22],
        [x + 0.4, 2.22],
      ],
      0xffffff,
      [
        [nu, nv - 0.25],
        [nu + 0.25, nv - 0.25],
        [nu + 0.25, nv],
        [nu, nv],
      ],
    );
  }
  // Close the open end of the row.
  const endX = -(BAYS_EACH_SIDE + 0.5) * BAY_SPACING;
  for (const z of [-2.9, 0.1]) {
    put(
      cylinder(0.035, 0.035, 0.55, 8),
      place(endX, DECK.y + 0.275, z),
      0x1d3b2a,
    );
  }
  tube(
    batch,
    null,
    vec(endX, DECK.y + 0.55, -2.9),
    vec(endX, DECK.y + 0.55, 0.1),
    0.035,
    0x1d3b2a,
    8,
  );
  tube(
    batch,
    null,
    vec(endX, DECK.y + 0.28, -2.9),
    vec(endX, DECK.y + 0.28, 0.1),
    0.022,
    0x1d3b2a,
    8,
  );

  const mats = new THREE.Mesh(mergeGeometries(otherMats), matMaterial);
  mats.name = "mat";
  mats.receiveShadow = true;
  group.add(mats);

  const bayNumbers = bayNumberAlpha(bayCount, random);
  bayNumbers.anisotropy = anisotropy;
  const stencils = new THREE.Mesh(
    numbers.build(),
    new THREE.MeshStandardMaterial({
      color: 0xf1f1e8,
      roughness: 1,
      alphaMap: bayNumbers,
      transparent: true,
      opacity: 0.8,
    }),
  );
  stencils.name = "bay-numbers";
  stencils.position.y = DECK.y + 0.004;
  stencils.receiveShadow = true;
  groundOverlay(stencils, 3);
  group.add(stencils);

  // Bags in a few neighbouring bays, on the side away from the player.
  const bagColors = [
    [0x1f2a44, 0xd9d9d2],
    [0xa3222b, 0x1b1c1e],
    [0x1b1c1e, 0xf2c230],
    [0xe8e8e2, 0x2a6fdb],
  ];
  BAG_BAYS.forEach((bay, i) => {
    const [color, accent] = bagColors[i % bagColors.length];
    addGolfBag(
      batch,
      place(
        bay * BAY_SPACING + Math.sign(bay) * 1.72,
        DECK.y,
        0.15,
        random() * 0.8 - 0.4,
      ),
      color,
      accent,
      random,
    );
  });

  // Planters with clipped hedges at each end of the row.
  for (const side of [-1, 1]) {
    const x = side * (DECK.halfWidth - 0.9);
    put(roundedBox(1, 0.5, 3.4, 0.03), place(x, DECK.y + 0.25, -1.4), 0x6f5137);
    put(box(0.86, 0.02, 3.26), place(x, DECK.y + 0.505, -1.4), 0x3a2b1e);
    put(
      roundedBox(0.84, 0.5, 3.2, 0.2),
      place(x, DECK.y + 0.74, -1.4),
      0x2f5d2c,
    );
  }

  // Behind the bays: benches, a club-washing bucket, a rope line, bins and
  // the ball dispenser. All low, and none of it near the camera.
  for (const side of [-1, 1]) {
    addBench(batch, place(side * 10.5, DECK.y, -5.7));
    put(cylinder(0.3, 0.26, 0.85, 14), place(side * 14, 0.425, -8.5), 0x23402f);
    put(cylinder(0.32, 0.32, 0.06, 14), place(side * 14, 0.88, -8.5), 0x17191b);
  }
  put(
    cylinder(0.17, 0.14, 0.34, 14),
    place(-6.2, DECK.y + 0.17, -5.3),
    0x2b5ea8,
  );
  put(
    cylinder(0.15, 0.15, 0.004, 14),
    place(-6.2, DECK.y + 0.342, -5.3),
    0x2a3f4a,
  );
  put(box(0.05, 0.12, 0.2), place(-6.05, DECK.y + 0.38, -5.3), 0xf2c230);

  const ropeZ = DECK.zMin - 0.8;
  const posts = bayCount + 1;
  for (let k = 0; k < posts; k++) {
    const x = (k - bayCount / 2) * BAY_SPACING;
    put(cylinder(0.045, 0.045, 0.8, 8), place(x, 0.4, ropeZ), 0xeeeeea);
    put(new THREE.SphereGeometry(0.07, 8, 6), place(x, 0.83, ropeZ), 0x1d3b2a);
    // Walk-throughs behind the player's bay and toward each end.
    if (
      k === posts - 1 ||
      k === 1 ||
      k === BAYS_EACH_SIDE ||
      k === bayCount - 2
    ) {
      continue;
    }
    const sag = (t) => 0.72 - 0.56 * t * (1 - t);
    for (let s = 0; s < 5; s++) {
      const t0 = s / 5;
      const t1 = (s + 1) / 5;
      tube(
        batch,
        null,
        vec(x + t0 * BAY_SPACING, sag(t0), ropeZ),
        vec(x + t1 * BAY_SPACING, sag(t1), ropeZ),
        0.014,
        0xc9b384,
        5,
      );
    }
  }

  const dispenser = place(-18.5, 0, -9.3);
  const machine = (geometry, local, color) =>
    batch.add(geometry, dispenser.clone().multiply(local), color);
  machine(box(2.8, 0.06, 1.7), place(0.3, 0.03, 0), 0xb4b5ae);
  machine(roundedBox(1.2, 1.7, 0.9, 0.06), place(0, 0.91, 0), 0x1f5a3a);
  machine(roundedBox(0.9, 0.5, 0.03, 0.012), place(0, 1.25, 0.46), 0xece5cf);
  machine(roundedBox(0.36, 0.26, 0.26, 0.03), place(0, 0.6, 0.5), 0x17191b);
  machine(roundedBox(1.3, 0.28, 0.1, 0.03), place(0, 1.9, 0.3), 0xf2c230);
  for (let i = 0; i < 4; i++) {
    machine(
      cylinder(0.2, 0.15, 0.22, 10),
      place(1.05, 0.17 + i * 0.09, 0.15),
      i % 2 ? 0x8d949a : 0x70777d,
    );
  }

  const hardware = batch.build(paint);
  hardware.name = "tee-furniture";
  hardware.castShadow = true;
  hardware.receiveShadow = true;
  group.add(hardware);

  // Range balls: some plain, some yellow, all with the range's band.
  const trayBalls = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(BALL_RADIUS, 1),
    new THREE.MeshStandardMaterial({ map: ballStripe(), roughness: 0.38 }),
    balls.length,
  );
  trayBalls.name = "tray-balls";
  const matrix = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  balls.forEach(([x, y, z], i) => {
    euler.set(random() * TAU, random() * TAU, random() * TAU);
    matrix.compose(vec(x, y, z), spin.setFromEuler(euler), ONE);
    trayBalls.setMatrixAt(i, matrix);
    trayBalls.setColorAt(i, color.set(random() < 0.35 ? 0xf4d532 : 0xfbfbf6));
  });
  trayBalls.castShadow = true;
  trayBalls.receiveShadow = true;
  group.add(trayBalls);

  return group;
}

// --- furniture downrange --------------------------------------------------------

// Scales a plane's UVs so the net texture keeps its real-world mesh size.
function netPanel(width, height, tile) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * width) / tile, (uv.getY(i) * height) / tile);
  }
  return geometry;
}

// A colour-coded catch net with a bullseye, leaning back and facing the tee.
function addTargetNet(batch, net, shadows, { x, z, color }) {
  const scale = 0.75 + z / 450;
  const heading = Math.atan2(-x, -z);
  const base = place(x, 0, z, heading);
  const lean = 0.22;
  const frame = base.clone().multiply(place(0, 0.3, 0, 0, -lean));
  const width = 6 * scale;
  const height = 5 * scale;
  const bar = 0.09 * scale;
  const skirt = 0.4 * scale;

  for (const side of [-1, 1]) {
    const px = (side * width) / 2;
    tube(batch, frame, vec(px, -0.32, 0), vec(px, height, 0), bar, color, 8);
    batch.add(
      new THREE.SphereGeometry(bar * 1.2, 8, 6),
      frame.clone().multiply(place(px, height, 0)),
      color,
    );
    // A stay running back to the ground.
    const topY = 0.3 + 0.85 * height * Math.cos(lean);
    const topZ = -0.85 * height * Math.sin(lean);
    tube(
      batch,
      base,
      vec(px, topY, topZ),
      vec(px, 0, topZ - height * 0.5),
      bar * 0.7,
      0x2a2e33,
      6,
    );
    poleShadow(
      shadows,
      x + px * Math.cos(heading),
      z - px * Math.sin(heading),
      bar * 1.5,
      height,
    );
  }
  tube(
    batch,
    frame,
    vec(-width / 2, height, 0),
    vec(width / 2, height, 0),
    bar,
    color,
    8,
  );
  tube(
    batch,
    frame,
    vec(-width / 2, skirt, 0),
    vec(width / 2, skirt, 0),
    bar * 0.7,
    color,
    8,
  );
  net.add(
    netPanel(width, height - skirt, NET_TILE * 0.8),
    frame.clone().multiply(place(0, (height + skirt) / 2, 0)),
    0xe6e9e2,
  );

  // The bullseye, front and back.
  const centreY = height * 0.56;
  const rings = [
    [0, 0.8, color],
    [0.8, 1.5, 0xf4f4ee],
    [1.5, 2.2, color],
  ];
  for (const turn of [0, Math.PI]) {
    const face = frame
      .clone()
      .multiply(place(0, centreY, turn ? -0.04 : 0.04, turn));
    for (const [inner, outer, hex] of rings) {
      batch.add(
        inner === 0
          ? new THREE.CircleGeometry(outer * scale, 28)
          : new THREE.RingGeometry(inner * scale, outer * scale, 28),
        face,
        hex,
      );
    }
  }
  castShadow(
    shadows,
    x,
    z,
    Math.cos(heading) * 2 * scale,
    -Math.sin(heading) * 2 * scale,
    0.3 + centreY - 2.2 * scale,
    0.3 + centreY + 2.2 * scale,
  );
}

// The ball picker: a caged cart pushing a gang of collector discs.
function addPickerCart(batch, net, shadows, { x, z, heading }) {
  const base = place(x, 0, z, heading);
  const put = (geometry, local, color) =>
    batch.add(geometry, base.clone().multiply(local), color);
  const body = 0x2e6b3f;
  const dark = 0x1c1e21;

  for (const side of [-1, 1]) {
    for (const wz of [-0.85, 0.85]) {
      put(
        cylinder(0.34, 0.34, 0.26, 14),
        place(side * 0.72, 0.34, wz, 0, 0, Math.PI / 2),
        dark,
      );
      put(
        cylinder(0.16, 0.16, 0.28, 10),
        place(side * 0.72, 0.34, wz, 0, 0, Math.PI / 2),
        0xd9d9d0,
      );
    }
  }
  put(roundedBox(1.35, 0.42, 2.7, 0.08), place(0, 0.62, 0), body);
  put(roundedBox(1.25, 0.32, 0.8, 0.08), place(0, 0.96, 0.9), body);
  put(roundedBox(1.1, 0.16, 0.5, 0.05), place(0, 0.92, -0.3), dark);
  put(roundedBox(1.1, 0.5, 0.12, 0.04), place(0, 1.22, -0.6), dark);
  put(roundedBox(1.3, 0.55, 0.7, 0.05), place(0, 1.08, -1.02), 0x8d949a);

  // The driver's cage.
  const front = 1.3;
  const back = -0.66;
  const top = 2.25;
  for (const side of [-1, 1]) {
    for (const cz of [back, front]) {
      tube(
        batch,
        base,
        vec(side * 0.66, 0.8, cz),
        vec(side * 0.66, top, cz),
        0.035,
        dark,
        6,
      );
    }
    tube(
      batch,
      base,
      vec(side * 0.66, top, back),
      vec(side * 0.66, top, front),
      0.035,
      dark,
      6,
    );
    net.add(
      netPanel(front - back, top - 0.83, 0.16),
      base
        .clone()
        .multiply(
          place(side * 0.66, (top + 0.83) / 2, (front + back) / 2, Math.PI / 2),
        ),
      0x33393d,
    );
  }
  for (const cz of [back, front]) {
    tube(batch, base, vec(-0.66, top, cz), vec(0.66, top, cz), 0.035, dark, 6);
  }
  net.add(
    netPanel(1.32, top - 1.12, 0.16),
    base.clone().multiply(place(0, (top + 1.12) / 2, front)),
    0x33393d,
  );
  put(
    roundedBox(1.42, 0.05, front - back + 0.1, 0.02),
    place(0, top + 0.03, (front + back) / 2),
    0xe9e9e2,
  );

  // The picker gang out in front.
  const gangZ = 2.7;
  tube(
    batch,
    base,
    vec(-2.45, 0.46, gangZ),
    vec(2.45, 0.46, gangZ),
    0.04,
    0xf2c230,
    6,
  );
  for (const side of [-1, 1]) {
    tube(
      batch,
      base,
      vec(side * 0.5, 0.62, 1.3),
      vec(side * 0.5, 0.46, gangZ),
      0.035,
      0xf2c230,
      6,
    );
    put(box(1.3, 0.3, 0.46), place(side * 1.3, 0.72, gangZ - 0.1), 0x70777d);
  }
  for (let i = 0; i < 11; i++) {
    put(
      cylinder(0.3, 0.3, 0.05, 14),
      place(-2.25 + i * 0.45, 0.3, gangZ + 0.12, 0, 0, Math.PI / 2),
      i % 2 ? 0xe0a81f : 0xf2c230,
    );
  }
  castShadow(shadows, x, z, -SHADOW_DIR[1] * 1.9, SHADOW_DIR[0] * 1.9, 0, 2.3);
}

function buildFurniture({ random, anisotropy, paint, shadows }) {
  const group = new THREE.Group();
  group.name = "range-furniture";
  const batch = createBatch();
  const net = createBatch();

  for (const target of TARGET_NETS) addTargetNet(batch, net, shadows, target);
  addPickerCart(batch, net, shadows, CART);

  if (BOUNDARY_NETTING) {
    const length = NET_Z[1] - NET_Z[0];
    const middle = (NET_Z[0] + NET_Z[1]) / 2;
    const steel = 0x4c5a55;
    for (const side of [-1, 1]) {
      const x = side * NET_X;
      for (let z = NET_Z[0]; z <= NET_Z[1]; z += NET_POLE_SPACING) {
        batch.add(
          cylinder(0.16, 0.24, NET_HEIGHT, 8),
          place(x, NET_HEIGHT / 2, z),
          steel,
        );
        batch.add(cylinder(0.34, 0.34, 0.2, 8), place(x, 0.1, z), 0xa9aaa3);
        // Only the sun-side poles throw their shadows into the range; the
        // others fall away into the trees, where the ground is not level.
        if (x * SHADOW_DIR[0] < 0) poleShadow(shadows, x, z, 0.26, NET_HEIGHT);
      }
      for (const y of [0.3, NET_HEIGHT - 0.1]) {
        tube(
          batch,
          null,
          vec(x, y, NET_Z[0]),
          vec(x, y, NET_Z[1]),
          0.03,
          0x2a332f,
          4,
        );
      }
      net.add(
        netPanel(length, NET_HEIGHT - 0.4, NET_TILE),
        place(x, (NET_HEIGHT + 0.2) / 2, middle, Math.PI / 2),
        0x2a332f,
      );
    }
  }

  const hardware = batch.build(paint);
  hardware.name = "range-hardware";
  group.add(hardware);

  const netting = net.build(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      alphaMap: repeating(netAlpha(), anisotropy),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1,
    }),
  );
  netting.name = "netting";
  // After every ground overlay, so the turf behind shows through the mesh.
  netting.renderOrder = 8;
  group.add(netting);

  // Range balls lying where they stopped, thickest where most shots finish.
  const geometry = new THREE.IcosahedronGeometry(SCATTERED_BALL_RADIUS, 0);
  const normal = geometry.attributes.position.clone();
  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(
      i,
      normal.getX(i) / SCATTERED_BALL_RADIUS,
      normal.getY(i) / SCATTERED_BALL_RADIUS,
      normal.getZ(i) / SCATTERED_BALL_RADIUS,
    );
  }
  geometry.setAttribute("normal", normal);
  const scattered = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    SCATTERED_BALLS,
  );
  scattered.name = "scattered-balls";
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < SCATTERED_BALLS; i++) {
    const pick = random();
    const z =
      pick < 0.06
        ? 5 + random() * 40
        : pick < 0.18
          ? 20 + random() * 340
          : 40 + (random() + random()) * 130;
    const x =
      (random() + random() + random() - 1.5) * (FAIRWAY_HALF_WIDTH / 1.4);
    matrix.makeTranslation(x, SCATTERED_BALL_RADIUS * 0.85, z);
    scattered.setMatrixAt(i, matrix);
    const tone = random();
    scattered.setColorAt(
      i,
      color.set(tone < 0.24 ? 0xe8cf3a : tone < 0.3 ? 0xc9c9c0 : 0xf2f2ec),
    );
  }
  group.add(scattered);

  return group;
}

// --- entry point ------------------------------------------------------------------

export function buildProps({
  random = seededRandom(20261115),
  anisotropy = 1,
} = {}) {
  const object = new THREE.Group();
  object.name = "props";

  // One lit, vertex-coloured material for every painted or coated surface.
  const paint = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.05,
  });
  const shadows = createFlat();
  const context = { random, anisotropy, paint, shadows };

  const markers = buildMarkers(context);
  object.add(markers.group, buildTeeLine(context), buildFurniture(context));

  const shadowMesh = new THREE.Mesh(
    shadows.build(),
    new THREE.MeshBasicMaterial({
      color: 0x07160b,
      alphaMap: shadowAlpha(),
      transparent: true,
      opacity: SHADOW_OPACITY,
    }),
  );
  shadowMesh.name = "prop-shadows";
  shadowMesh.position.y = 0.025;
  groundOverlay(shadowMesh, 2);
  object.add(shadowMesh);

  return {
    object,
    update(elapsedSeconds) {
      markers.update(elapsedSeconds);
    },
  };
}
